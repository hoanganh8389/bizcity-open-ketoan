// @bizcity-layer K kernel/subledgers/inventory
/**
 * Tính giá vốn bình quân gia quyền theo tháng và ghi sổ giá vốn hàng xuất.
 *
 * Bước 1 — tính đơn giá (inventory_costs), cho từng nhóm tính giá (= đơn vị hạch toán của chi nhánh), mặt hàng:
 *
 *              GT tồn đầu + GT nhập mua − GT trả NCC + GT điều chỉnh tăng có giá + GT nhận từ nhóm khác
 *   Đơn giá = ─────────────────────────────────────────────────────────────────────────────────────────
 *              SL tồn đầu + SL nhập mua − SL trả NCC + SL điều chỉnh tăng có giá + SL nhận từ nhóm khác
 *
 *   - ĐƠN GIÁ NHẬP TỪ EXCEL (giai đoạn chạy song song, migration 0061): mã hàng có trong bảng giá vốn tháng nhập từ tệp
 *     (Mã hàng, Tên hàng, Giá vốn) dùng đúng đơn giá đó cho MỌI nhóm tính giá — mỗi mã một giá, hàng chính hay khuyến
 *     mãi như nhau; mã không có trong tệp tính như dưới. Giá đã nhập lưu ở inventory_costs (cost_source = 'import')
 *     và được giữ khi tính lại tháng đó; nhập tệp mới thì thay toàn bộ giá đã nhập của tháng.
 *   - Tồn đầu = tồn cuối tháng trước của chính bảng này; tồn đầu số lượng ≤ 0 thì coi như không có.
 *   - Hàng xuất THEO GIÁ BÁN (bán nội bộ cho chi nhánh khác — lý do có cờ costAtSalePrice) bị trừ khỏi cả tử
 *     (theo giá bán) và mẫu (số lượng) trước khi chia; giá vốn của nó đã ghi sổ cùng phiếu bán.
 *   - Hàng trả nhà cung cấp mang lý do có cờ returnAtOpeningCost (XTR1, XTR9) được định giá theo tồn đầu
 *     (đơn giá trả = tiền trả ÷ số lượng trả); lý do trả khác (XDC, XKK, XTT1, XTT2, XTR3, XTR4, XTRCN…) lấy
 *     thành tiền − thuế trên phiếu. Phiếu không ghi lý do dùng lý do mặc định của loại chứng từ:
 *       tiền trả 0 → 0;  đơn giá trả ≤ đơn giá tồn đầu → SL trả × đơn giá tồn đầu;
 *       tiền trả ≤ GT tồn đầu → tiền trả;  SL trả ≤ SL tồn đầu → GT tồn đầu;
 *       còn lại → GT tồn đầu + (SL trả − SL tồn đầu) × đơn giá trả.
 *     Tồn kho trên sổ vẫn giảm theo tiền trên phiếu trả.
 *   - Nhập điều chỉnh tăng mang lý do có cờ excludeFromCost (ví dụ ĐGTTK) không tính vào tử, mẫu.
 *   - Quà KM người tiêu dùng nhận kèm phiếu mua (inventory_movements.exclude_cost) không tính vào tử, mẫu mà vào PHẦN TỒN QUÀ
 *     giá 0 của mã (inventory_costs.gift_qty, mang sang tháng sau). Dòng bán hàng tặng khách lấy từ phần quà trước (giá vốn 0),
 *     hết mới lấy hàng thường theo đơn giá. Quà KM người bán (chia giá) vẫn tính (SL tăng, tiền 0 → đơn giá giảm).
 *   - So sánh đơn giá trả với đơn giá tồn đầu: dùng đơn giá tồn đầu chung của nhóm (cùng một đơn giá cho mọi kho).
 *   - Mẫu số ≤ 0 → đơn giá dương gần nhất của các tháng trước (không có thì 0).
 *   - Chuyển kho giữa hai chi nhánh cùng nhóm không làm đổi đơn giá. Hàng nhận từ nhóm khác chưa có giá
 *     được định giá theo đơn giá của nhóm gửi (tính nhóm gửi trước, rồi tính lại nhóm nhận).
 *   - Tồn cuối số lượng = tồn đầu + mọi lần vào / ra trong tháng; giá trị tồn cuối = số lượng × đơn giá.
 *   Tháng trước chưa tính mà có phát sinh từ trước → tính lần lượt các tháng còn thiếu.
 *
 * Bước 2 — PHIẾU GIÁ VỐN (chốt 22/10/2026, thay cách ghi đè dòng chờ trên từng phiếu của 20/10): phiếu bán, hoàn,
 * chuyển kho, điều chỉnh, xuất điều chỉnh KHÔNG mang dòng giá vốn nữa. Tính giá vốn (tự tính hay nhập Excel) sinh mỗi
 * (chi nhánh, tháng) MỘT chứng từ "Giá vốn hàng xuất" — liệt kê TỪNG MÃ HÀNG (mỗi mã × cặp tài khoản một dòng, số tiền =
 * |SL| × đơn giá) — tính lại thì đảo bút toán cũ, ghi bút toán mới. Dòng chờ giá vốn còn sót trên phiếu đã định khoản
 * trước đây (ledger_lines.cost_fill) được đưa về 0 (overwriteCostPairs) để không tính trùng.
 * docKey cogs:<chi nhánh>:<YYYY-MM>, ngày cuối tháng (khoá cũ cogs:<internal|tax>:… huỷ); luôn cả tháng. Định khoản:
 *   bán            : Nợ TK giá vốn (hoặc CP khuyến mãi, TK chi phí của lý do) / Có TK kho
 *   khách trả      : Nợ TK kho / Có TK giá vốn
 *   chuyển đi      : Nợ TK hàng đang chuyển (1579; khác đơn vị hạch toán: 13681) / Có TK kho
 *   chuyển đến     : Nợ TK kho / Có TK hàng đang chuyển — theo đơn giá của nhóm GỬI để TK trung gian về 0
 *   điều chỉnh giảm: Nợ TK đối ứng của lý do (1381…) / Có TK kho;  điều chỉnh tăng: ngược lại
 * Tính lại: bút toán cũ được ghi số âm rồi ghi bút toán mới. Không cần xoá, ghi lại bút toán bán hàng.
 * Lần hàng xuất mà hệ thống nguồn đã gửi kèm giá vốn thì đã ghi sổ cùng chứng từ gốc, ở đây bỏ qua.
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { eventStore } from '../documents/event-store.js';
import { partnerRepository } from '../partners/partner.repository.js';
import { postingConfigRepository } from '../posting-config/posting-config.repository.js';
import { AccountResolver } from '../posting/account-resolver.js';
import { EntryBuilder } from '../posting/entry-builder.js';

interface Period { year: number; month: number }
const label = (p: Period) => `${p.year}-${String(p.month).padStart(2, '0')}`;
const prevOf = (p: Period): Period => (p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 });
const cmp = (a: Period, b: Period) => a.year * 12 + a.month - (b.year * 12 + b.month);
const firstDay = (p: Period) => `${label(p)}-01`;
const lastDay = (p: Period) => new Date(Date.UTC(p.year, p.month, 0)).toISOString().slice(0, 10);
export function parsePeriod(s: string): Period {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw Errors.validation('Kỳ dạng YYYY-MM');
  return { year: Number(m[1]), month: Number(m[2]) };
}

const key = (group: string, sku: string) => `${group}|${sku}`;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

interface CostRow {
  group: string;
  sku: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  unitCost: number;
  outQty: number;
  closingQty: number;
  /** Phần tồn quà KM người tiêu dùng (giá 0): đầu kỳ, nhập, xuất tặng. */
  giftOpening: number;
  giftIn: number;
  giftOut: number;
}

