// [2026-11-17 02:25 PM khanhtd] NT-HT-003 — test rà soát phạm vi chi nhánh (biên bản docs/audits/REVIEW-2026-11-17-phan-quyen-chi-nhanh.md): chi nhánh từ bản ghi, phạm vi đọc, vai trò Nhân viên
/**
 * PHẠM VI CHI NHÁNH — mỗi ca khẳng định hành vi AN TOÀN mong muốn (ca 1–15 của biên bản rà soát 17/11, thêm ca 16–25 sau khi vá).
 * Công tắc bizcity.authz.branch_scope = on. Chi nhánh CN01, CN02. Module POS bật.
 *   - Thu ngân: vai trò chính Nhân viên (staff) + "Thu ngân" (Cho pos:sell) gán TẠI CN01.
 *   - Quản lý cửa hàng: Người xem + "Quản lý cửa hàng" (Cho pos:report, pos:sell) TẠI CN01.
 *   - Kế toán CN01: Người xem + Kế toán TẠI CN01.
 *   - Kế toán bị hạn chế: Kế toán; Hạn chế TẠI CN02 (Cấm lập / sửa / huỷ phiếu chi) — phiếu CN02 tự lập TRƯỚC khi bị hạn chế.
 *   - Kế toán điều chuyển: Kế toán + Kế toán TẠI CN01 (phạm vi CN01) — phiếu CN02 tự lập TRƯỚC khi bật giới hạn.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS_POS = existsSync(path.join(DIR, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];

let ctx: TestCtx;
let app: FastifyInstance;
let k = 0;
const tok: Record<string, string> = {};
const bid: Record<string, string> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = { status: number; body: any };
async function req(who: string | null, method: string, url: string, payload?: unknown, cn?: string): Promise<R> {
  const r = await app.inject({
    method: method as never, url, payload: payload as never,
    headers: { authorization: `Bearer ${who ? tok[who] : ctx.token}`, 'idempotency-key': `pvcn-${++k}-${Date.now()}`, ...(cn ? { 'x-chi-nhanh': cn } : {}) },
  });
  let body: unknown = r.body;
  try { body = r.json(); } catch { /* không phải JSON */ }
  return { status: r.statusCode, body };
}
const ok = (r: R) => { expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeLessThan(300); return r.body.data; };
const deny = (r: R) => expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(403);
const chi = (cn: string) => ({ docType: 'payment', branchCode: cn, docDate: '2026-10-20', description: `Phiếu chi ${cn}`, lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 1000, cashflowCode: '33' }] });
const TB = '/api/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31';

