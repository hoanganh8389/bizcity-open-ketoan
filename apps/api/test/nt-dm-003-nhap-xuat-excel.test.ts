// [2026-11-17 09:13 PM kiennt] NT-DM-003 — nhập Excel mặt hàng nhận đường dẫn nhóm, "Chờ duyệt"; mặt hàng mới bắt buộc thuế suất (đóng góp)
/**
 * NT-DM-003 E2, E3 — tệp xuất DM10 dùng được để nhập lại:
 *   - Nhóm hàng ghi đường dẫn tên các cấp "Ngành / Nhãn / Nhóm" (như cột Nhóm hàng của tệp xuất) → đúng nhóm cấp 3.
 *   - Trạng thái "Chờ duyệt" (tệp xuất) → đang hoạt động.
 *   - Thuế suất "8%" → loại thuế 8 (NT-DM-012: một loại cho bán và mua).
 *   - Mặt hàng mới thiếu thuế suất → dòng không hợp lệ; mặt hàng đã có thì không bắt buộc.
 *   (Tên nhóm hàng duy nhất trong danh mục nên đường dẫn và tên cấp 3 luôn chỉ một nhóm.)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
type Res = { created: number; updated: number; failed: number; rows: { row: number; sku: string; action: string; errors: string[] }[] };
const nhap = async (rows: Record<string, unknown>[], dryRun = true) => {
  const r = await call<{ data: Res }>(ctx, 'POST', '/api/v1/catalog/products/import', { dryRun, rows });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};

describe('NT-DM-003 — nhập Excel mặt hàng từ tệp xuất', () => {
  beforeAll(async () => {
    ctx = await setupTenant();
    const put = async (code: string, body: Record<string, unknown>) => { const r = await call(ctx, 'PUT', `/api/v1/item-classes/group/${code}?new=1`, body); expect(r.status, JSON.stringify(r.body)).toBeLessThan(300); };
    await put('NT3N', { name: 'Ngành thử', skuCode: '96' });
    await put('NT3H', { name: 'Nhãn thử', parentCode: 'NT3N', skuCode: '961' });
    await put('NT3G', { name: 'Nhóm thử', parentCode: 'NT3H', skuCode: '7' });
  });

  it('E2: đường dẫn nhóm, "8%", "Chờ duyệt" → ghi đúng nhóm cấp 3, loại thuế 8, đang hoạt động', async () => {
    const row = { row: 2, sku: '969617001', name: 'Hàng thử NT-DM-003', unit: 'Hộp', groupCode: 'Ngành thử / Nhãn thử / Nhóm thử', vatRate: '8%', isActive: 'Chờ duyệt' };
    const kt = await nhap([row]);
    expect(kt.rows[0]!.errors).toEqual([]);
    const g = await nhap([row], false);
    expect(g.created).toBe(1);
    const p = await call<{ data: { groupCode: string; taxOutCode: string; isActive: boolean }[] }>(ctx, 'GET', '/api/v1/products?search=969617001');
    expect(p.body.data[0]).toMatchObject({ groupCode: 'NT3G', taxOutCode: '8', taxInCode: '8', isActive: true });
  });

  it('E2: chỉ ghi tên nhóm cấp 3 vẫn nhận; đường dẫn sai một cấp thì báo chưa có', async () => {
    const a = await nhap([{ row: 2, sku: '969617003', name: 'Hàng chỉ tên nhóm', unit: 'Hộp', groupCode: 'Nhóm thử', vatRate: '10' }]);
    expect(a.rows[0]!.errors).toEqual([]);
    const c = await nhap([{ row: 2, sku: '969617004', name: 'Sai cấp', unit: 'Hộp', groupCode: 'Ngành thử / Nhãn sai / Nhóm thử', vatRate: '10' }]);
    expect(c.rows[0]!.errors.join(' ')).toMatch(/chưa có trong danh mục/);
  });

  it('E3: mặt hàng mới thiếu thuế suất → không hợp lệ; mặt hàng đã có không bắt buộc', async () => {
    const a = await nhap([{ row: 2, sku: '969617002', name: 'Thiếu thuế', unit: 'Hộp', groupCode: 'NT3G' }]);
    expect(a.rows[0]!.action).toBe('error');
    expect(a.rows[0]!.errors.join(' ')).toMatch(/Mặt hàng mới phải có Thuế suất GTGT/);
    const b = await nhap([{ row: 2, sku: '969617001', name: 'Hàng thử NT-DM-003 (sửa)' }]);
    expect(b.rows[0]!.errors).toEqual([]);
  });
});
