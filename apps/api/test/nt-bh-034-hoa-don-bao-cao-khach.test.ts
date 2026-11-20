// [2026-11-19 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-034 hoá đơn tại quầy + báo cáo khách hàng (đóng góp)
/**
 * NT-BH-034 — phần máy chủ (chốt 19/11/2026): người mua hoá đơn của đơn máy bán nhận CCCD 12 số, luật bắt buộc như POS cũ
 * (POS_INVOICE_BUYER); hồ sơ khách lúc bán mang MST / email / địa chỉ / tên công ty; báo cáo khách hàng gộp đơn máy bán + phiếu BH10,
 * voucher (module voucher), điểm (module loyalty), quà; 403 khi thiếu pos:report. Phần máy bán (tự mở màn, tra MST, in trước phát hành
 * ngầm…) kiểm ở test React của tgs_pos. Số theo docs/nghiem-thu/ban-hang/NT-BH-034-hoa-don-tai-quay-bao-cao-khach.md §3.
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

const MOD = (k: string) => fileURLToPath(new URL(`../../../modules/${k}/`, import.meta.url));
const HAS = ['pos', 'phieu-ban', 'voucher', 'loyalty'].every((k) => existsSync(path.join(MOD(k), 'bizcity.module.json')));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const M = '/api/v1/m/pos';
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const PHONE = '0909034034';
const SUA = 'SUA034';
const QUA = 'QUA034Z';
const PROGRAM = {
  version: 'lp-034',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }],
  policies: [{ id: 1, code: 'TICH10K', title: '1 điểm / 10.000đ', type: 1, priority: 1, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 } }],
};

let n = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(34_000 + ++n).padStart(12, '0')}`;
type Line = [sku: string, qty: number, price: number, unit?: string];
const order = (lines: Line[], over: Record<string, unknown> = {}, total?: number) => {
  const sum = total ?? lines.reduce((t, [, q, p]) => t + q * p, 0);
  return {
    id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { partnerId: PHONE },
    lines: lines.map(([sku, unitQty, clientUnitPrice, unitName], i) => ({ lineId: `l${i + 1}`, sku, unitName: unitName ?? 'Hộp', unitQty, clientUnitPrice })),
    promotionSelections: [], payment: { mode: 'cash', cashGiven: sum }, clientTotal: sum, coreVersion: '0.1.0', promotionsVersion: '', ...over,
  };
};

describe.skipIf(!HAS)('NT-BH-034 — hoá đơn tại quầy (máy chủ) + báo cáo khách hàng', () => {
  let ctx: TestCtx;
  let staff: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-034-${++k}-${Date.now()}` }) },
  });
  const sell = async (o: ReturnType<typeof order>) => {
    const r = await req(ctx, 'POST', `${M}/orders`, o);
    expect(r.statusCode, r.body).toBe(201);
    return r.json().data.order as { id: string; code: string; customer: Record<string, unknown>; total: number };
  };
  const deliver = () => dispatchOnce({ tenantId, consumers: ['voucher.pos-order', 'voucher.pos-return', 'voucher.phieu-ban-doc', 'loyalty.order-earn', 'loyalty.return-reverse'], limit: 200 });

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(MOD('pos'), 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(MOD('phieu-ban'), 'migrations'), { reads: READS });
    await runModuleMigrations('voucher', path.join(MOD('voucher'), 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.products', 'bizcity_read.payment_methods'] });
    await runModuleMigrations('loyalty', path.join(MOD('loyalty'), 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-034', trx as never); });
    app = await buildApp();
    const email = 'staff034@ketoan.local';
    expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: 'Nhân viên', role: 'staff', password: 'Pass@12345' })).status).toBe(201);
    staff = { ...ctx, token: (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } })).json().data.token };
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng CN02' })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SUA, name: 'Sữa 034', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', `/api/v1/products/${SUA}`, { taxOutCode: 'R08' })).status).toBe(200);
    // Quà mã không gửi thuế (Nội bộ, 0đ) — dòng quà bill Z; giá bán khai để tính giá trị quà.
    await sql`INSERT INTO products (tenant_id, sku, name, unit, tax_out_code, variant_code) VALUES (${tenantId}, ${QUA}, 'Bình sữa quà tặng', 'Cái', 'R08', 'internal')`.execute(db);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: PHONE, name: 'Chị Mai', phone: PHONE })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [[SUA, 500, 'Hộp'], [QUA, 100, 'Cái']]);
    await nhapTon(ctx, 'CN02', [[SUA, 500, 'Hộp']], '2026-10-01', 'NHAP-TON-CN02');
    await khaiGia(tenantId, [[SUA, 'Hộp', 300_000], [QUA, 'Cái', 15_000]]);
    expect((await req(ctx, 'POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 1, program: PROGRAM })).statusCode).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  let first = '';
  it('§2 A việc 8: hồ sơ khách lúc bán mang MST / email / địa chỉ / tên công ty → lưu trên đơn để điền sẵn màn hoá đơn', async () => {
    const o = await sell(order([[SUA, 1, 300_000]], { customer: { partnerId: PHONE, email: 'mai@example.test', address: '1 Phố Thử', companyName: 'Công ty Mai', taxCode: '0101234567' } }));
    first = o.id;
    expect(o.customer).toMatchObject({ id: PHONE, name: 'Chị Mai', email: 'mai@example.test', address: '1 Phố Thử', companyName: 'Công ty Mai', taxCode: '0101234567' });
    // Máy cũ không gửi → khách như cũ.
    expect(Object.keys((await sell(order([[SUA, 1, 300_000]]))).customer).sort()).toEqual(['id', 'name', 'phone']);
  });

  it('§3: CCCD 12 số + email → nhận; 12 số thiếu email → báo bắt buộc email', async () => {
    const ok = await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '001099012345', name: 'Nguyễn Thị Mai', address: '1 Phố Thử', email: 'mai@example.test', phone: PHONE });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data.invoiceBuyer).toMatchObject({ taxCode: '001099012345', email: 'mai@example.test', phone: PHONE });
    const no = await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '001099012345', name: 'Nguyễn Thị Mai', address: '1 Phố Thử' });
    expect(no.statusCode, no.body).toBe(400);
    expect(no.json().error.details).toMatchObject({ reason: 'POS_INVOICE_BUYER', field: 'email' });
    expect(no.json().error.message).toContain('Email');
  });

  it('§3: MST có nhưng thiếu địa chỉ / tên là "Khách lẻ" → từ chối, báo đúng ô; email sai → email; mã 11 số → 400', async () => {
    const noAddr = await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '0101234567', name: 'Nguyễn Thị Mai', companyName: 'Công ty Mai' });
    expect(noAddr.statusCode).toBe(400);
    expect(noAddr.json().error.details).toMatchObject({ reason: 'POS_INVOICE_BUYER', field: 'address' });
    const le = await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '0101234567', name: 'Khách lẻ', address: '1 Phố Thử' });
    expect(le.statusCode).toBe(400);
    expect(le.json().error.details).toMatchObject({ reason: 'POS_INVOICE_BUYER', field: 'name' });
    const badMail = await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '0101234567', name: 'Nguyễn Thị Mai', address: '1 Phố Thử', email: 'sai@' });
    expect(badMail.statusCode).toBe(400);
    expect((await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '01012345678', name: 'A', address: 'B' })).statusCode).toBe(400);
    // Doanh nghiệp 13 số đủ ô → nhận.
    const ok = await req(ctx, 'POST', `${M}/orders/${first}/invoice-buyer`, { taxCode: '0101234567-001', name: 'Nguyễn Thị Mai', companyName: 'Công ty Mai CN1', address: '1 Phố Thử' });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('§3: báo cáo khách CN01 + CN02 — mỗi khách: đơn, tiền, voucher, điểm, quà; gồm cả BH10; xem từng lần mua', async () => {
    // Voucher TGS 20K gắn SĐT khách.
    const c = await req(ctx, 'POST', '/api/v1/m/voucher/campaigns', { validFrom: TODAY, code: 'TGS20K034', name: 'TGS 20K', kind: 'cash', issuer: 'tgs', faceValue: 20_000 });
    expect(c.statusCode, c.body).toBe(200);
    const g = await req(ctx, 'POST', `/api/v1/m/voucher/campaigns/${c.json().data.id}/generate`, { phones: [PHONE] });
    const code = g.json().data.created[0].code as string;
    // CN01: 2 hộp + 1 quà (0đ), voucher 20K → thực trả 580.000.
    const o1 = await sell(order([[SUA, 2, 300_000], [QUA, 1, 0, 'Cái']], { vouchers: [code] }, 580_000));
    expect(o1.total).toBe(580_000);
    // CN02: 1 hộp, trả lại 1.
    const o2 = await sell(order([[SUA, 1, 300_000]], { branchCode: 'CN02' }));
    const ret = await req(ctx, 'POST', `${M}/returns`, { id: uuid(), orderId: o2.id, branchCode: 'CN02', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách trả' });
    expect(ret.statusCode, ret.body).toBe(201);
    // Phiếu BH10 đã duyệt ở CN02 cho cùng khách.
    const doc = await req(ctx, 'POST', '/api/v1/m/phieu-ban/docs', {
      docType: 'sale', docDate: TODAY, branchCode: 'CN02', partner: { code: PHONE }, lines: [{ lineKey: 'L1', sku: SUA, qty: 2, unitPrice: 250_000 }], payments: [{ methodCode: 'TM', amount: 540_000 }],
    });
    expect(doc.statusCode, doc.body).toBe(200);
    expect((await req(ctx, 'POST', `/api/v1/m/phieu-ban/docs/${doc.json().data.id}/approve`, {})).statusCode).toBe(200);
    // Khách lẻ.
    await sell(order([[SUA, 1, 300_000]], { customer: { retail: true } }));
    await deliver();
    const pts = (await sql<{ points: string }>`SELECT points FROM mod_loyalty.entries WHERE tenant_id = ${tenantId} AND ref_id = ${o1.id} AND kind = 'earn'`.execute(db)).rows;
    expect(pts).toHaveLength(1);

    const r = await req(ctx, 'GET', `${M}/reports/customers?from=${TODAY}&to=${TODAY}&branchCodes=CN01,CN02`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as Record<string, unknown>[];
    const row = (cust: string, b: string) => rows.find((x) => x.customerCode === cust && x.branchCode === b);
    // CN01: 3 đơn (hai đơn đầu 300.000 + đơn có voucher); voucher 20K; quà 1 × 15.000 theo giá bán; điểm theo sổ điểm.
    expect(row(PHONE, 'CN01')).toMatchObject({
      customerName: 'Chị Mai', orders: 3, posOrders: 3, goods: 1_200_000, discount: 20_000, net: 1_180_000, voucherCount: 1, voucherAmount: 20_000,
      giftQty: 1, giftValue: 15_000, pointsEarned: Number(pts[0]!.points) + 60, shops: 'CN01, CN02',
    });
    // CN02: đơn máy bán + phiếu BH10, trả 300.000.
    expect(row(PHONE, 'CN02')).toMatchObject({ orders: 2, posOrders: 1, phieuBanDocs: 1, net: 840_000, returns: 300_000, netAfterReturns: 540_000 });
    expect(row('', 'CN01')).toMatchObject({ customerName: 'Khách lẻ', orders: 1, net: 300_000 });
    expect(r.json().meta).toMatchObject({ phieuBan: 'ok', voucher: 'ok', loyalty: 'ok' });
    expect(r.json().meta.totals.net).toBe(1_180_000 + 840_000 + 300_000);
    // Lọc một cửa hàng.
    const cn02 = (await req(ctx, 'GET', `${M}/reports/customers?from=${TODAY}&to=${TODAY}&branchCodes=CN02`)).json().data as { branchCode: string }[];
    expect(cn02.every((x) => x.branchCode === 'CN02')).toBe(true);

    // Từng lần mua: mặt hàng, đơn giá, SL, voucher, điểm, quà; gồm phiếu BH10 và lần trả.
    const d = await req(ctx, 'GET', `${M}/reports/customer-detail?customer=${PHONE}&from=${TODAY}&to=${TODAY}`);
    expect(d.statusCode, d.body).toBe(200);
    const list = d.json().data as { source: string; kind: string; refCode: string; vouchers: unknown[]; pointsEarned: number; lines: { sku: string; qty: number; unitPrice: number; isGift: boolean; giftValue?: number }[] }[];
    const withV = list.find((x) => x.refCode === o1.code)!;
    expect(withV.vouchers).toEqual([{ code, campaignName: 'TGS 20K', amount: 20_000 }]);
    expect(withV.pointsEarned).toBeGreaterThan(0);
    expect(withV.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ sku: SUA, qty: 2, unitPrice: 300_000, isGift: false }), expect.objectContaining({ sku: QUA, qty: 1, isGift: true, giftValue: 15_000 }),
    ]));
    expect(list.find((x) => x.source === 'phieu-ban')).toMatchObject({ kind: 'sale', lines: [expect.objectContaining({ sku: SUA, qty: 2, unitPrice: 270_000 })] });
    expect(list.filter((x) => x.kind === 'return')).toHaveLength(1);
    expect(list.every((x) => x.refCode)).toBe(true);
  });

  it('§3: người không có pos:report → 403 ở báo cáo khách', async () => {
    expect((await req(staff, 'GET', `${M}/reports/customers?from=${TODAY}&to=${TODAY}`)).statusCode).toBe(403);
    expect((await req(staff, 'GET', `${M}/reports/customer-detail?customer=${PHONE}`)).statusCode).toBe(403);
  });
});
