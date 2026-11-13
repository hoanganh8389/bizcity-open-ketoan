// @bizcity-layer P module-sdk
// [2026-11-13 10:00 AM Võ Hoàng] POS-KM2 — S031-15 đợt 2 (chữ chốt PHASE-031 · 00 §18, phiếu NT-BH-012): năm khuôn khuyến mại mở rộng — bậc, giảm tổng đơn / mã giảm giá, quà tổng đơn, combo, món rẻ nhất (đóng góp)
/**
 * KHUYẾN MẠI MỞ RỘNG — năm Rule Contract nội dung nội tuyến (phát hành qua POST /api/v1/policies, chủ ban-hang).
 *
 * Quy ước chung (00 §18):
 *   - số lượng theo đơn vị nhỏ nhất; `lines[].price` = đơn giá trọn (gồm thuế, trước khuyến mại) trên một đơn vị nhỏ nhất;
 *     tiền dòng (gross) = round(qty × price); dòng thiếu giá không vào phần tính theo tiền (nêu ở `noPrice`);
 *   - "tổng đơn" = tổng tiền dòng trọn TRƯỚC khuyến mại của các dòng trong phạm vi (phạm vi trống = cả đơn);
 *   - tiền giảm làm tròn đồng; chia tiền giảm của bộ / của đơn cho các dòng theo tỉ lệ tiền dòng, phần dư cho dòng tiền lớn nhất;
 *   - khối chung: thời gian, ưu tiên, áp riêng, điều kiện (thứ, giờ, tổng đơn tối thiểu, mã giảm giá, tháng sinh nhật, hạng),
 *     trần NĐ81 (`legalCapPct`, mặc định 50, null = miễn) — Core kẹp sau khi tính hết (policy-service);
 *   - `context.lenient` (cửa nạp tính lại): điều kiện không biết được từ chứng từ (giờ, thứ, mã, khách) coi như đạt; khuôn cần tiền mà
 *     dòng không có giá → `indeterminate` (cửa nạp im lặng, không báo lệch oan).
 * Kết quả: `discounts[]` (theo dòng), `gifts[]`, `touched[]` (dòng đã dùng — cho áp riêng), `blocked` (lý do điều kiện không đạt).
 */
import { z } from 'zod';
import type { RuleContract, Treatment } from './types.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const sku = z.string().trim().min(1).max(64);
const money = z.number().finite().min(0);
const pos = z.number().finite().positive();

export const promoConditions = z.object({
  /** 1 = thứ Hai … 7 = Chủ nhật. */
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  timeFrom: hhmm.optional(),
  timeTo: hhmm.optional(),
  minOrderAmount: money.optional(),
  /** Khách đọc đúng một mã trong danh sách (không phân biệt hoa thường). */
  couponCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(500).optional(),
  birthdayMonth: z.boolean().optional(),
  memberLevels: z.array(z.string().trim().min(1).max(32)).min(1).max(50).optional(),
}).strict();

const common = {
  validFrom: day.optional(),
  validTo: day.optional(),
  /** Số lớn tính trước. */
  priority: z.number().int().min(-1000).max(1000).default(0),
  /** Áp riêng: dòng chương trình này đã dùng thì chương trình tính sau không áp lên dòng đó. */
  exclusive: z.boolean().default(false),
  conditions: promoConditions.optional(),
  /** Trần NĐ81/2018 Điều 7: tổng giảm một dòng ≤ % tiền dòng. null = miễn (người khai chịu trách nhiệm). */
  legalCapPct: z.number().min(0).max(100).nullable().default(50),
};

export interface PromoLine { lineKey: string; sku: string; qty: number; itemId?: string; price?: number }
export interface PromoContext {
  docDate?: string;
  at?: { time?: string; weekday?: number };
  customer?: { birthday?: string; memberLevel?: string };
  coupons?: string[];
  /** Cửa nạp tính lại: điều kiện không biết được coi như đạt. */
  lenient?: boolean;
}
export interface PromoInput { lines: PromoLine[]; context?: PromoContext }
export interface PromoDiscount { lineKey: string; sku: string; qty: number; amount: number }
export interface PromoOutput {
  discounts: PromoDiscount[];
  gifts: { sku: string; qty: number }[];
  total: number;
  touched: string[];
  noPrice: string[];
  /** Lý do điều kiện / mức không đạt (không áp). */
  blocked?: string;
  /** Không tính được (cửa nạp thiếu giá) — người gọi bỏ qua, không so. */
  indeterminate?: true;
  /** Khuôn tự kẹp trần NĐ81 theo cách riêng (món rẻ nhất: theo giá trị cả nhóm) — Core không kẹp thêm theo dòng. */
  selfCapped?: true;
  /** Bậc đã đạt / số bộ / số món được tặng… để giải thích. */
  detail?: Record<string, unknown>;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const okQty = (q: number) => Number.isFinite(q) && q > 0;
const hasPrice = (l: PromoLine) => l.price !== undefined && Number.isFinite(l.price) && l.price >= 0;
const gross = (l: PromoLine) => (hasPrice(l) ? Math.round(l.qty * l.price!) : 0);
const vnd = (n: number) => n.toLocaleString('vi-VN');
const empty = (over: Partial<PromoOutput> = {}): PromoOutput => ({ discounts: [], gifts: [], total: 0, touched: [], noPrice: [], ...over });
const inScope = (skus: string[] | undefined) => (l: PromoLine) => okQty(l.qty) && (!skus?.length || skus.includes(l.sku));

/** Chia `total` cho các dòng theo tỉ lệ tiền; phần dư (do làm tròn) cho dòng tiền lớn nhất. Không vượt tiền dòng. */
export function distribute(total: number, lines: { lineKey: string; sku: string; qty: number; gross: number }[]): PromoDiscount[] {
  const base = lines.filter((l) => l.gross > 0);
  const sum = base.reduce((s, l) => s + l.gross, 0);
  const t = Math.min(Math.max(0, Math.round(total)), sum);
  if (!t || !sum) return [];
  const out = base.map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty, amount: Math.floor((t * l.gross) / sum) }));
  let rest = t - out.reduce((s, x) => s + x.amount, 0);
  const order = [...base.keys()].sort((a, b) => base[b]!.gross - base[a]!.gross || base[a]!.lineKey.localeCompare(base[b]!.lineKey));
  for (const i of order) { if (rest <= 0) break; const room = base[i]!.gross - out[i]!.amount; const add = Math.min(room, rest); out[i]!.amount += add; rest -= add; }
  return out.filter((x) => x.amount > 0);
}

