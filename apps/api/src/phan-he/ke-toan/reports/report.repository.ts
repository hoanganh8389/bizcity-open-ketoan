// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Truy vấn số liệu cho báo cáo. Viết SQL rõ ràng bằng `sql` của Kysely để dễ đọc, dễ tối ưu.
 * Báo cáo tổng hợp đọc bizcity_read.ledger_balances_daily (nhỏ, nhanh); báo cáo chi tiết đọc bizcity_read.ledger_lines —
 * khung nhìn chỉ đọc của Kernel (ledger.query, migration 0043), không đọc thẳng bảng ledger_* (SC-KERNEL-7).
 */
import { sql } from 'kysely';
import type { Db } from '../../../db/client.js';
import { otherSide } from '../../../kernel/public.js';

export interface BalanceRow {
  account_code: string;
  partner_id: string;
  branch_id?: string;
  opening: string; // Nợ − Có trước kỳ
  debit: string; // phát sinh Nợ trong kỳ
  credit: string; // phát sinh Có trong kỳ
}

export const reportRepository = {
  branchIds(db: Db, tenantId: string, codes: string[]) {
    return db.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).where('code', 'in', codes).execute();
  },

  /** Đầu kỳ + phát sinh theo (tài khoản, đối tượng) cho cân đối phát sinh. */
  async balances(db: Db, a: { tenantId: string; from: string; to: string; branchIds: string[] | null; accountPrefix?: string; accountCodes?: string[]; byBranch?: boolean }): Promise<BalanceRow[]> {
    const branchFilter = a.branchIds ? sql`AND branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const accFilter = a.accountPrefix ? sql`AND account_code LIKE ${a.accountPrefix + '%'}` : a.accountCodes ? sql`AND account_code = ANY(${a.accountCodes}::text[])` : sql``;
    const branchCol = a.byBranch ? sql`branch_id::text` : sql`''`;
    const res = await sql<BalanceRow>`
      SELECT account_code, partner_id, ${branchCol} AS branch_id,
             SUM(CASE WHEN posting_date <  ${a.from}::date THEN debit - credit ELSE 0 END) AS opening,
             SUM(CASE WHEN posting_date >= ${a.from}::date THEN debit  ELSE 0 END)        AS debit,
             SUM(CASE WHEN posting_date >= ${a.from}::date THEN credit ELSE 0 END)        AS credit
        FROM bizcity_read.ledger_balances_daily
       WHERE tenant_id = ${a.tenantId}
         AND posting_date <= ${a.to}::date
         ${branchFilter} ${accFilter}
       GROUP BY 1, 2, 3`.execute(db);
    return res.rows;
  },

  /** Số dư đầu (Nợ − Có) của tài khoản trước ngày `from`, tách theo đối tượng. */
  async openingByPartner(db: Db, a: { tenantId: string; accountPrefix: string; from: string; branchIds: string[] | null; partnerId?: string }) {
    const branchFilter = a.branchIds ? sql`AND branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const partnerFilter = a.partnerId ? sql`AND partner_id = ${a.partnerId}` : sql``;
    const res = await sql<{ partner_id: string; net: string }>`
      SELECT partner_id, SUM(debit - credit) AS net
        FROM bizcity_read.ledger_balances_daily
       WHERE tenant_id = ${a.tenantId}
         AND account_code LIKE ${a.accountPrefix + '%'}
         AND posting_date < ${a.from}::date
         ${branchFilter} ${partnerFilter}
       GROUP BY partner_id`.execute(db);
    return res.rows;
  },

  /**
   * Số dư đầu kỳ của tài khoản cho MỘT mã hàng (sổ chi tiết lọc theo mã hàng, vd 156 chi tiết theo mã): cộng thẳng các dòng sổ
   * mang mã đó trước kỳ (bảng số dư ngày không tách theo mã). Bút toán gốc đã sửa và bút toán ghi số âm triệt tiêu nhau nên cộng cả.
   */
  async openingBySku(db: Db, a: { tenantId: string; accountPrefix: string; from: string; branchIds: string[] | null; partnerId?: string; sku: string }) {
    const branchFilter = a.branchIds ? sql`AND branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const partnerFilter = a.partnerId ? sql`AND partner_id = ${a.partnerId}` : sql``;
    const res = await sql<{ partner_id: string | null; net: string }>`
      SELECT partner_id, SUM(debit - credit) AS net
        FROM bizcity_read.ledger_lines
       WHERE tenant_id = ${a.tenantId}
         AND account_code LIKE ${a.accountPrefix + '%'}
         AND product_sku = ${a.sku}
         AND posting_date < ${a.from}::date
         ${branchFilter} ${partnerFilter}
       GROUP BY partner_id`.execute(db);
    return res.rows;
  },

  /**
   * Dòng sổ của tài khoản trong kỳ, kèm tài khoản đối ứng (các dòng cùng bút toán, cùng pair_no, khác bên)
   * và diễn giải của dòng đối ứng.
   *   counterPrefix  chỉ lấy dòng có tài khoản đối ứng bắt đầu bằng đầu số này
   *   docType        chỉ lấy một loại chứng từ
   *   cashOrder      trong cùng ngày: dòng thu (Nợ) trước, dòng chi (Có) sau — thứ tự của sổ quỹ
   */
  async accountLines(db: Db, a: { tenantId: string; accountPrefix: string; from: string; to: string; branchIds: string[] | null; partnerId?: string; showCorrections?: boolean; counterPrefix?: string; docType?: string; cashOrder?: boolean; sku?: string }) {
    const branchFilter = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const skuFilter = a.sku ? sql`AND l.product_sku = ${a.sku}` : sql``;
    const partnerFilter = a.partnerId ? sql`AND l.partner_id = ${a.partnerId}` : sql``;
    const typeFilter = a.docType ? sql`AND e.doc_type = ${a.docType}` : sql``;
    const counterFilter = a.counterPrefix
      ? sql`AND EXISTS (SELECT 1 FROM bizcity_read.ledger_lines o WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id
                        AND ${otherSide()} AND o.account_code LIKE ${a.counterPrefix + '%'})`
      : sql``;
    // Bút toán gốc đã sửa và bút toán ghi số âm của nó triệt tiêu nhau (cùng ngày, cùng tài khoản)
    // → mặc định ẩn để sổ chỉ hiện số đang hiệu lực; số dư luỹ kế không đổi.
    const correctionFilter = a.showCorrections ? sql`` : sql`AND e.status = 'posted' AND NOT e.is_reversal`;
    const order = a.cashOrder ? sql`l.posting_date, (l.debit = 0), e.entry_no, l.line_no` : sql`l.posting_date, e.entry_no, l.line_no`;
    const res = await sql<{
      id: string;
      entry_id: string;
      posting_date: string;
      entry_no: string;
      doc_no: string;
      doc_type: string;
      invoice_no: string | null;
      event_id: string | null;
      description: string;
      entry_description: string;
      account_code: string;
      debit: string;
      credit: string;
      counter_accounts: string | null;
      counter_note: string | null;
      partner_id: string | null;
      partner_code: string | null;
      partner_name: string | null;
      branch_code: string;
      reason_code: string | null;
      dims: Record<string, string> | null;
      product_sku: string | null;
      product_name: string | null;
    }>`
      SELECT l.id, l.entry_id, l.posting_date::text AS posting_date, e.entry_no, e.doc_no, e.doc_type, e.invoice_no, e.event_id,
             COALESCE(NULLIF(l.description, ''), e.description) AS description, e.description AS entry_description,
             l.account_code, l.debit, l.credit,
             (SELECT string_agg(DISTINCT o.account_code, ', ')
                FROM bizcity_read.ledger_lines o
               WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id
                 AND ${otherSide()}) AS counter_accounts,
             (SELECT NULLIF(o.description, '')
                FROM bizcity_read.ledger_lines o
               WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id
                 AND ${otherSide()}
               ORDER BY o.line_no LIMIT 1) AS counter_note,
             l.partner_id, p.code AS partner_code, p.name AS partner_name, br.code AS branch_code, e.reason_code, l.dims,
             l.product_sku, pr.name AS product_name
        FROM bizcity_read.ledger_lines l
        JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
        JOIN branches br ON br.id = l.branch_id
        LEFT JOIN partners p ON p.id = l.partner_id
        LEFT JOIN products pr ON pr.tenant_id = l.tenant_id AND pr.sku = l.product_sku
       WHERE l.tenant_id = ${a.tenantId}
         AND l.account_code LIKE ${a.accountPrefix + '%'}
         AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
         ${branchFilter} ${partnerFilter} ${correctionFilter} ${typeFilter} ${counterFilter} ${skuFilter}
       ORDER BY ${order}`.execute(db);
    return res.rows;
  },

  /**
   * Sổ nhật ký chung: mọi dòng sổ cái trong kỳ theo trình tự thời gian, kèm tài khoản đối ứng.
   * Mặc định ẩn bút toán gốc đã sửa và bút toán ghi số âm của nó (triệt tiêu nhau).
   */
  async journal(db: Db, a: { tenantId: string; from: string; to: string; branchIds: string[] | null; docType?: string; search?: string; showCorrections?: boolean; corrections?: 'hide' | 'all' | 'only'; accountPrefix?: string; counterPrefix?: string; sku?: string; limit: number; offset: number }) {
    const filters = [
      a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``,
      a.accountPrefix ? sql`AND l.account_code LIKE ${a.accountPrefix + '%'}` : sql``,
      a.sku ? sql`AND l.product_sku = ${a.sku}` : sql``,
      // TK đối ứng: dòng phía bên kia của cùng cặp định khoản.
      a.counterPrefix
        ? sql`AND EXISTS (SELECT 1 FROM bizcity_read.ledger_lines o WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id
                            AND ${otherSide()} AND o.account_code LIKE ${a.counterPrefix + '%'})`
        : sql``,
      a.docType ? sql`AND e.doc_type = ${a.docType}` : sql``,
      // hide: chỉ bút toán đang hiệu lực; all: thêm bút toán đã bị đảo và bút toán ghi số âm; only: chỉ hai loại đó.
      (a.corrections ?? (a.showCorrections ? 'all' : 'hide')) === 'all' ? sql``
        : (a.corrections ?? 'hide') === 'only' ? sql`AND (e.status <> 'posted' OR e.is_reversal)`
        : sql`AND e.status = 'posted' AND NOT e.is_reversal`,
      a.search ? sql`AND (e.doc_no ILIKE ${'%' + a.search + '%'} OR e.entry_no ILIKE ${'%' + a.search + '%'} OR e.description ILIKE ${'%' + a.search + '%'} OR l.account_code LIKE ${a.search + '%'})` : sql``,
    ];
    const where = sql`
        FROM bizcity_read.ledger_lines l
        JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
        JOIN branches br ON br.id = l.branch_id
        LEFT JOIN partners p ON p.id = l.partner_id
        LEFT JOIN products pr ON pr.tenant_id = l.tenant_id AND pr.sku = l.product_sku
       WHERE l.tenant_id = ${a.tenantId}
         AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
         ${sql.join(filters, sql` `)}`;
    const rows = await sql<{
      id: string; entry_id: string; posting_date: string; entry_no: string; doc_no: string; doc_type: string; invoice_no: string | null;
      description: string; account_code: string; debit: string; credit: string; counter_accounts: string | null;
      partner_code: string | null; partner_name: string | null; branch_code: string; is_reversal: boolean; entry_status: string;
      product_sku: string | null; product_name: string | null; doc_date: string; reason_code: string | null; entry_description: string;
      source_type: string | null;
    }>`
      SELECT l.id, l.entry_id, l.posting_date::text AS posting_date, e.doc_date::text AS doc_date, e.entry_no, e.doc_no, e.doc_type, e.invoice_no,
             e.reason_code, e.description AS entry_description,
             COALESCE(NULLIF(l.description, ''), e.description) AS description,
             l.account_code, l.debit, l.credit,
             (SELECT string_agg(DISTINCT o.account_code, ', ')
                FROM bizcity_read.ledger_lines o
               WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id
                 AND ${otherSide()}) AS counter_accounts,
             p.code AS partner_code, p.name AS partner_name, br.code AS branch_code, e.is_reversal, e.status AS entry_status,
             l.product_sku, pr.name AS product_name,
             -- Loại phiếu ở nguồn (export_adjust = phiếu xuất điều chỉnh, ghi sổ như phiếu bán nội bộ có lý do).
             (SELECT ev.payload->'sourceRef'->>'type' FROM accounting_events ev WHERE ev.id = e.event_id) AS source_type
        ${where}
       ORDER BY l.posting_date, e.doc_no, e.entry_no, l.line_no
       LIMIT ${a.limit} OFFSET ${a.offset}`.execute(db);
    const totals = await sql<{ n: string; entries: string; debit: string; credit: string }>`
      SELECT COUNT(*) AS n, COUNT(DISTINCT l.entry_id) AS entries, COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
        ${where}`.execute(db);
    return { rows: rows.rows, totals: totals.rows[0]! };
  },

  /** Hoá đơn bán ra (hoặc mua vào) trong kỳ, tách theo nhóm thuế suất. */
  async salesInvoiceLines(db: Db, a: { tenantId: string; from: string; to: string; branchIds: string[] | null; direction?: 'output' | 'input' }) {
    const branchFilter = a.branchIds ? sql`AND i.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const res = await sql<{
      tax_invoice_id: string;
      invoice_form: string;
      invoice_serial: string;
      invoice_no: string;
      invoice_date: string;
      doc_no: string;
      doc_type: string;
      buyer_name: string;
      buyer_tax_code: string;
      branch_code: string;
      report_group: string;
      tax_rate: string;
      amount: string;
      tax: string;
      event_id: string;
      doc_date: string;
      partner_code: string | null;
      partner_name: string | null;
    }>`
      SELECT i.id AS tax_invoice_id, i.invoice_form, i.invoice_serial, i.invoice_no, i.invoice_date::text AS invoice_date, i.doc_no, i.doc_type,
             i.doc_date::text AS doc_date, p.code AS partner_code, p.name AS partner_name,
             i.buyer_name, i.buyer_tax_code, br.code AS branch_code, l.report_group,
             MAX(l.tax_rate) AS tax_rate,
             SUM(l.amount_before_tax) * i.sign AS amount,
             SUM(l.tax_amount) * i.sign AS tax,
             i.event_id
        FROM tax_invoices i
        JOIN tax_invoice_lines l ON l.tax_invoice_id = i.id
        JOIN branches br ON br.id = i.branch_id
        LEFT JOIN partners p ON p.id = i.partner_id
       WHERE i.tenant_id = ${a.tenantId} AND i.direction = ${a.direction ?? 'output'}
         AND i.status <> 'cancelled'
         AND i.period_date BETWEEN ${a.from}::date AND ${a.to}::date
         ${branchFilter}
       GROUP BY i.id, br.code, l.report_group, p.code, p.name
       ORDER BY i.doc_date, i.invoice_no, i.doc_no`.execute(db);
    return res.rows;
  },

  /**
   * Số liệu tổng quan: doanh thu, thuế, tiền thu theo ngày (sổ kế toán).
   * Doanh thu chỉ lấy bên Có của 511, trả lại chỉ lấy bên Nợ của 521 để bút toán kết chuyển cuối kỳ
   * (ghi vào bên còn lại) không làm số về 0.
   */
  async dailyRevenue(db: Db, a: { tenantId: string; from: string; to: string }) {
    const res = await sql<{ day: string; revenue: string; returns: string; tax: string; cash_in: string }>`
      SELECT posting_date::text AS day,
             SUM(CASE WHEN account_code LIKE '511%' THEN credit ELSE 0 END) AS revenue,
             SUM(CASE WHEN account_code LIKE '521%' THEN debit ELSE 0 END) AS returns,
             SUM(CASE WHEN account_code LIKE '3331%' THEN credit - debit ELSE 0 END) AS tax,
             SUM(CASE WHEN account_code LIKE '11%' THEN debit - credit ELSE 0 END) AS cash_in
        FROM bizcity_read.ledger_balances_daily
       WHERE tenant_id = ${a.tenantId}
         AND posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       GROUP BY posting_date ORDER BY posting_date`.execute(db);
    return res.rows;
  },
};
