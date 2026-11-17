// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hàm thuần nháp / trùng / hạn mức khuyến mại (đóng góp)
import { describe, expect, it } from 'vitest';
import { draftContentSchema, overlapOf, quotaFor, quotaMessage, quotaRows, skusOf, usesOf, windowOf, type PromoShape } from '../api/domain/promo.js';
import { fromQuota, toQuota } from '../web/screens/khuyen-mai/model.js';

const shape = (key: string, p: Partial<PromoShape> = {}): PromoShape => ({
  key, contract: 'sale.promo.tiered@1', params: { skus: ['SUA330'] }, branchCodes: ['CN01'], from: '2026-11-20', to: '2026-11-30', ...p,
});

describe('mã hàng của chương trình', () => {
  it('bậc / món rẻ nhất: skus; combo: món; mua X tặng Y: X và Y; tổng đơn không nhóm hàng = cả đơn (null)', () => {
    expect(skusOf('sale.promo.tiered@1', { skus: ['A', 'B'] })).toEqual(['A', 'B']);
    expect(skusOf('sale.promo.combo@1', { items: [{ sku: 'B', qty: 1 }, { sku: 'C', qty: 2 }] })).toEqual(['B', 'C']);
    expect(skusOf('sale.promo.buy_x_get_y@1', { buy: { sku: 'A', qty: 2 }, get: { sku: 'Q', qty: 1 } })).toEqual(['A', 'Q']);
    expect(skusOf('sale.promo.order_discount@1', { tiers: [] })).toBeNull();
    expect(skusOf('sale.promo.order_gift@1', { skus: ['A'] })).toEqual(['A']);
  });
  it('cửa sổ: max(ngày áp, validFrom) → min(validTo, effectiveTo)', () => {
    expect(windowOf({ validFrom: '2026-11-20', validTo: '2026-11-30' }, '2026-11-18')).toEqual({ from: '2026-11-20', to: '2026-11-30' });
    expect(windowOf({}, '2026-11-18', '2026-11-25')).toEqual({ from: '2026-11-18', to: '2026-11-25' });
  });
});

describe('cảnh báo trùng', () => {
  it('cùng mã, cùng cửa hàng, giao thời gian → trùng; khác mã / khác cửa hàng / không giao → không', () => {
    expect(overlapOf(shape('A'), shape('B', { from: '2026-11-25', to: null }))).toEqual({ skus: ['SUA330'], branches: ['CN01'] });
    expect(overlapOf(shape('A'), shape('B', { params: { skus: ['SUA900'] } }))).toBeNull();
    expect(overlapOf(shape('A'), shape('B', { branchCodes: ['CN02'] }))).toBeNull();
    expect(overlapOf(shape('A'), shape('B', { from: '2026-12-01', to: null }))).toBeNull();
    expect(overlapOf(shape('A'), shape('A'))).toBeNull();
  });
  it('mọi cửa hàng trùng mọi cửa hàng; chương trình cả đơn trùng mọi mã', () => {
    expect(overlapOf(shape('A', { branchCodes: [] }), shape('B'))).toEqual({ skus: ['SUA330'], branches: ['CN01'] });
    expect(overlapOf(shape('A', { contract: 'sale.promo.order_discount@1', params: {} }), shape('B'))?.skus).toEqual(['SUA330']);
  });
});

describe('hạn mức lượt', () => {
  it('khai: mỗi cửa hàng + riêng từng cửa hàng; tra: riêng trước, rồi *, không có = không giới hạn', () => {
    const rows = quotaRows({ perBranch: 5, branches: { CN01: 2 } }).map((r) => ({ branch_code: r.branch, quota: r.quota }));
    expect(rows).toEqual([{ branch_code: 'CN01', quota: 2 }, { branch_code: '*', quota: 5 }]);
    expect(quotaFor(rows, 'CN01')).toBe(2);
    expect(quotaFor(rows, 'CN09')).toBe(5);
    expect(quotaFor([], 'CN01')).toBeUndefined();
    expect(quotaRows(null)).toEqual([]);
  });
  it('lượt của đơn theo chương trình: tiền giảm dòng giảm, số quà dòng quà', () => {
    expect(usesOf([
      { policyRef: { key: 'KM-B' }, qty: 3, discount: 30_000 },
      { policyRef: { key: 'KM-B' }, qty: 1, discount: 5_000 },
      { policyRef: { key: 'KM-Q' }, qty: 2, isGift: true },
      { qty: 1 },
    ])).toEqual([{ key: 'KM-B', discount: 35_000, giftQty: 0 }, { key: 'KM-Q', discount: 0, giftQty: 2 }]);
    expect(quotaMessage([{ key: 'KM-B', quota: 2, used: 2 }], 'CN01')).toContain('KM-B (đã dùng 2/2)');
  });
  it('ô form ↔ quota', () => {
    expect(toQuota({ quotaPerBranch: '10', quotaBranches: 'CN01=2, CN02: 5' })).toEqual({ quota: { perBranch: 10, branches: { CN01: 2, CN02: 5 } }, problems: [] });
    expect(toQuota({ quotaPerBranch: '', quotaBranches: '' }).quota).toBeNull();
    expect(toQuota({ quotaPerBranch: '1,5', quotaBranches: 'CN01' }).problems).toHaveLength(2);
    expect(fromQuota({ perBranch: 10, branches: { CN01: 2 } })).toEqual({ quotaPerBranch: '10', quotaBranches: 'CN01=2' });
  });
  it('khuôn nháp: chỉ 6 khuôn sale.promo.*, mã đúng khuôn', () => {
    const ok = draftContentSchema.safeParse({ key: 'KM-A', ruleContract: 'sale.promo.tiered@1', params: {}, effectiveFrom: '2026-11-20' });
    expect(ok.success).toBe(true);
    expect(draftContentSchema.safeParse({ key: 'KM-A', ruleContract: 'sale.program@1', params: {}, effectiveFrom: '2026-11-20' }).success).toBe(false);
    expect(draftContentSchema.safeParse({ key: 'K M', ruleContract: 'sale.promo.tiered@1', params: {}, effectiveFrom: '2026-11-20' }).success).toBe(false);
  });
});
