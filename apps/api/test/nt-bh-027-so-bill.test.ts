// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-027 số bill theo dạng shop (đóng góp)
/**
 * NT-BH-027 — số bill máy bán theo dạng của shop (chốt 18/11/2026): {mã shop}BT{5 số} liên tục từ số kế thừa (khoá
 * bizcity.pos.shop_codes), bill Z = mã cha + Z, huỷ giữ số, phiếu hoàn {mã shop}.B{5 số}, tràn 99999 sang BU, báo cáo số bill bị thiếu.
 * Cửa hàng chưa khai số kế thừa giữ HD / TH như cũ; mã HD cũ vẫn tra cứu, trả hàng được. Gọi HTTP như máy bán vào module pos.
 * Số theo docs/nghiem-thu/ban-hang/NT-BH-027-so-bill-theo-dang-shop.md §3.
 */
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
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const M = '/api/v1/m/pos';
const KEY = 'bizcity.pos.shop_codes';
const vnDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
/** Ngày cuối tháng trước (qua tháng: số không về 10000). */
const LAST_MONTH = new Date(Date.UTC(Number(TODAY.slice(0, 4)), Number(TODAY.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
const SHOP = '08022';
const SKU = 'SUA027';
const QUA = 'QUA027Z';

let n = 0;
const uuid = (p = '0') => `0193a1b2-0000-7000-8000-${p}${String(27_000 + ++n).padStart(11, '0')}`;
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, branchCode: SHOP, businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Hộp', unitQty: 1, clientUnitPrice: 330_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 330_000 }, clientTotal: 330_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-027 — số bill theo dạng shop', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-027-${++k}-${Date.now()}` }) },
  });
  const post = (url: string, payload: unknown) => req('POST', `${M}${url}`, payload);
  const get = (url: string) => req('GET', `${M}${url}`);
  const setting = async (value: unknown) => {
    const r = await req('PUT', `/api/v1/settings/values/${KEY}`, { key: KEY, value });
    expect(r.statusCode, r.body).toBeLessThan(300);
  };
  const sell = async (body: Record<string, unknown>) => {
    const r = await post('/orders', body);
    expect(r.statusCode, r.body).toBe(201);
    return r.json().data.order as { id: string; code: string; status: string; zBill?: { code: string } };
  };
  const HD_ID = uuid();

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-027', trx as never); });
    app = await buildApp();
    for (const code of [SHOP, '08023']) expect((await call(ctx, 'POST', '/api/v1/branches', { code, name: `Shop ${code}` })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 330', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'R08' })).status).toBe(200);
    // Quà mã không gửi thuế (Nội bộ, 0đ) → đơn có quà tách bill Z (như NT-BH-019).
    await sql`INSERT INTO products (tenant_id, sku, name, unit, tax_out_code, variant_code) VALUES (${tenantId}, ${QUA}, 'Quà không gửi thuế', 'Cái', 'R08', 'internal')`.execute(db);
    for (const b of [SHOP, '08023', 'CN01']) await nhapTon(ctx, b, [[SKU, 1000, 'Hộp'], [QUA, 100, 'Cái']]);
    await khaiGia(tenantId, [[SKU, 'Hộp', 330_000]]);
    // Đơn bán trước khi shop chuyển dạng: mã HD như cũ.
    const old = await sell(order(HD_ID));
    expect(old.code).toMatch(/^HD\d{4}000001$/);
    // Số cuối ở website: bán 08022BT12345, hoàn 08022.B00268; shop 08023 sắp tràn dải.
    await setting([`${SHOP}=${SHOP}BT12345/${SHOP}.B00268`, '08023=99998']);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  const ids = { a: uuid(), b: uuid(), z: uuid(), m: uuid() };

  it('§3 dòng 1: shop 08022, số cuối website 08022BT12345 → đơn đầu 08022BT12346, đơn sau 08022BT12347', async () => {
    const boot = await get(`/bootstrap?branch=${SHOP}`);
    expect(boot.json().data.codeFormat).toBe('shop');
    expect((await sell(order(ids.a))).code).toBe(`${SHOP}BT12346`);
    // Đơn sau: QR chờ tiền (để huỷ ở dòng 4).
    const b = await sell(order(ids.b, { payment: { mode: 'qr' } }));
    expect(b).toMatchObject({ code: `${SHOP}BT12347`, status: 'awaiting_payment' });
  });

  it('§3 dòng 4: huỷ đơn 12347 → giữ số, "Đã huỷ" tra cứu thấy; đơn kế 12348 (có quà tách bill Z)', async () => {
    const c = await post(`/orders/${ids.b}/cancel`, { reason: 'Khách không chuyển' });
    expect(c.statusCode, c.body).toBe(200);
    expect(c.json().data).toMatchObject({ code: `${SHOP}BT12347`, status: 'cancelled' });
    const look = await get(`/orders/lookup?code=${SHOP}BT12347&branch=${SHOP}`);
    expect(look.json().data).toMatchObject({ code: `${SHOP}BT12347`, status: 'cancelled' });
    // §3 dòng 3: bill Z = mã cha + Z, không tiêu số của bộ đếm.
    const z = await sell(order(ids.z, { lines: [
      { lineId: 'l1', sku: SKU, unitName: 'Hộp', unitQty: 1, clientUnitPrice: 330_000 },
      { lineId: 'l2', sku: QUA, unitName: 'Cái', unitQty: 1, clientUnitPrice: 0 },
    ] }));
    expect(z.code).toBe(`${SHOP}BT12348`);
    expect(z.zBill?.code).toBe(`${SHOP}BT12348Z`);
    expect(z.code.length).toBeLessThanOrEqual(12);
  });

  it('§3 dòng 2: qua ngày / qua tháng — số chạy tiếp, không về 10000', async () => {
    const m = await sell(order(ids.m, { businessDate: LAST_MONTH, shiftId: `ngay-${LAST_MONTH}` }));
    expect(m.code).toBe(`${SHOP}BT12349`);
  });

  it('§3 dòng 5: máy xin dải 12350–12359, dùng 12350–12352 → báo cáo số thiếu ngày đó 12353–12359, lý do "máy … xin chưa dùng"', async () => {
    const r = await post('/sequences/reserve', { kind: 'sale', count: 10, branchCode: SHOP, businessDate: TODAY, deviceId: 'MAY-01' });
    expect(r.statusCode, r.body).toBe(200);
    const codes = r.json().data.codes as string[];
    expect(codes[0]).toBe(`${SHOP}BT12350`);
    expect(codes[9]).toBe(`${SHOP}BT12359`);
    for (const code of codes.slice(0, 3)) expect((await sell(order(uuid(), { reservedCode: code }))).code).toBe(code);
    const rep = await get(`/reports/missing-codes?branch=${SHOP}&date=${TODAY}`);
    expect(rep.statusCode, rep.body).toBe(200);
    const d = rep.json().data;
    expect(d.total).toBe(7);
    expect(d.items.map((i: { code: string }) => i.code)).toEqual(Array.from({ length: 7 }, (_, i) => `${SHOP}BT${12353 + i}`));
    expect(d.items[0]).toMatchObject({ kind: 'sale', reasonCode: 'reserved_unused', deviceId: 'MAY-01' });
    expect(d.items[0].reason).toMatch(/^máy MAY-01 xin lúc .* chưa dùng$/);
    expect(d.ranges).toEqual([expect.objectContaining({ kind: 'sale', from: `${SHOP}BT12353`, to: `${SHOP}BT12359`, count: 7 })]);
    // Đơn huỷ giữ số → không thành số thiếu; ngày khác không có dải → rỗng.
    expect((await get(`/reports/missing-codes?branch=${SHOP}&date=${LAST_MONTH}`)).json().data.total).toBe(0);
    // Đơn sau dải đã xin: số mới nối tiếp, không dùng lại số đã cấp cho máy.
    expect((await sell(order(uuid()))).code).toBe(`${SHOP}BT12360`);
  });

  it('§3 dòng 6: phiếu hoàn đầu tiên trên React = 08022.B{số cuối + 1}', async () => {
    const r = await post('/returns', { id: uuid('r'), orderId: ids.a, branchCode: SHOP, lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách trả hàng' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.code).toBe(`${SHOP}.B00269`);
  });

  it('§2 mục 7: mã cũ HD… đã phát hành vẫn tra cứu, trả hàng được (phiếu hoàn theo dạng shop)', async () => {
    const old = (await sql<{ code: string }>`SELECT code FROM mod_pos.orders WHERE tenant_id = ${tenantId} AND order_id = ${HD_ID}`.execute(db)).rows[0]!.code;
    expect(old).toMatch(/^HD/);
    const look = await get(`/orders/lookup?code=${old}&branch=${SHOP}`);
    expect(look.statusCode, look.body).toBe(200);
    expect(look.json().data.code).toBe(old);
    const r = await post('/returns', { id: uuid('r'), orderId: old, branchCode: SHOP, lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Trả đơn mã cũ' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.code).toBe(`${SHOP}.B00270`);
  });

  it('§3 dòng 7: số 99999 → đơn kế 08023BU00001', async () => {
    expect((await sell(order(uuid(), { branchCode: '08023' }))).code).toBe('08023BT99999');
    expect((await sell(order(uuid(), { branchCode: '08023' }))).code).toBe('08023BU00001');
  });

  it('cửa hàng chưa khai số kế thừa: giữ HD / TH theo tháng như cũ', async () => {
    const boot = await get('/bootstrap?branch=CN01');
    expect(boot.json().data.codeFormat).toBe('legacy');
    const o = await sell(order(uuid(), { branchCode: 'CN01' }));
    expect(o.code).toMatch(/^HD\d{4}000001$/);
    const r = await post('/returns', { id: uuid('r'), orderId: o.id, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách trả hàng' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.code).toMatch(/^TH\d{4}000001$/);
  });

  it('số kế thừa chỉ nâng sàn bộ đếm: đặt thấp hơn số đã cấp không làm số chạy lùi / trùng', async () => {
    await setting([`${SHOP}=12000/1`, '08023=99998']);
    expect((await sell(order(uuid()))).code).toBe(`${SHOP}BT12361`);
  });
});
