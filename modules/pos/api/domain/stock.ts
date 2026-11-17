/**
 * Chặn bán quá tồn (phiếu NT-BH-021, chốt 16/11/2026). Thuần — không đọc CSDL.
 *
 * - Cộng số xuất theo mã, quy về ĐVT nhỏ nhất (SL × hệ số ĐVT); dòng quà / bill Z cũng tính (hàng vẫn ra khỏi kho).
 * - Mỗi cửa hàng một kho chứa toàn bộ hàng (Q5) → so với tồn cả chi nhánh.
 * - Mọi mã đều kiểm, kể cả mã không có dòng sổ (tồn 0) (Q8).
 */
// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021 chặn bán quá tồn (đóng góp)

export type StockShort = { sku: string; need: number; have: number };

/** Làm tròn 4 chữ số như sổ kho (tránh 0.1 + 0.2). */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Số cần xuất theo mã (ĐVT nhỏ nhất). */
export function stockNeeds(lines: readonly { sku: string; qty: number }[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    need.set(l.sku, r4((need.get(l.sku) ?? 0) + l.qty));
  }
  return need;
}

/** Mã thiếu tồn, theo thứ tự mã. `have` thiếu mã = 0. */
export function stockShortages(need: ReadonlyMap<string, number>, have: ReadonlyMap<string, number>): StockShort[] {
  return [...need.entries()]
    .map(([sku, n]) => ({ sku, need: n, have: r4(have.get(sku) ?? 0) }))
    .filter((x) => x.need > x.have)
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Câu báo lỗi: "11005100103 cần 7, tồn 5 ở CN01". */
export function stockShortMessage(short: readonly StockShort[], where: string): string {
  return `Bán quá tồn: ${short.map((s) => `${s.sku} cần ${s.need}, tồn ${s.have}`).join('; ')} ở ${where}`;
}
