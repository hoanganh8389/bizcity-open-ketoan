/**
 * Báo cáo khách hàng (phiếu NT-BH-034 §2 B; ERP Report e, Report g) — hàm thuần, không đọc CSDL. Gộp từng lần mua (đơn máy bán, phiếu bán
 * BH10) và lần trả thành dòng khách × kỳ × cửa hàng: số đơn, tiền hàng, giảm giá, thực trả, trả hàng, voucher, điểm tích / đổi, quà (số lượng,
 * giá trị theo giá bán). Tiền gồm thuế, cộng bằng roundMoney (đồng). Báo cáo nội bộ: không lên sổ.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: gộp báo cáo khách hàng (đơn máy bán + phiếu BH10, voucher, điểm, quà) (đóng góp)
import { roundMoney } from '@bizcity/module-sdk';

export type PurchaseLine = {
  sku: string; name: string; unit: string; qty: number; unitPrice: number; discount: number; amount: number; isGift: boolean; promo: string | null;
  /** Giá trị quà theo giá bán (chỉ dòng quà; null = chưa có giá bán). */
  giftValue?: number | null;
};
export type PurchaseVoucher = { code: string; campaignName: string; amount: number };
export type Purchase = {
  source: 'pos' | 'phieu-ban'; kind: 'sale' | 'return'; refId: string; refCode: string; date: string; branchCode: string; channel: string;
  customerCode: string; customerName: string; phone: string;
  /** Tiền hàng trước giảm (dòng không phải quà), gồm thuế. */
  goods: number;
  /** Giảm giá (khuyến mại, voucher TGS, giảm tay) = tiền hàng − thành tiền dòng hàng. */
  discount: number;
  /** Thực trả của lần mua (khách phải trả, gồm thuế); lần trả = 0. */
  total: number;
  /** Tiền trả hàng (lần trả); lần mua = 0. */
  returns: number;
  originalCode?: string | null;
  vouchers: PurchaseVoucher[];
  pointsEarned: number;
  pointsRedeemed: number;
  lines: PurchaseLine[];
};

export const RETAIL_NAME = 'Khách lẻ';

/** Dòng 0đ (quà theo chương trình, quà đổi điểm, hàng bill Z 0đ) tính là quà. */
export const isGiftLine = (l: { isGift?: boolean; amount: number; qty: number; unitPrice: number }) => Boolean(l.isGift) || (l.amount === 0 && l.unitPrice * l.qty === 0);

/** Gắn giá trị quà theo giá bán (`priceOf(sku, ĐVT)` gồm thuế; không có giá → đơn giá trên dòng nếu > 0, không thì null). */
export function withGiftValues(lines: PurchaseLine[], priceOf: (sku: string, unit: string) => number | null): PurchaseLine[] {
  return lines.map((l) => {
    if (!l.isGift) return l;
    const p = priceOf(l.sku, l.unit) ?? (l.unitPrice > 0 ? l.unitPrice : null);
    return { ...l, giftValue: p === null ? null : roundMoney(p * l.qty) };
  });
}

export type CustomerRow = {
  customerCode: string; customerName: string; phone: string; branchCode: string; period: string;
  orders: number; posOrders: number; phieuBanDocs: number; goods: number; discount: number; net: number; returns: number; netAfterReturns: number;
  voucherCount: number; voucherAmount: number; pointsEarned: number; pointsRedeemed: number; giftQty: number; giftValue: number;
  /** Mọi cửa hàng khách đã mua trong kỳ báo cáo (không chỉ cửa hàng của dòng). */
  shops: string;
};

const add = (a: number, b: number) => roundMoney(a + b);
const addQty = (a: number, b: number) => Math.round((a + b) * 10_000) / 10_000;

/** Kỳ của một lần mua: cả khoảng (`from..to`) hoặc theo tháng (YYYY-MM). */
export const periodOf = (date: string, by: 'range' | 'month', range: { from: string; to: string }) => (by === 'month' ? date.slice(0, 7) : `${range.from}..${range.to}`);

