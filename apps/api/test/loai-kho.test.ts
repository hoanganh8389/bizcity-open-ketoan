/**
 * [2026-11-13 Nguyễn Văn Thủy] Loại kho (0128) (đóng góp)
 * 12 loại gốc + nghiệp vụ; luật khai báo (không sở hữu thì không bán, ngừng loại còn kho); kho mặc định KHH, isPromo → KKM;
 * tự chọn kho theo loại ưu tiên; tạo nhanh bộ kho; luật kho cho nghiệp vụ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { checkWarehouseFor } from '../src/modules/warehouses/warehouse-types.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: '09000', name: 'CN Lào Cai' });
});
afterAll(async () => { await ctx.app.close(); });

describe('Loại kho', () => {
  it('có 12 loại gốc và nghiệp vụ; luật khai báo', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/warehouse-types')).body.data as { types: { code: string; canSell: boolean; owned: boolean }[]; ops: { op: string; typeCodes: string[] }[] };
    expect(d.types.length).toBe(12);
    expect(d.types.find((t) => t.code === 'KNB')).toMatchObject({ owned: false, canSell: false });
    expect(d.ops.find((o) => o.op === 'sale_out')?.typeCodes[0]).toBe('KHH');
    // không sở hữu mà được bán → chặn
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KKG', { name: 'Ký gửi', owned: false, canSell: true })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KKG', { name: 'Ký gửi', owned: false })).status).toBe(200);
    // nghiệp vụ: rỗng → chặn; loại lạ → chặn; bán ưu tiên loại không sở hữu → chặn
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/ops/sale_out', { typeCodes: [] })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/ops/sale_out', { typeCodes: ['XYZ'] })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/ops/sale_out', { typeCodes: ['KKG', 'KHH'] })).status).toBe(400);
  });

  it('kho theo loại, tự chọn theo ưu tiên, tạo nhanh, chặn sai loại', async () => {
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: '09-A', branchCode: '09000', name: 'Kho A', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: '09-B', branchCode: '09000', name: 'Kho B', isPromo: true })).status).toBe(201);
    const list = (await call(ctx, 'GET', '/api/v1/warehouses?branchCodes=09000')).body.data as { code: string; typeCode: string; isPromo: boolean }[];
    expect(list.find((w) => w.code === '09-A')?.typeCode).toBe('KHH');
    expect(list.find((w) => w.code === '09-B')).toMatchObject({ typeCode: 'KKM', isPromo: true });
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: '09-X', branchCode: '09000', name: 'x', typeCode: 'KHONGCO' })).status).toBe(400);

    const q = await call(ctx, 'POST', '/api/v1/warehouses/quick', { branchCode: '09000', typeCodes: ['KHH', 'KTL', 'KLO'] });
    expect(q.status, JSON.stringify(q.body).slice(0, 300)).toBe(200);
    expect(q.body.data.created).toEqual(['09000-KTL', '09000-KLO']); // đã có kho KHH → bỏ qua

    // khách trả hàng: ưu tiên KTL
    expect((await call(ctx, 'GET', '/api/v1/warehouses/pick?branchCode=09000&op=sale_return_in')).body.data.code).toBe('09000-KTL');
    expect((await call(ctx, 'GET', '/api/v1/warehouses/pick?branchCode=09000&op=purchase_in')).body.data.code).toBe('09-A');
    // nhập mua vào kho lỗi → chặn; trả NCC từ kho lỗi → được
    expect(await checkWarehouseFor(db, tenantId, '09000-KLO', 'purchase_in')).toContain('KLO');
    expect(await checkWarehouseFor(db, tenantId, '09000-KLO', 'purchase_return_out')).toBe('');
    // ngừng loại còn kho đang theo dõi → chặn
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KLO', { name: 'Kho hàng lỗi', isActive: false })).status).toBe(409);
  });
  it('thùng rác: xoá vào thùng rác (vẫn trong dữ liệu, bỏ khỏi nghiệp vụ), kho đang dùng thì chặn, khôi phục, xoá vĩnh viễn', async () => {
    const types = async () => ((await call(ctx, 'GET', '/api/v1/warehouse-types')).body.data as { types: { code: string }[]; ops: { op: string; typeCodes: string[] }[] });
    const trash = async () => (await call(ctx, 'GET', '/api/v1/warehouse-types/trash')).body.data as { code: string; deletedBy: string }[];
    // KLO đang có kho 09000-KLO → không xoá được
    expect((await call(ctx, 'DELETE', '/api/v1/warehouse-types/KLO')).status).toBe(409);
    // KCC: không có kho → vào thùng rác
    expect((await types()).ops.some((o) => o.typeCodes.includes('KCC'))).toBe(true);
    expect((await call(ctx, 'DELETE', '/api/v1/warehouse-types/KCC')).status).toBe(200);
    const d = await types();
    expect(d.types.some((t) => t.code === 'KCC')).toBe(false);
    expect(d.ops.some((o) => o.typeCodes.includes('KCC'))).toBe(false);
    expect((await trash()).map((x) => x.code)).toContain('KCC');
    const row = await db.selectFrom('warehouse_types').select(['deleted_at']).where('tenant_id', '=', tenantId).where('code', '=', 'KCC').executeTakeFirst();
    expect(row?.deleted_at).toBeTruthy(); // vẫn trong dữ liệu
    // thêm mới trùng mã đang ở thùng rác → báo
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KCC', { name: 'Trùng' })).status).toBe(409);
    // khôi phục
    expect((await call(ctx, 'POST', '/api/v1/warehouse-types/KCC/restore', {})).status).toBe(200);
    expect((await types()).types.some((t) => t.code === 'KCC')).toBe(true);
    // xoá lại rồi xoá vĩnh viễn
    expect((await call(ctx, 'DELETE', '/api/v1/warehouse-types/KCC')).status).toBe(200);
    expect((await call(ctx, 'DELETE', '/api/v1/warehouse-types/KCC/permanent')).status).toBe(200);
    expect((await trash()).map((x) => x.code)).not.toContain('KCC');
    expect(await db.selectFrom('warehouse_types').select('id').where('tenant_id', '=', tenantId).where('code', '=', 'KCC').executeTakeFirst()).toBeUndefined();
  });
});
