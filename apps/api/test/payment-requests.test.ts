/**
 * Yêu cầu thanh toán (kế hoạch Đợt 3, hạng mục 3.5): đề nghị → duyệt một / hai cấp → lập phiếu chi, trừ khoản công nợ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, kt: TestCtx, ktt: TestCtx;
let invoice = '';
const base = { requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-YC' };

async function userCtx(email: string, role: string): Promise<TestCtx> {
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  return { ...ctx, token: res.json().data.token };
}

beforeAll(async () => {
  ctx = await setupTenant();
  kt = await userCtx('kt@ketoan.local', 'accountant');
  ktt = await userCtx('ktt@ketoan.local', 'chief_accountant');
  await call(ctx, 'PUT', '/api/v1/partners/NCC-YC', { name: 'Nhà cung cấp YC', kind: 'supplier' });
  const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-01', description: 'Mua dịch vụ', partnerCode: 'NCC-YC', purpose: 'ap_increase', lines: [{ debitAccount: '64211', creditAccount: '33111', amount: 8000000 }] });
  expect(v.status, JSON.stringify(v.body)).toBe(201);
  invoice = (await call(ctx, 'GET', '/api/v1/debt-items?partnerCode=NCC-YC')).body.data[0].id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Yêu cầu thanh toán', () => {
  it('một cấp duyệt: kế toán lập và gửi, không tự duyệt được; kế toán trưởng duyệt; lập phiếu chi trừ đúng khoản', async () => {
    const over = await call(kt, 'POST', '/api/v1/payment-requests', { ...base, items: [{ debtItemId: invoice, amount: 9000000 }] });
    expect(over.status).toBe(400);
    const c = await call(kt, 'POST', '/api/v1/payment-requests', { ...base, items: [{ debtItemId: invoice, amount: 5000000 }], description: 'Trả đợt 1', submit: true });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.data).toMatchObject({ status: 'submitted' });
    const id = c.body.data.id;
    expect((await call(kt, 'POST', `/api/v1/payment-requests/${id}/approve`)).status).toBe(403);
    expect((await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' })).status).toBe(409);
    expect((await call(ktt, 'POST', `/api/v1/payment-requests/${id}/approve`)).body.data.status).toBe('approved');

    const paid = await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body.data.status).toBe('paid');
    const doc = await call(ctx, 'GET', `/api/v1/documents/${paid.body.data.paidDocumentId}`);
    expect(doc.body.data).toMatchObject({ docType: 'payment', status: 'posted', total: 5000000 });
    const item = (await call(ctx, 'GET', '/api/v1/debt-items?partnerCode=NCC-YC&side=credit&status=all')).body.data[0];
    expect(item).toMatchObject({ amount: 8000000, settled: 5000000, remaining: 3000000 });
    const row = (await call(ctx, 'GET', `/api/v1/payment-requests/${id}`)).body.data;
    expect(row).toMatchObject({ statusLabel: 'Đã chi', approved1By: 'ktt', createdByName: 'kt', paidDocNo: paid.body.data.paidDocNo });
    expect((await call(kt, 'POST', `/api/v1/payment-requests/${id}/cancel`)).status).toBe(409);
  });

  it('vượt ngưỡng cần hai cấp: kế toán trưởng duyệt cấp 1, chủ sở hữu duyệt cấp 2; chi qua ngân hàng ra phiếu báo nợ', async () => {
    expect((await call(ktt, 'PUT', '/api/v1/payment-request-settings', { secondLevelFrom: 2000000 })).status).toBe(200);
    const c = await call(kt, 'POST', '/api/v1/payment-requests', { ...base, items: [{ debtItemId: invoice, amount: 3000000 }], submit: true });
    const id = c.body.data.id;
    expect((await call(ktt, 'POST', `/api/v1/payment-requests/${id}/approve`)).body.data.status).toBe('approved1');
    expect((await call(ktt, 'POST', `/api/v1/payment-requests/${id}/approve`)).status).toBe(403);
    expect((await call(ctx, 'POST', `/api/v1/payment-requests/${id}/approve`)).body.data.status).toBe('approved');
    const paid = await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-14', moneyAccount: '11210005' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect((await call(ctx, 'GET', `/api/v1/documents/${paid.body.data.paidDocumentId}`)).body.data.docType).toBe('bank_payment');
    expect((await call(ctx, 'GET', '/api/v1/debt-items?partnerCode=NCC-YC&status=open')).body.data).toEqual([]);
  });

  it('từ chối kèm lý do, sửa rồi gửi lại; khoản chi chưa ghi công nợ cần tài khoản ghi Nợ', async () => {
    expect((await call(kt, 'POST', '/api/v1/payment-requests', { ...base, amount: 1000000 })).status).toBe(400);
    const c = await call(kt, 'POST', '/api/v1/payment-requests', { ...base, amount: 1000000, debitAccount: '64211', method: 'cash', description: 'Tạm chi', submit: true });
    const id = c.body.data.id;
    expect((await call(ktt, 'POST', `/api/v1/payment-requests/${id}/reject`, {})).status).toBe(400);
    expect((await call(ktt, 'POST', `/api/v1/payment-requests/${id}/reject`, { reason: 'Thiếu chứng từ' })).body.data.status).toBe('rejected');
    expect((await call(kt, 'PUT', `/api/v1/payment-requests/${id}`, { ...base, amount: 900000, debitAccount: '64211', method: 'cash', description: 'Tạm chi (đã bổ sung)', submit: true })).status).toBe(200);
    expect((await call(ktt, 'POST', `/api/v1/payment-requests/${id}/approve`)).body.data.status).toBe('approved');
    const paid = await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-14', moneyAccount: '1111' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    const pending = await call(ctx, 'GET', '/api/v1/payment-requests?status=pending');
    expect(pending.body.data).toEqual([]);
    expect((await call(ctx, 'GET', '/api/v1/payment-requests')).body.data).toHaveLength(3);
  });

  it('chi trước cho nhà cung cấp (ghi Nợ 331, chưa có khoản công nợ): phiếu chi gắn mục đích trả trước, hiện ở khoản đặt cọc', async () => {
    const c = await call(kt, 'POST', '/api/v1/payment-requests', { ...base, amount: 2000000, debitAccount: '33111', method: 'cash', description: 'Đặt cọc đơn hàng', submit: true });
    const id = c.body.data.id;
    await call(ktt, 'POST', `/api/v1/payment-requests/${id}/approve`);
    // Vượt hạn mức: chủ đơn vị duyệt cấp 2.
    if ((await call(ctx, 'GET', `/api/v1/payment-requests/${id}`)).body.data.status === 'approved1') await call(ctx, 'POST', `/api/v1/payment-requests/${id}/approve`);
    const paid = await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-14', moneyAccount: '1111' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect((await call(ctx, 'GET', `/api/v1/documents/${paid.body.data.paidDocumentId}`)).body.data.payload.purpose).toBe('deposit_paid');
    const deposits = (await call(ctx, 'GET', '/api/v1/debt-items?partnerCode=NCC-YC&purpose=deposit_paid')).body.data;
    expect(deposits).toEqual([expect.objectContaining({ side: 'debit', remaining: 2000000 })]);
  });
});
