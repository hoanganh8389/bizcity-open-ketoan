// @bizcity-layer D modules/mua-hang
// [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — số tệp của hoá đơn đếm trên đính kèm chung (document_attachments, 0046)
/**
 * HOÁ ĐƠN ĐẦU VÀO CỦA NCC — lưu riêng từng hoá đơn (đầu + dòng theo cách NCC ghi), nhận diện mã bên mình, học cách ghi của NCC,
 * đối soát với phiếu nhập (gắn qua NCC + số / ký hiệu hoá đơn).
 *   prepareInvoices  hoá đơn đọc được (Excel / AI / API) → chuẩn hoá + nhận diện mã + báo trùng — chưa lưu (xem trước)
 *   saveInvoice      thêm / sửa; dòng người dùng chọn mã (matchSource 'manual') → học vào supplier_item_aliases
 *   getInvoice       hoá đơn + gợi ý mã cho dòng chưa nhận diện + phiếu nhập cùng số hoá đơn + kết quả đối soát
 *   invoiceCheck     dùng ở bộ máy phiếu nhập: phiếu có số hoá đơn đã lưu → đối soát, cảnh báo chỗ lệch
 *   scanInvoice      gửi tệp ảnh / PDF sang dịch vụ đọc hoá đơn bên ngoài (INVOICE_AI_URL) → khuôn ParsedInvoice → prepare
 * Nhật ký: JSONL mua hàng (invoice_created / invoice_updated / invoice_cancelled / invoice_imported / invoice_scanned / alias_learned / alias_deleted).
 */
