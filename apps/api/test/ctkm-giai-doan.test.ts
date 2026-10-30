/**
 * Đề bài chương trình theo giai đoạn (CKTM VNĐ / thùng và % CKTM), áp theo NGÀY CHỨNG TỪ trên đơn / phiếu:
 *   VNĐ / thùng — GĐ1 01/09–21/09 · GĐ2 22/09–28/09: Similac 105.000 / 84.000 · Abbott Grow 66.000 / 54.000 · PediaSure 95.000 / 75.000 ·
 *                 Ensure 114.000 / 96.000 · Glucerna 114.000 / 96.000.
 *   % CKTM      — GĐ1 01/09–15/09 · GĐ2 16/09–28/09: Abbott Grow Gold, PediaSure 110/180/237ml, Ensure Vigor 237ml, Glucerna 220ml: 2,5% / 1%.
 * Thử đủ ngày ranh giới, ngoài chương trình, phiếu theo Lon (quy đổi từ Thùng), phiếu nhập duyệt sau (ngày chứng từ lùi) giữ đúng số.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const NCC = 'NCC-ABBOTT-GD';
const VND = [['GD-SIM', 'Similac', 105_000, 84_000], ['GD-AGR', 'Abbott Grow', 66_000, 54_000], ['GD-PED', 'PediaSure', 95_000, 75_000], ['GD-ENS', 'Ensure', 114_000, 96_000], ['GD-GLU', 'Glucerna', 114_000, 96_000]] as const;
const PCT = [['GD-AGG', 'Abbott Grow Gold 110ml'], ['GD-PDS', 'PediaSure 180ml'], ['GD-ENV', 'Ensure Vigor 237ml'], ['GD-G22', 'Glucerna 220ml']] as const;
const PRICE = 1_000_000; // giá 1 thùng (24 lon) chưa thuế

const policy = async (code: string, from: string, to: string, items: unknown[]) => {
  const r = await call(t, 'POST', '/api/v1/purchase/policies', { code, kind: 'item_discount', name: code, scope: { partnerCode: NCC }, validFrom: from, validTo: to, priority: 0, isActive: true, rule: { items } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};
const doc = (docDate: string, lines: { sku: string; unit?: string; qty: number; price?: number }[], kind = 'order') => ({
  kind, docDate, branchCode: 'CN-NA', partnerCode: NCC, priceIncludesVat: false, orderDiscount: {}, ...(kind === 'receipt' ? { outsideOrder: { reason: 'Phép thử giai đoạn' } } : {}),
  lines: lines.map((l, i) => ({ lineKey: `l${i}`, sku: l.sku, name: l.sku, unit: l.unit ?? 'Thùng', qty: l.qty, price: l.price ?? (l.unit === 'Lon' ? PRICE / 24 : PRICE), taxCode: 'V08', lineType: 'buy' })),
});
const discounts = async (docDate: string, lines: Parameters<typeof doc>[1]) => {
  const r = await call(t, 'POST', '/api/v1/purchase/analyze', doc(docDate, lines));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return (r.body.data.calc.lines as { sku: string; lineDiscount: number }[]).map((l) => l.lineDiscount);
};

beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC thử chương trình giai đoạn', kind: 'supplier' });
  for (const [sku, name] of [...VND, ...PCT]) {
    const p = await call(t, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { name, unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24, isPurchaseDefault: true }] });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
  }
  await policy('CTKM-VND-GD1', '2026-09-01', '2026-09-21', VND.map(([sku, , a]) => ({ sku, amount: a, unit: 'Thùng' })));
  await policy('CTKM-VND-GD2', '2026-09-22', '2026-09-28', VND.map(([sku, , , b]) => ({ sku, amount: b, unit: 'Thùng' })));
  await policy('CTKM-PCT-GD1', '2026-09-01', '2026-09-15', PCT.map(([sku]) => ({ sku, pct: 2.5 })));
  await policy('CTKM-PCT-GD2', '2026-09-16', '2026-09-28', PCT.map(([sku]) => ({ sku, pct: 1 })));
}, 120_000);
afterAll(async () => { await t.app.close(); });

const all = (qty: number) => [...VND, ...PCT].map(([sku]) => ({ sku, qty }));

describe('Chương trình theo giai đoạn — áp theo ngày chứng từ', () => {
  it('ngày 01/09 (đầu GĐ1): VNĐ/thùng GĐ1, % 2,5%', async () => {
    // 2 thùng mỗi mã · tiền hàng 2.000.000 / dòng · 2,5% = 50.000
    expect(await discounts('2026-09-01', all(2))).toEqual([210_000, 132_000, 190_000, 228_000, 228_000, 50_000, 50_000, 50_000, 50_000]);
  });
  it('ngày 15/09 (cuối GĐ1 của %): % vẫn 2,5%', async () => {
    expect((await discounts('2026-09-15', all(2))).slice(5)).toEqual([50_000, 50_000, 50_000, 50_000]);
  });
  it('ngày 16/09: % sang GĐ2 (1%), VNĐ/thùng vẫn GĐ1 — hai bảng có ranh giới khác nhau', async () => {
    expect(await discounts('2026-09-16', all(2))).toEqual([210_000, 132_000, 190_000, 228_000, 228_000, 20_000, 20_000, 20_000, 20_000]);
  });
  it('ngày 21/09 (cuối GĐ1 VNĐ) và 22/09 (đầu GĐ2 VNĐ)', async () => {
    expect((await discounts('2026-09-21', all(2))).slice(0, 5)).toEqual([210_000, 132_000, 190_000, 228_000, 228_000]);
    expect((await discounts('2026-09-22', all(2))).slice(0, 5)).toEqual([168_000, 108_000, 150_000, 192_000, 192_000]);
  });
  it('ngày 28/09 (cuối GĐ2) còn giảm; 29/09 và 31/08 hết chương trình', async () => {
    expect(await discounts('2026-09-28', all(1))).toEqual([84_000, 54_000, 75_000, 96_000, 96_000, 10_000, 10_000, 10_000, 10_000]);
    expect(await discounts('2026-09-29', all(1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await discounts('2026-08-31', all(1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('phiếu theo Lon: 48 lon = 2 thùng → Similac GĐ1 vẫn giảm 210.000', async () => {
    expect(await discounts('2026-09-10', [{ sku: 'GD-SIM', unit: 'Lon', qty: 48 }])).toEqual([210_000]);
  });
  it('lập hôm nay nhưng ghi ngày chứng từ 25/09 (nhập kho muộn): duyệt xong giữ đúng CK GĐ2', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', doc('2026-09-25', [{ sku: 'GD-SIM', qty: 10 }, { sku: 'GD-AGG', qty: 10 }], 'receipt'));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    // 10 thùng × 1.000.000 = 10.000.000 / dòng · Similac −840.000 (84.000 × 10) · Abbott Grow Gold −100.000 (1%)
    expect(ap.body.data.totals.total).toBe(Math.round((20_000_000 - 840_000 - 100_000) * 1.08));
  });
});
