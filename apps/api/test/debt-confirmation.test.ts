/**
 * Biên bản đối chiếu công nợ (KT-18): số đầu kỳ, phát sinh, cuối kỳ theo từng tài khoản của đối tác, chi tiết chứng từ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const manual = (docDate: string, description: string, lines: Record<string, unknown>[]) =>
  call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate, description, lines });

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/DT-A', { name: 'Công ty A', kind: 'customer', taxCode: '0106933743', address: 'Hà Nội', contactName: 'Ông Nam' });
  await call(ctx, 'PUT', '/api/v1/partners/DT-B', { name: 'Công ty B', kind: 'supplier' });
  expect((await manual('2026-09-20', 'Bán cho A tháng 9', [{ debitAccount: '1311', creditAccount: '51111', amount: 3000000, partnerCode: 'DT-A' }])).status).toBe(201);
  await manual('2026-10-05', 'Bán cho A', [{ debitAccount: '1311', creditAccount: '51111', amount: 5000000, partnerCode: 'DT-A' }]);
  await manual('2026-10-10', 'A trả tiền', [{ debitAccount: '1111', creditAccount: '1311', amount: 4000000, partnerCode: 'DT-A' }]);
  await manual('2026-10-12', 'Mua của A', [{ debitAccount: '64211', creditAccount: '33111', amount: 1000000, partnerCode: 'DT-A' }]);
  await manual('2026-10-12', 'Mua của B', [{ debitAccount: '64211', creditAccount: '33111', amount: 700000, partnerCode: 'DT-B' }]);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Biên bản đối chiếu công nợ', () => {
  it('từng tài khoản và số còn nợ cuối kỳ; chọn đối tác; chi tiết chứng từ', async () => {
    const r = await call(ctx, 'GET', '/api/v1/reports/debt-confirmation?from=2026-10-01&to=2026-10-31&partnerCodes=DT-A&detail=true');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d.company.name).toBeTruthy();
    expect(d.partners).toHaveLength(1);
    const a = d.partners[0];
    expect(a.partner).toMatchObject({ code: 'DT-A', taxCode: '0106933743', contactName: 'Ông Nam' });
    expect(a.accounts.map((x: { accountCode: string; opening: number; debit: number; credit: number; closing: number }) => [x.accountCode, x.opening, x.debit, x.credit, x.closing])).toEqual([
      ['1311', 3000000, 5000000, 4000000, 4000000],
      ['33111', 0, 0, 1000000, -1000000],
    ]);
    expect(a.closing).toBe(3000000);
    expect(a.accounts[0].lines.map((l: { docNo: string; debit: number; credit: number }) => [l.debit, l.credit])).toEqual([[5000000, 0], [0, 4000000]]);

    const all = (await call(ctx, 'GET', '/api/v1/reports/debt-confirmation?from=2026-10-01&to=2026-10-31&account=331')).body.data;
    expect(all.partners.map((p: { partner: { code: string }; closing: number }) => [p.partner.code, p.closing])).toEqual([['DT-A', -1000000], ['DT-B', -700000]]);
  });
});