/** Tổng hợp hàng vào / ra trong tháng theo (nhóm, mặt hàng, loại, nhóm bên kia). */
async function monthFlows(trx: Db, tenantId: string, p: Period) {
  const res = await sql<{ grp: string; sku: string; kind: string; reason: string | null; priced: boolean; excl: boolean; cgrp: string | null; qty: string; amount: string; valued_qty: string; unvalued_qty: string }>`
    SELECT COALESCE(b.accounting_unit_id, 0)::text AS grp, m.sku, m.kind, m.reason_code AS reason, m.priced_at_sale AS priced, m.exclude_cost AS excl,
           CASE WHEN m.counter_branch_id IS NULL THEN NULL ELSE COALESCE(cb.accounting_unit_id, 0)::text END AS cgrp,
           SUM(m.qty) AS qty,
           COALESCE(SUM(m.amount), 0) AS amount,
           SUM(CASE WHEN m.amount IS NULL THEN 0 ELSE m.qty END) AS valued_qty,
           SUM(CASE WHEN m.amount IS NULL THEN m.qty ELSE 0 END) AS unvalued_qty
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
     WHERE m.tenant_id = ${tenantId}
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY 1, 2, 3, 4, 5, 6, 7`.execute(trx);
  return res.rows.map((r) => ({ group: r.grp, sku: r.sku, kind: r.kind, reason: r.reason, pricedAtSale: r.priced, excludeCost: r.excl, counterGroup: r.cgrp, qty: Number(r.qty), amount: Number(r.amount), valuedQty: Number(r.valued_qty), unvaluedQty: Number(r.unvalued_qty) }));
}

/**
 * Cờ tính giá vốn trên lý do. Chứng từ không ghi lý do dùng lý do mặc định của loại chứng từ (flags.default).
 */
async function costReasonRules(trx: Db, tenantId: string) {
  const rows = await trx.selectFrom('posting_reasons').select(['code', 'flags']).where('tenant_id', '=', tenantId).execute();
  const flag = (code: string | null, name: string, fallbackDefault: string) => {
    const r = code ? rows.find((x) => x.code === code) : rows.find((x) => (x.flags as Record<string, unknown>)?.default === fallbackDefault);
    return Boolean((r?.flags as Record<string, unknown> | undefined)?.[name]);
  };
  return {
    returnAtOpening: (code: string | null) => flag(code, 'returnAtOpeningCost', 'purchase_return'),
    excluded: (code: string | null) => flag(code, 'excludeFromCost', 'stock_adjustment:increase'),
  };
}

