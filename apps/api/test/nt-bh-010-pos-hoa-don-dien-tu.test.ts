/** NT-BH-010 — người mua hoá đơn điện tử lưu ở đơn module pos, đi theo bản sao sổ (phiên bản mới). */
// [2026-11-13 12:30 AM Võ Hoàng] POS-QR — test tích hợp phiếu NT-BH-010 (đóng góp)
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
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
const order = (id: string, qty: number, payment: unknown, extra: Record<string, unknown> = {}) => ({
  id, branchCode: 'CN01', businessDate: TODAY, shiftId: 'x', exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', unitQty: qty, clientUnitPrice: 330_000 }], promotionSelections: [],
  payment, clientTotal: qty * 330_000, coreVersion: '0.1.0', promotionsVersion: '', ...extra,
});

/** Đơn vị thử có module pos, mặt hàng SUA330 (R08). */
function usePos(tag: string) {
  const s = { ctx: null as unknown as TestCtx, app: null as unknown as FastifyInstance, tenantId: '', k: 0 };
  const auth = () => ({ authorization: `Bearer ${s.ctx.token}` });
  const get = (url: string) => s.app.inject({ method: 'GET', url: `${M}${url}`, headers: auth() });
  const post = (url: string, payload: unknown, key = `${tag}-${++s.k}-${Date.now()}`) =>
    s.app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...auth(), 'idempotency-key': key } });
  beforeAll(async () => {
    s.ctx = await setupTenant();
    s.tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', s.ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled(`test:${tag}`, trx as never); });
    s.app = await buildApp();
    expect((await call(s.ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(s.ctx, 'PUT', '/api/v1/products/SUA330', { taxOutCode: 'R08' })).status).toBe(200);
  });
  afterAll(async () => {
    await s.app?.close();
    await s.ctx?.app.close();
  });
  const events = async (subject: string) => (await sql<{ data: { version: number } }>`
    SELECT data FROM event_outbox WHERE tenant_id = ${s.tenantId} AND type = 'pos.order.recorded' AND subject = ${subject} ORDER BY id`.execute(db)).rows.map((r) => r.data.version);
  return { s, get, post, events };
}

const ID = (n: number) => `0193a1b2-0000-7000-8000-00000001${String(n).padStart(4, '0')}`;

describe.skipIf(!HAS)('NT-BH-010 — hoá đơn điện tử cho đơn máy bán', () => {
  const { get, post, events } = usePos('nt-bh-010');

  it('§5 dòng 1, 4: lưu người mua → đơn có invoiceBuyer, bản sao v2; gửi lại cùng nội dung → không đổi', async () => {
    expect((await post('/orders', order(ID(1), 2, { mode: 'cash', cashGiven: 660_000 }))).statusCode).toBe(201);
    const body = { taxCode: '0101234567', companyName: 'Công ty TNHH Thử', address: '1 Phố Thử', email: 'ke-toan@example.test', excludedSkus: ['SUA330'], under24Confirmed: true };
    const r = await post(`/orders/${ID(1)}/invoice-buyer`, body);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.invoiceBuyer).toEqual(body);
    expect(await events(`pos.order:${ID(1)}`)).toEqual([1, 2]);
    expect((await post(`/orders/${ID(1)}/invoice-buyer`, body)).statusCode).toBe(200);
    expect(await events(`pos.order:${ID(1)}`)).toEqual([1, 2]);
    expect((await get(`/orders/${ID(1)}`)).json().data.invoiceBuyer.taxCode).toBe('0101234567');
  });

  it('§5 dòng 2–3: MST sai khuôn → 400; đơn chờ trả tiền → 409; đơn đã huỷ → POS_ORDER_CANCELLED', async () => {
    expect((await post(`/orders/${ID(1)}/invoice-buyer`, { taxCode: '12345' })).statusCode).toBe(400);
    expect((await post('/orders', order(ID(2), 1, { mode: 'qr' }))).statusCode).toBe(201);
    expect((await post(`/orders/${ID(2)}/invoice-buyer`, { taxCode: '0101234567' })).statusCode).toBe(409);
    expect((await post(`/orders/${ID(2)}/cancel`, {})).statusCode).toBe(200);
    const c = await post(`/orders/${ID(2)}/invoice-buyer`, { taxCode: '0101234567' });
    expect(c.statusCode).toBe(409);
    expect(c.json().error.details.reason).toBe('POS_ORDER_CANCELLED');
  });
});
