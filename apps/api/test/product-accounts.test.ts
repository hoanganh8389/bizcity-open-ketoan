/**
 * Mặt hàng – tài khoản (ACC17): xem bộ tài khoản theo nhóm hạch toán, lọc theo cây nhóm hàng,
 * sửa hàng loạt (đổi tài khoản → nhóm có sẵn hoặc nhóm tự tạo), ghi chú, thuế TTĐB, loại thuế.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
type Item = { sku: string; note: string; exciseRate: number | null; postingGroupCode: string | null; effectiveGroup: string; cogsAccount: string; revenueAccount: string; taxOutCode: string | null };
const get = async (q: string) => (await call(ctx, 'GET', `/api/v1/product-accounts?${q}`)).body as { data: Item[]; meta: { total: number } };

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/item-classes/group/SUA', { name: 'Sữa' });
  await call(ctx, 'PUT', '/api/v1/item-classes/group/SUA-BOT', { name: 'Sữa bột', parentCode: 'SUA' });
  await call(ctx, 'PUT', '/api/v1/item-classes/group/BIM', { name: 'Bỉm' });
  await call(ctx, 'PUT', '/api/v1/products/MH-A', { name: 'Sữa bột A', unit: 'Lon', groupCode: 'SUA-BOT' });
  await call(ctx, 'PUT', '/api/v1/products/MH-B', { name: 'Sữa bột B', unit: 'Lon', groupCode: 'SUA-BOT' });
  await call(ctx, 'PUT', '/api/v1/products/MH-C', { name: 'Bỉm C', unit: 'Gói', groupCode: 'BIM' });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Mặt hàng – tài khoản', () => {
  it('mặt hàng chưa gán nhóm hiện bộ tài khoản của nhóm mặc định; lọc theo nhóm hàng gồm nhóm con', async () => {
    const r = await get('group=SUA');
    expect(r.data.map((x) => x.sku)).toEqual(['MH-A', 'MH-B']);
    expect(r.data[0]).toMatchObject({ postingGroupCode: null, effectiveGroup: 'HH-BANLE', cogsAccount: '6321', revenueAccount: '51111' });
    expect((await get('search=bỉm')).data.map((x) => x.sku)).toEqual(['MH-C']);
  });

  it('đổi tài khoản: tự tạo nhóm có đúng bộ tài khoản, mặt hàng sau dùng lại nhóm đó; ghi chú, TTĐB, VAT', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/product-accounts', { items: [
      { sku: 'MH-A', cogsAccount: '6323', note: 'Mã cũ 123', exciseRate: 10, taxOutCode: 'R08' },
      { sku: 'MH-B', cogsAccount: '6323' },
      { sku: 'MH-C', taxOutCode: 'V08' },
      { sku: 'KHONG-CO', note: 'x' },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.updated).toBe(2);
    expect(r.body.data.createdGroups).toEqual(['NHT-T001']);
    expect(r.body.data.errors.join(' ')).toMatch(/MH-C: Mã VAT ra V08/);
    expect(r.body.data.errors.join(' ')).toMatch(/KHONG-CO: mặt hàng chưa có/);
    const a = (await get('group=SUA-BOT')).data;
    expect(a.find((x) => x.sku === 'MH-A')).toMatchObject({ postingGroupCode: 'NHT-T001', cogsAccount: '6323', revenueAccount: '51111', note: 'Mã cũ 123', exciseRate: 10, taxOutCode: 'R08' });
    expect(a.find((x) => x.sku === 'MH-B')).toMatchObject({ postingGroupCode: 'NHT-T001' });
    // Đổi về đúng bộ tài khoản của nhóm mặc định: dùng lại nhóm có sẵn, không tạo thêm.
    const back = await call(ctx, 'PUT', '/api/v1/product-accounts', { items: [{ sku: 'MH-B', cogsAccount: '6321' }] });
    expect(back.body.data).toMatchObject({ updated: 1, createdGroups: [] });
    expect((await get('search=MH-B')).data[0]).toMatchObject({ postingGroupCode: 'HH-BANLE' });
    // Tài khoản tổng hợp bị từ chối.
    const bad = await call(ctx, 'PUT', '/api/v1/product-accounts', { items: [{ sku: 'MH-A', revenueAccount: '511' }] });
    expect(bad.body.data.errors.join(' ')).toMatch(/tổng hợp/);
  });
});