/** Điều kiện chung. Trả lý do không đạt, hoặc null. */
export function conditionsBlock(c: z.infer<typeof promoConditions> | undefined, ctx: PromoContext | undefined, orderAmount: number | null): string | null {
  if (!c) return null;
  const lenient = ctx?.lenient === true;
  if (c.minOrderAmount !== undefined) {
    if (orderAmount === null) { if (!lenient) return 'cần đơn giá các dòng để biết tổng đơn'; } else if (orderAmount < c.minOrderAmount) return `tổng đơn ${vnd(orderAmount)} chưa đủ ${vnd(c.minOrderAmount)}`;
  }
  if (lenient) return null;
  if (c.weekdays) {
    const wd = ctx?.at?.weekday;
    if (!wd) return 'chương trình theo thứ trong tuần — cần at.weekday';
    if (!c.weekdays.includes(wd)) return `chỉ áp ${c.weekdays.map((d) => (d === 7 ? 'Chủ nhật' : `thứ ${d + 1}`)).join(', ')}`;
  }
  if (c.timeFrom || c.timeTo) {
    const t = ctx?.at?.time;
    if (!t) return 'chương trình theo khung giờ — cần at.time';
    if ((c.timeFrom && t < c.timeFrom) || (c.timeTo && t > c.timeTo)) return `chỉ áp ${c.timeFrom ?? '00:00'}–${c.timeTo ?? '23:59'}`;
  }
  if (c.couponCodes) {
    const have = new Set((ctx?.coupons ?? []).map((x) => x.trim().toUpperCase()));
    if (!c.couponCodes.some((x) => have.has(x.trim().toUpperCase()))) return 'cần mã giảm giá của chương trình';
  }
  if (c.birthdayMonth) {
    const b = ctx?.customer?.birthday; const d = ctx?.docDate;
    if (!b) return 'chương trình sinh nhật — cần ngày sinh của khách';
    if (!d || b.slice(-5, -3) !== d.slice(5, 7)) return 'không phải tháng sinh nhật của khách';
  }
  if (c.memberLevels) {
    const lv = ctx?.customer?.memberLevel;
    if (!lv || !c.memberLevels.includes(lv)) return `chỉ áp hạng ${c.memberLevels.join(', ')}`;
  }
  return null;
}

/** Tổng đơn (tiền trọn trước khuyến mại) của các dòng trong phạm vi; null khi có dòng thiếu giá. */
function orderAmountOf(lines: PromoLine[]): number | null {
  if (lines.some((l) => !hasPrice(l))) return null;
  return lines.reduce((s, l) => s + gross(l), 0);
}

const priceWay = (o: { pct?: number | null; amountPerUnit?: number | null; unitPrice?: number | null }) =>
  [o.pct, o.amountPerUnit, o.unitPrice].filter((x) => x !== null && x !== undefined).length === 1;
function lineDiscount(l: PromoLine, way: { pct?: number | null; amountPerUnit?: number | null; unitPrice?: number | null }): number {
  const g = gross(l);
  const raw = way.pct != null ? Math.round((g * way.pct) / 100) : way.amountPerUnit != null ? Math.round(l.qty * way.amountPerUnit) : g - Math.round(l.qty * (way.unitPrice ?? 0));
  return Math.min(g, Math.max(0, raw));
}
const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);

// ── 1. Giảm theo bậc ───────────────────────────────────────────────────────────────────────────────────────────────────
export const tieredParams = z.object({
  ...common,
  skus: z.array(sku).min(1).max(500),
  basis: z.enum(['qty', 'amount']).default('qty'),
  tiers: z.array(z.object({ min: pos, pct: z.number().positive().max(100).nullish(), amountPerUnit: pos.nullish(), unitPrice: money.nullish() }).strict()).min(1).max(20),
}).strict();
export type TieredParams = z.infer<typeof tieredParams>;

