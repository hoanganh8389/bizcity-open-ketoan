/**
 * Danh mục kho (DM12) và lọc báo cáo kho theo kho; đổi mã chi nhánh (shop lên Premium / đóng _OFF).
 * Luật kho: mã duy nhất ≤ 12 ký tự, tên bắt buộc, mỗi chi nhánh một kho khuyến mại, kho đã có nhập xuất không chuyển chi nhánh /
 * không xoá. Dòng nhập xuất không ghi mã kho tính vào kho mặc định của chi nhánh.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'POST', '/api/v1/branches', { code: '08000', name: 'CN Phú Thọ' });
  await call(ctx, 'POST', '/api/v1/branches', { code: '08016Plus', name: 'Đền Hùng' });
});
afterAll(async () => {
  await ctx.app.close();
});

const wh = (body: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/warehouses', body);
const purchase = (key: string, warehouseCode: string | undefined, qty: number) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'purchase', docKey: key, branchCode: '08000', docNo: key, docDate: '2026-10-03',
  partner: { code: 'NCC-VNM', name: 'Công ty Sữa ABC' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'V08', taxAmount: qty * 8000, ...(warehouseCode ? { warehouseCode } : {}) }],
  totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});

describe('Danh mục kho', () => {
  it('thêm kho theo chi nhánh; luật mã, tên, kho khuyến mại', async () => {
    expect((await wh({ code: '08-HH', branchCode: '08000', name: 'Kho hàng', isDefault: true })).status).toBe(201);
    expect((await wh({ code: '08-KM', branchCode: '08000', name: 'Kho khuyến mại', isPromo: true })).status).toBe(201);
    expect((await wh({ code: '08-CC', branchCode: '08000', name: 'Kho CCDC' })).status).toBe(201);
    expect((await wh({ code: '08016', branchCode: '08016Plus', name: 'CH Đền Hùng', isDefault: true })).status).toBe(201);
    expect((await wh({ code: '08-HH', branchCode: '08016Plus', name: 'Trùng' })).status).toBe(409);
    expect((await wh({ code: 'MA-KHO-QUA-DAI', branchCode: '08000', name: 'x' })).status).toBe(400);
    expect((await wh({ code: '08-XL', branchCode: '08000', name: '' })).status).toBe(400);
    expect((await wh({ code: '08-KM2', branchCode: '08000', name: 'KM thứ hai', isPromo: true })).status).toBe(409);
    expect((await wh({ code: '08-XX', branchCode: 'KHONG-CO', name: 'x' })).status).toBe(400);
    const list = (await call(ctx, 'GET', '/api/v1/warehouses?branchCodes=08000')).body.data as { code: string }[];
    expect(list.map((w) => w.code)).toEqual(['08-CC', '08-HH', '08-KM']);
  });

  it('lọc nhập xuất tồn theo kho: dòng không mã kho vào kho mặc định', async () => {
    expect((await purchase('NM-HH', undefined, 10)).status).toBe(200);
    expect((await purchase('NM-CC', '08-CC', 3)).status).toBe(200);
    const q = (codes: string) => call(ctx, 'GET', `/api/v1/inventory/stock-movement?from=2026-10-01&to=2026-10-31&branchCodes=08000${codes ? `&warehouseCodes=${codes}` : ''}`);
    const qty = async (codes: string) => ((await q(codes)).body.data.rows as { inQty: number }[]).reduce((s, r) => s + r.inQty, 0);
    expect(await qty('')).toBe(13);
    expect(await qty('08-HH')).toBe(10);
    expect(await qty('08-CC')).toBe(3);
    expect(await qty('08-KM')).toBe(0);
    expect(await qty('08-HH,08-CC')).toBe(13);
  });

  it('kho đã có nhập xuất: không chuyển chi nhánh, không xoá; kho chưa dùng thì sửa / xoá được', async () => {
    expect((await call(ctx, 'PATCH', '/api/v1/warehouses/08-CC', { branchCode: '08016Plus' })).status).toBe(409);
    expect((await call(ctx, 'DELETE', '/api/v1/warehouses/08-CC')).status).toBe(409);
    expect((await call(ctx, 'PATCH', '/api/v1/warehouses/08-CC', { isActive: false, name: 'Kho CCDC (ngừng)' })).body.data).toMatchObject({ isActive: false, name: 'Kho CCDC (ngừng)' });
    expect((await call(ctx, 'PATCH', '/api/v1/warehouses/08-KM', { branchCode: '08016Plus' })).body.data).toMatchObject({ branchCode: '08016Plus' });
    expect((await call(ctx, 'DELETE', '/api/v1/warehouses/08-KM')).status).toBe(200);
  });

  it('đổi mã chi nhánh (shop lên Premium): kho, chứng từ giữ nguyên; xoá chi nhánh còn kho thì báo', async () => {
    const r = await call(ctx, 'PATCH', '/api/v1/branches/08016Plus', { newCode: '08016Premium' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.code).toBe('08016Premium');
    expect((await call(ctx, 'GET', '/api/v1/warehouses?branchCodes=08016Premium')).body.data.map((w: { code: string }) => w.code)).toEqual(['08016']);
    expect((await call(ctx, 'PATCH', '/api/v1/branches/08016Premium', { newCode: '08000' })).status).toBe(409);
    const del = await call(ctx, 'DELETE', '/api/v1/branches/08016Premium');
    expect(del.status).toBe(409);
    expect(del.body.error.message).toContain('còn kho');
  });
});