/** Gộp lần mua / trả thành dòng khách × kỳ × cửa hàng, xếp theo thực trả giảm dần rồi tên khách. */
export function customerReport(list: readonly Purchase[], opt: { groupBy: 'range' | 'month'; from: string; to: string }): CustomerRow[] {
  const rows = new Map<string, CustomerRow>();
  const shops = new Map<string, Set<string>>();
  for (const p of list) {
    const key = `${p.customerCode}|${periodOf(p.date, opt.groupBy, opt)}|${p.branchCode}`;
    let r = rows.get(key);
    if (!r) {
      r = {
        customerCode: p.customerCode, customerName: p.customerName || (p.customerCode ? '' : RETAIL_NAME), phone: p.phone, branchCode: p.branchCode,
        period: periodOf(p.date, opt.groupBy, opt), orders: 0, posOrders: 0, phieuBanDocs: 0, goods: 0, discount: 0, net: 0, returns: 0, netAfterReturns: 0,
        voucherCount: 0, voucherAmount: 0, pointsEarned: 0, pointsRedeemed: 0, giftQty: 0, giftValue: 0, shops: '',
      };
      rows.set(key, r);
    }
    if (!r.customerName && p.customerName) r.customerName = p.customerName;
    if (!r.phone && p.phone) r.phone = p.phone;
    if (p.kind === 'sale') {
      r.orders += 1;
      if (p.source === 'pos') r.posOrders += 1; else r.phieuBanDocs += 1;
      r.goods = add(r.goods, p.goods);
      r.discount = add(r.discount, p.discount);
      r.net = add(r.net, p.total);
      const s = shops.get(p.customerCode) ?? new Set<string>();
      s.add(p.branchCode);
      shops.set(p.customerCode, s);
    } else {
      r.returns = add(r.returns, p.returns);
    }
    r.voucherCount += p.vouchers.length;
    r.voucherAmount = add(r.voucherAmount, p.vouchers.reduce((t, v) => add(t, v.amount), 0));
    r.pointsEarned = addQty(r.pointsEarned, p.pointsEarned);
    r.pointsRedeemed = addQty(r.pointsRedeemed, p.pointsRedeemed);
    if (p.kind === 'sale') {
      for (const l of p.lines) {
        if (!l.isGift) continue;
        r.giftQty = addQty(r.giftQty, l.qty);
        r.giftValue = add(r.giftValue, l.giftValue ?? 0);
      }
    }
    r.netAfterReturns = roundMoney(r.net - r.returns);
  }
  const out = [...rows.values()].map((r) => ({ ...r, shops: [...(shops.get(r.customerCode) ?? [])].sort().join(', ') }));
  return out.sort((a, b) => b.net - a.net || a.customerName.localeCompare(b.customerName, 'vi') || a.branchCode.localeCompare(b.branchCode) || a.period.localeCompare(b.period));
}

/** Tổng cả báo cáo (dòng tổng của màn). */
export function customerTotals(rows: readonly CustomerRow[]) {
  const t = { customers: new Set(rows.map((r) => r.customerCode)).size, orders: 0, goods: 0, discount: 0, net: 0, returns: 0, netAfterReturns: 0, voucherAmount: 0, pointsEarned: 0, pointsRedeemed: 0, giftQty: 0, giftValue: 0 };
  for (const r of rows) {
    t.orders += r.orders;
    t.goods = add(t.goods, r.goods); t.discount = add(t.discount, r.discount); t.net = add(t.net, r.net); t.returns = add(t.returns, r.returns);
    t.netAfterReturns = add(t.netAfterReturns, r.netAfterReturns); t.voucherAmount = add(t.voucherAmount, r.voucherAmount);
    t.pointsEarned = addQty(t.pointsEarned, r.pointsEarned); t.pointsRedeemed = addQty(t.pointsRedeemed, r.pointsRedeemed);
    t.giftQty = addQty(t.giftQty, r.giftQty); t.giftValue = add(t.giftValue, r.giftValue);
  }
  return t;
}