export function evaluateTiered(p: TieredParams, input: PromoInput): PromoOutput {
  const all = input.lines.filter(inScope(undefined));
  const group = input.lines.filter(inScope(p.skus));
  const blocked = conditionsBlock(p.conditions, input.context, orderAmountOf(all));
  if (blocked) return empty({ blocked });
  if (p.basis === 'amount' && group.some((l) => !hasPrice(l))) return input.context?.lenient ? empty({ indeterminate: true }) : empty({ blocked: 'bậc theo tiền — cần đơn giá các dòng', noPrice: group.filter((l) => !hasPrice(l)).map((l) => l.lineKey) });
  const base = p.basis === 'qty' ? r4(group.reduce((s, l) => s + l.qty, 0)) : group.reduce((s, l) => s + gross(l), 0);
  const tier = [...p.tiers].reverse().find((t) => base >= t.min - 1e-9);
  if (!tier) return empty({ blocked: `mới ${p.basis === 'qty' ? base : vnd(base)}, bậc thấp nhất từ ${p.basis === 'qty' ? p.tiers[0]!.min : vnd(p.tiers[0]!.min)}`, detail: { base } });
  const discounts: PromoDiscount[] = [];
  const noPrice: string[] = [];
  for (const l of group) {
    if (!hasPrice(l)) { noPrice.push(l.lineKey); continue; }
    const amount = lineDiscount(l, tier);
    if (amount > 0) discounts.push({ lineKey: l.lineKey, sku: l.sku, qty: l.qty, amount });
  }
  return { discounts, gifts: [], total: discounts.reduce((s, d) => s + d.amount, 0), touched: group.map((l) => l.lineKey), noPrice, detail: { base, tierMin: tier.min } };
}

// ── 2. Giảm theo tổng đơn (gồm mã giảm giá) ───────────────────────────────────────────────────────────────────────────
export const orderDiscountParams = z.object({
  ...common,
  skus: z.array(sku).max(500).optional(),
  tiers: z.array(z.object({ minOrder: money, pct: z.number().positive().max(100).nullish(), amount: pos.nullish(), maxDiscount: pos.nullish() }).strict()).min(1).max(20),
}).strict();
export type OrderDiscountParams = z.infer<typeof orderDiscountParams>;

export function evaluateOrderDiscount(p: OrderDiscountParams, input: PromoInput): PromoOutput {
  const scope = input.lines.filter(inScope(p.skus));
  const amount = orderAmountOf(scope);
  if (amount === null) return input.context?.lenient ? empty({ indeterminate: true }) : empty({ blocked: 'cần đơn giá các dòng để tính tổng đơn', noPrice: scope.filter((l) => !hasPrice(l)).map((l) => l.lineKey) });
  const blocked = conditionsBlock(p.conditions, input.context, orderAmountOf(input.lines.filter(inScope(undefined))));
  if (blocked) return empty({ blocked });
  const tier = [...p.tiers].reverse().find((t) => amount >= t.minOrder);
  if (!tier) return empty({ blocked: `tổng đơn ${vnd(amount)} chưa đủ ${vnd(p.tiers[0]!.minOrder)}`, detail: { orderAmount: amount } });
  let total = tier.pct != null ? Math.round((amount * tier.pct) / 100) : (tier.amount ?? 0);
  if (tier.maxDiscount != null) total = Math.min(total, tier.maxDiscount);
  const discounts = distribute(total, scope.map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty, gross: gross(l) })));
  return { discounts, gifts: [], total: discounts.reduce((s, d) => s + d.amount, 0), touched: scope.map((l) => l.lineKey), noPrice: [], detail: { orderAmount: amount, tierMin: tier.minOrder } };
}

// ── 3. Quà theo tổng đơn ──────────────────────────────────────────────────────────────────────────────────────────────
export const orderGiftParams = z.object({
  ...common,
  skus: z.array(sku).max(500).optional(),
  tiers: z.array(z.object({ minOrder: money, gifts: z.array(z.object({ sku, qty: pos }).strict()).min(1).max(20) }).strict()).min(1).max(20),
}).strict();
export type OrderGiftParams = z.infer<typeof orderGiftParams>;

export function evaluateOrderGift(p: OrderGiftParams, input: PromoInput): PromoOutput {
  const scope = input.lines.filter(inScope(p.skus));
  const amount = orderAmountOf(scope);
  if (amount === null) return input.context?.lenient ? empty({ indeterminate: true }) : empty({ blocked: 'cần đơn giá các dòng để tính tổng đơn', noPrice: scope.filter((l) => !hasPrice(l)).map((l) => l.lineKey) });
  const blocked = conditionsBlock(p.conditions, input.context, orderAmountOf(input.lines.filter(inScope(undefined))));
  if (blocked) return empty({ blocked });
  const tier = [...p.tiers].reverse().find((t) => amount >= t.minOrder);
  if (!tier) return empty({ blocked: `tổng đơn ${vnd(amount)} chưa đủ ${vnd(p.tiers[0]!.minOrder)}`, detail: { orderAmount: amount } });
  return { discounts: [], gifts: tier.gifts.map((g) => ({ sku: g.sku, qty: g.qty })), total: 0, touched: scope.map((l) => l.lineKey), noPrice: [], detail: { orderAmount: amount, tierMin: tier.minOrder } };
}

