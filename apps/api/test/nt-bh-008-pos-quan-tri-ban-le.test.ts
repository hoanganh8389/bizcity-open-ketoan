/**
 * NT-BH-008 — màn quản trị bán lẻ của module pos: đơn / phiếu trả / sổ ca / tổng quan của nhiều chi nhánh (quyền pos:report),
 * Cài đặt bán hàng (khoá bizcity.pos.*). Số liệu như §2 của phiếu: CN01 theo NT-BH-007 §4, CN02 một đơn 330.000.
 */
// [2026-11-12 11:00 PM Võ Hoàng] POS-ADMIN — test tích hợp phiếu NT-BH-008 (đóng góp)
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { loginWithWpTicket } from '../src/modules/auth/wp-sso.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
const SECRET = 'kiem-thu-nt-bh-008';
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const ticket = (claims: Record<string, unknown>) => {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ iat: now, exp: now + 60, ...claims }));
  return `${body}.${b64(createHmac('sha256', SECRET).update(body).digest())}`;
};
const ID = (n: number) => `0193a1b2-0000-7000-8000-00000000${String(8000 + n).padStart(4, '0')}`;

const order = (id: string, branchCode: string, sku: string, qty: number, price: number, payment: unknown, businessDate = TODAY) => ({
  id, branchCode, businessDate, shiftId: 'x', exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku, unitName: 'Hộp', unitQty: qty, clientUnitPrice: price }], promotionSelections: [],
  payment, clientTotal: qty * price, coreVersion: '0.1.0', promotionsVersion: '',
});

