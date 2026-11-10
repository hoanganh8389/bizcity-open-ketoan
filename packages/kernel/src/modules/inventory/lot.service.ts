// @bizcity-layer K kernel/subledgers/inventory
// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — phân lô tự động: lô theo số lô + hạn dùng NCC, tên lúc mua, hạn sớm xuất trước, trả về đúng lô (đóng góp)
/**
 * PHÂN LÔ (migration 0098, docs/nghiep-vu/16-lo-hang.md).
 *
 * Chạy ngay sau khi ghi dòng hàng vào / ra kho của một chứng từ (inventory-movement.repository). Với mỗi dòng:
 *   Hàng VÀO
 *     nhập mua, nhập điều chỉnh : lô theo (số lô, hạn dùng) của dòng; dòng không ghi → lô "không số" của mặt hàng.
 *                                 Lô mới giữ TÊN HÀNG LÚC MUA (tên trên dòng); lô cũ nhập thêm với tên khác → ghi vào names_seen.
 *     khách trả hàng             : về đúng các lô đã xuất của phiếu bán gốc (originalDocKey), lô xuất trước trả trước; không có phiếu gốc → lô của dòng /
 *                                 lô không số.
 *     nhận chuyển kho            : đúng các lô bên xuất đã xuất (cùng chứng từ); phiếu một đầu → lô của dòng / lô không số.
 *   Hàng RA (bán, trả NCC, xuất chuyển kho, xuất điều chỉnh)
 *     dòng ghi số lô / hạn dùng → lô đó; không ghi → TỰ ĐỘNG: lô còn tồn ở chi nhánh + kho, hạn dùng sớm trước (lô không hạn
 *     sau cùng), cùng hạn thì nhập trước. Thiếu tồn lô → phần thiếu ghi vào lô không số (how = 'shortage') để tồn theo lô luôn
 *     khớp tồn kho; "Phân lô lại" sắp lại theo đúng thứ tự ngày khi chứng từ về muộn.
 *
 * LÔ THEO TỪNG PHÂN KHO: tồn lô tính riêng từng (chi nhánh, mã kho); tự chọn lô chỉ lấy lô ở đúng kho của dòng. Dòng không ghi mã kho
 * → kho mặc định của chi nhánh (cùng luật báo cáo kho), để lô nhập ở kho mặc định không bị "lạc" khi bán POS không ghi kho.
 *
 * Giá vốn KHÔNG đổi (bình quân tháng). Lô chỉ theo dõi số lượng, hạn dùng, tên lúc mua.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';

type Movement = { id: string; line_no: number; kind: string; item_id: string | null; sku: string; name: string; unit: string; qty: string; branch_id: string; warehouse_code: string; doc_date: string };
type LineInfo = { lotNo?: string; expDate?: string; name?: string; unit?: string };
export interface LotDoc { docType: string; docNo: string; docDate: string; lines?: LineInfo[]; originalDocKey?: string }

const keyOf = (m: { item_id: string | null; sku: string }) => m.item_id ?? `sku:${m.sku}`;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Lấy (hoặc tạo) lô. Lô đã có mà tên khác → ghi thêm vào names_seen (tên lúc mua của lô giữ nguyên). */
export async function ensureLot(db: Db, tenantId: string, a: { itemKey: string; itemId: string | null; sku: string; lotNo: string; expDate: string | null; name: string; unit: string; eventId?: string | null; docNo?: string; date?: string; partnerId?: string | null }): Promise<string> {
  const seen = JSON.stringify([{ name: a.name, docNo: a.docNo ?? '', date: a.date ?? null }]);
  const r = await sql<{ id: string }>`
    INSERT INTO item_lots (tenant_id, item_id, sku, item_key, lot_no, exp_date, purchase_name, purchase_unit, partner_id, first_event_id, first_doc_no, first_date)
    VALUES (${tenantId}, ${a.itemId}, ${a.sku}, ${a.itemKey}, ${a.lotNo}, ${a.expDate}::date, ${a.name}, ${a.unit}, ${a.partnerId ?? null}, ${a.eventId ?? null}, ${a.docNo ?? ''}, ${a.date ?? null}::date)
    ON CONFLICT (tenant_id, item_key, lot_no, COALESCE(exp_date, '0001-01-01'::date)) DO UPDATE SET
      names_seen = CASE WHEN ${a.name} = '' OR item_lots.purchase_name = ${a.name} OR item_lots.names_seen @> ${JSON.stringify([{ name: a.name }])}::jsonb
                        THEN item_lots.names_seen ELSE item_lots.names_seen || ${seen}::jsonb END,
      purchase_name = CASE WHEN item_lots.purchase_name = '' THEN ${a.name} ELSE item_lots.purchase_name END,
      first_date = LEAST(item_lots.first_date, ${a.date ?? null}::date),
      updated_at = now()
    RETURNING id::text`.execute(db);
  return r.rows[0]!.id;
}