// ── 4. Combo ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const comboParams = z.object({
  ...common,
  items: z.array(z.object({ sku, qty: pos }).strict()).min(1).max(20),
  comboPrice: money.nullish(),
  discountPct: z.number().positive().max(100).nullish(),
  discountAmount: pos.nullish(),
  maxCombos: z.number().int().positive().nullish(),
}).strict();
export type ComboParams = z.infer<typeof comboParams>;

export function evaluateCombo(p: ComboParams, input: PromoInput): PromoOutput {
  const skus = p.items.map((i) => i.sku);
  const scope = input.lines.filter(inScope(skus));
  const blocked = conditionsBlock(p.conditions, input.context, orderAmountOf(input.lines.filter(inScope(undefined))));
  if (blocked) return empty({ blocked });
  if (scope.some((l) => !hasPrice(l))) return input.context?.lenient ? empty({ indeterminate: true }) : empty({ blocked: 'combo — cần đơn giá các dòng', noPrice: scope.filter((l) => !hasPrice(l)).map((l) => l.lineKey) });
  const qtyOf = (s: string) => r4(scope.filter((l) => l.sku === s).reduce((t, l) => t + l.qty, 0));
  let times = Math.min(...p.items.map((i) => Math.floor(qtyOf(i.sku) / i.qty + 1e-9)));
  if (p.maxCombos != null) times = Math.min(times, p.maxCombos);
  if (times <= 0) return empty({ blocked: `chưa đủ một bộ (${p.items.map((i) => `${i.qty} ${i.sku}`).join(' + ')})`, detail: { times: 0 } });
  // Giá một bộ theo đơn giá bình quân của từng mã trên đơn.
  const unit = (s: string) => { const ls = scope.filter((l) => l.sku === s); const q = ls.reduce((t, l) => t + l.qty, 0); return q ? ls.reduce((t, l) => t + gross(l), 0) / q : 0; };
  const comboGross = Math.round(p.items.reduce((t, i) => t + i.qty * unit(i.sku), 0));
  const per = p.comboPrice != null ? comboGross - p.comboPrice : p.discountPct != null ? Math.round((comboGross * p.discountPct) / 100) : (p.discountAmount ?? 0);
  const total = Math.min(times * comboGross, Math.max(0, times * per));
  if (total <= 0) return empty({ blocked: `giá bộ ${vnd(p.comboPrice ?? 0)} không thấp hơn giá lẻ ${vnd(comboGross)}`, detail: { times, comboGross } });
  // Chia trên phần hàng thuộc các bộ: mỗi mã tính theo số lượng trong bộ × số bộ, rải theo thứ tự dòng.
  const parts: { lineKey: string; sku: string; qty: number; gross: number }[] = [];
  for (const i of p.items) {
    let need = i.qty * times;
    for (const l of scope.filter((x) => x.sku === i.sku)) {
      if (need <= 1e-9) break;
      const take = Math.min(l.qty, need); need = r4(need - take);
      parts.push({ lineKey: l.lineKey, sku: l.sku, qty: take, gross: Math.round(take * l.price!) });
    }
  }
  const merged = new Map<string, { lineKey: string; sku: string; qty: number; gross: number }>();
  for (const x of parts) { const m = merged.get(x.lineKey); if (m) { m.qty = r4(m.qty + x.qty); m.gross += x.gross; } else merged.set(x.lineKey, { ...x }); }
  const discounts = distribute(total, [...merged.values()]).map((d) => ({ ...d, qty: scope.find((l) => l.lineKey === d.lineKey)!.qty }));
  return { discounts, gifts: [], total: discounts.reduce((s, d) => s + d.amount, 0), touched: [...merged.keys()], noPrice: [], detail: { times, comboGross } };
}

// ── 5. Mua bất kỳ tặng món rẻ nhất ────────────────────────────────────────────────────────────────────────────────────
export const cheapestFreeParams = z.object({
  ...common,
  skus: z.array(sku).min(1).max(500),
  buyQty: z.number().int().min(2).max(100),
  freeQty: z.number().int().min(1).max(100).default(1),
  repeat: z.boolean().default(true),
}).strict();
export type CheapestFreeParams = z.infer<typeof cheapestFreeParams>;

