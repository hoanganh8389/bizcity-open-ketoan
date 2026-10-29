/**
 * DM-09 — Nhập Excel mặt hàng (DM10): kiểm tra từng dòng trước khi ghi, báo rõ dòng lỗi; ghi chỉ dòng đúng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

const URL = '/api/v1/catalog/products/import';
type Out = { created: number; updated: number; failed: number; rows: { row: number; sku: string; action: string; errors: string[]; values: Record<string, string>; before?: Record<string, string> }[] };

describe('DM-09 nhập Excel mặt hàng', () => {
  it('20 dòng có vài dòng sai: kiểm tra không ghi gì, báo đúng dòng lỗi; ghi thì dòng đúng vào danh mục, dòng lỗi bỏ qua', async () => {
    await call(ctx, 'PUT', '/api/v1/item-classes/brand/NH-IMP', { name: 'Nhãn nhập thử' });
    const rows: Record<string, unknown>[] = Array.from({ length: 15 }, (_, i) => ({ row: i + 2, sku: `IMP-${String(i + 1).padStart(3, '0')}`, name: `Mặt hàng nhập ${i + 1}`, unit: 'Hộp', brandCode: i % 2 ? 'NH-IMP' : 'Nhãn nhập thử', isActive: 'Có' }));
    rows.push(
      { row: 17, sku: 'IMP-BAD-1', name: '', unit: 'Hộp' },                       // thiếu tên
      { row: 18, sku: 'IMP-001', name: 'Trùng', unit: 'Hộp' },                    // trùng mã trong tệp
      { row: 19, sku: 'IMP BAD', name: 'Có dấu cách', unit: 'Hộp' },              // mã có khoảng trắng
      { row: 20, sku: 'IMP-BAD-4', name: 'Nhãn sai', unit: 'Hộp', brandCode: 'KHONG-CO' },
      { row: 21, sku: 'IMP-BAD-5', name: 'Theo dõi sai', unit: 'Hộp', isActive: 'hmm' },
    );
    const check = await call(ctx, 'POST', URL, { dryRun: true, rows });
    expect(check.status, JSON.stringify(check.body)).toBe(200);
    const c: Out = check.body.data;
    expect(c).toMatchObject({ created: 15, updated: 0, failed: 5 });
    expect(c.rows.filter((r) => r.action === 'error').map((r) => r.row)).toEqual([17, 18, 19, 20, 21]);
    expect(c.rows.find((r) => r.row === 18)!.errors[0]).toContain('dòng 2');
    expect(c.rows.find((r) => r.row === 20)!.errors[0]).toContain('KHONG-CO');
    expect((await call(ctx, 'GET', '/api/v1/products?search=IMP-')).body.data).toHaveLength(0);
    // Xem trước: thông tin hàng sẽ ghi, nhãn ghi theo tên được tra ra "mã — tên"
    expect(c.rows[0]).toMatchObject({ action: 'create', values: { sku: 'IMP-001', name: 'Mặt hàng nhập 1', unit: 'Hộp', brandCode: 'NH-IMP — Nhãn nhập thử', isActive: 'Có' } });
    expect(c.rows[0]!.before).toBeUndefined();

    const w: Out = (await call(ctx, 'POST', URL, { dryRun: false, rows })).body.data;
    expect(w).toMatchObject({ created: 15, failed: 5 });
    const list = (await call(ctx, 'GET', '/api/v1/products?search=IMP-')).body.data as { sku: string; brandCode: string; unit: string }[];
    expect(list).toHaveLength(15);
    expect(new Set(list.map((p) => p.brandCode))).toEqual(new Set(['NH-IMP']));
    const full = (await call(ctx, 'GET', '/api/v1/catalog/products/IMP-001')).body.data;
    expect(full.units?.[0]).toMatchObject({ unit: 'Hộp', ratio: 1 });
  });

  it('mã đã có: cập nhật phần có ghi, ô trống giữ nguyên; đổi ĐVT bị báo lỗi', async () => {
    const o: Out = (await call(ctx, 'POST', URL, { dryRun: false, rows: [
      { row: 2, sku: 'IMP-002', note: 'ghi chú mới' },
      { row: 3, sku: 'IMP-003', unit: 'Thùng' },
    ] })).body.data;
    expect(o).toMatchObject({ created: 0, updated: 1, failed: 1 });
    expect(o.rows[0]).toMatchObject({ action: 'update', values: { note: 'ghi chú mới', name: '' }, before: { name: 'Mặt hàng nhập 2', unit: 'Hộp', brandCode: 'NH-IMP — Nhãn nhập thử' } });
    expect(o.rows[1]!.errors[0]).toContain('ĐVT');
    const p = (await call(ctx, 'GET', '/api/v1/catalog/products/IMP-002')).body.data;
    expect(p).toMatchObject({ name: 'Mặt hàng nhập 2', note: 'ghi chú mới', unit: 'Hộp' });
  });
});
