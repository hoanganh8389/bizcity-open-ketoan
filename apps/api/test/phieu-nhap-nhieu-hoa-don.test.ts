// [2026-11-21 Nguyễn Văn Thủy] Phiếu nhập nhiều hoá đơn + đơn giao nhiều chi nhánh (docs/nghiep-vu/27) — qua API thật (đóng góp)
/**
 * 1. Phiếu nhập 10 Thùng, 2 hoá đơn ở MH22 (6 + 4 Thùng): khớp SL → duyệt được, ghi sổ tách 2 chứng từ kế toán, mỗi chứng từ một hoá đơn
 *    (2 dòng tax_invoices đúng số hoá đơn, tổng tiền bằng phiếu).
 * 2. Hoá đơn chỉ 9 Thùng → lệch SL thực nhận ↔ hoá đơn: chặn duyệt (inv_qty_diff), Duyệt ngoại lệ được.
 * 3. Hoá đơn thứ hai chưa có ở MH22 → chặn (inv_split_unknown), không cho duyệt ngoại lệ.
 * 4. Đơn giao 2 chi nhánh cùng mã: phiếu nhập chi nhánh B đối chiếu phần của B (nhận vượt phần B thì báo, không lấy phần A bù).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let tid: string;
type Check = { code: string; level: string; text: string; blocking?: boolean };
const NCC = 'NCC-NHD';
const SKU = 'NHD-A';
const U = [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24, isPurchaseDefault: true }];
const hd = (no: string, thung: number) => ({
  partnerCode: NCC, form: '1', series: 'C26TNH', no, date: '2026-11-10', sellerTaxCode: '0109999999', totalBeforeTax: thung * 100_000, totalTax: thung * 8_000, total: thung * 108_000, source: 'excel',
  lines: [{ nccSku: 'A', nccName: 'Hang A', nccUnit: 'THUNG', qty: thung, price: 100_000, amount: thung * 100_000, taxRate: 8, taxAmount: thung * 8_000, sku: SKU, unit: 'Thùng', matchSource: 'manual' }],
});
const phieu = (invoices: { no: string }[], qty = 10, extra: Record<string, unknown> = {}) => ({
  kind: 'receipt', outsideOrder: { reason: 'Phép thử nhiều hoá đơn' }, docDate: '2026-11-10', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false,
  invoices: invoices.map((i) => ({ no: i.no, serial: 'C26TNH', date: '2026-11-10' })),
  lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty, price: 100_000, taxCode: 'V08', lineType: 'buy' }], ...extra,
});

beforeAll(async () => {
  t = await setupTenant();
  tid = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC nhiều hoá đơn', kind: 'supplier' });
  await call(t, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=true`, { name: 'Hàng A', unit: 'Lon', taxInCode: 'V08', units: U });
  for (const [no, n] of [['N1', 6], ['N2', 4], ['N3', 5], ['N4', 4]] as const) expect((await call(t, 'POST', '/api/v1/purchase/invoices', hd(no, n))).status).toBe(201);
}, 90_000);
afterAll(async () => { await t.app.close(); });

describe('Phiếu nhập nhiều hoá đơn', () => {
  it('khớp SL 2 hoá đơn → duyệt, ghi sổ tách 2 chứng từ kế toán, mỗi chứng từ một hoá đơn thuế', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', phieu([{ no: 'N1' }, { no: 'N2' }]));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const d = r.body.data;
    expect(d.invoices.map((i: { no: string; by?: string }) => i.no)).toEqual(['N1', 'N2']);
    expect(d.invoice.no).toBe('N1');
    expect(d.invoices[0].by).toBeTruthy();
    expect((d.checks as Check[]).some((c) => c.code === 'inv_qty_match')).toBe(true);
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`, {});
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(ap.body.data.links).toHaveLength(2);
    const tax = (await sql<{ invoice_no: string; amount: string }>`SELECT i.invoice_no, SUM(l.amount_before_tax)::text AS amount FROM tax_invoices i JOIN tax_invoice_lines l ON l.tax_invoice_id = i.id
      WHERE i.tenant_id = ${tid} AND i.invoice_no IN ('N1', 'N2') GROUP BY i.invoice_no ORDER BY i.invoice_no`.execute(db)).rows;
    expect(tax.map((x) => [x.invoice_no, Number(x.amount)])).toEqual([['N1', 600_000], ['N2', 400_000]]);
  });

  it('lệch SL thực nhận ↔ hoá đơn: chặn duyệt, Duyệt ngoại lệ được', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', phieu([{ no: 'N3' }, { no: 'N4' }], 10));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const c = (r.body.data.checks as Check[]).find((x) => x.code === 'inv_qty_diff');
    expect(c?.blocking).toBe(true);
    expect(c?.text).toContain('thực nhận 240, hoá đơn 216');
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`, {})).status).toBe(409);
    const ov = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/override`, { reason: 'NCC giao bù hoá đơn 1 Thùng sau' });
    expect(ov.status, JSON.stringify(ov.body)).toBe(200);
    expect(ov.body.data.status).toBe('approved');
  });

  it('hoá đơn thứ hai chưa có ở MH22: chặn, không duyệt ngoại lệ được', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', phieu([{ no: 'N1' }, { no: 'KHONG-CO' }], 6));
    const c = (r.body.data.checks as Check[]).find((x) => x.code === 'inv_split_unknown');
    expect(c?.blocking).toBe(true);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/override`, { reason: 'thử' })).status).toBe(409);
  });

  it('ghi hai lần cùng một hoá đơn trên phiếu bị từ chối', async () => {
    expect((await call(t, 'POST', '/api/v1/purchase/documents', phieu([{ no: 'N1' }, { no: 'N1' }]))).status).toBe(400);
  });
});

describe('Đơn giao nhiều chi nhánh — phiếu nhập đối chiếu theo chi nhánh của phiếu', () => {
  it('nhận vượt phần của chi nhánh B thì báo, không lấy phần chi nhánh A bù', async () => {
    const order = await call(t, 'POST', '/api/v1/purchase/documents', {
      kind: 'order', docDate: '2026-11-10', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false, invoicePlan: { mode: 'later', days: 5, from: 'order' },
      lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty: 10, price: 100_000, taxCode: 'V08', lineType: 'buy' },
        { lineKey: 'b', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty: 3, price: 100_000, taxCode: 'V08', lineType: 'buy', branchCode: 'CN02' }],
    });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    expect(order.body.data.invoicePlan).toEqual({ mode: 'later', days: 5, from: 'order' });
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${order.body.data.id}/approve`, {})).status).toBe(200);
    const rec = { kind: 'receipt', docDate: '2026-11-11', branchCode: 'CN02', partnerCode: NCC, priceIncludesVat: false, refIds: [order.body.data.id],
      lines: [{ lineKey: 'r', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty: 5, price: 100_000, taxCode: 'V08', lineType: 'buy' }] };
    const checks = (await call(t, 'POST', '/api/v1/purchase/analyze', rec)).body.data.checks as Check[];
    expect(checks.find((c) => c.code === 'po_over')?.text).toContain('còn 3 Thùng');
    const ok = (await call(t, 'POST', '/api/v1/purchase/analyze', { ...rec, lines: [{ ...rec.lines[0], qty: 3 }] })).body.data.checks as Check[];
    expect(ok.some((c) => c.code === 'po_over')).toBe(false);
  });
});