export function evaluateCheapestFree(p: CheapestFreeParams, input: PromoInput): PromoOutput {
  const group = input.lines.filter(inScope(p.skus));
  const blocked = conditionsBlock(p.conditions, input.context, orderAmountOf(input.lines.filter(inScope(undefined))));
  if (blocked) return empty({ blocked });
  if (group.some((l) => !hasPrice(l))) return input.context?.lenient ? empty({ indeterminate: true }) : empty({ blocked: 'món rẻ nhất — cần đơn giá các dòng', noPrice: group.filter((l) => !hasPrice(l)).map((l) => l.lineKey) });
  const units = group.flatMap((l) => Array.from({ length: Math.floor(l.qty + 1e-9) }, () => ({ lineKey: l.lineKey, price: l.price! })));
  const times = p.repeat ? Math.floor(units.length / p.buyQty) : units.length >= p.buyQty ? 1 : 0;
  const free = Math.min(units.length, times * p.freeQty);
  if (!free) return empty({ blocked: `mới ${units.length} món, cần ${p.buyQty}`, detail: { units: units.length } });
  units.sort((a, b) => a.price - b.price || a.lineKey.localeCompare(b.lineKey));
  // Món 0đ thực chất là hàng tặng: trần NĐ81 tính trên giá trị hàng mua của cả nhóm (không theo dòng).
  const groupGross = group.reduce((t, l) => t + gross(l), 0);
  const limit = p.legalCapPct === null ? Infinity : Math.floor((groupGross * p.legalCapPct) / 100);
  const by = new Map<string, number>();
  let given = 0; let freeUnits = 0;
  for (const u of units.slice(0, free)) { const v = Math.round(u.price); if (given + v > limit) break; given += v; freeUnits += 1; by.set(u.lineKey, (by.get(u.lineKey) ?? 0) + v); }
  const discounts = group.filter((l) => by.has(l.lineKey)).map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty, amount: Math.min(gross(l), by.get(l.lineKey)!) }));
  return { discounts, gifts: [], total: discounts.reduce((s, d) => s + d.amount, 0), touched: group.map((l) => l.lineKey), noPrice: [], selfCapped: true, detail: { units: units.length, free: freeUnits, ...(freeUnits < free ? { cappedFrom: free } : {}) } };
}

// ── Bộ ca chuẩn (số liệu NT-BH-012 §4) ────────────────────────────────────────────────────────────────────────────────
const L = (lineKey: string, s: string, qty: number, price?: number): PromoLine => ({ lineKey, sku: s, qty, ...(price !== undefined ? { price } : {}) });
const CART = [L('a', 'A', 5, 100_000), L('b', 'B', 1, 200_000), L('c', 'C', 2, 50_000), L('d', 'D', 1, 30_000)];
const base = { priority: 0, exclusive: false, legalCapPct: 50 } as const;

export const tieredVectors = [
  { name: '5 A đạt bậc 20 % → giảm 100.000', params: { ...base, skus: ['A'], basis: 'qty' as const, tiers: [{ min: 3, pct: 10 }, { min: 5, pct: 20 }] }, input: { lines: CART },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 5, amount: 100_000 }], gifts: [], total: 100_000, touched: ['a'], noPrice: [], detail: { base: 5, tierMin: 5 } } },
  { name: '3 A → bậc 10 %', params: { ...base, skus: ['A'], basis: 'qty' as const, tiers: [{ min: 3, pct: 10 }, { min: 5, pct: 20 }] }, input: { lines: [L('a', 'A', 3, 100_000)] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 3, amount: 30_000 }], gifts: [], total: 30_000, touched: ['a'], noPrice: [], detail: { base: 3, tierMin: 3 } } },
  { name: '2 A → chưa đạt bậc', params: { ...base, skus: ['A'], basis: 'qty' as const, tiers: [{ min: 3, pct: 10 }] }, input: { lines: [L('a', 'A', 2, 100_000)] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'mới 2, bậc thấp nhất từ 3', detail: { base: 2 } } },
  { name: 'bậc theo tiền, giá chương trình 90.000: 5 A (500.000) → giảm 50.000', params: { ...base, skus: ['A'], basis: 'amount' as const, tiers: [{ min: 400_000, unitPrice: 90_000 }] }, input: { lines: [L('a', 'A', 5, 100_000), L('b', 'B', 1, 200_000)] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 5, amount: 50_000 }], gifts: [], total: 50_000, touched: ['a'], noPrice: [], detail: { base: 500_000, tierMin: 400_000 } } },
] satisfies { name: string; params: TieredParams; input: PromoInput; output: PromoOutput }[];

export const orderDiscountVectors = [
  { name: 'tổng 830.000, có mã → 5 % = 41.500 chia theo tỉ lệ', params: { ...base, conditions: { couponCodes: ['KM50K'] }, tiers: [{ minOrder: 500_000, pct: 5, maxDiscount: 50_000 }] }, input: { lines: CART, context: { coupons: ['km50k'] } },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 5, amount: 25_000 }, { lineKey: 'b', sku: 'B', qty: 1, amount: 10_000 }, { lineKey: 'c', sku: 'C', qty: 2, amount: 5_000 }, { lineKey: 'd', sku: 'D', qty: 1, amount: 1_500 }], gifts: [], total: 41_500, touched: ['a', 'b', 'c', 'd'], noPrice: [], detail: { orderAmount: 830_000, tierMin: 500_000 } } },
  { name: 'thiếu mã → không áp', params: { ...base, conditions: { couponCodes: ['KM50K'] }, tiers: [{ minOrder: 500_000, pct: 5 }] }, input: { lines: CART },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'cần mã giảm giá của chương trình' } },
  { name: 'trần tiền giảm 30.000', params: { ...base, tiers: [{ minOrder: 0, pct: 10, maxDiscount: 30_000 }] }, input: { lines: [L('a', 'A', 5, 100_000)] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 5, amount: 30_000 }], gifts: [], total: 30_000, touched: ['a'], noPrice: [], detail: { orderAmount: 500_000, tierMin: 0 } } },
] satisfies { name: string; params: OrderDiscountParams; input: PromoInput; output: PromoOutput }[];

