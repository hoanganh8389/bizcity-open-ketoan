// @bizcity-layer K kernel/lineage
// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1 (ADR-0021, R-CONT-0 / R-CONT-8): truy vết vòng đời mặt hàng — chỉ đọc, dựng từ khoá thật của dữ liệu hiện có
/**
 * TRUY VẾT VÒNG ĐỜI MẶT HÀNG (bizcity_lineage@1). CHỈ ĐỌC — không ghi gì, không đổi cách tính giá vốn.
 *
 *   searchItems()      tìm mặt hàng theo mã, tên, mã vạch → mã hàng (W1 khoá theo mã; PHASE-024 B2 khoá sang item_id)
 *   getItemLineage()   mọi sự kiện kho + mọi dòng bút toán mang mã + giá vốn từng tháng của MỘT mặt hàng, theo ngày
 *   explainCost()      "Vì sao giá vốn này?": công thức đơn giá bình quân tháng bằng số thật + các phiếu góp vào
 *
 * [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: khoá theo item_id (0066) — mã cũ / mới của một mặt hàng về MỘT hành trình; dòng chưa gắn item_id lấy theo mã.
 * Nối bằng khoá có sẵn: inventory_movements.event_id → accounting_events; ledger_lines.product_sku / source_line_key →
 * ledger_entries.event_id; inventory_costs (nhóm tính giá = đơn vị hạch toán của chi nhánh). Phần chưa truy được nói rõ ở
 * `coverage.notes` (không giả vờ đầy đủ). Luật tính giá ở costing.service.ts; explainCost() CỘNG LẠI từ các phiếu và báo khớp /
 * không khớp số đã lưu — không tự tính lại giá vốn.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import {
  LINEAGE_KIND_LABEL, type CostContribution, type CostExplain, type CostRole, type LineageCostPeriod, type LineageEffect, type LineageEntryLine,
  type LineageEvent, type LineageItem, type LineageKind, type ItemHistory, type ItemHistoryEntry, type ItemImpact,
} from '@ketoan/contracts';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const vn = (n: number, digits = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits });
const KINDS = new Set(Object.keys(LINEAGE_KIND_LABEL));
const ymLabel = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
/** YYYY-MM → MM/YYYY cho câu chữ. */
const mmyyyy = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;

export interface LineageQuery { from?: string; to?: string; branch?: string; limit?: number }

/** Mặt hàng của một mã: item_id (mã đang mở, hoặc mã gần nhất) + lịch sử mã. Chưa có định danh → null. */
async function itemKey(trx: Db, tenantId: string, sku: string): Promise<{ itemId: string | null; codes: { kind: string; code: string; validFrom: string; validTo: string | null }[] }> {
  const hit = await sql<{ item_id: string }>`
    SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind IN ('sku', 'alias') AND code = ${sku}
     ORDER BY (valid_to IS NULL) DESC, valid_from DESC LIMIT 1`.execute(trx);
  const itemId = hit.rows[0]?.item_id ?? null;
  if (!itemId) return { itemId: null, codes: [] };
  const codes = await sql<{ kind: string; code: string; valid_from: string; valid_to: string | null }>`
    SELECT kind, code, valid_from::text, valid_to::text FROM item_codes WHERE tenant_id = ${tenantId} AND item_id = ${itemId} ORDER BY valid_from, id`.execute(trx);
  return { itemId, codes: codes.rows.map((c) => ({ kind: c.kind, code: c.code, validFrom: c.valid_from, validTo: c.valid_to })) };
}
/** [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3: họ mặt hàng theo định danh (cha, con, anh em) với mã hiện hành. */
async function familyOf(trx: Db, tenantId: string, itemId: string | null): Promise<LineageItem['item']['family']> {
  const empty = { parent: null, children: [], siblings: [] };
  if (!itemId) return empty;
  const r = await sql<{ rel: 'parent' | 'child' | 'sibling'; item_id: string; name: string; status: string; sku: string | null }>`
    WITH me AS (SELECT parent_item_id FROM items WHERE tenant_id = ${tenantId} AND item_id = ${itemId}),
    fam AS (
      SELECT 'parent'::text AS rel, i.* FROM items i, me WHERE i.tenant_id = ${tenantId} AND i.item_id = me.parent_item_id
      UNION ALL SELECT 'child', i.* FROM items i WHERE i.tenant_id = ${tenantId} AND i.parent_item_id = ${itemId}
      UNION ALL SELECT 'sibling', i.* FROM items i, me WHERE i.tenant_id = ${tenantId} AND me.parent_item_id IS NOT NULL
                  AND i.parent_item_id = me.parent_item_id AND i.item_id <> ${itemId}
    )
    SELECT f.rel, f.item_id, f.name, f.status,
           (SELECT c.code FROM item_codes c WHERE c.item_id = f.item_id AND c.kind = 'sku' ORDER BY (c.valid_to IS NULL) DESC, c.valid_from DESC LIMIT 1) AS sku
      FROM fam f ORDER BY 1, 5 LIMIT 200`.execute(trx);
  const m = (x: (typeof r.rows)[number]) => ({ itemId: x.item_id, sku: x.sku ?? '', name: x.name, status: x.status });
  return {
    parent: r.rows.filter((x) => x.rel === 'parent').map(m)[0] ?? null,
    children: r.rows.filter((x) => x.rel === 'child').map(m),
    siblings: r.rows.filter((x) => x.rel === 'sibling').map(m),
  };
}

/** Điều kiện "dòng của mặt hàng": theo item_id; dòng chưa gắn item_id thì theo mã. */
const ofItem = (alias: string, skuCol: string, itemId: string | null, sku: string) =>
  itemId ? sql`(${sql.ref(`${alias}.item_id`)} = ${itemId} OR (${sql.ref(`${alias}.item_id`)} IS NULL AND ${sql.ref(`${alias}.${skuCol}`)} = ${sku}))`
    : sql`${sql.ref(`${alias}.${skuCol}`)} = ${sku}`;