/** Giá trị hàng trả nhà cung cấp đưa vào công thức đơn giá, định giá theo tồn đầu. */
export function returnValue(qty: number, amount: number, openingQty: number, openingValue: number): number {
  if (!amount || !qty) return 0;
  const oq = openingQty > 0 ? openingQty : 0;
  const ov = openingQty > 0 ? openingValue : 0;
  const unitReturn = amount / qty;
  const unitOpening = oq > 0 ? ov / oq : 0;
  if (oq > 0 && unitReturn <= unitOpening) return Math.round(qty * unitOpening);
  if (amount <= ov) return amount;
  if (qty <= oq) return ov;
  return Math.round(ov + (qty - oq) * unitReturn);
}

/** Đơn giá đã nhập từ Excel của một tháng (theo mã hàng). */
async function importedUnits(trx: Db, tenantId: string, p: Period): Promise<Map<string, number>> {
  const res = await sql<{ sku: string; unit_cost: string }>`
    SELECT DISTINCT ON (sku) sku, unit_cost FROM inventory_costs
     WHERE tenant_id = ${tenantId} AND year = ${p.year} AND month = ${p.month} AND cost_source = 'import'
     ORDER BY sku, cost_group`.execute(trx);
  return new Map(res.rows.map((r) => [r.sku, Number(r.unit_cost)]));
}

/**
 * Tính đơn giá một tháng và ghi inventory_costs. Trả về đơn giá theo (nhóm, mặt hàng).
 * `imports`: đơn giá nhập từ Excel theo mã hàng (thay toàn bộ giá đã nhập của tháng); bỏ trống thì giữ giá đã nhập trước đó.
 */
/** Kết quả tính một tháng: đơn giá theo (nhóm, mã) + SL hàng tặng khách lấy từ phần quà giá 0 theo (chứng từ, mã). */
interface MonthResult { rows: Map<string, CostRow>; giftCovered: Map<string, number> }

