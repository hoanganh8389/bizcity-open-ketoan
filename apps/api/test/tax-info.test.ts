/**
 * Bổ sung thông tin thuế (ACC78):
 *   - nhập mua chưa có hoá đơn → bổ sung số, ngày hoá đơn → chờ định khoản lại (ACC14) → định khoản lại thì vào sổ hoá đơn,
 *     bảng kê, tờ khai;
 *   - chọn kỳ kê khai tháng sau → hoá đơn chuyển sang tờ khai tháng sau;
 *   - đánh dấu không được khấu trừ → [25] = [24] trừ thuế hoá đơn đó;
 *   - hệ thống nguồn gửi bản mới → phần bổ sung vẫn giữ; bỏ phần bổ sung → trở về như gốc.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { taxIssues } from '../src/modules/tax-info/tax-info.service.js';

let ctx: TestCtx;
let tenantId: string;
let eventId: string;

const purchase = (version: number, extra: Record<string, unknown> = {}) => ({
  docType: 'purchase', docKey: 'TI-NM-01', version, branchCode: 'CN01', docNo: 'NM-01', docDate: '2026-10-03',
  partner: { code: 'NCC-TI', name: 'Công ty Sữa A' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 10, amountBeforeTax: 6000000, taxCode: 'V08', taxAmount: 480000 }],
  payments: [],
  totals: { beforeTax: 6000000, tax: 480000, total: 6480000 },
  ...extra,
});

async function invoiceCount() {
  const r = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM tax_invoices WHERE event_id = ${eventId}`.execute(db);
  return Number(r.rows[0]!.n);
}
const status = async () => (await db.selectFrom('accounting_events').select('status').where('id', '=', eventId).executeTakeFirstOrThrow()).status;
const repost = () => call(ctx, 'POST', '/api/v1/documents/post', { ids: [eventId] });
const vat = async (period: number) => (await call(ctx, 'GET', `/api/v1/vat-returns/build?periodKind=month&year=2026&period=${period}`)).body.data;
const list = async (show = 'all') => (await call(ctx, 'GET', `/api/v1/tax-info?from=2026-10-01&to=2026-11-30&direction=input&show=${show}`)).body.data;
const save = (body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/tax-info/${eventId}`, { invoice: {}, declareMonth: '', deductible: true, paymentRef: '', note: '', ...body });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const r = await call(ctx, 'POST', '/api/v1/documents', purchase(1));
  expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  eventId = (await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', 'TI-NM-01').executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Điểm cần bổ sung', () => {
  it('nhận ra các trường hợp thiếu', () => {
    const base = { direction: 'input' as const, hasInvoice: true, serial: 'C26TAA', name: 'A', taxCode: '0101234567', total: 1000, deductible: true, paymentRef: '', sign: 1, invoiceDate: '2026-10-01', declareDate: null };
    expect(taxIssues(base)).toEqual([]);
    expect(taxIssues({ ...base, hasInvoice: false })).toEqual(['Chưa có hoá đơn']);
    expect(taxIssues({ ...base, serial: '', taxCode: '12345' })).toEqual(['Thiếu ký hiệu hoá đơn', 'Mã số thuế không đúng dạng']);
    expect(taxIssues({ ...base, taxCode: '0101234567-001' })).toEqual([]);
    expect(taxIssues({ ...base, total: 6_000_000 })).toEqual(['Từ 5 triệu: chưa ghi chứng từ thanh toán không dùng tiền mặt']);
    expect(taxIssues({ ...base, total: 6_000_000, deductible: false })).toEqual([]);
  });
});

describe('Bổ sung hoá đơn về muộn', () => {
  it('chưa có hoá đơn: chưa có trong sổ hoá đơn, danh sách báo "Chưa có hoá đơn"', async () => {
    expect(await invoiceCount()).toBe(0);
    const d = await list('issues');
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ docNo: 'NM-01', hasInvoice: false, issues: ['Chưa có hoá đơn'] });
  });

  it('thiếu ngày hoá đơn thì báo lỗi', async () => {
    const r = await save({ invoice: { no: '0000123' } });
    expect(r.status).toBe(400);
  });

  it('bổ sung số, ngày → chờ định khoản lại; định khoản lại thì vào sổ hoá đơn và tờ khai tháng 10', async () => {
    const r = await save({ invoice: { no: '0000123', serial: 'C26TAA', date: '2026-10-02', buyerName: 'Công ty Sữa A', buyerTaxCode: '0101234567' } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.pendingRepost).toBe(true);
    expect(await status()).toBe('pending');
    expect(await invoiceCount()).toBe(0);
    const p = await repost();
    expect(p.body.data.posted, JSON.stringify(p.body)).toBe(1);
    expect(await status()).toBe('posted');
    expect(await invoiceCount()).toBe(1);
    const v = await vat(10);
    expect(v.values['24']).toBe(480000);
    expect(v.values['25']).toBe(480000);
    const d = await list('all');
    expect(d.rows[0]).toMatchObject({ hasInvoice: true, invoiceNo: '0000123', serial: 'C26TAA', taxCode: '0101234567', issues: ['Từ 5 triệu: chưa ghi chứng từ thanh toán không dùng tiền mặt'] });
  });

  it('kỳ kê khai tháng 11: hoá đơn rời tờ khai tháng 10 sang tháng 11', async () => {
    const r = await save({ invoice: { no: '0000123', serial: 'C26TAA', date: '2026-10-02', buyerName: 'Công ty Sữa A', buyerTaxCode: '0101234567' }, declareMonth: '2026-11', paymentRef: 'UNC 15 ngày 05/10/2026' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.pendingRepost).toBe(false);
    expect((await vat(10)).values['24']).toBe(0);
    expect((await vat(11)).values['24']).toBe(480000);
    expect((await list('issues')).rows).toHaveLength(0);
  });

  it('kỳ kê khai trước tháng hoá đơn bị từ chối', async () => {
    const r = await save({ invoice: { no: '0000123', date: '2026-10-02' }, declareMonth: '2026-09' });
    expect(r.status).toBe(400);
  });

  it('không được khấu trừ: [24] giữ nguyên, [25] trừ phần thuế đó', async () => {
    const r = await save({ invoice: { no: '0000123', serial: 'C26TAA', date: '2026-10-02', buyerName: 'Công ty Sữa A', buyerTaxCode: '0101234567' }, declareMonth: '2026-11', deductible: false });
    expect(r.status).toBe(200);
    const v = await vat(11);
    expect(v.values['24']).toBe(480000);
    expect(v.values['25']).toBe(0);
  });

  it('nguồn gửi bản mới (vẫn chưa có hoá đơn): phần bổ sung vẫn giữ', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', purchase(2, { description: 'Nhập mua (sửa ghi chú)' }));
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    expect(await invoiceCount()).toBe(1);
    const v = await vat(11);
    expect(v.values['24']).toBe(480000);
    expect(v.values['25']).toBe(0);
  });

  it('bỏ phần bổ sung: chờ định khoản lại; định khoản lại thì rời sổ hoá đơn, tờ khai', async () => {
    const r = await call(ctx, 'DELETE', `/api/v1/tax-info/${eventId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await status()).toBe('pending');
    const rp = (await repost()).body.data;
    expect(rp.posted + rp.unchanged).toBe(1);
    expect(await invoiceCount()).toBe(0);
    expect((await vat(11)).values['24']).toBe(0);
    expect((await list('patched')).rows).toHaveLength(0);
  });
});
