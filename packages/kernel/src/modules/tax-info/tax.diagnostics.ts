// @bizcity-layer K kernel/tax
// [2026-11-02 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-11: kiểm L3 thuế GTGT và hoá đơn cho rulepack C03 vat-vn, C04 einvoice-vn — VAT_REDUCED_RATE, VAT_INPUT_NONCASH, INVOICE_FIELDS, INVOICE_ISSUE_DATE; cùng mã với lane DG-VAT-1/2, DG-EINV-1/2.
/**
 * Thuế GTGT và hoá đơn (lớp Doanh nghiệp, C03 / C04) — CHỈ ĐỌC, mức warn: phân tích để người dùng quyết định (R-VNC-10).
 *
 *   VAT_REDUCED_RATE     dòng bán ra dùng loại thuế có thuế suất giảm (mặc định 8%) ngoài thời gian giảm. Thuế suất + khoảng ngày
 *                        là SỐ LIỆU LUẬT, đọc từ tham số ca vn.vat-vn.rate.reduced_window.001 (rulepack), không viết cứng ở đây.
 *   VAT_INPUT_NONCASH    hoá đơn mua vào đủ ngưỡng chưa ghi chứng từ thanh toán không dùng tiền mặt — DÙNG LẠI taxIssues + NON_CASH_THRESHOLD
 *                        của màn Bổ sung thông tin thuế (ACC78), cùng cách ánh xạ cột; không viết lại luật.
 *   INVOICE_FIELDS       hoá đơn trong sổ thiếu ký hiệu, thiếu tên / mã số thuế người bán, mã số thuế sai dạng — cũng từ taxIssues.
 *   INVOICE_ISSUE_DATE   hoá đơn bán hàng hoá có ngày lập SAU ngày chứng từ bán (ngày chuyển giao) — không có số liệu luật.
 *
 * SQL / luật chép sang lane diagnostics (tests/conformance/diagnostics/tax.diag.mjs). Đổi một bên thì đổi bên kia (R-DIAG-9).
 */