async function insertMove(db: Db, tenantId: string, eventId: string, m: Movement, lotId: string, qty: number, how: string) {
  if (!qty) return;
  await sql`INSERT INTO inventory_lot_moves (tenant_id, movement_id, event_id, lot_id, branch_id, warehouse_code, item_id, sku, kind, doc_date, qty, how)
            VALUES (${tenantId}, ${m.id}, ${eventId}, ${lotId}, ${m.branch_id}, ${m.warehouse_code}, ${m.item_id}, ${m.sku}, ${m.kind}, ${m.doc_date}::date, ${round4(qty)}, ${how})`.execute(db);
}

/** Lô còn tồn của mặt hàng ở chi nhánh + kho tới ngày, xếp hạn dùng sớm trước, rồi nhập trước. */
async function availableLots(db: Db, tenantId: string, itemKey: string, branchId: string, warehouse: string, date: string, exceptEvent: string) {
  return (await sql<{ id: string; avail: string }>`
    SELECT l.id::text, sum(m.qty)::text AS avail
      FROM item_lots l JOIN inventory_lot_moves m ON m.lot_id = l.id
     WHERE l.tenant_id = ${tenantId} AND l.item_key = ${itemKey} AND m.branch_id = ${branchId} AND m.warehouse_code = ${warehouse}
       AND m.doc_date <= ${date}::date AND m.event_id <> ${exceptEvent}
     GROUP BY l.id, l.exp_date, l.first_date
    HAVING sum(m.qty) > 0
     ORDER BY l.exp_date NULLS LAST, l.first_date NULLS LAST, l.id`.execute(db)).rows.map((r) => ({ id: r.id, avail: Number(r.avail) }));
}

