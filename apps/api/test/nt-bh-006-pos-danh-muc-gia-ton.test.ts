/**
 * NT-BH-006 — máy bán đọc danh mục, giá theo bảng giá chi nhánh, tồn của chi nhánh từ kế toán (module pos, khung nhìn 0109).
 * Mỗi `it` khoá một nhóm dòng ở §5 của phiếu.
 */
// [2026-11-12 04:30 PM Võ Hoàng] POS-CATALOG — test tích hợp phiếu NT-BH-006 (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const vnDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

type Unit = { unit: string; ratio: number; price: number | null; isDefault: boolean };
type Product = { sku: string; price: number; taxRate: number | null; unitName: string; variant: string; sendTax: boolean; itemId: string | null; barcode: string; units: Unit[] };

describe.skipIf(!HAS)('NT-BH-006 — máy bán đọc danh mục, giá, tồn từ kế toán', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const get = (url: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: { authorization: `Bearer ${ctx.token}` } });
  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-006-${++k}-${Date.now()}` } });
  const product = async (branch: string, sku: string) => ((await get(`/catalog/snapshot?branch=${branch}`)).json().data.items as Product[]).find((p) => p.sku === sku);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-006', trx as never); });
    app = await buildApp();
    // Khai báo trước (phiếu §2): CN02, SUA400 thường (Hộp ×1, Thùng ×12), SUAC hàng chính; BGCT công ty, BG01 gán CN01.
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02') ON CONFLICT DO NOTHING`.execute(db);
    const put = await call(ctx, 'PUT', '/api/v1/products', { products: [
      { sku: 'SUA400', name: 'Sữa bột 400g', unit: 'Hộp' }, { sku: 'SUAC', name: 'Sữa chính', unit: 'Hộp' }, { sku: 'NGUNG', name: 'Hàng ngừng bán', unit: 'Hộp' }] });
    expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    for (const sku of ['SUA400', 'SUAC']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    await sql`UPDATE products SET is_main = true WHERE tenant_id = ${tenantId} AND sku = 'SUAC'`.execute(db);
    await sql`UPDATE products SET no_sale = true WHERE tenant_id = ${tenantId} AND sku = 'NGUNG'`.execute(db);
    await sql`UPDATE products SET barcode = '8930001/8930002' WHERE tenant_id = ${tenantId} AND sku = 'SUA400'`.execute(db);
    await sql`DELETE FROM product_units WHERE tenant_id = ${tenantId} AND sku IN ('SUA400', 'SUAC')`.execute(db);
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio, is_default) VALUES
      (${tenantId}, 'SUA400', 'Hộp', 1, true), (${tenantId}, 'SUA400', 'Thùng', 12, false), (${tenantId}, 'SUAC', 'Hộp', 1, true)`.execute(db);
    await sql`UPDATE price_lists SET is_company = false WHERE tenant_id = ${tenantId}`.execute(db);
    await sql`INSERT INTO price_lists (tenant_id, code, name, is_company) VALUES (${tenantId}, 'BGCT', 'Bảng giá công ty', true), (${tenantId}, 'BG01', 'Bảng giá CN01', false)`.execute(db);
    await sql`INSERT INTO price_list_branches (tenant_id, price_list_code, branch_code) VALUES (${tenantId}, 'BG01', 'CN01')`.execute(db);
    await sql`INSERT INTO product_prices (tenant_id, price_list_code, sku, unit, price) VALUES
      (${tenantId}, 'BGCT', 'SUA400', 'Hộp', 330000), (${tenantId}, 'BGCT', 'SUA400', 'Thùng', 3800000), (${tenantId}, 'BGCT', 'SUAC', 'Hộp', 500000),
      (${tenantId}, 'BG01', 'SUA400', 'Hộp', 320000), (${tenantId}, 'BG01', 'SUAC', 'Hộp', 450000)`.execute(db);
    // Sổ kho: CN01 nhập 20, CN02 nhập 50.
    for (const [key, branchCode, qty] of [['NT6-PN1', 'CN01', 20], ['NT6-PN2', 'CN02', 50]] as const) {
      const r = await call(ctx, 'POST', '/api/v1/documents', {
        docType: 'purchase', docKey: key, branchCode, docNo: key, docDate: vnDate(-2), partner: { code: 'NCC-NT6', name: 'Nhà cung cấp NT-BH-006' },
        lines: [{ lineKey: 'l1', sku: 'SUA400', name: 'Sữa bột 400g', unit: 'Hộp', qty, amountBeforeTax: qty * 200000, taxCode: 'V08', taxAmount: qty * 16000 }],
        totals: { beforeTax: qty * 200000, tax: qty * 16000, total: qty * 216000 },
      });
      expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    }
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 dòng 1–4: giá theo bảng giá chi nhánh, ô trống lấy công ty, hàng chính chỉ giá công ty, chi nhánh chưa gán lấy công ty', async () => {
    const sua = (await product('CN01', 'SUA400'))!;
    expect(sua.price).toBe(320_000);
    expect(sua.units).toEqual([{ unit: 'Hộp', ratio: 1, price: 320_000, isDefault: true }, { unit: 'Thùng', ratio: 12, price: 3_800_000, isDefault: false }]);
    expect((await product('CN01', 'SUAC'))!.price).toBe(500_000);
    expect((await product('CN02', 'SUA400'))!.price).toBe(330_000);
  });

  it('§5 dòng 5–6: không có hàng ngừng bán; thuế suất, Biến thể, Gửi lên thuế, mã vạch, ĐVT, định danh đúng danh mục', async () => {
    const snap = (await get('/catalog/snapshot?branch=CN01')).json().data as { items: Product[]; version: string };
    expect(snap.items.map((p) => p.sku)).not.toContain('NGUNG');
    expect(snap.items.find((p) => p.sku === 'SUA400')).toMatchObject({ taxRate: 8, variant: 'normal', sendTax: true, unitName: 'Hộp', barcode: '8930001/8930002' });
    expect(snap.items.find((p) => p.sku === 'SUA400')!.itemId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(snap.version).toMatch(/^\d+-\d+$/);
  });

  it('tìm theo tên không dấu / mã vạch; tra một mã vạch; mã lạ → 404', async () => {
    const s = await get('/catalog/search?q=sua%20bot&branch=CN01');
    expect(s.statusCode, s.body).toBe(200);
    expect(s.json().data.map((p: Product) => p.sku)).toEqual(['SUA400']);
    const b = await get('/catalog/barcode/8930002?branch=CN01');
    expect(b.statusCode, b.body).toBe(200);
    expect(b.json().data).toMatchObject({ sku: 'SUA400', price: 320_000 });
    expect((await get('/catalog/barcode/KHONGCO?branch=CN01')).statusCode).toBe(404);
  });

  it('§5 dòng 7: tồn của chính chi nhánh sau bán (20 − 3 = 17), không lẫn tồn chi nhánh khác', async () => {
    const order = await post('/orders', {
      id: '0193a1b2-0000-7000-8000-000000006001', branchCode: 'CN01', businessDate: vnDate(), shiftId: `ngay-${vnDate()}`, exportReasonCode: 'XBA', customer: { retail: true },
      lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 3, clientUnitPrice: 320_000 }], promotionSelections: [],
      payment: { mode: 'cash', cashGiven: 1_000_000 }, clientTotal: 960_000, coreVersion: '0.1.0', promotionsVersion: '',
    });
    expect(order.statusCode, order.body).toBe(201);
    const st = await get('/stock?skus=SUA400,SUAC&branch=CN01');
    expect(st.statusCode, st.body).toBe(200);
    expect(st.json().data).toEqual([{ sku: 'SUA400', available: 17, held: 0 }, { sku: 'SUAC', available: 0, held: 0 }]);
    expect((await get('/stock?skus=SUA400&branch=CN02')).json().data).toEqual([{ sku: 'SUA400', available: 50, held: 0 }]);
  });

  it('§5 dòng 9: đổi giá ở bảng giá chi nhánh → lần kéo sau có giá mới, phiên bản danh mục đổi', async () => {
    const before = (await get('/catalog/snapshot?branch=CN01')).json().data.version as string;
    await new Promise((r) => setTimeout(r, 5));
    await sql`UPDATE product_prices SET price = 325000, updated_at = now() WHERE tenant_id = ${tenantId} AND price_list_code = 'BG01' AND sku = 'SUA400' AND unit = 'Hộp'`.execute(db);
    const after = (await get('/catalog/snapshot?branch=CN01')).json().data;
    expect(after.version).not.toBe(before);
    expect((after.items as Product[]).find((p) => p.sku === 'SUA400')!.price).toBe(325_000);
  });
});
