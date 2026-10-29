/**
 * Kiểm thử: báo cáo tình hình tài chính (B01-DN), tổng hợp thuế GTGT, bảng kê số dư tiền, bảng tổng hợp chứng từ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';
const bs = async (range = OCT) => {
  const res = await call(ctx, 'GET', `/api/v1/reports/balance-sheet?${range}`);
  expect(res.status).toBe(200);
  const d = res.body.data;
  return { d, v: (code: string) => d.rows.find((r: any) => r.code === code) };
};

beforeAll(async () => {
  ctx = await setupTenant();
  // Số dư đầu: tiền mặt 10tr, vốn góp 10tr (30/09). Tài khoản vốn góp 41111 theo dõi đối tượng (chủ sở hữu).
  await call(ctx, 'PUT', '/api/v1/partners/CSH01', { name: 'Chủ sở hữu' });
  const opening = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-09-30', lines: [{ accountCode: '1111', debit: 10000000 }, { accountCode: '41111', partnerCode: 'CSH01', credit: 10000000 }] });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  // Bán 185.185 + thuế 14.815 = 200.000, thu tiền mặt (05/10), có hoá đơn.
  await call(ctx, 'POST', '/api/v1/documents', saleDoc());
  // Bán ghi nợ 100.000 + 8.000 cho khách B (06/10), không hoá đơn.
  await call(ctx, 'POST', '/api/v1/documents', saleDoc({
    docKey: 'pos:CN01:HD0002', docNo: 'HD0002', docDate: '2026-10-06', invoice: undefined, partner: { code: 'KH-B', name: 'Công ty B' },
    lines: [{ lineKey: 'l1', sku: 'SUA02', name: 'Sữa nước', unit: 'Hộp', qty: 4, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
    payments: [{ methodCode: 'CONGNO', amount: 108000 }], totals: { beforeTax: 100000, tax: 8000, total: 108000 },
  }));
  // Khách C trả trước 50.000 bằng tiền mặt (dư Có 131).
  await call(ctx, 'PUT', '/api/v1/partners/KH-C', { name: 'Khách C' });
  await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-08', description: 'Khách ứng trước', partnerCode: 'KH-C', lines: [{ debitAccount: '1111', creditAccount: '1311', amount: 50000 }] });
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Báo cáo tình hình tài chính (B01-DN)', () => {
  it('cân khi chưa kết chuyển: lãi chưa kết chuyển nằm ở 420b', async () => {
    const { d, v } = await bs();
    expect(v('111').closing).toBe(10000000 + 200000 + 50000);
    expect(v('111').opening).toBe(10000000);
    expect(v('131').closing).toBe(108000); // khách B còn nợ
    expect(v('312').closing).toBe(50000); // khách C trả trước: không bù trừ với khách B
    expect(v('411').closing).toBe(10000000);
    expect(d.unclosedProfit).toBe(285185);
    expect(v('420b').closing).toBe(285185);
    expect(d.totals.difference).toBe(0);
    expect(d.totals.assets).toBe(d.totals.sources);
    expect(d.unmapped).toEqual([]);
  });

  it('sau kết chuyển vẫn cân, lãi chuyển hẳn về 4212', async () => {
    const run = await call(ctx, 'POST', '/api/v1/closing/run', { period: '2026-10', branchCodes: ['CN01'] });
    expect(run.body.data[0].profit).toBe(285185);
    const { d, v } = await bs();
    expect(d.unclosedProfit).toBe(0);
    expect(v('420b').closing).toBe(285185);
    expect(d.totals.difference).toBe(0);
  });

  it('đúng khung mẫu Thông tư 99: tổng tài sản 280, chỉ tiêu mới 150, 230, 313, 324, 340; không còn mục 430', async () => {
    const { d } = await bs();
    const codes = d.rows.map((r: any) => r.code);
    for (const c of ['100', '150', '160', '161', '165', '230', '240', '250', '260', '270', '280', '313', '319', '324', '340', '400', '420a', '420b', '440']) expect(codes).toContain(c);
    expect(codes).not.toContain('430');
    expect(codes).not.toContain('421b');
    expect(d.rows.find((r: any) => r.code === '280').name).toMatch(/TỔNG CỘNG TÀI SẢN/);
  });

  it('số đầu kỳ của tháng 11 bằng số cuối kỳ của tháng 10', async () => {
    const oct = await bs();
    const nov = await bs('from=2026-11-01&to=2026-11-30');
    expect(nov.v('280').opening).toBe(oct.v('280').closing);
    expect(nov.v('440').opening).toBe(oct.v('440').closing);
  });
});

describe('Bảng tổng hợp thuế GTGT', () => {
  it('thuế ra theo hoá đơn, thuế vào theo tài khoản 133', async () => {
    // Chi tiền mua dịch vụ có thuế đầu vào 10.000.
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'payment', branchCode: 'CN01', docDate: '2026-10-12', description: 'Mua văn phòng phẩm', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 100000 }, { debitAccount: '1331', creditAccount: '1111', amount: 10000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const res = await call(ctx, 'GET', `/api/v1/reports/tax-summary?${OCT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ branchCode: 'CN01', invoices: 1, revenue: 185185, outputTax: 14815, inputTax: 10000, carried: 0, payable: 4815 });
  });
});

describe('Bảng kê số dư tiền', () => {
  it('dư đầu + thu − chi = dư cuối, khớp tài khoản 111 trên cân đối phát sinh', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/cash-balances?${OCT}`);
    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r: any) => r.accountCode === '1111');
    expect(row).toMatchObject({ branchCode: 'CN01', opening: 10000000, debit: 250000, credit: 110000, closing: 10140000 });
    const tb = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${OCT}`);
    expect(res.body.data.totals.closing).toBe(tb.body.data.rows.find((r: any) => r.code === '111').closingDebit);
  });
});

describe('Bảng tổng hợp chứng từ', () => {
  it('gom theo cặp tài khoản Nợ / Có; lọc theo loại chứng từ', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/posting-summary?${OCT}&docType=payment`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([
      expect.objectContaining({ docType: '', debitAccount: '1331', creditAccount: '1111', amount: 10000, entries: 1 }),
      expect.objectContaining({ docType: '', debitAccount: '64211', creditAccount: '1111', amount: 100000, entries: 1 }),
    ]);
    const all = await call(ctx, 'GET', `/api/v1/reports/posting-summary?${OCT}&byDocType=true`);
    expect(all.body.data.rows.some((r: any) => r.docType === 'closing' && r.creditAccount === '4212')).toBe(true);
  });
});
