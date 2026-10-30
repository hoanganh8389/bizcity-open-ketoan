// @bizcity-layer K kernel/tax
/**
 * Bổ sung thông tin thuế (ACC78): liệt kê chứng từ mua bán và hoá đơn của chúng trong kỳ, chỉ ra chỗ còn thiếu
 * (chưa có hoá đơn, thiếu ký hiệu, thiếu hoặc sai dạng mã số thuế, hoá đơn từ 5 triệu chưa có chứng từ thanh toán
 * không dùng tiền mặt…) và cho kế toán bổ sung.
 *
 * Phần bổ sung lưu ở tax_info_patches. Sửa thông tin hoá đơn của chứng từ nhận qua API thì chứng từ được ghi sổ lại
 * (bút toán cũ ghi số âm), vì có hoá đơn hay không quyết định cách định khoản thuế và sổ hoá đơn. Kỳ kê khai, được khấu trừ,
 * chứng từ thanh toán chỉ ghi lên sổ hoá đơn, không ghi lại bút toán.
 */
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { logPosting } from '../documents/document.service.js';
import { applyTaxFlags, hasInvoicePatch, INVOICE_PATCH_FIELDS, loadTaxPatch, type InvoicePatch } from './tax-patch.js';

const TRADE = ['sale', 'sale_return', 'purchase', 'purchase_return'];
const INPUT = ['purchase', 'purchase_return'];
/** Mã số thuế: 10 số, 10 số – 3 số (đơn vị phụ thuộc), hoặc 12 số (mã định danh cá nhân dùng làm mã số thuế). */
export const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;
/** Hoá đơn mua vào từ mức này (gồm thuế) phải có chứng từ thanh toán không dùng tiền mặt mới được khấu trừ. */
export const NON_CASH_THRESHOLD = 5_000_000;

export interface TaxInfoQuery { from: string; to: string; direction?: 'input' | 'output'; branchCodes?: string[]; show: 'issues' | 'all' | 'patched'; search?: string }
export interface TaxInfoInput {
  invoice: InvoicePatch;
  /** YYYY-MM; rỗng = kê khai theo ngày hoá đơn. */
  declareMonth: string;
  deductible: boolean;
  paymentRef: string;
  note: string;
}

/** Các điểm còn thiếu của một chứng từ / hoá đơn. */
export function taxIssues(r: { direction: 'input' | 'output'; hasInvoice: boolean; serial: string; name: string; taxCode: string; total: number; deductible: boolean; paymentRef: string; sign: number; invoiceDate: string; declareDate: string | null }): string[] {
  const out: string[] = [];
  if (!r.hasInvoice) {
    if (r.direction === 'input') out.push('Chưa có hoá đơn');
    return out;
  }
  if (!r.serial) out.push('Thiếu ký hiệu hoá đơn');
  if (r.direction === 'input' && !r.name) out.push('Thiếu tên người bán');
  if (r.direction === 'input' && !r.taxCode) out.push('Thiếu mã số thuế người bán');
  if (r.taxCode && !TAX_CODE_RE.test(r.taxCode.replace(/\s/g, ''))) out.push('Mã số thuế không đúng dạng');
  if (r.direction === 'input' && r.sign > 0 && r.deductible && r.total >= NON_CASH_THRESHOLD && !r.paymentRef) out.push('Từ 5 triệu: chưa ghi chứng từ thanh toán không dùng tiền mặt');
  if (r.declareDate && r.declareDate.slice(0, 7) < r.invoiceDate.slice(0, 7)) out.push('Kỳ kê khai trước tháng của ngày hoá đơn');
  return out;
}

