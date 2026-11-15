// [2026-11-15 03:30 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: tích theo đơn, hoàn theo phiếu trả, điểm của khách (đóng góp)
/**
 * Hàm thuần của sổ điểm (không I/O): dòng tích của một đơn máy bán, dòng hoàn của một phiếu trả, điểm của khách cho máy bán.
 * Bộ tính chính sách là engine.ts (chép từ máy bán, khớp PHP); luật lô là ledger.ts.
 */
import { calculateEarnPoints, determineTier, expiryDaysOf, nextTier, normalizeTiers, type LoyaltyProgram } from './engine.js';
import { availableOf, balanceOf, expiryFrom, lotsOf, totalEarnedOf, type LedgerEntry } from './ledger.js';
import { floorDiv } from './php.js';

/** Giờ shop dạng "đồng hồ treo tường" (giờ Việt Nam), unix giây — cách máy bán và website so ngày chương trình. */
export const wallClock = (iso: string) => Math.floor((Date.parse(iso) + 7 * 3600_000) / 1000);

type SnapLine = { sku: string; unitQty: number; unitRatio?: number; isGift?: boolean };
/** Phần cần của bản chụp đơn máy bán (sự kiện pos.order.recorded). */
export type OrderSnap = {
  id: string; code: string; status: string; total: number; createdAt: string;
  customer?: { id?: string; name?: string; phone?: string };
  lines?: SnapLine[];
};

export type EarnPlan = { points: number; expiresAt: string | null; meta: Record<string, unknown> };

/**
 * Điểm tích của một đơn: chỉ đơn hoàn tất có khách; hạng tính theo tổng điểm đã tích TRƯỚC đơn. Dòng quà và bill Z không tính
 * (máy bán cũng bỏ). 0 điểm → null (không ghi dòng).
 */
export function planEarn(program: LoyaltyProgram, storeId: number, history: readonly LedgerEntry[], order: OrderSnap): EarnPlan | null {
  if (order.status !== 'completed' || !order.customer?.id || !program.settings.enablePosEarn) return null;
  const tierKey = determineTier(program.tiers, totalEarnedOf(history));
  const items = (order.lines ?? []).filter((l) => !l.isGift).map((l) => ({ sku: l.sku, qty: Number(l.unitQty) * Number(l.unitRatio ?? 1) }));
  const earn = calculateEarnPoints(program, { storeId, now: wallClock(order.createdAt), orderTotal: Number(order.total), tierKey, items });
  if (earn.totalPoints <= 0) return null;
  const days = expiryDaysOf(program, earn);
  return {
    points: earn.totalPoints,
    expiresAt: days > 0 ? expiryFrom(order.createdAt, days) : null,
    meta: { orderTotal: Number(order.total), tierKey, multiplier: earn.multiplier, details: earn.details.map((d) => ({ policyCode: d.policyCode, points: d.points })) },
  };
}

export type ReversePlan = { points: number; allocations: { lotId: string; points: number }[]; note?: string; meta: Record<string, unknown> };

/**
 * Hoàn điểm khi trả hàng: điểm đã tích của đơn × tiền trả / tổng đơn, làm tròn xuống; trừ lô của chính đơn đó trước, thiếu thì
 * trừ lô khác (hết hạn sớm nhất trước). Không để số dư âm: còn ít hơn thì trừ hết phần còn và ghi chú. 0 → null.
 */
export function planReverse(history: readonly LedgerEntry[], earn: LedgerEntry & { meta?: { orderTotal?: number } }, refundTotal: number, returnedBefore: number, now: string): ReversePlan | null {
  const orderTotal = Number(earn.meta?.orderTotal ?? 0);
  if (orderTotal <= 0 || earn.points <= 0 || refundTotal <= 0) return null;
  // Phần đã hoàn ở các phiếu trả trước (cộng dồn) — tính trên tổng tiền trả để không lệch do làm tròn từng phiếu.
  const share = (paid: number) => floorDiv(earn.points * Math.min(orderTotal, paid), orderTotal);
  const due = Math.min(earn.points, share(returnedBefore + refundTotal)) - share(returnedBefore);
  if (due <= 0) return null;
  const lots = lotsOf(history).filter((l) => l.remaining > 0);
  const own = lots.filter((l) => l.lotId === earn.id);
  const others = lots.filter((l) => l.lotId !== earn.id && (l.expiresAt === null || l.expiresAt > now))
    .sort((a, b) => (a.expiresAt ?? '9999') .localeCompare(b.expiresAt ?? '9999'));
  const allocations: { lotId: string; points: number }[] = [];
  let left = due;
  for (const l of [...own, ...others]) {
    if (left <= 0) break;
    const take = Math.min(left, l.remaining);
    allocations.push({ lotId: l.lotId, points: take });
    left -= take;
  }
  const points = due - left;
  if (points <= 0) return { points: 0, allocations: [], note: `Khách không còn điểm để hoàn (phải hoàn ${due})`, meta: { due, refundTotal, orderTotal } };
  return { points, allocations, ...(left > 0 ? { note: `Khách chỉ còn ${points} điểm, phải hoàn ${due}` } : {}), meta: { due, refundTotal, orderTotal } };
}

/** Điểm của khách cho máy bán (khuôn CustomerLoyalty của hợp đồng /pos/*). */
export function customerLoyalty(program: Pick<LoyaltyProgram, 'tiers'> | null, customerId: string, entries: readonly LedgerEntry[], now: string) {
  const tiers = normalizeTiers(program?.tiers ?? []);
  const totalEarned = totalEarnedOf(entries);
  const tierKey = determineTier(tiers, totalEarned);
  const next = nextTier(tiers, tierKey, totalEarned);
  const soon = new Date(Date.parse(now) + 30 * 86_400_000).toISOString();
  const expiring = lotsOf(entries).filter((l) => l.remaining > 0 && l.expiresAt && l.expiresAt > now && l.expiresAt <= soon)
    .sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!));
  return {
    customerId,
    balance: balanceOf(entries),
    available: availableOf(entries, now),
    totalEarned,
    tierKey,
    tierName: tiers.find((t) => t.key === tierKey)?.name ?? tierKey,
    nextTierName: next.tier?.name ?? null,
    pointsToNext: next.pointsToNext,
    ...(expiring.length ? { expiringSoon: { points: expiring.filter((l) => l.expiresAt === expiring[0]!.expiresAt).reduce((t, l) => t + l.remaining, 0), at: expiring[0]!.expiresAt! } } : {}),
    lots: lotsOf(entries),
    history: [...entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50),
    vouchers: [] as unknown[],
  };
}
