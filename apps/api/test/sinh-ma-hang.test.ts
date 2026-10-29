/**
 * Sinh mã hàng theo quy tắc mã hàng (cây nhóm: ngành → nhãn → nhóm sản phẩm):
 *   mã = ngành (2) + nhãn (3) + nhóm (1) + số thứ tự (3); quà khuyến mại = "Q" + nhãn (3) + nhóm (1) + số thứ tự (4).
 * Mã SKU của nhóm chưa khai thì tự suy từ mã hàng đang có / tự cấp số kế tiếp; ngành, nhãn trả về theo cây nhóm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skuInfo, variantName } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Sku = { sku: string; segments: { skuCode: string; source: string }[]; industryCode: string; brandCode: string };
const next = async (g: string) => (await call(t, 'GET', `/api/v1/catalog/next-sku?groupCode=${g}`));
const group = (code: string, name: string, parentCode?: string) => call(t, 'PUT', `/api/v1/item-classes/group/${code}`, { name, ...(parentCode ? { parentCode } : {}) });
const product = (sku: string, groupCode: string) => call(t, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { name: `Hàng ${sku}`, groupCode, units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });

beforeAll(async () => {
  t = await setupTenant();
  await group('G1', 'Sữa bột'); await group('G2', 'Vinamilk', 'G1'); await group('G3', 'Sữa người lớn', 'G2'); await group('G3B', 'Sữa bầu', 'G2');
  await group('Q1', 'Quà khuyến mại'); await group('Q2', 'ABBOTT', 'Q1'); await group('Q3', 'Đồ chơi KM', 'Q2');
  expect((await product('110054057', 'G3')).status).toBeLessThan(300);
  expect((await product('Q00610017', 'Q3')).status).toBeLessThan(300);
});
afterAll(async () => { await t.app.close(); });

describe('Sinh mã hàng theo nhóm', () => {
  it('nhóm chưa khai mã SKU: suy từ mã đang có (11 · 005 · 4) → số kế tiếp; ngành, nhãn theo cây nhóm', async () => {
    const r = (await next('G3')).body.data as Sku;
    expect(r.sku).toBe('110054058');
    expect(r.segments.map((s) => s.skuCode)).toEqual(['11', '005', '4']);
    expect(r.segments.every((s) => s.source === 'inferred')).toBe(true);
    expect([r.industryCode, r.brandCode]).toEqual(['G1', 'G2']);
    // Lần sau mã SKU nhóm đã ghi lại → "declared".
    expect(((await next('G3')).body.data as Sku).segments.every((s) => s.source === 'declared')).toBe(true);
  });
  it('nhóm mới chưa có mặt hàng: cấp số kế tiếp sau các nhóm cùng cha (Sữa bầu → nhóm 5), số thứ tự 001', async () => {
    const r = (await next('G3B')).body.data as Sku;
    expect(r.sku).toBe('110055001');
    expect(r.segments[2]).toMatchObject({ skuCode: '5', source: 'new' });
  });
  it('ngành / nhãn mới: không cấp lại số mà nhóm cũ CHƯA khai mã SKU đang dùng trong mã hàng', async () => {
    // Ngành cũ "12" chỉ nằm trong mã hàng 120011001 (nhóm chưa khai mã SKU, chưa sinh mã lần nào).
    await group('C1', 'Ngành cũ'); await group('C2', 'Nhãn cũ', 'C1'); await group('C3', 'Nhóm cũ', 'C2');
    expect((await product('120011001', 'C3')).status).toBeLessThan(300);
    // Ngành mới: đã dùng 11 (G1) và 12 (trong mã hàng) → 13.
    await group('N1', 'Ngành mới'); await group('N2', 'Nhãn mới', 'N1'); await group('N3', 'Nhóm mới', 'N2');
    const r = (await next('N3')).body.data as Sku;
    expect(r.segments.map((s) => s.skuCode)).toEqual(['13', '001', '1']);
    expect(r.sku).toBe('130011001');
    // Nhãn mới dưới ngành cũ: nhãn 001 đang có trong mã 120011001 (chưa khai) → 002.
    await group('C2B', 'Nhãn mới của ngành cũ', 'C1'); await group('C3B', 'Nhóm của nhãn mới', 'C2B');
    expect(((await next('C3B')).body.data as Sku).sku).toBe('120021001');
  });
  it('quà khuyến mại: Q + nhãn + nhóm + 4 số', async () => {
    expect(((await next('Q3')).body.data as Sku).sku).toBe('Q00610018');
  });
  it('mã biến thể (đuôi K/M/Q/T, đuôi riêng Z, B): lưu được, không làm lệch số tự sinh; trùng mã bị chặn; mã gõ tay khác quy tắc vẫn lưu', async () => {
    expect((await product('110054058K', 'G3')).status).toBeLessThan(300);
    expect((await product('110054058Z', 'G3')).status).toBeLessThan(300);
    // Số tự sinh chỉ tính mã 9 ký tự: đã có 110054057, 110054058K/Z (chưa có 110054058 thường) → vẫn 110054058.
    expect(((await next('G3')).body.data as Sku).sku).toBe('110054058');
    expect((await product('110054057', 'G3')).status).toBe(409);
    expect((await product('MA-RIENG-01', 'G3')).status).toBeLessThan(300);
  });
  it('đọc mã: từng đoạn ngành / nhãn / nhóm / số / đuôi; tên mã biến thể theo mẫu', () => {
    expect(skuInfo('171676005K')).toMatchObject({ kind: 'share', industry: '17', brand: '167', group: '6', seq: '005', suffix: 'K', base: '171676005' });
    expect(skuInfo('100861001B')).toMatchObject({ kind: 'variant', suffix: 'B', base: '100861001', label: 'Mã phụ (B)' });
    expect(skuInfo('Q00610017')).toMatchObject({ kind: 'gift', brand: '006', group: '1', seq: '0017' });
    expect(skuInfo('MA-RIENG-01').kind).toBe('other');
    expect([variantName('Sữa A', 'K'), variantName('Sữa A', 'M'), variantName('Sữa A', 'Q'), variantName('Sữa A', 'T'), variantName('Sữa A', 'Z'), variantName('Sữa A', 'CB')])
      .toEqual(['Sữa A K', 'KM Sữa A', 'Sữa A Kẹp quà KM', 'Sữa A T', '(Z) Sữa A', 'Sữa A CB']);
    // Đuôi nhiều chữ đang có trong dữ liệu thật (110053022CB).
    expect(skuInfo('110053022CB')).toMatchObject({ kind: 'variant', suffix: 'CB', base: '110053022' });
  });
  it('chọn chưa tới cấp 3 → báo rõ phải chọn tới nhóm sản phẩm', async () => {
    const r = await next('G2');
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/nhóm sản phẩm/);
  });
});
