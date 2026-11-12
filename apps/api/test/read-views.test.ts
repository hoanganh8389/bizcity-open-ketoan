/**
 * data.read-views (PHASES 2.4, migration 0044): danh mục chuẩn đọc qua bizcity_read.* — đủ dòng, theo mã, chỉ đọc,
 * không lộ thuộc tính hạch toán của Kernel và dữ liệu cá nhân không cần cho nghiệp vụ chung.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const VIEWS = ['partners', 'products', 'branches', 'warehouses', 'unit_names', 'tax_codes', 'payment_methods', 'dimensions'] as const;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  await db.insertInto('partners').values({ tenant_id: tenantId, code: 'KH-RV', name: 'Khách đọc danh mục', kind: 'customer', phone: '0900000000' }).execute();
  await db.insertInto('products').values({ tenant_id: tenantId, sku: 'RV-01', name: 'Hàng đọc danh mục', unit: 'Cái' }).execute();
  const branch = await db.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', 'CN01').executeTakeFirstOrThrow();
  await db.insertInto('warehouses').values({ tenant_id: tenantId, code: 'K-RV', branch_id: branch.id, name: 'Kho đọc danh mục' }).execute();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('bizcity_read — danh mục chuẩn', () => {
  it('mỗi khung nhìn đủ dòng như bảng gốc của đơn vị', async () => {
    for (const v of VIEWS) {
      const view = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM ${sql.table(`bizcity_read.${v}`)} WHERE tenant_id = ${tenantId}`.execute(db);
      const base = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM ${sql.table(`public.${v}`)} WHERE tenant_id = ${tenantId}`.execute(db);
      expect(Number(view.rows[0]!.n), v).toBe(Number(base.rows[0]!.n));
    }
  });

  it('quan hệ trả mã, không trả id', async () => {
    const wh = await db.selectFrom('bizcity_read.warehouses').select(['code', 'branch_code']).where('tenant_id', '=', tenantId).execute();
    expect(wh.length).toBeGreaterThan(0);
    const branches = new Set((await db.selectFrom('bizcity_read.branches').select('code').where('tenant_id', '=', tenantId).execute()).map((b) => b.code));
    for (const w of wh) expect(branches.has(w.branch_code), w.code).toBe(true);
    const p = await db.selectFrom('bizcity_read.partners').selectAll().where('tenant_id', '=', tenantId).where('code', '=', 'KH-RV').executeTakeFirstOrThrow();
    expect(p).toMatchObject({ name: 'Khách đọc danh mục', kind: 'customer', phone: '0900000000' });
  });

  it('không có cột id, thuộc tính hạch toán của Kernel, dữ liệu cá nhân nhạy cảm', async () => {
    const cols = await sql<{ table_name: string; column_name: string }>`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'bizcity_read' AND table_name = ANY(${[...VIEWS]}::text[])`.execute(db);
    const names = cols.rows.map((r) => `${r.table_name}.${r.column_name}`);
    expect(names.length).toBeGreaterThan(50);
    const banned = /\.(id|parent_id|branch_id|account|account_code|posting_group_code|accounting_unit_id|bank_account_no|bank_account_holder|birth_date|gender)$/;
    expect(names.filter((n) => banned.test(n))).toEqual([]);
  });

  // [2026-11-10 02:30 PM Võ Hoàng] POS-W1 — module pos: 0102: module đọc ô Biến thể / Gửi lên thuế, không đọc chữ cuối mã (đóng góp)
  it('mặt hàng có định danh, ô Biến thể và ô Gửi lên thuế (0102); Nội bộ luôn không gửi thuế', async () => {
    await db.insertInto('products').values({ tenant_id: tenantId, sku: 'RV-0203', name: 'Quà đọc danh mục', unit: 'Cái' }).execute();
    await sql`UPDATE products SET variant_code = 'internal' WHERE tenant_id = ${tenantId} AND sku = 'RV-0203'`.execute(db);
    await db.insertInto('products').values({ tenant_id: tenantId, sku: 'RV-0204', name: 'Hàng không gửi thuế', unit: 'Cái' }).execute();
    await sql`UPDATE products SET send_to_tax = false WHERE tenant_id = ${tenantId} AND sku = 'RV-0204'`.execute(db);
    const rows = await db.selectFrom('bizcity_read.products').select(['sku', 'item_id', 'variant_code', 'send_to_tax'])
      .where('tenant_id', '=', tenantId).where('sku', 'in', ['RV-01', 'RV-0203', 'RV-0204']).orderBy('sku').execute();
    expect(rows.map(({ sku, variant_code, send_to_tax }) => ({ sku, variant_code, send_to_tax }))).toEqual([
      { sku: 'RV-01', variant_code: 'normal', send_to_tax: true },
      { sku: 'RV-0203', variant_code: 'internal', send_to_tax: false },
      { sku: 'RV-0204', variant_code: 'normal', send_to_tax: false },
    ]);
    for (const r of rows) expect(r.item_id, r.sku).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  // [2026-11-12 04:10 PM Võ Hoàng] POS-CATALOG — 0109: giá theo chi nhánh đã áp luật DM14, tồn theo chi nhánh (NT-BH-006 §5) (đóng góp)
  it('giá theo chi nhánh (0109): bảng giá chi nhánh → ô trống lấy công ty; hàng chính chỉ giá công ty; chưa gán → công ty', async () => {
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02') ON CONFLICT DO NOTHING`.execute(db);
    for (const [sku, isMain] of [['RV-SUA', false], ['RV-CHINH', true]] as const) {
      await db.insertInto('products').values({ tenant_id: tenantId, sku, name: sku, unit: 'Hộp' }).execute();
      await sql`UPDATE products SET is_main = ${isMain} WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(db);
      await sql`DELETE FROM product_units WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(db);
      await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio, is_default) VALUES (${tenantId}, ${sku}, 'Hộp', 1, true)`.execute(db);
    }
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio, is_default) VALUES (${tenantId}, 'RV-SUA', 'Thùng', 12, false)`.execute(db);
    await sql`UPDATE price_lists SET is_company = false WHERE tenant_id = ${tenantId}`.execute(db);
    await sql`INSERT INTO price_lists (tenant_id, code, name, is_company) VALUES (${tenantId}, 'RV-CT', 'Công ty', true), (${tenantId}, 'RV-01', 'Chi nhánh 01', false)`.execute(db);
    await sql`INSERT INTO price_list_branches (tenant_id, price_list_code, branch_code) VALUES (${tenantId}, 'RV-01', 'CN01')`.execute(db);
    await sql`INSERT INTO product_prices (tenant_id, price_list_code, sku, unit, price) VALUES
      (${tenantId}, 'RV-CT', 'RV-SUA', 'Hộp', 330000), (${tenantId}, 'RV-CT', 'RV-SUA', 'Thùng', 3800000), (${tenantId}, 'RV-CT', 'RV-CHINH', 'Hộp', 500000),
      (${tenantId}, 'RV-01', 'RV-SUA', 'Hộp', 320000), (${tenantId}, 'RV-01', 'RV-CHINH', 'Hộp', 450000)`.execute(db);
    const price = async (branch: string, sku: string, unit: string) => (await db.selectFrom('bizcity_read.branch_prices').select(['price', 'price_source', 'ratio', 'is_default_unit'])
      .where('tenant_id', '=', tenantId).where('branch_code', '=', branch).where('sku', '=', sku).where('unit', '=', unit).executeTakeFirst());
    expect(await price('CN01', 'RV-SUA', 'Hộp')).toMatchObject({ price: '320000.00', price_source: 'branch', is_default_unit: true });
    const thung = await price('CN01', 'RV-SUA', 'Thùng');
    expect(thung).toMatchObject({ price: '3800000.00', price_source: 'company' });
    expect(Number(thung?.ratio)).toBe(12);
    expect(await price('CN01', 'RV-CHINH', 'Hộp')).toMatchObject({ price: '500000.00', price_source: 'company' });
    expect(await price('CN02', 'RV-SUA', 'Hộp')).toMatchObject({ price: '330000.00', price_source: 'company' });
    // Bảng giá chi nhánh ngừng dùng → như chưa gán.
    await sql`UPDATE price_lists SET is_active = false WHERE tenant_id = ${tenantId} AND code = 'RV-01'`.execute(db);
    expect(await price('CN01', 'RV-SUA', 'Hộp')).toMatchObject({ price: '330000.00', price_source: 'company' });
    // Ngừng bán → không có trong khung nhìn.
    await sql`UPDATE products SET no_sale = true WHERE tenant_id = ${tenantId} AND sku = 'RV-CHINH'`.execute(db);
    expect(await price('CN01', 'RV-CHINH', 'Hộp')).toBeUndefined();
  });

  it('tồn theo chi nhánh (0109): cộng sổ kho của đúng chi nhánh, theo item_id', async () => {
    const purchase = (key: string, branchCode: string, qty: number) => ({
      docType: 'purchase', docKey: key, branchCode, docNo: key, docDate: '2026-10-02', partner: { code: 'NCC-RV', name: 'Nhà cung cấp đọc tồn' },
      lines: [{ lineKey: 'l1', sku: 'RV-SUA', name: 'RV-SUA', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'V08', taxAmount: 0 }],
      totals: { beforeTax: qty * 100000, tax: 0, total: qty * 100000 },
    });
    for (const [key, branch, qty] of [['RV-PN1', 'CN01', 20], ['RV-PN2', 'CN02', 50]] as const) {
      const r = await call(ctx, 'POST', '/api/v1/documents', purchase(key, branch, qty));
      expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    }
    const stock = await db.selectFrom('bizcity_read.stock_on_hand').select(['branch_code', 'sku', 'qty', 'item_id'])
      .where('tenant_id', '=', tenantId).where('sku', '=', 'RV-SUA').orderBy('branch_code').execute();
    expect(stock.map(({ branch_code, qty }) => [branch_code, Number(qty)])).toEqual([['CN01', 20], ['CN02', 50]]);
    const item = await db.selectFrom('bizcity_read.products').select('item_id').where('tenant_id', '=', tenantId).where('sku', '=', 'RV-SUA').executeTakeFirstOrThrow();
    for (const s of stock) expect(s.item_id).toBe(item.item_id);
  });

  it('chặn ghi qua khung nhìn', async () => {
    await expect(sql`DELETE FROM bizcity_read.branch_prices WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
    await expect(sql`DELETE FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
    await expect(sql`UPDATE bizcity_read.partners SET name = 'sửa' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
    await expect(sql`DELETE FROM bizcity_read.products WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
    await expect(sql`INSERT INTO bizcity_read.unit_names (tenant_id, name) VALUES (${tenantId}, 'Hộp')`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
  });
});
