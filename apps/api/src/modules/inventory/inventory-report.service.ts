// @bizcity-layer D modules/kho
/**
 * Báo cáo kho đọc inventory_movements:
 *   - stockMovement  Báo cáo nhập xuất tồn: theo (chi nhánh, mặt hàng) tồn đầu, nhập, xuất, tồn cuối, kèm phần mua hàng
 *                    (nhập mua − trả NCC) và giá vốn hàng bán (xuất bán − khách trả lại)
 *   - stockSummary   Như trên nhưng gom theo phân loại hàng (nhãn hiệu, ngành hàng, nhóm, loại) hoặc chi nhánh;
 *                    gom theo nhà cung cấp / nhóm nhà cung cấp thì chỉ có phần mua hàng (BC-01, BC-02)
 *   - itemLedger     Sổ chi tiết hàng hoá: từng lần vào / ra của một mặt hàng, kèm tồn luỹ kế
 *   - items          Danh sách mặt hàng để chọn (danh mục hàng + mã đã có phát sinh kho)
 *
 * Giá trị một lần vào / ra = giá trị ghi trên chứng từ; chứng từ chưa có giá trị thì lấy số lượng ×
 * đơn giá vốn bình quân của tháng đó (inventory_costs, chuyển đến lấy đơn giá của nhóm gửi). Tháng chưa
 * tính giá vốn thì giá trị để trống và báo số dòng "chưa định giá".
 */
import { warehouseScope } from '../warehouses/warehouse.routes.js';
import { sql } from 'kysely';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth.js';

const KIND_LABEL: Record<string, string> = {
  purchase: 'Nhập mua',
  purchase_return: 'Trả nhà cung cấp',
  sale: 'Xuất bán',
  sale_return: 'Khách trả lại',
  transfer_out: 'Chuyển kho đi',
  transfer_in: 'Chuyển kho đến',
  adjust_in: 'Điều chỉnh tăng',
  adjust_out: 'Điều chỉnh giảm',
};

