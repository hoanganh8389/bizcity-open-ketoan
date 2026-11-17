/**
 * Voucher TGS / hãng trên phiếu bán nhập tay BH10 (phiếu NT-BH-026) — hàm thuần. Module voucher đã kiểm từng mã (voucher.order.quote); ở đây
 * tính tiền thực trừ lúc duyệt, trên phiếu đã tính (tiền dòng chưa thuế):
 * - voucher TGS = chiết khấu trên dòng (giảm doanh thu + thuế): tiền voucher (gồm thuế) chia theo thành tiền gồm thuế của dòng áp dụng, đổi
 *   ra chiết khấu chưa thuế từng dòng (thuế tính lại theo dòng — lệch làm tròn tối đa 1đ mỗi dòng so với tiền voucher);
 * - voucher hãng = dòng thanh toán theo hình thức kế toán khai (doanh thu đủ, phải thu hãng), tối đa phần còn phải trả;
 * - trừ sau khuyến mại; voucher TGS trước, hãng sau; mỗi mã tối đa mệnh giá, phần dư mất; mã không còn gì để trừ → báo.
 * Bỏ duyệt: gỡ phần voucher khỏi phiếu (stripVouchers) — duyệt lại tính lại từ đầu.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher trên phiếu bán nhập tay (đóng góp)
import { allocate, roundMoney } from '@bizcity/module-sdk';
import type { Body } from './doc.js';

export type QuotedVoucher = {
  code: string; campaignId: string; campaignName: string; issuer: 'tgs' | 'brand'; faceValue: number; paymentMethodCode: string | null; applicableSkus: string[] | null;
};
export type AppliedVoucher = { code: string; campaignId: string; campaignName: string; issuer: 'tgs' | 'brand'; kind: 'discount' | 'payment'; faceValue: number; amount: number; methodCode?: string };

type VLine = Body['lines'][number] & { voucherDiscount?: number; beforeVoucher?: { discount: number; amountBeforeTax: number; taxAmount: number } };
type VPay = Body['payments'][number] & { voucherCode?: string };
export type VoucherBody = Omit<Body, 'lines' | 'payments'> & { lines: VLine[]; payments: VPay[]; voucherCodes?: string[]; vouchers?: AppliedVoucher[] };

/** Gỡ phần voucher đã áp (chiết khấu do voucher, dòng thanh toán voucher hãng) — phiếu về như lúc lập. */
export function stripVouchers<B extends VoucherBody>(b: B): B {
  if (!b.vouchers?.length) return b;
  const lines = b.lines.map(({ voucherDiscount: _d, beforeVoucher, ...l }) => (beforeVoucher ? { ...l, ...beforeVoucher } : l));
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const { vouchers: _v, ...rest } = b;
  return { ...rest, lines, payments: b.payments.filter((p) => !p.voucherCode), totals: { beforeTax, tax, total: beforeTax + tax } } as unknown as B;
}

/** Áp voucher lên phiếu đã tính. `rates`: thuế suất theo mã thuế. Trả phiếu mới (tổng tính lại) hoặc lỗi theo mã. */
export function applyVouchers(b: VoucherBody, vouchers: readonly QuotedVoucher[], rates: ReadonlyMap<string, number>):
  { body: VoucherBody } | { problem: { code: string; reason: 'VOUCHER_NO_ROOM' | 'VOUCHER_PAYMENT_METHOD'; message: string } } {
  const lines: VLine[] = b.lines.map((l) => ({ ...l }));
  const rate = (l: VLine) => rates.get(l.taxCode) ?? 0;
  const gross = (l: VLine) => (l.isGift ? 0 : l.amountBeforeTax + l.taxAmount);
  const applied: AppliedVoucher[] = [];
  for (const v of vouchers.filter((x) => x.issuer === 'tgs')) {
    const idx = lines.map((_, i) => i).filter((i) => gross(lines[i]!) > 0 && (v.applicableSkus === null || v.applicableSkus.includes(lines[i]!.sku)));
    const room = idx.reduce((t, i) => t + gross(lines[i]!), 0);
    const amount = Math.min(v.faceValue, room);
    if (amount <= 0) return { problem: { code: v.code, reason: 'VOUCHER_NO_ROOM', message: `Voucher ${v.code}: phiếu không còn tiền để trừ — bỏ bớt voucher` } };
    const parts = allocate(amount, idx.map((i) => gross(lines[i]!)));
    idx.forEach((i, k) => {
      const l = lines[i]!;
      const r = rate(l);
      const bt = roundMoney((gross(l) - parts[k]!) / (1 + r / 100));
      const extra = roundMoney(l.amountBeforeTax - bt);
      const beforeVoucher = l.beforeVoucher ?? { discount: l.discount, amountBeforeTax: l.amountBeforeTax, taxAmount: l.taxAmount };
      lines[i] = { ...l, beforeVoucher, discount: roundMoney(l.discount + extra), voucherDiscount: roundMoney((l.voucherDiscount ?? 0) + extra), amountBeforeTax: bt, taxAmount: roundMoney(bt * r / 100) };
    });
    applied.push({ code: v.code, campaignId: v.campaignId, campaignName: v.campaignName, issuer: 'tgs', kind: 'discount', faceValue: v.faceValue, amount });
  }
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const total = beforeTax + tax;
  const payments: VPay[] = [...b.payments];
  let due = total - payments.reduce((s, p) => s + p.amount, 0);
  for (const v of vouchers.filter((x) => x.issuer === 'brand')) {
    if (!v.paymentMethodCode) return { problem: { code: v.code, reason: 'VOUCHER_PAYMENT_METHOD', message: `Voucher hãng ${v.code} chưa có hình thức thanh toán` } };
    const scope = v.applicableSkus === null ? due : lines.filter((l) => v.applicableSkus!.includes(l.sku)).reduce((t, l) => t + gross(l), 0);
    const amount = Math.min(v.faceValue, due, scope);
    if (amount <= 0) return { problem: { code: v.code, reason: 'VOUCHER_NO_ROOM', message: `Voucher ${v.code}: phiếu không còn tiền phải thu để trừ — bỏ bớt voucher hoặc giảm tiền thu` } };
    due -= amount;
    payments.push({ methodCode: v.paymentMethodCode, amount, reference: `Voucher ${v.code}`, voucherCode: v.code });
    applied.push({ code: v.code, campaignId: v.campaignId, campaignName: v.campaignName, issuer: 'brand', kind: 'payment', faceValue: v.faceValue, amount, methodCode: v.paymentMethodCode });
  }
  return { body: { ...b, lines, payments, totals: { beforeTax, tax, total }, vouchers: applied } };
}
