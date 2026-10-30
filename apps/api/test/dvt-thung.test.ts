/**
 * ĐVT Thùng đặt hàng (MH27) + mã con kế thừa đa ĐVT của mã cha.
 * Thử cả lệch chuẩn: mã đã có "Thùng_24" (không thêm trùng), tên hàng ghi x24, cùng nhãn + dung tích, tỉ lệ sửa tay, hàng KM bỏ qua,
 * NCC đã có dòng Thùng (chỉ đánh dấu), xem trước không ghi gì.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSpec, ratioFromName, sizeOf, isThung } from '../src/phan-he/mua-hang/dvt-thung.js';
import { inheritUnits } from '../src/modules/catalog/catalog.service.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type U = { unit: string; ratio: number; isDefault?: boolean; isPurchaseDefault?: boolean };
type Row = { sku: string; action: string; ratio: number; source: string; error?: string; oldRatio?: number; thungUnit: string; ncc: { partnerCode: string; fromUnit: string; toPrice: number | null; action: string }[] };
const product = async (sku: string, name: string, units: U[], extra: Record<string, unknown> = {}) => {
  const r = await call(t, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { name, unit: units[0]!.unit, ...extra, units });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { units: U[] };
};
const unitsOf = async (sku: string) => ((await call(t, 'GET', `/api/v1/catalog/products/${sku}`)).body.data.units as U[]);
const preview = async (specs: Record<string, string> = {}) => {
  const r = await call(t, 'POST', '/api/v1/purchase/units/thung/preview', { days: 30, specs });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { rows: Row[]; skipped: { sku: string; reason: string }[]; unknown: string[] };
};

beforeAll(async () => {
  t = await setupTenant();
  await call(t, 'PUT', '/api/v1/item-classes/brand/NH-TH', { name: 'Nhãn thử' }).catch(() => undefined);
  await call(t, 'PUT', '/api/v1/partners/NCC-TH1', { name: 'NCC thùng 1', kind: 'supplier' });
  await call(t, 'PUT', '/api/v1/partners/NCC-TH2', { name: 'NCC thùng 2', kind: 'supplier' });
  await product('TH-A', 'Sữa thử 180mlx24', [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Lốc_4', ratio: 4, isPurchaseDefault: true }]);
  await product('TH-B', 'Sữa thử không số', [{ unit: 'Hộp', ratio: 1, isDefault: true }]);
  await product('TH-C', 'Sữa đã có thùng', [{ unit: 'Hộp', ratio: 1, isDefault: true, isPurchaseDefault: true }, { unit: 'Thùng_24', ratio: 24 }]);
  await product('TH-D', 'KM Nhãn thử - Thùng giữ nhiệt', [{ unit: 'Cái', ratio: 1, isDefault: true }]);
  const rows = [
    { partnerCode: 'NCC-TH1', sku: 'TH-A', unit: 'Lốc_4', price: 40_000 },
    { partnerCode: 'NCC-TH1', sku: 'TH-B', unit: 'Hộp', price: 7_500.5 },
    { partnerCode: 'NCC-TH2', sku: 'TH-B', unit: 'Hộp', price: 7_000 },
    { partnerCode: 'NCC-TH1', sku: 'TH-C', unit: 'Hộp', price: 9_000 },
    { partnerCode: 'NCC-TH2', sku: 'TH-C', unit: 'Thùng_24', price: 210_000 },
    { partnerCode: 'NCC-TH1', sku: 'TH-D', unit: 'Cái', price: 0 },
  ];
  const s = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
}, 90_000);
afterAll(async () => { await t.app.close(); });

describe('Đọc ngữ cảnh thùng', () => {
  it('số thùng trong tên, bỏ kích thước; dung tích; tên ĐVT kiểu thùng', () => {
    expect(ratioFromName('SUDD Oggi Gold Grow 180mlx24')).toBe(24);
    expect(ratioFromName('Khăn giấy rút cao cấp Tobe (thùng 8)')).toBe(8);
    expect(ratioFromName('Sữa 24 hộp/thùng')).toBe(24);
    expect(ratioFromName('Thùng nhựa để đồ 41x27.5x16(cm)')).toBeNull();
    expect(ratioFromName('Anlene Gold 800g')).toBeNull();
    expect(sizeOf('Me n\' Mil UHT 1,5L')).toBe('1.5l');
    expect(sizeOf('Moozi 110ml')).toBe('110ml');
    expect(isThung('Thùng')).toBe(true);
    expect(isThung('thung_24')).toBe(true);
    expect(isThung('Lốc_4')).toBe(false);
    expect(parseSpec('12CAN/THÙNG')).toEqual({ qty: 12, unit: 'can' });
    expect(parseSpec('12 Lốc')).toEqual({ qty: 12, unit: 'loc' });
    expect(parseSpec('48')).toEqual({ qty: 48, unit: '' });
    expect(parseSpec('1 thùng = 6 túi')).toEqual({ qty: 6, unit: 'tui' });
    expect(parseSpec('Lốc')).toBeNull();
  });

  it('mã con kế thừa đa ĐVT: mã con chỉ khai ĐVT nhỏ nhất → lấy trọn bộ mã cha; đã khai nhiều → chỉ thêm phần thiếu', () => {
    const parent: U[] = [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Lốc', ratio: 4 }, { unit: 'Thùng', ratio: 48, isPurchaseDefault: true }];
    expect(inheritUnits([{ unit: 'Hộp', ratio: 1, isDefault: true }], parent)!.map((u) => `${u.unit}${u.ratio}${u.isPurchaseDefault ? '*' : ''}`)).toEqual(['Hộp1', 'Lốc4', 'Thùng48*']);
    expect(inheritUnits(undefined, parent)!.length).toBe(3);
    const own = inheritUnits([{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24 }], parent)!;
    expect(own.map((u) => `${u.unit}${u.ratio}${u.isPurchaseDefault ? '*' : ''}`)).toEqual(['Hộp1', 'Thùng24*', 'Lốc4']);
    expect(inheritUnits([{ unit: 'Hộp', ratio: 1 }], [])).toEqual([{ unit: 'Hộp', ratio: 1 }]);
  });
});

describe('ĐVT Thùng đặt hàng (MH27)', () => {
  it('xem trước: đoán tỉ lệ, bỏ hàng KM, mã đã có Thùng_24 chỉ đặt mặc định; xem trước không ghi gì', async () => {
    const p = await preview();
    const by = (s: string) => p.rows.find((r) => r.sku === s)!;
    expect(by('TH-A')).toMatchObject({ action: 'add', ratio: 24 });
    expect(by('TH-A').ncc[0]).toMatchObject({ fromUnit: 'Lốc_4', toPrice: 240_000, action: 'auto' }); // 40.000 / 4 × 24
    expect(by('TH-B')).toMatchObject({ action: 'add', ratio: 48, source: 'Mặc định 48' });
    expect(by('TH-C')).toMatchObject({ action: 'default', ratio: 24, thungUnit: 'Thùng_24' });
    expect(by('TH-C').ncc.find((n) => n.partnerCode === 'NCC-TH2')!.action).toBe('ok');
    expect(p.rows.some((r) => r.sku === 'TH-D')).toBe(false);
    expect(p.skipped.find((s) => s.sku === 'TH-D')!.reason).toMatch(/quà/);
    expect((await unitsOf('TH-B')).length).toBe(1);
    // Quy cách nhập vào (sửa tay / Excel) quy về ĐVT nhỏ nhất; giá quy đổi theo tỉ lệ mới.
    const m = await preview({ 'TH-B': '30', 'TH-A': '6 Lốc', 'TH-C': '12 lốc', 'KHONG-CO': '12 Hộp' });
    expect(m.rows.find((r) => r.sku === 'TH-B')).toMatchObject({ ratio: 30, source: 'Quy cách: 30 Hộp' });
    expect(m.rows.find((r) => r.sku === 'TH-A')).toMatchObject({ action: 'add', ratio: 24, source: 'Quy cách: 6 Lốc_4 × 4 = 24 Hộp' });
    expect(m.rows.find((r) => r.sku === 'TH-C')!.action).toBe('error');
    expect(m.rows.find((r) => r.sku === 'TH-C')!.error).toMatch(/không có ĐVT/);
    expect(m.unknown).toEqual(['KHONG-CO']);
    const fix = await preview({ 'TH-C': '20 Hộp' });
    expect(fix.rows.find((r) => r.sku === 'TH-C')).toMatchObject({ action: 'ratio', ratio: 20, oldRatio: 24 });
    expect(m.rows.find((r) => r.sku === 'TH-B')!.ncc.find((n) => n.partnerCode === 'NCC-TH1')!.toPrice).toBe(225_015);
  });

  it('chạy: thêm Thùng làm ĐVT mua mặc định, giữ dòng giá cũ + thêm dòng Thùng trống giá (lập đơn tự quy đổi); chạy lại không đổi thêm', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/units/thung/apply', { days: 30, specs: { 'TH-B': '30' }, skus: ['TH-A', 'TH-B', 'TH-C'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ added: 2, defaulted: 1 });
    const a = await unitsOf('TH-A');
    expect(a.find((u) => u.unit === 'Thùng')).toMatchObject({ ratio: 24, isPurchaseDefault: true });
    expect(a.find((u) => u.unit === 'Lốc_4')!.isPurchaseDefault).toBe(false);
    expect((await unitsOf('TH-B')).find((u) => u.unit === 'Thùng')!.ratio).toBe(30);
    expect((await unitsOf('TH-C')).find((u) => u.unit === 'Thùng_24')!.isPurchaseDefault).toBe(true);
    const sp = (await call(t, 'GET', '/api/v1/purchase/supplier-products?sku=TH-B')).body.data as { partnerCode: string; unit: string; price: number; isDefaultUnit: boolean }[];
    const rows = Array.isArray(sp) ? sp : (sp as unknown as { rows: typeof sp }).rows;
    expect(rows.filter((x) => x.partnerCode).map((x) => `${x.partnerCode} ${x.unit} ${x.price} ${x.isDefaultUnit}`).sort()).toEqual(['NCC-TH1 Hộp 7500.5 false', 'NCC-TH2 Hộp 7000 false']); // mỗi NCC × mã một dòng, không thêm dòng Thùng
    // Dòng giá cũ giữ nguyên ghi chú; dòng Thùng không ghi chú; lập đơn theo Thùng tự quy đổi từ dòng Hộp (7.500,5 × 30).
    expect((rows as unknown as { note: string }[]).every((x) => !/Đổi từ/.test(x.note))).toBe(true);
    const an = await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'order', docDate: '2026-10-30', branchCode: 'CN01', partnerCode: 'NCC-TH1', priceIncludesVat: false, lines: [{ lineKey: 'a', sku: 'TH-B', name: 'x', unit: 'Thùng', qty: 1, price: 0, taxCode: 'V08', lineType: 'buy' }] });
    expect(JSON.stringify(an.body)).toContain('225.015 / Thùng');
    const again = await preview();
    expect(again.rows.filter((x) => ['TH-A', 'TH-B', 'TH-C'].includes(x.sku)).every((x) => x.action === 'ok')).toBe(true);
  });

  it('dọn dòng Thùng trống giá thừa (bản đầu từng thêm): chỉ xoá dòng trống có dòng có giá cùng NCC × mã; lập đơn vẫn lấy Thùng', async () => {
    const add = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NCC-TH1', sku: 'TH-A', unit: 'Thùng', price: null }, { partnerCode: 'NCC-TH2', sku: 'TH-A', unit: 'Thùng', price: null }] });
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    const list = (await call(t, 'GET', '/api/v1/purchase/units/thung/empty-rows')).body.data as { partnerCode: string; sku: string }[];
    // NCC-TH1 có dòng Lốc_4 có giá → dòng Thùng trống là thừa; NCC-TH2 không có dòng có giá cho TH-A → giữ.
    expect(list.map((x) => `${x.partnerCode} ${x.sku}`)).toEqual(['NCC-TH1 TH-A']);
    const del = await call(t, 'POST', '/api/v1/purchase/units/thung/empty-rows/delete', {});
    expect(del.body.data.count).toBe(1);
    const left = (await call(t, 'GET', '/api/v1/purchase/supplier-products?sku=TH-A')).body.data.rows as { partnerCode: string; unit: string }[];
    expect(left.filter((x) => x.partnerCode).map((x) => `${x.partnerCode} ${x.unit}`).sort()).toEqual(['NCC-TH1 Lốc_4', 'NCC-TH2 Thùng']);
    // Lập đơn NCC-TH1: ĐVT mua mặc định Thùng (24), giá quy đổi từ dòng Lốc_4 40.000 → 240.000 / Thùng.
    const an = await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'order', docDate: '2026-10-30', branchCode: 'CN01', partnerCode: 'NCC-TH1', priceIncludesVat: false, lines: [{ lineKey: 'a', sku: 'TH-A', name: 'x', unit: 'Thùng', qty: 1, price: 1, taxCode: 'V08', lineType: 'buy' }] });
    expect(JSON.stringify(an.body)).toContain('240.000 / Thùng');
  });

  it('mã con tạo mới kéo đa ĐVT (cả Thùng, ĐVT mua mặc định) của mã cha', async () => {
    await product('110999001', 'Mã cha thử', [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Lốc', ratio: 4 }, { unit: 'Thùng', ratio: 48, isPurchaseDefault: true }]);
    const kid = await product('110999001Q', 'Mã cha thử kẹp quà', [{ unit: 'Hộp', ratio: 1, isDefault: true }]);
    expect(kid.units.map((u) => `${u.unit}${u.ratio}${u.isPurchaseDefault ? '*' : ''}`)).toEqual(['Hộp1', 'Lốc4', 'Thùng48*']);
    // Mã đã có (sửa) không bị kéo lại.
    const r = await call(t, 'PUT', '/api/v1/catalog/products/110999001Q', { units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
    expect(r.body.data.units.length).toBe(1);
  });
});