describe.skipIf(!HAS)('NT-BH-008 — màn quản trị bán lẻ máy POS', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let k = 0;
  let oldSecret = '';
  const auth = (t = ctx.token) => ({ authorization: `Bearer ${t}` });
  const get = (url: string, t?: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: auth(t) });
  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...auth(), 'idempotency-key': `nt-bh-008-${++k}-${Date.now()}` } });

  beforeAll(async () => {
    ctx = await setupTenant();
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-008', trx as never); });
    oldSecret = env.WP_SSO_SECRET;
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = SECRET;
    app = await buildApp();
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02') ON CONFLICT DO NOTHING`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }, { sku: 'SUA325', name: 'Sữa 325', unit: 'Hộp' }] })).status).toBeLessThan(300);
    for (const sku of ['SUA330', 'SUA325']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    // CN01 như NT-BH-007 §4.
    const open = await post('/shifts/open', { openingCash: 1_000_000, branchCode: 'CN01' });
    expect(open.statusCode, open.body).toBe(201);
    const shiftId = open.json().data.id as string;
    for (const r of [
      await post('/orders', order(ID(1), 'CN01', 'SUA330', 2, 330_000, { mode: 'split', parts: [{ method: 'TM', amount: 330_000 }, { method: 'CK', amount: 330_000 }] })),
      await post('/orders', order(ID(2), 'CN01', 'SUA325', 1, 325_000, { mode: 'cash', cashGiven: 500_000 })),
    ]) expect(r.statusCode, r.body).toBe(201);
    const ret = await post('/returns', { id: ID(3), orderId: ID(2), branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
    expect(ret.statusCode, ret.body).toBe(201);
    const close = await post('/shifts/close', { shiftId, countedCash: 1_320_000, note: 'Thiếu 10.000' });
    expect(close.statusCode, close.body).toBe(200);
    // CN02: một đơn 330.000.
    const o3 = await post('/orders', order(ID(4), 'CN02', 'SUA330', 1, 330_000, { mode: 'cash', cashGiven: 330_000 }));
    expect(o3.statusCode, o3.body).toBe(201);
  });
  afterAll(async () => {
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = oldSecret;
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 dòng 1–4: BH13 đơn hai chi nhánh, mới nhất trước; thẻ chỉ số của cả kết quả lọc; lọc CN02', async () => {
    const r = await get(`/admin/orders?from=${TODAY}&to=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as { id: string; branchCode: string; cashier: string; payments: { method: string; name: string }[]; lines: unknown[]; docStatus: string }[];
    expect(rows.map((x) => x.id)).toEqual([ID(4), ID(2), ID(1)]);
    expect(r.json().meta).toMatchObject({ total: 3, sums: { orders: 3, total: 1_315_000, returned: 325_000, net: 990_000 } });
    const a = rows.find((x) => x.id === ID(1))!;
    expect(a.payments.map((p) => p.method)).toEqual(['TM', 'CK']);
    expect(a.lines).toHaveLength(1);
    expect(a.docStatus).toBeTruthy();
    expect(a.cashier).not.toBe(undefined);
    expect((await get(`/admin/orders?from=${TODAY}&branches=CN02`)).json().data.map((x: { id: string }) => x.id)).toEqual([ID(4)]);
  });

  it('§5 dòng 5: BH14 phiếu trả nối đơn gốc, hình thức kèm tên', async () => {
    const r = await get(`/admin/returns?from=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    const [x] = r.json().data as { orderId: string; refundTotal: number; refundMethod: string; refundMethodName: string; reason: string; exchange: boolean }[];
    expect(x).toMatchObject({ orderId: ID(2), refundTotal: 325_000, refundMethod: 'TM', reason: 'Khách đổi ý', exchange: false });
    expect(x!.refundMethodName).toBeTruthy();
    expect(r.json().meta).toMatchObject({ sums: { returns: 1, refundTotal: 325_000 } });
  });

  it('§5 dòng 6: BH15 sổ ca — phải có 1.330.000, đếm 1.320.000, chênh lệch −10.000; lọc chỉ ca có chênh lệch', async () => {
    const r = await get(`/admin/shifts?from=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    const [s] = r.json().data as Record<string, unknown>[];
    expect(s).toMatchObject({ branchCode: 'CN01', status: 'closed', openingCash: 1_000_000, expectedCash: 1_330_000, countedCash: 1_320_000, difference: -10_000, alert: true, orderCount: 2 });
    expect((await get(`/admin/shifts?from=${TODAY}&diffOnly=true`)).json().data).toHaveLength(1);
    expect((await get(`/admin/shifts?from=${TODAY}&branches=CN02&diffOnly=true`)).json().data).toHaveLength(0);
  });

  it('§5 dòng 7: BH16 tổng quan hai chi nhánh — doanh thu 1.315.000, trả 325.000, thuần 990.000; theo chi nhánh', async () => {
    const r = await get(`/admin/dashboard?from=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d).toMatchObject({ orderCount: 3, total: 1_315_000, returnTotal: 325_000, net: 990_000 });
    expect(d.byBranch.map((b: { code: string; total: number; returnTotal: number; net: number }) => [b.code, b.total, b.returnTotal, b.net]))
      .toEqual([['CN01', 985_000, 325_000, 660_000], ['CN02', 330_000, 0, 330_000]]);
  });

  it('§5 dòng 8: BH17 đổi hạn trả 3 → 5 ngày; đơn bán 4 ngày trước không còn đòi người duyệt; ngoài khoảng bị từ chối', async () => {
    const before = await get('/admin/settings');
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json().data.values).toMatchObject({ returnDays: 3, requireOpenShift: false, shiftScope: 'branch', cashDiffAlert: 0 });
    const old = await post('/orders', order(ID(5), 'CN01', 'SUA330', 1, 330_000, { mode: 'cash', cashGiven: 330_000 }, vnDate(-4)));
    expect(old.statusCode, old.body).toBe(201);
    expect((await get(`/orders/${ID(5)}/returnable?branch=CN01`)).json().data.late).toBe(true);
    const put = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.pos.return_days', { key: 'bizcity.pos.return_days', value: 5 });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await get('/admin/settings')).json().data.values.returnDays).toBe(5);
    expect((await get(`/orders/${ID(5)}/returnable?branch=CN01`)).json().data.late).toBe(false);
    expect((await get('/bootstrap?branch=CN01')).json().data.returnPolicy.days).toBe(5);
    const bad = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.pos.return_days', { key: 'bizcity.pos.return_days', value: 99 });
    expect(bad.status).toBe(400);
  });

  it('§5 dòng 10: thu ngân chỉ có pos:sell → 403 ở đường quản trị', async () => {
    const r = await loginWithWpTicket(ticket({ email: 'thu-ngan-008@example.test', name: 'Thu ngân 008', tenant: ctx.tenantCode, perms: ['pos:sell'] }));
    expect(r.user.permissions).toEqual(['pos:sell']);
    for (const p of ['/admin/orders', '/admin/returns', '/admin/shifts', '/admin/dashboard', '/admin/settings']) expect((await get(p, r.token)).statusCode, p).toBe(403);
    expect((await get('/bootstrap?branch=CN01', r.token)).statusCode).toBe(200);
  });
});
