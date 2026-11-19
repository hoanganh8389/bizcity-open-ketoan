/**
 * NT-BH-032 — giao hàng cho đơn đặt hàng + copy đơn (chốt 18/11/2026): thông tin giao trên đơn BH20; chuyến giao Chờ lấy → Đang giao
 * (chuyển kho KCB → KHG, chưa doanh thu) → Đã giao (phiếu bán BH10 nháp xuất từ KHG, dòng phí ship, thanh toán "COD — hãng") | Hoàn
 * (KHG → KCB, đơn vẫn mở); thiếu kho KHG / mã phí ship / hình thức COD → báo rõ; copy đơn → đơn, BH10 đã duyệt → đơn, đơn máy bán → đơn
 * (giá + khuyến mại tính lại theo hôm nay); người không có quyền cập nhật giao → 403.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-032 (đóng góp)
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
const PB = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(PB, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const SKU = 'SUA330';
const FEE = 'PHISHIP';
const PHONE = '0909000111';
const vnDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() + offset * 86_400_000));
const TODAY = vnDay();
const KEY = { hold: 'bizcity.phieu_ban.hold_warehouses', ship: 'bizcity.phieu_ban.ship_warehouses', fee: 'bizcity.phieu_ban.ship_fee_sku', cod: 'bizcity.phieu_ban.cod_methods' };
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(32_000_000 + ++seq).padStart(12, '0')}`;

type Shipment = { id: string; seq: number; status: string; carrier: string; trackingNo: string | null; fee: number; cod: number; shipWarehouseCode: string | null;
  saleDocId: string | null; saleDocNo: string | null; log: { by: string; byName?: string; from: string | null; to: string; at: string }[] };
type Order = { id: string; orderNo: string; status: string; note?: string; copiedFrom: string | null; partner?: { code: string };
  shipping: { receiver?: string; phone?: string; address?: string; fee: number; carrier?: string; trackingNo?: string; cod: number } | null;
  lines: { lineKey: string; sku: string; qty: number; unitPrice: number; discount: number; isGift: boolean; delivered: number; held: number; shipping?: number; policyRef?: { key: string } }[];
  policyRefs?: { key: string }[]; shipments?: Shipment[] };

describe.skipIf(!HAS)('NT-BH-032 — giao hàng đơn đặt hàng + copy đơn', () => {
  let ctx: TestCtx;
  let kt: TestCtx;
  let viewer: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-032-${++k}-${Date.now()}` }) },
  });
  const M = '/api/v1/m/phieu-ban';
  const stockAt = async (wh: string, sku = SKU) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = 'CN01' AND sku = ${sku} AND warehouse_code = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const byAccount = async (docKey: string) => (await sql<{ account: string; d: string; c: string }>`
      SELECT l.account_code AS account, SUM(l.debit) AS d, SUM(l.credit) AS c
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND NOT e.is_reversal
       GROUP BY l.account_code ORDER BY l.account_code`.execute(db)).rows.map((r) => ({ account: r.account, d: Number(r.d), c: Number(r.c) }));
  const saleEvents = async () => Number((await sql<{ n: string }>`
    SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_type = 'sale' AND doc_key LIKE 'phieu-ban:%'`.execute(db)).rows[0]!.n);
  const setting = async (key: string, value: unknown) => {
    const r = await req(ctx, 'PUT', `/api/v1/settings/values/${key}`, { key, value });
    expect(r.statusCode, r.body).toBeLessThan(300);
  };
  const userCtx = async (email: string, role: string): Promise<TestCtx> => {
    expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
    return { ...ctx, token: res.json().data.token };
  };
  const getOrder = async (id: string) => (await req(ctx, 'GET', `${M}/orders/${id}`)).json().data as Order;
  const ship = (who: TestCtx, o: Order, s: Shipment, status: string, extra: Record<string, unknown> = {}) =>
    req(who, 'POST', `${M}/orders/${o.id}/shipments/${s.id}/status`, { status, ...extra });

  let o1: Order;
  let s1: Shipment;
  let posCode = '';
  let saleNo = '';

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-032', trx as never); });
    app = await buildApp();
    kt = await userCtx('kt032@ketoan.local', 'accountant');
    viewer = await userCtx('xem032@ketoan.local', 'viewer');
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 330', unit: 'Hộp' }, { sku: FEE, name: 'Phí ship thu khách', unit: 'Lần' }] })).status).toBeLessThan(300);
    for (const s of [SKU, FEE]) expect((await call(ctx, 'PUT', `/api/v1/products/${s}`, { taxOutCode: 'KCT' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An', phone: PHONE, paymentTermDays: 30 })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/partners/GHN', { name: 'Giao Hàng Nhanh (hãng)', kind: 'supplier' })).status).toBeLessThan(300);
    // Kế toán khai hình thức "COD — GHN": phải thu hãng (tài khoản + đối tượng ở danh mục hình thức, không ở module).
    const pm = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/COD-GHN', { name: 'COD — GHN', accountCode: '13881', partnerCode: 'GHN' });
    expect(pm.status, JSON.stringify(pm.body)).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-K1', branchCode: 'CN01', name: 'Kho bán CN01', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-KCB', branchCode: 'CN01', name: 'Kho chờ bán CN01', typeCode: 'KCB' })).status).toBe(201);
    await nhapTon(ctx, 'CN01', [[SKU, 100, 'Hộp']]);
    await khaiGia(tenantId, [[SKU, 'Hộp', 330_000]]);
    await setting(KEY.hold, ['CN01=CN01-KCB']);
    // Hoá đơn máy bán (khách quen SĐT của KH001) 2 hộp giá 330.000 — để copy sau khi giá đổi (§3 dòng 7).
    const pos = await req(ctx, 'POST', '/api/v1/m/pos/orders', {
      id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { phone: PHONE, name: 'Đại lý An' },
      lines: [{ lineId: 'l1', sku: SKU, unitName: 'Hộp', unitQty: 2, clientUnitPrice: 330_000 }], promotionSelections: [],
      payment: { mode: 'cash', cashGiven: 660_000 }, clientTotal: 660_000, coreVersion: '0.1.0', promotionsVersion: '',
    });
    expect(pos.statusCode, pos.body).toBe(201);
    posCode = pos.json().data.order.code as string;
    expect(await stockAt('CN01-K1')).toBe(98);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1: đơn khai người nhận, địa chỉ, phí ship 30.000, hãng GHN, COD 1.000.000 → lưu, hiện trên đơn; gửi → giữ 10 hộp ở KCB', async () => {
    const r = await req(ctx, 'POST', `${M}/orders`, {
      orderDate: TODAY, branchCode: 'CN01', validUntil: vnDay(3), partner: { code: 'KH001' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 10, unitPrice: 330_000 }],
      shipping: { receiver: 'Chị Lan', phone: '0911 222 333', address: '12 Lê Lợi, Q1', fee: 30_000, carrier: 'ghn', trackingNo: 'GHN123', cod: 1_000_000 },
    });
    expect(r.statusCode, r.body).toBe(200);
    o1 = r.json().data.order;
    expect(o1.shipping).toEqual({ receiver: 'Chị Lan', phone: '0911 222 333', address: '12 Lê Lợi, Q1', fee: 30_000, carrier: 'GHN', trackingNo: 'GHN123', cod: 1_000_000 });
    expect((await getOrder(o1.id)).shipping).toMatchObject({ carrier: 'GHN', cod: 1_000_000 });
    const s = await req(ctx, 'POST', `${M}/orders/${o1.id}/send`, {});
    expect(s.statusCode, s.body).toBe(200);
    expect(s.json().data.lines[0]).toMatchObject({ held: 10 });
    expect(await stockAt('CN01-KCB')).toBe(10);
  });

  it('§3 dòng 5: cửa hàng chưa có kho KHG → lập chuyến báo PHIEU_BAN_NO_SHIP_WAREHOUSE (khai kho KHG ở danh mục kho), không đi giao được', async () => {
    const r = await req(ctx, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 5 }] });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_NO_SHIP_WAREHOUSE', branchCode: 'CN01' });
    expect(r.json().error.message).toContain('khai kho KHG ở danh mục kho');
    expect((await getOrder(o1.id)).shipments).toEqual([]);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-KHG', branchCode: 'CN01', name: 'Kho hàng gửi bán CN01', typeCode: 'KHG' })).status).toBe(201);
    await setting(KEY.ship, ['CN01=CN01-KHG']);
    const st = (await req(ctx, 'GET', `${M}/order-settings`)).json().data;
    expect(st.ship.shipWarehouses).toEqual({ CN01: 'CN01-KHG' });
  });

  it('§3 dòng 2: lập chuyến 1 (5 hộp) → Chờ lấy; "Đi giao" → chuyển kho KCB → KHG 5 hộp; KCB −5, KHG +5; chưa có doanh thu; chuyến Đang giao', async () => {
    const c = await req(kt, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 5 }] });
    expect(c.statusCode, c.body).toBe(200);
    let o = c.json().data as Order;
    s1 = o.shipments![0]!;
    expect(s1).toMatchObject({ seq: 1, status: 'waiting', carrier: 'GHN', trackingNo: 'GHN123', fee: 30_000, cod: 1_000_000 });
    expect(o.lines[0]).toMatchObject({ delivered: 0, shipping: 5, held: 5 });
    expect(await stockAt('CN01-KCB')).toBe(10);
    const r = await ship(kt, o1, s1, 'shipping', { note: 'Shipper lấy hàng' });
    expect(r.statusCode, r.body).toBe(200);
    o = r.json().data;
    expect(o.shipments![0]).toMatchObject({ status: 'shipping', shipWarehouseCode: 'CN01-KHG' });
    const tr = r.json().meta.holdDocs as { docKey: string; docNo: string; status: string }[];
    expect(tr).toEqual([expect.objectContaining({ status: 'posted', docNo: `${o1.orderNo}-S2` })]);
    const ev = (await sql<{ doc_type: string; status: string }>`SELECT doc_type, status FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${tr[0]!.docKey}`.execute(db)).rows;
    expect(ev).toEqual([{ doc_type: 'transfer', status: 'posted' }]);
    expect(await stockAt('CN01-KCB')).toBe(5);
    expect(await stockAt('CN01-KHG')).toBe(5);
    expect(await saleEvents()).toBe(0);
    expect(o.shipments![0]!.log.map((g) => `${g.from}>${g.to}`)).toEqual(['null>waiting', 'waiting>shipping']);
    expect(o.shipments![0]!.log.every((g) => g.byName && Date.parse(g.at) > 0)).toBe(true);
  });

  it('§3 dòng 3: "Đã giao" → phiếu bán BH10 nháp xuất từ KHG 5 hộp + dòng phí ship 30.000 + thanh toán "COD — GHN"; duyệt → doanh thu, xuất kho KHG (giá vốn ở bước tính giá vốn), phải thu GHN', async () => {
    // Chưa khai mã phí ship / hình thức COD → báo rõ, chuyến vẫn Đang giao.
    const noFee = await ship(ctx, o1, s1, 'delivered');
    expect(noFee.statusCode, noFee.body).toBe(400);
    expect(noFee.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_NO_SHIP_FEE_ITEM' });
    await setting(KEY.fee, FEE);
    const noCod = await ship(ctx, o1, s1, 'delivered');
    expect(noCod.statusCode, noCod.body).toBe(400);
    expect(noCod.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_NO_COD_METHOD', carrier: 'GHN' });
    await setting(KEY.cod, ['GHN=COD-GHN']);
    const r = await ship(ctx, o1, s1, 'delivered', { note: 'Khách đã nhận' });
    expect(r.statusCode, r.body).toBe(200);
    const o = r.json().data as Order;
    const sh = o.shipments![0]!;
    expect(sh).toMatchObject({ status: 'delivered' });
    expect(sh.saleDocNo).toMatch(/^BH/);
    expect(o).toMatchObject({ status: 'open' });
    expect(o.lines[0]).toMatchObject({ delivered: 5, shipping: 0, held: 5 });
    const doc = (await req(ctx, 'GET', `${M}/docs/${sh.saleDocId}`)).json().data as {
      status: string; warehouseCode: string; lines: { lineKey: string; sku: string; qty: number; unitPrice: number }[]; payments: { methodCode: string; amount: number }[]; totals: { total: number }; order: { id: string } };
    expect(doc).toMatchObject({ status: 'draft', warehouseCode: 'CN01-KHG', order: { id: o1.id } });
    expect(doc.lines).toEqual([expect.objectContaining({ sku: SKU, qty: 5, unitPrice: 330_000 }), expect.objectContaining({ lineKey: 'SHIP', sku: FEE, qty: 1, unitPrice: 30_000 })]);
    expect(doc.payments).toEqual([expect.objectContaining({ methodCode: 'COD-GHN', amount: 1_000_000 })]);
    expect(doc.totals.total).toBe(1_680_000);
    expect(await saleEvents()).toBe(0);
    const ap = await req(ctx, 'POST', `${M}/docs/${sh.saleDocId}/approve`, {});
    expect(ap.statusCode, ap.body).toBe(200);
    saleNo = sh.saleDocNo!;
    const rows = await byAccount(`phieu-ban:${sh.saleDocId}`);
    const sum = (pre: string, side: 'd' | 'c') => rows.filter((x) => x.account.startsWith(pre)).reduce((t, x) => t + x[side] - x[side === 'd' ? 'c' : 'd'], 0);
    expect(sum('511', 'c')).toBe(1_680_000);
    expect(sum('13881', 'd')).toBe(1_000_000);
    expect(sum('131', 'd')).toBe(680_000);
    const ghn = (await sql<{ code: string }>`
      SELECT p.code FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id JOIN partners p ON p.id = l.partner_id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${`phieu-ban:${sh.saleDocId}`} AND l.account_code LIKE '13881%' AND l.debit > 0`.execute(db)).rows;
    expect(ghn.map((x) => x.code)).toEqual(['GHN']);
    expect(await stockAt('CN01-KHG')).toBe(0);
    expect(await stockAt('CN01-KCB')).toBe(5);
  });

  it('§3 dòng 4: chuyến 2 "Hoàn" → chuyển kho KHG → KCB; đơn vẫn mở phần chưa giao; còn chuyến chưa xong thì không đóng đơn', async () => {
    const c = await req(ctx, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 3 }] });
    expect(c.statusCode, c.body).toBe(200);
    const s2 = c.json().data.shipments[1] as Shipment;
    expect(s2).toMatchObject({ seq: 2, status: 'waiting', fee: 0, cod: 0 });
    const close = await req(ctx, 'POST', `${M}/orders/${o1.id}/close`, { note: 'thử' });
    expect(close.statusCode, close.body).toBe(409);
    expect(close.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_ORDER_STATE', cause: 'shipping' });
    expect((await ship(ctx, o1, s2, 'shipping')).statusCode).toBe(200);
    expect(await stockAt('CN01-KCB')).toBe(2);
    expect(await stockAt('CN01-KHG')).toBe(3);
    const r = await ship(ctx, o1, s2, 'returned', { note: 'Khách không nhận' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().meta.holdDocs).toEqual([expect.objectContaining({ status: 'posted', docNo: expect.stringMatching(/-H\d+$/) })]);
    const o = r.json().data as Order;
    expect(o.status).toBe('open');
    expect(o.lines[0]).toMatchObject({ qty: 10, delivered: 5, shipping: 0, held: 5 });
    expect(o.shipments![1]).toMatchObject({ status: 'returned', saleDocId: null });
    expect(await stockAt('CN01-KHG')).toBe(0);
    expect(await stockAt('CN01-KCB')).toBe(5);
    // Đã hoàn là bước cuối; chuyến Chờ lấy huỷ được (Hoàn) mà không sinh chứng từ.
    const again = await ship(ctx, o1, s2, 'delivered');
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_SHIPMENT_STATE', status: 'returned' });
    const c3 = (await req(ctx, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 1 }] })).json().data.shipments[2] as Shipment;
    const back = await ship(ctx, o1, c3, 'returned');
    expect(back.statusCode, back.body).toBe(200);
    expect(back.json().meta.holdDocs).toBeUndefined();
    expect(back.json().data.lines[0]).toMatchObject({ delivered: 5, shipping: 0, held: 5 });
    const h = (await req(ctx, 'GET', `${M}/orders/${o1.id}/history`)).json().data.events as { action: string; actorName: string }[];
    expect(h.filter((e) => e.action === 'ship_status').length).toBe(5);
  });

  it('§3 dòng 8: người không có quyền cập nhật giao → 403', async () => {
    const o = await getOrder(o1.id);
    const s = (await req(ctx, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 1 }] })).json().data.shipments[3] as Shipment;
    expect((await ship(viewer, o, s, 'shipping')).statusCode).toBe(403);
    expect((await req(viewer, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 1 }] })).statusCode).toBe(403);
    expect((await getOrder(o1.id)).shipments![3]).toMatchObject({ status: 'waiting' });
    expect((await ship(ctx, o, s, 'returned')).statusCode).toBe(200);
  });

  it('phiếu bán nháp của chuyến: không đổi số lượng hàng; xoá phiếu → chuyến về Đang giao (hàng vẫn ở KHG), rồi Hoàn được', async () => {
    const o = await getOrder(o1.id);
    const s = (await req(ctx, 'POST', `${M}/orders/${o1.id}/shipments`, { lines: [{ lineKey: 'L1', qty: 1 }] })).json().data.shipments[4] as Shipment;
    expect((await ship(ctx, o, s, 'shipping')).statusCode).toBe(200);
    const d = (await ship(ctx, o, s, 'delivered')).json().data.shipments[4] as Shipment;
    expect(d).toMatchObject({ status: 'delivered' });
    const edit = await req(ctx, 'PUT', `${M}/docs/${d.saleDocId}`, { docType: 'sale', docDate: TODAY, branchCode: 'CN01', warehouseCode: 'CN01-KHG', partner: { code: 'KH001' },
      payments: [], lines: [{ lineKey: 'L1', sku: SKU, qty: 2, unitPrice: 330_000 }] });
    expect(edit.statusCode, edit.body).toBe(409);
    expect(edit.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_SHIPMENT_STATE' });
    expect((await req(ctx, 'DELETE', `${M}/docs/${d.saleDocId}`)).statusCode).toBe(200);
    const g = await getOrder(o1.id);
    expect(g.shipments![4]).toMatchObject({ status: 'shipping', saleDocId: null });
    expect(g.lines[0]).toMatchObject({ delivered: 5, shipping: 1, held: 4 });
    expect(await stockAt('CN01-KHG')).toBe(1);
    expect((await ship(ctx, o, s, 'returned')).statusCode).toBe(200);
    expect((await getOrder(o1.id)).lines[0]).toMatchObject({ delivered: 5, shipping: 0, held: 5 });
    expect(await stockAt('CN01-KHG')).toBe(0);
    expect(await stockAt('CN01-KCB')).toBe(5);
  });

  it('§3 dòng 6: copy đơn đặt hàng cũ khi giá đã đổi → đơn mới nháp, giá + khuyến mại tính theo hôm nay, ghi "copy từ …"', async () => {
    await khaiGia(tenantId, [[SKU, 'Hộp', 350_000]]);
    const pol = await call(ctx, 'POST', '/api/v1/policies', { key: 'KM-032', ruleContract: 'sale.promo.tiered@1',
      params: { priority: 0, exclusive: false, legalCapPct: 50, skus: [SKU], basis: 'qty', tiers: [{ min: 3, pct: 10 }] }, effectiveFrom: TODAY, reason: 'NT-BH-032 §3 dòng 6' });
    expect(pol.status, JSON.stringify(pol.body)).toBe(201);
    const r = await req(ctx, 'POST', `${M}/orders/copy`, { from: 'order', id: o1.id });
    expect(r.statusCode, r.body).toBe(200);
    const o = r.json().data as Order;
    expect(o.id).not.toBe(o1.id);
    expect(o).toMatchObject({ status: 'draft', copiedFrom: `order:${o1.orderNo}`, partner: { code: 'KH001' } });
    expect(o.note).toContain(`Copy từ ${o1.orderNo}`);
    expect(o.lines).toEqual([expect.objectContaining({ sku: SKU, qty: 10, unitPrice: 350_000, discount: 350_000, delivered: 0, held: 0, policyRef: expect.objectContaining({ key: 'KM-032' }) })]);
    expect(o.policyRefs?.map((p) => p.key)).toEqual(['KM-032']);
    expect(o.shipping).toMatchObject({ receiver: 'Chị Lan', address: '12 Lê Lợi, Q1', carrier: 'GHN', fee: 30_000, cod: 1_000_000 });
    expect(o.shipping?.trackingNo).toBeUndefined();
    const h = (await req(ctx, 'GET', `${M}/orders/${o.id}/history`)).json().data.events as { action: string; note: string }[];
    expect(h[0]).toMatchObject({ action: 'copy', note: `Copy từ ${o1.orderNo}` });
    // Hoá đơn BH10 đã duyệt (phiếu của chuyến 1) → đơn mới: bỏ dòng phí ship, khuyến mại tính lại (5 hộp ≥ 3 → giảm 10%).
    const s = await req(ctx, 'POST', `${M}/orders/copy`, { from: 'sale', no: saleNo, branchCode: 'CN01' });
    expect(s.statusCode, s.body).toBe(200);
    expect(s.json().data).toMatchObject({ status: 'draft', copiedFrom: `sale:${saleNo}`, partner: { code: 'KH001' } });
    expect(s.json().data.lines).toEqual([expect.objectContaining({ sku: SKU, qty: 5, unitPrice: 350_000, discount: 175_000 })]);
  });

  it(`§3 dòng 7: copy từ hoá đơn máy bán → đơn đặt hàng mới cùng khách, cùng hàng, giá tính lại`, async () => {
    const r = await req(kt, 'POST', `${M}/orders/copy`, { from: 'pos', no: posCode, branchCode: 'CN01' });
    expect(r.statusCode, r.body).toBe(200);
    const o = r.json().data as Order;
    // Cùng khách của hoá đơn: mã khách máy bán ghi trên đơn (khách theo SĐT — Core tự thêm đối tượng theo chứng từ sale).
    const cust = (await sql<{ c: string }>`SELECT customer_code AS c FROM mod_pos.orders WHERE tenant_id = ${tenantId} AND code = ${posCode}`.execute(db)).rows[0]!.c;
    expect(cust).toBeTruthy();
    expect(o).toMatchObject({ status: 'draft', copiedFrom: `pos:${posCode}`, partner: { code: cust } });
    expect(o.note).toContain(`Copy từ ${posCode}`);
    expect(o.lines).toEqual([expect.objectContaining({ sku: SKU, qty: 2, unitPrice: 350_000, discount: 0 })]);
    const bad = await req(ctx, 'POST', `${M}/orders/copy`, { from: 'pos', no: 'KHONG-CO', branchCode: 'CN01' });
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_COPY_SOURCE' });
  });
});
