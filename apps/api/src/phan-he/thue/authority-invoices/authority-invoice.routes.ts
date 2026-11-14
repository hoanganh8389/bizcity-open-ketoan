// @bizcity-layer D modules/thue
/**
 * Hoá đơn từ cơ quan thuế (THUE01), cảnh báo hoá đơn rủi ro (THUE02), người nộp thuế rủi ro (THUE02).
 *
 *   PUT    /api/v1/authority-invoices                nhập hoá đơn tải từ cổng hoá đơn điện tử (Excel / XML), ghi đè theo
 *                                                    (chiều, MST người bán, ký hiệu, số); không ghi sổ
 *   GET    /api/v1/authority-invoices/reconcile?direction=&from=&to=   đối chiếu với sổ hoá đơn
 *   POST   /api/v1/authority-invoices/to-reference  chuyển hoá đơn trên cổng chưa có trong sổ thành chứng từ nguồn (CN06)
 *   DELETE /api/v1/authority-invoices?direction=&from=&to=   xoá dữ liệu cổng đã nhập trong khoảng ngày (để nhập lại)
 *   GET    /api/v1/invoice-risks?from=&to=           cảnh báo hoá đơn mua vào rủi ro
 *   GET    /api/v1/risky-taxpayers                   danh sách người nộp thuế rủi ro
 *   PUT    /api/v1/risky-taxpayers                   thêm / sửa hàng loạt theo mã số thuế
 *   DELETE /api/v1/risky-taxpayers/:id
 *
 * Đối chiếu theo khoá "ký hiệu 6 ký tự|số" (xem invoiceKey ở contracts); hoá đơn mua vào thêm MST người bán.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import {
  AUTHORITY_INVOICE_STATUS_LABELS, RISK_KINDS, authorityImportSchema, authorityStatusOf, invoiceKey, riskyTaxpayerInputSchema, taxCodeProblem,
  type RiskKind,
} from '@ketoan/contracts';
import { db, toNumber, type Db } from '../../../db/client.js';
import { authOf, requirePermission } from '../../../core/auth.js';
import { ok, idParamSchema } from '../../../core/http.js';
import { Errors } from '../../../core/errors.js';
import { writeAudit } from '../../../core/audit.js';
import { catalogEnsure } from '@bizcity/platform/masterdata/catalog-ensure';
import { ensureReferenceDocument } from '../../../modules/reference-documents/reference-document.routes.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — lệnh hoá đơn cơ quan thuế gác theo thao tác màn THUE01; người nộp thuế rủi ro (catalog:write) gác thêm qua lenh ở man-hinh-thue.ts (đóng góp)
import { quyenThaoTac } from '../../../modules/access/man-hinh.js';
import '../man-hinh-thue.js'; // đăng ký màn Thuế trước khi lệnh đọc quyền

const tags = ['Hoá đơn cơ quan thuế'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeQuery = z.object({ from: day, to: day });
const directionEnum = z.enum(['input', 'output']);

interface Side { serial: string; no: string; date: string; taxCode: string; name: string; beforeTax: number; tax: number; status: string }
export interface ReconcileRow {
  key: string;
  kind: 'matched' | 'amount_mismatch' | 'status_mismatch' | 'missing_in_books' | 'missing_on_portal';
  portal: (Side & { id: string; total: number; statusText: string; checkResult: string; referenceDocKey: string | null }) | null;
  book: (Side & { eventId: string; docNo: string; branchCode: string }) | null;
}
const vn = (d: string) => d.split('-').reverse().join('/');
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Đối chiếu hoá đơn trên cổng với sổ hoá đơn trong khoảng ngày (theo ngày hoá đơn). */
export async function reconcile(trx: Db, tenantId: string, direction: 'input' | 'output', from: string, to: string): Promise<ReconcileRow[]> {
  const books = await sql<{ event_id: string; doc_no: string; invoice_serial: string; invoice_no: string; invoice_date: string; buyer_tax_code: string; buyer_name: string; before_tax: string; tax: string; status: string; branch_code: string }>`
    SELECT i.event_id, i.doc_no, i.invoice_serial, i.invoice_no, i.invoice_date::text, i.buyer_tax_code, i.buyer_name,
           i.total_before_tax * i.sign AS before_tax, i.total_tax * i.sign AS tax, i.status, b.code AS branch_code
      FROM tax_invoices i JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ${tenantId} AND i.direction = ${direction} AND i.invoice_date BETWEEN ${from}::date AND ${to}::date`.execute(trx);
  const portal = await trx.selectFrom('authority_invoices').selectAll().where('tenant_id', '=', tenantId).where('direction', '=', direction)
    .where('invoice_date', '>=', from).where('invoice_date', '<=', to).execute();

  const keyOf = (serial: string, no: string, counterpartTax: string) => (direction === 'input' ? `${counterpartTax.trim()}|` : '') + invoiceKey(serial, no);
  const bookMap = new Map<string, NonNullable<ReconcileRow['book']>>();
  for (const r of books.rows) {
    const k = keyOf(r.invoice_serial, r.invoice_no, r.buyer_tax_code);
    const [serial, no] = invoiceKey(r.invoice_serial, r.invoice_no).split('|') as [string, string];
    const cur = bookMap.get(k);
    if (cur) {
      // Cùng một hoá đơn có nhiều dòng sổ (hàng trả lại, điều chỉnh): cộng dồn.
      cur.beforeTax += toNumber(r.before_tax);
      cur.tax += toNumber(r.tax);
      if (r.status === 'valid') cur.status = 'valid';
    } else {
      bookMap.set(k, { eventId: r.event_id, docNo: r.doc_no, branchCode: r.branch_code, serial, no, date: r.invoice_date, taxCode: r.buyer_tax_code, name: r.buyer_name, beforeTax: toNumber(r.before_tax), tax: toNumber(r.tax), status: r.status });
    }
  }
  const out: ReconcileRow[] = [];
  const seen = new Set<string>();
  for (const p of portal) {
    const counterpart = direction === 'input' ? p.seller_tax_code : p.buyer_tax_code;
    const k = keyOf(p.invoice_serial, p.invoice_no, p.seller_tax_code);
    seen.add(k);
    const side = {
      id: p.id, serial: p.invoice_serial, no: p.invoice_no, date: p.invoice_date, taxCode: counterpart, name: direction === 'input' ? p.seller_name : p.buyer_name,
      beforeTax: toNumber(p.total_before_tax), tax: toNumber(p.total_tax), total: toNumber(p.total_amount), status: p.status, statusText: p.status_text, checkResult: p.check_result, referenceDocKey: p.reference_doc_key,
    };
    const book = bookMap.get(k) ?? null;
    let kind: ReconcileRow['kind'];
    if (!book) kind = p.status === 'cancelled' || p.status === 'replaced' ? 'matched' : 'missing_in_books';
    else if ((p.status === 'cancelled' || p.status === 'replaced') && book.status === 'valid' && Math.abs(book.beforeTax) > 0) kind = 'status_mismatch';
    else if (Math.abs(book.beforeTax - side.beforeTax) > 1 || Math.abs(book.tax - side.tax) > 1) kind = 'amount_mismatch';
    else kind = 'matched';
    out.push({ key: k, kind, portal: side, book });
  }
  for (const [k, b] of bookMap) if (!seen.has(k)) out.push({ key: k, kind: 'missing_on_portal', portal: null, book: b });
  return out.sort((a, b) => ((a.portal ?? a.book)!.date).localeCompare((b.portal ?? b.book)!.date) || a.key.localeCompare(b.key));
}