async function computeMonth(trx: Db, tenantId: string, p: Period, imports?: Map<string, number>): Promise<MonthResult> {
  const imported = imports ?? (await importedUnits(trx, tenantId, p));
  const prev = prevOf(p);
  const prevRows = await trx.selectFrom('inventory_costs').selectAll()
    .where('tenant_id', '=', tenantId).where('year', '=', prev.year).where('month', '=', prev.month).execute();
  const lastUnits = await sql<{ cost_group: string; sku: string; unit_cost: string }>`
    SELECT DISTINCT ON (cost_group, sku) cost_group::text, sku, unit_cost FROM inventory_costs
     WHERE tenant_id = ${tenantId} AND unit_cost > 0 AND (year * 12 + month) < ${p.year * 12 + p.month}
     ORDER BY cost_group, sku, year DESC, month DESC`.execute(trx);
  const fallback = new Map(lastUnits.rows.map((r) => [key(r.cost_group, r.sku), Number(r.unit_cost)]));

  const rows = new Map<string, CostRow>();
  const row = (group: string, sku: string) => {
    let r = rows.get(key(group, sku));
    if (!r) {
      r = { group, sku, openingQty: 0, openingValue: 0, inQty: 0, inValue: 0, unitCost: 0, outQty: 0, closingQty: 0, giftOpening: 0, giftIn: 0, giftOut: 0 };
      rows.set(key(group, sku), r);
    }
    return r;
  };
  for (const pr of prevRows) {
    const r = row(pr.cost_group, pr.sku);
    // Tồn đầu tính đơn giá = tồn cuối tháng trước trừ phần quà giá 0 (quà mang sang riêng).
    r.giftOpening = Number(pr.gift_qty ?? 0);
    r.openingQty = Number(pr.closing_qty) - r.giftOpening;
    r.openingValue = Number(pr.closing_value);
  }

  const flows = await monthFlows(trx, tenantId, p);
  const rules = await costReasonRules(trx, tenantId);
  // Hàng nhận từ nhóm khác chưa có giá: định giá ở lượt 2 theo đơn giá nhóm gửi.
  const pendingExternal: { group: string; sku: string; counterGroup: string; qty: number }[] = [];
  // Hàng trả nhà cung cấp: định giá theo tồn đầu sau khi gom đủ (số dương).
  const returns = new Map<string, { qty: number; amount: number }>();
  for (const f of flows) {
    const r = row(f.group, f.sku);
    r.closingQty += f.qty;
    const external = f.counterGroup !== null && f.counterGroup !== f.group;
    if (f.kind === 'sale' && f.pricedAtSale) {
      // Bán theo giá bán: trừ khỏi cả tử và mẫu của công thức đơn giá.
      r.inQty += f.qty;
      r.inValue += f.amount;
      continue;
    }
    switch (f.kind) {
      case 'purchase':
        // Quà KM người tiêu dùng nhận kèm phiếu mua: vào tồn nhưng không vào đơn giá (không kéo giá vốn hàng bán xuống).
        if (f.excludeCost) { r.giftIn += f.qty; break; }
        r.inQty += f.qty;
        r.inValue += f.amount;
        break;
      case 'purchase_return': {
        if (!rules.returnAtOpening(f.reason)) {
          // Lý do trả khác: lấy đúng thành tiền − thuế trên phiếu.
          r.inQty += f.qty;
          r.inValue += f.amount;
          break;
        }
        const k = key(f.group, f.sku);
        const cur = returns.get(k) ?? { qty: 0, amount: 0 };
        cur.qty += -f.qty;
        cur.amount += -f.amount;
        returns.set(k, cur);
        break;
      }
      case 'adjust_in':
        if (rules.excluded(f.reason)) break;
        r.inQty += f.valuedQty;
        r.inValue += f.amount;
        break;
      case 'transfer_in':
        if (external) {
          r.inQty += f.valuedQty;
          r.inValue += f.amount;
          if (f.unvaluedQty) pendingExternal.push({ group: f.group, sku: f.sku, counterGroup: f.counterGroup!, qty: f.unvaluedQty });
        }
        break;
      case 'transfer_out':
        if (external) r.outQty += -f.qty;
        break;
      default: // sale, sale_return, adjust_out
        r.outQty += -f.qty;
    }
  }

  for (const [k, ret] of returns) {
    const r = rows.get(k)!;
    r.inQty -= ret.qty;
    r.inValue -= returnValue(ret.qty, ret.amount, r.openingQty, r.openingValue);
  }

  // Mã hàng có trong bảng giá nhập mà tháng này không phát sinh: vẫn giữ một dòng (nhóm 0) để không mất giá đã nhập.
  const seen = new Set([...rows.values()].map((r) => r.sku));
  for (const sku of imported.keys()) if (!seen.has(sku)) row('0', sku);
  const unitOf = (r: CostRow) => {
    const fixed = imported.get(r.sku);
    if (fixed !== undefined) return round4(fixed);
    const oq = r.openingQty > 0 ? r.openingQty : 0;
    const ov = r.openingQty > 0 ? r.openingValue : 0;
    const q = oq + r.inQty;
    return q > 0 ? round4((ov + r.inValue) / q) : fallback.get(key(r.group, r.sku)) ?? 0;
  };
  for (const r of rows.values()) r.unitCost = unitOf(r);
  if (pendingExternal.length) {
    for (const x of pendingExternal) {
      const sender = rows.get(key(x.counterGroup, x.sku));
      const unit = sender?.unitCost ?? fallback.get(key(x.counterGroup, x.sku)) ?? 0;
      const r = row(x.group, x.sku);
      r.inQty += x.qty;
      r.inValue += Math.round(x.qty * unit);
    }
    for (const r of rows.values()) r.unitCost = unitOf(r);
  }
  // Hàng tặng khách xuất ra: lấy từ phần quà giá 0 trước (theo ngày chứng từ), hết phần quà mới lấy hàng thường.
  const giftCovered = new Map<string, number>();
  const giftSales = await sql<{ event_id: string; grp: string; sku: string; qty: string }>`
    SELECT m.event_id::text, COALESCE(b.accounting_unit_id, 0)::text AS grp, m.sku, SUM(m.qty) AS qty
      FROM inventory_movements m JOIN branches b ON b.id = m.branch_id
     WHERE m.tenant_id = ${tenantId} AND m.kind = 'sale' AND m.is_gift
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY m.event_id, 2, m.sku, m.doc_date HAVING SUM(m.qty) < 0
     ORDER BY m.doc_date, m.event_id`.execute(trx);
  for (const g of giftSales.rows) {
    const r = rows.get(key(g.grp, g.sku));
    if (!r) continue;
    const avail = r.giftOpening + r.giftIn - r.giftOut;
    const take = Math.min(avail, -Number(g.qty));
    if (take <= 0) continue;
    r.giftOut += take;
    r.outQty -= take; // phần lấy từ quà không phải hàng thường xuất
    giftCovered.set(`${g.event_id}|${g.sku}`, (giftCovered.get(`${g.event_id}|${g.sku}`) ?? 0) + take);
  }
  for (const r of rows.values()) r.closingQty += r.openingQty + r.giftOpening;

  await trx.deleteFrom('inventory_costs').where('tenant_id', '=', tenantId).where('year', '=', p.year).where('month', '=', p.month).execute();
  const values = [...rows.values()]
    .filter((r) => r.openingQty || r.inQty || r.outQty || r.closingQty || r.giftOpening || r.giftIn || imported.has(r.sku))
    .map((r) => ({
      cost_source: imported.has(r.sku) ? 'import' : 'computed',
      tenant_id: tenantId,
      cost_group: r.group,
      year: p.year,
      month: p.month,
      sku: r.sku,
      opening_qty: r.openingQty,
      opening_value: Math.round(r.openingValue),
      in_qty: r.inQty,
      in_value: Math.round(r.inValue),
      unit_cost: r.unitCost,
      out_qty: r.outQty,
      closing_qty: r.closingQty,
      // Phần quà giá 0 nằm trong tồn cuối nhưng không có giá trị.
      gift_qty: round4(Math.max(0, r.giftOpening + r.giftIn - r.giftOut)),
      closing_value: r.closingQty - (r.giftOpening + r.giftIn - r.giftOut) > 0 ? Math.round((r.closingQty - (r.giftOpening + r.giftIn - r.giftOut)) * r.unitCost) : 0,
    }));
  for (let i = 0; i < values.length; i += 1000) await trx.insertInto('inventory_costs').values(values.slice(i, i + 1000)).execute();
  return { rows, giftCovered };
}