import { sql, type RawBuilder } from 'kysely';
import { sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';
import { taxIssues } from './tax-info.service.js';
import { caseParams } from '../conformance/conformance.service.js';

const SAMPLE = 20;
/** Ca chứa tham số thời gian áp thuế suất giảm (NQ 204/2025/QH15). */
export const REDUCED_RATE_CASE = 'vn.vat-vn.rate.reduced_window.001';
const FIELD_ISSUES = new Set(['Thiếu ký hiệu hoá đơn', 'Thiếu tên người bán', 'Thiếu mã số thuế người bán', 'Mã số thuế không đúng dạng']);
const NONCASH_PREFIX = 'Từ 5 triệu';

function scoped(s: DiagScope, t: string, date: string): RawBuilder<boolean> {
  const parts: RawBuilder<unknown>[] = [sql`${sql.ref(`${t}.tenant_id`)} = ${s.tenantId}`];
  if (s.from) parts.push(sql`${sql.ref(`${t}.${date}`)} >= ${s.from}`);
  if (s.to) parts.push(sql`${sql.ref(`${t}.${date}`)} <= ${s.to}`);
  if (s.branchId) parts.push(sql`${sql.ref(`${t}.branch_id`)} = ${s.branchId}`);
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

interface InvoiceRow { doc_no: string; direction: 'input' | 'output'; invoice_serial: string; buyer_name: string; buyer_tax_code: string; total: string; deductible: boolean; payment_ref: string; sign: number; invoice_date: string; declare_date: string | null }

/** Hoá đơn trong sổ của phạm vi + điểm còn thiếu theo taxIssues (đúng cách màn ACC78 gọi). */
async function invoiceIssues(trx: Parameters<DiagCheck['run']>[0], s: DiagScope) {
  const rows = (await sql<InvoiceRow>`
    SELECT i.doc_no, i.direction, i.invoice_serial, i.buyer_name, i.buyer_tax_code, (i.total_before_tax + i.total_tax)::text AS total,
           i.deductible, i.payment_ref, i.sign, i.invoice_date::text AS invoice_date, i.declare_date::text AS declare_date
      FROM tax_invoices i WHERE ${scoped(s, 'i', 'invoice_date')} AND i.status = 'valid'
     ORDER BY i.invoice_date, i.id`.execute(trx)).rows;
  return rows.map((r) => ({
    docNo: r.doc_no,
    issues: taxIssues({
      direction: r.direction, hasInvoice: true, serial: r.invoice_serial, name: r.buyer_name, taxCode: r.buyer_tax_code, total: Number(r.total),
      deductible: r.deductible, paymentRef: r.payment_ref, sign: r.sign, invoiceDate: r.invoice_date, declareDate: r.declare_date,
    }),
    direction: r.direction,
  }));
}

export const TAX_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'VAT_REDUCED_RATE', layer: 'L3', level: 'warn', scoped: true,
    title: 'Thuế suất GTGT giảm (8%) chỉ dùng cho hàng bán ra trong thời gian giảm theo nghị quyết',
    fix: 'Chứng từ bán ra ngoài thời gian giảm thuế mà vẫn dùng loại thuế 8%: thuế đầu ra kê khai thiếu. Mẫu: khoá chứng từ. Kiểm lại loại thuế của mặt hàng / phiếu (10% sau khi hết giảm), lập hoá đơn điều chỉnh theo quy định. Thời gian giảm lấy từ rulepack vat-vn (đã duyệt hay chưa xem ở Kiểm chuẩn).',
    async run(trx, s) {
      const p = caseParams(REDUCED_RATE_CASE);
      const rate = Number(p.reduced_rate);
      const from = String(p.from);
      const to = String(p.to);
      if (!Number.isFinite(rate) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error(`Tham số ca ${REDUCED_RATE_CASE} không hợp lệ`);
      return sqlCounts(trx,
        sql`SELECT count(*)::int AS n FROM sales_lines l JOIN tax_codes tc ON tc.tenant_id = l.tenant_id AND tc.code = l.tax_code AND tc.direction = 'output'
             WHERE ${scoped(s, 'l', 'doc_date')} AND l.amount_before_tax <> 0 AND tc.rate = ${rate}`,
        sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total
              FROM (SELECT DISTINCT l.event_id FROM sales_lines l JOIN tax_codes tc ON tc.tenant_id = l.tenant_id AND tc.code = l.tax_code AND tc.direction = 'output'
                     WHERE ${scoped(s, 'l', 'doc_date')} AND l.amount_before_tax <> 0 AND tc.rate = ${rate}
                       AND (l.doc_date < ${from}::date OR l.doc_date > ${to}::date)) x
              JOIN accounting_events a ON a.id = x.event_id
             ORDER BY a.doc_date, a.doc_key LIMIT ${SAMPLE}`);
    },
  },
  {
    code: 'VAT_INPUT_NONCASH', layer: 'L3', level: 'warn', scoped: true,
    title: 'Hoá đơn mua vào từ 5 triệu đồng (gồm thuế) được khấu trừ có chứng từ thanh toán không dùng tiền mặt',
    fix: 'Thiếu chứng từ thanh toán không dùng tiền mặt thì thuế đầu vào của hoá đơn đó chưa đủ điều kiện khấu trừ. Mẫu: số chứng từ. Ghi chứng từ thanh toán ở Bổ sung thông tin thuế (ACC78); chưa thanh toán thì theo dõi, hoặc bỏ đánh dấu được khấu trừ.',
    async run(trx, s) {
      const rows = (await invoiceIssues(trx, s)).filter((r) => r.direction === 'input');
      const bad = rows.filter((r) => r.issues.some((x) => x.startsWith(NONCASH_PREFIX)));
      return { examined: rows.length, count: bad.length, sample: bad.slice(0, SAMPLE).map((r) => r.docNo) };
    },
  },
  {
    code: 'INVOICE_FIELDS', layer: 'L3', level: 'warn', scoped: true,
    title: 'Hoá đơn trong sổ có đủ ký hiệu, tên và mã số thuế người bán (mua vào), mã số thuế đúng dạng',
    fix: 'Hoá đơn thiếu ký hiệu / mã số thuế thì bảng kê và tờ khai không khớp dữ liệu cơ quan thuế. Mẫu: số chứng từ: điểm thiếu. Bổ sung ở Bổ sung thông tin thuế (ACC78).',
    async run(trx, s) {
      const rows = await invoiceIssues(trx, s);
      const bad = rows.map((r) => ({ docNo: r.docNo, miss: r.issues.filter((x) => FIELD_ISSUES.has(x)) })).filter((r) => r.miss.length);
      return { examined: rows.length, count: bad.length, sample: bad.slice(0, SAMPLE).map((r) => `${r.docNo}: ${r.miss.join(', ')}`) };
    },
  },
  {
    code: 'INVOICE_ISSUE_DATE', layer: 'L3', level: 'warn', scoped: true,
    title: 'Hoá đơn bán hàng hoá lập không sau ngày chứng từ bán (thời điểm chuyển giao)',
    fix: 'Ngày hoá đơn sau ngày giao hàng: lập hoá đơn chậm so với thời điểm chuyển giao quyền sở hữu, có thể bị xử phạt. Mẫu: khoá chứng từ. Dịch vụ / trường hợp đặc thù có thời điểm khác — người dùng tự đánh giá.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM tax_invoices i WHERE ${scoped(s, 'i', 'doc_date')} AND i.direction = 'output' AND i.doc_type = 'sale' AND i.status = 'valid'`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total
            FROM tax_invoices i JOIN accounting_events a ON a.id = i.event_id
           WHERE ${scoped(s, 'i', 'doc_date')} AND i.direction = 'output' AND i.doc_type = 'sale' AND i.status = 'valid' AND i.invoice_date > i.doc_date
           ORDER BY i.doc_date, a.doc_key LIMIT ${SAMPLE}`),
  },
];
