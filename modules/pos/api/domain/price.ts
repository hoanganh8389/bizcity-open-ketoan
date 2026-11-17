/**
 * Máy bán bán đúng bảng giá (phiếu NT-BH-022, chốt 17/11/2026). Thuần — không đọc CSDL.
 *
 * - Giá dòng (gồm thuế, trước giảm) phải bằng giá bảng giá cửa hàng của mã × ĐVT (`bizcity_read.branch_prices`), hệ số ĐVT
 *   theo danh mục; lệch → POS_PRICE_CHANGED. Chưa có giá → POS_NO_PRICE.
 * - Thu ngân không giảm tay (Q6 / H3): dòng có manualDiscount → POS_MANUAL_DISCOUNT. Giảm chỉ theo chương trình khuyến mại.
 * - Không cần giá: dòng quà, hàng Nội bộ, dòng 0đ của mã không gửi thuế (bill Z) — như hôm nay.
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022 máy bán bán đúng bảng giá (đóng góp)

export type PriceRow = { price: number | null; ratio: number };
export type PriceIssue = { sku: string; unit: string; price: number | null; ratio: number | null; clientPrice: number; clientRatio: number };
type Line = { lineId: string; sku: string; unitName: string; unitRatio?: number; clientUnitPrice: number; isGift?: boolean; manualDiscount?: { value: number } };
type Item = { variant: string; sendTax: boolean };

export const priceKey = (sku: string, unit: string) => `${sku}|${unit.trim().toLowerCase()}`;
const cents = (n: number) => Math.round(n * 100);

export function checkPrices(lines: readonly Line[], items: ReadonlyMap<string, Item>, prices: ReadonlyMap<string, PriceRow>) {
  const manual: { lineId: string; sku: string }[] = [];
  const noPrice: PriceIssue[] = [];
  const changed: PriceIssue[] = [];
  for (const l of lines) {
    if (l.manualDiscount && l.manualDiscount.value > 0) manual.push({ lineId: l.lineId, sku: l.sku });
    const item = items.get(l.sku);
    if (!item || l.isGift || item.variant === 'internal' || (!item.sendTax && l.clientUnitPrice === 0)) continue;
    const row = prices.get(priceKey(l.sku, l.unitName));
    const base = { sku: l.sku, unit: l.unitName, clientPrice: l.clientUnitPrice, clientRatio: l.unitRatio ?? 1 };
    if (!row || row.price === null) {
      noPrice.push({ ...base, price: null, ratio: row?.ratio ?? null });
      continue;
    }
    if (cents(row.price) !== cents(l.clientUnitPrice) || Math.abs(row.ratio - (l.unitRatio ?? 1)) > 1e-9) changed.push({ ...base, price: row.price, ratio: row.ratio });
  }
  return { manual, noPrice, changed };
}

const vnd = (n: number) => n.toLocaleString('vi-VN');
export function noPriceMessage(xs: readonly PriceIssue[], branch: string) {
  return `Chưa có giá ở ${branch}: ${xs.map((x) => `${x.sku} (${x.unit})`).join(', ')} — báo kế toán khai giá`;
}
export function changedMessage(xs: readonly PriceIssue[]) {
  return `Giá khác bảng giá: ${xs.map((x) => `${x.sku} (${x.unit}) giá bảng giá ${vnd(x.price ?? 0)}${x.ratio !== x.clientRatio ? ` hệ số ${x.ratio}` : ''}, máy gửi ${vnd(x.clientPrice)}${x.ratio !== x.clientRatio ? ` hệ số ${x.clientRatio}` : ''}`).join('; ')} — tải lại giá`;
}
