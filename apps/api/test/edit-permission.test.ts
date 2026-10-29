/**
 * Phân quyền sửa / huỷ phiếu (kế hoạch Đợt 2, hạng mục 2.4): kế toán viên chỉ sửa / huỷ phiếu nhập tay của mình;
 * kế toán trưởng, chủ đơn vị sửa / huỷ được phiếu của mọi người.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const voucher = (description: string) => ({ docType: 'payment', branchCode: 'CN01', docDate: '2026-10-10', description, lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 100000 }] });

async function userCtx(email: string, role: string): Promise<TestCtx> {
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  return { ...ctx, token: res.json().data.token };
}

let kt1: TestCtx, kt2: TestCtx, ktt: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
  kt1 = await userCtx('kt1@ketoan.local', 'accountant');
  kt2 = await userCtx('kt2@ketoan.local', 'accountant');
  ktt = await userCtx('ktt@ketoan.local', 'chief_accountant');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Phân quyền sửa / huỷ phiếu', () => {
  it('kế toán viên sửa phiếu của mình, không sửa / huỷ được phiếu người khác', async () => {
    const own = await call(kt1, 'POST', '/api/v1/vouchers', voucher('Phiếu của KT1'));
    expect(own.status).toBe(201);
    const id = own.body.data.id;
    expect((await call(kt1, 'PUT', `/api/v1/vouchers/${id}`, voucher('KT1 sửa'))).status).toBe(200);

    const other = await call(kt2, 'PUT', `/api/v1/vouchers/${id}`, voucher('KT2 sửa'));
    expect(other.status).toBe(403);
    expect(other.body.error.message).toContain('do chính mình lập');
    expect((await call(kt2, 'POST', '/api/v1/documents/cancel', { docKey: own.body.data.docKey, reason: 'thử' })).status).toBe(403);

    const seen = await call(kt2, 'GET', `/api/v1/documents/${id}`);
    expect(seen.body.data).toMatchObject({ canModify: false, createdByName: 'kt1' });
    expect((await call(kt1, 'GET', `/api/v1/documents/${id}`)).body.data.canModify).toBe(true);
  });

  it('kế toán trưởng, chủ đơn vị sửa / huỷ được phiếu của người khác', async () => {
    const own = await call(kt1, 'POST', '/api/v1/vouchers', voucher('Phiếu KT1 lần 2'));
    expect((await call(ktt, 'PUT', `/api/v1/vouchers/${own.body.data.id}`, voucher('KTT sửa'))).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: own.body.data.docKey, reason: 'Chủ đơn vị huỷ' })).status).toBe(200);
  });
});