/** Tìm mặt hàng cho ô tìm của màn Hành trình: mã (đúng hoặc đầu), mã vạch (đúng), tên (chứa). */
export async function searchItems(trx: Db, tenantId: string, q: string, limit = 20) {
  const text = q.trim();
  if (!text) return [];
  const esc = text.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await trx.selectFrom('products').select(['sku', 'name', 'unit', 'barcode', 'is_active', 'is_draft'])
    .where('tenant_id', '=', tenantId)
    .where((eb) => eb.or([eb('sku', '=', text), eb('barcode', '=', text), eb('sku', 'ilike', `${esc}%`), eb('name', 'ilike', `%${esc}%`)]))
    .orderBy(sql`(sku = ${text}) DESC`).orderBy('sku').limit(Math.min(limit, 50)).execute();
  const found = rows.map((r) => ({ sku: r.sku, name: r.name, unit: r.unit, barcode: r.barcode, isActive: r.is_active, isDraft: r.is_draft }));
  // [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: gõ MÃ CŨ (đã đổi), bí danh, mã ngoài → ra mặt hàng hiện hành (cùng item_id), kèm ghi chú mã đã gõ
  const old = await sql<{ sku: string; name: string; unit: string; barcode: string; is_active: boolean; is_draft: boolean; matched: string }>`
    SELECT DISTINCT ON (p.sku) p.sku, p.name, p.unit, p.barcode, p.is_active, p.is_draft, c.code AS matched
      FROM item_codes c
      JOIN item_codes cur ON cur.item_id = c.item_id AND cur.kind = 'sku' AND cur.valid_to IS NULL
      JOIN products p ON p.tenant_id = cur.tenant_id AND p.sku = cur.code
     WHERE c.tenant_id = ${tenantId} AND c.code = ${text} AND p.sku <> ${text}
     LIMIT 10`.execute(trx);
  for (const o of old.rows) if (!found.some((f) => f.sku === o.sku)) found.unshift({ sku: o.sku, name: `${o.name} (mã cũ / khác: ${o.matched})`, unit: o.unit, barcode: o.barcode, isActive: o.is_active, isDraft: o.is_draft });
  return found;
}

function effectOf(kind: LineageKind, sameGroup: boolean): { effect: LineageEffect; why: string } {
  if ((kind === 'transfer_out' || kind === 'transfer_in') && sameGroup) {
    return { effect: 'operational', why: 'Chuyển kho trong cùng nhóm tính giá: đổi nơi để hàng, không đổi giá trị tồn của nhóm, không sinh doanh thu / giá vốn.' };
  }
  if (kind === 'transfer_out' || kind === 'transfer_in') {
    return { effect: 'accounting', why: 'Chuyển kho sang nhóm tính giá khác: hàng mang giá trị của nhóm gửi sang nhóm nhận (có bút toán hàng đi đường).' };
  }
  return { effect: 'accounting', why: 'Đổi số lượng và giá trị tồn của mặt hàng; có bút toán đi kèm khi chứng từ ghi sổ.' };
}

