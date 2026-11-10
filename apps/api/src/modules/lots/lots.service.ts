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

export interface LotQuery { search?: string; branchCode?: string; stock?: boolean; expWithin?: number; limit?: number }

export async function listLots(trx: Db, tenantId: string, q: LotQuery = {}) {
  const search = q.search?.trim() ? `%${q.search.trim().toLowerCase()}%` : null;
  const branch = q.branchCode ? (await sql<{ id: string }>`SELECT id::text FROM branches WHERE tenant_id = ${tenantId} AND code = ${q.branchCode}`.execute(trx)).rows[0] : null;
  if (q.branchCode && !branch) throw Errors.validation(`Chi nhánh ${q.branchCode} không có`);
  const rows = (await sql<{
    id: string; item_id: string | null; sku: string; cur_sku: string | null; cur_name: string | null; lot_no: string; exp_date: string | null; purchase_name: string; purchase_unit: string;
    names_seen: { name: string; docNo: string; date: string | null }[]; first_doc_no: string; first_date: string | null; qty_in: string; qty_out: string; stock: string; branches: { code: string; warehouse: string; qty: number }[] | null;
  }>`
    SELECT l.id::text, l.item_id, l.sku, p.sku AS cur_sku, p.name AS cur_name, l.lot_no, l.exp_date::text, l.purchase_name, l.purchase_unit, l.names_seen, l.first_doc_no, l.first_date::text,
           COALESCE(sum(m.qty) FILTER (WHERE m.qty > 0), 0)::text AS qty_in, COALESCE(-sum(m.qty) FILTER (WHERE m.qty < 0), 0)::text AS qty_out, COALESCE(sum(m.qty), 0)::text AS stock,
           (SELECT json_agg(json_build_object('code', b.code, 'warehouse', x.warehouse_code, 'qty', x.q) ORDER BY b.code)
              FROM (SELECT branch_id, warehouse_code, sum(qty) AS q FROM inventory_lot_moves WHERE lot_id = l.id ${branch ? sql`AND branch_id = ${branch.id}` : sql``}
                     GROUP BY 1, 2 HAVING sum(qty) <> 0) x JOIN branches b ON b.id = x.branch_id) AS branches
      FROM item_lots l
      LEFT JOIN products p ON p.tenant_id = l.tenant_id AND p.item_id = l.item_id
      LEFT JOIN inventory_lot_moves m ON m.lot_id = l.id ${branch ? sql`AND m.branch_id = ${branch.id}` : sql``}
     WHERE l.tenant_id = ${tenantId}
       ${search ? sql`AND (lower(l.sku) LIKE ${search} OR lower(COALESCE(p.sku, '')) LIKE ${search} OR lower(l.purchase_name) LIKE ${search} OR lower(COALESCE(p.name, '')) LIKE ${search} OR lower(l.lot_no) LIKE ${search})` : sql``}
       ${q.expWithin !== undefined ? sql`AND l.exp_date IS NOT NULL AND l.exp_date <= current_date + ${q.expWithin}::int` : sql``}
     GROUP BY l.id, p.sku, p.name
    ${q.stock ? sql`HAVING COALESCE(sum(m.qty), 0) <> 0` : sql``}
     ORDER BY COALESCE(p.sku, l.sku), l.exp_date NULLS LAST, l.first_date NULLS LAST, l.id
     LIMIT ${q.limit ?? 2000}`.execute(trx)).rows;
  const today = (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;
  return rows.map((r) => ({
    id: r.id, itemId: r.item_id, sku: r.cur_sku ?? r.sku, skuAtLot: r.sku, name: r.cur_name ?? r.purchase_name, lotNo: r.lot_no, expDate: r.exp_date,
    daysLeft: r.exp_date ? Math.round((Date.parse(r.exp_date) - Date.parse(today)) / 86400000) : null,
    purchaseName: r.purchase_name, purchaseUnit: r.purchase_unit, namesSeen: r.names_seen ?? [], nameChanged: Boolean(r.cur_name && r.purchase_name && r.cur_name !== r.purchase_name),
    firstDocNo: r.first_doc_no, firstDate: r.first_date, qtyIn: Number(r.qty_in), qtyOut: Number(r.qty_out), stock: Number(r.stock), branches: r.branches ?? [],
  }));
}

export async function lotMoves(trx: Db, tenantId: string, lotId: string) {
  const lot = (await sql<{ id: string }>`SELECT id::text FROM item_lots WHERE tenant_id = ${tenantId} AND id = ${lotId}`.execute(trx)).rows[0];
  if (!lot) throw Errors.notFound(`lô #${lotId}`);
  return (await sql<{ doc_date: string; doc_no: string; doc_key: string; doc_type: string; branch: string; warehouse_code: string; kind: string; qty: string; how: string }>`
    SELECT m.doc_date::text, e.doc_no, e.doc_key, e.doc_type, b.code AS branch, m.warehouse_code, m.kind, m.qty::text, m.how
      FROM inventory_lot_moves m JOIN accounting_events e ON e.id = m.event_id JOIN branches b ON b.id = m.branch_id
     WHERE m.tenant_id = ${tenantId} AND m.lot_id = ${lotId} ORDER BY m.doc_date, m.id`.execute(trx)).rows.map((r) => ({ ...r, qty: Number(r.qty) }));
}

/**
 * Phân lô của một phiếu theo dòng: lô nào, bao nhiêu, tên lúc mua của lô. Chỉ để tra cứu — hoá đơn vẫn theo dòng bán như bill
 * ở cửa hàng. `lotNames`: các tên lúc mua của những lô dòng này lấy; `nameDiffers`: có tên lúc mua khác tên trên dòng bán.
 */
export async function documentLots(trx: Db, tenantId: string, docKey: string) {
  const ev = (await sql<{ id: string; doc_no: string; doc_type: string; doc_date: string }>`SELECT id::text, doc_no, doc_type, doc_date::text FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(trx)).rows[0];
  if (!ev) throw Errors.notFound(`chứng từ ${docKey}`);
  const rows = (await sql<{ line_no: number; sku: string; name: string; unit: string; line_qty: string; lot_id: string; lot_no: string; exp_date: string | null; purchase_name: string; qty: string; how: string }>`
    SELECT im.line_no, im.sku, im.name, im.unit, im.qty::text AS line_qty, l.id::text AS lot_id, l.lot_no, l.exp_date::text, l.purchase_name, m.qty::text, m.how
      FROM inventory_movements im JOIN inventory_lot_moves m ON m.movement_id = im.id JOIN item_lots l ON l.id = m.lot_id
     WHERE im.event_id = ${ev.id} ORDER BY im.line_no, im.id, m.id`.execute(trx)).rows;
  const lines = new Map<number, { lineNo: number; sku: string; name: string; unit: string; qty: number; lots: { lotId: string; lotNo: string; expDate: string | null; purchaseName: string; qty: number; how: string }[] }>();
  for (const r of rows) {
    const cur = lines.get(r.line_no) ?? { lineNo: r.line_no, sku: r.sku, name: r.name, unit: r.unit, qty: Math.abs(Number(r.line_qty)), lots: [] };
    cur.lots.push({ lotId: r.lot_id, lotNo: r.lot_no, expDate: r.exp_date, purchaseName: r.purchase_name, qty: Math.abs(Number(r.qty)), how: r.how });
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
export async function suggestLots(trx: Db, tenantId: string, q: { branchCode: string; warehouse?: string; date?: string; items: { sku: string; qty: number }[] }) {
  const branch = (await sql<{ id: string }>`SELECT id::text FROM branches WHERE tenant_id = ${tenantId} AND code = ${q.branchCode}`.execute(trx)).rows[0];
  if (!branch) throw Errors.validation(`Chi nhánh ${q.branchCode} không có`);
  const date = q.date ?? (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;
  const out = [];
  for (const it of q.items) {
    const key = (await sql<{ k: string }>`SELECT COALESCE(bizcity_item_at(${tenantId}::bigint, ${it.sku}, ${date}::date), 'sku:' || ${it.sku}) AS k`.execute(trx)).rows[0]!.k;
    const lots = (await sql<{ lot_no: string; exp_date: string | null; purchase_name: string; avail: string }>`
      SELECT l.lot_no, l.exp_date::text, l.purchase_name, sum(m.qty)::text AS avail
        FROM item_lots l JOIN inventory_lot_moves m ON m.lot_id = l.id
       WHERE l.tenant_id = ${tenantId} AND l.item_key = ${key} AND m.branch_id = ${branch.id}
         ${q.warehouse ? sql`AND m.warehouse_code = ${q.warehouse}` : sql``} AND m.doc_date <= ${date}::date
       GROUP BY l.id
      HAVING sum(m.qty) > 0
       ORDER BY l.exp_date NULLS LAST, l.first_date NULLS LAST, l.id`.execute(trx)).rows;
    let left = it.qty;
    const picks = lots.map((l) => {
      const available = Number(l.avail);
      const take = Math.max(0, Math.min(left, available));
      left = Math.round((left - take) * 10000) / 10000;
      return { lotNo: l.lot_no, expDate: l.exp_date, purchaseName: l.purchase_name, available, take };
    });
    out.push({ sku: it.sku, qty: it.qty, lots: picks, shortage: Math.max(0, left) });
  }
  return out;
}

export async function rebuild(trx: Db, tenantId: string, actor: string, sku?: string) {
  const r = await rebuildLots(trx, tenantId, { sku });
  await writeAudit(trx, { tenantId, actor, action: 'lots.rebuild', objectType: 'item_lots', objectId: sku ?? '*', after: r });
  return r;
}