export async function authorityInvoiceRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/authority-invoices/reconcile', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Đối chiếu hoá đơn trên cổng với sổ hoá đơn', querystring: rangeQuery.extend({ direction: directionEnum }) },
    handler: async (req) => {
      const q = req.query;
      const rows = await reconcile(db, authOf(req).tenantId, q.direction, q.from, q.to);
      const count = (k: ReconcileRow['kind']) => rows.filter((x) => x.kind === k).length;
      const portalCount = rows.filter((x) => x.portal).length;
      return ok({
        rows,
        summary: { portal: portalCount, books: rows.filter((x) => x.book).length, matched: count('matched'), amountMismatch: count('amount_mismatch'), statusMismatch: count('status_mismatch'), missingInBooks: count('missing_in_books'), missingOnPortal: count('missing_on_portal') },
      });
    },
  });

  r.get('/api/v1/invoice-risks', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Cảnh báo hoá đơn mua vào rủi ro', querystring: rangeQuery },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const rows = await reconcile(db, tenantId, 'input', q.from, q.to);
      const risky = await db.selectFrom('risky_taxpayers').selectAll().where('tenant_id', '=', tenantId).execute();
      const riskyBy = new Map(risky.map((x) => [x.tax_code, x]));
      // Tháng đã nhập dữ liệu cổng: hoá đơn sổ không có trên cổng mới đáng ngờ.
      const portalMonths = new Set(rows.filter((x) => x.portal).map((x) => x.portal!.date.slice(0, 7)));
      const out = [];
      for (const x of rows) {
        const inv = x.book ?? x.portal!;
        const reasons: { code: string; text: string }[] = [];
        const taxCode = inv.taxCode.trim();
        if (!taxCode) reasons.push({ code: 'no_tax_code', text: 'Hoá đơn mua vào không có mã số thuế người bán' });
        else {
          const p = taxCodeProblem(taxCode);
          if (p) reasons.push({ code: 'bad_tax_code', text: p });
          const rk = riskyBy.get(taxCode.slice(0, 10)) ?? riskyBy.get(taxCode);
          if (rk && (!rk.effective_date || inv.date >= rk.effective_date)) {
            reasons.push({ code: 'risky_seller', text: `Người bán: ${RISK_KINDS[rk.risk as RiskKind]}${rk.effective_date ? ` từ ${vn(rk.effective_date)}` : ''}${rk.source ? ` (${rk.source})` : ''}` });
          }
        }
        if (x.kind === 'status_mismatch') reasons.push({ code: 'portal_status', text: `Trên cổng: ${AUTHORITY_INVOICE_STATUS_LABELS[x.portal!.status as keyof typeof AUTHORITY_INVOICE_STATUS_LABELS]} (${x.portal!.statusText}) nhưng sổ vẫn ghi nhận` });
        if (x.kind === 'amount_mismatch') reasons.push({ code: 'amount', text: 'Tiền hàng / tiền thuế trên sổ khác trên cổng' });
        if (x.portal && /khonghople|saisot|tuchoi|khongduocchapnhan/.test(plain(x.portal.checkResult))) reasons.push({ code: 'portal_check', text: `Kết quả kiểm tra trên cổng: ${x.portal.checkResult}` });
        if (x.kind === 'missing_on_portal' && portalMonths.has(inv.date.slice(0, 7))) reasons.push({ code: 'not_on_portal', text: 'Không có trên cổng hoá đơn điện tử (tháng này đã nhập dữ liệu cổng)' });
        if (x.kind === 'missing_in_books' && reasons.length) reasons.push({ code: 'not_in_books', text: 'Chưa có trong sổ' });
        if (reasons.length) out.push({ key: x.key, serial: inv.serial, no: inv.no, date: inv.date, taxCode, name: inv.name, beforeTax: inv.beforeTax, tax: inv.tax, inBooks: Boolean(x.book), docNo: x.book?.docNo ?? '', eventId: x.book?.eventId ?? null, branchCode: x.book?.branchCode ?? '', reasons });
      }
      const byReason: Record<string, number> = {};
      for (const o of out) for (const rr of o.reasons) byReason[rr.code] = (byReason[rr.code] ?? 0) + 1;
      return ok({ rows: out, byReason, portalMonths: [...portalMonths].sort() });
    },
  });

  r.get('/api/v1/risky-taxpayers', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách người nộp thuế rủi ro' },
    handler: async (req) => {
      const rows = await db.selectFrom('risky_taxpayers').selectAll().where('tenant_id', '=', authOf(req).tenantId).orderBy('tax_code').execute();
      return ok(rows.map((x) => ({ id: x.id, taxCode: x.tax_code, name: x.name, risk: x.risk, effectiveDate: x.effective_date, source: x.source, note: x.note, updatedBy: x.updated_by, updatedAt: x.updated_at })));
    },
  });
  mountActions(app, authorityInvoiceWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const authorityInvoiceWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'thue.authority-invoice.update', title: 'Nhập hoá đơn tải từ cổng hoá đơn điện tử', tags,
    get permission() { return quyenThaoTac('thue.hoa-don-co-quan-thue', 'nhap'); }, /* [2026-11-13 08:00 PM kiennt] NT-HT-003 — gác theo thao tác màn THUE01 (đóng góp) */ effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: authorityImportSchema, output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/authority-invoices' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'authority_invoice' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const b = input;
      const rows = b.invoices.map((x) => {
        const [serial, no] = invoiceKey(x.invoiceSerial, x.invoiceNo).split('|') as [string, string];
        return {
          tenant_id: auth.tenantId, direction: b.direction, seller_tax_code: x.sellerTaxCode, seller_name: x.sellerName, buyer_tax_code: x.buyerTaxCode, buyer_name: x.buyerName,
          invoice_form: x.invoiceForm, invoice_serial: serial, invoice_no: no, invoice_date: x.invoiceDate,
          total_before_tax: x.totalBeforeTax, total_tax: x.totalTax, total_amount: x.totalAmount || x.totalBeforeTax + x.totalTax,
          status_text: x.statusText, status: authorityStatusOf(x.statusText), check_result: x.checkResult, source: b.source, file_name: b.fileName, imported_by: auth.actorName,
        };
      });
      // Trong một tệp có thể trùng hoá đơn: giữ dòng sau cùng.
      const uniq = [...new Map(rows.map((x) => [`${x.seller_tax_code}|${x.invoice_serial}|${x.invoice_no}`, x])).values()];
      const res = await sameTx(trx, async (trx) => {
        let inserted = 0;
        for (let i = 0; i < uniq.length; i += 500) {
          const part = await trx.insertInto('authority_invoices').values(uniq.slice(i, i + 500))
            .onConflict((oc) => oc.columns(['tenant_id', 'direction', 'seller_tax_code', 'invoice_serial', 'invoice_no']).doUpdateSet((eb) => ({
              seller_name: eb.ref('excluded.seller_name'), buyer_tax_code: eb.ref('excluded.buyer_tax_code'), buyer_name: eb.ref('excluded.buyer_name'),
              invoice_form: eb.ref('excluded.invoice_form'), invoice_date: eb.ref('excluded.invoice_date'),
              total_before_tax: eb.ref('excluded.total_before_tax'), total_tax: eb.ref('excluded.total_tax'), total_amount: eb.ref('excluded.total_amount'),
              status_text: eb.ref('excluded.status_text'), status: eb.ref('excluded.status'), check_result: eb.ref('excluded.check_result'),
              source: eb.ref('excluded.source'), file_name: eb.ref('excluded.file_name'), imported_by: eb.ref('excluded.imported_by'), imported_at: sql`now()`,
            })))
            .returning(sql<boolean>`(xmax = 0)`.as('inserted')).execute();
          inserted += part.filter((p) => p.inserted).length;
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'authority-invoices.import', objectType: 'authority_invoice', objectId: b.fileName || b.source, after: { direction: b.direction, source: b.source, count: uniq.length } });
        return { received: b.invoices.length, inserted, updated: uniq.length - inserted };
      });
      return res;
    },
  }),
  defineAction({
    id: 'thue.authority-invoice.to-reference', title: 'Chuyển hoá đơn trên cổng thành chứng từ nguồn để lập phiếu công nợ', tags,
    get permission() { return quyenThaoTac('thue.hoa-don-co-quan-thue', 'thamChieu'); }, /* [2026-11-13 08:00 PM kiennt] NT-HT-003 — gác theo thao tác màn THUE01 (đóng góp) */ effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(1000), branchCode: z.string().trim().min(1) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/authority-invoices/to-reference' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'authority_invoice' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const b = input;
      const res = await sameTx(trx, async (trx) => {
        const branch = await trx.selectFrom('branches').select('code').where('tenant_id', '=', auth.tenantId).where('code', '=', b.branchCode).executeTakeFirst();
        if (!branch) throw Errors.validation(`Chi nhánh ${b.branchCode} không có`);
        const items = await trx.selectFrom('authority_invoices').selectAll().where('tenant_id', '=', auth.tenantId).where('id', 'in', b.ids).execute();
        let created = 0;
        for (const x of items) {
          if (x.reference_doc_key) continue;
          const input = x.direction === 'input';
          const taxCode = input ? x.seller_tax_code : x.buyer_tax_code;
          const name = input ? x.seller_name : x.buyer_name;
          let partnerId: string | null = null;
          // [2026-11-03 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-MOD-2): đối tượng + chứng từ tham chiếu qua hàm của lõi
          if (taxCode) partnerId = await catalogEnsure.partnerByTaxCode(trx, auth.tenantId, { taxCode, name, kind: input ? 'supplier' : 'customer' });
          const docKey = `hddt:${x.direction}:${x.seller_tax_code}:${x.invoice_serial}:${x.invoice_no}`;
          await ensureReferenceDocument(trx, auth.tenantId, {
            kind: input ? 'purchase_invoice' : 'sales_invoice', doc_key: docKey, doc_no: `${x.invoice_serial}-${x.invoice_no}`,
            doc_date: x.invoice_date, partner_id: partnerId, branch_code: b.branchCode, total: x.total_amount,
            description: `Hoá đơn ${x.invoice_serial} số ${x.invoice_no} ngày ${vn(x.invoice_date)} — ${name}`, source_system: 'authority',
            payload: JSON.stringify({ invoiceForm: x.invoice_form, invoiceSerial: x.invoice_serial, invoiceNo: x.invoice_no, invoiceDate: x.invoice_date, taxCode, name, totalBeforeTax: toNumber(x.total_before_tax), totalTax: toNumber(x.total_tax) }),
          });
          await trx.updateTable('authority_invoices').set({ reference_doc_key: docKey }).where('id', '=', x.id).execute();
          created++;
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'authority-invoices.to-reference', objectType: 'authority_invoice', objectId: b.branchCode, after: { ids: b.ids.length, created } });
        return { created };
      });
      return res;
    },
  }),
  defineAction({
    id: 'thue.authority-invoice.delete', title: 'Xoá dữ liệu cổng đã nhập trong khoảng ngày', tags,
    get permission() { return quyenThaoTac('thue.hoa-don-co-quan-thue', 'xoa'); }, /* [2026-11-13 08:00 PM kiennt] NT-HT-003 — gác theo thao tác màn THUE01 (đóng góp) */ effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: rangeQuery.extend({ direction: directionEnum }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/authority-invoices' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'authority_invoice' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const q = input;
      const res = await trx.deleteFrom('authority_invoices').where('tenant_id', '=', auth.tenantId).where('direction', '=', q.direction)
        .where('invoice_date', '>=', q.from).where('invoice_date', '<=', q.to).executeTakeFirst();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'authority-invoices.delete', objectType: 'authority_invoice', objectId: `${q.direction}:${q.from}:${q.to}`, after: { deleted: Number(res.numDeletedRows) } });
      return { deleted: Number(res.numDeletedRows) };
    },
  }),
  defineAction({
    id: 'thue.risky-taxpayer.update', title: 'Thêm / sửa người nộp thuế rủi ro theo mã số thuế', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ items: z.array(riskyTaxpayerInputSchema).min(1).max(5000) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/risky-taxpayers' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'risky_taxpayer' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const items = [...new Map(input.items.map((x) => [x.taxCode, x])).values()];
      await sameTx(trx, async (trx) => {
        for (let i = 0; i < items.length; i += 500) {
          await trx.insertInto('risky_taxpayers').values(items.slice(i, i + 500).map((x) => ({
            tenant_id: auth.tenantId, tax_code: x.taxCode, name: x.name, risk: x.risk, effective_date: x.effectiveDate, source: x.source, note: x.note, updated_by: auth.actorName,
          }))).onConflict((oc) => oc.columns(['tenant_id', 'tax_code']).doUpdateSet((eb) => ({
            name: eb.ref('excluded.name'), risk: eb.ref('excluded.risk'), effective_date: eb.ref('excluded.effective_date'), source: eb.ref('excluded.source'),
            note: eb.ref('excluded.note'), updated_by: eb.ref('excluded.updated_by'), updated_at: sql`now()`,
          }))).execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'risky-taxpayers.upsert', objectType: 'risky_taxpayer', objectId: String(items.length), after: { count: items.length } });
      });
      return { saved: items.length };
    },
  }),
  defineAction({
    id: 'thue.risky-taxpayer.delete', title: 'Bỏ một người nộp thuế khỏi danh sách rủi ro', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/risky-taxpayers/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'risky_taxpayer', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const row = await trx.deleteFrom('risky_taxpayers').where('tenant_id', '=', auth.tenantId).where('id', '=', input.id).returningAll().executeTakeFirst();
      if (!row) throw Errors.notFound('người nộp thuế');
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'risky-taxpayers.delete', objectType: 'risky_taxpayer', objectId: row.tax_code, before: row });
      return { deleted: true };
    },
  }),
];
