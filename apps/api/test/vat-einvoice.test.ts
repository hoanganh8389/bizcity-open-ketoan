/**
 * Thuế GTGT và hoá đơn (PHASE-020 S020-11; rulepack C03 vat-vn, C04 einvoice-vn — nháp):
 *   - VAT_REDUCED_RATE: dòng bán ra dùng loại thuế 8% ngoài thời gian giảm (tham số ca của rulepack) ⇒ cảnh báo; trong thời gian giảm thì không;
 *   - VAT_INPUT_NONCASH: hoá đơn mua vào ≥ 5 triệu (gồm thuế) chưa ghi chứng từ thanh toán không dùng tiền mặt ⇒ cảnh báo (dùng lại taxIssues);
 *   - INVOICE_FIELDS: hoá đơn thiếu ký hiệu ⇒ cảnh báo (dùng lại taxIssues);
 *   - INVOICE_ISSUE_DATE: hoá đơn bán hàng hoá lập sau ngày chứng từ ⇒ cảnh báo;
 *   - Engine: ca C03 / C04 lấy bằng chứng từ bốn kiểm; duyệt tại đơn vị miền thuế cần người duyệt thuế (ADR-0016).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const post = async (doc: unknown) => {
  const r = await call(ctx, 'POST', '/api/v1/documents', doc);
  expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
};
const sale = (key: string, date: string, invoice?: Record<string, string>) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  partner: { code: '0912345678', name: 'Khách A' },
  ...(invoice ? { invoice } : {}),
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
  payments: [{ methodCode: 'TM', amount: 108000 }],
  totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});
const purchase = (key: string, date: string, amount: number) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  partner: { code: 'NCC-01', name: 'Công ty Cung Cấp', taxCode: '0101234567' },
  invoice: { no: '0000777', serial: 'C26TAA', form: '1', date },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 100, amountBeforeTax: amount, taxCode: 'V08', taxAmount: amount * 0.08 }],
  totals: { beforeTax: amount, tax: amount * 0.08, total: amount * 1.08 },
});
const diag = async (code: string, scope: { from?: string; to?: string } = {}) =>
  (await runDiagnostics({ tenantId, ...scope }, { layer: 'L3', codes: [code] })).checks[0]!;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Thuế GTGT (C03)', () => {
  it('VAT_REDUCED_RATE: 8% trong thời gian giảm không báo; 8% sau thời gian giảm báo khoá chứng từ', async () => {
    await post(sale('BAN-T03', '2026-03-05'));
    expect(await diag('VAT_REDUCED_RATE', { from: '2026-03-01', to: '2026-03-31' })).toMatchObject({ level: 'pass', count: 0 });
    await post(sale('BAN-T27', '2027-01-05'));
    const d = await diag('VAT_REDUCED_RATE');
    expect(d).toMatchObject({ level: 'warn', count: 1 });
    expect(d.sample[0]).toContain('BAN-T27');
  });

  it('VAT_INPUT_NONCASH: hoá đơn mua vào ≥ 5 triệu chưa ghi chứng từ thanh toán ⇒ cảnh báo (cùng luật màn ACC78)', async () => {
    await post(purchase('NHAP-LON', '2026-03-06', 10_000_000));
    await post(purchase('NHAP-NHO', '2026-03-07', 1_000_000));
    const d = await diag('VAT_INPUT_NONCASH', { from: '2026-03-01', to: '2026-03-31' });
    expect(d).toMatchObject({ level: 'warn', count: 1, sample: ['NHAP-LON'] });
  });
});

describe('Hoá đơn (C04)', () => {
  it('INVOICE_FIELDS: hoá đơn bán ra thiếu ký hiệu ⇒ cảnh báo kèm điểm thiếu', async () => {
    await post(sale('BAN-HD1', '2026-04-02', { no: '0000101', date: '2026-04-02' }));
    const d = await diag('INVOICE_FIELDS', { from: '2026-04-01', to: '2026-04-30' });
    expect(d).toMatchObject({ level: 'warn', count: 1 });
    expect(d.sample[0]).toBe('BAN-HD1: Thiếu ký hiệu hoá đơn');
  });

  it('INVOICE_ISSUE_DATE: hoá đơn lập sau ngày giao hàng ⇒ cảnh báo; cùng ngày thì không', async () => {
    await post(sale('BAN-HD2', '2026-05-04', { no: '0000102', serial: 'C26TAA', form: '1', date: '2026-05-04' }));
    expect(await diag('INVOICE_ISSUE_DATE', { from: '2026-05-01', to: '2026-05-31' })).toMatchObject({ level: 'pass', count: 0 });
    await post(sale('BAN-HD3', '2026-05-05', { no: '0000103', serial: 'C26TAA', form: '1', date: '2026-05-09' }));
    const d = await diag('INVOICE_ISSUE_DATE', { from: '2026-05-01', to: '2026-05-31' });
    expect(d).toMatchObject({ level: 'warn', count: 1 });
    expect(d.sample[0]).toContain('BAN-HD3');
  });
});

describe('Engine: rulepack vat-vn / einvoice-vn', () => {
  it('ca C03 / C04 có bằng chứng từ bốn kiểm; duyệt tại đơn vị miền thuế cần người duyệt thuế; duyệt xong ca mang cơ sở duyệt local', async () => {
    expect((await call(ctx, 'POST', '/api/v1/accounting/profile/publish', { effectiveFrom: '2026-01-01', fiscalYearStartMonth: 1, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Khai hồ sơ cho C03 / C04' })).status).toBe(201);
    let r = (await call(ctx, 'POST', '/api/v1/conformance/runs', { asOf: '2026-11-02' })).body.data as { cases: { id: string; status: string; evidence: string[]; approval?: string | null }[] };
    const rate = () => r.cases.find((c) => c.id === 'vn.vat-vn.rate.reduced_window.001')!;
    expect(rate().evidence.join(' ')).toMatch(/DG-VAT-1: có phát hiện/);
    // Phạm vi đã rõ + bằng chứng có phát hiện ⇒ FAIL ngay cả khi chưa duyệt (luật sẵn có của bộ đánh giá); chưa có cơ sở duyệt.
    expect(rate()).toMatchObject({ status: 'FAIL', approval: null });
    for (const id of ['vn.vat-vn.input.non_cash_payment.002', 'vn.einvoice-vn.book.required_fields.001', 'vn.einvoice-vn.output.issue_time.002']) expect(r.cases.find((c) => c.id === id)).toBeTruthy();

    const approve = (body: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/conformance/rulepacks/approve', { rulepackId: 'vat-vn', accountingReviewer: 'Nguyễn Văn A', note: 'Đã rà 2 ca thuế GTGT phạm vi hẹp', ...body });
    expect((await approve({})).status).toBe(400); // miền thuế: thiếu người duyệt thuế
    expect((await approve({ taxReviewer: 'Trần Thị B — đại lý thuế' })).status).toBe(200);
    r = (await call(ctx, 'POST', '/api/v1/conformance/runs', { asOf: '2026-11-02' })).body.data;
    expect(rate()).toMatchObject({ status: 'FAIL', approval: 'local' });
  });
});
