// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-024 trả lại hàng bán đợt 2 (đóng góp)
/**
 * NT-BH-024 — trả lại hàng bán đợt 2 (chốt 18/11/2026): máy bán không trả / đổi đơn có người mua hoá đơn kèm MST (Q1), không trả
 * quà đổi bằng điểm (Q2), hàng lỗi / hết hạn vào kho KTL của cửa hàng chọn ở BH17 (Q3). Gọi HTTP như máy bán vào module pos;
 * kiểm tồn vào đúng kho qua bizcity_read.stock_on_hand.warehouse_code. Số theo docs/nghiem-thu/ban-hang/NT-BH-024-tra-hang-dot-2.md.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { dispatchOnce } from '@bizcity/platform/core/events';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const LOY = fileURLToPath(new URL('../../../modules/loyalty/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(LOY, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const M = '/api/v1/m/pos';
const BAD_KEY = 'bizcity.pos.return_bad_warehouses';
const DAYS_KEY = 'bizcity.pos.return_days';
const vnDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const YESTERDAY = vnDate(-1);
const PHONE = '0907000024';
const QUA = 'QUA024';
/** MST giả (đúng khuôn 10 số) — repo công khai, không dùng MST thật. */
const MST = '0100000024';

const policy = (id: number, code: string, type: number, rules: Record<string, unknown>) =>
  ({ id, code, title: code, type, priority: id, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules });
const PROGRAM = {
  version: 'lp-test-024',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }],
  policies: [
    policy(1, 'TICH10K', 1, { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 }),
    policy(4, 'DOIQUA', 5, { rules: { rewards: [{ reward_code: 'QUA1', name: 'Quà đổi điểm', sku: QUA, quantity: 1, points_required: 50 }] } }),
  ],
};

