/**
 * Chặn bán quá tồn (phiếu NT-BH-021, chốt 16/11/2026). Thuần — không đọc CSDL.
 *
 * - Cộng số xuất theo mã, quy về ĐVT nhỏ nhất (SL × hệ số ĐVT); dòng quà / bill Z cũng tính (hàng vẫn ra khỏi kho).
 * - So với tồn KHO MẶC ĐỊNH của cửa hàng (NT-BH-023 Q11, sửa Q5: trước là cả chi nhánh); chi nhánh chưa khai kho → cả chi nhánh.
 * - Mọi mã đều kiểm, kể cả mã không có dòng sổ (tồn 0) (Q8).
 */
// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021 chặn bán quá tồn (đóng góp)

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: kiểm tồn theo mặt hàng × kho — quà ở kho quà KKM, không cộng chung với kho bán (đóng góp)
/** `warehouse` / `gift`: chỉ có khi cửa hàng khai kho quà (NT-BH-028) — dòng thiếu ở kho quà mang gift = true. */
export type StockShort = { sku: string; need: number; have: number; warehouse?: string; gift?: boolean };

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
  const sale = short.filter((s) => !s.gift);
  const gift = short.filter((s) => s.gift);
  const text = (xs: readonly StockShort[]) => xs.map((s) => `${s.sku} cần ${s.need}, tồn ${s.have}${s.warehouse ? ` (kho ${s.warehouse})` : ''}`).join('; ');
  return [
    ...(sale.length ? [`Bán quá tồn: ${text(sale)} ở ${where}`] : []),
    ...(gift.length ? [`Hết quà ở kho quà: ${text(gift)} ở ${where} — bỏ dòng quà (hết quà thì không tặng)`] : []),
  ].join('. ');
}
