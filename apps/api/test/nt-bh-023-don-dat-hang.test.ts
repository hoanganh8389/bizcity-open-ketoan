/**
 * NT-BH-023 — đơn đặt hàng (chốt 17/11/2026): đơn nháp (báo giá có hạn) → gửi (hạn mức + nợ quá hạn → chờ duyệt) → giữ hàng bằng
 * chứng từ chuyển kho sang kho KCB → giao nhiều lần thành phiếu bán BH10 nháp → đóng / huỷ; lịch sử cũ → mới; đơn livestream lọc trùng;
 * máy bán kiểm tồn kho mặc định (Q11) nên không bán lấn hàng đang giữ.
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-023 (đóng góp)
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
const vnDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() + offset * 86_400_000));
const TODAY = vnDay();
const HOLD_KEY = 'bizcity.phieu_ban.hold_warehouses';
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(23_000_000 + ++seq).padStart(12, '0')}`;

type Order = { id: string; orderNo: string; status: string; total: number; warehouseCode: string; holdWarehouseCode: string | null; pendingReasons: string[];
  lines: { lineKey: string; sku: string; qty: number; unitPrice: number; delivered: number; held: number }[]; deliveries: { docId: string; docNo: string; returned?: boolean }[] };

describe.skipIf(!HAS)('NT-BH-023 — đơn đặt hàng', () => {
  let ctx: TestCtx;
  let kt: TestCtx;
  let ktt: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-023-${++k}-${Date.now()}` }) },
  });
  const M = '/api/v1/m/phieu-ban';
  const stockAt = async (wh: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = 'CN01' AND sku = ${SKU} AND warehouse_code = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const posStock = async () => {
    const r = await req(ctx, 'GET', `/api/v1/m/pos/stock?skus=${SKU}&branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    return (r.json().data as { available: number }[])[0]!.available;
  };
  const newOrder = async (who: TestCtx, over: Record<string, unknown> = {}) => {
    const r = await req(who, 'POST', `${M}/orders`, {
      orderDate: TODAY, branchCode: 'CN01', validUntil: vnDay(3), partner: { code: 'KH001' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 10, unitPrice: 330_000 }], ...over,
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { created: boolean; merged?: boolean; order?: Order; duplicates?: { orderNo: string }[] };
  };
  const send = (who: TestCtx, id: string) => req(who, 'POST', `${M}/orders/${id}/send`, {});
  const userCtx = async (email: string, role: string): Promise<TestCtx> => {
    expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
    return { ...ctx, token: res.json().data.token };
  };
  const posOrder = (qty: number) => ({
    id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
    lines: [{ lineId: 'l1', productId: SKU, sku: SKU, unitName: 'Hộp', unitQty: qty, clientUnitPrice: 330_000 }], promotionSelections: [],
    payment: { mode: 'cash', cashGiven: qty * 330_000 }, clientTotal: qty * 330_000, coreVersion: '0.1.0', promotionsVersion: '',
  });

  let o1: Order;
  let o2: Order;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-023', trx as never); });
    app = await buildApp();
    kt = await userCtx('kt023@ketoan.local', 'accountant');
    ktt = await userCtx('ktt023@ketoan.local', 'chief_accountant');
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 330', unit: 'Hộp' }, { sku: 'HANG2', name: 'Hàng ghi nợ', unit: 'Cái' }] })).status).toBeLessThan(300);
    for (const s of [SKU, 'HANG2']) expect((await call(ctx, 'PUT', `/api/v1/products/${s}`, { taxOutCode: 'KCT' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An', creditLimit: 10_000_000, paymentTermDays: 30 })).status).toBeLessThan(300);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH002', name: 'Đại lý Bình', paymentTermDays: 30 })).status).toBeLessThan(300);
    // Cửa hàng CN01: kho bán mặc định CN01-K1 (KHH) + kho hàng chờ bán CN01-KCB (loại KCB, DM18).
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-K1', branchCode: 'CN01', name: 'Kho bán CN01', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-KCB', branchCode: 'CN01', name: 'Kho chờ bán CN01', typeCode: 'KCB' })).status).toBe(201);
    await nhapTon(ctx, 'CN01', [[SKU, 100, 'Hộp'], ['HANG2', 100, 'Cái']]);
    // NT-BH-022: máy bán chỉ bán mã có giá ở bảng giá cửa hàng (lệch chuẩn 6 bán qua máy bán).
    await khaiGia(tenantId, [[SKU, 'Hộp', 330_000]]);
    // §2: KH001 đang nợ 6.000.000 (bán hôm nay, chưa thu — không quá hạn); KH002 nợ 1.000.000 từ 60 ngày trước (quá hạn 30 ngày).
    const debt = (key: string, partner: string, amount: number, docDate: string) => call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate, partner: { code: partner },
      lines: [{ lineKey: 'l1', sku: 'HANG2', name: 'Hàng ghi nợ', unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'KCT', taxAmount: 0 }],
      totals: { beforeTax: amount, tax: 0, total: amount },
    });
    expect((await debt('NO-KH001', 'KH001', 6_000_000, TODAY)).body?.data?.status).toBe('posted');
    expect((await debt('NO-KH002', 'KH002', 1_000_000, vnDay(-60))).body?.data?.status).toBe('posted');
    expect(await stockAt('CN01-K1')).toBe(100);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1: đơn nháp 10 hộp, hạn 3 ngày → số DH<yymm><6 số> theo cửa hàng, Nháp, chưa giữ hàng; kho bán = kho mặc định', async () => {
    const r = await newOrder(ctx);
    expect(r.created).toBe(true);
    o1 = r.order!;
    expect(o1.orderNo).toMatch(new RegExp(`^DH${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}\\d{6}$`));
    expect(o1).toMatchObject({ status: 'draft', total: 3_300_000, warehouseCode: 'CN01-K1', holdWarehouseCode: null });
    expect(o1.lines[0]).toMatchObject({ qty: 10, delivered: 0, held: 0 });
    expect(await stockAt('CN01-K1')).toBe(100);
  });

  it('cửa hàng chưa khai kho KCB → gửi báo PHIEU_BAN_NO_HOLD_WAREHOUSE, đơn vẫn Nháp', async () => {
    const r = await send(ctx, o1.id);
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_NO_HOLD_WAREHOUSE', branchCode: 'CN01' });
    const put = await req(ctx, 'PUT', `/api/v1/settings/values/${HOLD_KEY}`, { key: HOLD_KEY, value: ['CN01=CN01-KCB'] });
    expect(put.statusCode, put.body).toBeLessThan(300);
    const s = await req(ctx, 'GET', `${M}/order-settings`);
    expect(s.json().data.holdWarehouses).toEqual({ CN01: 'CN01-KCB' });
  });

  it('§3 dòng 2: gửi (nợ 6.000.000 + 3.300.000 ≤ 10.000.000) → Đã gửi; chuyển kho 10 hộp CN01-K1 → KCB; máy bán CN01 thấy tồn 90', async () => {
    const r = await send(ctx, o1.id);
    expect(r.statusCode, r.body).toBe(200);
    o1 = r.json().data;
    expect(o1).toMatchObject({ status: 'open', holdWarehouseCode: 'CN01-KCB', pendingReasons: [] });
    expect(o1.lines[0]).toMatchObject({ held: 10, delivered: 0 });
    expect(r.json().meta.holdDocs).toEqual([expect.objectContaining({ docKey: `phieu-ban:dh:${o1.id}:1`, status: 'posted' })]);
    const ev = (await sql<{ doc_type: string; status: string }>`SELECT doc_type, status FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`phieu-ban:dh:${o1.id}:1`}`.execute(db)).rows;
    expect(ev).toEqual([{ doc_type: 'transfer', status: 'posted' }]);
    expect(await stockAt('CN01-K1')).toBe(90);
    expect(await stockAt('CN01-KCB')).toBe(10);
    expect(await posStock()).toBe(90);
  });

  it('§3 dòng 3: đơn thứ hai 20 hộp (vượt hạn mức) → Chờ duyệt kèm lý do; kế toán viên không duyệt được; KTT duyệt → Đã gửi, giữ hàng', async () => {
    o2 = (await newOrder(kt, { lines: [{ lineKey: 'L1', sku: SKU, qty: 20, unitPrice: 330_000 }] })).order!;
    const r = await send(kt, o2.id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ status: 'pending', pendingReasons: ['Vượt hạn mức 10.000.000: nợ 6.000.000 + đơn mở 3.300.000 + đơn này 6.600.000'] });
    expect(await stockAt('CN01-K1')).toBe(90);
    expect((await req(kt, 'POST', `${M}/orders/${o2.id}/approve`, { note: 'tự duyệt' })).statusCode).toBe(403);
    const ok = await req(ktt, 'POST', `${M}/orders/${o2.id}/approve`, { note: 'Khách quen, cho nợ thêm' });
    expect(ok.statusCode, ok.body).toBe(200);
    o2 = ok.json().data;
    expect(o2).toMatchObject({ status: 'open', holdWarehouseCode: 'CN01-KCB' });
    expect(o2.lines[0]!.held).toBe(20);
    expect(await stockAt('CN01-K1')).toBe(70);
    expect(await posStock()).toBe(70);
    const h = (await req(ctx, 'GET', `${M}/orders/${o2.id}/history`)).json().data.events as { action: string; note: string | null }[];
    expect(h.map((e) => e.action)).toEqual(['create', 'send', 'approve', 'hold']);
    expect(h[2]!.note).toBe('Khách quen, cho nợ thêm');
  });

  it('lệch chuẩn 6: máy bán bán quá phần không bị giữ (71 khi kho bán còn 70) → POS_STOCK_SHORT theo kho mặc định', async () => {
    const r = await req(ctx, 'POST', '/api/v1/m/pos/orders', posOrder(71));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details).toMatchObject({ reason: 'POS_STOCK_SHORT', items: [{ sku: SKU, need: 71, have: 70 }] });
  });

  it('§3 dòng 4–5: giao 6 → phiếu bán BH10 nháp 6 hộp từ kho KCB nối đơn, còn 4 / giữ 4; giao 5 → PHIEU_BAN_OVER_REMAINING', async () => {
    const r = await req(ctx, 'POST', `${M}/orders/${o1.id}/deliver`, { lines: [{ lineKey: 'L1', qty: 6 }] });
    expect(r.statusCode, r.body).toBe(200);
    const { order, doc } = r.json().data as { order: Order; doc: { id: string; status: string; docNo: string; warehouseCode: string; order: { id: string; no: string }; lines: { qty: number; unitPrice: number }[]; totals: { total: number } } };
    expect(doc).toMatchObject({ status: 'draft', warehouseCode: 'CN01-KCB', order: { id: o1.id, no: o1.orderNo } });
    expect(doc.docNo).toMatch(/^BH/);
    expect(doc.lines).toEqual([expect.objectContaining({ qty: 6, unitPrice: 330_000 })]);
    expect(doc.totals.total).toBe(1_980_000);
    expect(order).toMatchObject({ status: 'open' });
    expect(order.lines[0]).toMatchObject({ delivered: 6, held: 4 });
    const over = await req(ctx, 'POST', `${M}/orders/${o1.id}/deliver`, { lines: [{ lineKey: 'L1', qty: 5 }] });
    expect(over.statusCode, over.body).toBe(400);
    expect(over.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_OVER_REMAINING', items: [{ lineKey: 'L1', sku: SKU, qty: 5, remaining: 4 }] });
    // Kế toán duyệt phiếu bán → hàng ra khỏi kho KCB.
    const ap = await req(ctx, 'POST', `${M}/docs/${doc.id}/approve`, {});
    expect(ap.statusCode, ap.body).toBe(200);
    expect(await stockAt('CN01-KCB')).toBe(24);
  });

  it('§3 dòng 6: đóng đơn 1 → chuyển 4 hộp từ KCB về CN01-K1; Đã đóng', async () => {
    const r = await req(ctx, 'POST', `${M}/orders/${o1.id}/close`, { note: 'Khách không lấy nữa' });
    expect(r.statusCode, r.body).toBe(200);
    o1 = r.json().data;
    expect(o1).toMatchObject({ status: 'closed', closeReason: 'manual' });
    expect(o1.lines[0]).toMatchObject({ delivered: 6, held: 0 });
    expect(await stockAt('CN01-KCB')).toBe(20);
    expect(await stockAt('CN01-K1')).toBe(74);
    expect(await posStock()).toBe(74);
  });

  it('lệch chuẩn 3–4: huỷ đơn đã giao một phần → chặn; xoá phiếu bán nháp sinh từ đơn → trả lại số đã giao (hàng giữ lại); rồi huỷ được', async () => {
    const d = await req(ctx, 'POST', `${M}/orders/${o2.id}/deliver`, { lines: [{ lineKey: 'L1', qty: 5 }] });
    expect(d.statusCode, d.body).toBe(200);
    const docId = d.json().data.doc.id as string;
    const c = await req(ctx, 'POST', `${M}/orders/${o2.id}/cancel`, { note: 'thử' });
    expect(c.statusCode, c.body).toBe(409);
    expect(c.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_ORDER_STATE' });
    // Sửa phiếu nháp 5 → 3: đơn ghi lại số đã giao.
    const docBody = { docType: 'sale', docDate: TODAY, branchCode: 'CN01', warehouseCode: 'CN01-KCB', partner: { code: 'KH001' }, payments: [],
      lines: [{ lineKey: 'L1', sku: SKU, qty: 3, unitPrice: 330_000 }] };
    const up = await req(ctx, 'PUT', `${M}/docs/${docId}`, docBody);
    expect(up.statusCode, up.body).toBe(200);
    expect(up.json().data.order).toMatchObject({ id: o2.id });
    let g = (await req(ctx, 'GET', `${M}/orders/${o2.id}`)).json().data as Order;
    expect(g.lines[0]).toMatchObject({ delivered: 3, held: 17 });
    const tooMany = await req(ctx, 'PUT', `${M}/docs/${docId}`, { ...docBody, lines: [{ lineKey: 'L1', sku: SKU, qty: 21, unitPrice: 330_000 }] });
    expect(tooMany.json().error?.details).toMatchObject({ reason: 'PHIEU_BAN_OVER_REMAINING' });
    const del = await req(ctx, 'DELETE', `${M}/docs/${docId}`);
    expect(del.statusCode, del.body).toBe(200);
    g = (await req(ctx, 'GET', `${M}/orders/${o2.id}`)).json().data as Order;
    expect(g.lines[0]).toMatchObject({ delivered: 0, held: 20 });
    expect(g.deliveries[0]).toMatchObject({ docId, returned: true });
    expect(await stockAt('CN01-KCB')).toBe(20);
    const ok = await req(ctx, 'POST', `${M}/orders/${o2.id}/cancel`, { note: 'Khách huỷ' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data.status).toBe('cancelled');
    expect(await stockAt('CN01-KCB')).toBe(0);
    expect(await stockAt('CN01-K1')).toBe(94);
  });

  it('lệch chuẩn 5: hai người giao cùng lúc 3 + 3 (còn 4) → một lần được, lần kia PHIEU_BAN_OVER_REMAINING (khoá theo đơn)', async () => {
    const o = (await newOrder(ctx, { lines: [{ lineKey: 'L1', sku: SKU, qty: 4, unitPrice: 330_000 }] })).order!;
    expect((await send(ctx, o.id)).json().data.status).toBe('open');
    const [a, b] = await Promise.all([
      req(ctx, 'POST', `${M}/orders/${o.id}/deliver`, { lines: [{ lineKey: 'L1', qty: 3 }] }),
      req(kt, 'POST', `${M}/orders/${o.id}/deliver`, { lines: [{ lineKey: 'L1', qty: 3 }] }),
    ]);
    expect([a.statusCode, b.statusCode].sort(), `${a.body} ${b.body}`).toEqual([200, 400]);
    const bad = a.statusCode === 400 ? a : b;
    expect(bad.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_OVER_REMAINING', items: [{ qty: 3, remaining: 1 }] });
    const g = (await req(ctx, 'GET', `${M}/orders/${o.id}`)).json().data as Order;
    expect(g.lines[0]).toMatchObject({ delivered: 3, held: 1 });
    // Giao nốt 1 → giao đủ, đơn tự đóng.
    const last = await req(ctx, 'POST', `${M}/orders/${o.id}/deliver`, { lines: [{ lineKey: 'L1', qty: 1 }] });
    expect(last.json().data.order).toMatchObject({ status: 'closed', closeReason: 'delivered' });
  });

  it('§3 dòng 7: sửa giá dòng 330.000 → 320.000 ở đơn nháp → lưu; Lịch sử ghi người, lúc, 330.000 → 320.000', async () => {
    const o = (await newOrder(kt)).order!;
    const r = await req(kt, 'PUT', `${M}/orders/${o.id}`, {
      orderDate: TODAY, branchCode: 'CN01', validUntil: vnDay(3), partner: { code: 'KH001' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 10, unitPrice: 320_000 }],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ status: 'draft', total: 3_200_000 });
    const h = (await req(ctx, 'GET', `${M}/orders/${o.id}/history`)).json().data.events as { action: string; at: string; actorName: string; changes: { field: string; from: unknown; to: unknown }[] }[];
    const upd = h.find((e) => e.action === 'update')!;
    expect(upd.changes).toEqual([{ field: 'line L1 unitPrice', from: 330_000, to: 320_000 }]);
    expect(upd.actorName).toBeTruthy();
    expect(Date.parse(upd.at)).toBeGreaterThan(0);
  });

  it('lệch chuẩn 1: hết hạn hiệu lực đơn nháp → không gửi được (PHIEU_BAN_ORDER_EXPIRED); gia hạn rồi gửi được', async () => {
    const o = (await newOrder(ctx, { orderDate: vnDay(-5), validUntil: vnDay(-1), lines: [{ lineKey: 'L1', sku: SKU, qty: 1, unitPrice: 330_000 }] })).order!;
    const r = await send(ctx, o.id);
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_ORDER_EXPIRED' });
    expect((await req(ctx, 'PUT', `${M}/orders/${o.id}`, { orderDate: vnDay(-5), validUntil: vnDay(2), branchCode: 'CN01', partner: { code: 'KH001' },
      lines: [{ lineKey: 'L1', sku: SKU, qty: 1, unitPrice: 330_000 }] })).statusCode).toBe(200);
    expect((await send(ctx, o.id)).json().data.status).toBe('open');
  });

  it('lệch chuẩn 2: khách có nợ quá hạn → gửi thành Chờ duyệt dù chưa vượt hạn mức; người lập không tự duyệt; KTT từ chối → về Nháp', async () => {
    const o = (await newOrder(ctx, { partner: { code: 'KH002' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 1, unitPrice: 330_000 }] })).order!;
    const r = await send(ctx, o.id);
    expect(r.json().data).toMatchObject({ status: 'pending', pendingReasons: ['Khách có nợ quá hạn 1.000.000 (hạn thanh toán 30 ngày)'] });
    expect((await req(ctx, 'POST', `${M}/orders/${o.id}/approve`, {})).statusCode).toBe(403);
    const rej = await req(ktt, 'POST', `${M}/orders/${o.id}/reject`, { note: 'Thu nợ cũ trước' });
    expect(rej.statusCode, rej.body).toBe(200);
    expect(rej.json().data).toMatchObject({ status: 'draft', rejection: { note: 'Thu nợ cũ trước' } });
  });

  it('§3 dòng 8: đơn livestream cùng SĐT + cùng mã trong 24 giờ → báo trùng; chọn gộp vào đơn cũ hoặc giữ riêng; nạp nhiều đơn', async () => {
    const live = (phone: string, qty = 1) => ({ source: 'livestream', partner: undefined, customer: { name: 'Chị Lan', phone }, lines: [{ lineKey: 'L1', sku: SKU, qty, unitPrice: 330_000 }] });
    const a = await newOrder(ctx, live('0909 123 456'));
    expect(a.created).toBe(true);
    const dup = await newOrder(ctx, live('0909123456', 2));
    expect(dup).toMatchObject({ created: false, duplicates: [{ orderNo: a.order!.orderNo }] });
    const merged = await newOrder(ctx, { ...live('0909123456', 2), onDuplicate: 'merge' });
    expect(merged).toMatchObject({ created: false, merged: true });
    expect(merged.order!.id).toBe(a.order!.id);
    expect(merged.order!.lines).toEqual([expect.objectContaining({ sku: SKU, qty: 3 })]);
    const h = (await req(ctx, 'GET', `${M}/orders/${a.order!.id}/history`)).json().data.events as { action: string; changes: { field: string; from: unknown; to: unknown }[] }[];
    expect(h.find((e) => e.action === 'merge')!.changes).toEqual([{ field: 'line L1 qty', from: 1, to: 3 }]);
    const keep = await newOrder(ctx, { ...live('0909123456'), onDuplicate: 'keep' });
    expect(keep.created).toBe(true);
    const imp = await req(ctx, 'POST', `${M}/orders/import`, { orders: [
      { orderDate: TODAY, branchCode: 'CN01', customer: { name: 'Anh Minh', phone: '0911000111' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 1, unitPrice: 330_000 }] },
      { orderDate: TODAY, branchCode: 'CN01', customer: { name: 'Chị Lan', phone: '0909123456' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 1, unitPrice: 330_000 }] },
    ] });
    expect(imp.statusCode, imp.body).toBe(200);
    expect(imp.json().data).toMatchObject({ created: 1, merged: 0, duplicates: 1 });
    const list = await req(ctx, 'GET', `${M}/orders?source=livestream&search=0909123456`);
    expect(list.json().meta.total).toBe(2);
  });
});
