// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Mua hàng đăng ký màn (chứng từ MH11, hoá đơn NCC MH22, tồn max, chính sách…) + thao tác (đóng góp)
/**
 * Kiểm:
 * - GET /api/v1/man-hinh có các màn Mua hàng;
 * - Kế toán (documents:write, catalog:write) làm mọi việc như cũ;
 * - vai trò hạn chế Cấm một quyền chi tiết → đúng thao tác đó 403, thao tác khác không bị chặn
 *   (lệnh của phân hệ đổi quyền tại chỗ: Duyệt chứng từ; lệnh giữ catalog:write gác thêm qua `lenh`: Xoá chính sách);
 * - Người xem không ghi được; Người xem + chỉ Cho "Thêm chứng từ" thì thêm được, duyệt / hoá đơn vẫn không.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { db } from '../src/db/client.js';

let ctx: TestCtx;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => call(ctx, method, url, payload, { authorization: `Bearer ${tokens[who]}` });
const G = { sku: 'PQ-GOLD', name: 'Sữa thử phân quyền', unit: 'Lon', taxCode: 'V08' };
let n = 0;
const order = () => ({ kind: 'order', docDate: '2026-10-10', branchCode: 'CN01', partnerCode: 'NCC-PQ', priceIncludesVat: false, orderDiscount: {},
  lines: [{ lineKey: `l${++n}`, ...G, qty: 10, price: 100000, lineType: 'buy' }] });
const hoaDon = (no: string) => ({ partnerCode: 'NCC-PQ', form: '1', series: 'C26TPQ', no, date: '2026-10-20', sellerTaxCode: '0101234567', totalBeforeTax: 1_000_000, totalTax: 80_000, total: 1_080_000, source: 'excel',
  lines: [{ nccSku: 'PQ-NCC', nccName: 'SUA THU PHAN QUYEN', nccUnit: 'LON', qty: 10, price: 100_000, amount: 1_000_000, taxRate: 8, taxAmount: 80_000 }] });
const dangKyMax = { branchCode: 'CN01', items: [{ key: G.sku, sku: G.sku, name: G.name, proposedMax: 14 }] };
const deNghiChuyen = { fromBranch: 'CN01', shops: [{ toBranch: 'CN02', lines: [{ sku: G.sku, name: G.name, unit: 'Lon', qty: 6 }] }] };
const policy = (code: string) => ({ code, kind: 'payment_term', name: `Hạn thử ${code}`, scope: { partnerCode: 'NCC-PQ' }, rule: { basis: 'invoice_date', days: 10, workingDays: true } });

async function addUser(key: string, role: string) {
  const email = `${key}@pqmua.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqmua@12345' }));
  ids[key] = String(u.id);
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqmua@12345' } })).json().data.token;
}
async function role(code: string, kind: 'job' | 'restriction', rules: [string, 'allow' | 'deny'][], baseRole?: string) {
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Vai trò thử Mua hàng' }));
  for (const [permission, effect] of rules) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect, reason: 'Luật thử Mua hàng' }));
  return r.id;
}

beforeAll(async () => {
  ctx = await setupTenant();
  ok(await call(ctx, 'PUT', '/api/v1/partners/NCC-PQ', { name: 'NCC thử phân quyền', kind: 'supplier' }));
  const tid = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  await db.insertInto('products').values({ tenant_id: tid, sku: G.sku, name: G.name, unit: G.unit, tax_in_code: 'V08' }).onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing()).execute();
  await addUser('ketoan', 'accountant');
  await addUser('xem', 'viewer');
  await addUser('kthan', 'accountant');
  await addUser('lapdon', 'viewer');
  // Kế toán + vai trò hạn chế: Cấm duyệt chứng từ mua hàng, Cấm xoá chính sách mua hàng
  const han = await role('mua_khong_duyet', 'restriction', [['mua-hang:chung-tu-duyet', 'deny'], ['mua-hang:chinh-sach-xoa', 'deny']]);
  ok(await call(ctx, 'POST', `/api/v1/users/${ids.kthan}/roles`, { tenantRoleId: han, reason: 'Gán thử' }));
  // Người xem + vai trò "Lập đơn mua": chỉ Cho thêm / sửa chứng từ mua hàng
  const lap = await role('lap_don_mua', 'job', [['mua-hang:chung-tu-lap', 'allow'], ['mua-hang:chung-tu-sua', 'allow']], 'viewer');
  ok(await call(ctx, 'POST', `/api/v1/users/${ids.lapdon}/roles`, { tenantRoleId: lap, reason: 'Gán thử' }));
});
afterAll(async () => { await ctx.app.close(); });

describe('Mua hàng — phân quyền theo màn × thao tác', () => {
  it('GET /man-hinh có các màn Mua hàng, thao tác trả quyền chi tiết', async () => {
    const ds = ok(await call<{ data: { key: string; thaoTac: Record<string, { quyen: string }> }[] }>(ctx, 'GET', '/api/v1/man-hinh'));
    expect(ds.map((m) => m.key)).toEqual(expect.arrayContaining(['mua-hang.chung-tu', 'mua-hang.hoa-don-ncc', 'mua-hang.dang-ky-max', 'mua-hang.chuyen-shop', 'mua-hang.chinh-sach', 'mua-hang.ton-max']));
    expect(ds.find((m) => m.key === 'mua-hang.chung-tu')!.thaoTac.duyet!.quyen).toBe('mua-hang:chung-tu-duyet');
  });

  it('Kế toán: thêm / sửa / gửi duyệt / duyệt / huỷ chứng từ, thêm / xoá chính sách như cũ', async () => {
    ok(await as('ketoan', 'GET', '/api/v1/purchase/documents'));
    const d = ok(await as('ketoan', 'POST', '/api/v1/purchase/documents', order())) as { id: string };
    ok(await as('ketoan', 'PUT', `/api/v1/purchase/documents/${d.id}`, { ...order(), id: d.id, note: 'Sửa' }));
    expect((await as('ketoan', 'POST', `/api/v1/purchase/documents/${d.id}/approve`)).status).not.toBe(403);
    const d2 = ok(await as('ketoan', 'POST', '/api/v1/purchase/documents', order())) as { id: string };
    ok(await as('ketoan', 'POST', `/api/v1/purchase/documents/${d2.id}/cancel`));
    const p = ok(await as('ketoan', 'POST', '/api/v1/purchase/policies', policy('PQ-KT'))) as { id: string };
    ok(await as('ketoan', 'DELETE', `/api/v1/purchase/policies/${p.id}`));
    ok(await as('ketoan', 'POST', '/api/v1/purchase/invoices', hoaDon('PQ-KT01')));
  });

  it('Cấm "Duyệt chứng từ" + "Xoá chính sách": đúng hai việc đó 403, việc khác không bị chặn', async () => {
    const d = ok(await as('kthan', 'POST', '/api/v1/purchase/documents', order())) as { id: string };
    expect((await as('kthan', 'PUT', `/api/v1/purchase/documents/${d.id}`, { ...order(), id: d.id, note: 'Sửa' })).status).not.toBe(403);
    const duyet = await as('kthan', 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(duyet.status).toBe(403);
    const d2 = ok(await as('kthan', 'POST', '/api/v1/purchase/documents', order())) as { id: string };
    expect((await as('kthan', 'POST', `/api/v1/purchase/documents/${d2.id}/cancel`)).status).not.toBe(403);
    // Chính sách: lệnh giữ catalog:write, quyền chi tiết gác thêm qua `lenh`
    const p = ok(await as('kthan', 'POST', '/api/v1/purchase/policies', policy('PQ-HAN'))) as { id: string };
    const xoa = await as('kthan', 'DELETE', `/api/v1/purchase/policies/${p.id}`);
    expect(xoa.status).toBe(403);
    expect(JSON.stringify(xoa.body)).toContain('Chính sách mua hàng');
    expect((await as('kthan', 'POST', '/api/v1/stock/max-requests', dangKyMax)).status).not.toBe(403);
  });

  it('Người xem: xem được, mọi lệnh ghi của Mua hàng 403', async () => {
    ok(await as('xem', 'GET', '/api/v1/purchase/documents'));
    ok(await as('xem', 'GET', '/api/v1/purchase/invoices'));
    ok(await as('xem', 'GET', '/api/v1/stock/max-requests'));
    expect((await as('xem', 'POST', '/api/v1/purchase/documents', order())).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/purchase/invoices', hoaDon('PQ-0001'))).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/purchase/policies', policy('PQ-XEM'))).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/stock/max-requests', dangKyMax)).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/stock/transfer-requests', deNghiChuyen)).status).toBe(403);
  });

  it('Người xem + chỉ Cho "Thêm / sửa chứng từ": thêm được; duyệt, hoá đơn NCC vẫn 403', async () => {
    const d = ok(await as('lapdon', 'POST', '/api/v1/purchase/documents', order())) as { id: string };
    expect((await as('lapdon', 'POST', `/api/v1/purchase/documents/${d.id}/approve`)).status).toBe(403);
    expect((await as('lapdon', 'POST', `/api/v1/purchase/documents/${d.id}/cancel`)).status).toBe(403);
    expect((await as('lapdon', 'POST', '/api/v1/purchase/invoices', hoaDon('PQ-0001'))).status).toBe(403);
  });
});
