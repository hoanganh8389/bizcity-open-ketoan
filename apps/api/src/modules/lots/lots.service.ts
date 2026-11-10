// @bizcity-layer D modules/kho
// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — lô hàng: tồn theo lô, thẻ lô, phân lô của phiếu và tên kê khai, phân lô lại (đóng góp)
/**
 * LÔ HÀNG (0098, docs/nghiep-vu/16-lo-hang.md) — đọc phân lô do Kernel ghi (lot.service.ts).
 *   - Tồn theo lô: mỗi lô còn bao nhiêu ở từng chi nhánh / kho, hạn dùng, còn bao nhiêu ngày, tên hàng lúc mua.
 *   - Thẻ lô: lô vào / ra ở chứng từ nào.
 *   - Phân lô của một phiếu: từng dòng lấy từ lô nào, tên lúc mua của lô (tra cứu). Hoá đơn bán ra đi đúng như bill ở cửa hàng
 *     (bill một dòng thì hoá đơn một dòng, tên theo dòng bán) — lô không tách dòng hoá đơn (chốt 10/11/2026).
 *   - Phân lô lại theo thứ tự ngày (Kernel rebuildLots).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { rebuildLots } from '../../kernel/public.js';

export interface LotQuery { search?: string; branchCode?: string; branchCodes?: string; warehouses?: string; split?: boolean; stock?: boolean; expWithin?: number; limit?: number }

const list = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Tồn theo lô. Lô quản lý theo TỪNG PHÂN KHO: tồn của lô tính riêng (chi nhánh, mã kho).
 *   split = false : mỗi dòng một lô, `branches` = tồn từng chi nhánh / kho (kiểu cũ).
 *   split = true  : mỗi dòng một lô ở một chi nhánh + một kho (màn KHO05) — lô nằm kho nào thấy ngay.
 *   branchCode / branchCodes (nhiều mã, phẩy) , warehouses (nhiều mã kho, phẩy): chỉ tính phân lô ở các nơi đó.
 */
