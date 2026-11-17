/**
 * Voucher TGS / hãng trên đơn máy bán (phiếu NT-BH-026) — hàm thuần. Module voucher đã kiểm từng mã (voucher.order.quote: của khách, chưa
 * dùng, còn hạn, đơn tối thiểu, giỏ có sản phẩm / nhãn áp dụng); ở đây tính tiền thực trừ trên đơn:
 * - trừ SAU khuyến mại (và voucher đổi điểm); voucher TGS trước (chiết khấu chia vào dòng theo thành tiền — giảm doanh thu + thuế), rồi
 *   voucher hãng (dòng thanh toán theo hình thức kế toán khai — doanh thu đủ, phải thu hãng);
 * - mỗi mã trừ tối đa mệnh giá, tối đa phần còn phải trả (loại lần mua sau: tối đa tiền các dòng áp dụng); phần dư mất;
 * - mã không còn gì để trừ (đơn đã trừ hết) → báo, không để khách mất mã vô ích.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher TGS / hãng trên đơn máy bán (đóng góp)
import { allocate } from '@bizcity/module-sdk';

export type QuotedVoucher = {
  code: string; campaignId: string; campaignName: string; issuer: 'tgs' | 'brand'; faceValue: number; paymentMethodCode: string | null;
  /** Mã hàng trong giỏ được trừ (loại lần mua sau); null = cả đơn. */
  applicableSkus: string[] | null;
};
export type VoucherUse = { code: string; campaignId: string; campaignName: string; issuer: 'tgs' | 'brand'; kind: 'discount' | 'payment'; faceValue: number; amount: number; methodCode?: string };

type Line = { sku: string; gross: number; paid: boolean };

/**
 * Tiền trừ của từng voucher TGS và phần chia vào dòng (theo thứ tự `lines`). `lines[i].gross`: thành tiền gồm thuế sau khuyến mại.
 * Trả `shares[i]` = tổng tiền voucher TGS chia vào dòng i.
 */
export function planDiscounts(lines: readonly Line[], vouchers: readonly QuotedVoucher[]): { uses: VoucherUse[]; shares: number[] } | { problem: { code: string; message: string } } {
  const left = lines.map((l) => (l.paid ? l.gross : 0));
  const shares = lines.map(() => 0);
  const uses: VoucherUse[] = [];
  for (const v of vouchers.filter((x) => x.issuer === 'tgs')) {
    const idx = lines.map((l, i) => i).filter((i) => left[i]! > 0 && (v.applicableSkus === null || v.applicableSkus.includes(lines[i]!.sku)));
    const room = idx.reduce((t, i) => t + left[i]!, 0);
    const amount = Math.min(v.faceValue, room);
    if (amount <= 0) return { problem: { code: v.code, message: `Voucher ${v.code}: đơn không còn tiền ${v.applicableSkus ? 'ở dòng áp dụng ' : ''}để trừ — bỏ bớt voucher` } };
    const part = allocate(amount, idx.map((i) => left[i]!));
    idx.forEach((i, k) => { shares[i] = (shares[i] ?? 0) + part[k]!; left[i] = (left[i] ?? 0) - part[k]!; });
    uses.push({ code: v.code, campaignId: v.campaignId, campaignName: v.campaignName, issuer: 'tgs', kind: 'discount', faceValue: v.faceValue, amount });
  }
  return { uses, shares };
}

/** Tiền trừ của từng voucher hãng (dòng thanh toán) trên đơn đã trừ voucher TGS. `lines[i].gross`: thành tiền sau mọi chiết khấu. */
export function planPayments(lines: readonly Line[], total: number, vouchers: readonly QuotedVoucher[]): { uses: VoucherUse[] } | { problem: { code: string; message: string } } {
  let due = total;
  const uses: VoucherUse[] = [];
  for (const v of vouchers.filter((x) => x.issuer === 'brand')) {
    const scope = v.applicableSkus === null ? due : lines.filter((l) => l.paid && v.applicableSkus!.includes(l.sku)).reduce((t, l) => t + l.gross, 0);
    const amount = Math.min(v.faceValue, due, scope);
    if (amount <= 0) return { problem: { code: v.code, message: `Voucher ${v.code}: đơn không còn tiền phải trả để trừ — bỏ bớt voucher` } };
    if (!v.paymentMethodCode) return { problem: { code: v.code, message: `Voucher hãng ${v.code} chưa có hình thức thanh toán` } };
    due -= amount;
    uses.push({ code: v.code, campaignId: v.campaignId, campaignName: v.campaignName, issuer: 'brand', kind: 'payment', faceValue: v.faceValue, amount, methodCode: v.paymentMethodCode });
  }
  return { uses };
}
