// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — NT-HT-001: sơ đồ tổ chức làm gốc, phân cấp chi nhánh tính từ cây (đóng góp)
// [2026-11-03 02:10 PM Nguyễn Văn Thủy] SDTC — kho nhận hàng tự lấy chi nhánh xx000 của nút cấp 2, bỏ chọn tay (đóng góp)
// [2026-11-20 Nguyễn Văn Thủy] cây đơn vị một bảng (0173, 0174): dựng cây qua /api/v1/co-cau/units; bỏ ý nhập cây cũ / quay về dữ liệu gốc (tính năng đã bỏ) (đóng góp)
/**
 * NT-HT-001 — Cơ cấu tổ chức làm gốc phân cấp mua hàng, chạy trên PostgreSQL thật.
 * Cây thu nhỏ theo dữ liệu thật: Công ty → BAC → PT (PTO, LCI) / ND (NDH) / HOTGS; cửa hàng là đơn vị con của tỉnh.
 * Kho nhận hàng của PT tự là 08000 (mã xx000, nhiều phân kho nhất) → mọi cửa hàng trong PT (kể cả 26000 HO Lào Cai) là shop của 08000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ok = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, body?: unknown, status = method === 'POST' ? 201 : 200) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBe(status);
  return r.body.data;
};
const fails = async (method: 'POST' | 'PUT' | 'PATCH', url: string, body: unknown, text: string) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(r.body)).toContain(text);
};
const SEP = String.fromCharCode(92);
const pathOf = (...codes: string[]) => codes.join(SEP);

interface HBranch { code: string; level: string; parentCode: string | null }
const hierarchy = async () => new Map(((await ok('GET', '/api/v1/stock/hierarchy')).branches as HBranch[]).map((b) => [b.code, b]));
const node = async (code: string) => (await ok('GET', '/api/v1/org-units/tree')).nodes.find((n: { code: string }) => n.code === code);
const nhom = (code: string, name: string, parentCode: string) => ok('POST', '/api/v1/co-cau/units', { code, name, parentCode, levelLabel: parentCode ? 'Nhóm' : 'Công ty' });
const thuoc = (code: string, parentCode: string) => ok('PATCH', `/api/v1/co-cau/units/${encodeURIComponent(code)}`, { parentCode });

const NODES = [
  ['Công ty', 'Công ty', ''], ['BAC', 'Miền Bắc', 'Công ty'], ['PT', 'Chi nhánh Phú Thọ', 'BAC'], ['PTO', 'CN tại Phú Thọ', 'PT'],
  ['LCI', 'BAC PT LCI', 'PT'], ['ND', 'Chi nhánh Nam Định', 'BAC'], ['NDH', 'CN tại Nam Định', 'ND'], ['HOTGS', 'BAC HOTGS', 'BAC'],
];
const ASSIGN = [['08000', 'PTO'], ['08001', 'PTO'], ['26000', 'LCI'], ['26001Premium', 'LCI'], ['01000', 'NDH'], ['01001', 'NDH'], ['00000', 'HOTGS']];

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['08000', 'CN Phú Thọ'], ['08001', 'Lâm Thao'], ['26000', 'HO Lào Cai'], ['26001Premium', 'Bảo Hà'], ['01000', 'CN Nam Định'], ['01001', 'Trần Huy Liệu'], ['00000', 'HO TGS']]) await ok('POST', '/api/v1/branches', { code, name });
  for (const [code, branchCode, isDefault] of [['08-HH', '08000', true], ['08-KM', '08000', false], ['08-CC', '08000', false], ['08001', '08001', true], ['26-HH', '26000', true], ['26001', '26001Premium', true], ['01-HH', '01000', true], ['01-KM', '01000', false], ['01001', '01001', true], ['00-HH', '00000', true]] as const) {
    await ok('POST', '/api/v1/warehouses', { code, branchCode, name: `Kho ${code}`, isDefault });
  }
  for (const [code, name, parentCode] of NODES) await nhom(code!, name!, parentCode!);
  for (const [code, parentCode] of ASSIGN) await thuoc(code!, parentCode!);
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-HT-001 — Cơ cấu tổ chức làm gốc phân cấp mua hàng', () => {
  it('cây: cấp, đường dẫn tự tính; kho nhận hàng của PT tự là 08000', async () => {
    const tree = await ok('GET', '/api/v1/org-units/tree');
    expect(tree.nodes.find((n: { code: string }) => n.code === 'PT')).toMatchObject({ level: 2, path: pathOf('Công ty', 'BAC', 'PT'), purchaseBranchCode: '08000', totalBranches: 4 });
    expect(tree.nodes.find((n: { code: string }) => n.code === 'LCI')).toMatchObject({ level: 3, totalBranches: 2 });
    expect(tree.nodes.find((n: { code: string }) => n.code === 'Công ty')).toMatchObject({ level: 0, totalBranches: 7 });
    expect(tree.branches.find((b: { code: string }) => b.code === '08000').warehouses.map((w: { code: string }) => w.code)).toEqual(['08-CC', '08-HH', '08-KM']);
    const units = await ok('GET', '/api/v1/org-units/purchase-units');
    expect(units.find((u: { orgCode: string }) => u.orgCode === 'PT')).toMatchObject({ branchCode: '08000', childUnits: 2, branches: 4 });
    expect(units.find((u: { orgCode: string }) => u.orgCode === 'ND')).toMatchObject({ branchCode: '01000' });
  });

  it('phân cấp tính từ cây: 26000 Lào Cai là shop của 08000 (không còn là chi nhánh cha riêng)', async () => {
    const h = await hierarchy();
    expect(h.get('08000')).toMatchObject({ level: 'branch', parentCode: null });
    expect(h.get('26000')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('26001Premium')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('08001')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('01001')).toMatchObject({ level: 'shop', parentCode: '01000' });
    expect(h.get('00000')).toMatchObject({ level: 'branch', parentCode: null });
  });

  it('đổi "Thuộc" của chi nhánh ở DM02 thì đổi nơi nhận hàng', async () => {
    const b = await ok('PATCH', '/api/v1/branches/08001', { orgUnitCode: 'NDH' });
    expect(b).toMatchObject({ orgUnitCode: 'NDH', orgPath: pathOf('Công ty', 'BAC', 'ND', 'NDH') });
    expect((await hierarchy()).get('08001')).toMatchObject({ level: 'shop', parentCode: '01000' });
    await ok('PATCH', '/api/v1/branches/08001', { orgUnitCode: 'PTO' });
    expect((await hierarchy()).get('08001')).toMatchObject({ level: 'shop', parentCode: '08000' });
  });

  it('lệch chuẩn: vòng lặp cha – con, trùng mã — bị chặn; nhiều gốc được; đơn vị trống xoá được', async () => {
    await fails('PATCH', '/api/v1/co-cau/units/PT', { parentCode: 'PTO' }, 'PTO');
    await fails('PATCH', '/api/v1/branches/PT', { orgUnitCode: 'LCI' }, 'đơn vị con');
    await nhom('GOC2', 'Gốc thứ hai', '');
    expect(await node('GOC2')).toMatchObject({ level: 0, parentCode: null, kind: 'company' });
    await fails('POST', '/api/v1/co-cau/units', { code: 'PT', name: 'Trùng', parentCode: 'BAC' }, 'PT');
    await nhom('TAM', 'Đơn vị tạm', 'PT');
    expect((await call(ctx, 'POST', '/api/v1/co-cau/delete', { key: 'u:TAM', dryRun: false })).status).toBeLessThan(300);
    expect(await node('TAM')).toBeUndefined();
  });

  it('thêm tỉnh mới dưới PT, đặt cửa hàng vào → tự là shop của 08000', async () => {
    await ok('POST', '/api/v1/branches', { code: '18010', name: 'Yên Bái 10' });
    await nhom('YBI', 'CN tại Yên Bái', 'PT');
    await thuoc('18010', 'YBI');
    expect(await node('YBI')).toMatchObject({ level: 3, path: pathOf('Công ty', 'BAC', 'PT', 'YBI') });
    expect((await hierarchy()).get('18010')).toMatchObject({ level: 'shop', parentCode: '08000' });
  });

  it('phân cấp cũ (tự xếp theo mã) bị chặn khi đã có đơn vị mua hàng', async () => {
    const r = await call(ctx, 'POST', '/api/v1/stock/hierarchy/auto', { overwrite: true });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toContain('sơ đồ tổ chức');
  });
});

describe('NT-HT-001 — phân tích đặt hàng gộp nhiều chi nhánh', () => {
  it('tích Phú Thọ + Nam Định: mã có tồn max ở cả hai thì cộng số của từng chi nhánh (mỗi chi nhánh theo công thức của nó)', async () => {
    await ok('PUT', '/api/v1/catalog/products/SDTC1?new=true', { name: 'Sữa thử SĐTC', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }] }, 200);
    await ok('PUT', '/api/v1/stock/levels', { items: [{ branchCode: '08000', sku: 'SDTC1', max: 10 }, { branchCode: '01000', sku: 'SDTC1', max: 20 }] });
    const one = await ok('GET', '/api/v1/stock/order-analysis?branchCode=08000&sku=SDTC1');
    const two = await ok('GET', '/api/v1/stock/order-analysis?branchCode=01000&sku=SDTC1');
    const both = await ok('GET', '/api/v1/stock/order-analysis?branchCode=08000,01000&sku=SDTC1');
    const r1 = one.rows[0], r2 = two.rows[0], rb = both.rows[0];
    expect(rb.maxKho).toBe(r1.maxKho + r2.maxKho);
    expect(rb.need).toBe(r1.need + r2.need);
    expect(rb.need).toBe(30);
    expect(both.parent.code).toBe('08000,01000');
  });
});
