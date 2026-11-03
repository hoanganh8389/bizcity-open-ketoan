// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — NT-HT-001: sơ đồ tổ chức làm gốc, phân cấp chi nhánh tính từ cây (đóng góp)
// [2026-11-03 02:10 PM Nguyễn Văn Thủy] SDTC — kho nhận hàng tự lấy chi nhánh xx000 của nút cấp 2, bỏ chọn tay (đóng góp)
/**
 * NT-HT-001 — Sơ đồ tổ chức (docs/nghiem-thu/he-thong/NT-HT-001-so-do-to-chuc.md), chạy trên PostgreSQL thật.
 * Cây thu nhỏ theo dữ liệu thật: Công ty → BAC → PT (PTO, LCI) / ND (NDH) / HOTGS.
 * Kho nhận hàng của PT tự là 08000 (mã xx000, nhiều kho nhất) → mọi chi nhánh trong PT (kể cả 26000 HO Lào Cai) là shop của 08000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ok = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, body?: unknown, status = method === 'POST' && !url.endsWith('/import') && !url.endsWith('/restore-defaults') ? 201 : 200) => {
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

const NODES = [
  { code: 'Công ty', name: 'Công ty' },
  { code: 'BAC', name: 'Miền Bắc', parentCode: 'Công ty', shortCode: '12' },
  { code: 'PT', name: 'Chi nhánh Phú Thọ', parentCode: 'BAC' },
  { code: 'PTO', name: 'CN tại Phú Thọ', parentCode: 'PT' },
  { code: 'LCI', name: 'BAC PT LCI', parentCode: 'PT' },
  { code: 'ND', name: 'Chi nhánh Nam Định', parentCode: 'BAC' },
  { code: 'NDH', name: 'CN tại Nam Định', parentCode: 'ND' },
  { code: 'HOTGS', name: 'BAC HOTGS', parentCode: 'BAC' },
];
const ASSIGN = [
  { branchCode: '08000', orgCode: 'PTO' }, { branchCode: '08001', orgCode: 'PTO' },
  { branchCode: '26000', orgCode: 'LCI' }, { branchCode: '26001Premium', orgCode: 'LCI' },
  { branchCode: '01000', orgCode: 'NDH' }, { branchCode: '01001', orgCode: 'NDH' },
  { branchCode: '00000', orgCode: 'HOTGS' },
];

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['08000', 'CN Phú Thọ'], ['08001', 'Lâm Thao'], ['26000', 'HO Lào Cai'], ['26001Premium', 'Bảo Hà'], ['01000', 'CN Nam Định'], ['01001', 'Trần Huy Liệu'], ['00000', 'HO TGS']]) await ok('POST', '/api/v1/branches', { code, name });
  for (const [code, branchCode, isDefault] of [['08-HH', '08000', true], ['08-KM', '08000', false], ['08-CC', '08000', false], ['08001', '08001', true], ['26-HH', '26000', true], ['26001', '26001Premium', true], ['01-HH', '01000', true], ['01-KM', '01000', false], ['01001', '01001', true], ['00-HH', '00000', true]] as const) {
    await ok('POST', '/api/v1/warehouses', { code, branchCode, name: `Kho ${code}`, isDefault });
  }
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-HT-001 — Sơ đồ tổ chức làm gốc', () => {
  it('xem trước (dryRun) không lưu gì; lỗi từng dòng được báo, không lưu', async () => {
    const dry = await ok('POST', '/api/v1/org-units/import', { nodes: NODES, assignments: ASSIGN, dryRun: true });
    expect(dry).toMatchObject({ created: 8, assigned: 7, errorCount: 0, saved: false });
    expect((await ok('GET', '/api/v1/org-units/tree')).nodes).toHaveLength(0);
    const bad = await ok('POST', '/api/v1/org-units/import', { nodes: NODES, assignments: [...ASSIGN, { branchCode: '99999', orgCode: 'PTO' }] });
    expect(bad.saved).toBe(false);
    expect(bad.errors[0]).toMatchObject({ sheet: 'Gắn chi nhánh', code: '99999' });
    expect((await ok('GET', '/api/v1/org-units/tree')).nodes).toHaveLength(0);
  });

  it('nhập cây + gắn chi nhánh: cấp, đường dẫn tự tính; kho nhận hàng của PT tự là 08000', async () => {
    const res = await ok('POST', '/api/v1/org-units/import', { nodes: NODES, assignments: ASSIGN });
    expect(res).toMatchObject({ created: 8, assigned: 7, errorCount: 0, saved: true });
    const tree = await ok('GET', '/api/v1/org-units/tree');
    expect(tree.nodes.find((n: { code: string }) => n.code === 'PT')).toMatchObject({ level: 2, path: pathOf('Công ty', 'BAC', 'PT'), purchaseBranchCode: '08000', totalBranches: 4 });
    expect(tree.nodes.find((n: { code: string }) => n.code === 'LCI')).toMatchObject({ level: 3, totalBranches: 2 });
    expect(tree.nodes.find((n: { code: string }) => n.code === 'Công ty')).toMatchObject({ level: 0, totalBranches: 7 });
    expect(tree.branches.find((b: { code: string }) => b.code === '08000').warehouses.map((w: { code: string }) => w.code)).toEqual(['08-CC', '08-HH', '08-KM']);
    const units = await ok('GET', '/api/v1/org-units/purchase-units');
    expect(units.find((u: { orgCode: string }) => u.orgCode === 'PT')).toMatchObject({ branchCode: '08000', childUnits: 2, branches: 4 });
    expect(units.find((u: { orgCode: string }) => u.orgCode === 'ND')).toMatchObject({ branchCode: '01000' });
  });

  it('phân cấp chi nhánh tính từ cây: 26000 Lào Cai là shop của 08000 (không còn là chi nhánh cha riêng)', async () => {
    const h = await hierarchy();
    expect(h.get('08000')).toMatchObject({ level: 'branch', parentCode: null });
    expect(h.get('26000')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('26001Premium')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('08001')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('01001')).toMatchObject({ level: 'shop', parentCode: '01000' });
    expect(h.get('00000')).toMatchObject({ level: 'branch', parentCode: null });
  });

  it('đổi "Thuộc SĐTC" của chi nhánh ở DM02 thì đổi nơi nhận hàng', async () => {
    const b = await ok('PATCH', '/api/v1/branches/08001', { orgUnitCode: 'NDH' });
    expect(b).toMatchObject({ orgUnitCode: 'NDH', orgPath: pathOf('Công ty', 'BAC', 'ND', 'NDH') });
    expect((await hierarchy()).get('08001')).toMatchObject({ level: 'shop', parentCode: '01000' });
    await ok('PATCH', '/api/v1/branches/08001', { orgUnitCode: 'PTO' });
    expect((await hierarchy()).get('08001')).toMatchObject({ level: 'shop', parentCode: '08000' });
  });

  it('lệch chuẩn: vòng lặp cha – con, hai gốc, trùng mã, ngừng dùng nút còn chi nhánh — đều bị chặn', async () => {
    await fails('PATCH', '/api/v1/org-units/PT', { parentCode: 'PTO' }, 'bên dưới chính nhánh');
    await fails('POST', '/api/v1/org-units', { code: 'GOC2', name: 'Gốc thứ hai' }, 'Đã có gốc');
    await fails('POST', '/api/v1/org-units', { code: 'PT', name: 'Trùng', parentCode: 'BAC' }, 'đã có');
    await fails('PATCH', '/api/v1/org-units/PTO', { isActive: false }, 'còn chi nhánh đang dùng');
    // [2026-11-03 03:10 PM Nguyễn Văn Thủy] SDTC — Xoá nút: chặn khi còn chi nhánh / nút con; nút trống xoá được
    const d1 = await call(ctx, 'DELETE', '/api/v1/org-units/PTO');
    expect(d1.status).toBeGreaterThanOrEqual(400); expect(JSON.stringify(d1.body)).toContain('còn chi nhánh');
    const d2 = await call(ctx, 'DELETE', '/api/v1/org-units/PT');
    expect(d2.status).toBeGreaterThanOrEqual(400); expect(JSON.stringify(d2.body)).toContain('còn nút con');
    await ok('POST', '/api/v1/org-units', { code: 'TAM', name: 'Nút tạm', parentCode: 'PT' });
    expect((await call(ctx, 'DELETE', '/api/v1/org-units/TAM')).status).toBe(200);
    expect(await node('TAM')).toBeUndefined();
  });

  it('thêm tỉnh mới dưới PT, gắn chi nhánh → tự là shop của 08000', async () => {
    await ok('POST', '/api/v1/branches', { code: '18010', name: 'Yên Bái 10' });
    await ok('POST', '/api/v1/org-units', { code: 'YBI', name: 'CN tại Yên Bái', parentCode: 'PT' });
    expect(await node('YBI')).toMatchObject({ level: 3, path: pathOf('Công ty', 'BAC', 'PT', 'YBI') });
    await ok('PUT', '/api/v1/org-units/YBI/branches', { branchCodes: ['18010'] });
    expect((await hierarchy()).get('18010')).toMatchObject({ level: 'shop', parentCode: '08000' });
  });

  it('phân cấp cũ (tự xếp theo mã) bị chặn khi đã có sơ đồ tổ chức', async () => {
    const r = await call(ctx, 'POST', '/api/v1/stock/hierarchy/auto', { overwrite: true });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toContain('sơ đồ tổ chức');
  });
});

describe('NT-HT-001 — chi nhánh đổi đuôi mã (Plus / Premium / _OFF)', () => {
  it('tệp ghi 08014Premium, danh mục có 08014 → gắn được, báo đã khớp theo 5 số đầu; hai chi nhánh cùng 5 số thì không đoán', async () => {
    await ok('POST', '/api/v1/branches', { code: '08014', name: 'Shop 14' });
    await ok('POST', '/api/v1/branches', { code: '08015', name: 'Shop 15' });
    await ok('POST', '/api/v1/branches', { code: '08015_OFF', name: 'Shop 15 cũ' });
    const r = await ok('POST', '/api/v1/org-units/import', { assignments: [{ branchCode: '08014Premium', orgCode: 'PTO' }] });
    expect(r).toMatchObject({ saved: true, assigned: 1, renamed: [{ from: '08014Premium', to: '08014' }] });
    expect((await hierarchy()).get('08014')).toMatchObject({ level: 'shop', parentCode: '08000' });
    const bad = await ok('POST', '/api/v1/org-units/import', { assignments: [{ branchCode: '08015Plus', orgCode: 'PTO' }] });
    expect(bad).toMatchObject({ saved: false, errorCount: 1 });
  });
});

describe('NT-HT-001 — quay về dữ liệu gốc (db/seeds/so-do-to-chuc*.jsonl)', () => {
  it('nghịch lung tung rồi quay về gốc: cây và gắn chi nhánh đúng như tệp; nút tự thêm trống thì xoá', async () => {
    expect(await ok('GET', '/api/v1/org-units/defaults')).toMatchObject({ nodes: 51, assignments: 743 });
    await ok('POST', '/api/v1/org-units', { code: 'NGHICH', name: 'Nút thử', parentCode: 'PT' });
    await ok('PATCH', '/api/v1/branches/26001Premium', { orgUnitCode: 'NDH' });
    const r = await ok('POST', '/api/v1/org-units/restore-defaults', { confirm: true });
    expect(r.removed).toBeGreaterThanOrEqual(1);
    const tree = await ok('GET', '/api/v1/org-units/tree');
    expect(tree.nodes).toHaveLength(51);
    expect(tree.nodes.some((n: { code: string }) => n.code === 'NGHICH')).toBe(false);
    expect(tree.nodes.find((n: { code: string }) => n.code === 'PT')).toMatchObject({ purchaseBranchCode: '08000', path: pathOf('Công ty', 'BAC', 'PT') });
    const h = await hierarchy();
    expect(h.get('26000')).toMatchObject({ level: 'shop', parentCode: '08000' });
    expect(h.get('26001Premium')).toMatchObject({ level: 'shop', parentCode: '08000' });
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
