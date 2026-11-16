// [2026-11-15 07:05 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: báo giá đổi điểm / voucher cho máy bán, trừ điểm theo lô (đóng góp)
/**
 * Hàm thuần đổi điểm và dùng voucher (không I/O):
 * - quoteRedeem: phần thưởng khách chọn có đổi được không (theo chính sách, hạng, điểm dùng được), cần bao nhiêu điểm, quà gì,
 *   voucher nào sẽ phát (mã định trước theo đơn — máy bán in ngay trên bill).
 * - voucherDiscount: tiền giảm của một voucher trên một đơn (port applyLoyaltyVoucher của máy bán / apply_issued_voucher PHP).
 * - planRedeem: trừ điểm theo lô (hết hạn sớm nhất trước) lúc ghi sổ; thiếu thì trừ phần còn và ghi chú.
 */
import { createHash } from 'node:crypto';
import { roundMoney } from '@bizcity/module-sdk';
import { determineTier, normalizeTiers, rewardsForCustomer, type LoyaltyProgram, type LoyaltyReward } from './engine.js';
import { availableOf, planDeduction, totalEarnedOf, usableLots, type LedgerEntry } from './ledger.js';
import { wallClock } from './settle.js';

export type VoucherSpec = { discountType: 'fixed' | 'percent'; discountValue: number; maxDiscount: number; minOrderAmount: number };
export type IssuedVoucher = VoucherSpec & { code: string; name: string; expiresAt: string | null };
export type QuotedReward = {
  index: string; kind: 'gift' | 'voucher'; points: number; name: string;
  sku?: string; quantity?: number; voucher?: IssuedVoucher;
};

/** Mã voucher định theo đơn + phần thưởng + thứ tự: gửi lại đơn ra đúng mã cũ; máy bán in được trước khi sổ điểm ghi. */
export function voucherCode(prefix: string, orderId: string, index: string, n: number): string {
  return `${prefix}${createHash('sha1').update(`${orderId}|${index}|${n}`).digest('hex').slice(0, 8).toUpperCase()}`;
}

export type QuoteInput = { orderId: string; orderTotal: number; redeem: readonly string[]; storeId: number; now: string };
export type Quote = { tierKey: string; tierName: string; available: number; rewards: QuotedReward[]; points: number; problems: string[] };

export function quoteRedeem(program: LoyaltyProgram, history: readonly LedgerEntry[], q: QuoteInput): Quote {
  const tierKey = determineTier(program.tiers, totalEarnedOf(history));
  const tierName = normalizeTiers(program.tiers).find((t) => t.key === tierKey)?.name ?? tierKey;
  const available = availableOf(history, q.now);
  const problems: string[] = [];
  if (q.redeem.length && !program.settings.enablePosRedeem) problems.push('Cửa hàng chưa bật đổi điểm ở máy bán');
  const list = rewardsForCustomer(program, { storeId: q.storeId, now: wallClock(q.now), orderTotal: q.orderTotal, tierKey, points: available });
  const rewards: QuotedReward[] = [];
  for (const index of q.redeem) {
    const r: LoyaltyReward | undefined = list.find((x) => x.index === index);
    if (!r) { problems.push(`Phần thưởng ${index} không đổi được (hết hạn, sai hạng hoặc đơn chưa đủ điều kiện)`); continue; }
    const n = rewards.filter((x) => x.index === index).length;
    if (r.rewardType === 'voucher' && r.voucher) {
      const days = r.voucher.expiresInDays;
      rewards.push({
        index, kind: 'voucher', points: r.points, name: r.productName,
        voucher: {
          code: voucherCode(r.voucher.prefix, q.orderId, index, n), name: r.productName,
          discountType: r.voucher.discountType === 'percent' ? 'percent' : 'fixed', discountValue: r.voucher.discountValue,
          maxDiscount: r.voucher.maxDiscount, minOrderAmount: r.voucher.minOrderAmount,
          expiresAt: days > 0 ? new Date(Date.parse(q.now) + days * 86_400_000).toISOString() : null,
        },
      });
    } else {
      rewards.push({ index, kind: 'gift', points: r.points, name: r.productName, sku: r.sku, quantity: r.quantity });
    }
  }
  const points = rewards.reduce((t, r) => t + r.points, 0);
  const min = Number(program.settings.minRedeemPoints ?? 0);
  if (points > 0 && min > 0 && available < min) problems.push(`Cần tối thiểu ${min} điểm mới được đổi (khách có ${available})`);
  if (points > available) problems.push(`Không đủ điểm: cần ${points}, khách có ${available} điểm dùng được`);
  return { tierKey, tierName, available, rewards, points, problems };
}

export type VoucherRow = VoucherSpec & { code: string; name: string; partnerCode: string | null; expiresAt: string | null; status: 'active' | 'used'; usedOrderCode?: string | null };

/** Tiền giảm (gồm thuế, đồng) của voucher trên đơn `cartTotal`; chuỗi = lý do không dùng được. */
export function voucherDiscount(v: VoucherRow, ctx: { cartTotal: number; customer?: string; now: string }): number | string {
  if (v.status !== 'active') return `Voucher ${v.code} đã dùng${v.usedOrderCode ? ` ở đơn ${v.usedOrderCode}` : ''}`;
  if (v.expiresAt && Date.parse(ctx.now) > Date.parse(v.expiresAt)) return `Voucher ${v.code} đã hết hạn`;
  const total = Math.max(0, ctx.cartTotal);
  if (v.minOrderAmount > 0 && total < v.minOrderAmount) return `Đơn chưa đạt ${v.minOrderAmount} để dùng voucher ${v.code}`;
  if (v.partnerCode && v.partnerCode !== ctx.customer) return `Voucher ${v.code} thuộc khách khác`;
  let amount = v.discountType === 'percent' ? (total * v.discountValue) / 100 : v.discountValue;
  if (v.discountType === 'percent' && v.maxDiscount > 0) amount = Math.min(amount, v.maxDiscount);
  amount = roundMoney(Math.max(0, Math.min(amount, total)));
  return amount > 0 ? amount : `Voucher ${v.code} chưa đủ điều kiện áp dụng`;
}

export type RedeemPlan = { points: number; allocations: { lotId: string; points: number }[]; note?: string };

/** Trừ `points` điểm theo lô dùng được lúc `now`; không đủ → trừ hết phần còn, ghi chú (hai máy cùng lúc dùng điểm của một khách). */
export function planRedeem(history: readonly LedgerEntry[], points: number, now: string): RedeemPlan | null {
  if (points <= 0) return null;
  const full = planDeduction(history, points, now);
  if (full) return { points, allocations: full };
  const lots = usableLots(history, now);
  const allocations = lots.filter((l) => l.remaining > 0).map((l) => ({ lotId: l.lotId, points: l.remaining }));
  const got = allocations.reduce((t, a) => t + a.points, 0);
  return { points: got, allocations, note: `Khách chỉ còn ${got} điểm lúc ghi sổ, phần đổi cần ${points}` };
}
