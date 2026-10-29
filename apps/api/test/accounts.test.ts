/**
 * Danh mục tài khoản (ACC1): cờ tính chất, thêm / xoá tài khoản con, chặn xoá khi có con hoặc phát sinh.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('DM Tài khoản', () => {
  it('thêm tài khoản con với các cờ tính chất, sửa cờ', async () => {
    const r = await call(ctx, 'POST', '/api/v1/accounts', { code: '138881', parentCode: '13888', name: 'Phải thu tạm ứng chờ đối chiếu', normalSide: 'both', trackPartner: true, isDebt: true, isLedger: true, trackInternalDebt: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data).toMatchObject({ level: 4, isPosting: true, isDebt: true, isLedger: true, trackInternalDebt: true, isVat: false });
    expect((await call(ctx, 'GET', '/api/v1/accounts/13888')).body.data.isPosting).toBe(false);
    const u = await call(ctx, 'PATCH', '/api/v1/accounts/138881', { isVat: true, isLedger: false });
    expect(u.body.data).toMatchObject({ isVat: true, isLedger: false, isDebt: true });
  });

  it('xoá: chặn tài khoản có con; xoá con cuối thì tài khoản mẹ ghi sổ trực tiếp lại', async () => {
    const parent = await call(ctx, 'DELETE', '/api/v1/accounts/13888');
    expect(parent.status).toBe(409);
    expect(parent.body.error.message).toMatch(/tài khoản con/);
    const ok = await call(ctx, 'DELETE', '/api/v1/accounts/138881');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/accounts/138881')).status).toBe(404);
    expect((await call(ctx, 'GET', '/api/v1/accounts/13888')).body.data.isPosting).toBe(true);
  });

  it('thêm: chặn trùng số tài khoản, tài khoản mẹ chưa có hoặc đã ngừng dùng, không có quyền', async () => {
    const dup = await call(ctx, 'POST', '/api/v1/accounts', { code: '1111', parentCode: '111', name: 'Trùng' });
    expect(dup.status).toBe(409);
    const noParent = await call(ctx, 'POST', '/api/v1/accounts', { code: '99991', parentCode: '9999', name: 'Không có mẹ' });
    expect(noParent.status).toBe(400);
    await call(ctx, 'POST', '/api/v1/accounts', { code: '138882', parentCode: '13888', name: 'Mẹ sẽ ngừng dùng' });
    expect((await call(ctx, 'PATCH', '/api/v1/accounts/138882', { isActive: false })).status).toBe(200);
    const inactive = await call(ctx, 'POST', '/api/v1/accounts', { code: '1388821', parentCode: '138882', name: 'Con của tài khoản ngừng dùng' });
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.message).toMatch(/ngừng sử dụng/);
    await call(ctx, 'POST', '/api/v1/users', { email: 'xem-tk@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' });
    const login = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem-tk@ketoan.local', password: 'Xem@12345' } })).json();
    const headers = { authorization: `Bearer ${login.data.token}` };
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/accounts', headers })).statusCode).toBe(200);
    const denied = await ctx.app.inject({ method: 'POST', url: '/api/v1/accounts', payload: { code: '13889', parentCode: '1388', name: 'x' }, headers });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.message).toMatch(/không có quyền truy cập chức năng này/);
  });

  it('tài khoản "Có ghi nhận công nợ" bắt buộc chọn đối tượng khi lập phiếu', async () => {
    expect((await call(ctx, 'POST', '/api/v1/accounts', { code: '13889', parentCode: '1388', name: 'Phải thu khác ghi nhận công nợ', isDebt: true })).status).toBe(201);
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Thiếu đối tượng', lines: [{ debitAccount: '13889', creditAccount: '1111', amount: 1000 }] });
    expect(v.status).toBe(422);
    expect(JSON.stringify(v.body)).toMatch(/bắt buộc phải chọn đối tượng/);
  });

  it('xoá: chặn tài khoản đã có phát sinh', async () => {
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Thu khác', lines: [{ debitAccount: '1111', creditAccount: '7118', amount: 1000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const r = await call(ctx, 'DELETE', '/api/v1/accounts/1111');
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/phát sinh/);
  });

  it('tài khoản ngầm định: mười một ô của form trước, khoá mới có giá trị khởi tạo', async () => {
    const rows = (await call(ctx, 'GET', '/api/v1/posting/defaults')).body.data as { key: string; accountCode: string | null; onForm: boolean }[];
    expect(rows.filter((r) => r.onForm).map((r) => r.key)).toEqual(['cash', 'tax_output', 'tax_input', 'goods_in_transit', 'internal_receivable_goods', 'internal_payable_goods', 'internal_receivable', 'internal_payable', 'internal_cogs', 'commission_debit', 'commission_credit']);
    expect(Object.fromEntries(rows.map((r) => [r.key, r.accountCode]))).toMatchObject({ internal_receivable_goods: '13681', internal_cogs: '6326', commission_debit: '6418', commission_credit: '33881' });
  });
});
