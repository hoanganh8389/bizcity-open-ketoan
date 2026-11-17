// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022: hàm thuần kiểm giá máy bán (đóng góp)
import { describe, expect, it } from 'vitest';
import { changedMessage, checkPrices, noPriceMessage, priceKey } from '../api/domain/price.js';

const items = new Map([['SUA330', { variant: 'normal', sendTax: true }], ['NB01', { variant: 'internal', sendTax: false }], ['QZ', { variant: 'promo', sendTax: false }], ['MOI01', { variant: 'normal', sendTax: true }]]);
const prices = new Map([[priceKey('SUA330', 'Hộp'), { price: 330_000, ratio: 1 }], [priceKey('SUA330', 'Thùng'), { price: 7_900_000, ratio: 24 }]]);
const line = (o: Record<string, unknown>) => ({ lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', clientUnitPrice: 330_000, ...o });

describe('NT-BH-022 — kiểm giá máy bán (hàm thuần)', () => {
  it('đúng giá / đúng hệ số → không vướng; ĐVT so không phân biệt hoa thường', () => {
    expect(checkPrices([line({}), line({ lineId: 'l2', unitName: 'thùng', unitRatio: 24, clientUnitPrice: 7_900_000 })], items, prices)).toEqual({ manual: [], noPrice: [], changed: [] });
  });
  it('giá khác / hệ số khác → changed; chưa có giá → noPrice; giảm tay → manual', () => {
    const r = checkPrices([
      line({ clientUnitPrice: 300_000 }),
      line({ lineId: 'l2', unitName: 'Thùng', unitRatio: 20, clientUnitPrice: 7_900_000 }),
      line({ lineId: 'l3', sku: 'MOI01', unitName: 'Cái', clientUnitPrice: 10_000 }),
      line({ lineId: 'l4', manualDiscount: { value: 10 } }),
    ], items, prices);
    expect(r.changed.map((x) => [x.sku, x.unit, x.price, x.clientPrice])).toEqual([['SUA330', 'Hộp', 330_000, 300_000], ['SUA330', 'Thùng', 7_900_000, 7_900_000]]);
    expect(r.noPrice).toEqual([{ sku: 'MOI01', unit: 'Cái', price: null, ratio: null, clientPrice: 10_000, clientRatio: 1 }]);
    expect(r.manual).toEqual([{ lineId: 'l4', sku: 'SUA330' }]);
  });
  it('không cần giá: quà, hàng Nội bộ, bill Z 0đ; giảm tay 0 không tính', () => {
    const r = checkPrices([line({ isGift: true, clientUnitPrice: 0, sku: 'MOI01' }), line({ sku: 'NB01', clientUnitPrice: 0 }), line({ sku: 'QZ', clientUnitPrice: 0 }), line({ manualDiscount: { value: 0 } })], items, prices);
    expect(r).toEqual({ manual: [], noPrice: [], changed: [] });
  });
  it('câu báo', () => {
    expect(noPriceMessage([{ sku: 'MOI01', unit: 'Cái', price: null, ratio: null, clientPrice: 1, clientRatio: 1 }], 'CN01')).toBe('Chưa có giá ở CN01: MOI01 (Cái) — báo kế toán khai giá');
    expect(changedMessage([{ sku: 'SUA330', unit: 'Hộp', price: 330_000, ratio: 1, clientPrice: 300_000, clientRatio: 1 }])).toContain('SUA330 (Hộp) giá bảng giá 330.000, máy gửi 300.000');
  });
});