async function user(key: string, role: string) {
  const email = `${key}@pvcn.local`;
  const u = ok(await req(null, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pvcn@12345' }));
  tok[key] = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pvcn@12345' } })).json().data.token;
  return String(u.id);
}
async function role(code: string, kind: 'job' | 'restriction', rules: [string, 'allow' | 'deny'][], baseRole?: string) {
  const r = ok(await req(null, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Rà soát phạm vi' }));
  for (const [permission, effect] of rules) ok(await req(null, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect, reason: 'Rà soát phạm vi' }));
  return r.id;
}
const gan = async (u: string, body: Record<string, unknown>) => ok(await req(null, 'POST', `/api/v1/users/${u}/roles`, { reason: 'Rà soát phạm vi', ...body }));

let chiCN02: { id: string; docKey: string };
let hanPhieu: { id: string; docKey: string }[] = [];
let dcPhieu: { id: string; docKey: string }[] = [];
let kkCN02 = '';
let maxCN02 = '';
const TS = (code: string, cn: string) => ({ code, name: `Máy ${code}`, kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: cn, startDate: '2026-07-01', originalCost: 12000000, usefulLifeMonths: 36, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' });

describe.skipIf(!HAS_POS)('Phạm vi chi nhánh — rà soát 17/11', () => {
  beforeAll(async () => {
    ctx = await setupTenant();
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:pham-vi-chi-nhanh', trx as never); });
    app = await buildApp();
    ok(await req(null, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' }));
    for (const b of ok(await req(null, 'GET', '/api/v1/branches'))) bid[b.code] = String(b.id);
    for (const [code, cn] of [['KA-1', 'CN01'], ['KB-1', 'CN02']]) ok(await req(null, 'POST', '/api/v1/warehouses', { code, branchCode: cn, name: `Kho ${cn}`, isDefault: true }));

    const thuNgan = await user('thungan', 'staff');
    await gan(thuNgan, { tenantRoleId: await role('thu_ngan', 'job', [['pos:sell', 'allow']], 'staff'), scopeType: 'branch', scopeId: bid.CN01 });
    const ql = await user('quanly', 'viewer');
    await gan(ql, { tenantRoleId: await role('quan_ly_ch', 'job', [['pos:report', 'allow'], ['pos:sell', 'allow']], 'viewer'), scopeType: 'branch', scopeId: bid.CN01 });
    const qlnv = await user('qlnv', 'staff');
    await gan(qlnv, { tenantRoleId: await role('quan_ly_nv', 'job', [['pos:report', 'allow'], ['reports:read', 'allow'], ['ledger:read', 'allow']], 'staff'), scopeType: 'branch', scopeId: bid.CN01 });
    const kt = await user('ktcn01', 'viewer');
    await gan(kt, { role: 'accountant', scopeType: 'branch', scopeId: bid.CN01 });
    const han = await user('kthan', 'accountant');
    hanPhieu = [ok(await req('kthan', 'POST', '/api/v1/vouchers', chi('CN02'))), ok(await req('kthan', 'POST', '/api/v1/vouchers', chi('CN02')))];
    await gan(han, { tenantRoleId: await role('khong_chi_cn02', 'restriction', [['quy:phieu-chi-huy', 'deny'], ['quy:phieu-chi-sua', 'deny'], ['quy:phieu-chi-lap', 'deny']]), scopeType: 'branch', scopeId: bid.CN02 });
    const dc = await user('ktdieu', 'accountant');
    dcPhieu = [ok(await req('ktdieu', 'POST', '/api/v1/vouchers', chi('CN02'))), ok(await req('ktdieu', 'POST', '/api/v1/vouchers', chi('CN02')))];
    await gan(dc, { role: 'accountant', scopeType: 'branch', scopeId: bid.CN01 });

    ok(await req(null, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'Bật giới hạn (rà soát)' }));
    chiCN02 = ok(await req(null, 'POST', '/api/v1/vouchers', chi('CN02')));
    kkCN02 = String(ok(await req(null, 'POST', '/api/v1/kho/kiem-ke', { countDate: '2026-11-30', branchCode: 'CN02', purpose: 'Biên bản CN02' })).id);
    // H7 phân hệ (Mua hàng, Tài sản): bản ghi của CN02 / CN01 do chủ đơn vị lập
    ok(await req(null, 'PUT', '/api/v1/products', { products: [{ sku: 'PV-SUA', name: 'Sữa thử phạm vi', unit: 'Hộp' }] }));
    maxCN02 = String(ok(await req(null, 'POST', '/api/v1/stock/max-requests', { branchCode: 'CN02', items: [{ key: 'PV-SUA', sku: 'PV-SUA', name: 'Sữa thử phạm vi', proposedMax: 10 }] })).id);
    for (const [code, cn] of [['TS-CN02', 'CN02'], ['TS-CN01', 'CN01']] as const) expect((await req(null, 'POST', '/api/v1/assets', TS(code, cn))).status).toBeLessThan(300);
  });
  afterAll(async () => { await app?.close(); await ctx?.app.close(); });

  describe('Đối chứng — cơ chế cũ vẫn chặn đúng', () => {
    it('1. thu ngân CN01 mở ca ở CN02 → 403', async () => deny(await req('thungan', 'POST', '/api/v1/m/pos/shifts/open', { openingCash: 0, branchCode: 'CN02' })));
    it('2. thu ngân CN01 mở ca ở CN01 → được', async () => { ok(await req('thungan', 'POST', '/api/v1/m/pos/shifts/open', { openingCash: 0, branchCode: 'CN01' })); });
    it('3. kế toán bị hạn chế lập phiếu chi ghi CN02 → 403', async () => deny(await req('kthan', 'POST', '/api/v1/vouchers', chi('CN02'))));
    it('4. kế toán điều chuyển lập phiếu chi ghi CN02 → 403', async () => deny(await req('ktdieu', 'POST', '/api/v1/vouchers', chi('CN02'))));
    it('5. kế toán CN01 huỷ phiếu chi CN02 của người khác → 403', async () => deny(await req('ktcn01', 'POST', '/api/v1/documents/cancel', { docKey: chiCN02.docKey, reason: 'Thử' }, 'CN01')));
    it('6. kế toán CN01 sửa phiếu chi CN02 của người khác → 403', async () => deny(await req('ktcn01', 'PUT', `/api/v1/vouchers/${chiCN02.id}`, { ...chi('CN01'), description: 'Sửa' }, 'CN01')));
  });

  describe('L1 — nhân viên bán hàng chỉ vào cửa hàng của mình', () => {
    it('7. thu ngân (Nhân viên) KHÔNG xem bảng cân đối số phát sinh', async () => deny(await req('thungan', 'GET', TB)));
    it('8. thu ngân (Nhân viên) KHÔNG xem quản trị POS', async () => deny(await req('thungan', 'GET', '/api/v1/m/pos/admin/orders?from=2026-01-01')));
    it('16. thu ngân (Nhân viên) KHÔNG xem danh sách chứng từ', async () => deny(await req('thungan', 'GET', '/api/v1/documents?docType=payment', undefined, 'CN01')));
  });

  describe('L2 — quản lý chi nhánh chỉ xem chi nhánh mình', () => {
    it('9. quản lý CN01 xin báo cáo lọc CN02 → 403', async () => deny(await req('quanly', 'GET', `${TB}&branchCodes=CN02`)));
    it('10. quản lý CN01 xem đơn POS lọc CN02 → 403', async () => deny(await req('quanly', 'GET', '/api/v1/m/pos/admin/orders?from=2026-01-01&branches=CN02')));
    it('11. kế toán CN01 xem danh sách chứng từ: không thấy phiếu CN02', async () => {
      const r = await req('ktcn01', 'GET', '/api/v1/documents?docType=payment', undefined, 'CN01');
      expect(r.status).toBeLessThan(300);
      expect(JSON.stringify(r.body)).not.toContain(chiCN02.docKey);
    });
    it('17. quản lý CN01 xem bảng cân đối KHÔNG lọc → chỉ số liệu CN01 (phiếu chi CN02 không lọt vào)', async () => {
      const own = ok(await req(null, 'GET', TB)) as { rows: { code: string; debit: number }[] };
      expect(own.rows.find((x) => x.code === '64211')?.debit ?? 0).toBeGreaterThan(0); // chủ đơn vị: thấy cả công ty
      const r = ok(await req('quanly', 'GET', TB)) as { rows: { code: string; debit: number }[] };
      expect(r.rows.find((x) => x.code === '64211')?.debit ?? 0).toBe(0);
    });
    it('18. kế toán CN01 xem danh sách kiểm kê: không thấy biên bản CN02', async () => {
      const r = ok(await req('ktcn01', 'GET', '/api/v1/kho/kiem-ke', undefined, 'CN01')) as { id: string }[];
      expect(r.map((x) => String(x.id))).not.toContain(kkCN02);
    });
    it('19. kế toán CN01 mở biên bản kiểm kê CN02 theo mã → 403', async () => deny(await req('ktcn01', 'GET', `/api/v1/kho/kiem-ke/${kkCN02}`, undefined, 'CN01')));
    it('20. quản lý cấp 2 (Nhân viên + quyền tại CN01): xem bảng cân đối được, chỉ số liệu CN01; xin CN02 → 403', async () => {
      const r = ok(await req('qlnv', 'GET', TB)) as { rows: { code: string; debit: number }[] };
      expect(r.rows.find((x) => x.code === '64211')?.debit ?? 0).toBe(0);
      deny(await req('qlnv', 'GET', `${TB}&branchCodes=CN02`));
    });
    it('21. quản lý cấp 2: xem quản trị POS được (tự lọc CN01); xin CN02 → 403', async () => {
      ok(await req('qlnv', 'GET', '/api/v1/m/pos/admin/orders?from=2026-01-01'));
      deny(await req('qlnv', 'GET', '/api/v1/m/pos/admin/orders?from=2026-01-01&branches=CN02'));
    });
  });

  describe('Lỗ 1 — chi nhánh tra từ bản ghi, không từ header / thân', () => {
    it('12. Hạn chế tại CN02: sửa phiếu chi CN02 (của mình), thân + header CN01 → 403', async () =>
      deny(await req('kthan', 'PUT', `/api/v1/vouchers/${hanPhieu[0]!.id}`, { ...chi('CN01'), description: 'Sửa lách' }, 'CN01')));
    it('13. Hạn chế tại CN02: huỷ phiếu chi CN02 (của mình), header CN01 → 403', async () =>
      deny(await req('kthan', 'POST', '/api/v1/documents/cancel', { docKey: hanPhieu[1]!.docKey, reason: 'Thử lách' }, 'CN01')));
    it('14. Phạm vi CN01: sửa phiếu chi CN02 (của mình), thân CN01 → 403', async () =>
      deny(await req('ktdieu', 'PUT', `/api/v1/vouchers/${dcPhieu[0]!.id}`, { ...chi('CN01'), description: 'Sửa lách' }, 'CN01')));
    it('15. Phạm vi CN01: huỷ phiếu chi CN02 (của mình), header CN01 → 403', async () =>
      deny(await req('ktdieu', 'POST', '/api/v1/documents/cancel', { docKey: dcPhieu[1]!.docKey, reason: 'Thử lách' }, 'CN01')));
  });

  describe('H7 phân hệ — Mua hàng, Tài sản tra chi nhánh của bản ghi', () => {
    it('22. kế toán CN01 sửa phiếu đăng ký tồn max của CN02, thân ghi CN01 → 403', async () => {
      const r = await req('ktcn01', 'PUT', `/api/v1/stock/max-requests/${maxCN02}`, { branchCode: 'CN01', items: [{ key: 'PV-SUA', sku: 'PV-SUA', name: 'Sữa thử phạm vi', proposedMax: 20 }] }, 'CN01');
      deny(r);
      expect(JSON.stringify(r.body)).toContain('BRANCH_OUT_OF_SCOPE');
    });
    it('23. kế toán CN01 sửa thẻ tài sản của CN02, thân ghi CN01 → 403', async () => {
      const r = await req('ktcn01', 'PUT', '/api/v1/assets/TS-CN02', { ...TS('TS-CN02', 'CN01'), name: 'Sửa lách' }, 'CN01');
      deny(r);
      expect(JSON.stringify(r.body)).toContain('BRANCH_OUT_OF_SCOPE');
    });
    it('24. kế toán CN01 xem kế hoạch khấu hao tài sản CN02 theo mã → 403; tài sản CN01 → được', async () => {
      deny(await req('ktcn01', 'GET', '/api/v1/assets/TS-CN02/plan', undefined, 'CN01'));
      ok(await req('ktcn01', 'GET', '/api/v1/assets/TS-CN01/plan', undefined, 'CN01'));
    });
    it('25. đối chứng: kế toán CN01 sửa thẻ tài sản CN01 → không bị chặn theo chi nhánh', async () => {
      const r = await req('ktcn01', 'PUT', '/api/v1/assets/TS-CN01', { ...TS('TS-CN01', 'CN01'), name: 'Máy CN01 sửa' }, 'CN01');
      expect(JSON.stringify(r.body)).not.toContain('BRANCH_OUT_OF_SCOPE');
      expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
    });
  });
});
