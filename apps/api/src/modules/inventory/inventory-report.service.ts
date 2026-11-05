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
 * [2026-11-04 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G2: khoá theo ĐỊNH DANH mặt hàng — `ikey` = item_id (dòng chưa có item_id → mã), `cur` = mã hiện hành của định danh.
 * Báo cáo gom theo ikey, hiện cur: đổi mã giữa kỳ không tách thành hai dòng; lọc một mã (kể cả mã cũ) ra đủ dòng của định danh.
 */
/**
 * wh: lọc theo kho — dòng ghi đúng mã kho đã chọn, cộng dòng không ghi mã kho của chi nhánh có kho mặc định trong số đã chọn.
 */
export function valuedMovements(a: { tenantId: string; to: string; branchIds: string[] | null; sku?: string; search?: string; wh?: { codes: string[]; defaultBranchIds: string[] } | null }) {
  return sql`
    SELECT m.id, m.event_id, m.branch_id, m.counter_branch_id, m.warehouse_code, m.sku, COALESCE(it.root_item_id, m.sku) AS ikey, COALESCE(cc.code, m.sku) AS cur,
           m.name, m.unit, m.kind, m.doc_type, m.doc_date, m.qty,
           COALESCE(m.amount, ROUND(m.qty * c.unit_cost)) AS val,
           (m.amount IS NULL AND c.unit_cost IS NULL) AS uncosted
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
      -- [2026-11-05 02:05 PM Nguyễn Văn Thủy] PHASE-026 — S026-21: mặt hàng đã gộp gom vào đích cuối, mã hiển thị là mã hiện hành của đích (đóng góp)
      LEFT JOIN items it ON it.item_id = m.item_id
      LEFT JOIN (SELECT DISTINCT ON (item_id) item_id, code FROM item_codes WHERE tenant_id = ${a.tenantId} AND kind = 'sku'
                  ORDER BY item_id, (valid_to IS NULL) DESC, valid_from DESC) cc ON cc.item_id = it.root_item_id
      LEFT JOIN inventory_costs c
        ON c.tenant_id = m.tenant_id AND ((m.item_id IS NOT NULL AND c.item_id = m.item_id) OR (m.item_id IS NULL AND c.sku = m.sku))
       AND c.year = EXTRACT(YEAR FROM m.doc_date)::int AND c.month = EXTRACT(MONTH FROM m.doc_date)::int
       AND c.cost_group = CASE WHEN m.kind = 'transfer_in' AND cb.id IS NOT NULL THEN COALESCE(cb.accounting_unit_id, 0) ELSE COALESCE(b.accounting_unit_id, 0) END
     WHERE m.tenant_id = ${a.tenantId} AND m.doc_date <= ${a.to}::date
       ${a.branchIds ? sql`AND m.branch_id = ANY(${a.branchIds}::bigint[])` : sql``}
       ${a.wh ? sql`AND (m.warehouse_code = ANY(${a.wh.codes}::text[]) OR (m.warehouse_code = '' AND m.branch_id = ANY(${a.wh.defaultBranchIds}::bigint[])))` : sql``}
       ${a.sku ? sql`AND (m.sku = ${a.sku} OR m.item_id IN (SELECT bizcity_items_of_codes(${a.tenantId}::bigint, ARRAY[${a.sku}]::text[])))` : sql``}
       ${a.search ? sql`AND (m.sku ILIKE ${'%' + a.search + '%'} OR cc.code ILIKE ${'%' + a.search + '%'} OR m.name ILIKE ${'%' + a.search + '%'})` : sql``}`;
}

const num = (v: string | null) => (v === null ? 0 : Number(v));

export const STOCK_GROUPS = ['branch', 'brand', 'industry', 'itemGroup', 'itemGroup1', 'itemGroup2', 'itemGroup3', 'itemType', 'postingGroup', 'supplier', 'supplierGroup'] as const;
export type StockGroupBy = (typeof STOCK_GROUPS)[number];
const classJoin = (kind: string, col: string) => sql`LEFT JOIN products pr ON pr.tenant_id = b.tenant_id AND pr.sku = mv.cur
        LEFT JOIN item_classes ic ON ic.tenant_id = b.tenant_id AND ic.kind = ${kind} AND ic.code = ${sql.ref(`pr.${col}`)}`;
const partnerJoin = sql`JOIN accounting_events d ON d.id = mv.event_id LEFT JOIN partners p ON p.id = d.partner_id`;
// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — gom theo nhóm hàng cấp 1 / 2 / 3 (cộng dồn cả nhánh con) và lọc theo nhóm đã chọn (đóng góp)
/** CTE "nhom": mỗi nhóm hàng → nhóm tổ tiên ở từng cấp (lvl 1 = nhóm không có cha). Dùng khi gom theo nhóm cấp N. */
const groupLevelCte = (tenantId: string) => sql`, nhom AS (
        WITH RECURSIVE up AS (
          SELECT code, code AS anc, parent_code, 0 AS d FROM item_classes WHERE tenant_id = ${tenantId} AND kind = 'group'
          UNION ALL
          SELECT up.code, c.code, c.parent_code, up.d + 1 FROM up JOIN item_classes c ON c.tenant_id = ${tenantId} AND c.kind = 'group' AND c.code = up.parent_code WHERE up.d < 20
        )
        SELECT code, anc, COUNT(*) OVER (PARTITION BY code) - d AS lvl FROM up)`;
const levelJoin = (n: number) => sql`LEFT JOIN products pr ON pr.tenant_id = b.tenant_id AND pr.sku = mv.cur
        LEFT JOIN nhom gl ON gl.code = pr.group_code AND gl.lvl = ${n}
        LEFT JOIN item_classes ic ON ic.tenant_id = b.tenant_id AND ic.kind = 'group' AND ic.code = gl.anc`;
/** Chỉ lấy mã hàng thuộc các nhóm đã chọn (gồm mọi nhóm con). */
export const groupFilter = (tenantId: string, groups?: string[]) => (groups?.length ? sql`AND mv.cur IN (
        WITH RECURSIVE g(code) AS (
          SELECT code FROM item_classes WHERE tenant_id = ${tenantId} AND kind = 'group' AND code IN (${sql.join(groups)})
          UNION SELECT c.code FROM item_classes c JOIN g ON c.parent_code = g.code WHERE c.tenant_id = ${tenantId} AND c.kind = 'group')
        SELECT sku FROM products WHERE tenant_id = ${tenantId} AND group_code IN (SELECT code FROM g))` : sql``);
/** Khoá, nhãn, bảng nối của từng cách gom; hàng chưa phân loại / phiếu không có đối tượng gom vào khoá rỗng. */
const STOCK_GROUP_SQL: Record<StockGroupBy, { key: ReturnType<typeof sql>; label: ReturnType<typeof sql>; join: ReturnType<typeof sql>; purchaseOnly?: boolean; level?: boolean }> = {
  branch: { key: sql`b.code`, label: sql`MAX(b.name)`, join: sql`` },
  brand: { key: sql`COALESCE(pr.brand_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('brand', 'brand_code') },
  industry: { key: sql`COALESCE(pr.industry_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('industry', 'industry_code') },
  itemGroup: { key: sql`COALESCE(pr.group_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('group', 'group_code') },
  itemGroup1: { key: sql`COALESCE(gl.anc, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: levelJoin(1), level: true },
  itemGroup2: { key: sql`COALESCE(gl.anc, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: levelJoin(2), level: true },
  itemGroup3: { key: sql`COALESCE(gl.anc, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: levelJoin(3), level: true },
  itemType: { key: sql`COALESCE(pr.type_code, '')`, label: sql`COALESCE(MAX(ic.name), '')`, join: classJoin('type', 'type_code') },
  // Nhóm hạch toán (bộ tài khoản) của mặt hàng: tách hàng hoá thường, hàng khuyến mại, công cụ dụng cụ…
  postingGroup: {
    key: sql`COALESCE(pr.posting_group_code, '')`, label: sql`COALESCE(MAX(pg.name), '')`,
    join: sql`LEFT JOIN products pr ON pr.tenant_id = b.tenant_id AND pr.sku = mv.cur LEFT JOIN product_posting_groups pg ON pg.tenant_id = b.tenant_id AND pg.code = pr.posting_group_code`,
  },
  supplier: { key: sql`COALESCE(p.code, '')`, label: sql`COALESCE(MAX(p.name), '')`, join: partnerJoin, purchaseOnly: true },
  supplierGroup: { key: sql`COALESCE(p.group_code, '')`, label: sql`COALESCE(MAX(pg.name), '')`, join: sql`${partnerJoin} LEFT JOIN partner_groups pg ON pg.tenant_id = p.tenant_id AND pg.code = p.group_code`, purchaseOnly: true },
};
/**
 * Cột tổng hợp chung: tồn đầu, nhập, xuất trong kỳ; mua hàng (nhập mua − trả NCC); giá vốn hàng bán (xuất bán − khách trả lại).
 * Dòng chỉ điều chỉnh giá trị (SL 0: phân bổ chi phí mua +, thưởng / giảm giá sau mua −) tính vào TT nhập (có dấu) — nếu bỏ
 * qua thì TT tồn cuối lệch sổ 1561 đúng bằng các khoản đó, trong khi cột Mua hàng vẫn có.
 */
const sums = (from: string) => sql`
             SUM(mv.qty) FILTER (WHERE mv.doc_date < ${from}::date) AS oq,
             SUM(mv.val) FILTER (WHERE mv.doc_date < ${from}::date) AS ov,
             SUM(mv.qty) FILTER (WHERE mv.doc_date >= ${from}::date AND mv.qty > 0) AS iq,
             SUM(mv.val) FILTER (WHERE mv.doc_date >= ${from}::date AND (mv.qty > 0 OR (mv.qty = 0 AND mv.val <> 0))) AS iv,
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
  async stockMovement(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; warehouseCodes?: string[]; search?: string; groups?: string[] }) {
    const s = await scope(auth, q.branchCodes, q.warehouseCodes);
    const res = await sql<SumRow & { branch_code: string; branch_name: string; sku: string; name: string; unit: string }>`
      WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to: q.to, branchIds: s.branchIds, wh: s.wh, search: q.search?.trim() || undefined })})
      SELECT b.code AS branch_code, b.name AS branch_name, MAX(mv.cur) AS sku, MAX(mv.name) AS name, MAX(mv.unit) AS unit, ${sums(q.from)}
        FROM mv JOIN branches b ON b.id = mv.branch_id
       WHERE TRUE ${groupFilter(auth.tenantId, q.groups)}
       GROUP BY b.code, b.name, mv.ikey
       ORDER BY b.code, 3`.execute(db);
    const rows = res.rows
      .map((r) => ({ branchCode: r.branch_code, branchName: r.branch_name, sku: r.sku, name: r.name, unit: r.unit, ...figures(r) }))
      .filter((r) => r.openingQty || r.inQty || r.outQty || r.openingValue || r.inValue);
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s2, r) => s2 + (r[k] as number), 0);
    return {
      rows,
      totals: { openingValue: sum('openingValue'), inValue: sum('inValue'), outValue: sum('outValue'), closingValue: sum('closingValue'), purchaseValue: sum('purchaseValue'), cogsValue: sum('cogsValue') },
      uncosted: sum('uncosted'),
    };
  },

  /** Nhập xuất tồn, mua hàng, giá vốn gom theo phân loại hàng / chi nhánh / nhà cung cấp (số lượng cộng thẳng, khác đơn vị tính chỉ để tham khảo). */
  async stockSummary(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; warehouseCodes?: string[]; search?: string; groupBy: StockGroupBy; groups?: string[] }) {
    const s = await scope(auth, q.branchCodes, q.warehouseCodes);
    const g = STOCK_GROUP_SQL[q.groupBy];
    const res = await sql<SumRow & { key: string; label: string; skus: string }>`
      WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to: q.to, branchIds: s.branchIds, wh: s.wh, search: q.search?.trim() || undefined })})${g.level ? groupLevelCte(auth.tenantId) : sql``}
      SELECT ${g.key} AS key, ${g.label} AS label, COUNT(DISTINCT mv.ikey) AS skus, ${sums(q.from)}
        FROM mv JOIN branches b ON b.id = mv.branch_id
        ${g.join}
       WHERE TRUE ${groupFilter(auth.tenantId, q.groups)}
       ${g.purchaseOnly ? sql`AND mv.kind IN ('purchase', 'purchase_return') AND mv.doc_date >= ${q.from}::date` : sql``}
       GROUP BY 1
       ORDER BY 1`.execute(db);
    const rows = res.rows
      .map((r) => ({ key: r.key, label: r.key ? r.label : g.purchaseOnly ? '(không có nhà cung cấp)' : q.groupBy === 'branch' ? r.label : g.level ? '(nhóm chưa tới cấp này)' : '(chưa phân loại)', skuCount: Number(r.skus), ...figures(r) }))
      .filter((r) => r.openingQty || r.inQty || r.outQty || r.openingValue || r.inValue);
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

  // [2026-11-03 06:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — đối chiếu sổ chi tiết kho với số dư tài khoản hàng tồn kho (chủ dự án yêu cầu 2026-11-03)
  /**
   * Đối chiếu tới hết kỳ YYYY-MM, theo (chi nhánh, mặt hàng):
   *   - Sổ chi tiết kho: tổng giá trị các lần vào / ra (inventory_movements, cùng cách định giá với sổ chi tiết hàng).
   *   - Sổ cái: số dư Nợ − Có trên các tài khoản hàng tồn kho của nhóm hạch toán (product_posting_groups.inventory_account),
   *     theo ledger_lines.product_sku. Tài khoản lấy từ cấu hình của đơn vị, không viết cứng.
   * Trạng thái mỗi dòng: ok · diff (lệch) · uncosted (còn dòng kho chưa định giá, chưa kết luận được) · wrong_account (có số dư
   * trên tài khoản kho khác tài khoản của nhóm hạch toán mặt hàng) · no_product (bút toán vào tài khoản kho không gắn mặt hàng).
   * Chỉ đọc. Ngày so: sổ cái theo ngày hạch toán, sổ kho theo ngày chứng từ (hai ngày lệch nhau thì dòng lệch ở ranh giới kỳ).
   */
  async reconcile(auth: AuthContext, q: { period: string; branchCodes?: string[]; search?: string }) {
    const [y, m] = q.period.split('-').map(Number) as [number, number];
    const to = `${q.period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const s = await scope(auth, q.branchCodes);
    const search = q.search?.trim() || undefined;
    const groups = await db.selectFrom('product_posting_groups').select(['code', 'inventory_account', 'is_default']).where('tenant_id', '=', auth.tenantId).execute();
    const accounts = [...new Set(groups.map((g) => g.inventory_account))].sort();
    const defaultAccount = groups.find((g) => g.is_default)?.inventory_account ?? null;
    if (!accounts.length) return { period: q.period, to, accounts, defaultAccount, totals: [], rows: [], summary: { ok: 0, diff: 0, uncosted: 0, wrong_account: 0, no_product: 0 } };

    const gl = await sql<{ branch_code: string; sku: string; account_code: string; v: string }>`
      SELECT b.code AS branch_code, COALESCE(cc.code, l.product_sku, '') AS sku, l.account_code, SUM(l.debit - l.credit) AS v
        FROM bizcity_read.ledger_lines l JOIN branches b ON b.id = l.branch_id
        LEFT JOIN bizcity_read.items it ON it.item_id = l.item_id
        LEFT JOIN item_codes cc ON cc.item_id = it.root_item_id AND cc.kind = 'sku' AND cc.valid_to IS NULL
       WHERE l.tenant_id = ${auth.tenantId} AND l.posting_date <= ${to}::date AND l.account_code = ANY(${accounts}::text[])
         ${s.branchIds ? sql`AND l.branch_id = ANY(${s.branchIds}::bigint[])` : sql``}
         ${search ? sql`AND (l.product_sku ILIKE ${'%' + search + '%'} OR cc.code ILIKE ${'%' + search + '%'})` : sql``}
       GROUP BY 1, 2, 3`.execute(db);
    const sub = await sql<{ branch_code: string; sku: string; name: string; qty: string; val: string | null; uncosted: string }>`
      WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to, branchIds: s.branchIds, search })})
      SELECT b.code AS branch_code, mv.cur AS sku, COALESCE(bizcity_item_name_now(${auth.tenantId}::bigint, mv.cur), MAX(mv.name)) AS name, SUM(mv.qty) AS qty, SUM(mv.val) AS val, COUNT(*) FILTER (WHERE mv.uncosted) AS uncosted
        FROM mv JOIN branches b ON b.id = mv.branch_id
       GROUP BY 1, 2`.execute(db);

    const skus = [...new Set([...gl.rows.map((r) => r.sku), ...sub.rows.map((r) => r.sku)].filter(Boolean))];
    const own = skus.length
      ? await sql<{ sku: string; account: string | null }>`
          SELECT p.sku, g.inventory_account AS account FROM products p
            LEFT JOIN product_posting_groups g ON g.tenant_id = p.tenant_id AND g.code = p.posting_group_code
           WHERE p.tenant_id = ${auth.tenantId} AND p.sku = ANY(${skus}::text[])`.execute(db)
      : { rows: [] };
    const expectedOf = new Map(own.rows.map((r) => [r.sku, r.account ?? defaultAccount]));

    type Row = { branchCode: string; sku: string; name: string; qty: number; subledgerValue: number; ledgerValue: number; diff: number;
      uncosted: number; expectedAccount: string | null; accounts: { code: string; value: number }[]; status: string };
    const rows = new Map<string, Row>();
    const rowOf = (branchCode: string, sku: string) => {
      const k = `${branchCode}\u0000${sku}`;
      let r = rows.get(k);
      if (!r) {
        r = { branchCode, sku, name: '', qty: 0, subledgerValue: 0, ledgerValue: 0, diff: 0, uncosted: 0, expectedAccount: sku ? expectedOf.get(sku) ?? defaultAccount : null, accounts: [], status: 'ok' };
        rows.set(k, r);
      }
      return r;
    };
    for (const x of sub.rows) Object.assign(rowOf(x.branch_code, x.sku), { name: x.name, qty: Number(x.qty), subledgerValue: num(x.val), uncosted: Number(x.uncosted) });
    for (const x of gl.rows) {
      const r = rowOf(x.branch_code, x.sku);
      r.ledgerValue += Number(x.v);
      r.accounts.push({ code: x.account_code, value: Number(x.v) });
    }
    const out = [...rows.values()].map((r) => {
      r.diff = r.ledgerValue - r.subledgerValue;
      r.accounts.sort((a, b) => a.code.localeCompare(b.code));
      if (!r.sku) r.status = r.ledgerValue !== 0 ? 'no_product' : 'ok';
      else if (r.uncosted > 0) r.status = 'uncosted';
      else if (r.accounts.some((a) => a.code !== r.expectedAccount && Math.abs(a.value) >= 1)) r.status = 'wrong_account';
      else if (Math.abs(r.diff) >= 1) r.status = 'diff';
      return r;
    }).filter((r) => r.status !== 'ok' || r.qty !== 0 || r.subledgerValue !== 0 || r.ledgerValue !== 0);
    const ORDER = ['no_product', 'wrong_account', 'diff', 'uncosted', 'ok'];
    out.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.branchCode.localeCompare(b.branchCode) || a.sku.localeCompare(b.sku));

    // Tổng theo tài khoản: số dư sổ cái so với giá trị sổ kho của các mặt hàng có tài khoản đó trong nhóm hạch toán.
    const totals = accounts.map((code) => {
      const ledgerValue = gl.rows.filter((x) => x.account_code === code).reduce((t, x) => t + Number(x.v), 0);
      const subledgerValue = out.filter((r) => r.sku && r.expectedAccount === code).reduce((t, r) => t + r.subledgerValue, 0);
      return { account: code, ledgerValue, subledgerValue, diff: ledgerValue - subledgerValue };
    });
    const summary = { ok: 0, diff: 0, uncosted: 0, wrong_account: 0, no_product: 0 } as Record<string, number>;
    for (const r of out) summary[r.status] = (summary[r.status] ?? 0) + 1;
    return { period: q.period, to, accounts, defaultAccount, totals, rows: out, summary };
  },
};
