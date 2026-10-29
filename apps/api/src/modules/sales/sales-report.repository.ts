/**
 * Truy vấn báo cáo bán hàng trên sales_lines / sales_payments.
 * Mọi số lượng, số tiền đã nhân sign → hàng trả lại ra số âm, cộng lại là số thuần.
 */
import { sql, type RawBuilder } from 'kysely';
import type { Db } from '../../db/client.js';

/** Điều kiện lọc dùng chung cho các báo cáo bán hàng. */
export interface SalesFilter {
  tenantId: string;
  from: string;
  to: string;
  branchIds: string[] | null;
  /** all: cả bán và trả lại; sale: chỉ bán; return: chỉ trả lại. */
  kind: 'all' | 'sale' | 'return';
  /** all: mọi chứng từ; invoiced: chỉ chứng từ có hoá đơn; internal: chỉ chứng từ không có hoá đơn. */
  scope: 'all' | 'invoiced' | 'internal';
  /** Tìm theo mã hàng, tên hàng, số chứng từ, tên/mã khách. */
  search?: string;
}

export const SALES_GROUPS = ['document', 'day', 'month', 'branch', 'product', 'customer', 'taxCode', 'brand', 'industry', 'itemGroup', 'itemType', 'customerGroup', 'department'] as const;
export type SalesGroupBy = (typeof SALES_GROUPS)[number];

/** Cột khoá và nhãn của từng cách nhóm. */
const classJoin = (kind: string, col: string) => sql`LEFT JOIN products pr ON pr.tenant_id = l.tenant_id AND pr.sku = l.sku
        LEFT JOIN item_classes ic ON ic.tenant_id = l.tenant_id AND ic.kind = ${kind} AND ic.code = ${sql.ref(`pr.${col}`)}`;
