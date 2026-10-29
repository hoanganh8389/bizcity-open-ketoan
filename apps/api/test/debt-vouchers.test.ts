/**
 * Phiếu ghi tăng / ghi giảm công nợ, đặt cọc (kế hoạch Đợt 3, hạng mục 3.2, 3.3).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const post = (body: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/vouchers', { branchCode: 'CN01', partnerCode: 'NCC-DV', ...body });
const items = async (q = '') => (await call(ctx, 'GET', `/api/v1/debt-items?partnerCode=NCC-DV&status=all${q}`)).body;

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/NCC-DV', { name: 'Công ty dịch vụ', kind: 'supplier', paymentTermDays: 15 });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Phiếu công nợ', () => {
  it('đặt cọc cho nhà cung cấp: khoản ghi Nợ trên 331, lọc theo mục đích', async () => {
    const r = await post({ docType: 'payment', docDate: '2026-10-01', description: 'Đặt cọc sửa chữa', purpose: 'deposit_paid', lines: [{ debitAccount: '33111', creditAccount: '1111', amount: 3000000 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const dep = await items('&purpose=deposit_paid,deposit_received');
    expect(dep.data).toEqual([expect.objectContaining({ purpose: 'deposit_paid', side: 'debit', accountCode: '33111', amount: 3000000, remaining: 3000000, docType: 'payment' })]);
    const docs = await call(ctx, 'GET', '/api/v1/documents?purpose=deposit_paid');
    expect(docs.body.data).toEqual([expect.objectContaining({ purpose: 'deposit_paid', docNo: r.body.data.docNo })]);
  });

  it('ghi tăng công nợ phải trả có thuế: một khoản gồm cả thuế, hạn = ngày phiếu + hạn của đối tượng', async () => {
    const r = await post({ docType: 'manual', docDate: '2026-10-10', description: 'Hoá đơn sửa chữa', purpose: 'ap_increase', lines: [{ debitAccount: '64211', creditAccount: '33111', amount: 10000000, taxCode: 'V10', taxAmount: 1000000, invoiceNo: '0000789', invoiceSerial: 'C26TDV', invoiceDate: '2026-10-10' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const inv = (await items('&purpose=ap_increase')).data;
    expect(inv).toEqual([expect.objectContaining({ side: 'credit', amount: 11000000, dueDate: '2026-10-25' })]);
  });

  it('trừ tiền cọc vào hoá đơn; ghi giảm công nợ; còn lại đúng', async () => {
    expect((await call(ctx, 'POST', '/api/v1/debt-allocations/auto', { partnerCode: 'NCC-DV', account: '331' })).body.data.count).toBe(1);
    const dec = await post({ docType: 'manual', docDate: '2026-10-12', description: 'Chiết khấu được hưởng', purpose: 'ap_decrease', lines: [{ debitAccount: '33111', creditAccount: '51111', amount: 500000 }] });
    expect(dec.status, JSON.stringify(dec.body)).toBe(201);
    const open = await items('&status=open'.replace('&status=open', ''));
    const byPurpose = Object.fromEntries(open.data.map((x: { purpose: string; remaining: number }) => [x.purpose, x.remaining]));
    expect(byPurpose).toEqual({ deposit_paid: 0, ap_increase: 8000000, ap_decrease: 500000 });
    const bal = (await call(ctx, 'GET', '/api/v1/partners/NCC-DV/balances?asOf=2026-12-31')).body.data.accounts;
    expect(bal).toEqual([expect.objectContaining({ accountCode: '33111', balance: -7500000 })]);
  });

  it('mục đích không hợp lệ bị từ chối', async () => {
    expect((await post({ docType: 'manual', docDate: '2026-10-12', description: 'x', purpose: 'khac', lines: [{ debitAccount: '33111', creditAccount: '51111', amount: 1 }] })).status).toBe(400);
  });
});