export const orderGiftVectors = [
  { name: 'tổng 830.000 chưa đủ 1.000.000', params: { ...base, tiers: [{ minOrder: 1_000_000, gifts: [{ sku: 'QUA01', qty: 1 }] }] }, input: { lines: CART },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'tổng đơn 830.000 chưa đủ 1.000.000', detail: { orderAmount: 830_000 } } },
  { name: 'tổng 1.030.000 → tặng 1 QUA01', params: { ...base, tiers: [{ minOrder: 1_000_000, gifts: [{ sku: 'QUA01', qty: 1 }] }] }, input: { lines: [...CART, L('b2', 'B', 1, 200_000)] },
    output: { discounts: [], gifts: [{ sku: 'QUA01', qty: 1 }], total: 0, touched: ['a', 'b', 'c', 'd', 'b2'], noPrice: [], detail: { orderAmount: 1_030_000, tierMin: 1_000_000 } } },
  { name: 'cửa nạp không có giá → không xác định', params: { ...base, tiers: [{ minOrder: 1_000_000, gifts: [{ sku: 'QUA01', qty: 1 }] }] }, input: { lines: [L('a', 'A', 5)], context: { lenient: true } },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], indeterminate: true as const } },
] satisfies { name: string; params: OrderGiftParams; input: PromoInput; output: PromoOutput }[];

export const comboVectors = [
  { name: 'B + 2 C giá bộ 260.000 → giảm 40.000 chia B 26.667 / C 13.333', params: { ...base, items: [{ sku: 'B', qty: 1 }, { sku: 'C', qty: 2 }], comboPrice: 260_000 }, input: { lines: CART },
    output: { discounts: [{ lineKey: 'b', sku: 'B', qty: 1, amount: 26_667 }, { lineKey: 'c', sku: 'C', qty: 2, amount: 13_333 }], gifts: [], total: 40_000, touched: ['b', 'c'], noPrice: [], detail: { times: 1, comboGross: 300_000 } } },
  { name: 'thiếu C → chưa đủ bộ', params: { ...base, items: [{ sku: 'B', qty: 1 }, { sku: 'C', qty: 2 }], comboPrice: 260_000 }, input: { lines: [L('b', 'B', 1, 200_000), L('c', 'C', 1, 50_000)] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'chưa đủ một bộ (1 B + 2 C)', detail: { times: 0 } } },
] satisfies { name: string; params: ComboParams; input: PromoInput; output: PromoOutput }[];

export const cheapestFreeVectors = [
  { name: '2 C + 1 D → D 0đ (30.000)', params: { ...base, skus: ['C', 'D'], buyQty: 3, freeQty: 1, repeat: true }, input: { lines: CART },
    output: { discounts: [{ lineKey: 'd', sku: 'D', qty: 1, amount: 30_000 }], gifts: [], total: 30_000, touched: ['c', 'd'], noPrice: [], selfCapped: true as const, detail: { units: 3, free: 1 } } },
  { name: '6 món lặp lại → 2 món rẻ nhất', params: { ...base, skus: ['C', 'D'], buyQty: 3, freeQty: 1, repeat: true }, input: { lines: [L('c', 'C', 4, 50_000), L('d', 'D', 2, 30_000)] },
    output: { discounts: [{ lineKey: 'd', sku: 'D', qty: 2, amount: 60_000 }], gifts: [], total: 60_000, touched: ['c', 'd'], noPrice: [], selfCapped: true as const, detail: { units: 6, free: 2 } } },
  { name: 'trần theo nhóm 5 %: nhóm 220.000 → tặng tối đa 11.000 — 2 lần tặng chỉ còn 1 món 10.000', params: { ...base, skus: ['C', 'D'], buyQty: 2, freeQty: 1, repeat: true, legalCapPct: 5 }, input: { lines: [L('c', 'C', 2, 10_000), L('d', 'D', 2, 100_000)] },
    output: { discounts: [{ lineKey: 'c', sku: 'C', qty: 2, amount: 10_000 }], gifts: [], total: 10_000, touched: ['c', 'd'], noPrice: [], selfCapped: true as const, detail: { units: 4, free: 1, cappedFrom: 2 } } },
] satisfies { name: string; params: CheapestFreeParams; input: PromoInput; output: PromoOutput }[];

