/**
 * Giá NCC có hiệu lực như chính sách: đơn / phiếu nhập lấy giá theo NGÀY CHỨNG TỪ. Không "Từ" = luôn có, không "Đến" = vô hạn,
 * chồng ngày → dòng có "Hiệu lực từ" muộn nhất; cùng ngày bắt đầu → dòng khai sau. Mỗi ĐVT giá niêm yết riêng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { priceFor, type ProductUnit, type SupplierProduct } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const us: ProductUnit[] = [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24, isPurchaseDefault: true }];
const sp = (id: number, unit: string, price: number, from?: string, to?: string): SupplierProduct =>
  ({ id: String(id), partnerCode: 'N1', sku: 'A', unit, price, priceIncludesVat: false, warnPct: 2, isActive: true, validFrom: from, validTo: to } as SupplierProduct);
const at = (rows: SupplierProduct[], date: string, unit = 'Lon') => priceFor(rows, { date, partnerCode: 'N1', sku: 'A', unit }, us)?.price;

describe('Giá NCC theo hiệu lực (thuần)', () => {
  const rows = [sp(1, 'Lon', 100_000), sp(2, 'Lon', 90_000, '2026-10-01', '2026-10-15'), sp(3, 'Lon', 95_000, '2026-10-10'), sp(4, 'Thùng', 2_200_000, '2026-10-01')];
  it('không ghi ngày = luôn có; trong đợt lấy giá đợt; chồng ngày lấy "Từ" muộn nhất; hết "Đến" quay về dòng còn hiệu lực', () => {
    expect(at(rows, '2026-09-30')).toBe(100_000);
    expect(at(rows, '2026-10-05')).toBe(90_000);
    expect(at(rows, '2026-10-12')).toBe(95_000); // 90k (01–15) và 95k (từ 10) chồng → 95k
    expect(at(rows, '2026-10-20')).toBe(95_000);
  });
  it('mỗi ĐVT giá niêm yết riêng: Thùng có giá riêng thì lấy đúng, trước ngày hiệu lực thì quy đổi từ Lon', () => {
    expect(at(rows, '2026-10-05', 'Thùng')).toBe(2_200_000);
    expect(at(rows, '2026-09-30', 'Thùng')).toBe(2_400_000); // 100.000 × 24
  });
  it('cùng ngày bắt đầu: dòng khai sau thắng', () => {
    expect(at([sp(5, 'Lon', 80_000, '2026-11-01'), sp(6, 'Lon', 82_000, '2026-11-01')], '2026-11-02')).toBe(82_000);
  });
});

describe('Giá NCC theo hiệu lực trên đơn đặt / phiếu nhập (qua API)', () => {
  beforeAll(async () => {
    t = await setupTenant();
    const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    await call(t, 'PUT', '/api/v1/partners/NCC-HL', { name: 'NCC thử hiệu lực giá', kind: 'supplier' });
    const p = await call(t, 'PUT', '/api/v1/catalog/products/HL1?new=1', { name: 'Hàng thử hiệu lực', unit: 'Lon', taxInCode: 'V08', units: us });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    const r = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [
      { partnerCode: 'NCC-HL', sku: 'HL1', unit: 'Lon', price: 100_000 },
      { partnerCode: 'NCC-HL', sku: 'HL1', unit: 'Lon', price: 90_000, validFrom: '2026-10-01', validTo: '2026-10-15' },
      { partnerCode: 'NCC-HL', sku: 'HL1', unit: 'Lon', price: 95_000, validFrom: '2026-10-10' },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }, 90_000);
  afterAll(async () => { await t.app.close(); });

  const fixed = async (kind: string, docDate: string) => {
    const r = await call(t, 'POST', '/api/v1/purchase/analyze', { kind, docDate, branchCode: 'CN-NA', partnerCode: 'NCC-HL', priceIncludesVat: false, orderDiscount: {}, ...(kind === 'receipt' ? { outsideOrder: { reason: 'Phép thử' } } : {}),
      lines: [{ lineKey: 'a', sku: 'HL1', name: 'x', unit: 'Lon', qty: 1, price: 1, taxCode: 'V08', lineType: 'buy' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return ((r.body.data.checks as { code: string; text: string }[]).find((c) => c.code === 'price_fixed')?.text ?? '');
  };
  it('đơn đặt và phiếu nhập so giá theo ngày chứng từ', async () => {
    expect(await fixed('order', '2026-09-30')).toContain('100.000 / Lon');
    expect(await fixed('order', '2026-10-05')).toContain('90.000 / Lon');
    expect(await fixed('receipt', '2026-10-12')).toContain('95.000 / Lon');
    expect(await fixed('receipt', '2026-10-20')).toContain('95.000 / Lon');
  });
});
