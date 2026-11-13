/** NT-BH-009 — thanh toán QR chuyển khoản qua module pos: chờ tiền → xác nhận (ngân hàng / bấm tay) / gia hạn / huỷ. */
// [2026-11-13 12:30 AM Võ Hoàng] POS-QR — test tích hợp phiếu NT-BH-009 (đóng góp)
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

const ID = (n: number) => `0193a1b2-0000-7000-8000-00000000${String(9000 + n).padStart(4, '0')}`;

describe.skipIf(!HAS)('NT-BH-009 — thanh toán QR ở máy bán', () => {
  const { s, get, post, events } = usePos('nt-bh-009');

  it('§5 dòng 1: đơn QR → chờ trả tiền, có phần qr, chứng từ nộp ngay theo hình thức QR, chưa có bản sao', async () => {
    const r = await post('/orders', order(ID(1), 2, { mode: 'qr' }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o).toMatchObject({ status: 'awaiting_payment', qr: { amount: 660_000, status: 'waiting' } });
    expect(Date.parse(o.qr.expiresAt)).toBeGreaterThan(Date.now());
    const pay = (await sql<{ p: { payments: { methodCode: string; amount: number }[] } }>`
      SELECT payload AS p FROM accounting_events WHERE tenant_id = ${s.tenantId} AND doc_key = ${`pos:CN01:sale:${ID(1)}`}`.execute(db)).rows[0]?.p;
    expect(pay?.payments).toEqual([{ methodCode: 'QR', amount: 660_000 }]);
    expect(await events(`pos.order:${ID(1)}`)).toEqual([]);
  });

  it('§5 dòng 5, 2, 4: số tiền lệch → POS_PAYMENT_MISMATCH; ngân hàng báo có → hoàn tất + bản sao v2; gọi lại → không đổi', async () => {
    const bad = await post(`/orders/${ID(1)}/qr/confirm`, { source: 'bank', amount: 600_000 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_PAYMENT_MISMATCH', expected: 660_000, amount: 600_000 });
    const ok = await post(`/orders/${ID(1)}/qr/confirm`, { source: 'bank', amount: 660_000, paymentRef: 'TTCK-1' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data).toMatchObject({ status: 'completed', qr: { status: 'paid', source: 'bank', paymentRef: 'TTCK-1' } });
    expect(await events(`pos.order:${ID(1)}`)).toEqual([2]);
    expect((await post(`/orders/${ID(1)}/qr/confirm`, { source: 'manual', amount: 660_000 })).json().data.qr.source).toBe('bank');
    expect(await events(`pos.order:${ID(1)}`)).toEqual([2]);
  });

  it('§5 dòng 3 + chia tiền: phần QR của đơn TM + QR; thu ngân bấm tay → ghi người bấm, ghi chú', async () => {
    const r = await post('/orders', order(ID(2), 2, { mode: 'split', parts: [{ method: 'TM', amount: 330_000 }, { method: 'QR', amount: 330_000 }] }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order).toMatchObject({ status: 'awaiting_payment', qr: { amount: 330_000 } });
    const ok = await post(`/orders/${ID(2)}/qr/confirm`, { source: 'manual', amount: 330_000, note: 'Đã thấy tiền trên app ngân hàng' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data.qr).toMatchObject({ status: 'paid', source: 'manual', manual: { note: 'Đã thấy tiền trên app ngân hàng' } });
  });

  it('§5 dòng 6–7: gia hạn trong ngày; sau ngày bán → POS_QR_EXPIRED (bấm tay cũng vậy, ngân hàng báo có vẫn nhận)', async () => {
    expect((await post('/orders', order(ID(3), 1, { mode: 'qr' }))).statusCode).toBe(201);
    const before = (await get(`/orders/${ID(3)}`)).json().data.qr.expiresAt as string;
    await new Promise((r) => setTimeout(r, 5));
    const renew = await post(`/orders/${ID(3)}/qr/renew`, {});
    expect(renew.statusCode, renew.body).toBe(200);
    expect(Date.parse(renew.json().data.qr.expiresAt)).toBeGreaterThanOrEqual(Date.parse(before));
    expect((await post('/orders', order(ID(4), 1, { mode: 'qr' }, { businessDate: vnDate(-1), shiftId: 'y' }))).statusCode).toBe(201);
    for (const r of [await post(`/orders/${ID(4)}/qr/renew`, {}), await post(`/orders/${ID(4)}/qr/confirm`, { source: 'manual', amount: 330_000 })]) {
      expect(r.statusCode).toBe(409);
      expect(r.json().error.details.reason).toBe('POS_QR_EXPIRED');
    }
    const bank = await post(`/orders/${ID(4)}/qr/confirm`, { source: 'bank', amount: 330_000 });
    expect(bank.json().data.status).toBe('completed');
  });

  it('§5 dòng 8–10: chốt ca bị chặn khi còn đơn chờ; huỷ đơn chờ; tiền về đơn đã huỷ → POS_ORDER_CANCELLED', async () => {
    const open = await post('/shifts/open', { openingCash: 0, branchCode: 'CN01' });
    expect(open.statusCode, open.body).toBe(201);
    expect((await post('/orders', order(ID(5), 1, { mode: 'qr' }))).statusCode).toBe(201);
    const cur = (await get('/shifts/current?branch=CN01')).json().data;
    expect(cur.blockers.map((b: { kind: string }) => b.kind)).toEqual(['awaiting_payment']);
    const c = await post(`/orders/${ID(5)}/cancel`, { reason: 'Khách không chuyển' });
    expect(c.statusCode, c.body).toBe(200);
    expect(c.json().data.status).toBe('cancelled');
    const late = await post(`/orders/${ID(5)}/qr/confirm`, { source: 'bank', amount: 330_000 });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.details.reason).toBe('POS_ORDER_CANCELLED');
  });
});