/** Các tháng còn thiếu (chưa tính) trước tháng p, kể từ tháng có phát sinh sớm nhất. */
async function missingMonthsBefore(trx: Db, tenantId: string, p: Period): Promise<Period[]> {
  const first = await sql<{ d: string | null }>`
    SELECT MIN(doc_date)::text AS d FROM inventory_movements WHERE tenant_id = ${tenantId}`.execute(trx);
  if (!first.rows[0]?.d) return [];
  const earliest = parsePeriod(first.rows[0].d.slice(0, 7));
  const out: Period[] = [];
  for (let m = prevOf(p); cmp(m, earliest) >= 0; m = prevOf(m)) {
    const has = await trx.selectFrom('inventory_costs').select('id').where('tenant_id', '=', tenantId).where('year', '=', m.year).where('month', '=', m.month).limit(1).executeTakeFirst();
    if (has) break;
    out.unshift(m);
  }
  return out;
}

interface CogsMovement {
  eventId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  group: string;
  kind: string;
  sku: string;
  reasonCode: string | null;
  isGift: boolean;
  counterBranchId: string | null;
  counterCode: string | null;
  counterName: string | null;
  counterGroup: string | null;
  qty: number;
}

async function unvaluedMovements(trx: Db, tenantId: string, p: Period): Promise<CogsMovement[]> {
  const res = await sql<{ event_id: string; branch_id: string; code: string; name: string; grp: string; kind: string; sku: string; reason_code: string | null; is_gift: boolean; counter_branch_id: string | null; ccode: string | null; cname: string | null; cgrp: string | null; qty: string }>`
    SELECT m.event_id::text, m.branch_id, b.code, b.name, COALESCE(b.accounting_unit_id, 0)::text AS grp, m.kind, m.sku, m.reason_code, m.is_gift,
           m.counter_branch_id, cb.code AS ccode, cb.name AS cname,
           CASE WHEN cb.id IS NULL THEN NULL ELSE COALESCE(cb.accounting_unit_id, 0)::text END AS cgrp,
           SUM(m.qty) AS qty
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
     WHERE m.tenant_id = ${tenantId} AND m.amount IS NULL
       AND m.kind IN ('sale', 'sale_return', 'transfer_out', 'transfer_in', 'adjust_out', 'adjust_in')
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY m.event_id, m.branch_id, b.code, b.name, 5, m.kind, m.sku, m.reason_code, m.is_gift, m.counter_branch_id, cb.code, cb.name, 13
     HAVING SUM(m.qty) <> 0`.execute(trx);
  return res.rows.map((r) => ({ eventId: r.event_id, branchId: r.branch_id, branchCode: r.code, branchName: r.name, group: r.grp, kind: r.kind, sku: r.sku, reasonCode: r.reason_code, isGift: r.is_gift, counterBranchId: r.counter_branch_id, counterCode: r.ccode, counterName: r.cname, counterGroup: r.cgrp, qty: Number(r.qty) }));
}

export interface CostingResult {
  period: string;
  monthsComputed: string[];
  items: number;
  /** status/docNo/total: phiếu GV tháng (phần còn lại); filled/filledTotal: số cặp dòng chờ giá vốn đã ghi đè, tổng tiền sau ghi đè. */
  branches: { branchCode: string; status: 'posted' | 'empty'; docNo?: string; total: number; filled: number; filledTotal: number }[];
  total: number;
  /** Tháng có dùng giá nhập từ Excel: số mã đã nhập; mã có xuất trong tháng mà không có trong tệp (đang tính bình quân). */
  imported: { count: number; missing: string[]; missingCount: number } | null;
}

/** Một dòng bảng giá vốn nhập từ Excel. */
export interface CostImportRow { sku: string; unitCost: number; name?: string }

