/**
 * Công nợ theo nhân viên (ACC48) và theo mặt hàng (ACC68). Kịch bản khách KH-A:
 *   10/09  bán S1 (NV01): A 216.000 + B 54.000 = 270.000, trả 70.000  → nợ 200.000 (A 160.000, B 40.000)
 *   05/10  thu P1 (NV02) 50.000                                        → trừ S1: A 40.000, B 10.000
 *   08/10  bán S2 (NV01): B 108.000, chưa trả                          → nợ thêm 108.000 (B)
 *   20/10  thu P2 (không ghi nhân viên) 300.000                        → hết S1 (A 120.000, B 30.000), hết S2, thừa 42.000
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { splitCents } from '../src/phan-he/ke-toan/reports/debt-reports.js';

let ctx: TestCtx;
const partner = { code: 'KH-A', name: 'Khách A' };

beforeAll(async () => {
  ctx = await setupTenant();
  const docs = [
    {
      docType: 'sale', docKey: 'CN-S1', branchCode: 'CN01', docNo: 'S1', docDate: '2026-09-10', partner, employee: { code: 'NV01', name: 'Nguyễn Bán Hàng' },
      lines: [
        { lineKey: 'l1', sku: 'A', name: 'Hàng A', unit: 'Hộp', qty: 2, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 },
        { lineKey: 'l2', sku: 'B', name: 'Hàng B', unit: 'Gói', qty: 1, amountBeforeTax: 50000, taxCode: 'R08', taxAmount: 4000 },
      ],
      payments: [{ methodCode: 'TM', amount: 70000 }],
      totals: { beforeTax: 250000, tax: 20000, total: 270000 },
    },
    { docType: 'customer_payment', docKey: 'CN-P1', branchCode: 'CN01', docNo: 'P1', docDate: '2026-10-05', partner, employee: { code: 'NV02', name: '' }, methodCode: 'TM', totals: { total: 50000 } },
    {
      docType: 'sale', docKey: 'CN-S2', branchCode: 'CN01', docNo: 'S2', docDate: '2026-10-08', partner, employee: { code: 'NV01', name: '' },
      lines: [{ lineKey: 'l1', sku: 'B', name: 'Hàng B', unit: 'Gói', qty: 2, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
      payments: [],
      totals: { beforeTax: 100000, tax: 8000, total: 108000 },
    },
    { docType: 'customer_payment', docKey: 'CN-P2', branchCode: 'CN01', docNo: 'P2', docDate: '2026-10-20', partner, methodCode: 'TM', totals: { total: 300000 } },
  ];
  for (const d of docs) {
    const r = await call(ctx, 'POST', '/api/v1/documents', d);
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Chia tiền theo tỷ trọng', () => {
  it('tổng các phần đúng bằng số chia', () => {
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(-100, [1, 1, 1]).reduce((s, x) => s + x, 0)).toBe(-100);
    expect(splitCents(1000, [216, 54])).toEqual([800, 200]);
  });
});

describe('Công nợ theo nhân viên', () => {
  it('nhân viên lập phiếu tự vào danh mục, giữ tên đã có khi gửi tên rỗng', async () => {
    const res = await call(ctx, 'GET', '/api/v1/dimensions/employee');
    expect(res.body.data.map((d: { code: string; name: string }) => [d.code, d.name])).toEqual([['NV01', 'Nguyễn Bán Hàng'], ['NV02', 'NV02']]);
  });

  it('gom số dư, phát sinh theo nhân viên ghi trên dòng sổ', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/debt-by-employee?from=2026-10-01&to=2026-10-31&account=131');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d.employees.map((e: { employeeCode: string; openingDebit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }) => [e.employeeCode, e.openingDebit, e.debit, e.credit, e.closingDebit, e.closingCredit])).toEqual([
      ['NV01', 200000, 108000, 0, 308000, 0],
      ['NV02', 0, 0, 50000, 0, 50000],
      ['', 0, 0, 300000, 0, 300000],
    ]);
    expect(d.rows[0]).toMatchObject({ employeeCode: 'NV01', employeeName: 'Nguyễn Bán Hàng', partnerCode: 'KH-A' });
    expect(d.totals).toMatchObject({ openingDebit: 200000, closingDebit: 0, closingCredit: 42000 });
  });

  it('lọc một nhân viên; chuỗi rỗng = dòng chưa gắn nhân viên', async () => {
    const one = await call(ctx, 'GET', '/api/v1/reports/debt-by-employee?from=2026-10-01&to=2026-10-31&employee=NV02');
    expect(one.body.data.rows).toHaveLength(1);
    expect(one.body.data.rows[0]).toMatchObject({ employeeCode: 'NV02', credit: 50000 });
    const none = await call(ctx, 'GET', '/api/v1/reports/debt-by-employee?from=2026-10-01&to=2026-10-31&employee=');
    expect(none.body.data.rows[0]).toMatchObject({ employeeCode: '', employeeName: '(chưa gắn nhân viên)', credit: 300000 });
  });
});

describe('Công nợ theo mặt hàng', () => {
  it('chia khoản nợ theo mặt hàng, trả nợ trừ khoản cũ nhất trước', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/debt-by-item?from=2026-10-01&to=2026-10-31&account=131');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    const pick = (r: { sku: string; itemName: string; opening: number; increase: number; decrease: number; closing: number }) => [r.sku || r.itemName, r.opening, r.increase, r.decrease, r.closing];
    expect(d.rows.map(pick)).toEqual([
      ['(Khách trả trước, trả thừa)', 0, 0, 42000, -42000],
      ['A', 160000, 0, 160000, 0],
      ['B', 40000, 108000, 148000, 0],
    ]);
    expect(d.totals).toEqual({ opening: 200000, increase: 108000, decrease: 350000, closing: -42000 });
  });

  it('cuối tháng 9: còn nợ đúng tỷ trọng tiền hàng của phiếu bán', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/debt-by-item?from=2026-09-01&to=2026-09-30&partnerCode=KH-A');
    expect(res.body.data.rows.map((r: { sku: string; increase: number; closing: number }) => [r.sku, r.increase, r.closing])).toEqual([['A', 160000, 160000], ['B', 40000, 40000]]);
  });

  it('khoản bán chịu sau khi đã trả thừa được trừ ngay vào tiền trả trước', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale', docKey: 'CN-S3', branchCode: 'CN01', docNo: 'S3', docDate: '2026-11-02', partner,
      lines: [{ lineKey: 'l1', sku: 'A', name: 'Hàng A', unit: 'Hộp', qty: 1, amountBeforeTax: 50000, taxCode: 'R08', taxAmount: 4000 }],
      payments: [], totals: { beforeTax: 50000, tax: 4000, total: 54000 },
    });
    expect(r.body.data.status).toBe('posted');
    const res = await call(ctx, 'GET', '/api/v1/reports/debt-by-item?from=2026-11-01&to=2026-11-30');
    const rows = res.body.data.rows.map((x: { sku: string; opening: number; increase: number; decrease: number; closing: number }) => [x.sku, x.opening, x.increase, x.decrease, x.closing]);
    expect(rows).toEqual([['', -42000, 42000, 0, 0], ['A', 0, 54000, 42000, 12000]]);
  });
});
