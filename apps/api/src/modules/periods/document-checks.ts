// @bizcity-layer K kernel/periods
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — documentChecks chuyển từ báo cáo (modules/reports/control-reports.ts) về Kernel kỳ kế toán: khoá kỳ (K) không còn import module báo cáo (D)
/**
 * Kiểm chứng từ, hoá đơn và toàn vẹn sổ của một khoảng ngày — Kernel dùng trước khi khoá kỳ (period.routes.ts), báo cáo
 * "Kiểm tra chứng từ" (phan-he/ke-toan/reports) đọc qua kernel/public.ts. Kernel đọc thẳng bảng sổ (R-BOUND-3 chỉ áp ngoài Kernel).
 */
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';

/**
 * Kiểm tra chứng từ, hoá đơn trong kỳ: gom các trường hợp hay làm số liệu lệch khi đối chiếu với
 * nhà cung cấp hoá đơn điện tử hoặc với hệ thống bán hàng. Mỗi mục trả số lượng và toàn bộ dòng.
 */
export async function documentChecks(a: { tenantId: string; from: string; to: string; branchIds: string[] | null }) {
  const branchDoc = a.branchIds ? sql`AND d.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const branchInv = a.branchIds ? sql`AND i.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const docCols = sql`d.id, d.doc_no, d.doc_date::text AS doc_date, d.doc_type, d.invoice_no, d.total, d.status, d.error_message, b.code AS branch_code`;
  type DocRow = { id: string; doc_no: string; doc_date: string; doc_type: string; invoice_no: string | null; total: string; status: string; error_message: string | null; branch_code: string };
  const doc = (r: DocRow, note = '') => ({ id: r.id, docNo: r.doc_no, docDate: r.doc_date, docType: r.doc_type, invoiceNo: r.invoice_no ?? '', total: toNumber(r.total), branchCode: r.branch_code, note: note || r.error_message || '' });

  const errors = await sql<DocRow>`
    SELECT ${docCols} FROM accounting_events d JOIN branches b ON b.id = d.branch_id
     WHERE d.tenant_id = ${a.tenantId} AND d.status = 'error' AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  const noInvoice = await sql<DocRow & { n: string; sum: string }>`
    SELECT ${docCols}, COUNT(*) OVER () AS n, SUM(d.total) OVER () AS sum
      FROM accounting_events d JOIN branches b ON b.id = d.branch_id
     WHERE d.tenant_id = ${a.tenantId} AND d.status = 'posted' AND d.doc_type IN ('sale', 'sale_return')
       AND d.invoice_no IS NULL AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  const abnormal = await sql<{ event_id: string; doc_no: string; invoice_no: string; invoice_serial: string; invoice_date: string; status: string; amount: string; branch_code: string }>`
    SELECT i.event_id, i.doc_no, i.invoice_no, i.invoice_serial, i.invoice_date::text AS invoice_date, i.status,
           (i.total_before_tax + i.total_tax) * i.sign AS amount, b.code AS branch_code
      FROM tax_invoices i JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.status <> 'valid'
       AND i.invoice_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
     ORDER BY i.invoice_date, i.invoice_no`.execute(db);

  const duplicates = await sql<{ invoice_serial: string; invoice_no: string; n: string; docs: string; branch_codes: string }>`
    SELECT i.invoice_serial, i.invoice_no, COUNT(*) AS n, string_agg(i.doc_no, ', ' ORDER BY i.doc_no) AS docs, string_agg(DISTINCT b.code, ', ') AS branch_codes
      FROM tax_invoices i JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.status <> 'cancelled' AND i.sign = 1
       AND i.invoice_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
     GROUP BY i.invoice_serial, i.invoice_no
    HAVING COUNT(*) > 1
     ORDER BY i.invoice_serial, i.invoice_no`.execute(db);

  // Số hoá đơn nhảy cóc theo từng ký hiệu, chỉ xét hoá đơn bán (không tính hàng trả lại).
  // Số hoá đơn có thể kèm chữ ở đầu (ví dụ "C26TNH31079"): lấy dãy chữ số CUỐI làm số thứ tự,
  // phần đứng trước ghép vào ký hiệu để mỗi dải số được xét riêng.
  const gaps = await sql<{ invoice_serial: string; first_no: string; last_no: string; issued: string; missing: string; sample: string | null }>`
    WITH nums AS (
      SELECT DISTINCT
             -- Phần chữ đứng đầu số hoá đơn thường chính là ký hiệu: không ghép lặp hai lần.
             CASE WHEN regexp_replace(i.invoice_no, '[0-9]+$', '') = '' THEN i.invoice_serial
                  WHEN i.invoice_serial = '' OR position(i.invoice_serial in i.invoice_no) = 1 THEN regexp_replace(i.invoice_no, '[0-9]+$', '')
                  ELSE i.invoice_serial || ' ' || regexp_replace(i.invoice_no, '[0-9]+$', '') END AS invoice_serial,
             substring(i.invoice_no from '[0-9]+$')::bigint AS n
        FROM tax_invoices i
       WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.sign = 1 AND i.invoice_no ~ '[0-9]{1,15}$' AND i.invoice_no !~ '[0-9]{16,}$'
         AND i.invoice_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
    ), edges AS (
      SELECT invoice_serial, n, LEAD(n) OVER (PARTITION BY invoice_serial ORDER BY n) AS next_n FROM nums
    )
    SELECT invoice_serial, MIN(n)::text AS first_no, MAX(n)::text AS last_no, COUNT(*)::text AS issued,
           COALESCE(SUM(GREATEST(next_n - n - 1, 0)), 0)::text AS missing,
           string_agg(CASE WHEN next_n - n > 1 THEN (n + 1)::text || CASE WHEN next_n - n > 2 THEN '–' || (next_n - 1)::text ELSE '' END END, ', ' ORDER BY n) AS sample
      FROM edges GROUP BY invoice_serial
    HAVING COALESCE(SUM(GREATEST(next_n - n - 1, 0)), 0) > 0
     ORDER BY invoice_serial`.execute(db);

  // --- Kiểm tra toàn vẹn sổ (bình thường cả ba mục đều rỗng).
  // Phiếu trả lại không nối được phiếu gốc: không gửi originalDocKey, phiếu gốc chưa nhận, hoặc phiếu gốc đã huỷ.
  const orphanReturns = await sql<DocRow & { original_key: string | null; original_status: string | null }>`
    SELECT ${docCols}, d.payload->>'originalDocKey' AS original_key, o.status AS original_status
      FROM accounting_events d JOIN branches b ON b.id = d.branch_id
      LEFT JOIN accounting_events o ON o.tenant_id = d.tenant_id AND o.doc_key = d.payload->>'originalDocKey'
     WHERE d.tenant_id = ${a.tenantId} AND d.status = 'posted' AND d.doc_type IN ('sale_return', 'purchase_return')
       AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
       AND (o.id IS NULL OR o.status = 'cancelled')
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  // Chứng từ và bút toán lệch nhau: đã ghi sổ mà không còn bút toán hiệu lực, hoặc đã huỷ mà còn bút toán hiệu lực.
  const entryMismatch = await sql<DocRow & { active: string }>`
    SELECT ${docCols}, x.active
      FROM accounting_events d JOIN branches b ON b.id = d.branch_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS active FROM ledger_entries e
         WHERE e.event_id = d.id AND e.status = 'posted' AND e.reverses_entry_id IS NULL) x
     WHERE d.tenant_id = ${a.tenantId} AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
       AND ((d.status = 'posted' AND x.active = 0 AND d.total <> 0) OR (d.status = 'cancelled' AND x.active > 0))
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  // Sổ tổng hợp (số phát sinh theo ngày) lệch sổ chi tiết (dòng bút toán) trong kỳ.
  const branchLine = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const branchBal = a.branchIds ? sql`AND g.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const balanceMismatch = await sql<{ branch_code: string; account_code: string; day: string; line_debit: string; line_credit: string; bal_debit: string; bal_credit: string }>`
    WITH li AS (
      SELECT l.branch_id, l.account_code, l.posting_date, SUM(l.debit) AS debit, SUM(l.credit) AS credit
        FROM ledger_lines l
       WHERE l.tenant_id = ${a.tenantId} AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchLine}
       GROUP BY 1, 2, 3
    ), ba AS (
      SELECT g.branch_id, g.account_code, g.posting_date, SUM(g.debit) AS debit, SUM(g.credit) AS credit
        FROM ledger_balances_daily g
       WHERE g.tenant_id = ${a.tenantId} AND g.posting_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchBal}
       GROUP BY 1, 2, 3
    )
    SELECT b.code AS branch_code, COALESCE(li.account_code, ba.account_code) AS account_code,
           COALESCE(li.posting_date, ba.posting_date)::text AS day,
           COALESCE(li.debit, 0) AS line_debit, COALESCE(li.credit, 0) AS line_credit, COALESCE(ba.debit, 0) AS bal_debit, COALESCE(ba.credit, 0) AS bal_credit
      FROM li FULL JOIN ba USING (branch_id, account_code, posting_date)
      JOIN branches b ON b.id = COALESCE(li.branch_id, ba.branch_id)
     WHERE COALESCE(li.debit, 0) <> COALESCE(ba.debit, 0) OR COALESCE(li.credit, 0) <> COALESCE(ba.credit, 0)
     ORDER BY 3, 2`.execute(db);

  return {
    orphanReturns: {
      count: orphanReturns.rows.length,
      rows: orphanReturns.rows.map((r) => doc(r, !r.original_key ? 'Không gửi mã phiếu gốc' : r.original_status === 'cancelled' ? `Phiếu gốc ${r.original_key} đã huỷ` : `Chưa nhận phiếu gốc ${r.original_key}`)),
    },
    entryMismatch: { count: entryMismatch.rows.length, rows: entryMismatch.rows.map((r) => doc(r, r.status === 'cancelled' ? `Đã huỷ nhưng còn ${r.active} bút toán hiệu lực` : 'Đã ghi sổ nhưng không có bút toán hiệu lực')) },
    balanceMismatch: {
      count: balanceMismatch.rows.length,
      rows: balanceMismatch.rows.map((r) => ({ branchCode: r.branch_code, accountCode: r.account_code, day: r.day, lineDebit: toNumber(r.line_debit), lineCredit: toNumber(r.line_credit), balanceDebit: toNumber(r.bal_debit), balanceCredit: toNumber(r.bal_credit) })),
    },
    errors: { count: errors.rows.length, rows: errors.rows.map((r) => doc(r)) },
    noInvoice: { count: Number(noInvoice.rows[0]?.n ?? 0), total: toNumber(noInvoice.rows[0]?.sum ?? 0), rows: noInvoice.rows.map((r) => doc(r)) },
    abnormalInvoices: {
      count: abnormal.rows.length,
      rows: abnormal.rows.map((r) => ({ id: r.event_id, docNo: r.doc_no, invoiceNo: r.invoice_no, invoiceSerial: r.invoice_serial, invoiceDate: r.invoice_date, status: r.status, amount: toNumber(r.amount), branchCode: r.branch_code })),
    },
    duplicateInvoices: { count: duplicates.rows.length, rows: duplicates.rows.map((r) => ({ invoiceSerial: r.invoice_serial, invoiceNo: r.invoice_no, times: Number(r.n), docs: r.docs, branchCodes: r.branch_codes })) },
    invoiceGaps: {
      count: gaps.rows.length,
      rows: gaps.rows.map((r) => ({ invoiceSerial: r.invoice_serial, firstNo: r.first_no, lastNo: r.last_no, issued: Number(r.issued), missing: Number(r.missing), sample: (r.sample ?? '').slice(0, 300) })),
    },
  };
}