export const costingService = {
  /**
   * Tính giá vốn một tháng và ghi sổ giá vốn hàng xuất.
   * `imported`: bảng giá vốn tháng nhập từ Excel (thay toàn bộ giá đã nhập của tháng; mã trùng lấy giá khác 0 xuất hiện nhiều nhất).
   * `clearImport`: bỏ giá đã nhập, quay về tính bình quân cho mọi mã.
   */
  async run(auth: AuthContext, input: { period: string; imported?: CostImportRow[]; clearImport?: boolean; from?: string; to?: string }): Promise<CostingResult> {
    const p = parsePeriod(input.period);
    // Khoảng ngày chứng từ được cập nhật giá vốn: trong tháng đang tính (giá vốn là giá của tháng), mặc định cả tháng.
    const from = input.from ?? firstDay(p);
    const to = input.to ?? lastDay(p);
    if (from < firstDay(p) || to > lastDay(p) || from > to) throw Errors.validation(`Khoảng ngày cập nhật phải nằm trong tháng ${label(p)} (từ ${firstDay(p)} đến ${lastDay(p)})`);
    let imports: Map<string, number> | undefined;
    if (input.clearImport) imports = new Map();
    else if (input.imported?.length) {
      // Một mã lặp nhiều dòng (tệp xuất từ thẻ kho: mỗi lần nhập / xuất một dòng): lấy giá khác 0 xuất hiện NHIỀU NHẤT
      // (bằng nhau thì giá gặp sau); mã chỉ có giá 0 thì giá 0.
      const votes = new Map<string, Map<number, number>>();
      for (const r of input.imported) {
        const sku = r.sku.trim();
        if (!sku || !Number.isFinite(r.unitCost) || r.unitCost < 0) continue;
        const v = votes.get(sku) ?? new Map<number, number>();
        const k = round4(r.unitCost) || -1; // -1: giá 0
        const n = (v.get(k) ?? 0) + 1;
        v.delete(k); // đưa xuống cuối: bằng số lần thì giá gặp sau thắng
        v.set(k, n);
        votes.set(sku, v);
      }
      imports = new Map();
      for (const [sku, v] of votes) {
        let best = 0;
        let bestN = 0;
        for (const [unit, n] of v) if (unit > 0 && n >= bestN) { best = unit; bestN = n; }
        imports.set(sku, best);
      }
      if (!imports.size) throw Errors.validation('Tệp không có dòng nào có Mã hàng và Giá vốn hợp lệ');
    }
    // Bước 1: đơn giá (một giao dịch, gồm các tháng trước còn thiếu).
    const { units, giftCovered, months, items, imported } = await db.transaction().execute(async (trx) => {
      const months = [...(await missingMonthsBefore(trx, auth.tenantId, p)), p];
      let rows = new Map<string, CostRow>();
      let giftCovered = new Map<string, number>();
      for (const m of months) ({ rows, giftCovered } = await computeMonth(trx, auth.tenantId, m, m === p ? imports : undefined));
      const fixed = imports ?? (await importedUnits(trx, auth.tenantId, p));
      let imported: CostingResult['imported'] = null;
      if (fixed.size) {
        const missing = [...new Set([...rows.values()].filter((r) => r.outQty > 0 && !fixed.has(r.sku)).map((r) => r.sku))].sort();
        imported = { count: fixed.size, missing: missing.slice(0, 50), missingCount: missing.length };
      }
      if (imports) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: input.clearImport ? 'costing.import.clear' : 'costing.import', objectType: 'period', objectId: label(p), after: { skus: imports.size } });
      return { units: new Map([...rows].map(([k, r]) => [k, r.unitCost])), giftCovered, months: months.map(label), items: rows.size, imported };
    });

    // Bước 2: ghi sổ giá vốn từng chi nhánh, mỗi chi nhánh một giao dịch.
    const movements = await unvaluedMovements(db, auth.tenantId, p);
    const byBranch = new Map<string, CogsMovement[]>();
    for (const m of movements) byBranch.set(m.branchId, [...(byBranch.get(m.branchId) ?? []), m]);
    // Chi nhánh đã có chứng từ giá vốn tháng này mà nay không còn gì để ghi: vẫn chạy để đảo bút toán cũ.
    // Mẫu khớp cả khoá mới (cogs:<chi nhánh>:<kỳ>) lẫn khoá cũ (cogs:<internal|tax>:<chi nhánh>:<kỳ>).
    const prior = await db.selectFrom('accounting_events as d').innerJoin('branches as b', 'b.id', 'd.branch_id')
      .select(['d.branch_id', 'b.code', 'b.name']).where('d.tenant_id', '=', auth.tenantId).where('d.doc_type', '=', 'cogs')
      .where('d.doc_key', 'like', `cogs:%:${label(p)}`).where('d.status', '=', 'posted').execute();
    for (const r of prior) if (!byBranch.has(r.branch_id)) byBranch.set(r.branch_id, []);
    // Chi nhánh có dòng chờ giá vốn đã có số tiền mà nay không còn hàng cần định giá: vẫn chạy để đưa về 0.
    const slotBranches = await sql<{ branch_id: string; code: string; name: string }>`
      SELECT DISTINCT l.branch_id::text, b.code, b.name FROM ledger_lines l JOIN branches b ON b.id = l.branch_id
       WHERE l.tenant_id = ${auth.tenantId} AND l.cost_fill IS NOT NULL AND (l.debit <> 0 OR l.credit <> 0)
         AND l.posting_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date`.execute(db);
    for (const r of slotBranches.rows) if (!byBranch.has(r.branch_id)) byBranch.set(r.branch_id, []);
    const branchInfo = new Map([...prior, ...slotBranches.rows].map((r) => [r.branch_id, { code: r.code, name: r.name }]));
    for (const m of movements) branchInfo.set(m.branchId, { code: m.branchCode, name: m.branchName });

    const branches: CostingResult['branches'] = [];
    for (const [branchId, list] of byBranch) {
      const info = branchInfo.get(branchId)!;
      branches.push(await db.transaction().execute((trx) => postBranch(trx, auth, { period: p, from, to, branchId, branchCode: info.code, units, giftCovered, movements: list })));
    }
    branches.sort((a, b) => a.branchCode.localeCompare(b.branchCode));
    return { period: label(p), monthsComputed: months, items, branches, total: fromCents(branches.reduce((s, b) => s + toCents(b.total) + toCents(b.filledTotal), 0)), imported };
  },

  /** Bảng đơn giá vốn của một tháng. */
  async list(auth: AuthContext, q: { period: string; search?: string }) {
    const p = parsePeriod(q.period);
    const rows = await sql<{ cost_group: string; unit_code: string | null; unit_name: string | null; sku: string; name: string | null; opening_qty: string; opening_value: string; in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; gift_qty: string; cost_source: string }>`
      SELECT c.cost_group::text, u.code AS unit_code, u.name AS unit_name, c.sku,
             (SELECT m.name FROM inventory_movements m WHERE m.tenant_id = c.tenant_id AND m.sku = c.sku AND m.name <> '' LIMIT 1) AS name,
             c.opening_qty, c.opening_value, c.in_qty, c.in_value, c.unit_cost, c.out_qty, c.closing_qty, c.closing_value, c.gift_qty, c.cost_source
        FROM inventory_costs c
        LEFT JOIN accounting_units u ON u.id = c.cost_group
       WHERE c.tenant_id = ${auth.tenantId} AND c.year = ${p.year} AND c.month = ${p.month}
         ${q.search ? sql`AND c.sku ILIKE ${'%' + q.search + '%'}` : sql``}
       ORDER BY c.cost_group, c.sku`.execute(db);
    return rows.rows.map((r) => ({
      costGroup: r.unit_code ?? '(chưa gán đơn vị)',
      costGroupName: r.unit_name ?? '',
      sku: r.sku,
      name: r.name ?? '',
      openingQty: Number(r.opening_qty),
      openingValue: Number(r.opening_value),
      inQty: Number(r.in_qty),
      inValue: Number(r.in_value),
      unitCost: Number(r.unit_cost),
      outQty: Number(r.out_qty),
      closingQty: Number(r.closing_qty),
      closingValue: Number(r.closing_value),
      /** Tồn quà KM người tiêu dùng (giá 0) nằm trong tồn cuối. */
      giftQty: Number(r.gift_qty),
      costSource: r.cost_source as 'computed' | 'import',
    }));
  },
};

