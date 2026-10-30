// @bizcity-layer D modules/tai-san
/**
 * Công thức khấu hao / phân bổ một tháng của một tài sản (đường thẳng), tách riêng để kiểm thử.
 *
 *   Giá trị tính khấu hao = giá trị khai trên thẻ (trống = nguyên giá) + chênh lệch của các lần đánh giá lại.
 *   Mức tháng   = mức khai trên thẻ / lần đánh giá lại gần nhất; trống = giá trị tính khấu hao ÷ số tháng.
 *   Tháng đầu   = mức tháng × số ngày dùng trong tháng ÷ số ngày của tháng (bắt đầu từ ngày start_date).
 *   Tháng ghi giảm = trích tới hết ngày trước ngày ghi giảm (cùng tháng tăng: ngày giảm − ngày tăng).
 *   Tháng cuối  = toàn bộ phần còn lại. Tháng cuối là: tháng của lần đánh giá lại có khai số tháng còn lại
 *                 + số tháng đó − 1; hoặc tháng của opening_as_of + số tháng còn lại khi chuyển sổ;
 *                 hoặc tháng chứa ngày start_date + số tháng − 1 ngày.
 *   Không bao giờ trích quá phần còn lại = giá trị tính khấu hao − luỹ kế đầu − đã trích các tháng trước.
 *   Số trích làm tròn đồng. Thẻ "tạm ngừng" không trích; tháng ≤ opening_as_of không trích.
 * Căn cứ: Thông tư 45/2013/TT-BTC (trích khấu hao theo ngày tài sản tăng, giảm; phương pháp đường thẳng).
 * Số tiền tính bằng xu (số nguyên) để không sai số.
 */
export interface Period { year: number; month: number }

/** Một lần đánh giá lại (số chênh lệch tính bằng xu). */
export interface Revaluation {
  date: string;
  costDelta: number;
  depreciableDelta: number;
  accumulatedDelta: number;
  /** Mức tháng mới (xu); trống = giữ mức cũ. */
  monthlyAmount: number | null;
  /** Số tháng còn phải trích kể từ tháng đánh giá lại; trống = giữ thời gian cũ. */
  remainingMonths: number | null;
}

export interface DepreciableAsset {
  startDate: string;
  originalCost: number; // xu
  /** Giá trị tính khấu hao (xu); trống = nguyên giá. */
  depreciableAmount?: number | null;
  usefulLifeMonths: number;
  monthlyAmount: number | null; // xu
  openingAccumulated: number; // xu
  openingAsOf: string | null;
  /** Số tháng còn phải trích sau opening_as_of (chuyển sổ). */
  openingRemainingMonths?: number | null;
  status: string;
  disposedDate: string | null;
  revaluations?: Revaluation[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const periodLabel = (p: Period) => `${p.year}-${pad(p.month)}`;
export const monthIndex = (p: Period) => p.year * 12 + p.month - 1;
export const fromIndex = (i: number): Period => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
export const firstDayOf = (p: Period) => `${periodLabel(p)}-01`;
export const lastDayOf = (p: Period) => new Date(Date.UTC(p.year, p.month, 0)).toISOString().slice(0, 10);
export const daysIn = (p: Period) => new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
export const periodOf = (date: string): Period => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const toDong = (cents: number) => Math.round(cents / 100) * 100;

/** Ngày cuối cùng của thời gian sử dụng: start_date cộng số tháng, lùi một ngày. */
export function lastUsefulDay(a: Pick<DepreciableAsset, 'startDate' | 'usefulLifeMonths'>): string {
  const s = new Date(`${a.startDate}T00:00:00Z`);
  const target = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + a.usefulLifeMonths, 1));
  const dim = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(s.getUTCDate(), dim));
  return addDays(target.toISOString().slice(0, 10), -1);
}

/** Tháng đầu tiên phần mềm trích cho tài sản. */
export function firstChargePeriod(a: DepreciableAsset): Period {
  const start = periodOf(a.startDate);
  if (!a.openingAsOf) return start;
  return fromIndex(Math.max(monthIndex(start), monthIndex(periodOf(a.openingAsOf)) + 1));
}

