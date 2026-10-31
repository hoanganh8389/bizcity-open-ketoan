// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Các báo cáo tổng hợp nhỏ, mỗi báo cáo một truy vấn:
 *   - taxSummary      Bảng tổng hợp thuế GTGT theo chi nhánh
 *   - cashBalances    Bảng kê số dư tiền theo chi nhánh và tài khoản tiền
 *   - postingSummary  Bảng tổng hợp chứng từ theo cặp tài khoản Nợ / Có
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';

interface Scope { tenantId: string; from: string; to: string; branchIds: string[] | null }

/**
 * Bảng tổng hợp thuế GTGT. Mỗi (chi nhánh, tháng) một dòng:
 *   khấu trừ kỳ trước chuyển sang = dư Nợ tài khoản 133 tại đầu tháng (hoặc tại "từ ngày" với tháng đầu)
 *   thuế đầu vào trong kỳ         = phát sinh Nợ − Có của 133 trong tháng
 *   doanh thu, thuế đầu ra        = theo sổ hoá đơn bán ra trong tháng (hàng trả lại ghi âm)
 *   thuế phải nộp cuối kỳ         = thuế đầu ra − thuế đầu vào − khấu trừ kỳ trước  (âm = còn được khấu trừ)
 * Thuế đầu vào đọc ở sổ kế toán; thuế đầu ra đọc sổ hoá đơn.
 */
export async function taxSummary(a: Scope) {
  const branchGl = a.branchIds ? sql`AND g.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const branchInv = a.branchIds ? sql`AND i.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const res = await sql<{ code: string; name: string; month: string; carried: string; input_tax: string; revenue: string; output_tax: string; invoices: string }>`
    WITH m AS (
      SELECT gs::date AS ms,
             GREATEST(gs::date, ${a.from}::date) AS fs,
             LEAST((gs + interval '1 month' - interval '1 day')::date, ${a.to}::date) AS me
        FROM generate_series(date_trunc('month', ${a.from}::date), ${a.to}::date, interval '1 month') gs
    ), gl AS (
      SELECT g.branch_id, m.ms,
             SUM(CASE WHEN g.posting_date < m.fs THEN g.debit - g.credit ELSE 0 END) AS carried,
             SUM(CASE WHEN g.posting_date >= m.fs THEN g.debit - g.credit ELSE 0 END) AS input_tax
        FROM bizcity_read.ledger_balances_daily g
        JOIN m ON g.posting_date <= m.me
       WHERE g.tenant_id = ${a.tenantId}
         AND g.account_code LIKE '133%' ${branchGl}
       GROUP BY g.branch_id, m.ms
    ), inv AS (
      SELECT i.branch_id, date_trunc('month', i.period_date)::date AS ms,
             SUM(i.total_before_tax * i.sign) AS revenue,
             SUM(i.total_tax * i.sign) AS output_tax,
             COUNT(*) AS invoices
        FROM tax_invoices i
       WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.status <> 'cancelled'
         AND i.period_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
       GROUP BY i.branch_id, 2
    ), k AS (
      SELECT branch_id, ms FROM gl UNION SELECT branch_id, ms FROM inv
    )
    SELECT b.code, b.name, to_char(k.ms, 'MM/YYYY') AS month,
           COALESCE(gl.carried, 0) AS carried, COALESCE(gl.input_tax, 0) AS input_tax,
           COALESCE(inv.revenue, 0) AS revenue, COALESCE(inv.output_tax, 0) AS output_tax, COALESCE(inv.invoices, 0) AS invoices
      FROM k
      JOIN branches b ON b.id = k.branch_id
      LEFT JOIN gl ON gl.branch_id = k.branch_id AND gl.ms = k.ms
      LEFT JOIN inv ON inv.branch_id = k.branch_id AND inv.ms = k.ms
     ORDER BY b.code, k.ms`.execute(db);

  const t = { carried: 0, inputTax: 0, revenue: 0, outputTax: 0, payable: 0, invoices: 0 };
  const rows = res.rows
    .map((r) => {
      // Chỉ dư Nợ 133 mới là số được khấu trừ chuyển sang.
      const carried = Math.max(toCents(toNumber(r.carried)), 0);
      const inputTax = toCents(toNumber(r.input_tax));
      const revenue = toCents(toNumber(r.revenue));
      const outputTax = toCents(toNumber(r.output_tax));
      return { r, carried, inputTax, revenue, outputTax, payable: outputTax - inputTax - carried };
    })
    .filter((x) => x.carried || x.inputTax || x.revenue || x.outputTax)
    .map(({ r, carried, inputTax, revenue, outputTax, payable }) => {
      t.carried += carried; t.inputTax += inputTax; t.revenue += revenue; t.outputTax += outputTax; t.payable += payable; t.invoices += Number(r.invoices);
      return { branchCode: r.code, branchName: r.name, month: r.month, invoices: Number(r.invoices), carried: fromCents(carried), inputTax: fromCents(inputTax), revenue: fromCents(revenue), outputTax: fromCents(outputTax), payable: fromCents(payable) };
    });
  return { rows, totals: { invoices: t.invoices, carried: fromCents(t.carried), inputTax: fromCents(t.inputTax), revenue: fromCents(t.revenue), outputTax: fromCents(t.outputTax), payable: fromCents(t.payable) } };
}

