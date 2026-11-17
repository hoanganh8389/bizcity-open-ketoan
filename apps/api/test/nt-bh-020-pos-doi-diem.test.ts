// [2026-11-15 08:10 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: đổi điểm lấy voucher / quà, dùng voucher ở đơn sau (đóng góp)
/**
 * NT-BH-020 bước 2 — đổi điểm, dùng voucher: máy bán gửi đơn vào module pos (pos hỏi module loyalty qua action đọc), sự kiện đơn giao
 * cho loyalty (trừ điểm, phát / đánh dấu voucher, tích). Số theo phiếu docs/nghiem-thu/ban-hang/NT-BH-020-pos-tich-diem.md §4 bước 2.
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
import { setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const LOY = fileURLToPath(new URL('../../../modules/loyalty/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(LOY, 'bizcity.module.json'));
const POS_READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.stock_on_hand'];
const SKU = '100021001';
const QUA = '100045001Z';
const PHONE = '0901234567';

const policy = (id: number, code: string, type: number, rules: Record<string, unknown>) =>
  ({ id, code, title: code, type, priority: id, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules });
const PROGRAM = {
  version: 'lp-test-2',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: true, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [
    { key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 },
    { key: 'silver', name: 'Bạc', minPoints: 1000, multiplier: 1.2 },
    { key: 'gold', name: 'Vàng', minPoints: 5000, multiplier: 1.5 },
  ],
  policies: [
    policy(1, 'TICH10K', 1, { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 }),
    policy(2, 'THUONG1TR', 4, { point_expiry_days: 365, rules: [{ min_amount: 1000000, bonus_points: 20 }] }),
    policy(3, 'DOIVC', 6, { rules: { rewards: [{ reward_code: 'VC50K', name: 'Voucher 50.000đ', points_required: 100, voucher_prefix: 'TGS50-', discount_type: 'fixed', discount_value: 50000, expires_in_days: 30 }] } }),
    policy(4, 'DOIQUA', 5, { rules: { rewards: [{ reward_code: 'QUA1', name: "Me n' Mil 200ml", sku: QUA, quantity: 1, points_required: 50 }] } }),
  ],
};

let n = 0;
const id = () => `0193a1b2-0000-7000-8000-0000000202${String(++n).padStart(2, '0')}`;
const order = (oid: string, over: Record<string, unknown> = {}) => ({
  id: oid, branchCode: 'CN01', businessDate: '2026-11-15', shiftId: 'ngay-2026-11-15', exportReasonCode: 'XBA', customer: { partnerId: PHONE },
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 325_000 }, clientTotal: 325_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-020 bước 2 — đổi điểm lấy voucher / quà, dùng voucher', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let voucher = '';
  let usedOn = '';
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method !== 'GET' ? { 'idempotency-key': `nt-bh-020b-${++k}-${Date.now()}` } : {}) },
  });
  const deliver = () => dispatchOnce({ tenantId, consumers: ['loyalty.order-earn', 'loyalty.return-reverse'] });
  const sell = async (body: unknown) => { const r = await call('POST', '/api/v1/m/pos/orders', body); await deliver(); return r; };
  const points = async () => (await call('GET', `/api/v1/m/loyalty/customers/${PHONE}?branch=CN01`)).json().data;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: POS_READS });
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-020b', trx as never); });
    app = await buildApp();
    const put = await call('PUT', '/api/v1/products', { products: [
      { sku: SKU, name: 'Sữa bột Biomil Plus 1 400g', unit: 'Lon', taxOutCode: 'R08' },
      { sku: QUA, name: "Me n' Mil UHT 200ml (quà)", unit: 'Hộp', taxOutCode: 'R08' },
    ] });
    expect(put.statusCode, put.body).toBeLessThan(300);
    for (const s of [SKU, QUA]) expect((await call('PUT', `/api/v1/products/${s}`, { taxOutCode: 'R08' })).statusCode).toBe(200);
    expect((await call('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: PROGRAM })).statusCode).toBe(200);
    // [2026-11-16 07:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: máy bán chặn bán quá tồn → nhập tồn trước khi bán (đóng góp)
    await nhapTon(ctx, 'CN01', [[SKU, 1000, 'Lon'], [QUA, 1000, 'Hộp']]);
    // [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022: máy bán chỉ bán đúng bảng giá → khai giá bằng đúng giá máy gửi (đóng góp)
    await khaiGia(tenantId, [[SKU, 'Lon', 325_000]]);
    // Như bước 1: 325.000 (+32), 1.300.000 (+150), trả 650.000 (−75) → 107.
    expect((await sell(order(id(), { customer: { phone: PHONE, name: 'Chị Lan' } }))).statusCode).toBe(201);
    const o2 = id();
    expect((await sell(order(o2, { lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 4, clientUnitPrice: 325_000 }], payment: { mode: 'cash', cashGiven: 1_300_000 }, clientTotal: 1_300_000 }))).statusCode).toBe(201);
    expect((await call('POST', '/api/v1/m/pos/returns', { id: id(), orderId: o2, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 2 }], refundMethod: 'TM', reason: 'Khách đổi ý' })).statusCode).toBe(201);
    await deliver();
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('khởi đầu: 107 điểm (lô 1 còn 32, lô 2 còn 75)', async () => {
    const p = await points();
    expect(p.balance).toBe(107);
    expect(p.lots.map((l: { remaining: number }) => l.remaining)).toEqual([32, 75]);
  });

  it('đổi DOIVC ở đơn 325.000: bill in voucher TGS50-…, 39 điểm sau đơn; sổ trừ lô 1 hết 32, lô 2 trừ 68; voucher còn hiệu lực 30 ngày', async () => {
    const r = await sell(order(id(), { loyalty: { redeem: ['lp_3_vc50k'] } }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.total).toBe(325_000);
    expect(o.loyalty).toMatchObject({ earned: 32, redeemed: 100, balanceAfter: 39, tierKey: 'member' });
    voucher = o.loyalty.vouchers[0].code;
    expect(voucher).toMatch(/^TGS50-[0-9A-F]{8}$/);
    const p = await points();
    expect(p.balance).toBe(39);
    expect(p.lots.map((l: { points: number; remaining: number }) => [l.points, l.remaining])).toEqual([[32, 0], [150, 7], [32, 32]]);
    expect(p.vouchers).toEqual([expect.objectContaining({ code: voucher, status: 'active', discountValue: 50_000 })]);
    const v = (await call('GET', `/api/v1/m/loyalty/vouchers/${voucher}`)).json().data;
    expect(Date.parse(v.expiresAt) - Date.now()).toBeGreaterThan(29 * 86_400_000);
  });

  it('dùng voucher ở đơn sau: khách trả 275.000; chứng từ bán ghi chiết khấu 46.296 + thuế giảm 3.704; tích +27 → 66; voucher đã dùng', async () => {
    const oid = id();
    const r = await sell(order(oid, { promotionSelections: [{ kind: 'coupon', code: voucher.toLowerCase() }], payment: { mode: 'cash', cashGiven: 275_000 }, clientTotal: 275_000 }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    usedOn = o.code;
    expect(o).toMatchObject({ total: 275_000, subtotal: 254_630, taxTotal: 20_370, usedVouchers: [voucher] });
    expect(o.lines[0]).toMatchObject({ voucherDiscount: 50_000 });
    const doc = (await sql<{ p: { lines: { amountBeforeTax: number; discount: number; taxAmount: number }[] } }>`
      SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`pos:CN01:sale:${oid}`}`.execute(db)).rows[0]!.p;
    expect(doc.lines[0]).toMatchObject({ amountBeforeTax: 254_630, discount: 46_296, taxAmount: 20_370 });
    expect((await points()).balance).toBe(66);
    expect((await call('GET', `/api/v1/m/loyalty/vouchers/${voucher}`)).json().data).toMatchObject({ status: 'used', usedOrderCode: usedOn });
  });

  it('dùng lại voucher đó → chặn, nêu đơn đã dùng; không lập đơn', async () => {
    const r = await call('POST', '/api/v1/m/pos/orders', order(id(), { promotionSelections: [{ kind: 'coupon', code: voucher }], payment: { mode: 'cash', cashGiven: 275_000 }, clientTotal: 275_000 }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.message).toBe(`Voucher ${voucher} đã dùng ở đơn ${usedOn}`);
  });

  it('đổi DOIQUA: dòng quà 100045001Z 0đ (dòng quà, bill Z); −50 +32 → 48; quà sai số lượng bị chặn', async () => {
    const gift = { lineId: 'g1', sku: QUA, unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true, giftKey: 'lp:lp_4_qua1' };
    const bad = await call('POST', '/api/v1/m/pos/orders', order(id(), { lines: [order('x').lines[0], { ...gift, unitQty: 2 }], loyalty: { redeem: ['lp_4_qua1'] } }));
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details.reason).toBe('POS_GIFT_WITHOUT_POLICY');
    const oid = id();
    const r = await sell(order(oid, { lines: [order('x').lines[0], gift], loyalty: { redeem: ['lp_4_qua1'] } }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.zBill.lines).toEqual([expect.objectContaining({ sku: QUA, amount: 0 })]);
    expect(o.loyalty).toMatchObject({ earned: 32, redeemed: 50, balanceAfter: 48 });
    const doc = (await sql<{ p: { lines: { sku: string; isGift?: boolean }[] } }>`
      SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`pos:CN01:sale:${oid}`}`.execute(db)).rows[0]!.p;
    expect(doc.lines.find((l) => l.sku === QUA)).toMatchObject({ isGift: true });
    expect((await points()).balance).toBe(48);
  });

  it('không đủ điểm (đổi 2 voucher = 200) / khách lẻ đổi điểm → chặn, nêu lý do', async () => {
    const r = await call('POST', '/api/v1/m/pos/orders', order(id(), { loyalty: { redeem: ['lp_3_vc50k', 'lp_3_vc50k'] } }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.message).toBe('Không đủ điểm: cần 200, khách có 48 điểm dùng được');
    const retail = await call('POST', '/api/v1/m/pos/orders', order(id(), { customer: { retail: true }, loyalty: { redeem: ['lp_3_vc50k'] } }));
    expect(retail.statusCode, retail.body).toBe(400);
  });
});
