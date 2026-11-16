// [2026-11-16 10:20 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: nạp số dư điểm cũ từ website, báo cáo (đóng góp)
/**
 * Hàm thuần bước 3:
 * - planOpening: số dư cũ của một khách ở website (tổng đã tích, số dư) → lô tích = tổng đã tích (có hạn) + dòng đổi = phần đã dùng,
 *   để giữ đúng cả số dư lẫn hạng (hạng theo tổng đã tích).
 * - summarize: gom sổ điểm thành báo cáo (phát sinh theo cửa hàng × loại; số dư theo hạng; danh sách khách).
 */
import { determineTier, normalizeTiers, type LoyaltyTier } from './engine.js';
import type { LedgerKind } from './ledger.js';

export type OpeningRow = { customerCode: string; totalEarned: number; balance: number };
export type OpeningPlan = { earn: number; redeem: number; expiresAt: string | null } | { problem: string };

export function planOpening(row: OpeningRow, asOfIso: string, expiresInDays: number): OpeningPlan {
  const total = Number(row.totalEarned);
  const balance = Number(row.balance);
  if (!/^0\d{9}$/.test(row.customerCode)) return { problem: `Mã khách ${row.customerCode} không phải SĐT 10 số` };
  if (!Number.isFinite(total) || !Number.isFinite(balance) || total < 0 || balance < 0) return { problem: `Khách ${row.customerCode}: điểm không được âm` };
  if (balance > total) return { problem: `Khách ${row.customerCode}: số dư ${balance} lớn hơn tổng đã tích ${total}` };
  return {
    earn: total,
    redeem: total - balance,
    expiresAt: expiresInDays > 0 ? new Date(Date.parse(asOfIso) + expiresInDays * 86_400_000).toISOString() : null,
  };
}

export type ReportEntry = { partnerCode: string; kind: LedgerKind; points: number; at: string; branchCode: string | null };

/**
 * Báo cáo kỳ [from, to) (ISO): phát sinh theo cửa hàng × loại trong kỳ; số dư cuối kỳ (mọi dòng tới `to`) theo khách và theo hạng.
 * `entries` là mọi dòng tới `to` (không cần dòng sau kỳ).
 */
export function summarize(entries: readonly ReportEntry[], tiers: readonly LoyaltyTier[], from: string, to: string) {
  const kinds: LedgerKind[] = ['earn', 'redeem', 'expire', 'reverse', 'adjust'];
  const zero = () => Object.fromEntries(kinds.map((k) => [k, 0])) as Record<LedgerKind, number>;
  const byBranch = new Map<string, Record<LedgerKind, number>>();
  const total = zero();
  const people = new Map<string, { balance: number; earned: number; period: Record<LedgerKind, number> }>();
  for (const e of entries) {
    if (e.at >= to) continue;
    const p = people.get(e.partnerCode) ?? { balance: 0, earned: 0, period: zero() };
    p.balance += e.points;
    if (e.kind === 'earn' || e.kind === 'reverse') p.earned += e.points;
    if (e.at >= from) {
      p.period[e.kind] += e.points;
      total[e.kind] += e.points;
      const b = byBranch.get(e.branchCode ?? '') ?? zero();
      b[e.kind] += e.points;
      byBranch.set(e.branchCode ?? '', b);
    }
    people.set(e.partnerCode, p);
  }
  const ordered = normalizeTiers(tiers);
  const customers = [...people.entries()].map(([code, p]) => {
    const tierKey = determineTier(ordered, p.earned);
    return { customerCode: code, balance: p.balance, tierKey, tierName: ordered.find((t) => t.key === tierKey)?.name ?? tierKey, period: p.period };
  }).sort((a, b) => b.balance - a.balance || a.customerCode.localeCompare(b.customerCode));
  const byTier = ordered.map((t) => {
    const list = customers.filter((c) => c.tierKey === t.key);
    return { tierKey: t.key, tierName: t.name, customers: list.length, balance: list.reduce((s, c) => s + c.balance, 0) };
  });
  return {
    from, to, total,
    byBranch: [...byBranch.entries()].map(([branchCode, k]) => ({ branchCode, ...k })).sort((a, b) => a.branchCode.localeCompare(b.branchCode)),
    byTier,
    balance: customers.reduce((s, c) => s + c.balance, 0),
    customers,
  };
}
