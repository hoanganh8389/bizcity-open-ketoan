// [2026-11-19 12:05 PM khanhtd] NT-DM-011 — test đổi MST đối tượng theo ngày hiệu lực đã qua (0168), lịch sử phiên bản, cảnh báo PART-HINT-005, phép kiểm PARTNER_TAX_MISMATCH
/**
 * Đối tác báo đổi MST trễ: kế toán ghi "MST mới có hiệu lực từ 01/10" vào ngày 19/11.
 *   - phiên bản mới của entity_attributes bắt đầu đúng ngày đã chọn, bản cũ đóng ở ngày đó (0168);
 *   - hoá đơn đã nhận KHÔNG đổi; hoá đơn từ 01/10 còn mang MST cũ được liệt kê (route attributes, PART-HINT-005, HT08);
 *   - ngày sau hôm nay / không sau phiên bản đang dùng → báo lỗi, không ghi;
 *   - không gửi ngày → như 0087 (từ hôm nay); MST cũ của đối tượng khác không gán được cho đối tượng mới.
 * Dữ liệu trong test là dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '@bizcity/platform/system/diagnostics';
import '../src/modules/partners/partner-attributes.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const OLD = '0101234567';
const NEW = '0109876543';
const CODE = 'NCC-MST';

const purchase = (key: string, date: string, invoiceNo: string) => ({
  docType: 'purchase', docKey: key, version: 1, branchCode: 'CN01', docNo: key, docDate: date,
  partner: { code: CODE, name: 'Công ty Giả A' },
  invoice: { no: invoiceNo, serial: 'C26TMS', form: '1', date, buyerName: 'Công ty Giả A', buyerTaxCode: OLD },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'V08', taxAmount: 8000 }],
  payments: [],
  totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});
const today = async () => (await sql<{ d: string }>`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
const body = (extra: Record<string, unknown>) => ({ name: 'Công ty Giả A', kind: 'supplier', taxCode: OLD, address: 'Số 1 phố Giả', ...extra });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/partners', { code: CODE, ...body({}) })).status).toBe(201);
  for (const [key, date, no] of [['MS-01', '2026-09-20', '0000101'], ['MS-02', '2026-10-05', '0000102']] as const) {
    const r = await call(ctx, 'POST', '/api/v1/documents', purchase(key, date, no));
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Đổi MST theo ngày hiệu lực đã qua (NT-DM-011)', () => {
  it('khung Vì sao trước khi ghi: PART-HINT-005 đếm hoá đơn từ ngày hiệu lực còn MST cũ', async () => {
    const r = await call(ctx, 'POST', '/api/v1/partners/validate', { code: CODE, name: 'Công ty Giả A', kind: 'supplier', taxCode: NEW, validFrom: '2026-10-01' });
    expect(r.status).toBe(200);
    const f = (r.body.data.findings as { code: string; title: string }[]).find((x) => x.code === 'PART-HINT-005');
    expect(f?.title).toContain('Có 1 hoá đơn');
    expect(f?.title).toContain('01/10/2026');
  });

  it('ngày sau hôm nay → báo lỗi nhập liệu, không ghi', async () => {
    const r = await call(ctx, 'PUT', `/api/v1/partners/${CODE}`, body({ taxCode: NEW, validFrom: '2099-01-01' }));
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('không được sau hôm nay');
    expect((await call(ctx, 'GET', `/api/v1/partners/${CODE}/attributes`)).body.data.versions).toHaveLength(1);
  });

  it('ghi MST mới từ 01/10: phiên bản mới từ 01/10, bản cũ đóng 01/10; hoá đơn không đổi; cảnh báo khi ghi', async () => {
    const r = await call(ctx, 'PUT', `/api/v1/partners/${CODE}`, body({ taxCode: NEW, name: 'Công ty Giả A mới', validFrom: '2026-10-01', warnAck: { reason: 'Đối tác báo đổi MST trễ', codes: ['PART-HINT-005'] } }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((r.body.meta?.findings ?? []).map((x: { code: string }) => x.code)).toContain('PART-HINT-005');

    const a = (await call(ctx, 'GET', `/api/v1/partners/${CODE}/attributes`)).body.data;
    expect(a.versions).toHaveLength(2);
    expect(a.versions[0]).toMatchObject({ version: 2, validFrom: '2026-10-01', validTo: null, taxCode: NEW, name: 'Công ty Giả A mới', mismatched: 1 });
    expect(a.versions[1]).toMatchObject({ version: 1, validTo: '2026-10-01', taxCode: OLD, mismatched: 0 });
    expect(a.mismatches).toEqual([expect.objectContaining({ invoiceDate: '2026-10-05', invoiceNo: '0000102', taxCodeOnInvoice: OLD, taxCodeAtDate: NEW })]);

    // Hoá đơn đã nhận giữ nguyên MST in trên hoá đơn.
    const inv = await sql<{ t: string }>`SELECT buyer_tax_code AS t FROM tax_invoices WHERE tenant_id = ${tenantId} ORDER BY invoice_date`.execute(db);
    expect(inv.rows.map((x) => x.t)).toEqual([OLD, OLD]);
  });

  it('phép kiểm HT08 PARTNER_TAX_MISMATCH báo đúng hoá đơn 05/10', async () => {
    const r = await runDiagnostics({ tenantId }, { layer: 'L3', codes: ['PARTNER_TAX_MISMATCH'] });
    const c = r.checks.find((x: { code: string }) => x.code === 'PARTNER_TAX_MISMATCH');
    expect(c).toMatchObject({ count: 1, sample: [`${CODE}:0000102:05/10/2026`] });
  });

  it('ngày không sau phiên bản đang dùng → báo lỗi (ghi thay đổi cũ hơn trước)', async () => {
    const r = await call(ctx, 'PUT', `/api/v1/partners/${CODE}`, body({ taxCode: NEW, name: 'Công ty Giả A mới', address: 'Số 2 phố Giả', validFrom: '2026-09-15' }));
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('phải sau ngày bắt đầu của phiên bản đang dùng (01/10/2026)');
  });

  it('không gửi ngày → như cũ: phiên bản mới từ hôm nay', async () => {
    const r = await call(ctx, 'PUT', `/api/v1/partners/${CODE}`, body({ taxCode: NEW, name: 'Công ty Giả A mới', address: 'Số 2 phố Giả' }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const a = (await call(ctx, 'GET', `/api/v1/partners/${CODE}/attributes`)).body.data;
    expect(a.versions[0]).toMatchObject({ version: 3, validFrom: await today(), address: 'Số 2 phố Giả' });
  });

  it('MST cũ của đối tượng khác không gán được cho đối tượng mới', async () => {
    const r = await call(ctx, 'POST', '/api/v1/partners', { code: 'NCC-MST-2', name: 'Công ty Giả B', kind: 'supplier', taxCode: OLD });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toContain('MST cũ');
  });
});