/** Thông số có hiệu lực ở tháng `p` sau các lần đánh giá lại (tính từ tháng đánh giá lại). */
export function effectiveAt(a: DepreciableAsset, p: Period) {
  let depreciable = a.depreciableAmount ?? a.originalCost;
  let cost = a.originalCost;
  let opening = a.openingAccumulated;
  let monthly = a.monthlyAmount;
  let lastIdx =
    a.openingAsOf && a.openingRemainingMonths !== null && a.openingRemainingMonths !== undefined
      ? monthIndex(periodOf(a.openingAsOf)) + a.openingRemainingMonths
      : monthIndex(periodOf(lastUsefulDay(a)));
  for (const r of [...(a.revaluations ?? [])].sort((x, y) => x.date.localeCompare(y.date))) {
    if (monthIndex(periodOf(r.date)) > monthIndex(p)) break;
    cost += r.costDelta;
    depreciable += r.depreciableDelta;
    opening += r.accumulatedDelta;
    if (r.monthlyAmount !== null) monthly = r.monthlyAmount;
    if (r.remainingMonths !== null) lastIdx = monthIndex(periodOf(r.date)) + r.remainingMonths - 1;
  }
  return { cost, depreciable, opening, monthly, lastIdx };
}

/**
 * Số trích của tháng `p` (xu), biết đã trích `postedBefore` xu ở các tháng trước trong phần mềm.
 * `taxMonthly`: mức trích cố định mỗi tháng (nếu có) — khi đó không dồn phần còn lại vào tháng cuối.
 */
export function chargeFor(a: DepreciableAsset, p: Period, postedBefore: number, taxMonthly: number | null = null): number {
  if (a.status === 'stopped') return 0;
  if (monthIndex(p) < monthIndex(firstChargePeriod(a))) return 0;
  const pStart = firstDayOf(p);
  const pEnd = lastDayOf(p);
  if (a.startDate > pEnd) return 0;
  if (a.disposedDate && a.disposedDate <= pStart) return 0;
  const e = effectiveAt(a, p);
  const remaining = e.depreciable - e.opening - postedBefore;
  if (remaining <= 0) return 0;

  const from = a.startDate > pStart ? a.startDate : pStart;
  const disposedInMonth = Boolean(a.disposedDate && a.disposedDate <= pEnd);
  const to = disposedInMonth ? addDays(a.disposedDate!, -1) : pEnd;
  const days = dayDiff(from, to) + 1;
  if (days <= 0) return 0;

  const base = taxMonthly ?? e.monthly ?? Math.round(e.depreciable / a.usefulLifeMonths);
  let amount = toDong(days >= daysIn(p) ? base : (base * days) / daysIn(p));
  // Hết thời gian trích (và không ghi giảm giữa tháng): trích nốt phần còn lại.
  if (taxMonthly === null && !disposedInMonth && monthIndex(p) >= e.lastIdx) amount = remaining;
  return Math.min(amount, remaining);
}

/** Số trích dự kiến của các tháng sau `p` (dùng tách phần chờ phân bổ ngắn hạn / dài hạn). */
export function scheduleAfter(a: DepreciableAsset, p: Period, postedThrough: number, months: number): number[] {
  const out: number[] = [];
  let acc = postedThrough;
  for (let i = 1; i <= months; i++) {
    const c = chargeFor(a, fromIndex(monthIndex(p) + i), acc);
    out.push(c);
    acc += c;
  }
  return out;
}

/**
 * Chia số trích của một tháng cho các đoạn chi nhánh (điều chuyển giữa tháng) theo số ngày dùng ở mỗi nơi.
 * `segments`: các mốc [ngày bắt đầu ở chi nhánh, chi nhánh], sắp theo ngày. Trả về [chi nhánh, xu]; phần lẻ dồn đoạn cuối.
 */
export function splitByDays(total: number, p: Period, usedFrom: string, usedTo: string, segments: { from: string; branchId: string }[]): [string, number][] {
  if (segments.length <= 1) return [[segments[0]?.branchId ?? '', total]];
  const parts: [string, number][] = [];
  const totalDays = dayDiff(usedFrom, usedTo) + 1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const segFrom = s.from > usedFrom ? s.from : usedFrom;
    const next = segments[i + 1];
    const segTo = next ? addDays(next.from, -1) : usedTo;
    const end = segTo < usedTo ? segTo : usedTo;
    const days = dayDiff(segFrom, end) + 1;
    if (days > 0) parts.push([s.branchId, days]);
  }
  if (!parts.length || totalDays <= 0) return [[segments[segments.length - 1]!.branchId, total]];
  let left = total;
  return parts.map(([b, d], i) => {
    const v = i === parts.length - 1 ? left : toDong((total * d) / totalDays);
    left -= v;
    return [b, v] as [string, number];
  });
}

/** Chia một số tiền theo tỷ lệ phần trăm; phần lẻ dồn dòng cuối, tròn đồng. */
export function splitByPercent(total: number, percents: number[]): number[] {
  const sum = percents.reduce((s, x) => s + x, 0) || 1;
  let left = total;
  return percents.map((pc, i) => {
    const v = i === percents.length - 1 ? left : toDong((total * pc) / sum);
    left -= v;
    return v;
  });
}
