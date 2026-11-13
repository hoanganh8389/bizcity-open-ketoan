/**
 * NT-BH-007 — ca bán (mở / chốt, đếm két) và báo cáo bán hàng của máy bán POS (module pos, migration module 0004).
 * Số liệu đúng §4 của phiếu: đầu ca 1.000.000; đơn A 660.000 (TM 330.000 + CK 330.000); đơn B 325.000 tiền mặt (đưa 500.000);
 * trả 1 hộp đơn B hoàn tiền mặt 325.000; đếm được 1.320.000 → thiếu 10.000.
 */
// [2026-11-12 05:00 PM Võ Hoàng] POS-W3 — test tích hợp phiếu NT-BH-007 (đóng góp)
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
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const A = '0193a1b2-0000-7000-8000-000000007001';
const B = '0193a1b2-0000-7000-8000-000000007002';

const order = (id: string, sku: string, qty: number, price: number, payment: unknown) => ({
  id, branchCode: 'CN01', businessDate: TODAY, shiftId: 'x', exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku, unitName: 'Hộp', unitQty: qty, clientUnitPrice: price }], promotionSelections: [],
  payment, clientTotal: qty * price, coreVersion: '0.1.0', promotionsVersion: '',
});

describe.skipIf(!HAS)('NT-BH-007 — ca bán và báo cáo của máy bán POS', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let shiftId = '';
  const auth = () => ({ authorization: `Bearer ${ctx.token}` });
  const get = (url: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: auth() });
  const post = (url: string, payload: unknown, key = `nt-bh-007-${++k}-${Date.now()}`) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...auth(), 'idempotency-key': key } });

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-007', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }, { sku: 'SUA325', name: 'Sữa 325', unit: 'Hộp' }] })).status).toBeLessThan(300);
    for (const sku of ['SUA330', 'SUA325']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 dòng 1–2: mở ca (tiền đầu ca); mở lần hai → POS_SHIFT_ALREADY_OPEN; bootstrap trả ca đang mở', async () => {
    expect((await get('/shifts/current?branch=CN01')).json().data).toBeNull();
    const r = await post('/shifts/open', { openingCash: 1_000_000, branchCode: 'CN01' });
    expect(r.statusCode, r.body).toBe(201);
    shiftId = r.json().data.id;
    const again = await post('/shifts/open', { openingCash: 0, branchCode: 'CN01' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.details).toMatchObject({ reason: 'POS_SHIFT_ALREADY_OPEN', shiftId });
    expect((await get('/bootstrap?branch=CN01')).json().data.openShift.id).toBe(shiftId);
  });

  it('§5 dòng 3–7: số liệu ca sau 2 đơn và 1 phiếu trả tiền mặt', async () => {
    const a = await post('/orders', order(A, 'SUA330', 2, 330_000, { mode: 'split', parts: [{ method: 'TM', amount: 330_000 }, { method: 'CK', amount: 330_000 }] }));
    expect(a.statusCode, a.body).toBe(201);
    const b = await post('/orders', order(B, 'SUA325', 1, 325_000, { mode: 'cash', cashGiven: 500_000 }));
    expect(b.statusCode, b.body).toBe(201);
    const ret = await post('/returns', { id: '0193a1b2-0000-7000-8000-00000000r701', orderId: B, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
    expect(ret.statusCode, ret.body).toBe(201);
    const cur = (await get('/shifts/current?branch=CN01')).json().data;
    expect(cur).toMatchObject({
      id: shiftId, openingCash: 1_000_000, orderCount: 2, total: 985_000, cashSales: 655_000, returnCount: 1, cashRefunds: 325_000, expectedCash: 1_330_000, blockers: [],
    });
    expect(cur.byPayment).toMatchObject([{ method: 'TM', amount: 655_000 }, { method: 'CK', amount: 330_000 }]);
    for (const m of cur.byPayment) expect(m.name).toBeTruthy();
  });

  // [2026-11-13 09:20 PM Võ Hoàng] NGHIEM-THU — NT-BH-007 Q1 chốt 13/11 (NT-BH-014): chốt ca lệch két lập một phiếu kế toán theo lý do thiếu (đóng góp)
  it('§5 dòng 8–9: chốt ca đếm 1.320.000 → thiếu 10.000; phiếu kế toán theo lý do (Q1 chốt 13/11, NT-BH-014: chưa khai lý do → chưa lập, ca vẫn chốt); chốt lại → POS_SHIFT_CLOSED, gửi lại cùng khoá → biên bản cũ', async () => {
    const docsBefore = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);
    const key = `nt-bh-007-chot-${Date.now()}`;
    const r = await post('/shifts/close', { shiftId, countedCash: 1_320_000, note: 'Thiếu 10.000' }, key);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ id: shiftId, expectedCash: 1_330_000, countedCash: 1_320_000, difference: -10_000, forced: false, note: 'Thiếu 10.000' });
    // Đơn vị test chưa khai lý do POS-THIEU-KET: Core từ chối phiếu, ca vẫn chốt, biên bản ghi "chưa lập" (đủ luồng ở NT-BH-014).
    expect(Number((await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n)).toBe(docsBefore);
    expect(r.json().data.journal).toMatchObject({ reasonCode: 'POS-THIEU-KET', amount: 10_000, status: 'not_created' });
    const replay = await post('/shifts/close', { shiftId, countedCash: 1_320_000, note: 'Thiếu 10.000' }, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.difference).toBe(-10_000);
    const again = await post('/shifts/close', { shiftId, countedCash: 1_330_000 });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.details.reason).toBe('POS_SHIFT_CLOSED');
    expect((await get('/shifts/current?branch=CN01')).json().data).toBeNull();
  });

  it('§5 dòng 10: danh sách đơn của chi nhánh, mới nhất trước, tổng của cả kết quả lọc; lọc theo mã', async () => {
    const r = await get(`/reports/orders?from=${TODAY}&to=${TODAY}&branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.map((o: { id: string }) => o.id)).toEqual([B, A]);
    expect(r.json().meta).toMatchObject({ total: 2, sums: { total: 985_000, returnedAmount: 325_000 } });
    const code = r.json().data[1].code as string;
    expect((await get(`/reports/orders?q=${code}&branch=CN01`)).json().data.map((o: { id: string }) => o.id)).toEqual([A]);
  });

  it('§5 dòng 11: tổng quan ngày — đơn, doanh thu, trả, thuần, theo hình thức, mặt hàng bán chạy', async () => {
    const r = await get(`/reports/dashboard?from=${TODAY}&branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d).toMatchObject({ orderCount: 2, total: 985_000, returnCount: 1, returnTotal: 325_000, net: 660_000 });
    expect(d.byPayment).toMatchObject([{ method: 'TM', amount: 655_000 }, { method: 'CK', amount: 330_000 }]);
    expect(d.topProducts.map((p: { sku: string; qty: number; total: number }) => [p.sku, p.qty, p.total])).toEqual([['SUA330', 2, 660_000], ['SUA325', 1, 325_000]]);
    expect(d.byHour.reduce((s: number, h: { orders: number }) => s + h.orders, 0)).toBe(2);
  });
});
