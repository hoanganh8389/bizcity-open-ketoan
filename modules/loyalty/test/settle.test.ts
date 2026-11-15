// NT-BH-020 bước 1 — hàm thuần: tích theo đơn, hoàn theo phiếu trả (số liệu phiếu §4).
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../api/domain/ledger.js';
import { customerLoyalty, planEarn, planReverse } from '../api/domain/settle.js';
import { PROGRAM } from './fixture.js';

const order = (total: number, over: Record<string, unknown> = {}) => ({
  id: 'o1', code: 'HD1', status: 'completed', total, createdAt: '2026-11-15T03:00:00.000Z',
  customer: { id: '0901234567', name: 'Chị Lan' }, lines: [{ sku: '100021001', unitQty: 1, unitRatio: 1 }], ...over,
});
const lot = (id: string, points: number, at = '2026-11-15T03:00:00.000Z', meta?: Record<string, unknown>) =>
  ({ id, kind: 'earn', points, at, expiresAt: '2027-11-15T03:00:00.000Z', ...(meta ? { meta } : {}) }) as LedgerEntry & { meta?: Record<string, unknown> };

describe('NT-BH-020 — tích điểm theo đơn', () => {
  it('đơn 325.000 → 32 điểm, lô hạn 365 ngày', () => {
    const p = planEarn(PROGRAM, 2, [], order(325_000));
    expect(p).toMatchObject({ points: 32, expiresAt: '2027-11-15T03:00:00.000Z', meta: { orderTotal: 325_000, tierKey: 'member', multiplier: 1 } });
  });
  it('đơn 1.300.000 → 130 + thưởng 20 = 150', () => {
    expect(planEarn(PROGRAM, 2, [lot('a', 32)], order(1_300_000))?.points).toBe(150);
  });
  it('hạng tính theo tổng điểm đã tích trước đơn: đã có 5.000 → vàng ×1,5 → 325.000 được 48', () => {
    expect(planEarn(PROGRAM, 2, [lot('a', 5000)], order(325_000))).toMatchObject({ points: 48, meta: { tierKey: 'gold', multiplier: 1.5 } });
  });
  it('khách lẻ, đơn chờ thanh toán, tắt tích ở máy bán → không tích', () => {
    expect(planEarn(PROGRAM, 2, [], order(325_000, { customer: { id: '' } }))).toBeNull();
    expect(planEarn(PROGRAM, 2, [], order(325_000, { status: 'awaiting_payment' }))).toBeNull();
    expect(planEarn({ ...PROGRAM, settings: { ...PROGRAM.settings, enablePosEarn: false } }, 2, [], order(325_000))).toBeNull();
  });
});

describe('NT-BH-020 — hoàn điểm khi trả hàng', () => {
  const earn = lot('lot-don2', 150, '2026-11-15T04:00:00.000Z', { orderTotal: 1_300_000 });
  const history = [lot('lot-don1', 32), earn];
  it('trả 650.000 của đơn 1.300.000 → −75, trừ lô của chính đơn', () => {
    expect(planReverse(history, earn, 650_000, 0, '2026-11-16T00:00:00.000Z')).toMatchObject({ points: 75, allocations: [{ lotId: 'lot-don2', points: 75 }] });
  });
  it('trả thêm phần còn lại → tổng hoàn đúng 150 (không lệch làm tròn)', () => {
    const after = [...history, { id: 'r1', kind: 'reverse', points: -75, at: '2026-11-16T00:00:00.000Z', allocations: [{ lotId: 'lot-don2', points: 75 }] } as LedgerEntry];
    expect(planReverse(after, earn, 650_000, 650_000, '2026-11-16T01:00:00.000Z')?.points).toBe(75);
  });
  it('khách đã dùng hết điểm → hoàn phần còn, ghi chú; không âm', () => {
    const spent = [...history, { id: 'x', kind: 'redeem', points: -170, at: '2026-11-15T05:00:00.000Z', allocations: [{ lotId: 'lot-don1', points: 32 }, { lotId: 'lot-don2', points: 138 }] } as LedgerEntry];
    const p = planReverse(spent, earn, 1_300_000, 0, '2026-11-16T00:00:00.000Z');
    expect(p).toMatchObject({ points: 12, note: 'Khách chỉ còn 12 điểm, phải hoàn 150' });
  });
  it('điểm khách sau tích 32 + 150, hoàn 75 → số dư 107', () => {
    const all = [...history, { id: 'r1', kind: 'reverse', points: -75, at: '2026-11-16T00:00:00.000Z', allocations: [{ lotId: 'lot-don2', points: 75 }] } as LedgerEntry];
    expect(customerLoyalty(PROGRAM, '0901234567', all, '2026-11-16T02:00:00.000Z')).toMatchObject({ balance: 107, available: 107, totalEarned: 107, tierKey: 'member', tierName: 'Thành viên', nextTierName: 'Bạc' });
  });
});
