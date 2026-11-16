// NT-BH-020 bước 2 — hàm thuần: báo giá đổi điểm, tiền giảm voucher, trừ điểm theo lô.
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../api/domain/ledger.js';
import { planRedeem, quoteRedeem, voucherCode, voucherDiscount, type VoucherRow } from '../api/domain/redeem.js';
import { PROGRAM } from './fixture.js';

const NOW = '2026-11-15T05:00:00.000Z';
const lot = (id: string, points: number, at: string) => ({ id, kind: 'earn', points, at, expiresAt: '2027-11-15T03:00:00.000Z' }) as LedgerEntry;
// Khách có 107: lô 1 còn 32, lô 2 (150) đã hoàn 75 → còn 75.
const HISTORY: LedgerEntry[] = [
  lot('lo1', 32, '2026-11-15T03:00:00.000Z'), lot('lo2', 150, '2026-11-15T04:00:00.000Z'),
  { id: 'r1', kind: 'reverse', points: -75, at: '2026-11-15T04:30:00.000Z', allocations: [{ lotId: 'lo2', points: 75 }] },
];

describe('NT-BH-020 bước 2 — báo giá đổi điểm', () => {
  it('đổi VC50K: 100 điểm, voucher TGS50- mã định theo đơn, hạn 30 ngày', () => {
    const q = quoteRedeem(PROGRAM, HISTORY, { orderId: 'o3', orderTotal: 325_000, redeem: ['lp_3_vc50k'], storeId: 2, now: NOW });
    expect(q.problems).toEqual([]);
    expect(q).toMatchObject({ available: 107, points: 100, tierKey: 'member' });
    expect(q.rewards[0]).toMatchObject({ kind: 'voucher', points: 100, voucher: { code: voucherCode('TGS50-', 'o3', 'lp_3_vc50k', 0), discountType: 'fixed', discountValue: 50_000, expiresAt: '2026-12-15T05:00:00.000Z' } });
    expect(q.rewards[0]!.voucher!.code).toMatch(/^TGS50-[0-9A-F]{8}$/);
    expect(quoteRedeem(PROGRAM, HISTORY, { orderId: 'o3', orderTotal: 325_000, redeem: ['lp_3_vc50k'], storeId: 2, now: NOW }).rewards[0]!.voucher!.code).toBe(q.rewards[0]!.voucher!.code);
  });
  it('đổi quà QUA1: 50 điểm, 1 hộp 100045001Z', () => {
    expect(quoteRedeem(PROGRAM, HISTORY, { orderId: 'o5', orderTotal: 325_000, redeem: ['lp_4_qua1'], storeId: 2, now: NOW }).rewards).toEqual([
      { index: 'lp_4_qua1', kind: 'gift', points: 50, name: "Me n' Mil 200ml", sku: '100045001Z', quantity: 1 },
    ]);
  });
  it('không đủ điểm / phần thưởng lạ → nêu lý do', () => {
    const q = quoteRedeem(PROGRAM, HISTORY, { orderId: 'o', orderTotal: 1, redeem: ['lp_3_vc50k', 'lp_3_vc50k'], storeId: 2, now: NOW });
    expect(q.problems).toEqual(['Không đủ điểm: cần 200, khách có 107 điểm dùng được']);
    expect(quoteRedeem(PROGRAM, HISTORY, { orderId: 'o', orderTotal: 1, redeem: ['lp_9_x'], storeId: 2, now: NOW }).problems[0]).toMatch(/không đổi được/);
  });
});

describe('NT-BH-020 bước 2 — voucher và trừ lô', () => {
  const v: VoucherRow = { code: 'TGS50-AAAA0000', name: 'Voucher 50.000đ', partnerCode: '0901234567', discountType: 'fixed', discountValue: 50_000, maxDiscount: 0, minOrderAmount: 0, expiresAt: '2026-12-15T05:00:00.000Z', status: 'active' };
  it('giảm 50.000; đã dùng / hết hạn / khách khác / giảm % có trần', () => {
    expect(voucherDiscount(v, { cartTotal: 325_000, customer: '0901234567', now: NOW })).toBe(50_000);
    expect(voucherDiscount({ ...v, status: 'used', usedOrderCode: 'HD2611000004' }, { cartTotal: 325_000, now: NOW })).toBe('Voucher TGS50-AAAA0000 đã dùng ở đơn HD2611000004');
    expect(voucherDiscount(v, { cartTotal: 325_000, now: '2027-01-01T00:00:00.000Z' })).toBe('Voucher TGS50-AAAA0000 đã hết hạn');
    expect(voucherDiscount(v, { cartTotal: 325_000, customer: '0999999999', now: NOW })).toBe('Voucher TGS50-AAAA0000 thuộc khách khác');
    expect(voucherDiscount({ ...v, discountType: 'percent', discountValue: 10, maxDiscount: 20_000 }, { cartTotal: 325_000, customer: '0901234567', now: NOW })).toBe(20_000);
  });
  it('trừ 100: lô 1 hết 32 trước, lô 2 trừ 68', () => {
    expect(planRedeem(HISTORY, 100, NOW)).toEqual({ points: 100, allocations: [{ lotId: 'lo1', points: 32 }, { lotId: 'lo2', points: 68 }] });
  });
  it('lúc ghi sổ không đủ (hai máy cùng lúc) → trừ phần còn, ghi chú', () => {
    expect(planRedeem(HISTORY, 150, NOW)).toMatchObject({ points: 107, note: 'Khách chỉ còn 107 điểm lúc ghi sổ, phần đổi cần 150' });
  });
});