// ── Khuôn ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const commonDocs = [
  { name: 'validFrom / validTo', type: 'YYYY-MM-DD', required: false, doc: 'Thời gian chương trình' },
  { name: 'priority', type: 'số nguyên', required: false, doc: 'Mặc định 0; lớn tính trước' },
  { name: 'exclusive', type: 'boolean', required: false, doc: 'Áp riêng: dòng đã dùng thì chương trình sau không áp' },
  { name: 'conditions', type: 'object', required: false, doc: 'weekdays[1..7], timeFrom / timeTo (HH:MM), minOrderAmount, couponCodes[], birthdayMonth, memberLevels[]' },
  { name: 'legalCapPct', type: 'số 0–100 | null', required: false, doc: 'Trần NĐ81 (mặc định 50 % tiền dòng); null = miễn' },
];
const dateIssues = (p: { validFrom?: string; validTo?: string }) => (p.validFrom && p.validTo && p.validTo < p.validFrom ? [{ path: 'validTo', message: 'Ngày kết thúc trước ngày bắt đầu' }] : []);
const timeIssues = (p: { conditions?: { timeFrom?: string; timeTo?: string } }) => (p.conditions?.timeFrom && p.conditions.timeTo && p.conditions.timeTo < p.conditions.timeFrom ? [{ path: 'conditions.timeTo', message: 'Giờ kết thúc trước giờ bắt đầu' }] : []);
const treat = (o: PromoOutput): Treatment[] => [
  ...(o.gifts.length ? [{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }] : []),
  ...(o.total > 0 ? [{ on: 'discount', reasonCode: 'GGHB', confirmed: false }] : []),
];
const promoWindow = (p: { validFrom?: string; validTo?: string }) => ({ from: p.validFrom, to: p.validTo });
const explainOf = (title: string) => (_p: unknown, o: PromoOutput) =>
  o.indeterminate ? `${title}: không tính được (thiếu đơn giá)` : o.blocked ? `${title}: ${o.blocked}` : o.gifts.length ? `${title}: tặng ${o.gifts.map((g) => `${g.qty} ${g.sku}`).join(', ')}` : `${title}: giảm ${vnd(o.total)} trên ${o.discounts.length} dòng`;

export const saleTiered: RuleContract<TieredParams, PromoInput, PromoOutput> = {
  id: 'sale.promo.tiered@1', domain: 'sale', title: 'Giảm theo bậc (mua nhiều giảm nhiều)', params: tieredParams,
  publishChecks: (p) => [
    ...dateIssues(p), ...timeIssues(p),
    ...(!ascending(p.tiers.map((t) => t.min)) ? [{ path: 'tiers', message: 'Các bậc phải tăng dần, không trùng mức' }] : []),
    ...p.tiers.flatMap((t, i) => (priceWay(t) ? [] : [{ path: `tiers.${i}`, message: 'Mỗi bậc chọn đúng một cách giảm: pct, amountPerUnit hoặc unitPrice' }])),
  ],
  window: promoWindow, evaluate: evaluateTiered, explain: explainOf('Giảm theo bậc'), treatment: treat,
  describe: () => ({ params: [...commonDocs, { name: 'skus', type: 'string[]', required: true, doc: 'Nhóm mã hàng' }, { name: 'basis', type: "'qty' | 'amount'", required: false, doc: 'Tính bậc theo số lượng (mặc định) hay tiền' }, { name: 'tiers', type: '[{ min, pct | amountPerUnit | unitPrice }]', required: true, doc: 'Bậc tăng dần; áp bậc cao nhất đạt được' }],
    spec: { input: 'lines[]: { lineKey, sku, qty, price }; context?', steps: ['kiểm điều kiện chung', 'base = tổng qty (hoặc tổng tiền) các dòng trong nhóm', 'bậc = bậc cao nhất có min ≤ base', 'mỗi dòng nhóm: giảm theo cách của bậc, kẹp [0, tiền dòng]'], output: 'PromoOutput' }, vectors: tieredVectors }),
};

export const saleOrderDiscount: RuleContract<OrderDiscountParams, PromoInput, PromoOutput> = {
  id: 'sale.promo.order_discount@1', domain: 'sale', title: 'Giảm theo tổng đơn / mã giảm giá', params: orderDiscountParams,
  publishChecks: (p) => [
    ...dateIssues(p), ...timeIssues(p),
    ...(!ascending(p.tiers.map((t) => t.minOrder)) ? [{ path: 'tiers', message: 'Các bậc tổng đơn phải tăng dần, không trùng mức' }] : []),
    ...p.tiers.flatMap((t, i) => ([t.pct, t.amount].filter((x) => x != null).length === 1 ? [] : [{ path: `tiers.${i}`, message: 'Mỗi bậc chọn đúng một cách giảm: pct hoặc amount' }])),
  ],
  window: promoWindow, evaluate: evaluateOrderDiscount, explain: explainOf('Giảm tổng đơn'), treatment: treat,
  describe: () => ({ params: [...commonDocs, { name: 'skus', type: 'string[]', required: false, doc: 'Phạm vi; trống = cả đơn' }, { name: 'tiers', type: '[{ minOrder, pct | amount, maxDiscount? }]', required: true, doc: 'Bậc theo tổng đơn' }],
    spec: { input: 'lines[]: { lineKey, sku, qty, price }; context?', steps: ['tổng đơn = tổng tiền trọn các dòng trong phạm vi', 'kiểm điều kiện chung (gồm mã giảm giá)', 'bậc cao nhất có minOrder ≤ tổng đơn; tiền giảm = pct hoặc amount, kẹp maxDiscount', 'chia tiền giảm theo tỉ lệ tiền dòng, dư cho dòng lớn nhất'], output: 'PromoOutput' }, vectors: orderDiscountVectors }),
};

