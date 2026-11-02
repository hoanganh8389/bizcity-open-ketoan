/**
 * Danh mục chuẩn qua action + dữ liệu mẫu của module (PHASES 3.17, ADR-0015 Q4):
 *   - core.partner.upsert / core.product.upsert: tạo / cập nhật theo mã, trường trống giữ giá trị cũ, nhóm hạch toán lạ → VALIDATION;
 *   - seed[] trong manifest: dry-run không lưu, chạy thật tạo danh mục, chạy lại không trùng, action ngoài danh sách cho phép → VALIDATION.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODULE_MANIFESTS } from '../src/phan-he/index.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const call = (method: 'POST', url: string, payload: unknown) =>
  ctx.app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `seed-${Math.random().toString(36).slice(2)}` } });
const quy = MODULE_MANIFESTS.get('quy')!;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  delete (quy as { seed?: unknown }).seed;
  await ctx.app.close();
});

describe('core.partner.upsert / core.product.upsert', () => {
  it('tạo rồi cập nhật đối tượng theo mã; tên trống giữ tên cũ', async () => {
    expect((await call('POST', '/api/v1/partners/upsert', { code: 'KH-UP1', name: 'Khách thử một', kind: 'customer' })).statusCode).toBe(200);
    await call('POST', '/api/v1/partners/upsert', { code: 'KH-UP1', name: '', phone: '0900000001' });
    const p = await db.selectFrom('partners').select(['name', 'phone']).where('tenant_id', '=', tenantId).where('code', '=', 'KH-UP1').executeTakeFirstOrThrow();
    expect(p).toEqual({ name: 'Khách thử một', phone: '0900000001' });
  });

  it('mặt hàng: nhóm hạch toán lạ → VALIDATION; không nhóm thì tạo được', async () => {
    const bad = await call('POST', '/api/v1/products/upsert', { sku: 'UP-SP1', name: 'Hàng thử', unit: 'Cái', postingGroupCode: 'KHONG-CO' });
    expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    expect((await call('POST', '/api/v1/products/upsert', { sku: 'UP-SP1', name: 'Hàng thử', unit: 'Cái' })).statusCode).toBe(200);
    const sp = await db.selectFrom('products').select(['name', 'unit']).where('tenant_id', '=', tenantId).where('sku', '=', 'UP-SP1').executeTakeFirstOrThrow();
    expect(sp).toEqual({ name: 'Hàng thử', unit: 'Cái' });
  });
});

describe('seed[] của manifest', () => {
  it('dry-run không lưu; chạy thật tạo danh mục; chạy lại không trùng', async () => {
    (quy as { seed?: unknown }).seed = [
      { action: 'core.partner.upsert', input: { code: 'KH-MAU1', name: 'Khách mẫu (hư cấu)' } },
      { action: 'core.product.upsert', input: { sku: 'MAU001', name: 'Hàng mẫu (hư cấu)', unit: 'Cái' } },
    ];
    const dry = await call('POST', '/api/v1/system/modules/quy/seed?dryRun=1', {});
    expect(dry.statusCode, dry.body).toBe(200);
    expect(dry.json().data).toMatchObject({ calls: 2, results: [{ ok: true }, { ok: true }] });
    expect(await db.selectFrom('partners').select('id').where('tenant_id', '=', tenantId).where('code', '=', 'KH-MAU1').executeTakeFirst()).toBeUndefined();

    expect((await call('POST', '/api/v1/system/modules/quy/seed', {})).json().data.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    await call('POST', '/api/v1/system/modules/quy/seed', {});
    const n = await db.selectFrom('partners').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('code', '=', 'KH-MAU1').executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1);
    expect(await db.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', '=', 'MAU001').executeTakeFirst()).toBeTruthy();
  });

  it('action ngoài danh sách cho phép trong seed → VALIDATION', async () => {
    (quy as { seed?: unknown }).seed = [{ action: 'core.module.disable', input: { key: 'kho' } }];
    const res = await call('POST', '/api/v1/system/modules/quy/seed', {});
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
