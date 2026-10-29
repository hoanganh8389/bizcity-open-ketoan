/**
 * Danh mục đơn vị tính (DM15, bảng unit_names): khởi tạo sẵn, tự thêm khi khai ĐVT mới ở mặt hàng (trigger), thêm / sửa /
 * xoá / kiểm tra; ĐVT ở mặt hàng tự viết theo đúng danh mục.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type U = { id: string; name: string; source: string; isActive: boolean; products: number; createdBy: string };
const list = async () => (await call(t, 'GET', '/api/v1/unit-names')).body.data as U[];
const find = async (name: string) => (await list()).find((u) => u.name.toLowerCase() === name.toLowerCase());
const product = (sku: string, units: { unit: string; ratio: number }[]) => call(t, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { name: `Hàng ${sku}`, units });

beforeAll(async () => { t = await setupTenant(); });
afterAll(async () => { await t.app.close(); });

describe('Danh mục đơn vị tính', () => {
  it('đơn vị mới có sẵn danh sách khởi tạo (Hộp, Lốc, Lốc_4, Thùng…), không có tỉ lệ', async () => {
    const all = await list();
    for (const n of ['Hộp', 'Lốc', 'Lốc_4', 'Thùng', 'Lon', 'Gói']) expect(all.find((u) => u.name === n)?.source).toBe('seed');
    expect(all.every((u) => !('ratio' in u))).toBe(true);
  });

  it('khai ĐVT mới ở mặt hàng → tự thêm vào danh mục; viết khác hoa thường thì lấy đúng tên danh mục', async () => {
    const r = await product('DVT-A1', [{ unit: 'hộp', ratio: 1 }, { unit: 'Lốc_3', ratio: 3 }, { unit: 'thùng', ratio: 36 }]);
    expect(r.status).toBe(200);
    const p = (await call(t, 'GET', '/api/v1/catalog/products/DVT-A1')).body.data as { unit: string; units: { unit: string }[] };
    expect(p.units.map((u) => u.unit).sort()).toEqual(['Hộp', 'Lốc_3', 'Thùng']);
    expect(p.unit).toBe('Hộp');
    const loc3 = await find('Lốc_3');
    expect(loc3?.source).toBe('auto');
    expect(loc3?.products).toBe(1);
    expect((await find('Hộp'))?.products).toBe(1);
  });

  it('ghi thẳng vào bảng (đồng bộ, nhập file…) cũng tự thêm — trigger CSDL', async () => {
    const tid = (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id;
    await sql`INSERT INTO products (tenant_id, sku, name, unit) VALUES (${tid}, 'DVT-RAW', 'Ghi thẳng', 'Bó')`.execute(db);
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tid}, 'DVT-RAW', 'Bó', 1), (${tid}, 'DVT-RAW', 'Kiện_20', 20)`.execute(db);
    expect((await find('Bó'))?.source).toBe('auto');
    expect((await find('Kiện_20'))?.source).toBe('auto');
  });

  it('thêm / sửa / xoá + kiểm tra tên', async () => {
    const add = await call(t, 'POST', '/api/v1/unit-names', { name: '  Lốc   10 ', note: 'lốc 10 hộp' });
    expect(add.status).toBe(201);
    expect(add.body.data.name).toBe('Lốc 10');
    expect(add.body.data.source).toBe('manual');
    expect(add.body.data.createdBy).not.toBe('');
    // Trùng (không phân biệt hoa thường), rỗng, quá dài, ký tự lạ.
    expect((await call(t, 'POST', '/api/v1/unit-names', { name: 'lốc 10' })).status).toBe(409);
    expect((await call(t, 'POST', '/api/v1/unit-names', { name: '   ' })).status).toBe(400);
    expect((await call(t, 'POST', '/api/v1/unit-names', { name: 'x'.repeat(33) })).status).toBe(400);
    expect((await call(t, 'POST', '/api/v1/unit-names', { name: 'Hộp;DROP' })).status).toBe(400);
    const id = add.body.data.id as string;
    // Chưa dùng: đổi tên được; trùng tên khác thì không.
    expect((await call(t, 'PATCH', `/api/v1/unit-names/${id}`, { name: 'Lốc_10' })).body.data.name).toBe('Lốc_10');
    expect((await call(t, 'PATCH', `/api/v1/unit-names/${id}`, { name: 'thùng' })).status).toBe(409);
    expect((await call(t, 'PATCH', `/api/v1/unit-names/${id}`, { isActive: false })).body.data.isActive).toBe(false);
    expect((await call(t, 'DELETE', `/api/v1/unit-names/${id}`)).status).toBe(200);
    expect(await find('Lốc_10')).toBeUndefined();
    expect((await call(t, 'DELETE', `/api/v1/unit-names/${id}`)).status).toBe(404);
    expect((await call(t, 'PATCH', '/api/v1/unit-names/abc', { note: 'x' })).status).toBe(400);
  });

  it('tên đang có mặt hàng dùng: không đổi tên, không xoá; vẫn ẩn được', async () => {
    const loc3 = (await find('Lốc_3'))!;
    const ren = await call(t, 'PATCH', `/api/v1/unit-names/${loc3.id}`, { name: 'Lốc ba' });
    expect(ren.status).toBe(409);
    expect(ren.body.error.message).toMatch(/đang dùng ở 1 mặt hàng/);
    expect((await call(t, 'DELETE', `/api/v1/unit-names/${loc3.id}`)).status).toBe(409);
    const hide = await call(t, 'PATCH', `/api/v1/unit-names/${loc3.id}`, { isActive: false, note: 'ngừng' });
    expect(hide.status).toBe(200);
    expect(hide.body.data.isActive).toBe(false);
  });

  it('trang Cơ sở dữ liệu mua hàng: cấu trúc đọc thẳng từ CSDL (cột + chú thích, chỉ mục, trigger, số dòng của đơn vị)', async () => {
    const r = await call(t, 'GET', '/api/v1/purchase/db-schema');
    expect(r.status).toBe(200);
    const tables = r.body.data.tables as { name: string; layer: string; rows: number; columns: { name: string; comment: string | null }[]; indexes: { name: string }[]; triggers: { fn: string; note: string }[] }[];
    expect(tables.filter((x) => x.layer === 'module').map((x) => x.name)).toEqual(['purchase_documents', 'purchase_policies', 'supplier_products', 'supplier_invoices', 'supplier_invoice_lines', 'supplier_item_aliases', 'purchase_attachments', 'stock_levels', 'stock_sku_settings', 'stock_max_requests', 'order_formulas', 'transfer_requests']);
    const sp = tables.find((x) => x.name === 'supplier_products')!;
    expect(sp.columns.find((c) => c.name === 'unit')?.comment).toMatch(/quy đổi theo tỉ lệ/);
    expect(sp.indexes.map((i) => i.name)).toContain('supplier_products_uniq');
    const pu = tables.find((x) => x.name === 'product_units')!;
    expect(pu.triggers.find((x) => x.fn === 'unit_names_autoadd')?.note).toMatch(/tự thêm vào Danh mục đơn vị tính/);
    expect(tables.find((x) => x.name === 'unit_names')!.rows).toBeGreaterThan(40);
    expect(r.body.data.migrations).toContain('0014_danh_muc_dvt.sql');
  });

  it('tìm mặt hàng không phân biệt dấu, nhiều từ (vd "hang dvt a1" khớp "Hàng DVT-A1")', async () => {
    const find = async (q: string) => ((await call(t, 'GET', `/api/v1/products?search=${encodeURIComponent(q)}`)).body.data as { sku: string }[]).map((p) => p.sku);
    expect(await find('hang dvt-a1')).toContain('DVT-A1');
    expect(await find('HÀNG   a1')).toContain('DVT-A1');
    expect(await find('dvt-a1 khongco')).toEqual([]);
  });

  it('bộ ĐVT của mặt hàng: đúng một ĐVT tỉ lệ 1, không trùng (kể cả khác hoa thường), tỉ lệ > 0', async () => {
    expect((await product('DVT-B1', [{ unit: 'Hộp', ratio: 1 }, { unit: 'hộp', ratio: 4 }])).status).toBe(400);
    expect((await product('DVT-B2', [{ unit: 'Hộp', ratio: 2 }, { unit: 'Thùng', ratio: 24 }])).status).toBe(400);
    expect((await product('DVT-B3', [{ unit: 'Hộp', ratio: 1 }, { unit: 'Lon', ratio: 1 }])).status).toBe(400);
    expect((await product('DVT-B4', [{ unit: 'Hộp', ratio: 1 }, { unit: 'Thùng', ratio: 0 }])).status).toBe(400);
  });
});
