// NT-BH-020 bước 3 — hàm thuần: nạp số dư cũ, hết hạn lô, báo cáo.
import { describe, expect, it } from 'vitest';
import { availableOf, balanceOf, expireDue, totalEarnedOf, type LedgerEntry } from '../api/domain/ledger.js';
import { planOpening, summarize } from '../api/domain/opening.js';
import { PROGRAM } from './fixture.js';

const AS_OF = new Date('2026-11-16T00:00:00+07:00').toISOString();

describe('NT-BH-020 bước 3 — nạp số dư cũ', () => {
  it('tổng đã tích 6.000, số dư 4.200, giữ 365 ngày → lô +6.000 hạn 16/11/2027, đổi −1.800', () => {
    expect(planOpening({ customerCode: '0912345678', totalEarned: 6000, balance: 4200 }, AS_OF, 365)).toEqual({ earn: 6000, redeem: 1800, expiresAt: '2027-11-15T17:00:00.000Z' });
  });
  it('số dư lớn hơn tổng / điểm âm / mã không phải SĐT → lý do', () => {
    expect(planOpening({ customerCode: '0912345678', totalEarned: 100, balance: 200 }, AS_OF, 365)).toEqual({ problem: 'Khách 0912345678: số dư 200 lớn hơn tổng đã tích 100' });
    expect(planOpening({ customerCode: '0912345678', totalEarned: -1, balance: 0 }, AS_OF, 365)).toHaveProperty('problem');
    expect(planOpening({ customerCode: 'KH01', totalEarned: 1, balance: 1 }, AS_OF, 365)).toHaveProperty('problem');
  });
  it('sổ sau khi nạp: số dư 4.200, tổng đã tích 6.000 (hạng Vàng)', () => {
    const e: LedgerEntry[] = [
      { id: 'lot', kind: 'earn', points: 6000, at: AS_OF, expiresAt: '2027-11-15T17:00:00.000Z' },
      { id: 'r', kind: 'redeem', points: -1800, at: AS_OF, allocations: [{ lotId: 'lot', points: 1800 }] },
    ];
    expect([balanceOf(e), totalEarnedOf(e), availableOf(e, AS_OF)]).toEqual([4200, 6000, 4200]);
    expect(summarize(e.map((x) => ({ partnerCode: '0912345678', kind: x.kind, points: x.points, at: x.at, branchCode: null })), PROGRAM.tiers, AS_OF, '2026-11-17T00:00:00.000Z').customers[0]).toMatchObject({ balance: 4200, tierKey: 'gold' });
  });
});

describe('NT-BH-020 bước 3 — hết hạn lô', () => {
  it('lô 100 hết hạn 10/11/2026, đã đổi 30 → ngày 16/11/2026 ghi −70', () => {
    const e: LedgerEntry[] = [
      { id: 'lot', kind: 'earn', points: 100, at: '2025-11-10T03:00:00.000Z', expiresAt: '2026-11-10T03:00:00.000Z' },
      { id: 'r', kind: 'redeem', points: -30, at: '2026-01-01T03:00:00.000Z', allocations: [{ lotId: 'lot', points: 30 }] },
    ];
    const out = expireDue(e, '2026-11-15T18:00:00.000Z', () => 'x');
    expect(out).toEqual([expect.objectContaining({ kind: 'expire', points: -70, allocations: [{ lotId: 'lot', points: 70 }] })]);
    expect(expireDue([...e, ...out], '2026-11-16T18:00:00.000Z', () => 'y')).toEqual([]);
  });
});

describe('NT-BH-020 bước 3 — báo cáo', () => {
  it('phát sinh trong kỳ theo cửa hàng × loại; số dư cuối kỳ theo hạng; dòng trước kỳ chỉ vào số dư', () => {
    const r = summarize([
      { partnerCode: 'A', kind: 'earn', points: 100, at: '2026-10-01T00:00:00.000Z', branchCode: 'CN01' },
      { partnerCode: 'A', kind: 'earn', points: 32, at: '2026-11-15T03:00:00.000Z', branchCode: 'CN01' },
      { partnerCode: 'A', kind: 'redeem', points: -100, at: '2026-11-15T04:00:00.000Z', branchCode: 'CN01' },
      { partnerCode: 'B', kind: 'earn', points: 1200, at: '2026-11-15T05:00:00.000Z', branchCode: 'CN03' },
      { partnerCode: 'B', kind: 'expire', points: -50, at: '2026-11-16T00:00:00.000Z', branchCode: null },
    ], PROGRAM.tiers, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
    expect(r.total).toEqual({ earn: 1232, redeem: -100, expire: -50, reverse: 0, adjust: 0 });
    expect(r.byBranch).toEqual([
      { branchCode: '', earn: 0, redeem: 0, expire: -50, reverse: 0, adjust: 0 },
      { branchCode: 'CN01', earn: 32, redeem: -100, expire: 0, reverse: 0, adjust: 0 },
      { branchCode: 'CN03', earn: 1200, redeem: 0, expire: 0, reverse: 0, adjust: 0 },
    ]);
    expect(r.balance).toBe(1182);
    expect(r.byTier).toEqual([
      { tierKey: 'member', tierName: 'Thành viên', customers: 1, balance: 32 },
      { tierKey: 'silver', tierName: 'Bạc', customers: 1, balance: 1150 },
      { tierKey: 'gold', tierName: 'Vàng', customers: 0, balance: 0 },
    ]);
  });
});