/** Phân lô các dòng hàng của MỘT chứng từ (đã ghi inventory_movements). Ghi lại từ đầu: xoá phân lô cũ của chứng từ trước. */
export async function allocateLots(db: Db, tenantId: string, eventId: string, doc: LotDoc, partnerId: string | null = null): Promise<void> {
  await sql`DELETE FROM inventory_lot_moves WHERE event_id = ${eventId}`.execute(db);
  const movements = (await sql<Movement>`
    SELECT im.id::text, im.line_no, im.kind, im.item_id, im.sku, im.name, im.unit, im.qty::text, im.branch_id::text,
           COALESCE(NULLIF(im.warehouse_code, ''), dw.code, '') AS warehouse_code, im.doc_date::text
      FROM inventory_movements im
      LEFT JOIN LATERAL (SELECT w.code FROM warehouses w WHERE w.tenant_id = im.tenant_id AND w.branch_id = im.branch_id AND w.is_default ORDER BY w.id LIMIT 1) dw ON true
     WHERE im.event_id = ${eventId} ORDER BY (im.qty < 0) DESC, im.id`.execute(db)).rows;
  if (!movements.length) return;
  const lineOf = (m: Movement): LineInfo => doc.lines?.[m.line_no - 1] ?? {};
  const lotOfLine = async (m: Movement, line: LineInfo) => ensureLot(db, tenantId, {
    itemKey: keyOf(m), itemId: m.item_id, sku: m.sku, lotNo: (line.lotNo ?? '').trim(), expDate: line.expDate ?? null, name: line.name || m.name, unit: line.unit || m.unit,
    eventId, docNo: doc.docNo, date: m.doc_date, partnerId,
  });
  const noLot = (m: Movement) => ensureLot(db, tenantId, { itemKey: keyOf(m), itemId: m.item_id, sku: m.sku, lotNo: '', expDate: null, name: m.name, unit: m.unit, date: m.doc_date });
  const hasLot = (l: LineInfo) => Boolean((l.lotNo ?? '').trim() || l.expDate);
  // Lô của dòng xuất chuyển kho trong chứng từ này (bên nhận dùng lại): line_no → [lot, qty dương]
  const outLots = new Map<number, { lot: string; qty: number }[]>();
  // Phiếu bán gốc của phiếu trả: lô đã xuất theo mặt hàng.
  let soldLots: Map<string, { lot: string; qty: number }[]> | null = null;
  if (doc.docType === 'sale_return' && doc.originalDocKey) {
    const orig = (await sql<{ id: string }>`SELECT id::text FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${doc.originalDocKey}`.execute(db)).rows[0];
    if (orig) {
      soldLots = new Map();
      const rows = (await sql<{ k: string; lot_id: string; qty: string }>`
        SELECT COALESCE(item_id, 'sku:' || sku) AS k, lot_id::text, (-sum(qty))::text AS qty FROM inventory_lot_moves
         WHERE event_id = ${orig.id} AND qty < 0 GROUP BY 1, 2 ORDER BY min(id)`.execute(db)).rows;
      for (const r of rows) soldLots.set(r.k, [...(soldLots.get(r.k) ?? []), { lot: r.lot_id, qty: Number(r.qty) }]);
    }
  }

  for (const m of movements) {
    const qty = Number(m.qty);
    const line = lineOf(m);
    if (qty > 0) {
      if (m.kind === 'transfer_in' && outLots.has(m.line_no)) {
        let left = qty;
        for (const o of outLots.get(m.line_no)!) { const take = Math.min(left, o.qty); await insertMove(db, tenantId, eventId, m, o.lot, take, 'transfer'); left = round4(left - take); if (left <= 0) break; }
        if (left > 0) await insertMove(db, tenantId, eventId, m, await noLot(m), left, 'nolot');
        continue;
      }
      if (m.kind === 'sale_return' && soldLots && !hasLot(line)) {
        let left = qty;
        for (const s of soldLots.get(keyOf(m)) ?? []) {
          const take = Math.min(left, s.qty);
          if (take <= 0) continue;
          await insertMove(db, tenantId, eventId, m, s.lot, take, 'return');
          s.qty = round4(s.qty - take); left = round4(left - take);
          if (left <= 0) break;
        }
        if (left > 0) await insertMove(db, tenantId, eventId, m, await noLot(m), left, 'nolot');
        continue;
      }
      await insertMove(db, tenantId, eventId, m, hasLot(line) ? await lotOfLine(m, line) : await noLot(m), qty, hasLot(line) ? 'line' : 'nolot');
      continue;
    }
    // Hàng ra.
    const need = -qty;
    const taken: { lot: string; qty: number }[] = [];
    if (hasLot(line)) {
      const lot = await lotOfLine(m, line);
      await insertMove(db, tenantId, eventId, m, lot, -need, 'line');
      taken.push({ lot, qty: need });
    } else {
      let left = need;
      for (const a of await availableLots(db, tenantId, keyOf(m), m.branch_id, m.warehouse_code, m.doc_date, eventId)) {
        const take = Math.min(left, a.avail);
        await insertMove(db, tenantId, eventId, m, a.id, -take, 'fifo');
        taken.push({ lot: a.id, qty: take });
        left = round4(left - take);
        if (left <= 0) break;
      }
      if (left > 0) { const lot = await noLot(m); await insertMove(db, tenantId, eventId, m, lot, -left, 'shortage'); taken.push({ lot, qty: left }); }
    }
    if (m.kind === 'transfer_out') outLots.set(m.line_no, taken);
  }
}

/**
 * Phân lô lại theo đúng thứ tự ngày (chứng từ về muộn, sửa ngày, mới bật lô): xoá phân lô rồi chạy lại từng chứng từ theo
 * (ngày, chứng từ). Lọc một mặt hàng thì chỉ chạy các chứng từ có mặt hàng đó (vẫn phân lại cả chứng từ).
 */
export async function rebuildLots(db: Db, tenantId: string, opts: { sku?: string } = {}): Promise<{ documents: number }> {
  const events = (await sql<{ id: string; payload: LotDoc & { partner?: unknown } }>`
    SELECT e.id::text, e.payload FROM accounting_events e
     WHERE e.tenant_id = ${tenantId} AND e.id IN (SELECT DISTINCT event_id FROM inventory_movements WHERE tenant_id = ${tenantId} ${opts.sku ? sql`AND sku = ${opts.sku}` : sql``})
     ORDER BY e.doc_date, e.id`.execute(db)).rows;
  if (!opts.sku) await sql`DELETE FROM inventory_lot_moves WHERE tenant_id = ${tenantId}`.execute(db);
  for (const e of events) {
    const p = typeof e.payload === 'string' ? JSON.parse(e.payload) as LotDoc : e.payload;
    await allocateLots(db, tenantId, e.id, p);
  }
  return { documents: events.length };
}