export async function listLots(trx: Db, tenantId: string, q: LotQuery = {}) {
  const search = q.search?.trim() ? `%${q.search.trim().toLowerCase()}%` : null;
  const codes = [...new Set([...list(q.branchCode), ...list(q.branchCodes)])];
  const branchIds = codes.length ? (await sql<{ id: string; code: string }>`SELECT id::text, code FROM branches WHERE tenant_id = ${tenantId} AND code IN (${sql.join(codes)})`.execute(trx)).rows : [];
  if (q.branchCode && !branchIds.some((b) => b.code === q.branchCode)) throw Errors.validation(`Chi nhánh ${q.branchCode} không có`);
  const whs = list(q.warehouses);
  const place = (alias: string) => sql`${codes.length ? sql`AND ${sql.ref(alias + '.branch_id')} IN (${sql.join(branchIds.length ? branchIds.map((b) => b.id) : ['0'])})` : sql``}
    ${whs.length ? sql`AND ${sql.ref(alias + '.warehouse_code')} IN (${sql.join(whs)})` : sql``}`;
  const lotFilter = sql`l.tenant_id = ${tenantId}
       ${search ? sql`AND (lower(l.sku) LIKE ${search} OR lower(COALESCE(p.sku, '')) LIKE ${search} OR lower(l.purchase_name) LIKE ${search} OR lower(COALESCE(p.name, '')) LIKE ${search} OR lower(l.lot_no) LIKE ${search})` : sql``}
       ${q.expWithin !== undefined ? sql`AND l.exp_date IS NOT NULL AND l.exp_date <= current_date + ${q.expWithin}::int` : sql``}`;
  const today = (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;
  type Base = { id: string; item_id: string | null; sku: string; cur_sku: string | null; cur_name: string | null; lot_no: string; exp_date: string | null; purchase_name: string; purchase_unit: string;
    names_seen: { name: string; docNo: string; date: string | null }[]; first_doc_no: string; first_date: string | null; qty_in: string; qty_out: string; stock: string };
  const base = (r: Base) => ({
    id: r.id, itemId: r.item_id, sku: r.cur_sku ?? r.sku, skuAtLot: r.sku, name: r.cur_name ?? r.purchase_name, lotNo: r.lot_no, expDate: r.exp_date,
    daysLeft: r.exp_date ? Math.round((Date.parse(r.exp_date) - Date.parse(today)) / 86400000) : null,
    purchaseName: r.purchase_name, purchaseUnit: r.purchase_unit, namesSeen: r.names_seen ?? [], nameChanged: Boolean(r.cur_name && r.purchase_name && r.cur_name !== r.purchase_name),
    firstDocNo: r.first_doc_no, firstDate: r.first_date, qtyIn: Number(r.qty_in), qtyOut: Number(r.qty_out), stock: Number(r.stock),
  });
  if (q.split) {
    const rows = (await sql<Base & { branch: string; branch_name: string; warehouse: string; warehouse_name: string | null }>`
      SELECT l.id::text, l.item_id, l.sku, p.sku AS cur_sku, p.name AS cur_name, l.lot_no, l.exp_date::text, l.purchase_name, l.purchase_unit, l.names_seen, l.first_doc_no, l.first_date::text,
             b.code AS branch, b.name AS branch_name, m.warehouse_code AS warehouse, max(w.name) AS warehouse_name,
             COALESCE(sum(m.qty) FILTER (WHERE m.qty > 0), 0)::text AS qty_in, COALESCE(-sum(m.qty) FILTER (WHERE m.qty < 0), 0)::text AS qty_out, sum(m.qty)::text AS stock
        FROM item_lots l
        JOIN inventory_lot_moves m ON m.lot_id = l.id
        JOIN branches b ON b.id = m.branch_id
        LEFT JOIN warehouses w ON w.tenant_id = l.tenant_id AND w.branch_id = m.branch_id AND w.code = m.warehouse_code
        LEFT JOIN products p ON p.tenant_id = l.tenant_id AND p.item_id = l.item_id
       WHERE ${lotFilter} ${place('m')}
       GROUP BY l.id, p.sku, p.name, b.code, b.name, m.warehouse_code
      ${q.stock ? sql`HAVING sum(m.qty) <> 0` : sql``}
       ORDER BY COALESCE(p.sku, l.sku), l.exp_date NULLS LAST, l.first_date NULLS LAST, l.id, b.code, m.warehouse_code
       LIMIT ${q.limit ?? 3000}`.execute(trx)).rows;
    return rows.map((r) => ({ ...base(r), branch: r.branch, branchName: r.branch_name, warehouse: r.warehouse, warehouseName: r.warehouse_name ?? '', branches: [{ code: r.branch, warehouse: r.warehouse, qty: Number(r.stock) }] }));
  }
  const rows = (await sql<Base & { branches: { code: string; warehouse: string; qty: number }[] | null }>`
    SELECT l.id::text, l.item_id, l.sku, p.sku AS cur_sku, p.name AS cur_name, l.lot_no, l.exp_date::text, l.purchase_name, l.purchase_unit, l.names_seen, l.first_doc_no, l.first_date::text,
           COALESCE(sum(m.qty) FILTER (WHERE m.qty > 0), 0)::text AS qty_in, COALESCE(-sum(m.qty) FILTER (WHERE m.qty < 0), 0)::text AS qty_out, COALESCE(sum(m.qty), 0)::text AS stock,
           (SELECT json_agg(json_build_object('code', b.code, 'warehouse', x.warehouse_code, 'qty', x.q) ORDER BY b.code, x.warehouse_code)
              FROM (SELECT x0.branch_id, x0.warehouse_code, sum(x0.qty) AS q FROM inventory_lot_moves x0 WHERE x0.lot_id = l.id ${place('x0')}
                     GROUP BY 1, 2 HAVING sum(x0.qty) <> 0) x JOIN branches b ON b.id = x.branch_id) AS branches
      FROM item_lots l
      LEFT JOIN products p ON p.tenant_id = l.tenant_id AND p.item_id = l.item_id
      LEFT JOIN inventory_lot_moves m ON m.lot_id = l.id ${place('m')}
     WHERE ${lotFilter}
     GROUP BY l.id, p.sku, p.name
    ${q.stock ? sql`HAVING COALESCE(sum(m.qty), 0) <> 0` : sql``}
     ORDER BY COALESCE(p.sku, l.sku), l.exp_date NULLS LAST, l.first_date NULLS LAST, l.id
     LIMIT ${q.limit ?? 2000}`.execute(trx)).rows;
  return rows.map((r) => ({ ...base(r), branches: r.branches ?? [] }));
}

export async function lotMoves(trx: Db, tenantId: string, lotId: string, at: { branchCode?: string; warehouse?: string } = {}) {
  const lot = (await sql<{ id: string }>`SELECT id::text FROM item_lots WHERE tenant_id = ${tenantId} AND id = ${lotId}`.execute(trx)).rows[0];
  if (!lot) throw Errors.notFound(`lô #${lotId}`);
  return (await sql<{ doc_date: string; doc_no: string; doc_key: string; doc_type: string; branch: string; warehouse_code: string; kind: string; qty: string; how: string }>`
    SELECT m.doc_date::text, e.doc_no, e.doc_key, e.doc_type, b.code AS branch, m.warehouse_code, m.kind, m.qty::text, m.how
      FROM inventory_lot_moves m JOIN accounting_events e ON e.id = m.event_id JOIN branches b ON b.id = m.branch_id
     WHERE m.tenant_id = ${tenantId} AND m.lot_id = ${lotId}
       ${at.branchCode ? sql`AND b.code = ${at.branchCode}` : sql``} ${at.warehouse !== undefined ? sql`AND m.warehouse_code = ${at.warehouse}` : sql``}
     ORDER BY m.doc_date, m.id`.execute(trx)).rows.map((r) => ({ ...r, qty: Number(r.qty) }));
}

/**
 * Phân lô của một phiếu theo dòng: lô nào, bao nhiêu, tên lúc mua của lô. Chỉ để tra cứu — hoá đơn vẫn theo dòng bán như bill
 * ở cửa hàng. `lotNames`: các tên lúc mua của những lô dòng này lấy; `nameDiffers`: có tên lúc mua khác tên trên dòng bán.
 */
export async function documentLots(trx: Db, tenantId: string, docKey: string) {
  const ev = (await sql<{ id: string; doc_no: string; doc_type: string; doc_date: string }>`SELECT id::text, doc_no, doc_type, doc_date::text FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(trx)).rows[0];
  if (!ev) throw Errors.notFound(`chứng từ ${docKey}`);
  const rows = (await sql<{ line_no: number; sku: string; name: string; unit: string; line_qty: string; lot_id: string; lot_no: string; exp_date: string | null; purchase_name: string; qty: string; how: string; branch: string; warehouse: string }>`
    SELECT im.line_no, im.sku, im.name, im.unit, im.qty::text AS line_qty, l.id::text AS lot_id, l.lot_no, l.exp_date::text, l.purchase_name, m.qty::text, m.how, b.code AS branch, m.warehouse_code AS warehouse
      FROM inventory_movements im JOIN inventory_lot_moves m ON m.movement_id = im.id JOIN item_lots l ON l.id = m.lot_id JOIN branches b ON b.id = m.branch_id
     WHERE im.event_id = ${ev.id} ORDER BY im.line_no, im.id, m.id`.execute(trx)).rows;
  const lines = new Map<number, { lineNo: number; sku: string; name: string; unit: string; qty: number; lots: { lotId: string; lotNo: string; expDate: string | null; purchaseName: string; qty: number; how: string; branch: string; warehouse: string; dir: 'in' | 'out' }[] }>();
  for (const r of rows) {
    const cur = lines.get(r.line_no) ?? { lineNo: r.line_no, sku: r.sku, name: r.name, unit: r.unit, qty: Math.abs(Number(r.line_qty)), lots: [] };
    cur.lots.push({ lotId: r.lot_id, lotNo: r.lot_no, expDate: r.exp_date, purchaseName: r.purchase_name, qty: Math.abs(Number(r.qty)), how: r.how, branch: r.branch, warehouse: r.warehouse, dir: Number(r.qty) < 0 ? 'out' : 'in' });
    lines.set(r.line_no, cur);
  }
  const out = [...lines.values()].map((l) => {
    const lotNames = [...new Set(l.lots.map((x) => x.purchaseName || l.name))];
    return { ...l, lotNames, nameDiffers: lotNames.some((n) => n !== l.name) };
  });
  return { docKey, docNo: ev.doc_no, docType: ev.doc_type, docDate: ev.doc_date, lines: out };
}

/**
 * GỢI Ý LÔ khi lập phiếu xuất (chuyển kho, xuất trả…): với mỗi (mã, số lượng) — các lô còn tồn ở chi nhánh + kho, hạn dùng sớm
 * trước, cùng hạn thì nhập trước — đúng thứ tự Kernel tự chọn khi dòng không ghi lô. Phiếu điền lô gợi ý thì ưu tiên lô đó;
 * để trống thì Kernel tự chọn như gợi ý. `shortage` = phần không đủ tồn lô.
 */
export async function suggestLots(trx: Db, tenantId: string, q: { branchCode: string; warehouse?: string; date?: string; items: { sku: string; qty: number }[]; except?: string[] }) {
  const branch = (await sql<{ id: string }>`SELECT id::text FROM branches WHERE tenant_id = ${tenantId} AND code = ${q.branchCode}`.execute(trx)).rows[0];
  if (!branch) throw Errors.validation(`Chi nhánh ${q.branchCode} không có`);
  const date = q.date ?? (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;
  // Kho ghi trống = kho mặc định của chi nhánh (cùng luật phân lô). Không truyền kho = mọi kho, mỗi lô kèm phân kho đang giữ.
  const wh = q.warehouse === undefined ? undefined : q.warehouse.trim() || ((await sql<{ code: string }>`SELECT code FROM warehouses WHERE tenant_id = ${tenantId} AND branch_id = ${branch.id} AND is_default ORDER BY id LIMIT 1`.execute(trx)).rows[0]?.code ?? '');
  const out = [];
  for (const it of q.items) {
    const key = (await sql<{ k: string }>`SELECT COALESCE(bizcity_item_at(${tenantId}::bigint, ${it.sku}, ${date}::date), 'sku:' || ${it.sku}) AS k`.execute(trx)).rows[0]!.k;
    const lots = (await sql<{ lot_no: string; exp_date: string | null; purchase_name: string; warehouse: string; avail: string }>`
      SELECT l.lot_no, l.exp_date::text, l.purchase_name, m.warehouse_code AS warehouse, sum(m.qty)::text AS avail
        FROM item_lots l JOIN inventory_lot_moves m ON m.lot_id = l.id
       WHERE l.tenant_id = ${tenantId} AND l.item_key = ${key} AND m.branch_id = ${branch.id}
         ${wh !== undefined ? sql`AND m.warehouse_code = ${wh}` : sql``} AND m.doc_date <= ${date}::date
         ${q.except?.length ? sql`AND m.event_id NOT IN (SELECT id FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ANY(${q.except}::text[]))` : sql``}
       GROUP BY l.id, m.warehouse_code
      HAVING sum(m.qty) > 0
       ORDER BY l.exp_date NULLS LAST, l.first_date NULLS LAST, l.id, m.warehouse_code`.execute(trx)).rows;
    let left = it.qty;
    const picks = lots.map((l) => {
      const available = Number(l.avail);
      const take = Math.max(0, Math.min(left, available));
      left = Math.round((left - take) * 10000) / 10000;
      return { lotNo: l.lot_no, expDate: l.exp_date, purchaseName: l.purchase_name, warehouse: l.warehouse, available, take };
    });
    out.push({ sku: it.sku, qty: it.qty, lots: picks, shortage: Math.max(0, left) });
  }
  return out;
}

/**
 * Danh sách phiếu có hàng đi theo lô (để chọn xem "Lô theo phiếu" — người dùng không phải gõ khoá phiếu): lọc ngày, số phiếu / mã
 * hàng, loại phiếu. Mỗi phiếu: số dòng, số lô, có dòng lấy nhiều lô, có tên lúc mua khác tên trên dòng.
 */
export async function lotDocuments(trx: Db, tenantId: string, q: { from?: string; to?: string; search?: string; docType?: string; branchCodes?: string; warehouses?: string; limit?: number }) {
  const search = q.search?.trim() ? `%${q.search.trim().toLowerCase()}%` : null;
  const codes = list(q.branchCodes);
  const whs = list(q.warehouses);
  return (await sql<{ doc_key: string; doc_no: string; doc_type: string; doc_date: string; branch: string; places: string[] | null; lines: string; lots: string; multi: boolean; name_diff: boolean }>`
    SELECT e.doc_key, e.doc_no, e.doc_type, e.doc_date::text, b.code AS branch,
           array_agg(DISTINCT mb.code || CASE WHEN m.warehouse_code <> '' THEN ' · ' || m.warehouse_code ELSE '' END) AS places,
           count(DISTINCT im.id)::text AS lines, count(DISTINCT m.lot_id)::text AS lots,
           bool_or(x.n > 1) AS multi, bool_or(l.purchase_name <> '' AND l.purchase_name <> im.name) AS name_diff
      FROM accounting_events e
      JOIN inventory_movements im ON im.event_id = e.id
      JOIN inventory_lot_moves m ON m.movement_id = im.id
      JOIN item_lots l ON l.id = m.lot_id
      JOIN branches b ON b.id = e.branch_id
      JOIN branches mb ON mb.id = m.branch_id
      JOIN LATERAL (SELECT count(*) AS n FROM inventory_lot_moves z WHERE z.movement_id = im.id) x ON TRUE
     WHERE e.tenant_id = ${tenantId}
       ${q.from ? sql`AND e.doc_date >= ${q.from}::date` : sql``} ${q.to ? sql`AND e.doc_date <= ${q.to}::date` : sql``}
       ${q.docType ? sql`AND e.doc_type = ${q.docType}` : sql``}
       ${codes.length ? sql`AND mb.code IN (${sql.join(codes)})` : sql``} ${whs.length ? sql`AND m.warehouse_code IN (${sql.join(whs)})` : sql``}
       ${search ? sql`AND (lower(e.doc_no) LIKE ${search} OR EXISTS (SELECT 1 FROM inventory_movements i2 WHERE i2.event_id = e.id AND (lower(i2.sku) LIKE ${search} OR lower(i2.name) LIKE ${search})))` : sql``}
     GROUP BY e.id, b.code
     ORDER BY e.doc_date DESC, e.id DESC
     LIMIT ${q.limit ?? 300}`.execute(trx)).rows.map((r) => ({
    docKey: r.doc_key, docNo: r.doc_no, docType: r.doc_type, docDate: r.doc_date, branch: r.branch, places: (r.places ?? []).sort(), lines: Number(r.lines), lots: Number(r.lots), multiLot: r.multi, nameDiffers: r.name_diff,
  }));
}

export async function rebuild(trx: Db, tenantId: string, actor: string, sku?: string) {
  const r = await rebuildLots(trx, tenantId, { sku });
  await writeAudit(trx, { tenantId, actor, action: 'lots.rebuild', objectType: 'item_lots', objectId: sku ?? '*', after: r });
  return r;
}