let n = 0;
const uuid = (p = '0') => `0193a1b2-0000-7000-8000-${p}${String(24_000 + ++n).padStart(11, '0')}`;
// Đơn mẫu (như NT-BH-005): SUA400 2 × 324.000 (R08) + TA01 215.000 (R10) = 863.000, tiền mặt.
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, branchCode: 'CN01', businessDate: YESTERDAY, shiftId: `ngay-${YESTERDAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [
    { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 324_000 },
    { lineId: 'l2', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 },
  ],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 900_000 }, clientTotal: 863_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-024 — trả lại hàng bán đợt 2', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-024-${++k}-${Date.now()}` }) },
  });
  const post = (url: string, payload: unknown) => req('POST', `${M}${url}`, payload);
  const get = (url: string) => req('GET', `${M}${url}`);
  const setting = async (key: string, value: unknown) => {
    const r = await req('PUT', `/api/v1/settings/values/${key}`, { key, value });
    expect(r.statusCode, r.body).toBeLessThan(300);
  };
  const deliver = () => dispatchOnce({ tenantId, consumers: ['loyalty.order-earn', 'loyalty.return-reverse'] });
  const stockAt = async (sku: string, wh: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = 'CN01' AND sku = ${sku} AND warehouse_code = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const docCount = async () => Number((await sql<{ n: string }>`
    SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key LIKE 'pos:%:sale_return:%'`.execute(db)).rows[0]!.n);
  const payload = async (docKey: string) => (await sql<{ p: { lines: { lineKey: string; sku: string; warehouseCode?: string }[] } }>`
    SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]?.p;
  const sell = async (body: Record<string, unknown>) => {
    const r = await post('/orders', body);
    expect(r.statusCode, r.body).toBe(201);
    await deliver();
    return r;
  };
  const ret = (orderId: string, lines: unknown[], over: Record<string, unknown> = {}) =>
    post('/returns', { id: uuid('r'), orderId, branchCode: 'CN01', lines, refundMethod: 'TM', reason: 'Khách trả hàng', ...over });

  const A = uuid();
  const B = uuid();

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-024', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [
      { sku: 'SUA400', name: 'Sữa bột 400g', unit: 'Hộp' }, { sku: 'TA01', name: 'Tã quần L', unit: 'Gói' }, { sku: QUA, name: 'Quà đổi điểm', unit: 'Hộp' },
    ] })).status).toBeLessThan(300);
    for (const [sku, tax] of [['SUA400', 'R08'], ['TA01', 'R10'], [QUA, 'R08']] as const) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: tax })).status).toBe(200);
    // Cửa hàng CN01: kho bán mặc định CN01-K1 + kho hàng trả lại CN01-KTL (loại KTL, DM18).
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-K1', branchCode: 'CN01', name: 'Kho bán CN01', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-KTL', branchCode: 'CN01', name: 'Kho hàng trả lại CN01', typeCode: 'KTL' })).status).toBe(201);
    await nhapTon(ctx, 'CN01', [['SUA400', 1000, 'Hộp'], ['TA01', 1000, 'Gói'], [QUA, 100, 'Hộp']]);
    await khaiGia(tenantId, [['SUA400', 'Hộp', 324_000], ['TA01', 'Gói', 215_000]]);
    expect((await req('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: PROGRAM })).statusCode).toBe(200);
    await sell(order(A));
    await sell(order(B));
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('khởi đầu: tồn ở kho bán mặc định, kho KTL trống', async () => {
    expect(await stockAt('SUA400', 'CN01-K1')).toBe(996);
    expect(await stockAt('TA01', 'CN01-K1')).toBe(998);
    expect(await stockAt('TA01', 'CN01-KTL')).toBe(0);
  });

  it('cửa hàng chưa khai kho KTL: còn trả được báo badWarehouse null; chọn Lỗi → 400 POS_RETURN_NO_BAD_WAREHOUSE, không chứng từ', async () => {
    const r = await get(`/orders/${A}/returnable?branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ badWarehouse: null, taxInvoice: null, blockers: [] });
    const before = await docCount();
    const bad = await ret(A, [{ lineId: 'l2', qty: 1, condition: 'bad' }]);
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_RETURN_NO_BAD_WAREHOUSE', branchCode: 'CN01' });
    expect(bad.json().error.message).toContain('BH17');
    expect(await docCount()).toBe(before);
  });

  it('kho đã khai là kho bán mặc định → vẫn từ chối, câu báo nêu lý do', async () => {
    await setting(BAD_KEY, ['CN01=CN01-K1']);
    const bad = await ret(A, [{ lineId: 'l2', qty: 1, condition: 'bad' }]);
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details.reason).toBe('POS_RETURN_NO_BAD_WAREHOUSE');
    expect(bad.json().error.message).toContain('kho bán mặc định');
  });

  it('BH17 chọn kho KTL; lệch chuẩn 3: một phiếu 1 dòng nguyên vẹn + 1 dòng lỗi → mỗi dòng vào đúng kho', async () => {
    await setting(BAD_KEY, ['CN01=CN01-KTL']);
    const s = await get('/admin/settings');
    expect(s.json().data).toMatchObject({ values: { returnBadWarehouses: ['CN01=CN01-KTL'] }, keys: { returnBadWarehouses: BAD_KEY } });
    expect((await get(`/orders/${A}/returnable?branch=CN01`)).json().data.badWarehouse).toBe('CN01-KTL');
    const r = await ret(A, [{ lineId: 'l1', qty: 1 }, { lineId: 'l2', qty: 1, condition: 'bad' }]);
    expect(r.statusCode, r.body).toBe(201);
    const snap = r.json().data;
    expect(snap.refundTotal).toBe(324_000 + 215_000);
    expect(snap.lines.map((l: { lineId: string; condition: string; warehouseCode?: string }) => [l.lineId, l.condition, l.warehouseCode ?? null]))
      .toEqual([['l1', 'good', null], ['l2', 'bad', 'CN01-KTL']]);
    const p = await payload(`pos:CN01:sale_return:${snap.id}`);
    expect(p!.lines.map((l) => [l.lineKey, l.warehouseCode ?? null])).toEqual([['l1', null], ['l2', 'CN01-KTL']]);
    expect(await stockAt('SUA400', 'CN01-K1')).toBe(997);
    expect(await stockAt('TA01', 'CN01-K1')).toBe(998);
    expect(await stockAt('TA01', 'CN01-KTL')).toBe(1);
    // BH14: dòng phiếu trả mang tình trạng / kho nhận.
    const list = await get(`/admin/returns?q=${snap.code}`);
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data[0].lines).toEqual([
      expect.objectContaining({ lineId: 'l1', condition: 'good' }), expect.objectContaining({ lineId: 'l2', condition: 'bad', warehouseCode: 'CN01-KTL' }),
    ]);
  });

  it('cùng dòng gửi hai tình trạng → 400 POS_RETURN_CONDITION', async () => {
    const r = await ret(B, [{ lineId: 'l1', qty: 1, condition: 'good' }, { lineId: 'l1', qty: 1, condition: 'bad' }]);
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details.reason).toBe('POS_RETURN_CONDITION');
  });

  it('lệch chuẩn 4: đơn quá hạn có dòng lỗi → cần duyệt như cũ; có người duyệt thì hàng lỗi vào kho KTL', async () => {
    await setting(DAYS_KEY, 0);
    try {
      const late = await ret(B, [{ lineId: 'l1', qty: 1, condition: 'bad' }]);
      expect(late.statusCode, late.body).toBe(400);
      expect(late.json().error.details.reason).toBe('POS_RETURN_EXPIRED');
      const ok = await ret(B, [{ lineId: 'l1', qty: 1, condition: 'bad' }], { approval: { by: 'Quản lý CN01', note: 'Hàng lỗi nhà sản xuất' } });
      expect(ok.statusCode, ok.body).toBe(201);
      expect(ok.json().data).toMatchObject({ approval: { by: 'Quản lý CN01' }, lines: [{ lineId: 'l1', condition: 'bad', warehouseCode: 'CN01-KTL' }] });
      expect(await stockAt('SUA400', 'CN01-KTL')).toBe(1);
    } finally {
      await setting(DAYS_KEY, 3);
    }
  });

  it('Q1 + lệch chuẩn 1, 2: ghi người mua hoá đơn kèm MST sau khi bán → còn trả được báo TAX_INVOICE; trả và đổi đều 409 POS_RETURN_TAX_INVOICE', async () => {
    const C = uuid();
    await sell(order(C));
    expect((await ret(C, [{ lineId: 'l2', qty: 1 }], { id: uuid('d') })).statusCode).toBe(201); // trước khi có MST: trả bình thường
    const ib = await post(`/orders/${C}/invoice-buyer`, { companyName: 'Công ty TNHH Mẫu', taxCode: MST });
    expect(ib.statusCode, ib.body).toBe(200);
    const r = await get(`/orders/${C}/returnable?branch=CN01`);
    expect(r.json().data.taxInvoice).toEqual({ taxCode: MST });
    expect(r.json().data.blockers).toEqual([expect.objectContaining({ code: 'TAX_INVOICE' })]);
    const before = await docCount();
    const back = await ret(C, [{ lineId: 'l1', qty: 1 }]);
    expect(back.statusCode, back.body).toBe(409);
    expect(back.json().error.details).toMatchObject({ reason: 'POS_RETURN_TAX_INVOICE', taxCode: MST });
    expect(back.json().error.message).toContain(`MST ${MST}`);
    expect(back.json().error.message).toContain('BH11');
    const rid = uuid('x');
    const ex = await post('/exchanges', {
      id: rid,
      return: { id: rid, orderId: C, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'doi_tru', reason: 'Đổi hàng' },
      order: order(uuid('n'), { businessDate: vnDate(), shiftId: `ngay-${vnDate()}`, lines: [{ lineId: 'n1', sku: 'TA01', unitName: 'Gói', unitQty: 2, clientUnitPrice: 215_000 }],
        payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 324_000 }, { method: 'TM', amount: 106_000 }] }, clientTotal: 430_000 }),
    });
    expect(ex.statusCode, ex.body).toBe(409);
    expect(ex.json().error.details.reason).toBe('POS_RETURN_TAX_INVOICE');
    expect(await docCount()).toBe(before);
  });

  it('Q2: quà đổi điểm — còn trả được 0, đánh dấu LOYALTY_GIFT; trả quà → 400 POS_RETURN_LOYALTY_GIFT; trả hàng chính không bị đòi trả quà', async () => {
    // Tích điểm: 4 hộp 1.296.000 → 129 điểm; đơn sau đổi quà 50 điểm.
    await sell(order(uuid(), { customer: { phone: PHONE, name: 'Chị Mẫu' }, lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 4, clientUnitPrice: 324_000 }],
      payment: { mode: 'cash', cashGiven: 1_296_000 }, clientTotal: 1_296_000 }));
    const G = uuid();
    const gift = { lineId: 'g1', sku: QUA, unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true, giftKey: 'lp:lp_4_qua1' };
    await sell(order(G, { customer: { partnerId: PHONE }, lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000 }, gift],
      loyalty: { redeem: ['lp_4_qua1'] }, payment: { mode: 'cash', cashGiven: 324_000 }, clientTotal: 324_000 }));
    const r = await get(`/orders/${G}/returnable?branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.lines.find((l: { lineId: string }) => l.lineId === 'g1')).toMatchObject({ returnableQty: 0, loyaltyGift: true, notReturnable: 'LOYALTY_GIFT' });
    const bad = await ret(G, [{ lineId: 'g1', qty: 1 }]);
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_RETURN_LOYALTY_GIFT', lineId: 'g1', sku: QUA });
    const main = await ret(G, [{ lineId: 'l1', qty: 1 }]);
    expect(main.statusCode, main.body).toBe(201);
    expect(main.json().data.lines.map((l: { lineId: string }) => l.lineId)).toEqual(['l1']);
  });
});
