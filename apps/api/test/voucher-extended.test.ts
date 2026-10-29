/**
 * Kiểm thử phần mở rộng phiếu nhập: khoản mục / bộ phận, thuế và hoá đơn trên dòng,
 * báo cáo thuế vào, chi phí theo khoản mục, tuổi nợ, kiểm tra chứng từ – hoá đơn.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';
const payment = (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({ docType: 'payment', branchCode: 'CN01', docDate: '2026-10-12', description: 'Chi phí văn phòng', counterparty: 'Công ty Văn phòng phẩm', lines, ...over });

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Danh mục khoản mục, bộ phận', () => {
  it('chưa khai danh mục thì phiếu chưa bắt buộc bộ phận', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', payment([{ debitAccount: '64211', creditAccount: '1111', amount: 1000 }]));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('thêm khoản mục (có cha), bộ phận; cha không tồn tại bị từ chối', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/VPP', { name: 'Văn phòng phẩm', parentCode: 'KHONG-CO' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/CPVP', { name: 'Chi phí văn phòng' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/VPP', { name: 'Văn phòng phẩm', parentCode: 'CPVP' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/department/KT', { name: 'Phòng kế toán' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/department/KD', { name: 'Phòng kinh doanh' })).status).toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/dimensions/cost_item');
    expect(list.body.data.map((d: any) => d.code)).toEqual(['CPVP', 'VPP']);
  });

  it('đã khai bộ phận thì tài khoản theo dõi bộ phận bắt buộc chọn; mã lạ bị từ chối', async () => {
    const missing = await call(ctx, 'POST', '/api/v1/vouchers', payment([{ debitAccount: '64211', creditAccount: '1111', amount: 1000 }]));
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.join(' ')).toMatch(/bắt buộc phải chọn bộ phận/);
    const unknown = await call(ctx, 'POST', '/api/v1/vouchers', payment([{ debitAccount: '64211', creditAccount: '1111', amount: 1000, department: 'XX' }]));
    expect(unknown.status).toBe(400);
  });
});

describe('Thuế và hoá đơn trên dòng phiếu chi', () => {
  it('dòng có thuế sinh thêm cặp thuế 133; tổng phiếu gồm thuế', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', payment([
      { debitAccount: '64211', creditAccount: '1111', amount: 500000, costItem: 'VPP', department: 'KT', taxCode: 'V10', taxAmount: 50000, invoiceNo: '0000456', invoiceSerial: '1C26TVP', invoiceDate: '2026-10-11', invoicePartnerName: 'Công ty Văn phòng phẩm', invoicePartnerTaxCode: '0101234567' },
      { debitAccount: '64211', creditAccount: '1111', amount: 200000, costItem: 'VPP', department: 'KD' },
    ]));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const doc = await call(ctx, 'GET', `/api/v1/documents/${res.body.data.id}`);
    expect(doc.body.data.total).toBe(750000);
    const lines = doc.body.data.entries[0].lines;
    expect(lines.find((l: any) => l.accountCode === '1331')).toMatchObject({ debit: 50000, part: 'tax', taxCode: 'V10' });
    expect(lines.filter((l: any) => l.accountCode === '1111').reduce((s: number, l: any) => s + l.credit, 0)).toBe(750000);
  });

  it('có tiền thuế mà chưa chọn loại thuế thì từ chối', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', payment([{ debitAccount: '64211', creditAccount: '1111', amount: 1000, department: 'KT', taxAmount: 100 }]));
    expect(res.status).toBe(400);
    expect(res.body.error.details.join(' ')).toMatch(/chưa chọn loại thuế/);
  });

  it('báo cáo thuế vào liệt kê hoá đơn; tổng hợp thuế có thuế đầu vào', async () => {
    const inp = await call(ctx, 'GET', `/api/v1/reports/sales-invoices?direction=input&${OCT}`);
    expect(inp.status).toBe(200);
    expect(inp.body.data.totals).toMatchObject({ invoices: 1, amount: 500000, tax: 50000 });
    expect(inp.body.data.groups[0].rows[0]).toMatchObject({ invoiceNo: '0000456', invoiceSerial: '1C26TVP', buyerName: 'Công ty Văn phòng phẩm', buyerTaxCode: '0101234567' });
    const out = await call(ctx, 'GET', `/api/v1/reports/sales-invoices?${OCT}`);
    expect(out.body.data.totals.invoices).toBe(0); // hoá đơn mua vào không lẫn sang bảng kê bán ra
    const sum = await call(ctx, 'GET', `/api/v1/reports/tax-summary?${OCT}`);
    expect(sum.body.data.totals.inputTax).toBe(50000);
  });
});

describe('Chi phí theo khoản mục, bộ phận', () => {
  it('gom theo bộ phận và theo khoản mục; dòng chưa gắn mã vào nhóm rỗng', async () => {
    const byDep = await call(ctx, 'GET', `/api/v1/reports/expense-by-dimension?${OCT}&account=642&groupBy=department`);
    expect(byDep.status).toBe(200);
    const dep = (code: string) => byDep.body.data.rows.find((r: any) => r.department === code)?.amount;
    expect(dep('KT')).toBe(500000);
    expect(dep('KD')).toBe(200000);
    expect(dep('')).toBe(1000); // phiếu lập trước khi khai danh mục
    expect(byDep.body.data.total).toBe(701000);
    expect(byDep.body.data.rows.find((r: any) => r.department === 'KT').departmentName).toBe('Phòng kế toán');
    const byItem = await call(ctx, 'GET', `/api/v1/reports/expense-by-dimension?${OCT}&account=642&groupBy=costItem,account`);
    expect(byItem.body.data.rows.find((r: any) => r.costItem === 'VPP')).toMatchObject({ amount: 700000, accountCode: '64211', costItemName: 'Văn phòng phẩm' });
  });
});

describe('Công nợ theo tuổi nợ', () => {
  it('phần còn nợ thuộc các khoản phát sinh gần nhất, xếp theo tuổi', async () => {
    const debt = (docNo: string, date: string, amount: number) => saleDoc({
      docKey: `pos:CN01:${docNo}`, docNo, docDate: date, invoice: undefined, partner: { code: 'KH-NO', name: 'Khách nợ' },
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa', unit: 'Hộp', qty: 1, amountBeforeTax: amount, taxCode: 'KCT', taxAmount: 0 }],
      payments: [{ methodCode: 'CONGNO', amount }], totals: { beforeTax: amount, tax: 0, total: amount },
    });
    // Nợ 300.000 ngày 01/08 (cũ), 200.000 ngày 20/10 (mới); trả 250.000 ngày 22/10 → còn nợ 250.000.
    expect((await call(ctx, 'POST', '/api/v1/documents', debt('N1', '2026-08-01', 300000))).body.data.status).toBe('posted');
    expect((await call(ctx, 'POST', '/api/v1/documents', debt('N2', '2026-10-20', 200000))).body.data.status).toBe('posted');
    const pay = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-22', description: 'Thu nợ', partnerCode: 'KH-NO', lines: [{ debitAccount: '1111', creditAccount: '1311', amount: 250000 }] });
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);

    const res = await call(ctx, 'GET', '/api/v1/reports/aging?asOf=2026-10-31&account=131&step=30');
    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r: any) => r.partnerCode === 'KH-NO');
    // 200.000 thuộc khoản 20/10 (11 ngày tuổi → khoảng 1), 50.000 thuộc khoản 01/08 (91 ngày tuổi → khoảng 4).
    expect(row.balance).toBe(250000);
    expect(row.buckets).toEqual([200000, 0, 0, 50000, 0]);
    expect(res.body.data.bucketLabels[0]).toBe('1 – 30 ngày');
    const bal = await call(ctx, 'GET', `/api/v1/reports/partner-balances?account=131&from=2026-08-01&to=2026-10-31`);
    expect(res.body.data.totals.balance).toBe(bal.body.data.totals.closingDebit);
  });
});

describe('Kiểm tra chứng từ, hoá đơn', () => {
  it('chỉ ra phiếu bán chưa có hoá đơn, số hoá đơn trùng và nhảy số', async () => {
    const inv = (docNo: string, no: string) => saleDoc({ docKey: `pos:CN01:${docNo}`, docNo, docDate: '2026-10-15', invoice: { no, serial: 'C26TAA', form: '1', date: '2026-10-15' } });
    for (const [d, n] of [['H1', '0000101'], ['H2', '0000102'], ['H3', '0000102'], ['H4', '0000105']] as const) {
      expect((await call(ctx, 'POST', '/api/v1/documents', inv(d, n))).body.data.status).toBe('posted');
    }
    const res = await call(ctx, 'GET', `/api/v1/reports/document-checks?${OCT}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.noInvoice.count).toBe(1); // phiếu N2 (20/10) bán ghi nợ không hoá đơn; N1 ngoài kỳ
    expect(d.duplicateInvoices.rows).toEqual([expect.objectContaining({ invoiceSerial: 'C26TAA', invoiceNo: '0000102', times: 2 })]);
    expect(d.invoiceGaps.rows).toEqual([expect.objectContaining({ invoiceSerial: 'C26TAA', missing: 2, sample: '103–104' })]);
    expect(d.errors.count).toBe(0);
  });

  it('báo cáo bán hàng chi tiết có ký hiệu và thuế suất', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-detail?${OCT}&search=H1`);
    expect(res.body.data.rows[0]).toMatchObject({ invoiceNo: '0000101', invoiceSerial: 'C26TAA', invoiceForm: '1', taxRate: 8 });
  });
});
