// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
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

/** Làm tròn về đồng (dùng cho thuế, tiền hàng ghi sổ). */
export function roundDong(amount: number): number {
  return Math.round(amount);
}

/** So sánh bằng nhau tới xu. */
export function moneyEquals(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}
