/**
 * Hoá đơn từ cơ quan thuế (KT-29), cảnh báo hoá đơn rủi ro (KT-28).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { invoiceKey, taxCodeProblem, authorityStatusOf } from '@ketoan/contracts';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const SELLER = '0300588569';
const purchase = (no: string, date: string, amount: number, tax: number) => ({
  docType: 'purchase', docKey: `kho:CN01:NM${no}`, branchCode: 'CN01', docNo: `NM${no}`, docDate: date,
  partner: { code: 'NCC-VNM', name: 'Công ty Sữa ABC', taxCode: SELLER },
  invoice: { no, serial: 'C26TAB', form: '1', date },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: amount, taxCode: 'V08', taxAmount: tax }],
  totals: { beforeTax: amount, tax, total: amount + tax },
});
const portal = (no: string, date: string, totalBeforeTax: number, totalTax: number, extra: Record<string, unknown> = {}) => ({
  sellerTaxCode: SELLER, sellerName: 'CÔNG TY SỮA ABC', invoiceForm: '1', invoiceSerial: '1C26TAB', invoiceNo: no, invoiceDate: date, totalBeforeTax, totalTax, statusText: 'Hóa đơn mới', checkResult: 'Đã cấp mã hóa đơn', ...extra,
});

beforeAll(async () => {
  ctx = await setupTenant();
  for (const d of [purchase('0004567', '2026-10-03', 700000, 56000), purchase('0004568', '2026-10-05', 300000, 24000), purchase('0004570', '2026-10-06', 100000, 8000)]) {
    const r = await call(ctx, 'POST', '/api/v1/documents', d);
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Hàm dùng chung', () => {
  it('chuẩn hoá ký hiệu, số hoá đơn; kiểm tra mã số thuế; trạng thái trên cổng', () => {
    expect(invoiceKey('1C26TAB', '0004567')).toBe('C26TAB|4567');
    expect(invoiceKey('C26TNH', 'C26TNH55607')).toBe('C26TNH|55607');
    expect(invoiceKey('K23TXM', 'K26TXM2588')).toBe('K26TXM|2588');
    expect(taxCodeProblem('0106933743')).toBeNull();
    expect(taxCodeProblem('0300588569-001')).toBeNull();
    expect(taxCodeProblem('0101234567')).toContain('chữ số kiểm tra');
    expect(taxCodeProblem('12345')).toContain('không đúng dạng');
    expect(authorityStatusOf('Hóa đơn đã bị thay thế')).toBe('replaced');
    expect(authorityStatusOf('Hóa đơn đã bị xóa bỏ')).toBe('cancelled');
    expect(authorityStatusOf('Hóa đơn thay thế')).toBe('valid');
  });
});

describe('Hoá đơn từ cơ quan thuế', () => {
  it('nhập, đối chiếu với sổ hoá đơn, chuyển hoá đơn chưa có trong sổ thành chứng từ nguồn', async () => {
    const invoices = [
      portal('4567', '2026-10-03', 700000, 56000),
      portal('4568', '2026-10-05', 310000, 24800),
      portal('4569', '2026-10-07', 500000, 40000),
      portal('4570', '2026-10-06', 100000, 8000, { statusText: 'Hóa đơn đã bị xóa bỏ' }),
      { ...portal('99', '2026-10-08', 200000, 16000), sellerTaxCode: '0101234567', sellerName: 'Công ty lạ', invoiceSerial: 'C26TXX' },
    ];
    const imp = await call(ctx, 'PUT', '/api/v1/authority-invoices', { direction: 'input', source: 'excel', fileName: 'mua-vao-10.xlsx', invoices });
    expect(imp.status, JSON.stringify(imp.body)).toBe(200);
    expect(imp.body.data).toEqual({ received: 5, inserted: 5, updated: 0 });
    expect((await call(ctx, 'PUT', '/api/v1/authority-invoices', { direction: 'input', source: 'xml', invoices: [invoices[0]] })).body.data).toEqual({ received: 1, inserted: 0, updated: 1 });

    const rec = (await call(ctx, 'GET', '/api/v1/authority-invoices/reconcile?direction=input&from=2026-10-01&to=2026-10-31')).body.data;
    expect(rec.summary).toEqual({ portal: 5, books: 3, matched: 1, amountMismatch: 1, statusMismatch: 1, missingInBooks: 2, missingOnPortal: 0 });
    const byNo = Object.fromEntries(rec.rows.map((r: { portal: { no: string }; kind: string }) => [r.portal.no, r]));
    expect(byNo['4568'].book).toMatchObject({ beforeTax: 300000, tax: 24000, docNo: 'NM0004568' });

    const id = byNo['4569'].portal.id;
    const ref = await call(ctx, 'POST', '/api/v1/authority-invoices/to-reference', { ids: [id], branchCode: 'CN01' });
    expect(ref.body.data).toEqual({ created: 1 });
    expect((await call(ctx, 'POST', '/api/v1/authority-invoices/to-reference', { ids: [id], branchCode: 'CN01' })).body.data).toEqual({ created: 0 });
    const docs = (await call(ctx, 'GET', '/api/v1/reference-documents?kind=purchase_invoice')).body.data;
    expect(docs).toEqual([expect.objectContaining({ docNo: 'C26TAB-4569', partnerCode: 'NCC-VNM', total: 540000, status: 'open' })]);
  });

  it('cảnh báo hoá đơn rủi ro: người bán trong danh sách rủi ro, MST sai, trên cổng đã huỷ, lệch tiền', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/risky-taxpayers', { items: [{ taxCode: SELLER, name: 'Công ty Sữa ABC', risk: 'absconded', effectiveDate: '2026-10-04', source: 'Thông báo Cục thuế' }] })).status).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/risky-taxpayers')).body.data[0]).toMatchObject({ taxCode: SELLER, risk: 'absconded', effectiveDate: '2026-10-04' });
    const risks = (await call(ctx, 'GET', '/api/v1/invoice-risks?from=2026-10-01&to=2026-10-31')).body.data;
    const codes = Object.fromEntries(risks.rows.map((r: { no: string; reasons: { code: string }[] }) => [r.no, r.reasons.map((x) => x.code).sort()]));
    // 4567 lập trước ngày rủi ro, khớp cổng: không cảnh báo.
    expect(codes['4567']).toBeUndefined();
    expect(codes['4568']).toEqual(['amount', 'risky_seller']);
    expect(codes['4570']).toEqual(['portal_status', 'risky_seller']);
    expect(codes['4569']).toEqual(['not_in_books', 'risky_seller']);
    expect(codes['99']).toEqual(['bad_tax_code', 'not_in_books']);
    expect(risks.byReason.risky_seller).toBe(3);

    const del = await call(ctx, 'DELETE', '/api/v1/authority-invoices?direction=input&from=2026-10-01&to=2026-10-31');
    expect(del.body.data.deleted).toBe(5);
  });
});
