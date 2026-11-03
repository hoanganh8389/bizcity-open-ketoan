// @bizcity-layer K kernel/lineage
// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1 (ADR-0021, R-CONT-0 / R-CONT-8): truy vết vòng đời mặt hàng — chỉ đọc, dựng từ khoá thật của dữ liệu hiện có
/**
 * TRUY VẾT VÒNG ĐỜI MẶT HÀNG (bizcity_lineage@1). CHỈ ĐỌC — không ghi gì, không đổi cách tính giá vốn.
 *
 *   searchItems()      tìm mặt hàng theo mã, tên, mã vạch → mã hàng (W1 khoá theo mã; PHASE-024 B2 khoá sang item_id)
 *   getItemLineage()   mọi sự kiện kho + mọi dòng bút toán mang mã + giá vốn từng tháng của MỘT mặt hàng, theo ngày
 *   explainCost()      "Vì sao giá vốn này?": công thức đơn giá bình quân tháng bằng số thật + các phiếu góp vào
 *
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
  type LineageEvent, type LineageItem, type LineageKind,
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

/** Tìm mặt hàng cho ô tìm của màn Hành trình: mã (đúng hoặc đầu), mã vạch (đúng), tên (chứa). */
export async function searchItems(trx: Db, tenantId: string, q: string, limit = 20) {
  const text = q.trim();
  if (!text) return [];
  const esc = text.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await trx.selectFrom('products').select(['sku', 'name', 'unit', 'barcode', 'is_active', 'is_draft'])
    .where('tenant_id', '=', tenantId)
    .where((eb) => eb.or([eb('sku', '=', text), eb('barcode', '=', text), eb('sku', 'ilike', `${esc}%`), eb('name', 'ilike', `%${esc}%`)]))
    .orderBy(sql`(sku = ${text}) DESC`).orderBy('sku').limit(Math.min(limit, 50)).execute();
  return rows.map((r) => ({ sku: r.sku, name: r.name, unit: r.unit, barcode: r.barcode, isActive: r.is_active, isDraft: r.is_draft }));
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
  const item = await trx.selectFrom('products').select(['sku', 'name', 'unit', 'barcode', 'is_active', 'is_draft']).where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirst();
  if (!item) throw Errors.notFound(`mặt hàng ${sku}`);
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const from = q.from || null;
  const to = q.to || null;

  const evRows = await sql<{
    at: string; kind: string; line_no: number; qty: string; amount: string | null; unit: string; warehouse_code: string; is_gift: boolean;
    branch: string; counter: string | null; g1: string; g2: string | null; doc_key: string; doc_no: string; doc_type: string; version: number;
    status: string; original: string | null;
  }>`
    SELECT m.doc_date::text AS at, m.kind, m.line_no, m.qty, m.amount, m.unit, m.warehouse_code, m.is_gift,
           b.code AS branch, cb.code AS counter, COALESCE(b.accounting_unit_id, 0)::text AS g1,
           CASE WHEN cb.id IS NULL THEN NULL ELSE COALESCE(cb.accounting_unit_id, 0)::text END AS g2,
           e.doc_key, e.doc_no, e.doc_type, e.version, e.status, e.payload ->> 'originalDocKey' AS original
      FROM inventory_movements m
      JOIN accounting_events e ON e.id = m.event_id
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
     WHERE m.tenant_id = ${tenantId} AND m.sku = ${sku}
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
      amount: r.amount === null ? null : num(r.amount), unit: r.unit, counterBranch: r.counter, originalDocKey: r.original, isGift: r.is_gift,
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
     WHERE l.tenant_id = ${tenantId} AND l.product_sku = ${sku}
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
     WHERE c.tenant_id = ${tenantId} AND c.sku = ${sku} ${periodFilter}
     ORDER BY c.year DESC, c.month DESC, c.cost_group LIMIT 120`.execute(trx);
  const costPeriods: LineageCostPeriod[] = costRows.rows.reverse().map(costRow);

  // Dòng kho không mang tiền (bán, chuyển, điều chỉnh) được định giá ở bước Tính giá vốn tháng: chỉ báo thiếu khi THÁNG ĐÓ chưa tính.
  const costed = new Set(costPeriods.map((c) => c.period));
  const unvaluedEvents = events.filter((e) => e.amount === null && !costed.has(e.at.slice(0, 7)));
  const unvalued = unvaluedEvents.length;
  const unvaluedMonths = [...new Set(unvaluedEvents.map((e) => mmyyyy(e.at.slice(0, 7))))];
  const returnsNoOrigin = events.filter((e) => e.kind === 'sale_return' && !e.originalDocKey).length;
  const waiting = entries.filter((l) => l.costFill && l.debit === 0 && l.credit === 0).length;
  const notes = ['Truy vết theo mã hàng hiện hành. Đổi mã chưa có phiên bản: mã cũ / mới sẽ nối về một định danh khi có bảng mặt hàng (PHASE-024).'];
  if (unvalued) notes.push(`${unvalued} sự kiện kho thuộc tháng chưa tính giá vốn (${unvaluedMonths.join(', ')}): chạy "Tính giá vốn" để có giá vốn và bút toán.`);
  if (waiting) notes.push(`${waiting} dòng bút toán giá vốn đang chờ tính giá (số 0 cho tới khi chạy tính giá vốn).`);
  if (returnsNoOrigin) notes.push(`${returnsNoOrigin} phiếu khách trả hàng chưa nối được chứng từ bán gốc — chưa biết hoàn đúng giá vốn lần bán nào.`);
  if (!costPeriods.length) notes.push('Mặt hàng chưa có tháng nào được tính giá vốn.');

  const inQty = events.filter((e) => e.qty > 0).reduce((s, e) => s + e.qty, 0);
  const outQty = events.filter((e) => e.qty < 0).reduce((s, e) => s - e.qty, 0);
  return {
    item: { sku: item.sku, name: item.name, unit: item.unit, barcode: item.barcode, isActive: item.is_active, isDraft: item.is_draft },
    coverage: { keyedBy: 'sku', notes },
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

  const rows = await sql<{
    year: number; month: number; cost_group: string; unit_code: string | null; unit_name: string | null; opening_qty: string; opening_value: string;
    in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; cost_source: string;
  }>`
    SELECT c.year, c.month, c.cost_group::text, u.code AS unit_code, u.name AS unit_name, c.opening_qty, c.opening_value, c.in_qty, c.in_value,
           c.unit_cost, c.out_qty, c.closing_qty, c.closing_value, c.cost_source
      FROM inventory_costs c LEFT JOIN accounting_units u ON u.id = c.cost_group
     WHERE c.tenant_id = ${tenantId} AND c.sku = ${sku} AND c.year = ${year} AND c.month = ${month}
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
  const prev = await trx.selectFrom('inventory_costs').select('unit_cost').where('tenant_id', '=', tenantId).where('sku', '=', sku)
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
     WHERE m.tenant_id = ${tenantId} AND m.sku = ${sku} AND m.doc_date BETWEEN ${first}::date AND ${last}::date
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