export const taxInfoService = {
  async list(auth: AuthContext, q: TaxInfoQuery) {
    const branchIds = q.branchCodes?.length
      ? (await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', 'in', q.branchCodes).execute()).map((b) => b.id)
      : null;
    const branchFilter = branchIds ? sql`AND e.branch_id = ANY(${branchIds}::bigint[])` : sql``;
    const dirFilter = q.direction === 'input'
      ? sql`AND (i.direction = 'input' OR (i.id IS NULL AND e.doc_type IN ('purchase', 'purchase_return')))`
      : q.direction === 'output'
        ? sql`AND (i.direction = 'output' OR (i.id IS NULL AND e.doc_type IN ('sale', 'sale_return')))`
        : sql``;
    const like = q.search ? `%${q.search.trim()}%` : null;
    const searchFilter = like
      ? sql`AND (e.doc_no ILIKE ${like} OR i.invoice_no ILIKE ${like} OR i.buyer_name ILIKE ${like} OR i.buyer_tax_code ILIKE ${like} OR p.name ILIKE ${like} OR p.code ILIKE ${like})`
      : sql``;
    // Chứng từ bán ra chưa có hoá đơn (bán lẻ) rất nhiều và là bình thường: chỉ hiện khi xem "Tất cả".
    const noInvoiceSales = q.show === 'all' ? sql`` : sql`AND NOT (i.id IS NULL AND e.doc_type IN ('sale', 'sale_return'))`;
    const res = await sql<{
      event_id: string; doc_type: string; doc_no: string; doc_date: string; source_system: string; doc_total: string; branch_code: string;
      partner_code: string | null; partner_name: string | null; partner_tax_code: string | null;
      inv_id: string | null; direction: string | null; invoice_no: string | null; invoice_serial: string | null; invoice_form: string | null; invoice_date: string | null;
      buyer_name: string | null; buyer_tax_code: string | null; buyer_address: string | null; amount: string | null; tax: string | null; sign: number | null;
      declare_date: string | null; deductible: boolean | null; payment_ref: string | null; inv_status: string | null;
      patch_invoice: InvoicePatch | null; declare_month: string | null; p_deductible: boolean | null; p_payment_ref: string | null; note: string | null; updated_by: string | null; updated_at: Date | null;
    }>`
      SELECT e.id AS event_id, e.doc_type, e.doc_no, e.doc_date::text AS doc_date, e.source_system, e.total AS doc_total, b.code AS branch_code,
             p.code AS partner_code, p.name AS partner_name, p.tax_code AS partner_tax_code,
             i.id AS inv_id, i.direction, i.invoice_no, i.invoice_serial, i.invoice_form, i.invoice_date::text AS invoice_date,
             i.buyer_name, i.buyer_tax_code, i.buyer_address, i.total_before_tax AS amount, i.total_tax AS tax, i.sign,
             i.declare_date::text AS declare_date, i.deductible, i.payment_ref, i.status AS inv_status,
             t.invoice AS patch_invoice, t.declare_month::text AS declare_month, t.deductible AS p_deductible, t.payment_ref AS p_payment_ref, t.note, t.updated_by, t.updated_at
        FROM accounting_events e
        JOIN branches b ON b.id = e.branch_id
        LEFT JOIN partners p ON p.id = e.partner_id
        LEFT JOIN tax_invoices i ON i.event_id = e.id
        LEFT JOIN tax_info_patches t ON t.event_id = e.id
       WHERE e.tenant_id = ${auth.tenantId} AND e.status = 'posted'
         AND (e.doc_type IN ('sale', 'sale_return', 'purchase', 'purchase_return') OR i.id IS NOT NULL)
         AND COALESCE(i.period_date, e.doc_date) BETWEEN ${q.from}::date AND ${q.to}::date
         ${branchFilter} ${dirFilter} ${searchFilter} ${noInvoiceSales}
       ORDER BY COALESCE(i.period_date, e.doc_date), e.doc_no`.execute(db);

    const rows = res.rows.map((r) => {
      const direction: 'input' | 'output' = (r.direction as 'input' | 'output' | null) ?? (INPUT.includes(r.doc_type) ? 'input' : 'output');
      const amount = toNumber(r.amount ?? 0);
      const tax = toNumber(r.tax ?? 0);
      const issues = taxIssues({
        direction, hasInvoice: Boolean(r.inv_id), serial: r.invoice_serial ?? '', name: r.buyer_name ?? '', taxCode: r.buyer_tax_code ?? '',
        total: amount + tax, deductible: r.deductible ?? true, paymentRef: r.payment_ref ?? '', sign: r.sign ?? 1, invoiceDate: r.invoice_date ?? r.doc_date, declareDate: r.declare_date,
      });
      return {
        eventId: r.event_id, docType: r.doc_type, docNo: r.doc_no, docDate: r.doc_date, manual: r.source_system === 'manual', trade: TRADE.includes(r.doc_type),
        branchCode: r.branch_code, partnerCode: r.partner_code ?? '', partnerName: r.partner_name ?? '', partnerTaxCode: r.partner_tax_code ?? '',
        docTotal: toNumber(r.doc_total), direction, hasInvoice: Boolean(r.inv_id), invoiceStatus: r.inv_status ?? '',
        invoiceNo: r.invoice_no ?? '', serial: r.invoice_serial ?? '', form: r.invoice_form ?? '', invoiceDate: r.invoice_date ?? '',
        name: r.buyer_name ?? '', taxCode: r.buyer_tax_code ?? '', address: r.buyer_address ?? '',
        amount: amount * (r.sign ?? 1), tax: tax * (r.sign ?? 1),
        declareMonth: r.declare_date ? r.declare_date.slice(0, 7) : '', deductible: r.deductible ?? true, paymentRef: r.payment_ref ?? '',
        patch: r.updated_at
          ? { invoice: r.patch_invoice ?? {}, declareMonth: r.declare_month ? r.declare_month.slice(0, 7) : '', deductible: r.p_deductible ?? true, paymentRef: r.p_payment_ref ?? '', note: r.note ?? '', updatedBy: r.updated_by ?? '', updatedAt: r.updated_at }
          : null,
        issues,
      };
    });
    const filtered = q.show === 'issues' ? rows.filter((r) => r.issues.length) : q.show === 'patched' ? rows.filter((r) => r.patch) : rows;
    return {
      rows: filtered,
      counts: { all: rows.length, issues: rows.filter((r) => r.issues.length).length, patched: rows.filter((r) => r.patch).length },
      truncated: false,
    };
  },

  async save(auth: AuthContext, eventId: string, input: TaxInfoInput) {
    const ev = await db.selectFrom('accounting_events').select(['id', 'doc_type', 'doc_no', 'source_system', 'status', 'payload']).where('tenant_id', '=', auth.tenantId).where('id', '=', eventId).executeTakeFirst();
    if (!ev) throw Errors.notFound('chứng từ');
    if (ev.status !== 'posted' && ev.status !== 'pending') throw Errors.conflict('Chỉ bổ sung cho chứng từ đã ghi sổ hoặc đang chờ định khoản');
    const invoice: InvoicePatch = {};
    for (const k of INVOICE_PATCH_FIELDS) {
      const v = input.invoice[k]?.trim();
      if (v) invoice[k] = k === 'buyerTaxCode' ? v.replace(/\s/g, '') : v;
    }
    if (invoice.date && !/^\d{4}-\d{2}-\d{2}$/.test(invoice.date)) throw Errors.validation('Ngày hoá đơn dạng YYYY-MM-DD');
    if (invoice.buyerTaxCode && !TAX_CODE_RE.test(invoice.buyerTaxCode)) throw Errors.validation('Mã số thuế phải gồm 10 số, 10 số – 3 số, hoặc 12 số');

    const current = await db.selectFrom('tax_invoices').select(['invoice_no', 'invoice_date']).where('event_id', '=', eventId).executeTakeFirst();
    if (hasInvoicePatch(invoice)) {
      if (ev.source_system === 'manual') throw Errors.conflict('Phiếu nhập tay: sửa hoá đơn ngay trên phiếu (mở phiếu, sửa dòng thuế, ghi lại)');
      if (!TRADE.includes(ev.doc_type)) throw Errors.conflict('Chỉ bổ sung hoá đơn cho chứng từ mua, bán, trả lại');
      const payload = ev.payload as { invoice?: { no?: string; date?: string }; internalOnly?: boolean };
      if (payload.internalOnly) throw Errors.conflict('Phiếu nội bộ không lập hoá đơn, không bổ sung hoá đơn');
      if (!(invoice.no ?? payload.invoice?.no ?? current?.invoice_no)) throw Errors.validation('Cần số hoá đơn');
      if (!(invoice.date ?? payload.invoice?.date ?? current?.invoice_date)) throw Errors.validation('Cần ngày hoá đơn');
    }
    const declareMonth = input.declareMonth ? `${input.declareMonth}-01` : null;
    if (declareMonth && !/^\d{4}-\d{2}-01$/.test(declareMonth)) throw Errors.validation('Kỳ kê khai dạng YYYY-MM');
    const invDate = invoice.date ?? current?.invoice_date ?? null;
    if (declareMonth && invDate && declareMonth.slice(0, 7) < invDate.slice(0, 7)) throw Errors.validation('Kỳ kê khai không được trước tháng của ngày hoá đơn');

    const before = await loadTaxPatch(db, eventId);
    const invoiceChanged = INVOICE_PATCH_FIELDS.some((k) => (before?.invoice[k] ?? '') !== (invoice[k] ?? ''));
    const empty = !hasInvoicePatch(invoice) && !declareMonth && input.deductible && !input.paymentRef.trim() && !input.note.trim();

    await db.transaction().execute(async (trx) => {
      if (empty) await trx.deleteFrom('tax_info_patches').where('event_id', '=', eventId).execute();
      else {
        const values = { invoice: JSON.stringify(invoice), declare_month: declareMonth, deductible: input.deductible, payment_ref: input.paymentRef.trim(), note: input.note.trim(), updated_by: auth.actor, updated_at: new Date() };
        await trx.insertInto('tax_info_patches').values({ tenant_id: auth.tenantId, event_id: eventId, ...values }).onConflict((oc) => oc.column('event_id').doUpdateSet(values)).execute();
      }
      await applyTaxFlags(trx, eventId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tax_info.save', objectType: 'accounting_event', objectId: ev.doc_no, before: before ?? null, after: empty ? null : { invoice, declareMonth, deductible: input.deductible, paymentRef: input.paymentRef, note: input.note } });
    });

    // Đổi hoá đơn: chứng từ chuyển về "chờ định khoản lại" ở trạm ACC14 (sổ vẫn theo lần định khoản trước cho tới khi
    // kế toán định khoản lại — bút toán và sổ hoá đơn khi đó theo thông tin mới). Không tự ghi sổ lại.
    if (invoiceChanged && ev.source_system !== 'manual' && TRADE.includes(ev.doc_type)) {
      await db.transaction().execute(async (trx) => {
        const row = await trx.selectFrom('accounting_events').select(['doc_type', 'doc_no', 'version', 'total']).where('id', '=', eventId).executeTakeFirstOrThrow();
        await trx.updateTable('accounting_events').set({ status: 'pending' }).where('id', '=', eventId).execute();
        await logPosting(trx, { tenantId: auth.tenantId, eventId, docType: row.doc_type, docNo: row.doc_no, version: row.version, action: 'receive', total: Number(row.total), message: 'Bổ sung thông tin thuế (ACC78): chờ định khoản lại', actor: auth.actor });
      });
    }
    return { eventId, pendingRepost: invoiceChanged };
  },

  async remove(auth: AuthContext, eventId: string) {
    return taxInfoService.save(auth, eventId, { invoice: {}, declareMonth: '', deductible: true, paymentRef: '', note: '' });
  },
};
