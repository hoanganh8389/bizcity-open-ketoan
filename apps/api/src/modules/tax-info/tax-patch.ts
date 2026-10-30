// @bizcity-layer K kernel/tax
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Thông tin thuế kế toán bổ sung cho chứng từ (ACC78), lưu ở tax_info_patches:
 *   - applyTaxPatch: ghép phần hoá đơn bổ sung vào chứng từ trước khi ghi sổ (chứng từ chưa có hoá đơn mà được
 *     bổ sung đủ số, ngày hoá đơn thì ghi sổ như chứng từ có hoá đơn);
 *   - applyTaxFlags: ghi kỳ kê khai, được khấu trừ hay không, chứng từ thanh toán lên sổ hoá đơn sau khi ghi lại.
 * Gọi ở mọi chỗ ghi lại sổ hoá đơn, để chứng từ gửi bản mới hay ghi sổ lại vẫn giữ phần bổ sung.
 */
import { isTradeDocument, type IngestDocument, type InvoiceInput } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';

/** Các trường hoá đơn kế toán được bổ sung, sửa. */
export interface InvoicePatch {
  no?: string;
  serial?: string;
  form?: string;
  date?: string;
  buyerName?: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
}
export const INVOICE_PATCH_FIELDS = ['no', 'serial', 'form', 'date', 'buyerName', 'buyerTaxCode', 'buyerAddress'] as const;

export interface TaxPatch {
  invoice: InvoicePatch;
  declare_month: string | null;
  deductible: boolean;
  payment_ref: string;
}

export async function loadTaxPatch(db: Db, eventId: string): Promise<TaxPatch | undefined> {
  const row = await db.selectFrom('tax_info_patches').select(['invoice', 'declare_month', 'deductible', 'payment_ref']).where('event_id', '=', eventId).executeTakeFirst();
  return row ? { invoice: (row.invoice ?? {}) as InvoicePatch, declare_month: row.declare_month, deductible: row.deductible, payment_ref: row.payment_ref } : undefined;
}

/** Phần hoá đơn có trường nào được bổ sung không. */
export function hasInvoicePatch(p?: InvoicePatch | null): boolean {
  return Boolean(p && INVOICE_PATCH_FIELDS.some((k) => p[k] !== undefined && p[k] !== ''));
}

/** Chứng từ sau khi ghép phần hoá đơn bổ sung (chứng từ không phải mua bán hoặc không có bổ sung: giữ nguyên). */
export function applyTaxPatch(doc: IngestDocument, patch?: TaxPatch): IngestDocument {
  if (!patch || !isTradeDocument(doc) || !hasInvoicePatch(patch.invoice)) return doc;
  const p = patch.invoice;
  const pick = <K extends keyof InvoicePatch>(k: K) => (p[k] !== undefined && p[k] !== '' ? p[k] : undefined);
  const base: Partial<InvoiceInput> = doc.invoice ?? {};
  const no = pick('no') ?? base.no;
  const date = pick('date') ?? base.date;
  if (!no || !date) return doc; // chưa đủ số và ngày hoá đơn thì chưa thành hoá đơn
  const name = pick('buyerName');
  const invoice: InvoiceInput = {
    ...base,
    no,
    date,
    serial: pick('serial') ?? base.serial ?? '',
    form: pick('form') ?? base.form ?? '',
    status: base.status ?? 'valid',
    ...(name ? { buyerName: name, buyerLegalName: name } : {}),
    ...(pick('buyerTaxCode') ? { buyerTaxCode: pick('buyerTaxCode') } : {}),
    ...(pick('buyerAddress') ? { buyerAddress: pick('buyerAddress') } : {}),
  };
  return { ...doc, invoice };
}

/** Ghi kỳ kê khai, được khấu trừ, chứng từ thanh toán của phần bổ sung lên sổ hoá đơn của chứng từ. */
export async function applyTaxFlags(db: Db, eventId: string): Promise<void> {
  const p = await loadTaxPatch(db, eventId);
  await db
    .updateTable('tax_invoices')
    .set({ declare_date: p?.declare_month ?? null, deductible: p?.deductible ?? true, payment_ref: p?.payment_ref ?? '' })
    .where('event_id', '=', eventId)
    .execute();
}
