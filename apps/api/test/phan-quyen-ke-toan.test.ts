// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Kế toán / Tài sản / Thuế đăng ký màn × thao tác; lệnh lõi gác qua lenh, lệnh phân hệ gác tại chỗ (đóng góp)
/**
 * Kiểm (NT-HT-003):
 * - GET /api/v1/man-hinh có màn của ba phân hệ;
 * - Kế toán (accountant) làm như cũ: phiếu kế toán (lõi /vouchers docType manual), thẻ tài sản (lõi /assets), tờ khai GTGT (phân hệ Thuế);
 * - vai trò hạn chế Cấm đúng một quyền chi tiết ở mỗi phân hệ → chặn đúng thao tác đó, thao tác bên cạnh vẫn làm được;
 * - Người xem không ghi được.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const tokens: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => call(ctx, method, url, payload, { authorization: `Bearer ${tokens[who]}` });

const pkt = (n: number) => ({ docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: `Phiếu kế toán thử ${n}`, lines: [{ debitAccount: '1111', creditAccount: '7118', amount: 1000 + n }] });
const thu = () => ({ docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-05', description: 'Phiếu thu thử', lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 1000, cashflowCode: '33' }] });
let seq = 0;
const taiSan = () => ({
  code: `TS-PQ${++seq}`, name: 'Máy thử phân quyền', kind: 'fixed_asset', categoryCode: 'PQ-MAY', branchCode: 'CN01', startDate: '2026-10-01',
  originalCost: 12000000, usefulLifeMonths: 12, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424',
});
const loaiTs = () => ({ code: `PQ-L${++seq}`, name: 'Loại thử phân quyền', kind: 'fixed_asset', assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' });
const toKhai = (period: number) => ({ periodKind: 'month', year: 2026, period, status: 'draft', manual: {} });
const tndn = { year: 2026, status: 'draft', manual: {} };

async function user(key: string, role: string) {
  const email = `${key}@pqkt.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqkt@12345' }));
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqkt@12345' } })).json().data.token;
  return String(u.id);
}

beforeAll(async () => {
  ctx = await setupTenant();
  ok(await call(ctx, 'POST', '/api/v1/asset-categories', { code: 'PQ-MAY', name: 'Máy thử', kind: 'fixed_asset', assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' }));
  await user('ketoan', 'accountant');
  await user('xem', 'viewer');
  const han = await user('han', 'accountant');
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code: 'han_che_kt', label: 'han_che_kt', kind: 'restriction', reason: 'Vai trò thử Kế toán' }));
  for (const permission of ['ke-toan:phieu-ke-toan-lap', 'tai-san:the-tai-san-lap', 'thue:to-khai-gtgt-luu']) {
    ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect: 'deny', reason: 'Luật thử Kế toán' }));
  }
  ok(await call(ctx, 'POST', `/api/v1/users/${han}/roles`, { tenantRoleId: r.id, reason: 'Gán thử' }));
});

describe('Kế toán / Tài sản / Thuế — màn × thao tác', () => {
  it('GET /man-hinh có màn của ba phân hệ, quyền gác là quyền chi tiết', async () => {
    const ds = ok(await call<{ data: { key: string; thaoTac: Record<string, { quyen: string }> }[] }>(ctx, 'GET', '/api/v1/man-hinh'));
    expect(ds.map((m) => m.key)).toEqual(expect.arrayContaining(['ke-toan.phieu-ke-toan', 'ke-toan.ky-ke-toan', 'tai-san.the-tai-san', 'tai-san.khau-hao', 'thue.to-khai-gtgt', 'thue.hoa-don-co-quan-thue']));
    expect(ds.find((m) => m.key === 'ke-toan.phieu-ke-toan')!.thaoTac.them!.quyen).toBe('ke-toan:phieu-ke-toan-lap');
    expect(ds.find((m) => m.key === 'thue.to-khai-gtgt')!.thaoTac.luu!.quyen).toBe('thue:to-khai-gtgt-luu');
  });

  it('Kế toán: phiếu kế toán, thẻ tài sản, loại tài sản, tờ khai GTGT, tờ khai TNDN như cũ', async () => {
    ok(await as('ketoan', 'POST', '/api/v1/vouchers', pkt(1)));
    ok(await as('ketoan', 'POST', '/api/v1/assets', taiSan()));
    ok(await as('ketoan', 'POST', '/api/v1/asset-categories', loaiTs()));
    ok(await as('ketoan', 'PUT', '/api/v1/vat-returns', toKhai(9)));
    ok(await as('ketoan', 'PUT', '/api/v1/cit-returns', tndn));
    const me = (ok(await as('ketoan', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(me).toEqual(expect.arrayContaining(['ke-toan:phieu-ke-toan-lap', 'tai-san:the-tai-san-lap', 'thue:to-khai-gtgt-luu']));
  });

  it('Cấm "lập phiếu kế toán": lập phiếu kế toán 403 (đúng thông báo màn); phiếu thu vẫn lập được; sửa phiếu kế toán vẫn được', async () => {
    const r = await as('han', 'POST', '/api/v1/vouchers', pkt(2));
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('Phiếu kế toán');
    ok(await as('han', 'POST', '/api/v1/vouchers', thu()));
    const v = ok(await as('ketoan', 'POST', '/api/v1/vouchers', pkt(3))) as { id: string };
    // Không bị gác bởi thao tác "Sửa" (có thể vẫn 403 vì luật chỉ người lập được sửa phiếu nhập tay — luật cũ, không phải màn)
    const sua = await as('han', 'PUT', `/api/v1/vouchers/${v.id}`, { ...pkt(3), description: 'Sửa' });
    expect(JSON.stringify(sua.body)).not.toContain('ke-toan:phieu-ke-toan-sua');
  });

  it('Cấm "thêm thẻ tài sản": thêm thẻ 403; thêm loại tài sản vẫn được', async () => {
    expect((await as('han', 'POST', '/api/v1/assets', taiSan())).status).toBe(403);
    ok(await as('han', 'POST', '/api/v1/asset-categories', loaiTs()));
  });

  it('Cấm "lưu tờ khai GTGT": lưu 403; tờ khai TNDN vẫn lưu được', async () => {
    expect((await as('han', 'PUT', '/api/v1/vat-returns', toKhai(8))).status).toBe(403);
    ok(await as('han', 'PUT', '/api/v1/cit-returns', tndn));
    const me = (ok(await as('han', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(me).not.toContain('thue:to-khai-gtgt-luu');
    expect(me).toContain('thue:to-khai-gtgt-bo-sung');
  });

  it('Người xem: xem được danh sách phiếu kế toán; không lập phiếu, không thêm tài sản, không lưu tờ khai, không khoá kỳ', async () => {
    ok(await as('xem', 'GET', '/api/v1/documents?docType=manual'));
    expect((await as('xem', 'POST', '/api/v1/vouchers', pkt(4))).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/assets', taiSan())).status).toBe(403);
    expect((await as('xem', 'PUT', '/api/v1/vat-returns', toKhai(7))).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/periods', { year: 2026 })).status).toBe(403);
    const me = (ok(await as('xem', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(me).toEqual(expect.arrayContaining(['ke-toan:phieu-ke-toan-xem', 'tai-san:the-tai-san-xem', 'thue:to-khai-gtgt-xem']));
    expect(me).not.toContain('ke-toan:phieu-ke-toan-lap');
  });
});
