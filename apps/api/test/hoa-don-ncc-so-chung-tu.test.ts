// [2026-11-21 Nguyễn Văn Thủy] 0179: hoá đơn NCC vào sổ chứng từ chung, phiếu nhập nhiều hoá đơn theo chuẩn Document Kernel (đóng góp)
/**
 * Tiêu chuẩn: Document Kernel quản định danh / vòng đời / liên kết của mọi chứng từ; chỉ sự việc kế toán thật mới vào accounting_events.
 * 1. Hoá đơn NCC (MH22) = purchase.invoice trong business_documents, trạng thái done; không có accounting_events.
 * 2. Phiếu nhập 2 hoá đơn (hoá đơn sau điều chỉnh cho hoá đơn trước): meta.invoices đủ 2; liên kết hoá đơn --attachesTo--> phiếu,
 *    hoá đơn điều chỉnh --adjusts--> hoá đơn gốc; liên kết phiếu --source--> đơn đặt vẫn có.
 * 3. Bỏ một hoá đơn khỏi phiếu → gỡ liên kết đính vào của hoá đơn đó. Huỷ hoá đơn ở MH22 → sổ ghi cancelled.
 * 4. Hoá đơn gõ tay trên phiếu trước, nhập vào MH22 sau → tự nối liên kết.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let tid: string;
const NCC = 'NCC-HDSO';
const SKU = 'HDSO-A';
const hd = (no: string, thung: number) => ({
  partnerCode: NCC, form: '1', series: 'C26THS', no, date: '2026-11-10', sellerTaxCode: '0109999998', totalBeforeTax: thung * 100_000, totalTax: thung * 8_000, total: thung * 108_000, source: 'excel',
  lines: [{ nccSku: 'A', nccName: 'Hang A', nccUnit: 'THUNG', qty: thung, price: 100_000, amount: thung * 100_000, taxRate: 8, taxAmount: thung * 8_000, sku: SKU, unit: 'Thùng', matchSource: 'manual' }],
});
const links = async (where: { from?: string; to?: string }) => (await sql<{ from_ref: string; to_ref: string; role: string }>`
  SELECT from_ref, to_ref, role FROM document_links WHERE tenant_id = ${tid}
     AND (${where.from ?? null}::text IS NULL OR from_ref = ${where.from ?? null}) AND (${where.to ?? null}::text IS NULL OR to_ref = ${where.to ?? null})
   ORDER BY role, from_ref, to_ref`.execute(db)).rows;
const bd = async (ref: string) => (await sql<{ doc_type: string; status: string; doc_no: string; meta: Record<string, unknown> }>`
  SELECT doc_type, status, doc_no, meta FROM business_documents WHERE tenant_id = ${tid} AND doc_ref = ${ref}`.execute(db)).rows[0];
const invId = async (no: string) => String((await sql<{ id: string }>`SELECT id::text FROM supplier_invoices WHERE tenant_id = ${tid} AND invoice_no = ${no}`.execute(db)).rows[0]!.id);

beforeAll(async () => {
  t = await setupTenant();
  tid = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC hoá đơn vào sổ', kind: 'supplier' });
  await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=true`, { name: 'Hàng A', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24, isPurchaseDefault: true }] });
  for (const [no, n] of [['S1', 6], ['S2', 4]] as const) expect((await call(t, 'POST', '/api/v1/purchase/invoices', hd(no, n))).status).toBe(201);
}, 90_000);
afterAll(async () => { await t.app.close(); });

describe('Hoá đơn NCC trong sổ chứng từ chung (0179)', () => {
  it('hoá đơn NCC = purchase.invoice, hoàn tất, không vào accounting_events', async () => {
    const id = await invId('S1');
    expect(await bd(`mua-hang.invoice:${id}`)).toMatchObject({ doc_type: 'purchase.invoice', status: 'done', doc_no: 'C26THS-S1' });
    const ev = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM accounting_events WHERE tenant_id = ${tid} AND doc_key LIKE 'mua-hang.invoice:%'`.execute(db)).rows[0]!.n;
    expect(Number(ev)).toBe(0);
  });

  it('phiếu nhập 2 hoá đơn: meta đủ, liên kết đính vào + điều chỉnh + lập từ đơn; bỏ hoá đơn thì gỡ liên kết; huỷ hoá đơn → cancelled', async () => {
    const od = await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'order', docDate: '2026-11-09', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false,
      lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty: 10, price: 100_000, taxCode: 'V08', lineType: 'buy' }] });
    expect(od.status, JSON.stringify(od.body)).toBe(201);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${od.body.data.id}/approve`, {})).status).toBe(200);
    const body = (invoices: Record<string, string>[]) => ({ kind: 'receipt', docDate: '2026-11-10', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false, refIds: [od.body.data.id], invoices,
      lines: [{ lineKey: 'r', refLineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty: 10, price: 100_000, taxCode: 'V08', lineType: 'buy' }] });
    const r = await call(t, 'POST', '/api/v1/purchase/documents', body([{ no: 'S1', serial: 'C26THS', date: '2026-11-10' }, { no: 'S2', serial: 'C26THS', date: '2026-11-10', adjusts: 'C26THS-S1' }]));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ref = `mua-hang.document:${r.body.data.id}`;
    const [i1, i2] = [await invId('S1'), await invId('S2')];
    const meta = (await bd(ref))!.meta as { invoices: { key: string; adjusts?: string }[] };
    expect(meta.invoices.map((x) => [x.key, x.adjusts ?? ''])).toEqual([['C26THS-S1', ''], ['C26THS-S2', 'C26THS-S1']]);
    expect(await links({ to: ref })).toEqual([
      { from_ref: `mua-hang.invoice:${i1}`, to_ref: ref, role: 'attachesTo' },
      { from_ref: `mua-hang.invoice:${i2}`, to_ref: ref, role: 'attachesTo' },
    ]);
    expect(await links({ from: `mua-hang.invoice:${i2}`, to: `mua-hang.invoice:${i1}` })).toEqual([{ from_ref: `mua-hang.invoice:${i2}`, to_ref: `mua-hang.invoice:${i1}`, role: 'adjusts' }]);
    expect(await links({ from: ref, to: `mua-hang.document:${od.body.data.id}` })).toEqual([{ from_ref: ref, to_ref: `mua-hang.document:${od.body.data.id}`, role: 'source' }]);
    // Bỏ hoá đơn S2 khỏi phiếu → gỡ liên kết đính vào của S2.
    expect((await call(t, 'PUT', `/api/v1/purchase/documents/${r.body.data.id}`, body([{ no: 'S1', serial: 'C26THS', date: '2026-11-10' }]))).status).toBe(200);
    expect((await links({ to: ref })).map((l) => l.from_ref)).toEqual([`mua-hang.invoice:${i1}`]);
    // Huỷ hoá đơn S2 ở MH22 → sổ ghi cancelled.
    const c = await call(t, 'POST', `/api/v1/purchase/invoices/${i2}/cancel`, { reason: 'Thử huỷ' });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect((await bd(`mua-hang.invoice:${i2}`))!.status).toBe('cancelled');
  });

  it('hoá đơn gõ tay trên phiếu trước, nhập MH22 sau → tự nối', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Thử nối sau' }, docDate: '2026-11-10', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false,
      invoices: [{ no: '0000793', serial: '1C26THS', date: '2026-11-10' }],
      lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Thùng', qty: 3, price: 100_000, taxCode: 'V08', lineType: 'buy' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ref = `mua-hang.document:${r.body.data.id}`;
    expect(await links({ to: ref })).toEqual([]);
    expect((await call(t, 'POST', '/api/v1/purchase/invoices', hd('793', 3))).status).toBe(201);
    expect(await links({ to: ref })).toEqual([{ from_ref: `mua-hang.invoice:${await invId('793')}`, to_ref: ref, role: 'attachesTo' }]);
  });
});
