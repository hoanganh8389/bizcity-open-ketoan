/**
 * NT-BH-021 — chặn bán quá tồn (chốt 16/11/2026): máy bán chặn cứng theo tồn cửa hàng (một kho mỗi shop), cộng theo mã, quy
 * ĐVT nhỏ nhất, gồm quà; hai máy cùng bán chạy nối tiếp; đơn bán lúc mất mạng gửi bù vẫn nhận + đánh dấu. BH10 phiếu bán nhập tay
 * chặn khi bật công tắc riêng bizcity.phieu_ban.block_negative_stock (mặc định tắt = chỉ cảnh báo như trước).
 */
// [2026-11-16 06:45 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-021 (đóng góp)
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
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const SKU = '11005100103';
const SKU2 = 'TA02';
const DAY = '2026-11-16';
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(21_000_000 + ++seq).padStart(12, '0')}`;

const order = (lines: { sku: string; qty: number; ratio?: number; gift?: boolean }[], over: Record<string, unknown> = {}) => {
  const priced = lines.map((l, i) => ({
    lineId: `l${i + 1}`, productId: l.sku, sku: l.sku, unitName: l.ratio ? 'Thùng' : 'Hộp', unitQty: l.qty, ...(l.ratio ? { unitRatio: l.ratio } : {}),
    clientUnitPrice: 10_800 * (l.ratio ?? 1),
  }));
  const total = priced.reduce((s, l) => s + l.unitQty * l.clientUnitPrice, 0);
  return {
    id: uuid(), branchCode: 'CN01', businessDate: DAY, shiftId: `ngay-${DAY}`, exportReasonCode: 'XBA', customer: { retail: true },
    lines: priced, promotionSelections: [], payment: { mode: 'cash', cashGiven: total }, clientTotal: total, coreVersion: '0.1.0', promotionsVersion: '', ...over,
  };
};

describe.skipIf(!HAS)('NT-BH-021 — chặn bán quá tồn', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-021-${++k}-${Date.now()}` }) },
  });
  const stock = async (sku: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = 'CN01' AND sku = ${sku}`.execute(db)).rows[0]?.q ?? 0);
  const orders = async () => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_pos.orders WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-021', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa hộp 110ml', unit: 'Hộp' }, { sku: SKU2, name: 'Tã quần', unit: 'Hộp' }] })).status).toBeLessThan(300);
    for (const s of [SKU, SKU2]) expect((await call(ctx, 'PUT', `/api/v1/products/${s}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    // §4: nhập 10 rồi máy bán bán 5 → tồn 5.
    await nhapTon(ctx, 'CN01', [[SKU, 10, 'Hộp'], [SKU2, 5, 'Hộp']]);
    // [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022: máy bán chỉ bán đúng bảng giá → khai giá bằng đúng giá máy gửi (đóng góp)
    await khaiGia(tenantId, [[SKU, 'Hộp', 10_800], [SKU, 'Thùng', 64_800, 6], [SKU2, 'Hộp', 10_800]]);
    const r = await req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU, qty: 5 }]));
    expect(r.statusCode, r.body).toBe(201);
    expect(await stock(SKU)).toBe(5);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 dòng 2: máy bán gửi 7 (tồn 5) → 400 POS_STOCK_SHORT, không ghi đơn, không chứng từ; tồn giữ 5', async () => {
    const before = await orders();
    const r = await req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU, qty: 7 }]));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details).toMatchObject({ reason: 'POS_STOCK_SHORT', items: [{ sku: SKU, need: 7, have: 5 }] });
    expect(r.json().error.message).toContain(`${SKU} cần 7, tồn 5 ở CN01`);
    expect(await orders()).toBe(before);
    expect(await stock(SKU)).toBe(5);
  });

  it('lệch chuẩn 1–3: hai dòng 4 + 3 → chặn; 1 thùng (6 hộp) → chặn; quà 0đ cùng mã tính vào số xuất', async () => {
    const a = await req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU, qty: 4 }, { sku: SKU, qty: 3 }]));
    expect(a.json().error?.details).toMatchObject({ reason: 'POS_STOCK_SHORT', items: [{ sku: SKU, need: 7, have: 5 }] });
    const b = await req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU, qty: 1, ratio: 6 }]));
    expect(b.json().error?.details).toMatchObject({ reason: 'POS_STOCK_SHORT', items: [{ sku: SKU, need: 6, have: 5 }] });
  });

  it('§5 dòng 3: bán đúng 5 (tồn 5) → bán được, tồn còn 0; bán thêm 1 → chặn (tồn 0 thì không bán được)', async () => {
    const a = await req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU, qty: 5 }]));
    expect(a.statusCode, a.body).toBe(201);
    expect(await stock(SKU)).toBe(0);
    const b = await req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU, qty: 1 }]));
    expect(b.json().error?.details).toMatchObject({ reason: 'POS_STOCK_SHORT', items: [{ sku: SKU, need: 1, have: 0 }] });
  });

  it('lệch chuẩn 5: hai máy cùng lúc bán 3 + 3 (tồn 5) → một đơn được, đơn kia POS_STOCK_SHORT với tồn đã trừ (2)', async () => {
    const [a, b] = await Promise.all([
      req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU2, qty: 3 }])),
      req('POST', '/api/v1/m/pos/orders', order([{ sku: SKU2, qty: 3 }])),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes, `${a.body} ${b.body}`).toEqual([201, 400]);
    const bad = a.statusCode === 400 ? a : b;
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_STOCK_SHORT', items: [{ sku: SKU2, need: 3, have: 2 }] });
    expect(await stock(SKU2)).toBe(2);
  });

  it('lệch chuẩn 6: đơn bán lúc mất mạng gửi bù thiếu tồn → vẫn nhận, đánh dấu; màn Đơn bán máy POS lọc được', async () => {
    const o = order([{ sku: SKU2, qty: 4 }], { offlineCreatedAt: `${DAY}T03:00:00.000Z` });
    const r = await req('POST', '/api/v1/m/pos/orders', o);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order.stockShortOffline).toEqual([{ sku: SKU2, need: 4, have: 2 }]);
    const list = await req('GET', `/api/v1/m/pos/admin/orders?from=${DAY}&to=${DAY}&stockShort=1`);
    expect(list.statusCode, list.body).toBe(200);
    const rows = list.json().data as { id: string; stockShortOffline: unknown[] }[];
    expect(rows.map((x) => x.id)).toEqual([o.id]);
    expect(rows[0]!.stockShortOffline).toEqual([{ sku: SKU2, need: 4, have: 2 }]);
  });

  it('BH10: công tắc tắt (mặc định) → bán quá tồn vẫn duyệt được như trước; bật → PHIEU_BAN_STOCK_SHORT; sửa còn đủ → duyệt được', async () => {
    await nhapTon(ctx, 'CN01', [[SKU, 5, 'Hộp']], '2026-10-02', 'NHAP-TON-CN01-2');
    const sale = (qty: number) => ({ docType: 'sale', docDate: DAY, branchCode: 'CN01', partner: { code: 'KH001' }, lines: [{ lineKey: 'L1', sku: SKU, qty, unitPrice: 10_000 }], payments: [] });
    // Tắt: duyệt được (tồn 5, bán 6), rồi bỏ duyệt để tồn về 5.
    const a = await req('POST', '/api/v1/m/phieu-ban/docs', sale(6));
    expect(a.statusCode, a.body).toBe(200);
    const id = a.json().data.id as string;
    expect((await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`, {})).statusCode).toBe(200);
    expect((await req('POST', `/api/v1/m/phieu-ban/docs/${id}/unapprove`, { reason: 'thử công tắc' })).statusCode).toBe(200);
    expect(await stock(SKU)).toBe(5);
    // Bật công tắc riêng của phiếu bán (BH17).
    const key = 'bizcity.phieu_ban.block_negative_stock';
    const put = await req('PUT', `/api/v1/settings/values/${key}`, { key, value: true });
    expect(put.statusCode, put.body).toBeLessThan(300);
    const blocked = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`, {});
    expect(blocked.statusCode, blocked.body).toBe(400);
    expect(blocked.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_STOCK_SHORT', items: [{ sku: SKU, need: 6, have: 5 }] });
    // Sửa thành 5 → duyệt được.
    const upd = await req('PUT', `/api/v1/m/phieu-ban/docs/${id}`, sale(5));
    expect(upd.statusCode, upd.body).toBe(200);
    const ok = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`, {});
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await stock(SKU)).toBe(0);
  });
});