import { sql } from 'kysely';
import { z } from 'zod';
import {
  TAX_RATE, computeDoc, invoiceLabel, matchLine, nameKey, normalizeParsed, reconcileInvoice, sameInvoice, unitFor,
  type Check, type InvoiceLine, type ItemAlias, type MatchSources, type ParsedInvoice, type PDoc, type Policy, type ProductUnit, type ReconcileResult, type ReceiptLineLite, type SupplierInvoice,
} from '@ketoan/contracts/mua-hang';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { logEvents } from './log.js';
import { unitsOf } from './gia-mua.js';
import type { StoredDoc } from './store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().finite();
export const invoiceLineSchema = z.object({
  id: z.string().optional(),
  lineNo: z.number().int().min(1).optional(),
  nccSku: z.string().trim().max(100).default(''),
  nccName: z.string().trim().max(500).default(''),
  nccUnit: z.string().trim().max(50).default(''),
  qty: z.number().finite().refine((x) => x !== 0, 'Số lượng phải khác 0'),
  price: z.number().finite().min(0, 'Đơn giá không được âm').default(0),
  discountAmount: z.number().finite().min(0).default(0),
  amount: money.default(0),
  taxRate: z.number().min(0).max(100).nullable().default(null),
  taxAmount: money.default(0),
  isGift: z.boolean().default(false),
  sku: z.string().trim().max(64).nullable().optional().transform((x) => x || null),
  unit: z.string().trim().max(32).nullable().optional().transform((x) => x || null),
  matchSource: z.enum(['alias', 'declared', 'own_sku', 'manual', 'none']).default('none'),
}).refine((l) => l.nccName || l.nccSku, { message: 'Dòng hàng thiếu tên / mã hàng bên NCC', path: ['nccName'] });
export const invoiceInputSchema = z.object({
  partnerCode: z.string().trim().min(1, 'Chọn nhà cung cấp'),
  form: z.string().trim().max(20).default(''),
  series: z.string().trim().max(20).default(''),
  no: z.string().trim().min(1, 'Nhập số hoá đơn').max(30),
  date: day,
  sellerTaxCode: z.string().trim().max(20).default(''),
  sellerName: z.string().trim().max(300).default(''),
  buyerTaxCode: z.string().trim().max(20).default(''),
  totalBeforeTax: money.default(0),
  totalDiscount: money.default(0),
  totalTax: money.default(0),
  total: money.default(0),
  source: z.enum(['manual', 'excel', 'ai', 'api']).default('manual'),
  note: z.string().max(1000).default(''),
  data: z.record(z.unknown()).default({}),
  lines: z.array(invoiceLineSchema).min(1, 'Hoá đơn chưa có dòng hàng').max(2000),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export const parsedInvoiceSchema = z.object({
  form: z.string().optional(), series: z.string().optional(), no: z.coerce.string().min(1), date: z.string().optional(),
  sellerTaxCode: z.string().optional(), sellerName: z.string().optional(), buyerTaxCode: z.string().optional(), priceIncludesVat: z.boolean().optional(),
  totalBeforeTax: z.number().optional(), totalDiscount: z.number().optional(), totalTax: z.number().optional(), total: z.number().optional(),
  data: z.record(z.unknown()).optional(),
  lines: z.array(z.object({
    nccSku: z.coerce.string().optional(), nccName: z.coerce.string().default(''), nccUnit: z.coerce.string().optional(), qty: z.number(), price: z.number().optional(),
    discountAmount: z.number().optional(), amount: z.number().optional(), taxRate: z.number().nullable().optional(), taxAmount: z.number().optional(), isGift: z.boolean().optional(),
  })).max(2000),
});

const iso = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : '');
const ts = (v: unknown) => (v ? new Date(v as string).toISOString() : undefined);
const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, unknown>;
const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ nguồn nhận diện */

/** Bảng nhận diện đã học + khai mặt hàng của NCC + danh mục mặt hàng (mã, tên, ĐVT). */
export async function matchSources(trx: Db, tenantId: string, partnerCode: string): Promise<MatchSources> {
  const [aliases, declared, products] = await Promise.all([
    trx.selectFrom('supplier_item_aliases').select(['ncc_sku', 'ncc_name', 'ncc_unit', 'sku', 'unit']).where('tenant_id', '=', tenantId).where('partner_code', '=', partnerCode).orderBy('hits', 'desc').execute(),
    trx.selectFrom('supplier_products').select(['sku', 'unit', 'ncc_sku', 'ncc_name']).where('tenant_id', '=', tenantId).where('partner_code', '=', partnerCode).where('is_active', '=', true).execute(),
    trx.selectFrom('products').select(['sku', 'name', 'unit']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
  ]);
  return {
    aliases: aliases.map((a) => ({ nccSku: a.ncc_sku, nccName: a.ncc_name, nccUnit: a.ncc_unit, sku: a.sku, unit: a.unit })),
    declared: declared.map((d) => ({ sku: d.sku, unit: d.unit, nccSku: d.ncc_sku, nccName: d.ncc_name })),
    products: products.map((p) => ({ sku: p.sku, name: p.name, unit: p.unit ?? undefined })),
    units: {},
  };
}

/** Nhận diện các dòng (giữ dòng người dùng đã chọn mã); ĐVT bên mình theo ĐVT đã khai của mã. */
export async function matchLines(trx: Db, tenantId: string, src: MatchSources, lines: InvoiceLine[]): Promise<InvoiceLine[]> {
  const first = lines.map((l) => (l.sku && (l.matchSource === 'manual' || l.matchSource === 'alias' || l.matchSource === 'declared' || l.matchSource === 'own_sku') ? l : { ...l, ...matchLine(l, src) }));
  const skus = [...new Set(first.flatMap((l) => [l.sku, ...(l.candidates ?? []).map((c) => c.sku)]).filter(Boolean) as string[])];
  const units = await unitsOf(trx, tenantId, skus);
  return first.map((l) => ({
    ...l,
    unit: l.sku ? (l.unit && (units[l.sku] ?? []).some((u) => u.unit === l.unit) ? l.unit : unitFor(units[l.sku], l.nccUnit, l.unit ?? undefined) || null) : null,
    candidates: (l.candidates ?? []).map((c) => ({ ...c, unit: unitFor(units[c.sku], l.nccUnit) })),
  }));
}

/* ------------------------------------------------------------------ đọc */

type InvRow = { id: string; partner_code: string; invoice_form: string; invoice_series: string; invoice_no: string; invoice_date: unknown; seller_tax_code: string; seller_name: string; buyer_tax_code: string; total_before_tax: string; total_discount: string; total_tax: string; total: string; source: string; status: string; data: unknown; note: string; created_by: string; updated_by: string; created_at: unknown; updated_at: unknown; cancelled_by: string | null; cancelled_at: unknown; cancel_reason: string | null };
type LineRow = { id: string; invoice_id: string; line_no: number; ncc_sku: string; ncc_name: string; ncc_unit: string; qty: string; price: string; discount_amount: string; amount: string; tax_rate: string | null; tax_amount: string; is_gift: boolean; sku: string | null; unit: string | null; match_source: string };
const toLine = (r: LineRow): InvoiceLine => ({
  id: String(r.id), lineNo: r.line_no, nccSku: r.ncc_sku, nccName: r.ncc_name, nccUnit: r.ncc_unit, qty: toNumber(r.qty), price: toNumber(r.price), discountAmount: toNumber(r.discount_amount),
  amount: toNumber(r.amount), taxRate: r.tax_rate === null ? null : toNumber(r.tax_rate), taxAmount: toNumber(r.tax_amount), isGift: r.is_gift, sku: r.sku, unit: r.unit, matchSource: r.match_source as InvoiceLine['matchSource'],
});
const toInvoice = (r: InvRow, lines: InvoiceLine[]): SupplierInvoice => ({
  id: String(r.id), partnerCode: r.partner_code, form: r.invoice_form, series: r.invoice_series, no: r.invoice_no, date: iso(r.invoice_date), sellerTaxCode: r.seller_tax_code, sellerName: r.seller_name,
  buyerTaxCode: r.buyer_tax_code, totalBeforeTax: toNumber(r.total_before_tax), totalDiscount: toNumber(r.total_discount), totalTax: toNumber(r.total_tax), total: toNumber(r.total),
  source: r.source as SupplierInvoice['source'], status: r.status as SupplierInvoice['status'], data: json(r.data) ?? {}, note: r.note, lines,
  createdBy: r.created_by, updatedBy: r.updated_by, createdAt: ts(r.created_at), updatedAt: ts(r.updated_at), cancelledBy: r.cancelled_by, cancelledAt: ts(r.cancelled_at) ?? null, cancelReason: r.cancel_reason,
});

async function loadInvoices(trx: Db, tenantId: string, f: { id?: string; ids?: string[]; partnerCode?: string; from?: string; to?: string; status?: string; withLines?: boolean } = {}): Promise<SupplierInvoice[]> {
  let q = trx.selectFrom('supplier_invoices').selectAll().where('tenant_id', '=', tenantId);
  if (f.id) q = q.where('id', '=', f.id);
  if (f.ids) q = q.where('id', 'in', f.ids.length ? f.ids : ['0']);
  if (f.partnerCode) q = q.where('partner_code', '=', f.partnerCode);
  if (f.from) q = q.where('invoice_date', '>=', f.from);
  if (f.to) q = q.where('invoice_date', '<=', f.to);
  if (f.status) q = q.where('status', '=', f.status);
  const rows = (await q.orderBy('invoice_date', 'desc').orderBy('id', 'desc').execute()) as unknown as InvRow[];
  if (!rows.length) return [];
  const lines = (await trx.selectFrom('supplier_invoice_lines').selectAll().where('tenant_id', '=', tenantId).where('invoice_id', 'in', rows.map((r) => r.id)).orderBy('invoice_id').orderBy('line_no').execute()) as unknown as LineRow[];
  const byInv = new Map<string, InvoiceLine[]>();
  for (const l of lines) (byInv.get(String(l.invoice_id)) ?? byInv.set(String(l.invoice_id), []).get(String(l.invoice_id))!).push(toLine(l));
  return rows.map((r) => toInvoice(r, byInv.get(String(r.id)) ?? []));
}

/** Hoá đơn còn hiệu lực trùng NCC × ký hiệu × số (bỏ số 0 đầu). */
async function findDuplicate(trx: Db, tenantId: string, partnerCode: string, series: string, no: string, exceptId?: string) {
  let q = trx.selectFrom('supplier_invoices').select(['id', 'invoice_series', 'invoice_no']).where('tenant_id', '=', tenantId).where('partner_code', '=', partnerCode).where('status', '=', 'active')
    .where(sql<boolean>`ltrim(invoice_no, '0') = ltrim(${no}, '0')`).where(sql<boolean>`lower(invoice_series) = lower(${series})`);
  if (exceptId) q = q.where('id', '!=', exceptId);
  return q.executeTakeFirst();
}

/* ------------------------------------------------------------------ phiếu nhập cùng hoá đơn + đối soát */

/** Thuế suất của dòng phiếu: V13K / KCT / KKKN = không chịu thuế (null). */
const rateOfCode = (code: string): number | null => (['V13K', 'KCT', 'KKKN', 'R00K'].includes(code) ? null : TAX_RATE[code] ?? null);

/** Phiếu nhập (chưa huỷ) cùng NCC + số / ký hiệu hoá đơn. */
export const receiptsOfInvoice = (inv: Pick<SupplierInvoice, 'partnerCode' | 'no' | 'series'>, docs: StoredDoc[]) =>
  docs.filter((d) => d.kind === 'receipt' && d.status !== 'cancelled' && d.partnerCode === inv.partnerCode && d.invoice?.no && sameInvoice({ no: d.invoice.no, series: d.invoice.serial }, inv));

/** Dòng + tổng tiền phiếu nhập để đối soát (phiếu đã duyệt: số đã chốt; nháp: tính theo chính sách hiện hành). */
export function receiptSide(docs: (PDoc & { totals?: StoredDoc['totals'] })[], policies: Policy[], units: Record<string, ProductUnit[]>): { lines: ReceiptLineLite[]; total: { beforeTax: number; tax: number; total: number } } {
  const lines: ReceiptLineLite[] = [];
  const total = { beforeTax: 0, tax: 0, total: 0 };
  for (const d of docs) {
    const c = computeDoc(d, d.status === 'approved' ? [] : policies, { units });
    for (const l of c.lines) if (l.sku) lines.push({ sku: l.sku, unit: l.unit, qty: l.qty, beforeTax: l.beforeTax, taxRate: rateOfCode(l.taxCode), gift: l.lineType !== 'buy', name: l.name });
    total.beforeTax += c.beforeTax; total.tax += c.tax; total.total += c.payable;
  }
  return { lines, total: { beforeTax: r2(total.beforeTax), tax: r2(total.tax), total: r2(total.total) } };
}

export async function reconcileWith(trx: Db, tenantId: string, inv: SupplierInvoice, receipts: (PDoc & { totals?: StoredDoc['totals'] })[], policies: Policy[]): Promise<ReconcileResult> {
  const skus = [...new Set([...inv.lines.map((l) => l.sku), ...receipts.flatMap((d) => d.lines.map((l) => l.sku))].filter(Boolean) as string[])];
  const units = await unitsOf(trx, tenantId, skus);
  const names = Object.fromEntries((skus.length ? await trx.selectFrom('products').select(['sku', 'name']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute() : []).map((p) => [p.sku, p.name]));
  const side = receiptSide(receipts, policies, units);
  return reconcileInvoice(inv, side.lines, units, side.total, { names });
}

export type InvoiceState = 'chua_nhan_dien' | 'chua_co_phieu' | 'lech' | 'khop' | 'da_huy';
export interface InvoiceListRow extends Omit<SupplierInvoice, 'lines'> {
  lineCount: number; unmatched: number; receipts: { id: string; docNo: string; status: string; docDate: string }[]; state: InvoiceState; issues: string[]; attachments: number;
}

/** Danh sách hoá đơn + tình trạng: chưa nhận diện mã / chưa có phiếu nhập / lệch phiếu / khớp. */
export async function listInvoices(trx: Db, tenantId: string, docs: StoredDoc[], policies: Policy[], f: { partnerCode?: string; from?: string; to?: string; status?: string } = {}): Promise<InvoiceListRow[]> {
  const list = await loadInvoices(trx, tenantId, f);
  // Tệp của hoá đơn: đính kèm chung (0046), docRef mua-hang.invoice:<id>.
  const atts = list.length ? await trx.selectFrom('document_attachments').select(['doc_ref', sql<string>`COUNT(*)`.as('n')]).where('tenant_id', '=', tenantId).where('archived_at', 'is', null)
    .where('doc_ref', 'in', list.map((x) => `mua-hang.invoice:${x.id!}`)).groupBy('doc_ref').execute() : [];
  const attOf = new Map(atts.map((a) => [a.doc_ref.slice('mua-hang.invoice:'.length), toNumber(a.n)]));
  const out: InvoiceListRow[] = [];
  for (const inv of list) {
    const recs = receiptsOfInvoice(inv, docs);
    const unmatched = inv.lines.filter((l) => !l.sku).length;
    let state: InvoiceState, issues: string[] = [];
    if (inv.status === 'cancelled') state = 'da_huy';
    else if (unmatched) state = 'chua_nhan_dien';
    else if (!recs.length) state = 'chua_co_phieu';
    else { const rc = await reconcileWith(trx, tenantId, inv, recs, policies); issues = rc.issues; state = rc.ok ? 'khop' : 'lech'; }
    const { lines, ...head } = inv;
    out.push({ ...head, lineCount: lines.length, unmatched, receipts: recs.map((d) => ({ id: d.id, docNo: d.docNo, status: d.status, docDate: d.docDate })), state, issues, attachments: attOf.get(inv.id!) ?? 0 });
  }
  return out;
}

/** Một hoá đơn: dòng (dòng chưa nhận diện kèm gợi ý), phiếu nhập cùng số hoá đơn, kết quả đối soát. */
export async function getInvoice(trx: Db, tenantId: string, id: string, docs: StoredDoc[], policies: Policy[]) {
  const inv = (await loadInvoices(trx, tenantId, { id }))[0];
  if (!inv) throw Errors.notFound('hoá đơn NCC');
  const src = await matchSources(trx, tenantId, inv.partnerCode);
  inv.lines = await matchLines(trx, tenantId, src, inv.lines.map((l) => (l.sku ? { ...l, matchSource: l.matchSource === 'none' ? 'manual' : l.matchSource } : l)));
  const recs = receiptsOfInvoice(inv, docs);
  const reconcile = recs.length ? await reconcileWith(trx, tenantId, inv, recs, policies) : null;
  return { invoice: inv, receipts: recs.map((d) => ({ id: d.id, docNo: d.docNo, status: d.status, docDate: d.docDate, total: d.totals?.total ?? 0 })), reconcile };
}

/* ------------------------------------------------------------------ ghi */

/** Chuẩn hoá + nhận diện mã + báo trùng (chưa lưu) — xem trước khi nhập Excel / quét AI. */
export async function prepareInvoices(trx: Db, tenantId: string, partnerCode: string, parsed: ParsedInvoice[]) {
  const src = await matchSources(trx, tenantId, partnerCode);
  const out: (Omit<SupplierInvoice, 'source' | 'status' | 'note'> & { duplicateOf?: string; warnings: string[] })[] = [];
  for (const p of parsed) {
    const n = normalizeParsed(p);
    const lines = await matchLines(trx, tenantId, src, n.lines);
    const dup = n.no && partnerCode ? await findDuplicate(trx, tenantId, partnerCode, n.series, n.no) : undefined;
    const warnings: string[] = [];
    if (!n.no) warnings.push('Thiếu số hoá đơn');
    if (!n.date) warnings.push('Thiếu ngày hoá đơn');
    const sumBefore = r2(lines.reduce((s, l) => s + l.amount, 0)), sumTax = r2(lines.reduce((s, l) => s + l.taxAmount, 0));
    if (Math.abs(sumBefore - n.totalBeforeTax) > 10) warnings.push(`Cộng dòng ${sumBefore.toLocaleString('vi-VN')} khác tổng tiền hàng ghi trên HĐ ${n.totalBeforeTax.toLocaleString('vi-VN')}`);
    if (Math.abs(sumTax - n.totalTax) > 10) warnings.push(`Cộng tiền thuế các dòng ${sumTax.toLocaleString('vi-VN')} khác tiền thuế trên HĐ ${n.totalTax.toLocaleString('vi-VN')}`);
    if (dup) warnings.push(`Đã có hoá đơn ${invoiceLabel({ series: dup.invoice_series, no: dup.invoice_no })} của NCC này — ghi sẽ bị bỏ qua`);
    out.push({ ...n, partnerCode, lines, ...(dup ? { duplicateOf: String(dup.id) } : {}), warnings });
  }
  return out;
}

/** Học cách ghi: NCC × mã / tên / ĐVT bên NCC → mã + ĐVT bên mình (đã có thì cộng số lần gặp, đổi mã nếu người dùng chọn khác). */
async function learn(trx: Db, tenantId: string, actor: string, partnerCode: string, lines: InvoiceLine[], source: 'manual' | 'auto' | 'ai'): Promise<number> {
  let n = 0;
  for (const l of lines) {
    if (!l.sku || !l.unit) continue;
    const key = nameKey(l.nccName);
    const ex = await trx.selectFrom('supplier_item_aliases').select(['id', 'sku', 'unit']).where('tenant_id', '=', tenantId).where('partner_code', '=', partnerCode)
      .where(sql<boolean>`lower(ncc_sku) = lower(${l.nccSku})`).where('ncc_name_key', '=', key).where(sql<boolean>`lower(ncc_unit) = lower(${l.nccUnit})`).executeTakeFirst();
    if (ex) {
      const changed = ex.sku !== l.sku || ex.unit !== l.unit;
      await trx.updateTable('supplier_item_aliases').set({ sku: l.sku, unit: l.unit, hits: sql`hits + 1`, last_seen_at: new Date(), ...(changed ? { source, updated_by: actor, updated_at: new Date() } : {}) }).where('id', '=', ex.id).execute();
      if (changed) n++;
    } else {
      await trx.insertInto('supplier_item_aliases').values({ tenant_id: tenantId, partner_code: partnerCode, ncc_sku: l.nccSku, ncc_name: l.nccName, ncc_name_key: key, ncc_unit: l.nccUnit, sku: l.sku, unit: l.unit, source, created_by: actor, updated_by: actor }).execute();
      n++;
    }
  }
  return n;
}

async function checkSkus(trx: Db, tenantId: string, lines: InvoiceInput['lines']) {
  const skus = [...new Set(lines.map((l) => l.sku).filter(Boolean) as string[])];
  if (!skus.length) return;
  const units = await unitsOf(trx, tenantId, skus);
  for (const [i, l] of lines.entries()) {
    if (!l.sku) continue;
    if (!l.unit) throw Errors.validation(`Dòng ${i + 1} (${l.nccName || l.nccSku}): chọn ĐVT bên mình tương ứng ĐVT "${l.nccUnit}" NCC ghi — mã ${l.sku} chưa có ĐVT này (hoặc khai thêm ĐVT cho mặt hàng ở DM10)`);
    if (!units[l.sku]?.length) throw Errors.validation(`Dòng ${i + 1} (${l.nccName || l.nccSku}): mã ${l.sku} chưa có trong danh mục mặt hàng`);
    if (l.unit && !units[l.sku]!.some((u) => u.unit === l.unit)) throw Errors.validation(`Dòng ${i + 1}: ĐVT "${l.unit}" chưa khai cho mã ${l.sku} (có: ${units[l.sku]!.map((u) => u.unit).join(', ')})`);
  }
}

/** Thêm / sửa hoá đơn. Trùng NCC × ký hiệu × số với hoá đơn còn hiệu lực → báo lỗi. Dòng chọn mã tay → học. */
export async function saveInvoice(trx: Db, tenantId: string, actor: string, input: InvoiceInput, id?: string): Promise<SupplierInvoice> {
  if (id) {
    const cur = await trx.selectFrom('supplier_invoices').select(['status']).where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!cur) throw Errors.notFound('hoá đơn NCC');
    if (cur.status === 'cancelled') throw Errors.conflict('Hoá đơn đã huỷ — không sửa được');
  }
  const dup = await findDuplicate(trx, tenantId, input.partnerCode, input.series, input.no, id);
  if (dup) throw Errors.conflict(`Hoá đơn ${invoiceLabel({ series: input.series, no: input.no })} của NCC ${input.partnerCode} đã có (mở hoá đơn đó để sửa)`, { duplicateOf: String(dup.id) });
  await checkSkus(trx, tenantId, input.lines);
  const head = {
    partner_code: input.partnerCode, invoice_form: input.form, invoice_series: input.series, invoice_no: input.no, invoice_date: input.date, seller_tax_code: input.sellerTaxCode,
    seller_name: input.sellerName, buyer_tax_code: input.buyerTaxCode, total_before_tax: input.totalBeforeTax, total_discount: input.totalDiscount, total_tax: input.totalTax, total: input.total,
    note: input.note, data: JSON.stringify(input.data ?? {}), updated_by: actor, updated_at: new Date(),
  };
  let invId = id;
  if (id) await trx.updateTable('supplier_invoices').set(head).where('tenant_id', '=', tenantId).where('id', '=', id).execute();
  else invId = String((await trx.insertInto('supplier_invoices').values({ tenant_id: tenantId, ...head, source: input.source, created_by: actor }).returning('id').executeTakeFirstOrThrow()).id);
  await trx.deleteFrom('supplier_invoice_lines').where('tenant_id', '=', tenantId).where('invoice_id', '=', invId!).execute();
  const lines: InvoiceLine[] = input.lines.map((l, i) => ({ ...l, lineNo: i + 1, sku: l.sku ?? null, unit: l.sku ? l.unit ?? null : null, matchSource: l.sku ? l.matchSource === 'none' ? 'manual' : l.matchSource : 'none' }));
  await trx.insertInto('supplier_invoice_lines').values(lines.map((l) => ({
    tenant_id: tenantId, invoice_id: invId!, line_no: l.lineNo, ncc_sku: l.nccSku, ncc_name: l.nccName, ncc_unit: l.nccUnit, qty: l.qty, price: l.price, discount_amount: l.discountAmount,
    amount: l.amount, tax_rate: l.taxRate, tax_amount: l.taxAmount, is_gift: l.isGift, sku: l.sku, unit: l.unit, match_source: l.matchSource, data: '{}',
  }))).execute();
  // Học: dòng người dùng chọn mã (hoặc AI chọn) — lần sau cùng cách ghi tự nhận đúng mã.
  const learned = await learn(trx, tenantId, actor, input.partnerCode, lines.filter((l) => l.matchSource === 'manual'), input.source === 'ai' ? 'ai' : 'manual');
  const label = invoiceLabel(input);
  await logEvents(tenantId, [
    { event: id ? 'invoice_updated' : 'invoice_created', docNo: label, user: actor, data: { partnerCode: input.partnerCode, invoiceId: invId, source: input.source, date: input.date, total: input.total, lines: lines.length, unmatched: lines.filter((l) => !l.sku).length } },
    ...(learned ? [{ event: 'alias_learned', docNo: label, user: actor, data: { partnerCode: input.partnerCode, count: learned, lines: lines.filter((l) => l.matchSource === 'manual').map((l) => ({ nccSku: l.nccSku, nccName: l.nccName, nccUnit: l.nccUnit, sku: l.sku, unit: l.unit })) } }] : []),
  ]);
  return (await loadInvoices(trx, tenantId, { id: invId }))[0]!;
}

/** Nhập nhiều hoá đơn một lần (Excel / AI / API): trùng thì bỏ qua (báo lại), dòng chưa nhận diện vẫn lưu để chọn mã sau. */
export async function importInvoices(trx: Db, tenantId: string, actor: string, list: InvoiceInput[]): Promise<{ saved: { id: string; label: string }[]; skipped: { label: string; reason: string }[] }> {
  const saved: { id: string; label: string }[] = [], skipped: { label: string; reason: string }[] = [];
  for (const x of list) {
    const label = invoiceLabel(x);
    if (await findDuplicate(trx, tenantId, x.partnerCode, x.series, x.no)) { skipped.push({ label, reason: 'đã có hoá đơn này' }); continue; }
    const inv = await saveInvoice(trx, tenantId, actor, x);
    saved.push({ id: inv.id!, label });
  }
  if (list.length) await logEvents(tenantId, [{ event: 'invoice_imported', docNo: '', user: actor, data: { partnerCode: list[0]!.partnerCode, source: list[0]!.source, saved: saved.map((s) => s.label), skipped } }]);
  return { saved, skipped };
}

export async function cancelInvoice(trx: Db, tenantId: string, actor: string, id: string, reason: string) {
  const cur = await trx.selectFrom('supplier_invoices').select(['status', 'invoice_series', 'invoice_no', 'partner_code']).where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  if (!cur) throw Errors.notFound('hoá đơn NCC');
  if (cur.status === 'cancelled') throw Errors.conflict('Hoá đơn đã huỷ');
  await trx.updateTable('supplier_invoices').set({ status: 'cancelled', cancelled_by: actor, cancelled_at: new Date(), cancel_reason: reason, updated_by: actor, updated_at: new Date() }).where('id', '=', id).execute();
  await logEvents(tenantId, [{ event: 'invoice_cancelled', docNo: invoiceLabel({ series: cur.invoice_series, no: cur.invoice_no }), user: actor, data: { partnerCode: cur.partner_code, invoiceId: id, reason } }]);
}

/* ------------------------------------------------------------------ bảng nhận diện */

export async function listAliases(trx: Db, tenantId: string, partnerCode?: string): Promise<(ItemAlias & { productName: string })[]> {
  let q = trx.selectFrom('supplier_item_aliases as a').leftJoin('products as p', (j) => j.onRef('p.tenant_id', '=', 'a.tenant_id').onRef('p.sku', '=', 'a.sku'))
    .select(['a.id', 'a.partner_code', 'a.ncc_sku', 'a.ncc_name', 'a.ncc_unit', 'a.sku', 'a.unit', 'a.hits', 'a.source', 'a.last_seen_at', 'a.created_by', 'a.updated_by', 'a.created_at', 'a.updated_at', 'p.name'])
    .where('a.tenant_id', '=', tenantId);
  if (partnerCode) q = q.where('a.partner_code', '=', partnerCode);
  const rows = await q.orderBy('a.partner_code').orderBy('a.ncc_name').execute();
  return rows.map((r) => ({ id: String(r.id), partnerCode: r.partner_code, nccSku: r.ncc_sku, nccName: r.ncc_name, nccUnit: r.ncc_unit, sku: r.sku, unit: r.unit, hits: r.hits, source: r.source as ItemAlias['source'],
    lastSeenAt: ts(r.last_seen_at), createdBy: r.created_by, updatedBy: r.updated_by, createdAt: ts(r.created_at), updatedAt: ts(r.updated_at), productName: r.name ?? '' }));
}

export async function deleteAlias(trx: Db, tenantId: string, actor: string, id: string) {
  const row = await trx.selectFrom('supplier_item_aliases').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  if (!row) throw Errors.notFound('cách ghi đã học');
  await trx.deleteFrom('supplier_item_aliases').where('id', '=', id).execute();
  // Xoá vĩnh viễn: nhật ký ghi đủ nội dung để tra lại.
  await logEvents(tenantId, [{ event: 'alias_deleted', docNo: '', user: actor, data: { partnerCode: row.partner_code, nccSku: row.ncc_sku, nccName: row.ncc_name, nccUnit: row.ncc_unit, sku: row.sku, unit: row.unit, hits: row.hits, source: row.source, createdBy: row.created_by } }]);
}

/* ------------------------------------------------------------------ dùng ở phiếu nhập */

/** Phiếu nhập có số hoá đơn đã lưu ở Hoá đơn NCC → đối soát ngay (cảnh báo, không chặn). */
export async function invoiceCheck(trx: Db, tenantId: string, doc: PDoc, docs: StoredDoc[], policies: Policy[]): Promise<Check[]> {
  if (doc.kind !== 'receipt' || !doc.invoice?.no || !doc.partnerCode) return [];
  const cands = await trx.selectFrom('supplier_invoices').select(['id', 'invoice_series', 'invoice_no']).where('tenant_id', '=', tenantId).where('partner_code', '=', doc.partnerCode).where('status', '=', 'active')
    .where(sql<boolean>`ltrim(invoice_no, '0') = ltrim(${doc.invoice.no}, '0')`).execute();
  const hit = cands.find((c) => sameInvoice({ no: c.invoice_no, series: c.invoice_series }, { no: doc.invoice!.no, series: doc.invoice!.serial }));
  if (!hit) {
    // Chỉ nhắc với NCC đã dùng Hoá đơn NCC (đã có ít nhất một hoá đơn lưu) — NCC chưa dùng thì không làm rối khung kiểm tra.
    const used = await trx.selectFrom('supplier_invoices').select('id').where('tenant_id', '=', tenantId).where('partner_code', '=', doc.partnerCode).limit(1).executeTakeFirst();
    return used ? [{ level: 'info', code: 'inv_not_stored', text: `Hoá đơn ${doc.invoice.no} chưa có ở Hoá đơn NCC (MH22) — nhập Excel / quét hoá đơn để đối soát từng dòng` }] : [];
  }
  const inv = (await loadInvoices(trx, tenantId, { id: String(hit.id) }))[0]!;
  // Các phiếu nhập khác cùng hoá đơn (giao nhiều lần) cộng chung với phiếu đang lập.
  const others = receiptsOfInvoice(inv, docs).filter((d) => d.id !== doc.id);
  const rc = await reconcileWith(trx, tenantId, inv, [...others, doc], policies);
  const label = invoiceLabel(inv);
  if (rc.ok) return [{ level: 'info', code: 'inv_match', text: `Đối soát hoá đơn NCC ${label}: khớp từng dòng (SL, giá chưa thuế, thuế suất, tổng tiền)` }];
  return [{ level: 'warn', code: 'inv_diff', text: `Lệch hoá đơn NCC ${label}: ${rc.issues.slice(0, 4).join('; ')}${rc.issues.length > 4 ? ` … (+${rc.issues.length - 4})` : ''}` }];
}

/* ------------------------------------------------------------------ đọc hoá đơn bằng dịch vụ ngoài (AI) */

export const scanConfigured = () => Boolean(process.env.INVOICE_AI_URL);

/**
 * Gửi tệp sang dịch vụ đọc hoá đơn (ChatGPT, Claude… do đơn vị tự dựng / chọn) — địa chỉ INVOICE_AI_URL, khoá INVOICE_AI_KEY (tuỳ chọn).
 * Gửi:  POST { fileName, mime, dataBase64, hint: { partnerCode, partnerName, partnerTaxCode, buyerTaxCode } }
 * Nhận: { invoices: ParsedInvoice[] } (hoặc một ParsedInvoice) — đúng khuôn parsedInvoiceSchema.
 */
export async function scanInvoice(trx: Db, tenantId: string, actor: string, body: { partnerCode: string; fileName: string; mime: string; dataBase64: string }) {
  const url = process.env.INVOICE_AI_URL;
  if (!url) throw Errors.validation('Chưa cấu hình dịch vụ đọc hoá đơn (biến môi trường INVOICE_AI_URL) — dùng Nhập Excel hoặc gõ tay');
  const partner = await trx.selectFrom('partners').select(['name', 'tax_code']).where('tenant_id', '=', tenantId).where('code', '=', body.partnerCode).executeTakeFirst();
  const tenant = await trx.selectFrom('tenants').select(['tax_code']).where('id', '=', tenantId).executeTakeFirst();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(process.env.INVOICE_AI_TIMEOUT_MS ?? 120_000));
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...(process.env.INVOICE_AI_KEY ? { authorization: `Bearer ${process.env.INVOICE_AI_KEY}` } : {}) },
      body: JSON.stringify({ fileName: body.fileName, mime: body.mime, dataBase64: body.dataBase64, hint: { partnerCode: body.partnerCode, partnerName: partner?.name ?? '', partnerTaxCode: partner?.tax_code ?? '', buyerTaxCode: tenant?.tax_code ?? '' } }),
    });
  } catch (e) {
    throw Errors.validation(`Không gọi được dịch vụ đọc hoá đơn: ${(e as Error).name === 'AbortError' ? 'quá thời gian chờ' : (e as Error).message}`);
  } finally { clearTimeout(timer); }
  if (!res.ok) throw Errors.validation(`Dịch vụ đọc hoá đơn báo lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const raw = (await res.json()) as unknown;
  const arr = Array.isArray((raw as { invoices?: unknown }).invoices) ? (raw as { invoices: unknown[] }).invoices : Array.isArray(raw) ? raw : [raw];
  const parsed: ParsedInvoice[] = [];
  for (const x of arr) {
    const p = parsedInvoiceSchema.safeParse(x);
    if (!p.success) throw Errors.validation(`Dịch vụ đọc hoá đơn trả sai khuôn: ${p.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    parsed.push({ ...p.data, data: { ...(p.data.data ?? {}), fileName: body.fileName } } as ParsedInvoice);
  }
  await logEvents(tenantId, [{ event: 'invoice_scanned', docNo: parsed.map((p) => invoiceLabel({ series: p.series ?? '', no: p.no })).join(', '), user: actor, data: { partnerCode: body.partnerCode, fileName: body.fileName, invoices: parsed.length, lines: parsed.reduce((s, p) => s + p.lines.length, 0) } }]);
  return prepareInvoices(trx, tenantId, body.partnerCode, parsed);
}
