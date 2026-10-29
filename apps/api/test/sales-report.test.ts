/**
 * Kiểm thử báo cáo bán hàng và tổng hợp công nợ.
 * Dữ liệu: 2 hoá đơn bán (1 thu tiền mặt, 1 ghi nợ) + 1 phiếu trả lại một phần của hoá đơn đầu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const RANGE = 'from=2026-10-01&to=2026-10-31';

beforeAll(async () => {
  ctx = await setupTenant();
  const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
  // HD0001: 185.185 + 14.815 thuế = 200.000, thu tiền mặt, khách A, ngày 05/10.
  expect((await post(saleDoc())).body.data.status).toBe('posted');
  // HD0002: 100.000 + 8.000 = 108.000, ghi nợ khách B, ngày 06/10, không hoá đơn.
  expect(
    (
      await post(
        saleDoc({
          docKey: 'pos:CN01:HD0002',
          docNo: 'HD0002',
          docDate: '2026-10-06',
          invoice: undefined,
          partner: { code: 'KH-B', name: 'Công ty B' },
          lines: [{ lineKey: 'l1', sku: 'SUA02', name: 'Sữa nước 1L', unit: 'Hộp', qty: 4, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
          payments: [{ methodCode: 'CONGNO', amount: 108000 }],
          totals: { beforeTax: 100000, tax: 8000, total: 108000 },
        }),
      )
    ).body.data.status,
  ).toBe('posted');
  // Trả lại một nửa HD0001... ở đây trả nguyên dòng với số tiền 92.593 + 7.407 = 100.000, trả tiền mặt, ngày 07/10.
  const ret = await post({
    docType: 'sale_return',
    docKey: 'pos:CN01:TL0001',
    version: 1,
    branchCode: 'CN01',
    docNo: 'TL0001',
    docDate: '2026-10-07',
    originalDocKey: 'pos:CN01:HD0001',
    partner: { code: '0912345678', name: 'Nguyễn Văn A' },
    lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 0.5, amountBeforeTax: 92593, taxCode: 'R08', taxAmount: 7407 }],
    payments: [{ methodCode: 'TM', amount: 100000 }],
    totals: { beforeTax: 92593, tax: 7407, total: 100000 },
  });
  expect(ret.body.data.status).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Báo cáo bán hàng chi tiết', () => {
  it('liệt kê từng dòng hàng, hàng trả lại ra số âm, tổng là số thuần', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(4); // 2 dòng HD0001 + 1 dòng HD0002 + 1 dòng trả lại
    const ret = res.body.data.rows.find((r: any) => r.docNo === 'TL0001');
    expect(ret.isReturn).toBe(true);
    expect(ret.amount).toBe(-92593);
    expect(res.body.data.totals.amount).toBe(185185 + 100000 - 92593);
    expect(res.body.data.totals.tax).toBe(14815 + 8000 - 7407);
    expect(res.body.meta.total).toBe(4);
  });

  it('lọc theo loại, phạm vi sổ và từ khoá', async () => {
    const onlyReturn = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}&kind=return`);
    expect(onlyReturn.body.data.rows).toHaveLength(1);
    const internal = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}&scope=internal&kind=sale`);
    expect(internal.body.data.rows.map((r: any) => r.docNo)).toEqual(['HD0002']);
    const search = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}&search=SUA02`);
    expect(search.body.data.rows).toHaveLength(1);
  });
});

describe('Tổng hợp bán hàng', () => {
  it('theo mặt hàng: bán, trả lại, doanh thu thuần', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=product`);
    const sua01 = res.body.data.rows.find((r: any) => r.key === 'SUA01');
    expect(sua01).toMatchObject({ saleQty: 1, saleAmount: 185185, returnQty: 0.5, returnAmount: 92593, netAmount: 92592 });
    expect(res.body.data.totals).toMatchObject({ saleDocs: 2, returnDocs: 1, saleAmount: 285185, returnAmount: 92593, netAmount: 192592 });
  });

  it('theo nhãn hàng: mặt hàng chưa phân loại gom vào dòng trống', async () => {
    await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', brandCode: 'ABB', brandName: 'Abbott' }] });
    const rows = (await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=brand`)).body.data.rows;
    expect(rows.find((r: any) => r.key === 'ABB')).toMatchObject({ label: 'Abbott', saleAmount: 185185, netAmount: 92592 });
    expect(rows.find((r: any) => r.key === '')).toMatchObject({ saleAmount: 100000 });
    const groups = await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=customerGroup`);
    expect(groups.status, JSON.stringify(groups.body)).toBe(200);
  });

  it('theo phiếu: mỗi phiếu một dòng, có tiền đã thu / ghi nợ, phiếu trả lại ghi âm', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=document`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((r: any) => [r.docNo, r.isReturn, r.total, r.paid, r.onCredit])).toEqual([
      ['HD0001', false, 200000, 200000, 0],
      ['HD0002', false, 108000, 0, 108000],
      ['TL0001', true, -100000, -100000, 0],
    ]);
    expect(res.body.data.totals).toMatchObject({ total: 208000, paid: 100000, onCredit: 108000 });
  });

  it('mọi cách nhóm cho cùng một tổng', async () => {
    const totals: number[] = [];
    for (const g of ['document', 'day', 'month', 'branch', 'product', 'customer', 'taxCode']) {
      const res = await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=${g}`);
      expect(res.status).toBe(200);
      totals.push(res.body.data.totals.total);
    }
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(200000 + 108000 - 100000);
  });

  it('doanh thu thuần khớp sổ cái (511 − 521)', async () => {
    const tb = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${RANGE}`);
    const acc = (code: string) => tb.body.data.rows.find((r: any) => r.code === code) ?? { debit: 0, credit: 0 };
    const net = acc('511').credit - acc('511').debit - (acc('521').debit - acc('521').credit);
    const sum = await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=day`);
    expect(sum.body.data.totals.netAmount).toBe(net);
  });
});

describe('Thu tiền theo hình thức thanh toán', () => {
  it('tách theo hình thức, trừ tiền trả lại khách; ghi nợ xếp cuối, không cộng vào thực thu', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-payments?${RANGE}&groupBy=day`);
    expect(res.body.data.methods.map((m: any) => m.code)).toEqual(['TM', 'CONGNO']);
    expect(res.body.data.totals.cells).toEqual({ TM: 100000, CONGNO: 108000 });
    expect(res.body.data.totals).toMatchObject({ received: 200000, refunded: 100000, net: 100000 });
  });
});

describe('Thanh toán bằng voucher', () => {
  it('tài khoản voucher theo dõi đối tượng: bút toán thu tiền phải gắn khách và ghi sổ được', async () => {
    const res = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HD-VOUCHER', docNo: 'HD-VOUCHER', docDate: '2026-11-02', payments: [{ methodCode: 'VOUCHER', amount: 50000 }, { methodCode: 'TM', amount: 150000 }] }));
    expect(res.body.data.status, JSON.stringify(res.body)).toBe('posted');
    const bal = await call(ctx, 'GET', '/api/v1/reports/partner-balances?account=1388&from=2026-11-01&to=2026-11-30');
    expect(bal.body.data.rows).toEqual([expect.objectContaining({ partnerCode: '0912345678', debit: 50000 })]);
  });
});

describe('Chứng từ đổi / huỷ', () => {
  it('huỷ chứng từ thì số liệu bán hàng bỏ chứng từ đó', async () => {
    await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: 'pos:CN01:HD0002', reason: 'Kiểm thử' });
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}`);
    expect(res.body.data.rows.some((r: any) => r.docNo === 'HD0002')).toBe(false);
  });
});

describe('Phiếu xuất điều chỉnh', () => {
  it('không tính vào báo cáo / tổng hợp bán hàng, xem ở danh sách riêng (sourceType export_adjust)', async () => {
    const before = (await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=day`)).body.data;
    const res = await call(ctx, 'POST', '/api/v1/documents', saleDoc({
      docKey: 'btsoft:1:export-adjust:9001', docNo: 'XSD-9001', docDate: '2026-10-08', invoice: undefined, internalOnly: true,
      partner: undefined, payments: [],
      sourceRef: { type: 'export_adjust', id: '9001', label: 'Phiếu xuất điều chỉnh' },
      extra: { exportAdjust: true },
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 50000, taxCode: 'R08', taxAmount: 4000 }],
      totals: { beforeTax: 50000, tax: 4000, total: 54000 },
    }));
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    const after = (await call(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=day`)).body.data;
    expect(before.totals.saleDocs).toBeGreaterThan(0);
    expect(after.totals).toEqual(before.totals);
    const detail = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}`);
    expect(detail.body.data.rows.some((r: any) => r.docNo === 'XSD-9001')).toBe(false);
    const list = await call(ctx, 'GET', `/api/v1/documents?from=2026-10-01&to=2026-10-31&docType=sale&sourceType=export_adjust&voucherInfo=true`);
    expect(list.body.data.map((d: any) => d.docNo)).toEqual(['XSD-9001']);
    const sales = await call(ctx, 'GET', `/api/v1/documents?from=2026-10-01&to=2026-10-31&docType=sale&sourceType=!export_adjust`);
    expect(sales.body.data.some((d: any) => d.docNo === 'XSD-9001')).toBe(false);
    expect(sales.body.data.some((d: any) => d.docNo === 'HD0001')).toBe(true);
  });
});

describe('Tổng hợp công nợ', () => {
  it('mỗi đối tượng một dòng, tổng khớp tài khoản 131 trên cân đối', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/partner-balances?account=131&${RANGE}`);
    expect(res.status).toBe(200);
    const tb = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${RANGE}`);
    const a131 = tb.body.data.rows.find((r: any) => r.code === '131');
    expect(res.body.data.totals.debit).toBe(a131.debit);
    expect(res.body.data.totals.credit).toBe(a131.credit);
    expect(res.body.data.totals.closingDebit).toBe(a131.closingDebit);
    expect(res.body.data.totals.closingCredit).toBe(a131.closingCredit);
  });
});
