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
    // [2026-11-13 Nguyễn Văn Thủy] luật mã mới: mã chính toàn số, nhóm cấp 3 bắt buộc khi thêm mới (đóng góp)
    for (const [code, name, parentCode, skuCode] of [['IMP-G1', 'Ngành nhập', undefined, '77'], ['IMP-G2', 'Nhãn nhập', 'IMP-G1', '701'], ['IMP-G3', 'Nhóm nhập', 'IMP-G2', '5']] as const) {
      const r = await call(ctx, 'PUT', `/api/v1/item-classes/group/${code}?new=1`, { name, parentCode, skuCode });
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    }
    const rows: Record<string, unknown>[] = Array.from({ length: 15 }, (_, i) => ({ row: i + 2, sku: `777015${String(i + 1).padStart(3, '0')}`, name: `Mặt hàng nhập ${i + 1}`, unit: 'Hộp', groupCode: 'IMP-G3', brandCode: i % 2 ? 'NH-IMP' : 'Nhãn nhập thử', isActive: 'Có' }));
    rows.push(
      { row: 17, sku: '777015101', name: '', unit: 'Hộp', groupCode: 'IMP-G3' },                       // thiếu tên
      { row: 18, sku: '777015001', name: 'Trùng', unit: 'Hộp', groupCode: 'IMP-G3' },                  // trùng mã trong tệp
      { row: 19, sku: '777015 102', name: 'Có dấu cách', unit: 'Hộp', groupCode: 'IMP-G3' },           // mã có khoảng trắng
      { row: 20, sku: '777015104', name: 'Nhãn sai', unit: 'Hộp', groupCode: 'IMP-G3', brandCode: 'KHONG-CO' },
      { row: 21, sku: '777015105', name: 'Theo dõi sai', unit: 'Hộp', groupCode: 'IMP-G3', isActive: 'hmm' },
    );
    const check = await call(ctx, 'POST', URL, { dryRun: true, rows });
    expect(check.status, JSON.stringify(check.body)).toBe(200);
    const c: Out = check.body.data;
    expect(c, JSON.stringify(c.rows.filter((r) => r.row > 16))).toMatchObject({ created: 15, updated: 0, failed: 5 });
    expect(c.rows.filter((r) => r.action === 'error').map((r) => r.row)).toEqual([17, 18, 19, 20, 21]);
    expect(c.rows.find((r) => r.row === 18)!.errors[0]).toContain('dòng 2');
    expect(c.rows.find((r) => r.row === 20)!.errors[0]).toContain('KHONG-CO');
    expect((await call(ctx, 'GET', '/api/v1/products?search=777015')).body.data).toHaveLength(0);
    // Xem trước: thông tin hàng sẽ ghi, nhãn ghi theo tên được tra ra "mã — tên"
    expect(c.rows[0]).toMatchObject({ action: 'create', values: { sku: '777015001', name: 'Mặt hàng nhập 1', unit: 'Hộp', brandCode: 'NH-IMP — Nhãn nhập thử', isActive: 'Có' } });
    expect(c.rows[0]!.before).toBeUndefined();

    const w: Out = (await call(ctx, 'POST', URL, { dryRun: false, rows })).body.data;
    expect(w).toMatchObject({ created: 15, failed: 5 });
    const list = (await call(ctx, 'GET', '/api/v1/products?search=777015')).body.data as { sku: string; brandCode: string; unit: string }[];
    expect(list).toHaveLength(15);
    expect(new Set(list.map((p) => p.brandCode))).toEqual(new Set(['NH-IMP']));
    const full = (await call(ctx, 'GET', '/api/v1/catalog/products/777015001')).body.data;
    expect(full.units?.[0]).toMatchObject({ unit: 'Hộp', ratio: 1 });
  });

  it('mã đã có: cập nhật phần có ghi, ô trống giữ nguyên; đổi ĐVT bị báo lỗi', async () => {
    const o: Out = (await call(ctx, 'POST', URL, { dryRun: false, rows: [
      { row: 2, sku: '777015002', note: 'ghi chú mới' },
      { row: 3, sku: '777015003', unit: 'Thùng' },
    ] })).body.data;
    expect(o).toMatchObject({ created: 0, updated: 1, failed: 1 });
    expect(o.rows[0]).toMatchObject({ action: 'update', values: { note: 'ghi chú mới', name: '' }, before: { name: 'Mặt hàng nhập 2', unit: 'Hộp', brandCode: 'NH-IMP — Nhãn nhập thử' } });
    expect(o.rows[1]!.errors[0]).toContain('ĐVT');
    const p = (await call(ctx, 'GET', '/api/v1/catalog/products/777015002')).body.data;
    expect(p).toMatchObject({ name: 'Mặt hàng nhập 2', note: 'ghi chú mới', unit: 'Hộp' });
  });
});
