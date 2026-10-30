/**
 * Tồn max → chuyển hàng shop → công thức đặt mua (docs/nghiep-vu/09-ton-max-dat-hang.md), chạy trên PostgreSQL thật:
 * phân cấp tự xếp theo mã, tồn theo kho, bán / ngày, hàng đi đường, đề xuất chuyển làm tròn thùng, công thức đặt hàng,
 * phiếu đăng ký max (duyệt tay / tự động / hàng mới gắn mã sau), đơn đặt có dòng hàng mới.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allocateTransfers, buyOptions, DEFAULT_FORMULA, defaultUnitFor, familiesOf, familyParent, formulaText, orderNeed, roundTransfer, suggestMax, type ProductUnit, type SupplierProduct } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const AS_OF = '2026-10-20';
const ok = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, status = method === 'POST' && !url.includes('/approve') && !url.includes('/cancel') && !url.includes('/auto') && !url.includes('/done') ? 201 : 200) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBe(status);
  return r.body.data;
};
const doc = (over: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', over).then((r) => { expect(r.status, JSON.stringify(r.body)).toBeLessThan(300); return r; });

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['08000', 'CN Phú Thọ'], ['08001', 'Lâm Thao'], ['08002', 'Việt Trì']]) await ok('POST', '/api/v1/branches', { code, name });
  await ok('POST', '/api/v1/warehouses', { code: '08-HH', branchCode: '08000', name: 'Kho hàng', isDefault: true });
  await ok('POST', '/api/v1/warehouses', { code: '08-KM', branchCode: '08000', name: 'Kho khuyến mại', isPromo: true });
  await ok('POST', '/api/v1/warehouses', { code: '08001', branchCode: '08001', name: 'Kho Lâm Thao', isDefault: true });
  await ok('POST', '/api/v1/warehouses', { code: '08002', branchCode: '08002', name: 'Kho Việt Trì', isDefault: true });
  for (const sku of ['SUA1', 'SUA2']) await ok('PUT', `/api/v1/catalog/products/${sku}?new=true`, { name: `Sữa ${sku}`, unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 6, isPurchaseDefault: true }] });
  await call(ctx, 'PUT', '/api/v1/partners/NCC-HC', { name: 'Công ty Hùng Cường', kind: 'supplier' });
  await ok('POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NCC-HC', sku: 'SUA1', unit: 'Thùng', isDefaultUnit: true, price: 648000, priceIncludesVat: true, nccSku: 'HC-SUA1', nccName: 'Sua bot SUA1 thung 6', note: 'Giao thứ 3 hằng tuần' }] }, 200);
  // Nhập 100 lon vào kho hàng chi nhánh cha; chuyển 30 lon xuống Lâm Thao (đã nhận), 6 lon xuống Việt Trì (chưa nhận); Lâm Thao bán 14 lon.
  await doc({ docType: 'purchase', docKey: 'tm:NM1', branchCode: '08000', docNo: 'NM1', docDate: '2026-10-01', partner: { code: 'NCC-HC', name: 'Hùng Cường' },
    lines: [{ lineKey: 'l1', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Lon', qty: 100, amountBeforeTax: 10000000, taxCode: 'V08', taxAmount: 800000, warehouseCode: '08-HH' }], totals: { beforeTax: 10000000, tax: 800000, total: 10800000 } });
  await doc({ docType: 'transfer', docKey: 'tm:CK1', branchCode: '08000', toBranchCode: '08001', docNo: 'CK1', docDate: '2026-10-10', status: 'received', lines: [{ lineKey: 'l1', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Lon', qty: 30, amount: 0, warehouseCode: '08-HH' }], totals: { total: 0 } });
  await doc({ docType: 'transfer', docKey: 'tm:CK2', branchCode: '08000', toBranchCode: '08002', docNo: 'CK2', docDate: '2026-10-18', status: 'shipped', lines: [{ lineKey: 'l1', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Lon', qty: 6, amount: 0, warehouseCode: '08-HH' }], totals: { total: 0 } });
  await doc({ docType: 'sale', docKey: 'tm:HD1', branchCode: '08001', docNo: 'HD1', docDate: '2026-10-15', partner: { code: 'KL', name: 'Khách lẻ' },
    lines: [{ lineKey: 'l1', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Lon', qty: 14, amountBeforeTax: 1400000, taxCode: 'R08', taxAmount: 112000 }], payments: [{ methodCode: 'TM', amount: 1512000 }], totals: { beforeTax: 1400000, tax: 112000, total: 1512000 } });
});
afterAll(async () => { await ctx.app.close(); });

describe('Bộ tính dùng chung', () => {
  it('làm tròn thùng khi chuyển: tự động (≥ nửa thùng lên thùng, ít hơn chuyển lẻ) / nguyên thùng / lẻ', () => {
    expect(roundTransfer(4, 6, 'auto')).toBe(6);
    expect(roundTransfer(8, 6, 'auto')).toBe(8);
    expect(roundTransfer(10, 6, 'auto')).toBe(12);
    expect(roundTransfer(8, 6, 'pack')).toBe(6);
    expect(roundTransfer(4, 6, 'unit')).toBe(4);
    expect(roundTransfer(0, 6, 'auto')).toBe(0);
  });
  it('kho không đủ: ưu tiên shop thiếu nhiều nhất so với max', () => {
    const l = allocateTransfers([{ shopCode: 'A', sku: 'X', max: 12, ton: 10, diDuong: 0, pack: 6, mode: 'auto' }, { shopCode: 'B', sku: 'X', max: 12, ton: 0, diDuong: 0, pack: 6, mode: 'auto' }], 12);
    expect(l.map((x) => [x.shopCode, x.want, x.qty, x.short])).toEqual([['A', 2, 0, 2], ['B', 12, 12, 0]]);
  });
  it('gợi ý max = bán / ngày × số ngày đủ hàng; SL mua gợi ý làm tròn xuống / lên theo thùng', () => {
    expect(suggestMax(2, 7)).toBe(14);
    expect(suggestMax(0.3, 7)).toBe(3);
    expect(suggestMax(0, 7)).toBe(0);
    expect(buyOptions(34, 6)).toEqual([30, 36]);
    expect(buyOptions(-3, 6)).toEqual([]);
  });
  it('công thức chuẩn bằng chữ và cách tính phần shop (cộng gộp / chỉ phần thiếu)', () => {
    expect(formulaText(DEFAULT_FORMULA)).toBe('SL cần nhập = Tồn max kho − Tồn kho − Hàng đi đường về kho − Hàng đi đường xuống shop + Tổng tồn max shop − Tổng tồn shop + Bán 7 ngày của mọi shop − SL mua chưa nhập kho');
    const input = { maxKho: 0, minKho: 0, tonKho: 0, diDuongKho: 0, diDuongShop: 0, banShopNgay: [], banThangTruoc: 0, dangDat: 0, shops: [{ code: 'A', max: 10, ton: 20 }, { code: 'B', max: 10, ton: 0 }] };
    expect(orderNeed(input, DEFAULT_FORMULA).need).toBe(0);
    expect(orderNeed(input, { ...DEFAULT_FORMULA, shopGapMode: 'positive' }).need).toBe(10);
  });
});

describe('ĐVT lập đơn / phiếu: ĐVT trên dòng giá của NCC → Mua mặc định → Bán chính → nhỏ nhất', () => {
  const us: ProductUnit[] = [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Lốc', ratio: 6 }, { unit: 'Thùng', ratio: 24, isPurchaseDefault: true }] as ProductUnit[];
  const sp = (unit: string, o: Partial<SupplierProduct> = {}): SupplierProduct => ({ partnerCode: 'N1', sku: 'A', unit, price: 1, priceIncludesVat: false, warnPct: 2, isActive: true, ...o } as SupplierProduct);
  it('NCC khai một dòng giá → dùng ĐVT của dòng đó', () => {
    expect(defaultUnitFor(us, [sp('Lốc')], 'N1', 'A')).toBe('Lốc');
  });
  it('NCC khai nhiều ĐVT: ưu tiên ĐVT Mua mặc định của mặt hàng; không có thì dòng giá mới nhất (ô tích cũ không còn tác dụng)', () => {
    expect(defaultUnitFor(us, [sp('Lon', { isDefaultUnit: true }), sp('Thùng')], 'N1', 'A')).toBe('Thùng');
    expect(defaultUnitFor(us, [sp('Lon', { validFrom: '2026-01-01' }), sp('Lốc', { validFrom: '2026-10-01' })], 'N1', 'A')).toBe('Lốc');
  });
  it('NCC chưa khai / NCC khác → Mua mặc định; mặt hàng không có Mua mặc định → Bán chính → nhỏ nhất', () => {
    expect(defaultUnitFor(us, [sp('Lốc')], 'N2', 'A')).toBe('Thùng');
    expect(defaultUnitFor(us.map((u) => ({ ...u, isPurchaseDefault: false })), [], 'N2', 'A')).toBe('Lon');
  });
});

describe('Họ mã 1 cấp: mã có đuôi là con của mã gốc nếu mã gốc có trong danh mục', () => {
  const cat = new Set(['110063076', '110063076Q', '110063076Z', '100021001B', '130211004T']);
  it('mã con nhận ra theo đuôi; mã gốc không có trong danh mục thì mã có đuôi tự là mã cha; mã thường / mã lạ là mã cha', () => {
    expect(familyParent('110063076Q', cat)).toBe('110063076');
    expect(familyParent('110063076Z', cat)).toBe('110063076');
    expect(familyParent('110063076', cat)).toBe('110063076');
    expect(familyParent('100021001B', cat)).toBe('100021001B');
    expect(familyParent('SUA1', cat)).toBe('SUA1');
  });
  it('đuôi T (hàng có tem, đặt riêng với NCC) KHÔNG gộp: tự là mã cha dù mã gốc có trong danh mục; đuôi M vẫn gộp', () => {
    const c2 = new Set(['130211004', '130211004T', '130211004M']);
    expect(familyParent('130211004T', c2)).toBe('130211004T');
    expect(familyParent('130211004M', c2)).toBe('130211004');
    expect([...familiesOf([...c2], c2).keys()]).toEqual(['130211004', '130211004T']);
  });
  it('gom họ: mã cha đứng đầu (kể cả khi chỉ có mã con hoạt động), mã con theo sau', () => {
    const f = familiesOf(['110063076Z', '130211004T', '110063076Q'], cat);
    expect([...f.entries()]).toEqual([['110063076', ['110063076', '110063076Q', '110063076Z']], ['130211004T', ['130211004T']]]);
  });
});

describe('Phân cấp, tồn max, đề xuất chuyển, công thức đặt hàng', () => {
  it('tự xếp theo mã: 08000 là chi nhánh cha, 08001 / 08002 là shop; chi nhánh khác giữ nguyên', async () => {
    await ok('POST', '/api/v1/stock/hierarchy/auto', {});
    const h = (await ok('GET', '/api/v1/stock/hierarchy')).branches as { code: string; level: string; parentCode: string | null; warehouses: { code: string }[] }[];
    expect(h.find((b) => b.code === '08000')).toMatchObject({ level: 'branch', parentCode: null });
    expect(h.filter((b) => b.parentCode === '08000').map((b) => b.code)).toEqual(['08001', '08002']);
    expect(h.find((b) => b.code === '08000')!.warehouses.map((w) => w.code)).toEqual(['08-HH', '08-KM']);
    // Chỉ 2 cấp: shop không làm cha được.
    const bad = await call(ctx, 'PUT', '/api/v1/stock/hierarchy', { items: [{ code: 'CN01', level: 'shop', parentCode: '08001' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/không phải chi nhánh cha/);
  });

  it('khai max theo kho; bảng tồn max shop: tồn, bán / ngày (7 ngày), gợi ý max', async () => {
    await ok('PUT', '/api/v1/stock/levels', { items: [
      { branchCode: '08001', sku: 'SUA1', max: 20 }, { branchCode: '08002', sku: 'SUA1', max: 12 }, { branchCode: '08000', warehouseCode: '08-HH', sku: 'SUA1', max: 100 },
    ] });
    const bad = await call(ctx, 'PUT', '/api/v1/stock/levels', { items: [{ branchCode: '08001', sku: 'KHONGCO', max: 1 }] });
    expect(bad.status).toBe(400);
    const b = await ok('GET', `/api/v1/stock/max-board?parentCode=08000&branchCode=08001&asOf=${AS_OF}`);
    expect(b.rows.find((r: { sku: string }) => r.sku === 'SUA1')).toMatchObject({ warehouseCode: '08001', ton: 16, avgPerDay: 2, suggested: 14, max: 20, pack: 6, packUnit: 'Thùng' });
    const k = await ok('GET', `/api/v1/stock/max-board?parentCode=08000&branchCode=08000&asOf=${AS_OF}`);
    expect(k.rows.find((r: { sku: string }) => r.sku === 'SUA1')).toMatchObject({ warehouseCode: '08-HH', ton: 64, shopMaxSum: 32, suggested: 36, max: 100 });
    // Kho đang xem trả về để màn hiện ô Phân kho; shop chọn đúng kho của nó được, mã kho không thuộc shop thì về kho chuẩn của shop.
    expect([b.warehouseCode, k.warehouseCode]).toEqual(['08001', '08-HH']);
    const own = await ok('GET', `/api/v1/stock/max-board?parentCode=08000&branchCode=08001&warehouseCode=08001&asOf=${AS_OF}`);
    expect(own.rows.find((r: { sku: string }) => r.sku === 'SUA1')).toMatchObject({ warehouseCode: '08001', ton: 16, max: 20 });
    const lac = await ok('GET', `/api/v1/stock/max-board?parentCode=08000&branchCode=08001&warehouseCode=08-HH&asOf=${AS_OF}`);
    expect(lac.warehouseCode).toBe('08001');
    // Kho phụ (08-KM): không gợi ý, không kéo mã từ max shop vào (tránh tồn max trùng ở mọi kho); kho chính vẫn gợi ý.
    const km = await ok('GET', `/api/v1/stock/max-board?parentCode=08000&branchCode=08000&warehouseCode=08-KM&asOf=${AS_OF}`);
    expect([km.mainWarehouse, k.mainWarehouse, km.rows.length]).toEqual([false, true, 0]);
    await ok('PUT', '/api/v1/stock/levels', { items: [{ branchCode: '08000', warehouseCode: '08-KM', sku: 'SUA1', max: 5 }] });
    const km2 = await ok('GET', `/api/v1/stock/max-board?parentCode=08000&branchCode=08000&warehouseCode=08-KM&asOf=${AS_OF}`);
    expect(km2.rows).toHaveLength(1);
    expect(km2.rows[0]).toMatchObject({ warehouseCode: '08-KM', sku: 'SUA1', max: 5, suggested: 0 });
    expect(km2.rows[0].shopMaxSum).toBeUndefined();
    await ok('PUT', '/api/v1/stock/levels', { items: [{ branchCode: '08000', warehouseCode: '08-KM', sku: 'SUA1', max: 0, remove: true }] });
  });

  it('đề xuất chuyển: thiếu 4 lon → lên 1 thùng; Việt Trì trừ hàng đang đi đường; chốt rồi thì lần sau không đề xuất lại', async () => {
    const s = await ok('GET', `/api/v1/stock/transfer-suggest?branchCode=08000&asOf=${AS_OF}`);
    expect(s.lines.map((l: Record<string, unknown>) => [l.shopCode, l.max, l.ton, l.diDuong, l.gap, l.qty])).toEqual([['08001', 20, 16, 0, 4, 6], ['08002', 12, 0, 6, 6, 6]]);
    const c = await ok('POST', '/api/v1/stock/transfer-requests', { fromBranch: '08000', shops: [{ toBranch: '08001', lines: [{ sku: 'SUA1', name: 'Sữa SUA1', unit: 'Lon', qty: 6 }] }] });
    expect(c.codes[0]).toMatch(/^DNC\d{4}-0001$/);
    const again = await ok('GET', `/api/v1/stock/transfer-suggest?branchCode=08000&asOf=${AS_OF}`);
    expect(again.lines.map((l: { shopCode: string }) => l.shopCode)).toEqual(['08002']);
    const list = await ok('GET', '/api/v1/stock/transfer-requests?status=open');
    expect(list[0]).toMatchObject({ toBranch: '08001', qty: 6, lineCount: 1 });
    await ok('POST', `/api/v1/stock/transfer-requests/${list[0].id}/done`);
    expect((await ok('GET', '/api/v1/stock/transfer-requests?status=done'))[0].doneBy).toBeTruthy();
  });

  it('công thức chuẩn: (100 − 64 − 0 − 6) + (32 − 16) + bán 7 ngày 14 − chưa nhập 12 = 48; tắt dự phòng bán → 34, gợi ý 30 / 36', async () => {
    await ok('POST', '/api/v1/purchase/documents', { kind: 'order', docDate: '2026-10-19', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false,
      lines: [{ lineKey: 'o1', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Thùng', qty: 2, price: 600000, taxCode: 'V08', lineType: 'buy' }] });
    const a = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}`);
    const row = a.rows.find((r: { sku: string }) => r.sku === 'SUA1');
    expect(row).toMatchObject({ maxKho: 100, tonKho: 64, diDuongShop: 6, maxShop: 32, tonShop: 16, banShop: 14, dangDat: 12, need: 48, options: [48], suggest: 48, partnerCode: 'NCC-HC', price: 100000, nccName: 'Sua bot SUA1 thung 6', nccNote: 'Giao thứ 3 hằng tuần' });
    const f = await ok('GET', '/api/v1/stock/formulas/08000');
    expect(f.saved).toBe(false);
    const terms = f.config.terms.map((t: { key: string; on: boolean }) => (t.key === 'banShop' ? { ...t, on: false } : t));
    await ok('PUT', '/api/v1/stock/formulas/08000', { ...f.config, terms });
    const b = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA1`);
    expect(b.rows[0]).toMatchObject({ need: 34, options: [30, 36], suggest: 36 });
    // Chỉ cộng tồn kho hàng (bỏ kho khuyến mại) — không đổi vì kho KM trống, nhưng cấu hình phải lưu được.
    const saved = await ok('PUT', '/api/v1/stock/formulas/08000', { ...f.config, terms, stockWarehouses: ['08-HH'] });
    expect(saved.config.stockWarehouses).toEqual(['08-HH']);
  });

  it('MH18 kho lấy min: bật Tồn min kho, chọn kho lấy min riêng; không chọn thì lấy min ở kho lấy max', async () => {
    await ok('PUT', '/api/v1/catalog/products/SUA9?new=true', { name: 'Sữa SUA9 (thử kho lấy min)', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }] });
    await ok('PUT', '/api/v1/stock/levels', { items: [
      { branchCode: '08000', warehouseCode: '08-HH', sku: 'SUA9', max: 50, min: 10 },
      { branchCode: '08000', warehouseCode: '08-KM', sku: 'SUA9', max: 0, min: 40 },
    ] });
    const f = await ok('GET', '/api/v1/stock/formulas/08000');
    const terms = f.config.terms.map((t: { key: string; on: boolean }) => (t.key === 'maxKho' ? { ...t, on: false } : t.key === 'minKho' ? { ...t, on: true } : t));
    await ok('PUT', '/api/v1/stock/formulas/08000', { ...f.config, terms, minWarehouses: [] });
    const macDinh = (await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA9`)).rows[0];
    expect(macDinh.minKho).toBe(10); // kho lấy max (08-HH)
    const saved = await ok('PUT', '/api/v1/stock/formulas/08000', { ...f.config, terms, minWarehouses: ['08-KM'] });
    expect(saved.config.minWarehouses).toEqual(['08-KM']);
    const rieng = (await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA9`)).rows[0];
    expect(rieng.minKho).toBe(40);
    expect(rieng.need - macDinh.need).toBe(30); // min 40 thay 10 → cần nhập thêm 30
    await ok('PUT', '/api/v1/stock/formulas/08000', f.config); // trả công thức về như cũ
  });

  it('shop bỏ ra khỏi công thức (MH18, shop nghỉ): không cộng max / tồn / đi đường / bán của shop đó; tích lại là tính lại; cây phân cấp giữ nguyên', async () => {
    const f = await ok('GET', '/api/v1/stock/formulas/08000');
    const base = (await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA1`)).rows[0];
    await ok('PUT', '/api/v1/stock/formulas/08000', { ...f.config, excludeShops: ['08002'] });
    const a = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA1`);
    expect(a.shops).toBe(1);
    expect(a.rows[0]).toMatchObject({ maxShop: base.maxShop - 12, diDuongShop: 0 });
    expect((await ok('GET', '/api/v1/stock/hierarchy')).branches.find((b: { code: string }) => b.code === '08002').parentCode).toBe('08000');
    await ok('PUT', '/api/v1/stock/formulas/08000', { ...f.config, excludeShops: [] });
    expect((await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA1`)).rows[0]).toMatchObject({ maxShop: base.maxShop, diDuongShop: base.diDuongShop });
  });

  it('NCC của mã ở phân tích đặt hàng: chưa nhập lần nào → NCC có bảng giá đang hiệu lực mới nhất (ô ĐVT không quyết định NCC); ghi rõ chọn theo nguồn nào, mã có mấy NCC', async () => {
    await call(ctx, 'PUT', '/api/v1/partners/NCC-B', { name: 'NCC B', kind: 'supplier' });
    await ok('POST', '/api/v1/purchase/supplier-products', { rows: [
      { partnerCode: 'NCC-HC', sku: 'SUA2', unit: 'Thùng', isDefaultUnit: true, price: 600000, priceIncludesVat: false, validFrom: '2026-09-01' },
      { partnerCode: 'NCC-B', sku: 'SUA2', unit: 'Lon', price: 98000, priceIncludesVat: false, validFrom: '2026-10-05' },
    ] }, 200);
    const a = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA2`);
    expect(a.rows[0]).toMatchObject({ partnerCode: 'NCC-B', partnerSource: 'bang_gia', nccCount: 2, price: 98000, baseUnit: 'Lon' });
    const c = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=SUA1`);
    expect(c.rows[0]).toMatchObject({ partnerCode: 'NCC-HC', partnerSource: 'bang_gia', nccCount: 1 });
  });

  it('phân tích đặt hàng theo HỌ MÃ: mã con (Q kẹp quà, Z) cộng dồn vào mã cha — một dòng, kèm chi tiết từng mã; hàng con còn nhiều thì không cần nhập thêm', async () => {
    for (const sku of ['110063076', '110063076Q', '110063076Z']) await ok('PUT', `/api/v1/catalog/products/${sku}?new=true`, { name: `Abbott Grow Gold ${sku}`, unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 12, isPurchaseDefault: true }] });
    await ok('PUT', '/api/v1/stock/levels', { items: [{ branchCode: '08000', warehouseCode: '08-HH', sku: '110063076', max: 60 }] });
    // Kho: mã chính 10 hộp, mã kẹp quà Q 25 hộp, mã Z 20 hộp → tồn họ 55.
    await doc({ docType: 'purchase', docKey: 'tm:NMF', branchCode: '08000', docNo: 'NMF', docDate: '2026-10-02', partner: { code: 'NCC-HC', name: 'Hùng Cường' },
      lines: [['110063076', 10], ['110063076Q', 25], ['110063076Z', 20]].map(([sku, qty], i) => ({ lineKey: `f${i}`, sku, name: String(sku), unit: 'Hộp', qty, amountBeforeTax: Number(qty) * 100000, taxCode: 'V08', taxAmount: Number(qty) * 8000, warehouseCode: '08-HH' })),
      totals: { beforeTax: 5500000, tax: 440000, total: 5940000 } });
    // Mặc định (MH26): đuôi Q, T tách riêng → Q kẹp quà là một dòng riêng; Z gộp vào mã cha (10 + 20).
    expect((await ok('GET', '/api/v1/purchase/variants')).separate).toEqual(['Q', 'T']);
    const d = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}`);
    const tach = d.rows.filter((r: { sku: string }) => r.sku.startsWith('110063076'));
    expect(tach.map((r: { sku: string; tonKho: number }) => [r.sku, r.tonKho]).sort()).toEqual([['110063076', 30], ['110063076Q', 25]]);
    // Chọn gộp mọi đuôi ở MH26 → một dòng mã cha cộng dồn cả họ như trước; lưu MH12 không làm mất cấu hình này.
    expect((await ok('PUT', '/api/v1/purchase/variants', { separate: [] })).separate).toEqual([]);
    const st = await ok('GET', '/api/v1/purchase/settings');
    await ok('PUT', '/api/v1/purchase/settings', { holidays: st.holidays, brandOpening: st.brandOpening, accounts: st.accounts, warnDays: st.warnDays, priceWarnPct: st.priceWarnPct, requireOrder: st.requireOrder });
    expect((await ok('GET', '/api/v1/purchase/variants')).separate).toEqual([]);
    const a = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}`);
    const fam = a.rows.filter((r: { sku: string }) => r.sku.startsWith('110063076'));
    expect(fam).toHaveLength(1);
    expect(fam[0]).toMatchObject({ sku: '110063076', tonKho: 55, maxKho: 60 });
    expect(fam[0].members.map((m: { sku: string; tonKho: number }) => [m.sku, m.tonKho])).toEqual([['110063076', 10], ['110063076Q', 25], ['110063076Z', 20]]);
    expect(fam[0].members[1].kind).toMatch(/Kẹp quà/);
    // Lọc theo mã con → ra họ của mã cha.
    const one = await ok('GET', `/api/v1/stock/order-analysis?branchCode=08000&asOf=${AS_OF}&sku=110063076Z`);
    expect(one.rows.map((r: { sku: string }) => r.sku)).toEqual(['110063076']);
  });

  it('mã hàng cha: tạo mới tự gợi ý theo mã; chỉ định tay mã khác tên; chặn 2 cấp; công cụ quét điền lại, giữ mã cha chỉnh tay', async () => {
    const get = async (s: string) => (await ok('GET', `/api/v1/catalog/products/${s}`)).parentSku as string | null;
    expect(await get('110063076Q')).toBe('110063076');
    expect(await get('110063076')).toBeNull();
    // Mã đặt tên khác nhưng bản chất là sản phẩm ấy → chỉ định tay.
    await ok('PUT', '/api/v1/catalog/products/ABBOTT-GOLD-HOP?new=true', { name: 'Abbott Gold hộp lẻ', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }], parentSku: '110063076' });
    expect(await get('ABBOTT-GOLD-HOP')).toBe('110063076');
    // Chỉ 1 cấp: mã cha không được là mã con; mã đang là cha không được gán cha.
    const bad1 = await call(ctx, 'PUT', '/api/v1/catalog/products/ABBOTT-GOLD-HOP', { parentSku: '110063076Q' });
    expect(bad1.status).toBe(400); expect(JSON.stringify(bad1.body)).toMatch(/chỉ 1 cấp/);
    const bad2 = await call(ctx, 'PUT', '/api/v1/catalog/products/110063076', { parentSku: 'SUA1' });
    expect(bad2.status).toBe(400); expect(JSON.stringify(bad2.body)).toMatch(/đang là mã cha/);
    // Cố ý bỏ mã cha của Z (chỉnh tay) → quét KHÔNG gán lại (kể cả quét lại cả); mã chỉnh tay khác tên giữ nguyên.
    await ok('PUT', '/api/v1/catalog/products/110063076Z', { parentSku: null });
    expect(await get('110063076Z')).toBeNull();
    expect((await call(ctx, 'POST', '/api/v1/catalog/products/scan-parents', { password: 'sai' })).status).toBe(403);
    await ok('POST', '/api/v1/catalog/products/scan-parents', { overwrite: true, password: 'Thuy!@#' }, 200);
    expect(await get('110063076Z')).toBeNull();
    expect(await get('ABBOTT-GOLD-HOP')).toBe('110063076');
    // Gán lại đúng mã cha theo mã (= gợi ý) thì hết "chỉnh tay"; xoá cha của mã chưa chỉnh tay ở CSDL → quét điền lại.
    await ok('PUT', '/api/v1/catalog/products/110063076Z', { parentSku: '110063076' });
    expect(await get('110063076Z')).toBe('110063076');
    // Danh sách mặt hàng trả mã cha.
    const list = await ok('GET', '/api/v1/products?search=110063076&pageSize=50');
    expect(list.find((p: { sku: string }) => p.sku === '110063076Q').parentSku).toBe('110063076');
  });

  it('hàng KHÔNG CHỊU THUẾ (KCT): khai thuế bán ra KCT → thuế mua vào tự V13K; phiếu nhập tiền thuế 0, duyệt ghi sổ được', async () => {
    await ok('PUT', '/api/v1/catalog/products/161539001?new=true', { name: 'Rong nho TASAMI 100g', unit: 'Gói', taxOutCode: 'KCT', units: [{ unit: 'Gói', ratio: 1, isDefault: true }] });
    expect((await ok('GET', '/api/v1/catalog/products/161539001')).taxInCode).toBe('V13K');
    const d = await ok('POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Phép thử KCT' }, docDate: '2026-10-21', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false,
      lines: [{ lineKey: 'k1', sku: '161539001', name: 'Rong nho', unit: 'Gói', qty: 10, price: 50000, taxCode: 'V13K', lineType: 'buy' }] });
    expect(d.totals).toMatchObject({ beforeTax: 500000, tax: 0, total: 500000 });
    const ap = await call(ctx, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    // Danh sách chứng từ: người tạo / người duyệt hiện "email đăng nhập (Họ tên)" + thời điểm tạo, duyệt.
    const row = ((await ok('GET', '/api/v1/purchase/documents')) as { id: string; createdByLabel?: string; approvedByLabel?: string; createdAt?: string; approvedAt?: string }[]).find((x) => x.id === d.id)!;
    expect(row.createdByLabel).toMatch(/@/);
    expect(row.approvedByLabel).toMatch(/@/);
    expect(row.createdAt && row.approvedAt).toBeTruthy();
    // Bán ra hàng KCT: mã thuế KCT, tiền thuế 0 — ghi sổ được.
    const sale = await doc({ docType: 'sale', docKey: 'tm:HDKCT', branchCode: '08000', docNo: 'HDKCT', docDate: '2026-10-21', partner: { code: 'KL', name: 'Khách lẻ' },
      lines: [{ lineKey: 'l1', sku: '161539001', name: 'Rong nho', unit: 'Gói', qty: 2, amountBeforeTax: 140000, taxCode: 'KCT', taxAmount: 0 }], payments: [{ methodCode: 'TM', amount: 140000 }], totals: { beforeTax: 140000, tax: 0, total: 140000 } });
    expect(sale.status).toBeLessThan(300);
  });

  it('đơn đặt lưu số liệu tồn lúc đặt (cả họ mã, đủ max / đi đường / bán) — mở lại vẫn là số lúc đặt, không tính lại', async () => {
    const family = [
      { sku: '110063076', kind: 'Mã chính', tonKho: 10, tonShop: 2, banShop: 3, dangDat: 0, maxKho: 60, maxShop: 12, diDuong: 1, banThangTruoc: 9 },
      { sku: '110063076Q', kind: 'Kẹp quà (Q)', tonKho: 25, tonShop: 0, banShop: 0, dangDat: 0, maxKho: 0, maxShop: 0, diDuong: 0, banThangTruoc: 0 },
    ];
    const stockInfo = { need: 20, tonKho: 35, tonShop: 2, maxKho: 60, maxShop: 12, diDuong: 1, dangDat: 0, banShop: 3, banThangTruoc: 9 };
    const d = await ok('POST', '/api/v1/purchase/documents', { kind: 'order', docDate: '2026-10-20', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false,
      lines: [{ lineKey: 'o1', sku: '110063076', name: 'Abbott', unit: 'Hộp', qty: 24, price: 100000, taxCode: 'V08', lineType: 'buy', stockInfo, family }] });
    const back = (await ok('GET', `/api/v1/purchase/documents/${d.id}`)).doc;
    expect(back.lines[0].stockInfo).toEqual(stockInfo);
    expect(back.lines[0].family).toEqual(family);
  });

  it('phiếu đăng ký max của shop: gợi ý sẵn; duyệt thì ghi max; lệch nhỏ thì duyệt tự động', async () => {
    const sug = await ok('GET', '/api/v1/stock/max-requests/suggest?branchCode=08001');
    expect(sug.find((x: { sku: string }) => x.sku === 'SUA1')).toMatchObject({ currentMax: 20 });
    const r = await ok('POST', '/api/v1/stock/max-requests', { branchCode: '08001', submit: true, items: [{ key: 'SUA1', sku: 'SUA1', name: 'Sữa SUA1', proposedMax: 14 }] });
    expect(r).toMatchObject({ status: 'submitted', parentCode: '08000', items: [{ currentMax: 20, proposedMax: 14 }] });
    const ap = await ok('POST', `/api/v1/stock/max-requests/${r.id}/approve`);
    expect(ap.status).toBe('approved');
    expect((await ok('GET', '/api/v1/stock/levels?branchCodes=08001&skus=SUA1'))[0]).toMatchObject({ max: 14, source: 'request' });
    const f = (await ok('GET', '/api/v1/stock/formulas/08000')).config;
    await ok('PUT', '/api/v1/stock/formulas/08000', { ...f, autoApprovePct: 20 });
    const auto = await ok('POST', '/api/v1/stock/max-requests', { branchCode: '08001', submit: true, items: [{ key: 'SUA1', sku: 'SUA1', proposedMax: 16 }] });
    expect(auto.status).toBe('approved');
    expect(auto.approvedBy).toMatch(/Tự động/);
    const big = await ok('POST', '/api/v1/stock/max-requests', { branchCode: '08001', submit: true, items: [{ key: 'SUA1', sku: 'SUA1', proposedMax: 40 }] });
    expect(big.status).toBe('submitted');
  });

  it('phiếu hàng mới: bảng mặt hàng × shop, duyệt khi chưa có mã thì chờ; gắn mã thì ghi max cho từng shop', async () => {
    const r = await ok('POST', '/api/v1/stock/max-requests', { kind: 'new_item', branchCode: '08000', submit: true, items: [{ key: 'n1', sku: '', name: 'Sữa mới NCC gửi', nccSku: 'HC-77', maxByShop: { '08001': 6, '08002': 12 } }] });
    const ap = await ok('POST', `/api/v1/stock/max-requests/${r.id}/approve`);
    expect(ap).toMatchObject({ status: 'approved', unlinked: 1, pendingApply: 1 });
    const linked = await ok('PUT', `/api/v1/stock/max-requests/${r.id}`, { kind: 'new_item', branchCode: '08000', items: [{ ...ap.items[0], sku: 'SUA2' }] });
    expect(linked).toMatchObject({ unlinked: 0, pendingApply: 0 });
    const lv = await ok('GET', '/api/v1/stock/levels?skus=SUA2');
    expect(lv.map((l: { branchCode: string; max: number }) => [l.branchCode, l.max])).toEqual([['08001', 6], ['08002', 12]]);
    const shop = await call(ctx, 'POST', '/api/v1/stock/max-requests', { kind: 'new_item', branchCode: '08001', items: [{ key: 'x', name: 'Hàng mới' }] });
    expect(shop.status).toBe(400);
  });

  it('đơn đặt có dòng hàng mới chưa có mã: lưu được; phiếu nhập phải gắn mã; gắn xong ghi ngược mã vào đơn', async () => {
    const o = await ok('POST', '/api/v1/purchase/documents', { kind: 'order', docDate: '2026-10-20', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false, budget: 5000000,
      lines: [{ lineKey: 'n1', sku: '', name: 'Sữa mới NCC gửi', unit: 'Thùng', qty: 3, price: 500000, taxCode: 'V08', lineType: 'buy', newItem: true, nccSku: 'HC-77', note: 'hàng mới, gắn mã khi về' }] });
    expect(o.checks.map((c: { code: string }) => c.code)).toContain('new_item');
    expect(o.budget).toBe(5000000);
    const bad = await ok('POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-21', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false, refIds: [o.id],
      lines: [{ lineKey: 'r1', sku: '', name: 'Sữa mới NCC gửi', unit: 'Thùng', qty: 3, price: 500000, taxCode: 'V08', lineType: 'buy', refLineKey: 'n1' }] });
    expect(bad.checks.find((c: { code: string }) => c.code === 'new_item_unlinked')).toMatchObject({ blocking: true });
    await ok('PUT', `/api/v1/purchase/documents/${bad.id}`, { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-21', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false, refIds: [o.id],
      lines: [{ lineKey: 'r1', sku: 'SUA2', name: 'Sữa SUA2', unit: 'Thùng', qty: 3, price: 500000, taxCode: 'V08', lineType: 'buy', refLineKey: 'n1' }] });
    const order = await ok('GET', `/api/v1/purchase/documents/${o.id}`);
    expect((order.doc ?? order).lines[0]).toMatchObject({ sku: 'SUA2', newItem: true, nccSku: 'HC-77', note: 'hàng mới, gắn mã khi về' });
  });
});

describe('Nhập dữ liệu khởi đầu (MH20)', () => {
  it('giá mua: giá = TT trước VAT ÷ SL dòng mới nhất, bỏ dòng TT < 1, tạo NCC mới, chạy lại thì đè', async () => {
    const rows = [
      { supplierCode: 'NC-KD1', supplierName: 'NCC khởi đầu', sku: 'SUA1', qty: 10, totalBeforeVat: 900000, date: '01/09/2026' },
      { supplierCode: 'NC-KD1', sku: 'SUA1', qty: 12, totalBeforeVat: 1200000, date: '05/10/2026' },
      { supplierCode: 'NC-KD1', sku: 'SUA1', qty: 2, totalBeforeVat: 0, date: '06/10/2026' },
      { supplierCode: 'NC-KD1', sku: 'SUA2', unit: 'Thùng', qty: 2, totalBeforeVat: 1300000 },
      { supplierCode: 'NC-KD1', sku: 'KHONGCO', qty: 1, totalBeforeVat: 5000 },
    ];
    const pv = await ok('POST', '/api/v1/stock/init/prices/preview', { rows }, 200);
    expect(pv.rows.find((r: { sku: string }) => r.sku === 'SUA1')).toMatchObject({ price: 100000, unit: 'Lon', status: 'new' });
    expect(pv.rows.find((r: { sku: string }) => r.sku === 'SUA2')).toMatchObject({ price: 650000, unit: 'Thùng' });
    expect(pv.rows.find((r: { sku: string }) => r.sku === 'KHONGCO').status).toBe('error');
    expect(pv.skipped.badTotal).toBe(1);
    const im = await ok('POST', '/api/v1/stock/init/prices/import', { rows }, 200);
    expect(im).toMatchObject({ added: 2, createdSuppliers: 1, errors: 1 });
    const again = await ok('POST', '/api/v1/stock/init/prices/import', { rows: [{ supplierCode: 'NC-KD1', sku: 'SUA1', qty: 1, totalBeforeVat: 110000 }] }, 200);
    expect(again).toMatchObject({ added: 0, updated: 1 });
  });

  it('cân tồn: tệp kho 08001 → chênh lệch +/−, mã có trên sổ mà tệp không có cân về 0; ghi phiếu điều chỉnh rồi tồn khớp tệp', async () => {
    const body = { docDate: '2026-10-20', zeroMissing: true, rows: [{ kho: '08001', sku: 'SUA2', qty: 5 }, { kho: 'KHO-LA', sku: 'SUA1', qty: 1 }] };
    const pv = await ok('POST', '/api/v1/stock/init/reconcile/preview', body, 200);
    expect(pv.unknownKho).toEqual(['KHO-LA']);
    const r = (sku: string) => pv.rows.find((x: { sku: string; branchCode: string }) => x.sku === sku && x.branchCode === '08001');
    expect(r('SUA2')).toMatchObject({ fileQty: 5, bookQty: 0, diff: 5, status: 'up' });
    expect(r('SUA1')).toMatchObject({ fileQty: null, bookQty: 16, diff: -16, status: 'down', onlyBook: true });
    const ap = await ok('POST', '/api/v1/stock/init/reconcile/import', body, 200);
    expect(ap.created).toHaveLength(1);
    expect(ap.created[0]).toMatchObject({ branchCode: '08001', warehouseCode: '08001', up: 1, down: 1 });
    const after = await ok('POST', '/api/v1/stock/init/reconcile/preview', body, 200);
    expect(after.rows.filter((x: { status: string }) => x.status === 'up' || x.status === 'down')).toEqual([]);
  });

  it('tồn max từ tệp: Kho = mã kho (hoặc mã chi nhánh), đè mức cũ, min = 0', async () => {
    const pv = await ok('POST', '/api/v1/stock/init/max/preview', { rows: [{ kho: '08002', sku: 'SUA1', max: 30 }, { kho: '08-HH', sku: 'SUA2', max: 50 }, { kho: 'XX', sku: 'SUA1', max: 1 }] }, 200);
    expect(pv).toMatchObject({ update: 1, new: 1, errors: 1 });
    await ok('POST', '/api/v1/stock/init/max/import', { rows: [{ kho: '08002', sku: 'SUA1', max: 30 }, { kho: '08-HH', sku: 'SUA2', max: 50 }] }, 200);
    const lv = await ok('GET', '/api/v1/stock/levels?skus=SUA1,SUA2&branchCodes=08002,08000');
    expect(lv.map((l: { branchCode: string; warehouseCode: string; sku: string; max: number }) => `${l.branchCode}/${l.warehouseCode}/${l.sku}=${l.max}`).sort()).toEqual(['08000/08-HH/SUA1=100', '08000/08-HH/SUA2=50', '08002/08002/SUA1=30', '08002/08002/SUA2=12']);
  });
});

describe('Tổng hợp mua hàng — ĐVT nhỏ nhất và ĐVT trên hoá đơn', () => {
  it('nhập 2 Thùng (6 Lon / thùng) + 4 Lon: SL mua 16 Lon; theo hoá đơn "2 Thùng + 4 Lon"', async () => {
    const d = await ok('POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-22', branchCode: '08000', partnerCode: 'NCC-HC', priceIncludesVat: false,
      lines: [{ lineKey: 'a', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Thùng', qty: 2, price: 600000, taxCode: 'V08', lineType: 'buy' }, { lineKey: 'b', sku: 'SUA1', name: 'Sữa SUA1', unit: 'Lon', qty: 4, price: 100000, taxCode: 'V08', lineType: 'buy' }] });
    await ok('POST', `/api/v1/purchase/documents/${d.id}/approve`, undefined, 200);
    const s = await ok('GET', '/api/v1/purchase/summary?from=2026-10-22&to=2026-10-22&groupBy=sku');
    expect(s.rows.find((r: { key: string }) => r.key === 'SUA1')).toMatchObject({ baseUnit: 'Lon', buyQty: 16, invoiceUnit: 'Thùng, Lon', invoiceQty: null, invoiceQtyText: '2 Thùng + 4 Lon' });
  });
});
