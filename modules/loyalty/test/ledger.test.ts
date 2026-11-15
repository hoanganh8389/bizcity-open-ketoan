import { describe, expect, it } from 'vitest'
import { availableOf, balanceOf, expireDue, expiryFrom, lotsOf, planDeduction, totalEarnedOf, type LedgerEntry } from '../api/domain/ledger.js'
import { determineTier, isTierAtLeast, nextTier } from '../api/domain/engine.js'

// Sổ điểm (luật cho bảng ở phần mềm kế toán, docs 19).

const earn = (id: string, points: number, at: string, expiresAt: string | null): LedgerEntry => ({ id, kind: 'earn', points, at, expiresAt })

describe('sổ điểm', () => {
  const entries: LedgerEntry[] = [
    earn('A', 100, '2026-01-10T00:00:00Z', '2027-01-10T00:00:00Z'),
    earn('B', 50, '2026-03-01T00:00:00Z', '2026-12-01T00:00:00Z'), // hết hạn sớm hơn A
    earn('C', 30, '2026-05-01T00:00:00Z', null), // không hết hạn
  ]

  it('đổi điểm trừ lô HẾT HẠN SỚM NHẤT trước, lô không hạn dùng sau cùng', () => {
    expect(planDeduction(entries, 120, '2026-11-02T00:00:00Z')).toEqual([
      { lotId: 'B', points: 50 },
      { lotId: 'A', points: 70 },
    ])
    expect(planDeduction(entries, 181, '2026-11-02T00:00:00Z')).toBeNull() // không đủ
  })

  it('lô quá hạn: không dùng được nữa, dòng expire ghi đúng phần còn lại', () => {
    const redeem: LedgerEntry = { id: 'R', kind: 'redeem', points: -20, at: '2026-11-02T00:00:00Z', allocations: [{ lotId: 'B', points: 20 }] }
    const all = [...entries, redeem]
    expect(balanceOf(all)).toBe(160)
    expect(availableOf(all, '2026-12-02T00:00:00Z')).toBe(130) // B (còn 30) đã quá hạn
    const exp = expireDue(all, '2026-12-02T00:00:00Z', () => 'E')
    expect(exp).toEqual([{ id: 'E', kind: 'expire', points: -30, at: '2026-12-02T00:00:00Z', allocations: [{ lotId: 'B', points: 30 }], note: 'Hết hạn lô 2026-03-01' }])
    expect(lotsOf([...all, ...exp]).find((l) => l.lotId === 'B')?.remaining).toBe(0)
    expect(totalEarnedOf(all)).toBe(180) // đổi điểm không làm tụt hạng
  })

  it('hạn dùng tính từ lúc tích; 0 ngày = không hết hạn', () => {
    expect(expiryFrom('2026-11-02T03:00:00.000Z', 365)).toBe('2027-11-02T03:00:00.000Z')
    expect(expiryFrom('2026-11-02T03:00:00.000Z', 0)).toBeNull()
  })

  it('hạng theo TỔNG điểm đã tích; hạng kế tiếp và số điểm còn thiếu', () => {
    const tiers = [
      { key: 'vip', name: 'VIP', minPoints: 20000, multiplier: 2 },
      { key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 },
      { key: 'gold', name: 'Vàng', minPoints: 5000, multiplier: 1.5 },
    ]
    expect(determineTier(tiers, 4999)).toBe('member')
    expect(determineTier(tiers, 5000)).toBe('gold')
    expect(nextTier(tiers, 'gold', 6000)).toMatchObject({ tier: { key: 'vip' }, pointsToNext: 14000 })
    expect(isTierAtLeast(tiers, 'gold', 'member')).toBe(true)
    expect(isTierAtLeast(tiers, 'member', 'gold')).toBe(false)
  })
})