export const saleOrderGift: RuleContract<OrderGiftParams, PromoInput, PromoOutput> = {
  id: 'sale.promo.order_gift@1', domain: 'sale', title: 'Quà theo tổng đơn', params: orderGiftParams,
  publishChecks: (p) => [...dateIssues(p), ...timeIssues(p), ...(!ascending(p.tiers.map((t) => t.minOrder)) ? [{ path: 'tiers', message: 'Các bậc tổng đơn phải tăng dần, không trùng mức' }] : [])],
  window: promoWindow, evaluate: evaluateOrderGift, explain: explainOf('Quà tổng đơn'), treatment: treat,
  describe: () => ({ params: [...commonDocs, { name: 'skus', type: 'string[]', required: false, doc: 'Phạm vi; trống = cả đơn' }, { name: 'tiers', type: '[{ minOrder, gifts[{ sku, qty }] }]', required: true, doc: 'Quà của bậc cao nhất đạt được' }],
    spec: { input: 'lines[]: { lineKey, sku, qty, price }; context?', steps: ['tổng đơn = tổng tiền trọn các dòng trong phạm vi (thiếu giá ở cửa nạp → không xác định)', 'kiểm điều kiện chung', 'quà của bậc cao nhất có minOrder ≤ tổng đơn'], output: 'PromoOutput' }, vectors: orderGiftVectors }),
};

export const saleCombo: RuleContract<ComboParams, PromoInput, PromoOutput> = {
  id: 'sale.promo.combo@1', domain: 'sale', title: 'Combo', params: comboParams,
  publishChecks: (p) => [
    ...dateIssues(p), ...timeIssues(p),
    ...([p.comboPrice, p.discountPct, p.discountAmount].filter((x) => x != null).length === 1 ? [] : [{ path: 'comboPrice', message: 'Chọn đúng một cách: giá bộ, giảm % hoặc giảm tiền mỗi bộ' }]),
    ...(new Set(p.items.map((i) => i.sku)).size !== p.items.length ? [{ path: 'items', message: 'Một mã chỉ khai một lần trong bộ' }] : []),
  ],
  window: promoWindow, evaluate: evaluateCombo, explain: explainOf('Combo'), treatment: treat,
  describe: () => ({ params: [...commonDocs, { name: 'items', type: '[{ sku, qty }]', required: true, doc: 'Các món của một bộ' }, { name: 'comboPrice | discountPct | discountAmount', type: 'số', required: true, doc: 'Đúng một cách tính giá bộ' }, { name: 'maxCombos', type: 'số nguyên', required: false, doc: 'Trần số bộ trên đơn' }],
    spec: { input: 'lines[]: { lineKey, sku, qty, price }; context?', steps: ['số bộ = min(floor(qty mã / qty trong bộ)), kẹp maxCombos', 'giá lẻ một bộ = Σ qty × đơn giá bình quân của mã', 'tiền giảm = số bộ × (giá lẻ − giá bộ | giá lẻ × % | số tiền)', 'chia trên phần hàng thuộc các bộ theo tỉ lệ tiền'], output: 'PromoOutput' }, vectors: comboVectors }),
};

export const saleCheapestFree: RuleContract<CheapestFreeParams, PromoInput, PromoOutput> = {
  id: 'sale.promo.cheapest_free@1', domain: 'sale', title: 'Mua bất kỳ tặng món rẻ nhất', params: cheapestFreeParams,
  publishChecks: (p) => [...dateIssues(p), ...timeIssues(p), ...(p.freeQty >= p.buyQty ? [{ path: 'freeQty', message: 'Số món tặng phải nhỏ hơn số món mua' }] : [])],
  window: promoWindow, evaluate: evaluateCheapestFree, explain: explainOf('Món rẻ nhất'), treatment: treat,
  describe: () => ({ params: [...commonDocs, { name: 'skus', type: 'string[]', required: true, doc: 'Nhóm mã hàng' }, { name: 'buyQty', type: 'số nguyên ≥ 2', required: true, doc: 'Mua đủ N món' }, { name: 'freeQty', type: 'số nguyên ≥ 1', required: false, doc: 'Số món rẻ nhất được 0đ mỗi lần (mặc định 1)' }, { name: 'repeat', type: 'boolean', required: false, doc: 'Mặc định true' }],
    spec: { input: 'lines[]: { lineKey, sku, qty, price }; context?', steps: ['trải các món của nhóm (phần nguyên số lượng)', 'lần = repeat ? floor(số món / N) : (đủ N ? 1 : 0); món 0đ = lần × freeQty', 'chọn món rẻ nhất (cùng giá: theo lineKey), cộng tiền theo dòng'], output: 'PromoOutput' }, vectors: cheapestFreeVectors }),
};

export const SALE_PROMO_CONTRACTS = [saleTiered, saleOrderDiscount, saleOrderGift, saleCombo, saleCheapestFree];