/** Cột khoá, nhãn của từng cách nhóm; `join`: bảng nối thêm (phân loại hàng, nhóm khách) — mặt hàng chưa phân loại gom vào khoá rỗng. */
export const GROUP_SQL: Record<SalesGroupBy, { key: RawBuilder<unknown>; label: RawBuilder<unknown>; extra: RawBuilder<unknown>; join?: RawBuilder<unknown> }> = {
  // Theo phiếu: khoá = ngày + số phiếu (sắp theo thời gian), nhãn = số phiếu, thông tin thêm do byDocument() bổ sung.
  document: { key: sql`l.doc_date::text || ' ' || d.doc_no || ' ' || l.event_id::text`, label: sql`MAX(d.doc_no)`, extra: sql`MAX(l.event_id::text)` },
  day: { key: sql`l.doc_date::text`, label: sql`l.doc_date::text`, extra: sql`''` },
  month: { key: sql`to_char(l.doc_date, 'YYYY-MM')`, label: sql`MAX(to_char(l.doc_date, 'MM/YYYY'))`, extra: sql`''` },
  branch: { key: sql`br.code`, label: sql`MAX(br.name)`, extra: sql`''` },
  product: { key: sql`l.sku`, label: sql`MAX(l.name)`, extra: sql`MAX(l.unit)` },
  customer: { key: sql`COALESCE(p.code, '')`, label: sql`COALESCE(MAX(p.name), '')`, extra: sql`COALESCE(MAX(p.tax_code), '')` },
  taxCode: { key: sql`l.tax_code`, label: sql`l.tax_code`, extra: sql`''` },
  brand: { key: sql`COALESCE(pr.brand_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, extra: sql`''`, join: classJoin('brand', 'brand_code') },
  industry: { key: sql`COALESCE(pr.industry_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, extra: sql`''`, join: classJoin('industry', 'industry_code') },
  itemGroup: { key: sql`COALESCE(pr.group_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, extra: sql`''`, join: classJoin('group', 'group_code') },
  itemType: { key: sql`COALESCE(pr.type_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, extra: sql`''`, join: classJoin('type', 'type_code') },
  customerGroup: { key: sql`COALESCE(p.group_code, '')`, label: sql`COALESCE(MAX(pg.name), '')`, extra: sql`''`, join: sql`LEFT JOIN partner_groups pg ON pg.tenant_id = l.tenant_id AND pg.code = p.group_code` },
  // Bộ phận của chi nhánh (cửa hàng): xem theo điểm bán, HO, chi nhánh.
  department: { key: sql`COALESCE(br.department_code, '')`, label: sql`COALESCE(MAX(dd.name), '')`, extra: sql`''`, join: sql`LEFT JOIN dimensions dd ON dd.tenant_id = l.tenant_id AND dd.kind = 'department' AND dd.code = br.department_code` },
};

export function where(f: SalesFilter): RawBuilder<unknown> {
  const parts: RawBuilder<unknown>[] = [sql`l.tenant_id = ${f.tenantId}`, sql`l.doc_date BETWEEN ${f.from}::date AND ${f.to}::date`];
  if (f.branchIds) parts.push(sql`l.branch_id = ANY(${f.branchIds}::bigint[])`);
  // Phiếu xuất điều chỉnh (xuất dùng, tặng, huỷ… — phiếu bán nội bộ có lý do) không phải doanh số: xem ở màn riêng (HH02).
  parts.push(sql`(d.payload #>> '{extra,exportAdjust}') IS DISTINCT FROM 'true'`);
  if (f.kind === 'sale') parts.push(sql`l.sign = 1`);
  if (f.kind === 'return') parts.push(sql`l.sign = -1`);
  // Có hoá đơn = chứng từ đã ghi sổ hoá đơn (bảng kê bán ra).
  if (f.scope === 'invoiced') parts.push(sql`EXISTS (SELECT 1 FROM tax_invoices ti WHERE ti.event_id = l.event_id)`);
  if (f.scope === 'internal') parts.push(sql`NOT EXISTS (SELECT 1 FROM tax_invoices ti WHERE ti.event_id = l.event_id)`);
  if (f.search) {
    const like = `%${f.search}%`;
    parts.push(sql`(l.sku ILIKE ${like} OR l.name ILIKE ${like} OR d.doc_no ILIKE ${like} OR d.invoice_no ILIKE ${like} OR p.name ILIKE ${like} OR p.code ILIKE ${like})`);
  }
  return sql.join(parts, sql` AND `);
}

export const FROM = sql`
        FROM sales_lines l
        JOIN accounting_events d ON d.id = l.event_id
        JOIN branches br ON br.id = l.branch_id
        LEFT JOIN partners p ON p.id = l.partner_id`;

export interface SalesDetailRow {
  id: string;
  doc_date: string;
  event_id: string;
  doc_no: string;
  invoice_no: string | null;
  sign: number;
  has_invoice: boolean;
  branch_code: string;
  partner_code: string | null;
  partner_name: string | null;
  sku: string;
  name: string;
  unit: string;
  qty: string;
  unit_price: string;
  amount: string;
  discount: string;
  tax_code: string;
  tax: string;
  is_gift: boolean;
  invoice_serial: string | null;
  invoice_form: string | null;
  tax_rate: string | null;
}

export interface SalesSummaryRow {
  key: string;
  label: string;
  extra: string;
  sale_docs: string;
  return_docs: string;
  sale_qty: string;
  sale_amount: string;
  return_qty: string;
  return_amount: string;
  discount: string;
  tax: string;
}

export const salesReportRepository = {
  /** Từng dòng hàng trong kỳ (phân trang). */
  async detail(db: Db, f: SalesFilter, page: { limit: number; offset: number }): Promise<SalesDetailRow[]> {
    const res = await sql<SalesDetailRow>`
      SELECT l.id, l.doc_date::text AS doc_date, l.event_id, d.doc_no, d.invoice_no, l.sign, EXISTS (SELECT 1 FROM tax_invoices ti WHERE ti.event_id = l.event_id) AS has_invoice,
             br.code AS branch_code, p.code AS partner_code, p.name AS partner_name,
             l.sku, l.name, l.unit,
             l.qty * l.sign AS qty, l.unit_price,
             l.amount_before_tax * l.sign AS amount, l.discount * l.sign AS discount,
             l.tax_code, l.tax_amount * l.sign AS tax, l.is_gift,
             d.payload->'invoice'->>'serial' AS invoice_serial, d.payload->'invoice'->>'form' AS invoice_form,
             (SELECT tc.rate FROM tax_codes tc WHERE tc.tenant_id = l.tenant_id AND tc.code = l.tax_code) AS tax_rate
        ${FROM}
       WHERE ${where(f)}
       ORDER BY l.doc_date, d.doc_no, l.line_no
       LIMIT ${page.limit} OFFSET ${page.offset}`.execute(db);
    return res.rows;
  },

  /** Tổng của toàn bộ kết quả lọc (không phụ thuộc trang). */
  async detailTotals(db: Db, f: SalesFilter) {
    const res = await sql<{ lines: string; docs: string; qty: string; amount: string; discount: string; tax: string }>`
      SELECT COUNT(*) AS lines, COUNT(DISTINCT l.event_id) AS docs,
             COALESCE(SUM(l.qty * l.sign), 0) AS qty,
             COALESCE(SUM(l.amount_before_tax * l.sign), 0) AS amount,
             COALESCE(SUM(l.discount * l.sign), 0) AS discount,
             COALESCE(SUM(l.tax_amount * l.sign), 0) AS tax
        ${FROM}
       WHERE ${where(f)}`.execute(db);
    return res.rows[0]!;
  },

  /** Tổng hợp theo một tiêu chí: bán, trả lại, thuế. */
  async summary(db: Db, f: SalesFilter, groupBy: SalesGroupBy): Promise<SalesSummaryRow[]> {
    const g = GROUP_SQL[groupBy];
    const res = await sql<SalesSummaryRow>`
      SELECT ${g.key} AS key, ${g.label} AS label, ${g.extra} AS extra,
             COUNT(DISTINCT l.event_id) FILTER (WHERE l.sign = 1)  AS sale_docs,
             COUNT(DISTINCT l.event_id) FILTER (WHERE l.sign = -1) AS return_docs,
             COALESCE(SUM(l.qty) FILTER (WHERE l.sign = 1), 0)                AS sale_qty,
             COALESCE(SUM(l.amount_before_tax) FILTER (WHERE l.sign = 1), 0)  AS sale_amount,
             COALESCE(SUM(l.qty) FILTER (WHERE l.sign = -1), 0)               AS return_qty,
             COALESCE(SUM(l.amount_before_tax) FILTER (WHERE l.sign = -1), 0) AS return_amount,
             COALESCE(SUM(l.discount * l.sign), 0)                            AS discount,
             COALESCE(SUM(l.tax_amount * l.sign), 0)                          AS tax
        ${FROM}
        ${g.join ?? sql``}
       WHERE ${where(f)}
       GROUP BY 1
       ORDER BY 1`.execute(db);
    return res.rows;
  },

  /**
   * Thông tin đầu phiếu cho cách xem "Theo phiếu": ngày, số hoá đơn, chi nhánh, khách hàng, loại phiếu,
   * và tiền thanh toán theo từng hình thức (ghi nợ không tính là đã thu).
   */
  async documentHeads(db: Db, tenantId: string, ids: string[]) {
    if (!ids.length) return [];
    const res = await sql<{ id: string; doc_date: string; doc_no: string; doc_type: string; invoice_no: string | null; invoice_serial: string | null; branch_code: string; partner_code: string | null; partner_name: string | null; methods: string | null; paid: string; on_credit: string; offset: string }>`
      -- Tiền thanh toán tính MỘT lần cho cả danh sách phiếu (sales_payments là bảng ảo bung JSON phiếu thu: gọi lặp theo
      -- từng phiếu thì chậm theo bình phương số phiếu).
      WITH sp AS MATERIALIZED (
        SELECT sp.event_id, sp.method_code, sp.amount, pm.code IS NOT NULL AS known, COALESCE(pm.is_receivable, false) AS receivable
          FROM sales_payments sp
          LEFT JOIN payment_methods pm ON pm.tenant_id = sp.tenant_id AND pm.code = sp.method_code
         WHERE sp.tenant_id = ${tenantId} AND sp.event_id = ANY(${ids}::bigint[])
      ), agg AS (
        SELECT event_id, string_agg(DISTINCT method_code, ', ') AS methods,
               COALESCE(SUM(amount) FILTER (WHERE NOT receivable), 0) AS paid,
               COALESCE(SUM(amount) FILTER (WHERE known AND receivable), 0) AS on_credit,
               COALESCE(SUM(amount) FILTER (WHERE known AND receivable AND method_code IN ('DOITRU', 'DOI_TRU')), 0) AS offset
          FROM sp GROUP BY event_id
      )
      SELECT d.id, d.doc_date::text AS doc_date, d.doc_no, d.doc_type, d.invoice_no, d.payload->'invoice'->>'serial' AS invoice_serial,
             br.code AS branch_code, p.code AS partner_code, p.name AS partner_name,
             a.methods, COALESCE(a.paid, 0) AS paid, COALESCE(a.on_credit, 0) AS on_credit, COALESCE(a.offset, 0) AS offset
        FROM accounting_events d
        JOIN branches br ON br.id = d.branch_id
        LEFT JOIN partners p ON p.id = d.partner_id
        LEFT JOIN agg a ON a.event_id = d.id
       WHERE d.tenant_id = ${tenantId} AND d.id = ANY(${ids}::bigint[])`.execute(db);
    return res.rows;
  },

  /** Tiền thu (bán) và tiền trả khách (trả lại) theo ngày hoặc chi nhánh × hình thức thanh toán. */
  async payments(db: Db, a: { tenantId: string; from: string; to: string; branchIds: string[] | null; groupBy: 'day' | 'branch' }) {
    const branchFilter = a.branchIds ? sql`AND s.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const key = a.groupBy === 'branch' ? sql`br.code` : sql`s.doc_date::text`;
    const label = a.groupBy === 'branch' ? sql`MAX(br.name)` : sql`s.doc_date::text`;
    const res = await sql<{ key: string; label: string; method_code: string; received: string; refunded: string }>`
      SELECT ${key} AS key, ${label} AS label, s.method_code,
             COALESCE(SUM(s.amount) FILTER (WHERE s.sign = 1), 0)  AS received,
             COALESCE(SUM(s.amount) FILTER (WHERE s.sign = -1), 0) AS refunded
        FROM sales_payments s
        JOIN branches br ON br.id = s.branch_id
       WHERE s.tenant_id = ${a.tenantId}
         AND s.doc_date BETWEEN ${a.from}::date AND ${a.to}::date
         ${branchFilter}
       GROUP BY 1, s.method_code
       ORDER BY 1, s.method_code`.execute(db);
    return res.rows;
  },

  /**
   * Báo cáo thu tiền bán hàng: mỗi dòng phân bổ của phiếu thanh toán khách hàng (đã định khoản) trỏ về một phiếu bán /
   * hoàn; lọc theo ngày thu và chi nhánh của phiếu bán. Phiếu trả tiền khách (chiều chi) và phiếu hoàn mang số âm.
   */
  async receipts(db: Db, a: { tenantId: string; from: string; to: string; branchIds: string[] | null }) {
    const branchFilter = a.branchIds ? sql`AND inv.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
    const res = await sql<{
      id: string; pay_id: string; pay_no: string; pay_date: string; direction: string | null; inv_no: string; inv_date: string; inv_type: string; inv_total: string | null;
      amount: string | null; partner_code: string | null; partner_name: string | null; branch_name: string | null; inv_branch_name: string | null;
      bank: string | null; method_code: string | null; method_name: string | null; reason_code: string | null; note: string | null;
    }>`
      SELECT pay.id::text || '-' || l.ord AS id, pay.id::text AS pay_id, ev.doc_no AS pay_no, pay.doc_date::text AS pay_date,
             pay.payload->>'direction' AS direction,
             inv.doc_no AS inv_no, inv.doc_date::text AS inv_date, inv.doc_type AS inv_type, inv.payload->'totals'->>'total' AS inv_total,
             l.j->>'amount' AS amount, pa.code AS partner_code, pa.name AS partner_name,
             b.name AS branch_name, ib.name AS inv_branch_name,
             pm.bank_account_code AS bank, pay.payload->>'methodCode' AS method_code, pm.name AS method_name,
             (SELECT e.reason_code FROM ledger_entries e WHERE e.event_id = pay.id AND e.reverses_entry_id IS NULL ORDER BY e.id DESC LIMIT 1) AS reason_code,
             COALESCE(NULLIF(l.j->>'note', ''), pay.payload->>'description') AS note
        FROM posted_event_payloads pay
        JOIN accounting_events ev ON ev.id = pay.id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pay.payload->'lines', '[]'::jsonb)) WITH ORDINALITY AS l(j, ord)
        JOIN accounting_events inv ON inv.tenant_id = pay.tenant_id AND inv.doc_key = l.j->>'invoiceDocKey' AND inv.doc_type IN ('sale', 'sale_return')
        LEFT JOIN partners pa ON pa.id = COALESCE(pay.partner_id, inv.partner_id)
        LEFT JOIN branches b ON b.id = pay.branch_id
        LEFT JOIN branches ib ON ib.id = inv.branch_id
        LEFT JOIN payment_methods pm ON pm.tenant_id = pay.tenant_id AND pm.code = pay.payload->>'methodCode'
       WHERE pay.tenant_id = ${a.tenantId} AND pay.doc_type = 'customer_payment'
         AND pay.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchFilter}
       ORDER BY pay.doc_date, ev.doc_no, l.ord`.execute(db);
    return res.rows;
  },

  paymentMethods(db: Db, tenantId: string) {
    return db.selectFrom('payment_methods').select(['code', 'name', 'is_receivable', 'sort_order']).where('tenant_id', '=', tenantId).orderBy('code').execute();
  },
};
