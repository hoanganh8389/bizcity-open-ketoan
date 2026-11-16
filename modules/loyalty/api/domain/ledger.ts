// [2026-11-15 03:20 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: chép nguyên từ tgs_pos_react/packages/pos-core (khớp engine PHP 14 chính sách × 400 đơn); sửa ở hai nơi phải sửa cùng (đóng góp)
// Sổ điểm thành viên (Q5, chốt 02/11): MỖI lần điểm đổi là một dòng, không sửa / xoá — số dư = tổng các dòng. Lần tích
// là một "lô" có hạn dùng; đổi điểm trừ lô HẾT HẠN SỚM NHẤT trước (lô không hạn dùng sau cùng); hết hạn sinh dòng
// expire cho đúng phần còn lại của lô. Đây là luật cho bảng sổ điểm ở phần mềm kế toán (docs 19) — fake API và module
// pos dùng chung. POS cũ (ví WP) chỉ giữ một con số số dư, không có lô / hạn dùng.

export type LedgerKind = 'earn' | 'redeem' | 'expire' | 'adjust' | 'reverse'

export type LedgerEntry = {
  id: string
  kind: LedgerKind
  /** Có dấu: tích / điều chỉnh tăng > 0; đổi / hết hạn / trả lại khi hoàn hàng < 0. */
  points: number
  /** ISO thời điểm ghi. */
  at: string
  /** Chỉ dòng earn (và adjust > 0): hết hạn lúc nào; null = không hết hạn. */
  expiresAt?: string | null
  /** Dòng âm trừ vào những lô nào (id dòng earn / adjust) — để biết lô còn bao nhiêu và lô nào hết hạn bao nhiêu. */
  allocations?: { lotId: string; points: number }[]
  /** Chứng từ gốc: đơn bán / phiếu hoàn / điều chỉnh tay. */
  ref?: { type: 'order' | 'return' | 'manual'; id: string; code?: string }
  note?: string
}

export type PointLot = { lotId: string; earnedAt: string; expiresAt: string | null; points: number; remaining: number }

export function balanceOf(entries: readonly LedgerEntry[]): number {
  return round2(entries.reduce((t, e) => t + e.points, 0))
}

/** Tổng điểm đã tích (xếp hạng theo con số này, không theo số dư). Trả lại khi hoàn hàng trừ vào đây. */
export function totalEarnedOf(entries: readonly LedgerEntry[]): number {
  return round2(entries.reduce((t, e) => t + (e.kind === 'earn' ? e.points : e.kind === 'reverse' ? e.points : 0), 0))
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Các lô và phần còn lại (sau mọi dòng âm đã phân bổ). */
export function lotsOf(entries: readonly LedgerEntry[]): PointLot[] {
  const lots = new Map<string, PointLot>()
  for (const e of entries) {
    if (e.points > 0) lots.set(e.id, { lotId: e.id, earnedAt: e.at, expiresAt: e.expiresAt ?? null, points: e.points, remaining: e.points })
  }
  for (const e of entries) {
    for (const a of e.allocations ?? []) {
      const lot = lots.get(a.lotId)
      if (lot) lot.remaining = round2(lot.remaining - a.points)
    }
  }
  return [...lots.values()]
}

/** Lô còn dùng được lúc `now`, theo thứ tự trừ: hết hạn sớm nhất trước, không hạn dùng sau cùng, rồi lô cũ trước. */
export function usableLots(entries: readonly LedgerEntry[], now: string): PointLot[] {
  return lotsOf(entries)
    .filter((l) => l.remaining > 0 && (l.expiresAt === null || l.expiresAt > now))
    .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') || a.earnedAt.localeCompare(b.earnedAt))
}

/** Số điểm dùng được lúc `now` (số dư trừ phần đã quá hạn nhưng chưa ghi dòng expire). */
export function availableOf(entries: readonly LedgerEntry[], now: string): number {
  return round2(usableLots(entries, now).reduce((t, l) => t + l.remaining, 0))
}

/** Trừ `points` vào các lô theo thứ tự; null = không đủ điểm. */
export function planDeduction(entries: readonly LedgerEntry[], points: number, now: string): { lotId: string; points: number }[] | null {
  let left = round2(points)
  const out: { lotId: string; points: number }[] = []
  for (const lot of usableLots(entries, now)) {
    if (left <= 0) break
    const take = Math.min(lot.remaining, left)
    out.push({ lotId: lot.lotId, points: take })
    left = round2(left - take)
  }
  return left > 0 ? null : out
}

/** Dòng expire cho mọi lô đã quá hạn mà còn điểm (chạy hằng đêm, hoặc trước khi đổi điểm). */
export function expireDue(entries: readonly LedgerEntry[], now: string, newId: () => string): LedgerEntry[] {
  return lotsOf(entries)
    .filter((l) => l.remaining > 0 && l.expiresAt !== null && l.expiresAt <= now)
    .map((l) => ({ id: newId(), kind: 'expire' as const, points: -l.remaining, at: now, allocations: [{ lotId: l.lotId, points: l.remaining }], note: `Hết hạn lô ${l.earnedAt.slice(0, 10)}` }))
}

/** Hạn dùng của lần tích `at` với số ngày giữ điểm (0 = không hết hạn). */
export function expiryFrom(at: string, days: number): string | null {
  return days > 0 ? new Date(Date.parse(at) + days * 86400000).toISOString() : null
}
