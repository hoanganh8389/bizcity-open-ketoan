/**
 * Danh mục mặt hàng và phân loại hàng hoá (kế hoạch Đợt 1, hạng mục 1.6).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Mặt hàng và phân loại', () => {
  it('chứng từ mang mã hàng mới thì mặt hàng tự thêm, không ghi đè', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', saleDoc());
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const list = await call(ctx, 'GET', '/api/v1/products');
    const sua = list.body.data.find((p: { sku: string }) => p.sku === 'SUA01');
    expect(sua).toMatchObject({ name: 'Sữa bột 900g', unit: 'Hộp', sourceSystem: 'document', isActive: true });
  });

  it('đồng bộ danh mục: tự thêm phân loại, trường trống không xoá thông tin cũ', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/products', { source: 'pos', products: [
      { sku: 'SUA01', name: 'Sữa bột A 900g', brandCode: 'ABB', brandName: 'Abbott', industryCode: 'SUA', industryName: 'Sữa', groupCode: 'SUA-BOT' },
      { sku: 'TA01', name: 'Tã quần L', unit: 'Bịch', brandCode: 'BOBBY', industryCode: 'TA' },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const brands = await call(ctx, 'GET', '/api/v1/item-classes/brand');
    expect(brands.body.data.map((c: { code: string; name: string; products: number }) => [c.code, c.name, c.products])).toEqual([['ABB', 'Abbott', 1], ['BOBBY', 'BOBBY', 1]]);

    await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', name: '' }] });
    const sua = (await call(ctx, 'GET', '/api/v1/products?search=sua01')).body.data[0];
    expect(sua).toMatchObject({ name: 'Sữa bột A 900g', unit: 'Hộp', brandCode: 'ABB', groupCode: 'SUA-BOT', sourceSystem: 'external' });

    const bad = await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'X1', postingGroupCode: 'KHONG-CO' }] });
    expect(bad.status).toBe(400);
  });

  it('kế toán sửa mặt hàng: phân loại phải có trong danh mục; lọc theo phân loại', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/products/TA01', { typeCode: 'KHONG-CO' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/item-classes/type/HH', { name: 'Hàng hoá' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/item-classes/type/HH', { name: 'Hàng hoá', parentCode: 'HH' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/products/TA01', { typeCode: 'HH', isActive: false })).status).toBe(200);

    const byType = await call(ctx, 'GET', '/api/v1/products?type=HH');
    expect(byType.body.data.map((p: { sku: string }) => p.sku)).toEqual(['TA01']);
    const noBrand = await call(ctx, 'GET', '/api/v1/products?brand=-');
    expect(noBrand.body.data.map((p: { sku: string }) => p.sku)).toEqual(['QUA01']);
    const inactive = await call(ctx, 'GET', '/api/v1/products?status=inactive');
    expect(inactive.body.data.map((p: { sku: string }) => p.sku)).toEqual(['TA01']);
    expect(inactive.body.meta.total).toBe(1);
  });
});