/** Hành trình một mặt hàng. `limit` áp riêng cho sự kiện và bút toán; vượt thì `summary.truncated`. */
export async function getItemLineage(trx: Db, tenantId: string, sku: string, q: LineageQuery = {}): Promise<LineageItem> {
  // Mã gõ vào có thể là MÃ CŨ (đã đổi mã, B2b): tra định danh trước, rồi lấy mặt hàng hiện hành theo mã đang mở.
  const key = await itemKey(trx, tenantId, sku);
  const current = key.codes.find((c) => c.kind === 'sku' && c.validTo === null)?.code ?? sku;
  const item = await trx.selectFrom('products').select(['sku', 'name', 'unit', 'barcode', 'is_active', 'is_draft']).where('tenant_id', '=', tenantId).where('sku', '=', current).executeTakeFirst();
  if (!item) throw Errors.notFound(`mặt hàng ${sku}`);
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const from = q.from || null;
  const to = q.to || null;

  const evRows = await sql<{
    at: string; kind: string; code: string; line_no: number; qty: string; amount: string | null; unit: string; warehouse_code: string; is_gift: boolean;
    branch: string; counter: string | null; g1: string; g2: string | null; doc_key: string; doc_no: string; doc_type: string; version: number;
    status: string; original: string | null;
  }>`
    SELECT m.doc_date::text AS at, m.kind, m.sku AS code, m.line_no, m.qty, m.amount, m.unit, m.warehouse_code, m.is_gift,
           b.code AS branch, cb.code AS counter, COALESCE(b.accounting_unit_id, 0)::text AS g1,
           CASE WHEN cb.id IS NULL THEN NULL ELSE COALESCE(cb.accounting_unit_id, 0)::text END AS g2,
           e.doc_key, e.doc_no, e.doc_type, e.version, e.status, e.payload ->> 'originalDocKey' AS original
      FROM inventory_movements m
      JOIN accounting_events e ON e.id = m.event_id
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
     WHERE m.tenant_id = ${tenantId} AND ${ofItem('m', 'sku', key.itemId, sku)}
       ${from ? sql`AND m.doc_date >= ${from}::date` : sql``}
       ${to ? sql`AND m.doc_date <= ${to}::date` : sql``}
       ${q.branch ? sql`AND b.code = ${q.branch}` : sql``}
     ORDER BY m.doc_date, m.id
     LIMIT ${limit + 1}`.execute(trx);

  const events: LineageEvent[] = evRows.rows.slice(0, limit).filter((r) => KINDS.has(r.kind)).map((r) => {
    const kind = r.kind as LineageKind;
    const { effect, why } = effectOf(kind, r.g2 !== null && r.g2 === r.g1);
    return {
      at: r.at, kind, label: LINEAGE_KIND_LABEL[kind], effect, effectWhy: why, docKey: r.doc_key, docNo: r.doc_no, docType: r.doc_type,
      version: r.version, status: r.status, branch: r.branch, warehouse: r.warehouse_code, lineNo: r.line_no, qty: num(r.qty),
      amount: r.amount === null ? null : num(r.amount), unit: r.unit, counterBranch: r.counter, originalDocKey: r.original, isGift: r.is_gift, code: r.code,
    };
  });

  const enRows = await sql<{
    entry_no: string; doc_no: string; doc_type: string; doc_key: string | null; posting_date: string; account_code: string; account_name: string | null;
    debit: string; credit: string; cost_fill: string | null; part: string; description: string; status: string; branch: string;
  }>`
    SELECT e.entry_no, e.doc_no, e.doc_type, ev.doc_key, l.posting_date::text, l.account_code, a.name AS account_name, l.debit, l.credit, l.cost_fill,
           l.part, l.description, CASE WHEN e.is_reversal THEN 'reversal' ELSE e.status END AS status, b.code AS branch
      FROM ledger_lines l
      JOIN ledger_entries e ON e.id = l.entry_id
      JOIN branches b ON b.id = l.branch_id
      LEFT JOIN accounting_events ev ON ev.id = e.event_id
      LEFT JOIN accounts a ON a.tenant_id = l.tenant_id AND a.code = l.account_code
     WHERE l.tenant_id = ${tenantId} AND ${ofItem('l', 'product_sku', key.itemId, sku)}
       ${from ? sql`AND l.posting_date >= ${from}::date` : sql``}
       ${to ? sql`AND l.posting_date <= ${to}::date` : sql``}
       ${q.branch ? sql`AND b.code = ${q.branch}` : sql``}
     ORDER BY l.posting_date, l.id
     LIMIT ${limit + 1}`.execute(trx);
  const entries: LineageEntryLine[] = enRows.rows.slice(0, limit).map((r) => ({
    entryNo: r.entry_no, docNo: r.doc_no, docType: r.doc_type, docKey: r.doc_key, postingDate: r.posting_date, account: r.account_code,
    accountName: r.account_name ?? '', debit: num(r.debit), credit: num(r.credit), costFill: r.cost_fill, part: r.part, description: r.description,
    status: r.status, branch: r.branch,
  }));

  const periodFilter = from || to
    ? sql`AND (c.year * 12 + c.month) BETWEEN ${monthIdx(from, 0)} AND ${monthIdx(to, 9_999_999)}`
    : sql``;
  const costRows = await sql<{
    year: number; month: number; cost_group: string; unit_code: string | null; unit_name: string | null; opening_qty: string; opening_value: string;
    in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; cost_source: string;
  }>`
    SELECT c.year, c.month, c.cost_group::text, u.code AS unit_code, u.name AS unit_name, c.opening_qty, c.opening_value, c.in_qty, c.in_value,
           c.unit_cost, c.out_qty, c.closing_qty, c.closing_value, c.cost_source
      FROM inventory_costs c LEFT JOIN accounting_units u ON u.id = c.cost_group
     WHERE c.tenant_id = ${tenantId} AND ${ofItem('c', 'sku', key.itemId, sku)} ${periodFilter}
     ORDER BY c.year DESC, c.month DESC, c.cost_group LIMIT 120`.execute(trx);
  const costPeriods: LineageCostPeriod[] = costRows.rows.reverse().map(costRow);

  // Dòng kho không mang tiền (bán, chuyển, điều chỉnh) được định giá ở bước Tính giá vốn tháng: chỉ báo thiếu khi THÁNG ĐÓ chưa tính.
  const costed = new Set(costPeriods.map((c) => c.period));
  const unvaluedEvents = events.filter((e) => e.amount === null && !costed.has(e.at.slice(0, 7)));
  const unvalued = unvaluedEvents.length;
  const unvaluedMonths = [...new Set(unvaluedEvents.map((e) => mmyyyy(e.at.slice(0, 7))))];
  const returnsNoOrigin = events.filter((e) => e.kind === 'sale_return' && !e.originalDocKey).length;
  const waiting = entries.filter((l) => l.costFill && l.debit === 0 && l.credit === 0).length;
  const skuCodes = key.codes.filter((c) => c.kind === 'sku');
  const notes = [key.itemId
    ? `Truy vết theo định danh mặt hàng ${key.itemId}${skuCodes.length > 1 ? ` — gồm mọi mã từng dùng: ${skuCodes.map((c) => `${c.code} (${c.validFrom === '1970-01-01' ? 'từ đầu' : c.validFrom} → ${c.validTo ?? 'nay'})`).join(', ')}` : ''}.`
    : 'Truy vết theo mã hàng hiện hành: mặt hàng chưa có định danh (dữ liệu trước Item Master).'];
  if (unvalued) notes.push(`${unvalued} sự kiện kho thuộc tháng chưa tính giá vốn (${unvaluedMonths.join(', ')}): chạy "Tính giá vốn" để có giá vốn và bút toán.`);
  if (waiting) notes.push(`${waiting} dòng bút toán giá vốn đang chờ tính giá (số 0 cho tới khi chạy tính giá vốn).`);
  if (returnsNoOrigin) notes.push(`${returnsNoOrigin} phiếu khách trả hàng chưa nối được chứng từ bán gốc — chưa biết hoàn đúng giá vốn lần bán nào.`);
  if (!costPeriods.length) notes.push('Mặt hàng chưa có tháng nào được tính giá vốn.');

  const inQty = events.filter((e) => e.qty > 0).reduce((s, e) => s + e.qty, 0);
  const outQty = events.filter((e) => e.qty < 0).reduce((s, e) => s - e.qty, 0);
  return {
    item: { itemId: key.itemId, codes: key.codes, sku: item.sku, name: item.name, unit: item.unit, barcode: item.barcode, isActive: item.is_active, isDraft: item.is_draft, family: await familyOf(trx, tenantId, key.itemId) },
    coverage: { keyedBy: key.itemId ? 'item_id' : 'sku', notes },
    range: { from, to },
    events, entries, costPeriods,
    summary: {
      events: events.length, accountingEvents: events.filter((e) => e.effect === 'accounting').length, operationalEvents: events.filter((e) => e.effect === 'operational').length,
      unvaluedEvents: unvalued, inQty, outQty, entries: entries.length, truncated: evRows.rows.length > limit || enRows.rows.length > limit,
    },
  };
}

