/**
 * Khoản công nợ theo chứng từ và đối trừ (kế hoạch Đợt 3, hạng mục 3.1, 3.4).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const voucher = (docType: string, docDate: string, description: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  call(ctx, 'POST', '/api/v1/vouchers', { docType, branchCode: 'CN01', docDate, description, partnerCode: 'KH-N', lines, ...extra });
const items = async (q = '&status=all') => (await call(ctx, 'GET', `/api/v1/debt-items?partnerCode=KH-N${q}`)).body;
const brief = (rows: { docNo: string; side: string; amount: number; remaining: number }[]) => rows.map((r) => `${r.side} ${r.amount} còn ${r.remaining}`);

let inv1 = '', inv2 = '', pay = '';
beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/KH-N', { name: 'Khách nợ', kind: 'customer', paymentTermDays: 30 });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Khoản công nợ theo chứng từ', () => {
  it('bán lẻ thu đủ ngay không sinh khoản công nợ', async () => {
    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
    expect((await call(ctx, 'GET', '/api/v1/debt-items?status=all')).body.data).toEqual([]);
  });

  it('mỗi chứng từ ghi nợ là một khoản; hạn = ngày chứng từ + hạn của đối tượng, hoặc hạn ghi trên phiếu', async () => {
    const a = await voucher('manual', '2026-09-01', 'Bán nợ đợt 1', [{ debitAccount: '1311', creditAccount: '51111', amount: 3000000 }]);
    const b = await voucher('manual', '2026-09-20', 'Bán nợ đợt 2', [{ debitAccount: '1311', creditAccount: '51111', amount: 2000000 }], { dueDate: '2026-12-31' });
    expect([a.status, b.status]).toEqual([201, 201]);
    const r = await items();
    expect(r.data.map((x: { dueDate: string; side: string; amount: number }) => [x.dueDate, x.side, x.amount])).toEqual([['2026-10-01', 'debit', 3000000], ['2026-12-31', 'debit', 2000000]]);
    expect(r.meta).toMatchObject({ debitRemaining: 5000000, creditRemaining: 0 });
    [inv1, inv2] = r.data.map((x: { id: string }) => x.id);
  });

  it('phiếu thu chọn khoản để thanh toán; phần thu thừa nằm lại là khoản ghi Có', async () => {
    const r = await voucher('receipt', '2026-10-05', 'Thu tiền khách', [{ debitAccount: '1111', creditAccount: '1311', amount: 2500000 }], { settle: [{ debtItemId: inv2, amount: 2000000 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const all = await items();
    expect(brief(all.data)).toEqual(['debit 3000000 còn 3000000', 'credit 2500000 còn 500000', 'debit 2000000 còn 0']);
    pay = all.data.find((x: { side: string }) => x.side === 'credit').id;
    const used = await call(ctx, 'GET', `/api/v1/debt-items/${inv2}/allocations`);
    expect(used.body.data).toEqual([expect.objectContaining({ amount: 2000000, isAuto: false, docDate: '2026-10-05' })]);
    const tooMuch = await voucher('receipt', '2026-10-06', 'Thu quá', [{ debitAccount: '1111', creditAccount: '1311', amount: 100000 }], { settle: [{ debtItemId: inv2, amount: 100000 }] });
    expect(tooMuch.status).toBe(400);
  });

  it('tự đối trừ theo hạn cũ trước; gỡ được', async () => {
    const auto = await call(ctx, 'POST', '/api/v1/debt-allocations/auto', { partnerCode: 'KH-N' });
    expect(auto.body.data.count).toBe(1);
    expect(brief((await items('&status=open')).data)).toEqual(['debit 3000000 còn 2500000']);
    const alloc = (await call(ctx, 'GET', `/api/v1/debt-items/${inv1}/allocations`)).body.data[0];
    expect(alloc).toMatchObject({ amount: 500000, isAuto: true });
    expect((await call(ctx, 'DELETE', `/api/v1/debt-allocations/${alloc.id}`)).status).toBe(200);
    expect((await items('&status=open')).meta).toMatchObject({ debitRemaining: 3000000, creditRemaining: 500000 });
  });

  it('đối trừ tay: phải cùng tài khoản, không vượt phần còn lại', async () => {
    const over = await call(ctx, 'POST', '/api/v1/debt-allocations', { pairs: [{ debitItemId: inv1, creditItemId: pay, amount: 600000 }] });
    expect(over.status).toBe(400);
    const same = await call(ctx, 'POST', '/api/v1/debt-allocations', { pairs: [{ debitItemId: inv1, creditItemId: inv2, amount: 1 }] });
    expect(same.status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/debt-allocations', { pairs: [{ debitItemId: inv1, creditItemId: pay, amount: 500000 }] })).status).toBe(201);
    expect((await items('&status=open')).meta).toMatchObject({ debitRemaining: 2500000, creditRemaining: 0 });
  });

  it('tổng còn lại của khoản mở bằng số dư tài khoản công nợ; quá hạn tính theo hạn thanh toán', async () => {
    const bal = (await call(ctx, 'GET', '/api/v1/partners/KH-N/balances?asOf=2026-12-31')).body.data.accounts;
    expect(bal).toEqual([expect.objectContaining({ accountCode: '1311', balance: 2500000 })]);
    const r = await items('&status=open&asOf=2026-10-31');
    expect(r.data[0]).toMatchObject({ dueDate: '2026-10-01', overdueDays: 30 });
    expect(r.meta.overdue).toBe(2500000);
  });

  it('huỷ chứng từ: khoản bị xoá, đối trừ liên quan được gỡ', async () => {
    const doc = (await items()).data.find((x: { id: string }) => x.id === inv2);
    expect((await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: doc.docKey, reason: 'Huỷ thử' })).status).toBe(200);
    const all = await items();
    expect(all.data.find((x: { id: string }) => x.id === inv2)).toBeUndefined();
    // Phiếu thu 2,5 triệu: phần 2 triệu đã trừ vào hoá đơn bị huỷ nay trở lại chưa đối trừ.
    expect(all.meta).toMatchObject({ debitRemaining: 2500000, creditRemaining: 2000000 });
  });
});
