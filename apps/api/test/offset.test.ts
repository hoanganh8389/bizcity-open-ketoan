/**
 * Cấn trừ công nợ (kế hoạch Đợt 2, hạng mục 2.3): số dư công nợ một đối tượng, đối tượng riêng bên Có.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const manual = (description: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-10', description, lines, ...extra });

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/DT-A', { name: 'Công ty A', kind: 'customer' });
  await call(ctx, 'PUT', '/api/v1/partners/DT-B', { name: 'Công ty B', kind: 'customer' });
  // A nợ mình 5 triệu (131), mình nợ A 3 triệu (331); mình nợ B 4 triệu.
  const r0 = await manual('Phải thu A', [{ debitAccount: '1311', creditAccount: '51111', amount: 5000000, partnerCode: 'DT-A' }]);
  expect(r0.status, JSON.stringify(r0.body)).toBe(201);
  expect((await manual('Phải trả A', [{ debitAccount: '64211', creditAccount: '33111', amount: 3000000, partnerCode: 'DT-A' }])).status).toBe(201);
  expect((await manual('Phải trả B', [{ debitAccount: '64211', creditAccount: '33111', amount: 4000000, partnerCode: 'DT-B' }])).status).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
});

const balances = async (code: string) => (await call(ctx, 'GET', `/api/v1/partners/${code}/balances?asOf=2026-10-31`)).body.data.accounts.map((a: { accountCode: string; balance: number }) => [a.accountCode, a.balance]);

describe('Cấn trừ công nợ', () => {
  it('số dư công nợ của một đối tượng theo tài khoản', async () => {
    expect(await balances('DT-A')).toEqual([['1311', 5000000], ['33111', -3000000]]);
    expect((await call(ctx, 'GET', '/api/v1/partners/KHONG-CO/balances?asOf=2026-10-31')).status).toBe(404);
  });

  it('cùng một đối tượng: Nợ 331 / Có 131', async () => {
    const r = await manual('Cấn trừ công nợ A', [{ debitAccount: '33111', creditAccount: '1311', amount: 3000000, partnerCode: 'DT-A' }], { purpose: 'offset' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await balances('DT-A')).toEqual([['1311', 2000000]]);
    const doc = await call(ctx, 'GET', `/api/v1/documents/${r.body.data.id}`);
    expect(doc.body.data.payload.purpose).toBe('offset');
  });

  it('hai đối tượng: bên Nợ ghi cho B, bên Có ghi cho A', async () => {
    const r = await manual('Bù trừ A với B', [{ debitAccount: '33111', creditAccount: '1311', amount: 2000000, partnerCode: 'DT-B', creditPartnerCode: 'DT-A' }]);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await balances('DT-A')).toEqual([]);
    expect(await balances('DT-B')).toEqual([['33111', -2000000]]);
    const bad = await manual('Sai mã', [{ debitAccount: '33111', creditAccount: '1311', amount: 1, partnerCode: 'DT-B', creditPartnerCode: 'KHONG-CO' }]);
    expect(bad.status).toBe(400);
  });
});

describe('Cấn trừ theo từng hoá đơn', () => {
  it('một phiếu bán với nhiều phiếu nhập: gạch nợ đúng từng khoản ở hai tài khoản', async () => {
    await call(ctx, 'PUT', '/api/v1/partners/DT-C', { name: 'Công ty C', kind: 'customer' });
    const sale = await manual('Bán cho C', [{ debitAccount: '1311', creditAccount: '51111', amount: 1000000, partnerCode: 'DT-C' }]);
    const p1 = await manual('Mua của C lần 1', [{ debitAccount: '64211', creditAccount: '33111', amount: 600000, partnerCode: 'DT-C' }]);
    const p2 = await manual('Mua của C lần 2', [{ debitAccount: '64211', creditAccount: '33111', amount: 700000, partnerCode: 'DT-C' }]);
    const items = async (account: string, side: string) =>
      (await call(ctx, 'GET', `/api/v1/debt-items?partnerCode=DT-C&account=${account}&side=${side}&status=all`)).body.data as { id: string; docNo: string; remaining: number }[];
    const saleItem = (await items('1311', 'debit'))[0]!;
    const [i1, i2] = (await items('33111', 'credit')).sort((x, y) => x.docNo.localeCompare(y.docNo));
    expect([sale.status, p1.status, p2.status]).toEqual([201, 201, 201]);
    // Cấn trừ 1.000.000: gạch hết phiếu bán; phiếu nhập 1 gạch 600.000, phiếu nhập 2 gạch 400.000.
    const r = await manual('Cấn trừ C', [{ debitAccount: '33111', creditAccount: '1311', amount: 1000000, partnerCode: 'DT-C' }], {
      purpose: 'offset',
      settle: [{ debtItemId: saleItem.id, amount: 1000000 }, { debtItemId: i1!.id, amount: 600000 }, { debtItemId: i2!.id, amount: 400000 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await items('1311', 'debit')).find((x) => x.id === saleItem.id)!.remaining).toBe(0);
    const after = await items('33111', 'credit');
    expect(after.find((x) => x.id === i1!.id)!.remaining).toBe(0);
    expect(after.find((x) => x.id === i2!.id)!.remaining).toBe(300000);
  });
});
