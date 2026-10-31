/**
 * data.read-views (PHASES 2.4, migration 0044): danh mục chuẩn đọc qua bizcity_read.* — đủ dòng, theo mã, chỉ đọc,
 * không lộ thuộc tính hạch toán của Kernel và dữ liệu cá nhân không cần cho nghiệp vụ chung.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

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

  it('chặn ghi qua khung nhìn', async () => {
    await expect(sql`UPDATE bizcity_read.partners SET name = 'sửa' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc/);
    await expect(sql`DELETE FROM bizcity_read.products WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc/);
    await expect(sql`INSERT INTO bizcity_read.unit_names (tenant_id, name) VALUES (${tenantId}, 'Hộp')`.execute(db)).rejects.toThrow(/chỉ đọc/);
  });
});
