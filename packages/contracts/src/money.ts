// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-11-06 06:02 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-19: roundMoney (nửa xa số 0), allocate (dư lớn nhất, Σ = tổng), schedule (lịch đều, kỳ cuối nhận dư) — R-MONEY-1..6, tài liệu PHASE-030 · 18; roundDong đánh dấu @deprecated.
/**
 * Quy ước tiền.
 *
 * - Tiền Việt Nam ghi sổ tròn đồng; lưu ở PostgreSQL kiểu numeric(18,2).
 * - Khi trao đổi qua JSON, số tiền là number (đồng). Không gửi chuỗi định dạng.
 * - Không cộng trừ số thực trực tiếp nhiều lần: dùng các hàm dưới, làm việc trên
 *   đơn vị "xu" (1/100 đồng) bằng số nguyên rồi đổi lại.
 */

const SCALE = 100;

/** Đổi đồng → xu (số nguyên) để cộng trừ không sai số. */
export function toCents(amount: number): number {
  return Math.round(amount * SCALE);
}

/** Đổi xu → đồng. */
export function fromCents(cents: number): number {
  return cents / SCALE;
}

/** Cộng một dãy số tiền chính xác tới xu. */
export function sumMoney(values: readonly number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

/**
 * Làm tròn về đồng.
 * @deprecated dùng `roundMoney` (nửa xa số 0, R-MONEY-2): `Math.round` làm tròn −2,5 thành −2 nhưng 2,5 thành 3, lệch đối xứng.
 * Giữ nguyên hành vi cho tới khi chẩn đoán xác nhận không có số tiền ,5 âm trên sổ (PHASE-030 · 18 §5).
 */
export function roundDong(amount: number): number {
  return Math.round(amount);
}

/** So sánh bằng nhau tới xu. */
export function moneyEquals(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

// ── Làm tròn và chia tiền (PHASE-030 · 18, R-MONEY-1..6) ──────────────────────────────────────────────────────────────────
// Mỗi việc đúng một hàm. Tính bằng `number` an toàn tới 2^53 (≈ 9 triệu tỷ đồng); vượt mức đó phải chuyển sang bigint.

/**
 * Làm tròn nửa xa số 0 về bội số của `unit` (R-MONEY-2): `roundMoney(2.5) = 3`, `roundMoney(-2.5) = -3`,
 * `roundMoney(1_234_567, 1000) = 1_235_000`. Khác `Math.round` (−2,5 → −2) và `round()` của Python (về chẵn: 2,5 → 2).
 */
export function roundMoney(amount: number, unit = 1): number {
  const r = Math.floor(Math.abs(amount) / unit + 0.5) * unit;
  return amount < 0 ? -r : r;
}

/**
 * Chia `total` (số nguyên) theo `weights` (≥ 0), bước `unit` (R-MONEY-3): phương pháp dư lớn nhất, Σ phần = `total` tuyệt đối.
 * - Phần nguyên mỗi dòng `⌊bước · wᵢ / Σw⌋`; phần dư chia mỗi dòng +1 bước theo phần lẻ lớn → nhỏ, hoà thì **dòng đứng trước** (R-MONEY-5).
 * - Phần lẻ dưới một bước (`|total| mod unit`) cộng vào dòng đầu tiên trong thứ tự nhận dư.
 * - Đối xứng dấu: chia −100 là đảo dấu của chia 100.
 * - Trọng số toàn 0 → coi như bằng nhau; dòng trọng số 0 nhận 0 khi còn dòng dương.
 * - Đầu vào sai thì ném `RangeError`, không đoán (R-MONEY-6): tổng không nguyên, trọng số âm / không hữu hạn, không có dòng mà tổng ≠ 0.
 */
export function allocate(total: number, weights: readonly number[], opts: { unit?: number } = {}): number[] {
  const unit = opts.unit ?? 1;
  if (!Number.isSafeInteger(total)) throw new RangeError('allocate: total phải là số nguyên');
  if (!Number.isSafeInteger(unit) || unit < 1) throw new RangeError('allocate: unit phải là số nguyên ≥ 1');
  if (weights.length === 0) {
    if (total !== 0) throw new RangeError('allocate: không có dòng để chia');
    return [];
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError('allocate: trọng số phải ≥ 0');
  const w = weights.every((x) => x === 0) ? weights.map(() => 1) : weights;
  const W = w.reduce((s, x) => s + x, 0);
  const abs = Math.abs(total);
  const units = Math.floor(abs / unit);
  const tail = abs - units * unit;
  const raw = w.map((x) => (units * x) / W);
  const out = raw.map(Math.floor);
  const order = w.map((_, i) => i).filter((i) => w[i]! > 0)
    .sort((i, j) => (raw[j]! - out[j]!) - (raw[i]! - out[i]!) || i - j);
  for (let k = 0, rest = units - out.reduce((s, x) => s + x, 0); rest > 0; k++, rest--) out[order[k % order.length]!]! += 1;
  const res = out.map((x) => x * unit);
  res[order[0]!]! += tail;
  return res.map((x) => (total < 0 ? -x : x) + 0);
}

/**
 * Lịch đều theo kỳ, kỳ cuối nhận phần còn lại (R-MONEY-4): khấu hao, phân bổ trả trước, trả góp (TT45 khấu hao theo ngày).
 * - `monthly = roundMoney(total / periods, unit)`.
 * - Kỳ đầu lẻ ngày (`firstDays < daysInFirstMonth`) = `roundMoney(monthly · firstDays / daysInFirstMonth, unit)`; khi đó lịch có `periods + 1` kỳ.
 * - Các kỳ giữa = `monthly` (tối thiểu 1, không quá phần còn lại); **kỳ cuối = phần còn lại**, nên Σ kỳ = `total`.
 */
export function schedule(
  total: number,
  periods: number,
  opts: { firstDays?: number; daysInFirstMonth?: number; unit?: number } = {},
): number[] {
  const unit = opts.unit ?? 1;
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('schedule: total phải là số nguyên ≥ 0');
  if (!Number.isInteger(periods) || periods < 1) throw new RangeError('schedule: periods phải ≥ 1');
  const partial = opts.firstDays != null && opts.daysInFirstMonth != null && opts.firstDays < opts.daysInFirstMonth;
  const count = periods + (partial ? 1 : 0);
  const monthly = roundMoney(total / periods, unit);
  const out: number[] = [];
  let remaining = total;
  for (let i = 0; i < count && remaining > 0; i++) {
    let amount = i === 0 && partial ? roundMoney((monthly * opts.firstDays!) / opts.daysInFirstMonth!, unit) : monthly;
    amount = i === count - 1 ? remaining : Math.min(Math.max(amount, 1), remaining);
    out.push(amount);
    remaining -= amount;
  }
  return out;
}
