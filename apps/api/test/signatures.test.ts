/**
 * Ký xác nhận trên phiếu (KT-27): ai ký vai nào, ký hàng loạt, sửa phiếu thì chữ ký cũ hết hiệu lực, huỷ ký.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let kt: TestCtx;
let ktt: TestCtx;
const voucher = (description: string) => ({ docType: 'payment', branchCode: 'CN01', docDate: '2026-10-10', description, lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 100000 }] });

async function userCtx(email: string, role: string): Promise<TestCtx> {
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  return { ...ctx, token: res.json().data.token };
}

beforeAll(async () => {
  ctx = await setupTenant();
  kt = await userCtx('kt@ketoan.local', 'accountant');
  ktt = await userCtx('ktt@ketoan.local', 'chief_accountant');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Ký xác nhận trên phiếu', () => {
  it('đúng người ký đúng vai; sửa phiếu thì chữ ký cũ hết hiệu lực', async () => {
    const v = (await call(kt, 'POST', '/api/v1/vouchers', voucher('Chi phí văn phòng'))).body.data;
    const sign = (c: TestCtx, role: string, ids = [v.id]) => call(c, 'POST', '/api/v1/signatures', { ids, role });
    expect((await sign(kt, 'preparer')).body.data).toEqual({ signed: 1, skipped: [] });
    expect((await sign(kt, 'chief_accountant')).status).toBe(403);
    expect((await sign(ktt, 'director')).status).toBe(403);
    expect((await sign(ktt, 'chief_accountant')).body.data.signed).toBe(1);
    expect((await sign(ctx, 'director')).body.data.signed).toBe(1);
    // Ký lại cùng vai: bỏ qua.
    expect((await sign(ktt, 'chief_accountant')).status).toBe(403);

    const detail = (await call(kt, 'GET', `/api/v1/documents/${v.id}`)).body.data;
    expect(detail.signatures.map((s: { role: string; valid: boolean }) => `${s.role}:${s.valid}`).sort()).toEqual(['chief_accountant:true', 'director:true', 'preparer:true']);

    expect((await call(kt, 'PUT', `/api/v1/vouchers/${v.id}`, voucher('Chi phí văn phòng (sửa)'))).status).toBe(200);
    const after = (await call(kt, 'GET', `/api/v1/documents/${v.id}/signatures`)).body.data;
    expect(after.every((s: { valid: boolean }) => !s.valid)).toBe(true);
    expect((await sign(kt, 'preparer')).body.data.signed).toBe(1);
  });

  it('ký hàng loạt bỏ qua phiếu đã huỷ; huỷ chữ ký chỉ người ký hoặc chủ đơn vị', async () => {
    const a = (await call(ktt, 'POST', '/api/v1/vouchers', voucher('Phiếu A'))).body.data;
    const b = (await call(ktt, 'POST', '/api/v1/vouchers', voucher('Phiếu B'))).body.data;
    await call(ktt, 'POST', '/api/v1/documents/cancel', { docKey: b.docKey, reason: 'Lập nhầm' });
    const r = await call(ktt, 'POST', '/api/v1/signatures', { ids: [a.id, b.id], role: 'chief_accountant' });
    expect(r.body.data.signed).toBe(1);
    expect(r.body.data.skipped).toEqual([expect.stringContaining('đã huỷ')]);
    expect((await call(kt, 'DELETE', `/api/v1/documents/${a.id}/signatures/chief_accountant`)).status).toBe(403);
    expect((await call(ktt, 'DELETE', `/api/v1/documents/${a.id}/signatures/chief_accountant`)).status).toBe(200);
    expect((await call(ktt, 'GET', `/api/v1/documents/${a.id}/signatures`)).body.data).toEqual([]);
  });
});
