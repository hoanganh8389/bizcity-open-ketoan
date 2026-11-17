// [2026-11-15 04:05 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: tích / hoàn điểm theo đơn máy bán, chính sách website đẩy sang (đóng góp)
/**
 * NT-BH-020 bước 1 — sổ điểm thành viên (module loyalty): website đẩy chính sách, máy bán gửi đơn / phiếu trả vào module pos,
 * sự kiện pos.order.recorded / pos.return.recorded giao cho module loyalty → dòng tích / hoàn. Đối chiếu số với phiếu
 * docs/nghiem-thu/ban-hang/NT-BH-020-pos-tich-diem.md §4. Chưa có module → bỏ qua.
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
const POS_READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
// Chính sách mẫu NT-BH-020 §4 (CN01): TICH10K 1 điểm / 10.000đ hạn 365 ngày; THUONG1TR đơn từ 1.000.000đ +20; hạng ×1 / ×1,2 / ×1,5.

const PROGRAM = {
  version: 'lp-test-1',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: true, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [
    { key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 },
    { key: 'silver', name: 'Bạc', minPoints: 1000, multiplier: 1.2 },
    { key: 'gold', name: 'Vàng', minPoints: 5000, multiplier: 1.5 },
  ],
  policies: [
    { id: 1, code: 'TICH10K', title: '1 điểm cho mỗi 10.000đ', type: 1, priority: 1, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 } },
    { id: 2, code: 'THUONG1TR', title: 'Đơn từ 1.000.000đ thưởng 20 điểm', type: 4, priority: 2, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { point_expiry_days: 365, rules: [{ min_amount: 1000000, bonus_points: 20 }] } },
  ],
};
const SKU = '100021001';
const PHONE = '0901234567';
const O1 = '0193a1b2-0000-7000-8000-000000020001';
const O2 = '0193a1b2-0000-7000-8000-000000020002';
const O3 = '0193a1b2-0000-7000-8000-000000020003';
const R1 = '0193a1b2-0000-7000-8000-000000020101';

const order = (id: string, qty: number, customer: Record<string, unknown>) => ({
  id, branchCode: 'CN01', businessDate: '2026-11-15', shiftId: 'ngay-2026-11-15', exportReasonCode: 'XBA', customer,
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: qty, clientUnitPrice: 325_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 325_000 * qty }, clientTotal: 325_000 * qty, coreVersion: '0.1.0', promotionsVersion: '',
});

describe.skipIf(!HAS)('NT-BH-020 — sổ điểm thành viên: tích / hoàn theo đơn máy bán', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method !== 'GET' ? { 'idempotency-key': `nt-bh-020-${++k}-${Date.now()}` } : {}) },
  });
  const deliver = () => dispatchOnce({ tenantId, consumers: ['loyalty.order-earn', 'loyalty.return-reverse'] });
  const points = async () => (await call('GET', `/api/v1/m/loyalty/customers/${PHONE}?branch=CN01`)).json().data;
  const rows = async () => (await sql<{ kind: string; points: string; ref_code: string }>`
    SELECT kind, points, ref_code FROM mod_loyalty.entries WHERE tenant_id = ${tenantId} ORDER BY at, created_at`.execute(db)).rows.map((r) => [r.kind, Number(r.points), r.ref_code]);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: POS_READS });
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-020', trx as never); });
    app = await buildApp();
    const put = await call('PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa bột Biomil Plus 1 400g', unit: 'Lon', taxOutCode: 'R08' }] });
    expect(put.statusCode, put.body).toBeLessThan(300);
    expect((await call('PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'R08' })).statusCode).toBe(200);
    // [2026-11-16 07:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: máy bán chặn bán quá tồn → nhập tồn trước khi bán (đóng góp)
    await nhapTon(ctx, 'CN01', [[SKU, 1000, 'Lon']]);
    // [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022: máy bán chỉ bán đúng bảng giá → khai giá bằng đúng giá máy gửi (đóng góp)
    await khaiGia(tenantId, [[SKU, 'Lon', 325_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('website đẩy chính sách CN01; gửi lại cùng phiên bản không đổi; chi nhánh lạ bị chặn; máy bán đọc được', async () => {
    const a = await call('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: PROGRAM });
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json().data).toEqual({ branchCode: 'CN01', version: 'lp-test-1', changed: true });
    expect((await call('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: PROGRAM })).json().data.changed).toBe(false);
    const bad = await call('POST', '/api/v1/m/loyalty/program', { branchCode: 'KHONGCO', storeId: 2, program: PROGRAM });
    expect(bad.statusCode, bad.body).toBe(400);
    const got = await call('GET', '/api/v1/m/loyalty/program?branch=CN01');
    expect(got.statusCode, got.body).toBe(200);
    expect(got.json().data).toMatchObject({ version: 'lp-test-1', tiers: expect.any(Array), policies: expect.any(Array) });
    expect((await call('GET', '/api/v1/m/loyalty/program?branch=CN09')).statusCode).toBe(404);
  });

  it('kiểm 1: khách mới mua 325.000 → +32 điểm (lô hạn 365 ngày), số dư 32; giao lại sự kiện không tích thêm', async () => {
    const r = await call('POST', '/api/v1/m/pos/orders', order(O1, 1, { phone: PHONE, name: 'Chị Lan' }));
    expect(r.statusCode, r.body).toBe(201);
    expect((await deliver()).done).toBeGreaterThanOrEqual(1);
    const p = await points();
    expect(p).toMatchObject({ customerId: PHONE, balance: 32, available: 32, tierKey: 'member', nextTierName: 'Bạc' });
    expect(p.lots).toEqual([expect.objectContaining({ points: 32, remaining: 32 })]);
    expect(Date.parse(p.lots[0].expiresAt) - Date.parse(p.lots[0].earnedAt)).toBe(365 * 86_400_000);
    await deliver();
    expect(await rows()).toEqual([['earn', 32, 'HD2611000001']]);
  });

  it('kiểm 1: cùng khách mua 1.300.000 → +150 (130 + thưởng 20), số dư 182', async () => {
    const r = await call('POST', '/api/v1/m/pos/orders', order(O2, 4, { partnerId: PHONE }));
    expect(r.statusCode, r.body).toBe(201);
    await deliver();
    expect((await points()).balance).toBe(182);
  });

  it('kiểm 3: trả 2 lon (650.000) của đơn 1.300.000 → −75, số dư 107; lô của đơn đó còn 75', async () => {
    const r = await call('POST', '/api/v1/m/pos/returns', { id: R1, orderId: O2, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 2 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
    expect(r.statusCode, r.body).toBe(201);
    await deliver();
    const p = await points();
    expect(p.balance).toBe(107);
    expect(p.lots.map((l: { points: number; remaining: number }) => [l.points, l.remaining])).toEqual([[32, 32], [150, 75]]);
    expect(await rows()).toEqual([['earn', 32, 'HD2611000001'], ['earn', 150, 'HD2611000002'], ['reverse', -75, r.json().data.code]]);
  });

  it('khách lẻ không tích; sổ chỉ thêm (không sửa / xoá dòng cũ)', async () => {
    const r = await call('POST', '/api/v1/m/pos/orders', order(O3, 1, { retail: true }));
    expect(r.statusCode, r.body).toBe(201);
    await deliver();
    expect((await rows()).length).toBe(3);
  });
});
