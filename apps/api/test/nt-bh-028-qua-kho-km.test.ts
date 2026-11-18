// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-028 quà cùng mã hàng bán, trừ tồn ở kho khuyến mại (đóng góp)
/**
 * NT-BH-028 — quà cùng mã hàng bán, phân biệt bằng phân kho (chốt 18/11/2026): cửa hàng khai kho quà loại KKM (khoá
 * bizcity.pos.gift_warehouses); dòng quà (isGift) của máy bán và phiếu bán BH10 trừ kho quà, dòng bán trừ kho bán; kiểm tồn theo mặt hàng ×
 * kho, không cộng chung. Chưa khai kho quà → như cũ. Thuế / bill Z không đổi. Gọi HTTP như máy bán / màn BH10; kiểm tồn ở
 * bizcity_read.stock_on_hand.warehouse_code. Số theo docs/nghiem-thu/ban-hang/NT-BH-028-qua-theo-kho-khuyen-mai.md §3.
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
const PB = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(PB, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const KEY = 'bizcity.pos.gift_warehouses';
const vnDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
const KHO = 'KHO01';
const KM = 'KHO01-KM';

let n = 0;
const uuid = (p = '0') => `0193a1b2-0000-7000-8000-${p}${String(28_000 + ++n).padStart(11, '0')}`;
type Ref = { key: string; version: number; hash: string };
/** Đơn mua 2 tặng 1 (quà cùng mã): `sku` × 2 giá 330.000 + quà `sku` × 1 theo chương trình `CT-<sku>`. */
const order = (sku: string, refs: Ref[], over: Record<string, unknown> = {}, gift = true) => ({
  id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [
    { lineId: 'l1', sku, unitName: 'Hộp', unitQty: 2, clientUnitPrice: 330_000 },
    ...(gift ? [{ lineId: 'g1', sku, unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true, policyRef: { key: `CT-${sku}`, version: 1, line: 'gift' } }] : []),
  ],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 660_000 }, clientTotal: 660_000, coreVersion: '0.1.0', promotionsVersion: '',
  ...(gift ? { policyRefs: refs.filter((r) => r.key === `CT-${sku}`) } : {}), ...over,
});

