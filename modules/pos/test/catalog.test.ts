// [2026-11-12 04:40 PM Võ Hoàng] POS-CATALOG — hàm thuần ghép dòng khung nhìn → mặt hàng máy bán (đóng góp)
import { describe, expect, it } from 'vitest';
import { catalogVersion, toProducts, type CatalogRow } from '../api/domain/catalog.js';

const row = (over: Partial<CatalogRow>): CatalogRow => ({
  sku: 'SUA400', name: 'Sữa', base_unit: 'Hộp', barcode: null, group_code: null, item_id: 'I1', parent_item_id: null, variant_code: 'normal',
  send_to_tax: true, tax_code: 'R08', tax_rate: '8', unit: 'Hộp', ratio: '1', price: '320000.00', is_default_unit: true, ...over,
});

describe('toProducts', () => {
  it('gom ĐVT theo mã, sắp theo tỉ lệ; giá mặt hàng = giá ĐVT nhỏ nhất', () => {
    const [p] = toProducts([row({ unit: 'Thùng', ratio: '12', price: '3800000.00', is_default_unit: false }), row({})]);
    expect(p).toMatchObject({ id: 'I1', price: 320_000, taxRate: 8, unitName: 'Hộp' });
    expect(p!.units).toEqual([{ unit: 'Hộp', ratio: 1, price: 320_000, isDefault: true }, { unit: 'Thùng', ratio: 12, price: 3_800_000, isDefault: false }]);
  });
  it('chưa khai thuế → taxRate null; Nội bộ luôn không gửi thuế; chưa có dòng ĐVT → giá 0, ĐVT của mặt hàng', () => {
    const [p] = toProducts([row({ tax_code: null, tax_rate: null, variant_code: 'internal', unit: null, ratio: null, price: null, is_default_unit: null })]);
    expect(p).toMatchObject({ taxRate: null, sendTax: false, variant: 'internal', price: 0, unitName: 'Hộp', units: [] });
  });
  it('chưa có item_id → id là mã', () => {
    expect(toProducts([row({ item_id: null })])[0]!.id).toBe('SUA400');
  });
  it('phiên bản đổi theo số dòng và lần sửa', () => {
    expect(catalogVersion(2, '2026-11-12T00:00:00Z')).not.toBe(catalogVersion(2, '2026-11-12T00:00:01Z'));
    expect(catalogVersion(0, null)).toBe('0-0');
  });
});