/** Bảng kê số dư tiền: dư đầu, thu (Nợ), chi (Có), dư cuối của từng tài khoản tiền ở từng chi nhánh. */
export async function cashBalances(a: Scope & { prefixes: string[] }) {
  const branchFilter = a.branchIds ? sql`AND g.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const likes = a.prefixes.map((p) => `${p}%`);
  const res = await sql<{ branch_code: string; branch_name: string; account_code: string; account_name: string | null; opening: string; debit: string; credit: string }>`
    SELECT b.code AS branch_code, b.name AS branch_name, g.account_code, MAX(ac.name) AS account_name,
           SUM(CASE WHEN g.posting_date <  ${a.from}::date THEN g.debit - g.credit ELSE 0 END) AS opening,
           SUM(CASE WHEN g.posting_date >= ${a.from}::date THEN g.debit  ELSE 0 END) AS debit,
           SUM(CASE WHEN g.posting_date >= ${a.from}::date THEN g.credit ELSE 0 END) AS credit
      FROM bizcity_read.ledger_balances_daily g
      JOIN branches b ON b.id = g.branch_id
      LEFT JOIN accounts ac ON ac.tenant_id = g.tenant_id AND ac.code = g.account_code
     WHERE g.tenant_id = ${a.tenantId}
       AND g.account_code LIKE ANY(${likes}::text[]) AND g.posting_date <= ${a.to}::date ${branchFilter}
     GROUP BY b.code, b.name, g.account_code
     ORDER BY b.code, g.account_code`.execute(db);

  const t = { opening: 0, debit: 0, credit: 0, closing: 0 };
  const rows = res.rows
    .map((r) => {
      const opening = toCents(toNumber(r.opening));
      const debit = toCents(toNumber(r.debit));
      const credit = toCents(toNumber(r.credit));
      return { branchCode: r.branch_code, branchName: r.branch_name, accountCode: r.account_code, accountName: r.account_name ?? '', opening, debit, credit, closing: opening + debit - credit };
    })
    .filter((r) => r.opening || r.debit || r.credit)
    .map((r) => {
      t.opening += r.opening; t.debit += r.debit; t.credit += r.credit; t.closing += r.closing;
      return { ...r, opening: fromCents(r.opening), debit: fromCents(r.debit), credit: fromCents(r.credit), closing: fromCents(r.closing) };
    });
  return { rows, totals: { opening: fromCents(t.opening), debit: fromCents(t.debit), credit: fromCents(t.credit), closing: fromCents(t.closing) } };
}

/**
 * Bảng tổng hợp chứng từ: tổng số tiền theo từng cặp tài khoản Nợ / Có trong kỳ (bảng tổng hợp định khoản).
 * Ghép dòng Nợ với dòng Có cùng bút toán, cùng cặp (pair_no). Chỉ lấy bút toán đang hiệu lực.
 * Gom thêm theo các cột đã chọn: chi nhánh, tháng (yyyyMM), loại chứng từ, khoản mục, lý do.
 * Bỏ nhóm có tổng bằng 0. Số dư đầu kỳ không có tài khoản đối ứng nên không nằm trong bảng này.
 */
export type PostingSummaryGroup = 'branch' | 'month' | 'docType' | 'costItem' | 'reason';
export async function postingSummary(a: Scope & { docType?: string; groups: PostingSummaryGroup[] }) {
  const branchFilter = a.branchIds ? sql`AND d.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const typeFilter = a.docType ? sql`AND e.doc_type = ${a.docType}` : sql``;
  const on = (g: PostingSummaryGroup) => a.groups.includes(g);
  const res = await sql<{ branch_code: string; month: string; doc_type: string; cost_item: string; reason_code: string; debit_account: string; credit_account: string; amount: string; entries: string }>`
    SELECT ${on('branch') ? sql`br.code` : sql`''`} AS branch_code,
           ${on('month') ? sql`to_char(d.posting_date, 'YYYYMM')` : sql`''`} AS month,
           ${on('docType') ? sql`e.doc_type` : sql`''`} AS doc_type,
           ${on('costItem') ? sql`COALESCE(d.dims->>'costItem', c.dims->>'costItem', '')` : sql`''`} AS cost_item,
           ${on('reason') ? sql`COALESCE(e.reason_code, '')` : sql`''`} AS reason_code,
           d.account_code AS debit_account, c.account_code AS credit_account,
           SUM(d.debit) AS amount, COUNT(DISTINCT d.entry_id) AS entries
      FROM bizcity_read.ledger_lines d
      JOIN bizcity_read.ledger_entries e ON e.id = d.entry_id
      JOIN branches br ON br.id = d.branch_id
      JOIN bizcity_read.ledger_lines c ON c.entry_id = d.entry_id AND c.pair_no = d.pair_no AND c.credit <> 0
     WHERE d.tenant_id = ${a.tenantId} AND d.debit <> 0
       AND d.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND e.status = 'posted' AND NOT e.is_reversal
       ${branchFilter} ${typeFilter}
     GROUP BY 1, 2, 3, 4, 5, d.account_code, c.account_code
    HAVING SUM(d.debit) <> 0
     ORDER BY 1, 2, 3, d.account_code, c.account_code, 4, 5`.execute(db);
  const rows = res.rows.map((r) => ({
    branchCode: r.branch_code, month: r.month, docType: r.doc_type, costItem: r.cost_item, reasonCode: r.reason_code,
    debitAccount: r.debit_account, creditAccount: r.credit_account, amount: toNumber(r.amount), entries: Number(r.entries),
  }));
  return { groups: a.groups, rows, total: fromCents(rows.reduce((s, r) => s + toCents(r.amount), 0)) };
}
