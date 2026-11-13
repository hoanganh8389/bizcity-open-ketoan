/** NT-BH-011 — ca bán bổ sung: thi hành "bắt buộc mở ca" (BH17), tồn cả cửa hàng cho Excel cuối ca. */
// [2026-11-13 12:30 AM Võ Hoàng] POS-QR — test tích hợp phiếu NT-BH-011 (đóng góp)
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

const ID = (n: number) => `0193a1b2-0000-7000-8000-00000002${String(n).padStart(4, '0')}`;

describe.skipIf(!HAS)('NT-BH-011 — ca bán bổ sung', () => {
  const { s, get, post } = usePos('nt-bh-011');

  it('§5 dòng 3: mặc định (tắt) — chưa mở ca vẫn bán; bootstrap requireOpenShift = false, ca theo ngày', async () => {
    const b = (await get('/bootstrap?branch=CN01')).json().data;
    expect(b.requireOpenShift).toBe(false);
    expect(b.openShift.id).toMatch(/^ngay-/);
    expect((await post('/orders', order(ID(1), 1, { mode: 'cash', cashGiven: 330_000 }))).statusCode).toBe(201);
  });

  it('§5 dòng 1, 2, 4 + lệch chuẩn 1: bật bắt buộc → chưa mở ca bị chặn POS_SHIFT_REQUIRED; đơn ngoại tuyến vẫn nhận; mở ca thì bán được', async () => {
    const put = await call(s.ctx, 'PUT', '/api/v1/settings/values/bizcity.pos.require_open_shift', { key: 'bizcity.pos.require_open_shift', value: true });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const b = (await get('/bootstrap?branch=CN01')).json().data;
    expect(b).toMatchObject({ requireOpenShift: true, openShift: null });
    const no = await post('/orders', order(ID(2), 1, { mode: 'cash', cashGiven: 330_000 }));
    expect(no.statusCode).toBe(409);
    expect(no.json().error.details.reason).toBe('POS_SHIFT_REQUIRED');
    const off = await post('/orders', order(ID(3), 1, { mode: 'cash', cashGiven: 330_000 }, { offlineCreatedAt: new Date().toISOString() }));
    expect(off.statusCode, off.body).toBe(201);
    expect((await post('/shifts/open', { openingCash: 0, branchCode: 'CN01' })).statusCode).toBe(201);
    expect((await post('/orders', order(ID(2), 1, { mode: 'cash', cashGiven: 330_000 }))).statusCode).toBe(201);
    expect((await get('/bootstrap?branch=CN01')).json().data.openShift.id).not.toMatch(/^ngay-/);
  });

  it('§5 dòng 5: tồn cả cửa hàng cho Excel cuối ca — mã có tồn khác 0, kèm tên, ĐVT', async () => {
    const pn = await call(s.ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: 'NT11-PN1', branchCode: 'CN01', docNo: 'NT11-PN1', docDate: vnDate(-2), partner: { code: 'NCC-11', name: 'NCC 11' },
      lines: [{ lineKey: 'l1', sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 20, amountBeforeTax: 4_000_000, taxCode: 'V08', taxAmount: 320_000 }],
      totals: { beforeTax: 4_000_000, tax: 320_000, total: 4_320_000 },
    });
    expect(pn.body.data?.status, JSON.stringify(pn.body)).toBe('posted');
    const st = await get('/stock/all?branch=CN01');
    expect(st.statusCode, st.body).toBe(200);
    expect(st.json().data.branch.code).toBe('CN01');
    expect(st.json().data.rows).toEqual([{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 17 }]);
  });
});