export async function scope(auth: AuthContext, branchCodes?: string[], warehouseCodes?: string[]) {
  let branchIds: string[] | null = null;
  const wh = await warehouseScope(auth.tenantId, warehouseCodes);
  if (branchCodes?.length) {
    branchIds = (await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', 'in', branchCodes).execute()).map((r) => r.id);
    if (!branchIds.length) throw Errors.validation('Chi nhánh không tồn tại');
  }
  return { branchIds, wh };
}

/** Lần vào / ra kèm giá trị (giá trị chứng từ, hoặc số lượng × đơn giá bình quân của tháng). */
/**
 * wh: lọc theo kho — dòng ghi đúng mã kho đã chọn, cộng dòng không ghi mã kho của chi nhánh có kho mặc định trong số đã chọn.
 */
export function valuedMovements(a: { tenantId: string; to: string; branchIds: string[] | null; sku?: string; search?: string; wh?: { codes: string[]; defaultBranchIds: string[] } | null }) {
  return sql`
    SELECT m.id, m.event_id, m.branch_id, m.counter_branch_id, m.warehouse_code, m.sku, m.name, m.unit, m.kind, m.doc_type, m.doc_date, m.qty,
           COALESCE(m.amount, ROUND(m.qty * c.unit_cost)) AS val,
           (m.amount IS NULL AND c.unit_cost IS NULL) AS uncosted
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
      LEFT JOIN inventory_costs c
        ON c.tenant_id = m.tenant_id AND c.sku = m.sku
       AND c.year = EXTRACT(YEAR FROM m.doc_date)::int AND c.month = EXTRACT(MONTH FROM m.doc_date)::int
       AND c.cost_group = CASE WHEN m.kind = 'transfer_in' AND cb.id IS NOT NULL THEN COALESCE(cb.accounting_unit_id, 0) ELSE COALESCE(b.accounting_unit_id, 0) END
     WHERE m.tenant_id = ${a.tenantId} AND m.doc_date <= ${a.to}::date
       ${a.branchIds ? sql`AND m.branch_id = ANY(${a.branchIds}::bigint[])` : sql``}
       ${a.wh ? sql`AND (m.warehouse_code = ANY(${a.wh.codes}::text[]) OR (m.warehouse_code = '' AND m.branch_id = ANY(${a.wh.defaultBranchIds}::bigint[])))` : sql``}
       ${a.sku ? sql`AND m.sku = ${a.sku}` : sql``}
       ${a.search ? sql`AND (m.sku ILIKE ${'%' + a.search + '%'} OR m.name ILIKE ${'%' + a.search + '%'})` : sql``}`;
}

const num = (v: string | null) => (v === null ? 0 : Number(v));

export const STOCK_GROUPS = ['branch', 'brand', 'industry', 'itemGroup', 'itemType', 'postingGroup', 'supplier', 'supplierGroup'] as const;
export type StockGroupBy = (typeof STOCK_GROUPS)[number];
const classJoin = (kind: string, col: string) => sql`LEFT JOIN products pr ON pr.tenant_id = b.tenant_id AND pr.sku = mv.sku
        LEFT JOIN item_classes ic ON ic.tenant_id = b.tenant_id AND ic.kind = ${kind} AND ic.code = ${sql.ref(`pr.${col}`)}`;
const partnerJoin = sql`JOIN accounting_events d ON d.id = mv.event_id LEFT JOIN partners p ON p.id = d.partner_id`;
/** Khoá, nhãn, bảng nối của từng cách gom; hàng chưa phân loại / phiếu không có đối tượng gom vào khoá rỗng. */
const STOCK_GROUP_SQL: Record<StockGroupBy, { key: ReturnType<typeof sql>; label: ReturnType<typeof sql>; join: ReturnType<typeof sql>; purchaseOnly?: boolean }> = {
  branch: { key: sql`b.code`, label: sql`MAX(b.name)`, join: sql`` },
  brand: { key: sql`COALESCE(pr.brand_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('brand', 'brand_code') },
  industry: { key: sql`COALESCE(pr.industry_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('industry', 'industry_code') },
  itemGroup: { key: sql`COALESCE(pr.group_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('group', 'group_code') },
  itemType: { key: sql`COALESCE(pr.type_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('type', 'type_code') },
  // Nhóm hạch toán (bộ tài khoản) của mặt hàng: tách hàng hoá thường, hàng khuyến mại, công cụ dụng cụ…
  postingGroup: {
    key: sql`COALESCE(pr.posting_group_code, '')`, label: sql`COALESCE(MAX(pg.name), '')`,
    join: sql`LEFT JOIN products pr ON pr.tenant_id = b.tenant_id AND pr.sku = mv.sku LEFT JOIN product_posting_groups pg ON pg.tenant_id = b.tenant_id AND pg.code = pr.posting_group_code`,
  },
  supplier: { key: sql`COALESCE(p.code, '')`, label: sql`COALESCE(MAX(p.name), '')`, join: partnerJoin, purchaseOnly: true },
  supplierGroup: { key: sql`COALESCE(p.group_code, '')`, label: sql`COALESCE(MAX(pg.name), '')`, join: sql`${partnerJoin} LEFT JOIN partner_groups pg ON pg.tenant_id = p.tenant_id AND pg.code = p.group_code`, purchaseOnly: true },
};
/** Cột tổng hợp chung: tồn đầu, nhập, xuất trong kỳ; mua hàng (nhập mua − trả NCC); giá vốn hàng bán (xuất bán − khách trả lại). */
const sums = (from: string) => sql`
             SUM(mv.qty) FILTER (WHERE mv.doc_date < ${from}::date) AS oq,
             SUM(mv.val) FILTER (WHERE mv.doc_date < ${from}::date) AS ov,
             SUM(mv.qty) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.qty > 0) AS iq,
             SUM(mv.val) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.qty > 0) AS iv,
             -SUM(mv.qty) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.qty < 0) AS xq,
             -SUM(mv.val) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.qty < 0) AS xv,
             SUM(mv.qty) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.kind IN ('purchase', 'purchase_return')) AS pq,
             SUM(mv.val) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.kind IN ('purchase', 'purchase_return')) AS pv,
             -SUM(mv.qty) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.kind IN ('sale', 'sale_return')) AS cq,
             -SUM(mv.val) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.kind IN ('sale', 'sale_return')) AS cv,
             COUNT(*) FILTER (WHERE mv.uncosted) AS uncosted`;
type SumRow = { oq: string | null; ov: string | null; iq: string | null; iv: string | null; xq: string | null; xv: string | null; pq: string | null; pv: string | null; cq: string | null; cv: string | null; uncosted: string };
const figures = (r: SumRow) => {
  const openingQty = num(r.oq), openingValue = num(r.ov), inQty = num(r.iq), inValue = num(r.iv), outQty = num(r.xq), outValue = num(r.xv);
  return {
    openingQty, openingValue, inQty, inValue, outQty, outValue, closingQty: openingQty + inQty - outQty, closingValue: openingValue + inValue - outValue,
    purchaseQty: num(r.pq), purchaseValue: num(r.pv), cogsQty: num(r.cq), cogsValue: num(r.cv), uncosted: Number(r.uncosted),
  };
};

export const inventoryReportService = {
  async stockMovement(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; warehouseCodes?: string[]; search?: string }) {
    const s = await scope(auth, q.branchCodes, q.warehouseCodes);
    const res = await sql<SumRow & { branch_code: string; branch_name: string; sku: string; name: string; unit: string }>`
      WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to: q.to, branchIds: s.branchIds, wh: s.wh, search: q.search?.trim() || undefined })})
      SELECT b.code AS branch_code, b.name AS branch_name, mv.sku, MAX(mv.name) AS name, MAX(mv.unit) AS unit, ${sums(q.from)}
        FROM mv JOIN branches b ON b.id = mv.branch_id
       GROUP BY b.code, b.name, mv.sku
       ORDER BY b.code, mv.sku`.execute(db);
    const rows = res.rows
      .map((r) => ({ branchCode: r.branch_code, branchName: r.branch_name, sku: r.sku, name: r.name, unit: r.unit, ...figures(r) }))
      .filter((r) => r.openingQty || r.inQty || r.outQty);
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s2, r) => s2 + (r[k] as number), 0);
    return {
      rows,
      totals: { openingValue: sum('openingValue'), inValue: sum('inValue'), outValue: sum('outValue'), closingValue: sum('closingValue'), purchaseValue: sum('purchaseValue'), cogsValue: sum('cogsValue') },
      uncosted: sum('uncosted'),
    };
  },

  /** Nhập xuất tồn, mua hàng, giá vốn gom theo phân loại hàng / chi nhánh / nhà cung cấp (số lượng cộng thẳng, khác đơn vị tính chỉ để tham khảo). */
  async stockSummary(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; warehouseCodes?: string[]; search?: string; groupBy: StockGroupBy }) {
    const s = await scope(auth, q.branchCodes, q.warehouseCodes);
    const g = STOCK_GROUP_SQL[q.groupBy];
    const res = await sql<SumRow & { key: string; label: string; skus: string }>`
      WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to: q.to, branchIds: s.branchIds, wh: s.wh, search: q.search?.trim() || undefined })})
      SELECT ${g.key} AS key, ${g.label} AS label, COUNT(DISTINCT mv.sku) AS skus, ${sums(q.from)}
        FROM mv JOIN branches b ON b.id = mv.branch_id
        ${g.join}
       ${g.purchaseOnly ? sql`WHERE mv.kind IN ('purchase', 'purchase_return') AND mv.doc_date >= ${q.from}::date` : sql``}
       GROUP BY 1
       ORDER BY 1`.execute(db);
    const rows = res.rows
      .map((r) => ({ key: r.key, label: r.key ? r.label : g.purchaseOnly ? '(không có nhà cung cấp)' : q.groupBy === 'branch' ? r.label : '(chưa phân loại)', skuCount: Number(r.skus), ...figures(r) }))
      .filter((r) => r.openingQty || r.inQty || r.outQty);
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s2, r) => s2 + (r[k] as number), 0);
    return {
      groupBy: q.groupBy, purchaseOnly: Boolean(g.purchaseOnly), rows,
      totals: { openingValue: sum('openingValue'), inValue: sum('inValue'), outValue: sum('outValue'), closingValue: sum('closingValue'), purchaseValue: sum('purchaseValue'), cogsValue: sum('cogsValue') },
      uncosted: sum('uncosted'),
    };
  },

  async itemLedger(auth: AuthContext, q: { sku: string; from: string; to: string; branchCodes?: string[]; warehouseCodes?: string[] }) {
    const s = await scope(auth, q.branchCodes, q.warehouseCodes);
    const res = await sql<{ id: string; doc_date: string; kind: string; doc_type: string; qty: string; val: string | null; uncosted: boolean; branch_code: string; doc_no: string; doc_key: string; event_id: string; name: string; unit: string }>`
      WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to: q.to, branchIds: s.branchIds, wh: s.wh, sku: q.sku })})
      SELECT mv.id, mv.doc_date::text AS doc_date, mv.kind, mv.doc_type, mv.qty, mv.val, mv.uncosted, b.code AS branch_code, d.doc_no, d.doc_key, mv.event_id, mv.name, mv.unit
        FROM mv JOIN branches b ON b.id = mv.branch_id JOIN accounting_events d ON d.id = mv.event_id
       ORDER BY mv.doc_date, mv.id`.execute(db);
    let qty = 0;
    let value = 0;
    for (const r of res.rows) if (r.doc_date < q.from) { qty += Number(r.qty); value += num(r.val); }
    const opening = { qty, value };
    const rows = res.rows
      .filter((r) => r.doc_date >= q.from)
      .map((r) => {
        const dq = Number(r.qty);
        const dv = num(r.val);
        qty += dq;
        value += dv;
        return {
          eventId: r.event_id,
          docDate: r.doc_date,
          docNo: r.doc_no,
          docKey: r.doc_key,
          docType: r.doc_type,
          kind: r.kind,
          kindLabel: KIND_LABEL[r.kind] ?? r.kind,
          branchCode: r.branch_code,
          inQty: dq > 0 ? dq : 0,
          inValue: dq > 0 ? dv : 0,
          outQty: dq < 0 ? -dq : 0,
          outValue: dq < 0 ? -dv : 0,
          balanceQty: qty,
          balanceValue: value,
          uncosted: r.uncosted,
        };
      });
    const head = res.rows[0];
    return { sku: q.sku, name: head?.name ?? '', unit: head?.unit ?? '', opening, rows, closing: { qty, value } };
  },

  /** Mặt hàng để chọn ở ô "Mã hàng": tìm theo mã hoặc tên, tối đa `limit` dòng. */
  async items(auth: AuthContext, q: { search?: string; limit?: number }) {
    const like = `%${(q.search ?? '').trim().toLowerCase()}%`;
    const res = await sql<{ sku: string; name: string; unit: string; taxOutCode: string | null; taxInCode: string | null }>`
      SELECT sku, max(name) AS name, max(unit) AS unit, max(tax_out_code) AS "taxOutCode", max(tax_in_code) AS "taxInCode" FROM (
        SELECT sku, name, unit, tax_out_code, tax_in_code FROM products WHERE tenant_id = ${auth.tenantId}
        UNION ALL
        SELECT DISTINCT sku, name, unit, NULL::text, NULL::text FROM inventory_movements WHERE tenant_id = ${auth.tenantId}
      ) x
       WHERE sku <> '' AND (lower(sku) LIKE ${like} OR lower(name) LIKE ${like})
       GROUP BY sku ORDER BY sku LIMIT ${q.limit ?? 50}`.execute(db);
    return res.rows;
  },
};