describe.skipIf(!HAS)('NT-BH-028 — quà cùng mã, trừ tồn ở kho khuyến mại', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let refs: Ref[] = [];
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-028-${++k}-${Date.now()}` }) },
  });
  const pos = (url: string, payload: unknown) => req('POST', `/api/v1/m/pos${url}`, payload);
  const stockAt = async (sku: string, wh: string, branch = 'CN01') => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = ${branch} AND sku = ${sku} AND coalesce(warehouse_code, '') = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const payload = async (docKey: string) => (await sql<{ p: { lines: { lineKey: string; sku: string; isGift?: boolean; warehouseCode?: string; taxAmount: number }[] } }>`
    SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]!.p;
  const whOf = (lines: { lineKey: string; warehouseCode?: string }[]) => Object.fromEntries(lines.map((l) => [l.lineKey, l.warehouseCode ?? '']));

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-028', trx as never); });
    app = await buildApp();
    for (const code of ['CN02', 'CN03']) expect((await call(ctx, 'POST', '/api/v1/branches', { code, name: `Cửa hàng ${code}` })).status).toBe(201);
    const skus = ['SUA330', 'SUA400', 'SUA900'];
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: skus.map((sku) => ({ sku, name: `Sữa ${sku}`, unit: 'Hộp' })) })).status).toBeLessThan(300);
    for (const sku of skus) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH028', name: 'Đại lý 028' })).status).toBeLessThan(300);
    // CN01: kho bán mặc định KHO01 + kho khuyến mại KHO01-KM (loại KKM có sẵn); CN03: chỉ kho bán (khai nhầm kho quà).
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: KHO, branchCode: 'CN01', name: 'Kho bán CN01', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: KM, branchCode: 'CN01', name: 'Kho khuyến mại CN01', typeCode: 'KKM' })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'KHO03', branchCode: 'CN03', name: 'Kho bán CN03', isDefault: true })).status).toBe(201);
    // §3: SUA330 kho bán 10 / kho KM 3; SUA400 kho bán 10 / kho KM 0; SUA900 kho bán 0 / kho KM 3.
    await nhapTon(ctx, 'CN01', [['SUA330', 10, 'Hộp'], ['SUA400', 10, 'Hộp']], '2026-10-01', 'NHAP-KHO01', KHO);
    await nhapTon(ctx, 'CN01', [['SUA330', 3, 'Hộp'], ['SUA900', 3, 'Hộp']], '2026-10-01', 'NHAP-KHO01-KM', KM);
    await nhapTon(ctx, 'CN02', [['SUA330', 100, 'Hộp']]);
    await khaiGia(tenantId, skus.map((sku) => [sku, 'Hộp', 330_000] as const));
    // Chương trình mua 2 tặng 1 — quà là chính mã đang bán (D037-6: cùng item_id).
    for (const sku of skus) {
      const r = await call(ctx, 'POST', '/api/v1/sale-programs', { programKind: 'KM-CTY', validFrom: vnDate(-1), validTo: vnDate(30), code: `CT-${sku}`, name: `Mua 2 tặng 1 ${sku}`, mode: 'gift', sku, buyQty: 2, giftSku: sku, giftQty: 1,
        quotas: ['CN01', 'CN02', 'CN03'].map((branchCode) => ({ branchCode, quotaQty: 100 })) });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: TODAY, branchCode: 'CN01', lines: skus.map((sku, i) => ({ lineKey: `l${i}`, sku, qty: 2, price: 330_000 })) });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.data.gifts.map((g: { sku: string; qty: number }) => [g.sku, g.qty]).sort(), JSON.stringify(ev.body)).toEqual(skus.map((s) => [s, 1]));
    refs = ev.body.data.policyRefs.map(({ key, version, hash }: Ref) => ({ key, version, hash }));
    const set = await req('PUT', `/api/v1/settings/values/${KEY}`, { key: KEY, value: [`CN01=${KM}`, 'CN03=KHO03'] });
    expect(set.statusCode, set.body).toBeLessThan(300);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('bootstrap máy bán: kho bán / kho quà của cửa hàng; khai kho không phải KKM → báo, không dùng', async () => {
    const b = await req('GET', '/api/v1/m/pos/bootstrap?branch=CN01');
    expect(b.json().data.warehouses).toEqual({ sale: KHO, gift: KM, giftIssue: null });
    const g3 = await req('GET', '/api/v1/m/pos/gift-warehouse?branch=CN03');
    expect(g3.json().data).toMatchObject({ giftWarehouse: null, issue: expect.stringContaining('không phải kho khuyến mại') });
    const bad = await pos('/orders', order('SUA330', refs, { branchCode: 'CN03' }));
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details.reason).toBe('POS_GIFT_WAREHOUSE');
  });

  it('§3 dòng 1: CN01 mua 2 tặng 1 SUA330 → 2 dòng bán trừ KHO01, 1 dòng quà trừ KHO01-KM', async () => {
    const o = order('SUA330', refs);
    const r = await pos('/orders', o);
    expect(r.statusCode, r.body).toBe(201);
    const doc = await payload(`pos:CN01:sale:${o.id}`);
    expect(whOf(doc.lines)).toEqual({ l1: KHO, g1: KM });
    expect(doc.lines.find((l) => l.lineKey === 'g1')).toMatchObject({ isGift: true, sku: 'SUA330' });
    expect(await stockAt('SUA330', KHO)).toBe(8);
    expect(await stockAt('SUA330', KM)).toBe(2);
    // Bản sao đơn (website) mang phân kho của dòng.
    const lines = r.json().data.order.lines as { lineId: string; warehouseCode?: string }[];
    expect(Object.fromEntries(lines.map((l) => [l.lineId, l.warehouseCode]))).toEqual({ l1: KHO, g1: KM });
    // Tồn quà cho hộp chọn quà: theo kho quà, không cộng số đang bán cùng mã.
    const st = await req('GET', '/api/v1/m/pos/stock?skus=SUA330&branch=CN01&scope=gift');
    expect(st.json().data).toEqual([{ sku: 'SUA330', available: 2, held: 0 }]);
    expect((await req('GET', '/api/v1/m/pos/stock?skus=SUA330&branch=CN01')).json().data[0].available).toBe(8);
  });

  it('§3 dòng 2: kho KM còn 0, kho bán còn 10 → quà báo hết (không tặng), hàng bán vẫn bán', async () => {
    const r = await pos('/orders', order('SUA400', refs));
    expect(r.statusCode, r.body).toBe(400);
    const e = r.json().error;
    expect(e.details.reason).toBe('POS_GIFT_STOCK_SHORT');
    expect(e.details.items).toEqual([{ sku: 'SUA400', need: 1, have: 0, warehouse: KM, gift: true }]);
    expect(e.message).toContain('Hết quà');
    const ok = await pos('/orders', order('SUA400', refs, {}, false));
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await stockAt('SUA400', KHO)).toBe(8);
  });

  it('§3 dòng 3: kho bán còn 0, kho KM còn 3 → không bán được hàng (chặn tồn); quà không dùng thay hàng bán', async () => {
    const r = await pos('/orders', order('SUA900', refs));
    expect(r.statusCode, r.body).toBe(400);
    const e = r.json().error;
    expect(e.details.reason).toBe('POS_STOCK_SHORT');
    expect(e.details.items).toEqual([{ sku: 'SUA900', need: 2, have: 0 }]);
    expect(await stockAt('SUA900', KM)).toBe(3);
  });

  it('§3 dòng 4: BH10 lập phiếu có dòng quà → dòng quà tự vào kho KM', async () => {
    const body = {
      docType: 'sale', docDate: TODAY, branchCode: 'CN01', warehouseCode: KHO, partner: { code: 'KH028' }, payments: [], policyRefs: refs.filter((x) => x.key === 'CT-SUA330'),
      lines: [
        { lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 305_556 },
        { lineKey: 'G1', sku: 'SUA330', qty: 1, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } },
      ],
    };
    const c = await req('POST', '/api/v1/m/phieu-ban/docs', body);
    expect(c.statusCode, c.body).toBe(200);
    const id = c.json().data.id as string;
    expect(whOf(c.json().data.lines)).toEqual({ L1: '', G1: KM });
    const a = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`);
    expect(a.statusCode, a.body).toBe(200);
    expect(whOf((await payload(`phieu-ban:${id}`)).lines)).toEqual({ L1: KHO, G1: KM });
    expect(await stockAt('SUA330', KHO)).toBe(6);
    expect(await stockAt('SUA330', KM)).toBe(1);
  });

  it('§3 dòng 5: cửa hàng chưa khai kho quà → như cũ, mọi dòng trừ kho bán (không gửi kho ở dòng)', async () => {
    const b = await req('GET', '/api/v1/m/pos/bootstrap?branch=CN02');
    expect(b.json().data.warehouses).toMatchObject({ gift: null, giftIssue: null });
    const o = order('SUA330', refs, { branchCode: 'CN02' });
    const r = await pos('/orders', o);
    expect(r.statusCode, r.body).toBe(201);
    const doc = await payload(`pos:CN02:sale:${o.id}`);
    expect(whOf(doc.lines)).toEqual({ l1: '', g1: '' });
    expect(doc.lines.find((l) => l.lineKey === 'g1')).toMatchObject({ isGift: true });
    expect(Number((await sql<{ q: string }>`SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = 'CN02' AND sku = 'SUA330'`.execute(db)).rows[0]!.q)).toBe(97);
  });
});