async function postBranch(
  trx: Db,
  auth: AuthContext,
  a: { period: Period; from: string; to: string; branchId: string; branchCode: string; units: Map<string, number>; giftCovered: Map<string, number>; movements: CogsMovement[] },
): Promise<CostingResult['branches'][number]> {
  // Khoá cũ là cogs:<internal|tax>:<chi nhánh>:<kỳ>; nay một sổ kế toán: cogs:<chi nhánh>:<kỳ>.
  const docKey = `cogs:${a.branchCode}:${label(a.period)}`;
  const existing = await eventStore.lock(trx, auth.tenantId, docKey);
  const cfg = await postingConfigRepository.loadPostingConfig(trx, auth.tenantId, [...new Set(a.movements.map((m) => m.sku))]);
  const reversed = existing ? await eventStore.reverseActive(trx, auth, existing.id, cfg.accounts, 'Tính lại giá vốn') : 0;
  // Chứng từ giá vốn khoá cũ còn hiệu lực: đảo bút toán và huỷ, để không ghi trùng với chứng từ khoá mới.
  for (const legacyKey of ['internal', 'tax'].map((x) => `cogs:${x}:${a.branchCode}:${label(a.period)}`)) {
    const legacy = await eventStore.lock(trx, auth.tenantId, legacyKey);
    if (!legacy || legacy.status === 'cancelled') continue;
    const n = await eventStore.reverseActive(trx, auth, legacy.id, cfg.accounts, 'Tính lại giá vốn');
    await eventStore.cancel(trx, auth, legacy, { message: 'Thay bằng chứng từ giá vốn khoá mới', reversed: n });
  }

  // Dòng chờ giá vốn còn sót trên phiếu định khoản trước 22/10/2026 (bút toán còn hiệu lực, có số tiền): đưa về 0 —
  // giá vốn nay nằm hết trong phiếu giá vốn tháng, để nguyên là tính trùng.
  const slotRows = await sql<{ entry_id: string; pair_no: number }>`
    SELECT l.entry_id::text, l.pair_no
      FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${auth.tenantId} AND l.branch_id = ${a.branchId} AND l.cost_fill = 'debit' AND l.debit <> 0
       AND l.posting_date BETWEEN ${firstDay(a.period)}::date AND ${lastDay(a.period)}::date
       AND e.status = 'posted' AND NOT e.is_reversal`.execute(trx);

  const resolver = new AccountResolver(cfg);
  const b = new EntryBuilder();
  const partnerCache = new Map<string, string>();
  const branchPartner = async (code: string, name: string) => {
    if (!partnerCache.has(code)) partnerCache.set(code, await partnerRepository.upsert(trx, auth.tenantId, { code: `CN-${code}`, name: name || `Chi nhánh ${code}` }, 'internal'));
    return partnerCache.get(code)!;
  };
  const reasonFor = (code: string | null, fallbackKey: string) => (code && cfg.reasons.has(code) ? cfg.reasons.get(code)! : resolver.reason(undefined, fallbackKey));
  const own = await branchPartner(a.branchCode, '');

  for (const m of a.movements) {
    // Chuyển đến: định giá theo nhóm GỬI để tài khoản hàng đang chuyển của hai bên triệt tiêu nhau.
    const unitGroup = m.kind === 'transfer_in' && m.counterGroup !== null ? m.counterGroup : m.group;
    const unit = a.units.get(key(unitGroup, m.sku)) ?? 0;
    // Hàng tặng khách lấy từ phần quà KM người tiêu dùng: giá vốn 0 cho phần đó.
    const fromGift = m.kind === 'sale' && m.isGift && m.qty < 0 ? Math.min(Math.abs(m.qty), a.giftCovered.get(`${m.eventId}|${m.sku}`) ?? 0) : 0;
    const amount = Math.round((Math.abs(m.qty) - fromGift) * unit);
    if (!amount) continue;
    // Mỗi dòng mang mã hàng → phiếu giá vốn liệt kê từng mã (EntryBuilder gộp theo mã × cặp tài khoản).
    const productSku = m.sku;
    const group = resolver.groupForSku(m.sku);
    const inventory = group.inventory_account;
    const out = m.qty < 0;
    switch (m.kind) {
      case 'sale':
      case 'sale_return': {
        const reason = reasonFor(m.reasonCode, m.kind);
        const cogs = resolver.cogsAccount(reason, group, m.isGift);
        if (out) b.add({ part: 'cogs', productSku, debitAccount: cogs, creditAccount: inventory, amount, description: m.isGift ? 'Giá vốn hàng khuyến mãi' : 'Giá vốn hàng bán' });
        else b.add({ part: 'cogs', productSku, debitAccount: inventory, creditAccount: cogs, amount, description: 'Nhập lại kho hàng khách trả' });
        break;
      }
      case 'transfer_out':
      case 'transfer_in': {
        const reason = reasonFor(m.reasonCode, 'transfer');
        const same = m.counterGroup === null || m.counterGroup === m.group;
        const transit = same
          ? resolver.counterOr(reason, 'goods_in_transit', 'tài khoản hàng đang chuyển giữa các chi nhánh')
          : resolver.counterOr(reason, 'internal_receivable_goods', 'tài khoản phải thu nội bộ hàng', 'internal_receivable');
        const other = m.counterCode ? await branchPartner(m.counterCode, m.counterName ?? '') : own;
        if (m.kind === 'transfer_out') b.add({ part: 'goods', productSku, debitAccount: transit, creditAccount: inventory, amount, debitPartnerId: other, description: 'Xuất chuyển kho (theo giá vốn)' });
        else b.add({ part: 'goods', productSku, debitAccount: inventory, creditAccount: transit, amount, creditPartnerId: other, description: 'Nhập chuyển kho (theo giá vốn)' });
        break;
      }
      case 'adjust_out':
      case 'adjust_in': {
        const increase = m.kind === 'adjust_in';
        const reason = reasonFor(m.reasonCode, `stock_adjustment:${increase ? 'increase' : 'decrease'}`);
        const counter = increase ? resolver.counterOr(reason, 'stock_surplus', 'tài khoản hàng thừa chờ xử lý') : resolver.counterOr(reason, 'stock_shortage', 'tài khoản hàng thiếu chờ xử lý');
        if (increase) b.add({ part: 'goods', productSku, debitAccount: inventory, creditAccount: counter, amount, creditPartnerId: own, description: 'Điều chỉnh tăng kho (theo giá vốn)' });
        else b.add({ part: 'goods', productSku, debitAccount: counter, creditAccount: inventory, amount, debitPartnerId: own, description: 'Điều chỉnh giảm kho (theo giá vốn)' });
        break;
      }
    }
  }
  resolver.assertComplete();

  // Dòng chờ cũ về 0 (giá vốn đã nằm trong phiếu giá vốn tháng).
  const overwrite = slotRows.rows.map((r) => ({ entryId: r.entry_id, pairNo: Number(r.pair_no), amount: 0 }));
  const filled = overwrite.length ? await eventStore.overwriteCostPairs(trx, auth.tenantId, overwrite, cfg.accounts) : 0;
  const filledTotal = 0;
  if (filled) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'costing.clear_slots', objectType: 'branch', objectId: `${a.branchCode}:${label(a.period)}`, after: { pairs: filled } });

  const lines = b.toLines();
  // Đối tượng chỉ giữ ở phía tài khoản theo dõi đối tượng.
  for (const l of lines) {
    const acc = cfg.accounts.get(l.accountCode);
    if (!acc || !(acc.track_partner || acc.is_debt || acc.normal_side === 'both')) l.partnerId = null;
  }

  const p = a.period;
  if (!lines.length) {
    if (existing) await eventStore.cancel(trx, auth, existing, { message: 'Tính lại giá vốn: không còn hàng xuất cần định giá', reversed });
    return { branchCode: a.branchCode, status: 'empty', total: 0, filled, filledTotal };
  }
  const total = fromCents(lines.reduce((s, l) => s + toCents(l.debit), 0));
  const docNo = `GV ${String(p.month).padStart(2, '0')}/${p.year} ${a.branchCode}`;
  const description = `Giá vốn hàng xuất tháng ${String(p.month).padStart(2, '0')}/${p.year}`;
  const ev = await eventStore.saveVersion(trx, auth, existing, {
    docKey, docType: 'cogs', docNo,
    fields: { branch_id: a.branchId, doc_date: lastDay(p), total, payload: JSON.stringify({ period: label(p), branchCode: a.branchCode, description, method: 'binh-quan-thang' }) },
  });
  const version = ev.version;
  const entry = await eventStore.post(trx, auth, ev, { branchId: a.branchId, docType: 'cogs', docNo, docDate: lastDay(p), postingDate: lastDay(p), description, lines }, cfg.accounts);
  await eventStore.markPosted(trx, auth, { ...ev, docType: 'cogs', docNo, entryIds: [entry.id], reversed, total });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'costing.run', objectType: 'source_document', objectId: docKey, after: { version, total } });
  return { branchCode: a.branchCode, status: 'posted', docNo, total, filled, filledTotal };
}
