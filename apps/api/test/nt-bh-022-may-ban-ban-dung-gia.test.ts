/**
 * NT-BH-022 — máy bán bán đúng bảng giá (chốt 17/11/2026, đợt 1: phần máy bán): giá dòng và hệ số ĐVT phải khớp bảng giá cửa hàng
 * (`bizcity_read.branch_prices`), thu ngân không giảm tay (chỉ giảm theo chương trình khuyến mại), mã chưa có giá thì không bán; hàng
 * Nội bộ 0đ không cần giá; đơn bán lúc mất mạng gửi bù vẫn nhận + đánh dấu `priceChangedOffline`. Phiếu:
 * docs/nghiem-thu/ban-hang/NT-BH-022-may-ban-ban-dung-gia.md (§3 kết quả mong đợi, §4 lệch chuẩn). Chưa có module → bỏ qua.
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-022 (đóng góp)
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

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const SKU = 'SUA330';
const MOI = 'MOI01';
const NOIBO = '11005100103Z';
const DAY = '2026-11-17';
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(22_000_000 + ++seq).padStart(12, '0')}`;

type Line = { sku: string; unit: string; qty: number; price: number; ratio?: number } & Record<string, unknown>;
const order = (lines: Line[], over: Record<string, unknown> = {}) => {
  const priced = lines.map(({ sku, unit, qty, price, ratio, ...rest }, i) => ({
    lineId: `l${i + 1}`, productId: sku, sku, unitName: unit, unitQty: qty, ...(ratio ? { unitRatio: ratio } : {}), clientUnitPrice: price, ...rest,
  }));
  const total = priced.reduce((s, l) => s + l.unitQty * l.clientUnitPrice - Number((l as { promoDiscount?: number }).promoDiscount ?? 0), 0);
  return {
    id: uuid(), branchCode: 'CN01', businessDate: DAY, shiftId: `ngay-${DAY}`, exportReasonCode: 'XBA', customer: { retail: true },
    lines: priced, promotionSelections: [], payment: { mode: 'cash', cashGiven: total }, clientTotal: total, coreVersion: '0.1.0', promotionsVersion: '', ...over,
  };
};

describe.skipIf(!HAS)('NT-BH-022 — máy bán bán đúng bảng giá', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-022-${++k}-${Date.now()}` }) },
  });
  const sell = (body: unknown) => req('POST', '/api/v1/m/pos/orders', body);
  const counts = async () => (await sql<{ o: string; d: string }>`
    SELECT (SELECT count(*) FROM mod_pos.orders WHERE tenant_id = ${tenantId}) AS o,
           (SELECT count(*) FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key LIKE 'pos:%') AS d`.execute(db)).rows.map((r) => [Number(r.o), Number(r.d)])[0]!;
  /** Bị từ chối: đúng mã HTTP + lý do, không ghi đơn, không chứng từ. Trả chi tiết lỗi để kiểm thêm. */
  const rejected = async (body: unknown, status: number, reason: string) => {
    const before = await counts();
    const r = await sell(body);
    expect(r.statusCode, r.body).toBe(status);
    expect(r.json().error.details.reason).toBe(reason);
    expect(await counts()).toEqual(before);
    return r.json().error as { message: string; details: { items: unknown[] } };
  };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-022', trx as never); });
    app = await buildApp();
    // Phiếu §2: SUA330 Hộp 330.000, Thùng (×24) 7.900.000; MOI01 chưa có giá ở CN01; thêm một mã Nội bộ (quà 0đ không gửi thuế).
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 330', unit: 'Hộp' }, { sku: MOI, name: 'Hàng mới chưa khai giá', unit: 'Cái' }] })).status).toBeLessThan(300);
    for (const s of [SKU, MOI]) expect((await call(ctx, 'PUT', `/api/v1/products/${s}`, { taxOutCode: 'R08' })).status).toBe(200);
    await sql`INSERT INTO products (tenant_id, sku, name, unit, tax_out_code, variant_code) VALUES
      (${tenantId}, ${NOIBO}, 'Bình sữa quà tặng (Nội bộ)', 'Cái', 'R08', 'internal')`.execute(db);
    await nhapTon(ctx, 'CN01', [[SKU, 1000, 'Hộp'], [MOI, 10, 'Cái'], [NOIBO, 10, 'Cái']]);
    await khaiGia(tenantId, [[SKU, 'Hộp', 330_000], [SKU, 'Thùng', 7_900_000, 24]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3: bán SUA330 1 Hộp 330.000 và 1 Thùng (×24) 7.900.000 đúng bảng giá → bán được', async () => {
    const r = await sell(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 330_000 }]));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order).toMatchObject({ total: 330_000 });
    expect(r.json().data.order).not.toHaveProperty('priceChangedOffline');
    const t = await sell(order([{ sku: SKU, unit: 'Thùng', qty: 1, price: 7_900_000, ratio: 24 }]));
    expect(t.statusCode, t.body).toBe(201);
    expect(t.json().data.order.total).toBe(7_900_000);
  });

  it('§3: máy gửi giá 300.000 (khác bảng giá) → 409 POS_PRICE_CHANGED kèm dòng lệch, không ghi đơn / chứng từ', async () => {
    const e = await rejected(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 300_000 }]), 409, 'POS_PRICE_CHANGED');
    expect(e.message).toContain('SUA330 (Hộp) giá bảng giá 330.000, máy gửi 300.000');
    expect(e.message).toContain('tải lại giá');
    expect(e.details.items).toEqual([{ sku: SKU, unit: 'Hộp', price: 330_000, ratio: 1, clientPrice: 300_000, clientRatio: 1 }]);
  });

  it('§3: ĐVT Thùng gửi hệ số sai (×12 thay ×24) → POS_PRICE_CHANGED, hệ số theo danh mục', async () => {
    const e = await rejected(order([{ sku: SKU, unit: 'Thùng', qty: 1, price: 7_900_000, ratio: 12 }]), 409, 'POS_PRICE_CHANGED');
    expect(e.details.items).toEqual([{ sku: SKU, unit: 'Thùng', price: 7_900_000, ratio: 24, clientPrice: 7_900_000, clientRatio: 12 }]);
  });

  it('§3: dòng có giảm tay (manualDiscount) → 400 POS_MANUAL_DISCOUNT (CK % lẫn CK tiền)', async () => {
    for (const manualDiscount of [{ kind: 'percent', value: 10 }, { kind: 'amount', value: 30_000 }]) {
      const e = await rejected(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 330_000, manualDiscount }]), 400, 'POS_MANUAL_DISCOUNT');
      expect(e.details.items).toEqual([{ lineId: 'l1', sku: SKU }]);
    }
  });

  it('§3: bán MOI01 chưa có giá ở CN01 → 400 POS_NO_PRICE, báo kế toán khai giá', async () => {
    const e = await rejected(order([{ sku: MOI, unit: 'Cái', qty: 1, price: 50_000 }]), 400, 'POS_NO_PRICE');
    expect(e.message).toContain('MOI01 (Cái)');
    expect(e.message).toContain('CN01');
    expect(e.message).toContain('báo kế toán khai giá');
    expect(e.details.items).toEqual([{ sku: MOI, unit: 'Cái', price: null, ratio: null, clientPrice: 50_000, clientRatio: 1 }]);
  });

  it('§3: hàng Nội bộ 0đ (bill Z) không cần giá → bán được như hôm nay', async () => {
    const r = await sell(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 330_000 }, { sku: NOIBO, unit: 'Cái', qty: 1, price: 0 }]));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order.total).toBe(330_000);
    expect(r.json().data.order.zBill.lines).toEqual([expect.objectContaining({ sku: NOIBO, amount: 0 })]);
  });

  it('§3: khuyến mại giảm 10 % SUA330 → vẫn bán được: giá dòng = giá bảng giá, tiền giảm theo chương trình', async () => {
    const prog = await call(ctx, 'POST', '/api/v1/sale-programs', {
      programKind: 'KM-CTY', validFrom: '2026-11-01', validTo: '2026-12-31', code: 'CT-022-GIAM', name: 'Giảm 10 %', mode: 'discount',
      sku: SKU, discountPct: 10, quotas: [{ branchCode: 'CN01', quotaQty: 20 }],
    });
    expect(prog.status, JSON.stringify(prog.body)).toBe(200);
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: DAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: SKU, qty: 1, price: 330_000 }] });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.data.discounts.map((d: { lineKey: string; amount: number }) => [d.lineKey, d.amount])).toEqual([['l1', 33_000]]);
    const policyRefs = ev.body.data.policyRefs.map(({ key, version, hash }: { key: string; version: number; hash: string }) => ({ key, version, hash }));
    const r = await sell(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 330_000, promoDiscount: 33_000, policyRef: { key: 'CT-022-GIAM', version: policyRefs[0].version, line: 'discount' } }], { policyRefs }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.total).toBe(297_000);
    expect(o.lines[0]).toMatchObject({ sku: SKU, promoDiscount: 33_000 });
  });

  it('§4 lệch chuẩn 1: kế toán đổi giá lúc giỏ đang mở → giá lúc lưu đơn: giá cũ bị từ chối, giá mới bán được', async () => {
    await khaiGia(tenantId, [[SKU, 'Hộp', 335_000]]);
    const e = await rejected(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 330_000 }]), 409, 'POS_PRICE_CHANGED');
    expect(e.details.items).toEqual([{ sku: SKU, unit: 'Hộp', price: 335_000, ratio: 1, clientPrice: 330_000, clientRatio: 1 }]);
    const r = await sell(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 335_000 }]));
    expect(r.statusCode, r.body).toBe(201);
  });

  it('§4 lệch chuẩn 2: đơn bán lúc mất mạng gửi bù, giá đã đổi / chưa có giá → vẫn nhận, đánh dấu priceChangedOffline, lọc được ở quản trị', async () => {
    const r = await sell(order([{ sku: SKU, unit: 'Hộp', qty: 1, price: 330_000 }, { sku: MOI, unit: 'Cái', qty: 1, price: 50_000 }], { offlineCreatedAt: `${DAY}T09:00:00+07:00` }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.total).toBe(380_000);
    expect(o.priceChangedOffline).toEqual([
      { sku: MOI, unit: 'Cái', price: null, ratio: null, clientPrice: 50_000, clientRatio: 1 },
      { sku: SKU, unit: 'Hộp', price: 335_000, ratio: 1, clientPrice: 330_000, clientRatio: 1 },
    ]);
    const list = await req('GET', `/api/v1/m/pos/admin/orders?from=${DAY}&to=${DAY}&stockShort=1`);
    expect(list.statusCode, list.body).toBe(200);
    const rows = list.json().data as { id: string; priceChangedOffline: unknown[] }[];
    expect(rows.map((x) => x.id)).toEqual([o.id]);
    expect(rows[0]!.priceChangedOffline).toEqual(o.priceChangedOffline);
  });
});
