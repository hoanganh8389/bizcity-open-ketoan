// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — cây nhóm hàng DM11: mã ngắn không trùng cùng cha, chặn chuyển vào nhánh con, báo cáo lọc / gom theo nhóm (đóng góp)
/**
 * Nhóm hàng (DM11) chạy trên PostgreSQL thật.
 * Cây: N1 (mã ngắn 13) → N2 (006) → N3 (1); N1 → N2B (007). Mặt hàng: 130061001 thuộc N3, 130071001 thuộc N2B, KHAC thuộc nhóm khác.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const put = (code: string, body: Record<string, unknown>, isNew = true) => call(ctx, 'PUT', `/api/v1/item-classes/group/${code}${isNew ? '?new=1' : ''}`, body);
const ok = async (p: Promise<{ status: number; body: { data: unknown } }>) => { const r = await p; expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data as Record<string, unknown>; };

beforeAll(async () => {
  ctx = await setupTenant();
  await ok(put('N1', { name: 'Ngành thử', skuCode: '13' }));
  await ok(put('N2', { name: 'Nhãn thử', parentCode: 'N1', skuCode: '006' }));
  await ok(put('N3', { name: 'Nhóm thử', parentCode: 'N2', skuCode: '1' }));
  await ok(put('N2B', { name: 'Nhãn thử B', parentCode: 'N1', skuCode: '007' }));
  await ok(put('X1', { name: 'Ngành khác', skuCode: '14' }));
  await ok(call(ctx, 'PUT', '/api/v1/products', { products: [
    { sku: '130061001', name: 'Hàng A', unit: 'Cái', groupCode: 'N3' },
    { sku: '130071001', name: 'Hàng B', unit: 'Cái', groupCode: 'N2B' },
    { sku: 'KHAC', name: 'Hàng khác', unit: 'Cái', groupCode: 'X1' },
  ] }));
});
afterAll(async () => { await ctx.app.close(); });

describe('Nhóm hàng (DM11)', () => {
  it('mã ngắn trùng với nhóm cùng cha bị chặn; khác cha thì được', async () => {
    const dup = await put('N2C', { name: 'Nhãn trùng', parentCode: 'N1', skuCode: '006' });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.body)).toContain('Nhãn thử');
    await ok(put('N3B', { name: 'Nhóm cùng mã ngắn ở nhánh khác', parentCode: 'N2B', skuCode: '1' }));
    // Sửa nhóm mà giữ nguyên mã ngắn cũ: không bị chặn.
    await ok(put('N2', { name: 'Nhãn thử (đổi tên)', parentCode: 'N1', skuCode: '006' }, false));
  });

  it('không chuyển nhóm vào nhánh con của chính nó', async () => {
    const r = await put('N1', { name: 'Ngành thử', parentCode: 'N3', skuCode: '13' }, false);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('nhóm con của chính nó');
  });

  it('tích nhóm cha = mọi mã hàng của nhánh con', async () => {
    const all = await ok(call(ctx, 'GET', '/api/v1/products/skus-by-group?groups=N1'));
    expect((all.skus as string[]).sort()).toEqual(['130061001', '130071001']);
    const one = await ok(call(ctx, 'GET', '/api/v1/products/skus-by-group?groups=N3,X1'));
    expect((one.skus as string[]).sort()).toEqual(['130061001', 'KHAC']);
    expect((await ok(call(ctx, 'GET', '/api/v1/products/skus-by-group?groups='))).skus).toEqual([]);
  });

  it('báo cáo nhập xuất tồn / bán hàng nhận lọc nhóm và gom theo nhóm cấp 1 / 2 / 3', async () => {
    for (const groupBy of ['itemGroup1', 'itemGroup2', 'itemGroup3']) {
      await ok(call(ctx, 'GET', `/api/v1/inventory/stock-summary?from=2026-01-01&to=2026-12-31&groupBy=${groupBy}&groups=N1`));
      await ok(call(ctx, 'GET', `/api/v1/reports/sales-summary?from=2026-01-01&to=2026-12-31&groupBy=${groupBy}&groups=N1`));
    }
    await ok(call(ctx, 'GET', '/api/v1/inventory/stock-movement?from=2026-01-01&to=2026-12-31&groups=N2B'));
    await ok(call(ctx, 'GET', '/api/v1/reports/sales-detail?from=2026-01-01&to=2026-12-31&groups=N2B'));
  });
});