/** YYYY-MM-DD → chỉ số tháng (năm × 12 + tháng) cho BETWEEN; thiếu ngày thì dùng `fallback`. */
function monthIdx(d: string | null, fallback: number): number {
  if (!d) return fallback;
  const [y, m] = d.split('-').map(Number);
  return y! * 12 + m!;
}

function costRow(r: { year: number; month: number; cost_group: string; unit_code: string | null; unit_name: string | null; opening_qty: string; opening_value: string; in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; cost_source: string }): LineageCostPeriod {
  return {
    period: ymLabel(r.year, r.month), costGroup: r.unit_code ?? r.cost_group, costGroupName: r.unit_name ?? '', openingQty: num(r.opening_qty), openingValue: num(r.opening_value),
    inQty: num(r.in_qty), inValue: num(r.in_value), unitCost: num(r.unit_cost), outQty: num(r.out_qty), closingQty: num(r.closing_qty), closingValue: num(r.closing_value), source: r.cost_source,
  };
}

const ROLE_WHY: Record<CostRole, string> = {
  in: 'Vào công thức đơn giá: cộng vào số lượng và giá trị nhập của tháng.',
  out: 'Hàng xuất: lấy theo đơn giá của tháng, không làm đổi đơn giá.',
  gift: 'Quà khuyến mại nhận kèm phiếu mua: vào tồn nhưng không vào đơn giá (không kéo giá vốn xuống).',
  internal: 'Chuyển kho trong cùng nhóm tính giá: không đổi giá trị tồn của nhóm.',
  return: 'Trả nhà cung cấp: định giá theo tồn đầu hoặc theo phiếu tuỳ lý do trả (xem luật ở tính giá vốn).',
};

/** "Vì sao giá vốn này?" — một mặt hàng, một tháng, một nhóm tính giá (bình quân gia quyền theo tháng, luật hiện hành). */
export async function explainCost(trx: Db, tenantId: string, sku: string, period: string, costGroup?: string): Promise<CostExplain> {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw Errors.validation('Kỳ phải dạng YYYY-MM');
  const year = Number(m[1]);
  const month = Number(m[2]);
  const exists = await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirst();
  if (!exists) throw Errors.notFound(`mặt hàng ${sku}`);
  const key = await itemKey(trx, tenantId, sku);

  const rows = await sql<{
    year: number; month: number; cost_group: string; unit_code: string | null; unit_name: string | null; opening_qty: string; opening_value: string;
    in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; cost_source: string;
  }>`
    SELECT c.year, c.month, c.cost_group::text, u.code AS unit_code, u.name AS unit_name, c.opening_qty, c.opening_value, c.in_qty, c.in_value,
           c.unit_cost, c.out_qty, c.closing_qty, c.closing_value, c.cost_source
      FROM inventory_costs c LEFT JOIN accounting_units u ON u.id = c.cost_group
     WHERE c.tenant_id = ${tenantId} AND ${ofItem('c', 'sku', key.itemId, sku)} AND c.year = ${year} AND c.month = ${month}
     ORDER BY c.cost_group`.execute(trx);
  const all = rows.rows.map((r) => ({ raw: r, row: costRow(r) }));
  const chosen = costGroup ? all.find((x) => x.row.costGroup === costGroup || x.raw.cost_group === costGroup) : all.sort((a, b) => b.row.inQty + b.row.outQty - (a.row.inQty + a.row.outQty))[0];
  if (!chosen) {
    return {
      sku, period, costGroup: costGroup ?? '', costGroupName: '', computed: false, row: null, previous: null, changePct: null,
      sentences: [`Tháng ${mmyyyy(period)} chưa có giá vốn của mã ${sku}: chưa chạy "Tính giá vốn" cho tháng này, hoặc mặt hàng không phát sinh.`],
      contributions: [], reconcile: { inQty: 0, inValue: 0, matchesStored: null, note: 'Chưa có số đã lưu để đối chiếu.' },
    };
  }
  const row = chosen.row;
  const groupId = chosen.raw.cost_group;

  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const prev = await trx.selectFrom('inventory_costs').select('unit_cost').where('tenant_id', '=', tenantId)
    .where(key.itemId ? sql<boolean>`(item_id = ${key.itemId} OR (item_id IS NULL AND sku = ${sku}))` : sql<boolean>`sku = ${sku}`)
    .where('year', '=', prevY).where('month', '=', prevM).where(sql<boolean>`cost_group::text = ${groupId}`).executeTakeFirst();
  const previous = prev ? { period: ymLabel(prevY, prevM), unitCost: num(prev.unit_cost) } : null;
  const changePct = previous && previous.unitCost > 0 ? ((row.unitCost - previous.unitCost) / previous.unitCost) * 100 : null;

  const first = `${period}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const mv = await sql<{ at: string; kind: string; qty: string; amount: string | null; excl: boolean; priced: boolean; doc_key: string; doc_no: string; branch: string; g1: string; g2: string | null }>`
    SELECT m.doc_date::text AS at, m.kind, m.qty, m.amount, m.exclude_cost AS excl, m.priced_at_sale AS priced, e.doc_key, e.doc_no, b.code AS branch,
           COALESCE(b.accounting_unit_id, 0)::text AS g1, CASE WHEN cb.id IS NULL THEN NULL ELSE COALESCE(cb.accounting_unit_id, 0)::text END AS g2
      FROM inventory_movements m
      JOIN accounting_events e ON e.id = m.event_id
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
     WHERE m.tenant_id = ${tenantId} AND ${ofItem('m', 'sku', key.itemId, sku)} AND m.doc_date BETWEEN ${first}::date AND ${last}::date
       AND COALESCE(b.accounting_unit_id, 0)::text = ${groupId}
     ORDER BY m.doc_date, m.id LIMIT 500`.execute(trx);

  const contributions: CostContribution[] = mv.rows.filter((r) => KINDS.has(r.kind)).map((r) => {
    const kind = r.kind as LineageKind;
    const external = r.g2 !== null && r.g2 !== r.g1;
    let role: CostRole;
    if (kind === 'purchase') role = r.excl ? 'gift' : 'in';
    else if (kind === 'purchase_return') role = 'return';
    else if (kind === 'adjust_in') role = 'in';
    else if (kind === 'transfer_in') role = external ? 'in' : 'internal';
    else if (kind === 'transfer_out') role = external ? 'out' : 'internal';
    else role = 'out';
    return { at: r.at, docKey: r.doc_key, docNo: r.doc_no, kind, label: LINEAGE_KIND_LABEL[kind], role, roleWhy: ROLE_WHY[role], branch: r.branch, qty: num(r.qty), amount: r.amount === null ? null : num(r.amount) };
  });

  const ins = contributions.filter((c) => c.role === 'in' && c.amount !== null);
  const sumQty = ins.reduce((s, c) => s + c.qty, 0);
  const sumValue = ins.reduce((s, c) => s + (c.amount ?? 0), 0);
  const hasSpecial = contributions.some((c) => c.role === 'return' || c.kind === 'adjust_in');
  const matches = Math.abs(sumQty - row.inQty) < 0.5 && Math.abs(sumValue - row.inValue) < 1;
  const reconcile = {
    inQty: sumQty, inValue: sumValue, matchesStored: matches,
    note: matches ? 'Cộng lại từ các phiếu nhập liệt kê khớp số đã lưu ở bảng giá vốn.'
      : hasSpecial ? 'Không khớp hoàn toàn vì tháng có phiếu trả nhà cung cấp / điều chỉnh: các loại này được định giá theo luật lý do (xem Tính giá vốn), không cộng thẳng thành tiền trên phiếu.'
        : 'Không khớp số đã lưu: có thể giá vốn tháng được tính trước khi có thay đổi chứng từ — chạy lại "Tính giá vốn" tháng này.',
  };

  const sentences: string[] = [];
  const f = (n: number, d = 0) => vn(n, d);
  if (row.source === 'import') {
    sentences.push(`Đơn giá tháng ${mmyyyy(period)} lấy từ bảng giá vốn nhập từ Excel: ${f(row.unitCost, 2)} đồng / đơn vị tính gốc (không tính theo công thức bình quân).`);
  } else {
    const oq = row.openingQty > 0 ? row.openingQty : 0;
    const ov = row.openingQty > 0 ? row.openingValue : 0;
    sentences.push(oq > 0 ? `Tồn đầu tháng: số lượng ${f(oq, 2)}, giá trị ${f(ov)} đồng (đơn giá đầu kỳ ${f(ov / oq, 2)} đồng).` : 'Tồn đầu tháng: không có.');
    sentences.push(`Nhập trong tháng: số lượng ${f(row.inQty, 2)}, giá trị ${f(row.inValue)} đồng, từ ${ins.length} dòng nhập.`);
    const den = oq + row.inQty;
    sentences.push(den > 0
      ? `Đơn giá = (${f(ov)} + ${f(row.inValue)}) ÷ (${f(oq, 2)} + ${f(row.inQty, 2)}) = ${f(row.unitCost, 2)} đồng.`
      : `Số lượng để chia ≤ 0 nên lấy đơn giá dương gần nhất của các tháng trước: ${f(row.unitCost, 2)} đồng.`);
  }
  sentences.push(`Xuất trong tháng: số lượng ${f(row.outQty, 2)} × đơn giá ${f(row.unitCost, 2)} = ${f(Math.round(row.outQty * row.unitCost))} đồng giá vốn hàng xuất.`);
  if (previous && changePct !== null) {
    sentences.push(`So với tháng ${mmyyyy(previous.period)} (đơn giá ${f(previous.unitCost, 2)}): ${changePct >= 0 ? 'tăng' : 'giảm'} ${f(Math.abs(changePct), 1)}%.`);
    const opening = row.openingQty > 0 ? row.openingValue / row.openingQty : previous.unitCost;
    const far = ins.filter((c) => c.qty > 0).map((c) => ({ c, p: (c.amount ?? 0) / c.qty })).sort((a, b) => Math.abs(b.p - opening) - Math.abs(a.p - opening))[0];
    if (far && opening > 0 && Math.abs(far.p - opening) / opening > 0.02) {
      sentences.push(`Phiếu kéo đơn giá nhiều nhất: ${far.c.docNo} (${far.c.at}) — ${f(far.c.qty, 2)} nhập với đơn giá ${f(far.p, 2)}, ${far.p > opening ? 'cao' : 'thấp'} hơn đơn giá đầu kỳ ${f((Math.abs(far.p - opening) / opening) * 100, 1)}%.`);
    }
  }

  return { sku, period, costGroup: row.costGroup, costGroupName: row.costGroupName, computed: true, row, previous, changePct, sentences, contributions, reconcile };
}

// [2026-11-04 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-10 (D026-5): Lịch sử mặt hàng — mã cũ / mới, hiệu lực, người đổi, phân loại, sửa có lý do
const HISTORY_LIMIT = 300;
const ACTION_TEXT: Record<string, string> = {
  'product.update': 'Sửa khai báo', 'product.draft': 'Lưu nháp (còn thiếu khai báo)', 'product.activate': 'Kích hoạt (hết lỗi chặn)',
  'product.create': 'Thêm mặt hàng', 'product.delete': 'Xoá khỏi danh mục (định danh ngừng dùng, không mất)', 'catalog.warn.unacked': 'Lưu qua API còn cảnh báo, không ghi lý do',
  'catalog.product.save': 'Sửa khai báo', 'catalog.product.create': 'Thêm mặt hàng', 'core.catalog-product.save': 'Sửa khai báo',
  'core.product.upsert': 'Tạo / cập nhật qua API', 'core.item.upsert': 'Tạo / cập nhật qua API', 'core.item.add-code': 'Thêm mã', 'core.item.retire-code': 'Đóng mã', 'core.item.classify': 'Đổi phân loại hạch toán',
};
const FIELD_TEXT: Record<string, string> = {
  name: 'tên', unit: 'đơn vị tính', postingGroupCode: 'nhóm hạch toán', brandCode: 'nhãn hàng', industryCode: 'ngành hàng', groupCode: 'nhóm hàng', typeCode: 'loại hàng',
  isActive: 'theo dõi', note: 'ghi chú', taxOutCode: 'thuế bán ra', taxInCode: 'thuế mua vào', exciseRate: 'thuế TTĐB',
  isMain: 'hàng chính', noSale: 'không bán', origin: 'xuất xứ', parentSku: 'mã cha', barcode: 'mã vạch',
};
// [2026-11-05 06:50 PM Nguyễn Văn Thủy] PHASE-026 — S026-23: lịch sử nói đổi từ gì sang gì, so lần ghi này với lần ghi trước của cùng mặt hàng (đóng góp)
type Snapshot = Map<string, string>;
const SNAP_MAX_LIST = 5;
/** Giá trị đọc được của một lần ghi. Đầu vào của action: trường để trống nghĩa là giữ giá trị cũ, nên bỏ qua. */
function snapshotOf(data: Record<string, unknown>, partial: boolean): Snapshot {
  const out: Snapshot = new Map();
  for (const [k, v] of Object.entries(data)) {
    if (!FIELD_TEXT[k] || (partial && (v === '' || v === null || v === undefined))) continue;
    out.set(k, show(v));
  }
  if (Array.isArray(data.units)) {
    out.set('@units', (data.units as { unit?: string; ratio?: number }[]).map((u) => `${show(u.unit)} = ${show(u.ratio)}`).sort().join(', '));
  }
  if (Array.isArray(data.prices)) {
    for (const x of data.prices as { priceListCode?: string; unit?: string; price?: unknown }[]) out.set(`@price:${show(x.priceListCode)} / ${show(x.unit)}`, show(x.price));
  }
  return out;
}
const labelOf = (k: string) => (k === '@units' ? 'đơn vị tính' : k.startsWith('@price:') ? `giá ${k.slice(7)}` : FIELD_TEXT[k]!);
/** So với giá trị đã biết: có trước đó thì ghi A → B; chưa từng biết thì ghi giá trị. Cập nhật `known`. */
function describeChange(known: Snapshot, now: Snapshot): { text: string[]; changed: boolean; first: boolean } {
  const seen = known.size > 0;
  const text: string[] = [];
  for (const [k, v] of now) {
    const before = known.get(k);
    if (before === undefined) {
      if (!seen) text.push(`${labelOf(k)} = ${v}`);
      else if (v !== show('')) text.push(`${labelOf(k)}: (chưa có) → ${v}`);   // lần đầu thấy mà trống thì không phải thay đổi
    }
    else if (before !== v) text.push(`${labelOf(k)}: ${before} → ${v}`);
    known.set(k, v);
  }
  return { text, changed: text.length > 0, first: !seen };
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(trống)' : typeof v === 'boolean' ? (v ? 'có' : 'không') : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

/** Lịch sử một mặt hàng (mã đang dùng hoặc mã cũ): mới nhất trước. */
export async function getItemHistory(trx: Db, tenantId: string, sku: string): Promise<ItemHistory> {
  const key = await itemKey(trx, tenantId, sku);
  if (!key.itemId) throw Errors.notFound(`mặt hàng ${sku}`);
  const itemId = key.itemId;
  const current = key.codes.find((c) => c.kind === 'sku' && c.validTo === null)?.code ?? sku;
  const item = await sql<{ created_at: Date; created_by: string; source_system: string; attributes: Record<string, unknown> }>`
    SELECT created_at, created_by, source_system, attributes FROM items WHERE tenant_id = ${tenantId} AND item_id = ${itemId}`.execute(trx);
  const codes = await sql<{ kind: string; code: string; valid_from: string; valid_to: string | null; created_at: Date; created_by: string; note: string }>`
    SELECT kind, code, valid_from::text, valid_to::text, created_at, created_by, note FROM item_codes
     WHERE tenant_id = ${tenantId} AND item_id = ${itemId} ORDER BY valid_from, id`.execute(trx);
  const cls = await sql<{ valid_from: string; posting_group_code: string | null; tax_out_code: string | null; tax_in_code: string | null; created_at: Date; created_by: string }>`
    SELECT valid_from::text, posting_group_code, tax_out_code, tax_in_code, created_at, created_by FROM item_classification
     WHERE tenant_id = ${tenantId} AND item_id = ${itemId} ORDER BY valid_from, id`.execute(trx);
  const skus = [...new Set(codes.rows.filter((c) => c.kind === 'sku').map((c) => c.code))];
  const audits = skus.length
    ? await sql<{ action: string; actor: string; after_data: Record<string, unknown> | null; created_at: Date; object_id: string }>`
        SELECT action, actor, after_data, created_at, object_id FROM audit_logs
         WHERE tenant_id = ${tenantId} AND ((object_type IN ('product', 'catalog_product') AND object_id = ANY(${skus}::text[]))
            -- [2026-11-05 01:50 PM Nguyễn Văn Thủy] PHASE-026 — S026-21: thao tác theo định danh: đổi mã, gộp mã, gồm mặt hàng đã gộp vào (đóng góp)
            OR (object_type = 'item' AND object_id IN (SELECT bizcity_item_family(${itemId}))))
         ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_LIMIT}`.execute(trx)
    : { rows: [] };

  const out: ItemHistoryEntry[] = [];
  const it = item.rows[0];
  if (it) {
    const orphan = it.attributes?.orphan === true;
    out.push({ at: iso(it.created_at), effectiveFrom: null, kind: 'created', by: it.created_by,
      text: orphan ? 'Tạo định danh cho mã có trong sổ / kho mà chưa có trong danh mục (mặt hàng mồ côi)' : `Tạo định danh mặt hàng (nguồn: ${it.source_system || 'danh mục'})` });
  }
  for (const c of codes.rows) {
    const from = c.valid_from === '1970-01-01' ? null : c.valid_from;
    const label = c.kind === 'sku' ? 'mã hàng' : c.kind === 'barcode' ? 'mã vạch' : c.kind === 'alias' ? 'bí danh' : `mã ${c.kind}`;
    const renamed = c.kind === 'sku' ? /^đổi mã từ ([^:]+)/.exec(c.note)?.[1] ?? null : null;
    out.push({ at: iso(c.created_at), effectiveFrom: from, kind: 'code', by: c.created_by,
      text: renamed ? `Đổi mã ${renamed} → ${c.code}${from ? ` (hiệu lực từ ${from})` : ''}`
        : `${label[0]!.toUpperCase()}${label.slice(1)} ${c.code}${from ? ` có hiệu lực từ ${from}` : ''}${c.valid_to ? ` — đã đóng, dùng tới trước ${c.valid_to}` : ''}` });
  }
  cls.rows.forEach((c, i) => {
    const prev = cls.rows[i - 1];
    const from = c.valid_from === '1970-01-01' ? null : c.valid_from;
    out.push({ at: iso(c.created_at), effectiveFrom: from, kind: 'classification', by: c.created_by,
      text: prev
        ? `Đổi phân loại hạch toán: nhóm ${show(prev.posting_group_code)} → ${show(c.posting_group_code)}${from ? ` từ ${from}` : ''} (chứng từ trước ngày đó giữ phân loại cũ)`
        : `Phân loại hạch toán ban đầu: nhóm ${show(c.posting_group_code)}` });
  });
  // [2026-11-05 02:05 PM Nguyễn Văn Thủy] PHASE-026 — S026-23: thao tác trong action ghi nhật ký vào notes.audit của bằng chứng (ACTION §4.4), đọc ra thành từng dòng (đóng góp)
  type AuditRow = (typeof audits.rows)[number];
  const flat: AuditRow[] = audits.rows.flatMap((a): AuditRow[] => {
    const nested = (a.after_data?.notes as { audit?: { action: string; objectType?: string; objectId?: string; after?: Record<string, unknown> | null }[] } | undefined)?.audit;
    const mine = (nested ?? []).filter((n) => n.objectType === 'item' || (n.objectType === 'product' && skus.includes(n.objectId ?? '')));
    if (!mine.length) return [a];
    return mine.map((n) => ({ action: n.action, actor: a.actor, after_data: n.after ?? null, created_at: a.created_at, object_id: n.objectId ?? a.object_id }));
  });
  const known: Snapshot = new Map();
  for (const a of [...flat].reverse()) {
    const after = a.after_data ?? {};
    const res = ((after.notes as Record<string, unknown> | undefined)?.result ?? {}) as Record<string, unknown>;
    if (a.action === 'core.item.merge') {
      out.push({ at: iso(a.created_at), effectiveFrom: show(res.mergedAt), kind: 'change', by: a.actor,
        text: `Gộp mã ${show(res.fromSku)} vào ${show(res.toSku)} — lý do: "${show(res.reason)}"` });
      continue;
    }
    if (a.action === 'core.item.rename-code') {
      out.push({ at: iso(a.created_at), effectiveFrom: show(res.validFrom), kind: 'change', by: a.actor,
        text: `Lý do đổi mã ${show(res.fromSku)} → ${show(res.toSku)}: "${show(res.reason)}"` });
      continue;
    }
    if (a.action === 'catalog.warn.ack') {
      out.push({ at: iso(a.created_at), effectiveFrom: null, kind: 'warn-ack', by: a.actor,
        text: `Lưu dù có cảnh báo ${(after.codes as string[] | undefined)?.join(', ') ?? ''} — lý do: "${show(after.reason)}"` });
      continue;
    }
    const input = after.input as Record<string, unknown> | undefined;
    const change = describeChange(known, snapshotOf(input ?? after, Boolean(input)));
    const shown = change.first ? change.text : change.text.slice(0, SNAP_MAX_LIST).concat(change.text.length > SNAP_MAX_LIST ? [`và ${change.text.length - SNAP_MAX_LIST} thay đổi khác`] : []);
    const detail = shown.length ? `: ${shown.join('; ')}` : change.first ? '' : ': không đổi thông tin';
    out.push({ at: iso(a.created_at), effectiveFrom: null, kind: 'change', by: a.actor,
      text: `${ACTION_TEXT[a.action] ?? a.action}${detail}${a.object_id !== current && skus.includes(a.object_id) ? ` (khi còn mã ${a.object_id})` : ''}` });
  }
  out.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  return { itemId, sku: current, entries: out.slice(0, HISTORY_LIMIT), truncated: out.length > HISTORY_LIMIT || audits.rows.length >= HISTORY_LIMIT };
}

// [2026-11-04 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-11 (D026-5): Tác động — mã này đang được dùng ở đâu, đọc trước khi đổi mã / nhóm / ngừng
const DOC_LABEL: Record<string, string> = {
  purchase: 'phiếu mua', purchase_return: 'phiếu trả NCC', sale: 'phiếu bán', sale_return: 'phiếu khách trả', transfer: 'phiếu chuyển kho',
  stock_adjustment: 'phiếu điều chỉnh kho', cogs: 'phiếu giá vốn',
};
const fmtQty = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(n);

/** Tác động của một mặt hàng (mã đang dùng hoặc mã cũ). Truy vấn theo item_id (chỉ mục 0066), không quét bảng. */
export async function getItemImpact(trx: Db, tenantId: string, sku: string): Promise<ItemImpact> {
  const key = await itemKey(trx, tenantId, sku);
  if (!key.itemId) throw Errors.notFound(`mặt hàng ${sku}`);
  // [2026-11-05 05:45 PM Nguyễn Văn Thủy] PHASE-026 — S026-21: tính cả mặt hàng đã gộp vào (đóng góp)
  const id = key.itemId;
  const current = key.codes.find((c) => c.kind === 'sku' && c.validTo === null)?.code ?? sku;
  const [docs, stock, accounts, prices, units, costs, locked] = await Promise.all([
    sql<{ doc_type: string; n: string; first: string; last: string }>`
      SELECT e.doc_type, count(DISTINCT e.id)::text AS n, min(m.doc_date)::text AS first, max(m.doc_date)::text AS last
        FROM inventory_movements m JOIN accounting_events e ON e.id = m.event_id
       WHERE m.tenant_id = ${tenantId} AND m.item_id IN (SELECT bizcity_item_family(${id})) GROUP BY e.doc_type ORDER BY 2 DESC`.execute(trx),
    sql<{ code: string; name: string; qty: string }>`
      SELECT b.code, b.name, sum(m.qty)::text AS qty FROM inventory_movements m JOIN branches b ON b.id = m.branch_id
       WHERE m.tenant_id = ${tenantId} AND m.item_id IN (SELECT bizcity_item_family(${id})) GROUP BY b.code, b.name HAVING sum(m.qty) <> 0 ORDER BY b.code`.execute(trx),
    sql<{ account_code: string; name: string | null; n: string; debit: string; credit: string }>`
      SELECT l.account_code, max(a.name) AS name, count(*)::text AS n, sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
        FROM ledger_lines l LEFT JOIN accounts a ON a.tenant_id = l.tenant_id AND a.code = l.account_code
       WHERE l.tenant_id = ${tenantId} AND l.item_id IN (SELECT bizcity_item_family(${id})) GROUP BY l.account_code ORDER BY l.account_code`.execute(trx),
    sql<{ price_list_code: string; unit: string; price: string | null }>`
      SELECT price_list_code, unit, price::text FROM product_prices WHERE tenant_id = ${tenantId} AND item_id IN (SELECT bizcity_item_family(${id})) ORDER BY 1, 2`.execute(trx),
    sql<{ unit: string; ratio: string }>`
      SELECT unit, ratio::text FROM product_units WHERE tenant_id = ${tenantId} AND item_id IN (SELECT bizcity_item_family(${id})) ORDER BY ratio`.execute(trx),
    sql<{ n: string }>`SELECT count(DISTINCT (year, month))::text AS n FROM inventory_costs WHERE tenant_id = ${tenantId} AND item_id IN (SELECT bizcity_item_family(${id}))`.execute(trx),
    sql<{ period: string; n: string }>`
      SELECT to_char(f.start_date, 'YYYY-MM') AS period, count(l.id)::text AS n
        FROM fiscal_periods f
        JOIN ledger_lines l ON l.tenant_id = f.tenant_id AND l.item_id IN (SELECT bizcity_item_family(${id})) AND l.posting_date BETWEEN f.start_date AND f.end_date
       WHERE f.tenant_id = ${tenantId} AND EXISTS (SELECT 1 FROM period_locks k WHERE k.period_id = f.id AND k.branch_id IS NULL)
       GROUP BY 1 ORDER BY 1`.execute(trx),
  ]);
  const documents = docs.rows.map((r) => ({ docType: r.doc_type, count: Number(r.n), first: r.first, last: r.last }));
  const out: ItemImpact = {
    itemId: id, sku: current, documents,
    stock: stock.rows.map((r) => ({ branchCode: r.code, branchName: r.name, qty: Number(r.qty) })),
    accounts: accounts.rows.map((r) => ({ account: r.account_code, name: r.name ?? '', lines: Number(r.n), debit: Number(r.debit), credit: Number(r.credit) })),
    prices: prices.rows.map((r) => ({ priceList: r.price_list_code, unit: r.unit, price: r.price === null ? null : Number(r.price) })),
    units: units.rows.map((r) => ({ unit: r.unit, ratio: Number(r.ratio) })),
    costMonths: Number(costs.rows[0]?.n ?? 0),
    lockedPeriods: locked.rows.map((r) => ({ period: r.period, lines: Number(r.n) })),
    sentences: [],
  };
  const nDocs = documents.reduce((s, d) => s + d.count, 0);
  const st = out.stock.reduce((s, b) => s + b.qty, 0);
  const sn = out.sentences;
  if (!nDocs && !out.accounts.length) sn.push('Mặt hàng chưa có chứng từ nào: đổi mã, đổi nhóm, đổi đơn vị tính hay ngừng dùng đều không ảnh hưởng sổ.');
  else {
    sn.push(`Đang dùng ở ${nDocs} chứng từ (${documents.map((d) => `${d.count} ${DOC_LABEL[d.docType] ?? d.docType}`).join(', ')}) từ ${documents.map((d) => d.first).sort()[0]} tới ${documents.map((d) => d.last).sort().reverse()[0]}.`);
    sn.push('Đổi mã: các chứng từ đó giữ mã cũ làm ảnh chụp, vẫn thuộc cùng định danh — hành trình, giá vốn, báo cáo kho không tách.');
    if (out.accounts.length) sn.push(`Sổ cái có dòng ở tài khoản ${out.accounts.map((a) => a.account).join(', ')}. Đổi nhóm hạch toán chỉ áp từ ngày hiệu lực; dòng sổ đã ghi không đổi (sổ chỉ thêm).`);
  }
  if (out.stock.length) sn.push(`Còn tồn ${fmtQty(st)} ở ${out.stock.length} chi nhánh: ngừng dùng không xoá tồn; đổi đơn vị tính gốc làm tồn cũ và mới không cộng được (ITEM-HINT-003).`);
  if (out.lockedPeriods.length) sn.push(`Có dòng sổ trong kỳ đã khoá ${out.lockedPeriods.map((p) => p.period).join(', ')}: báo cáo đã phát hành của các kỳ đó không đổi.`);
  if (out.prices.length || out.units.length) sn.push(`Bảng giá (${out.prices.length} dòng) và quy đổi đơn vị (${out.units.length} dòng) theo định danh — đổi mã không phải khai lại.`);
  return out;
}
