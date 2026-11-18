// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-029 tạo khách riêng trên máy bán (đóng góp)
/**
 * NT-BH-029 — nút "Tạo khách" trên máy bán đi module thật (chốt 18/11/2026): GET /customers/check kiểm SĐT dạng Việt Nam + tên bắt buộc,
 * tra danh mục đối tượng của kế toán theo SĐT; trùng SĐT → không tạo, trả khách cũ + câu "SĐT … đã thuộc khách …"; SĐT mới → khách
 * (mã = SĐT) chọn được ngay, vào danh mục đối tượng cùng đơn đầu tiên (đường khách kèm đơn — module chưa tự ghi được danh mục, xem
 * phiếu §4). Số theo docs/nghiem-thu/ban-hang/NT-BH-029-tao-khach-tren-may-ban.md §2.
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
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const LAN = '0901000029';
const OLD = '0909000029';

describe.skipIf(!HAS)('NT-BH-029 — tạo khách riêng trên máy bán', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({
    method, url: `${M}${url}`, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-029-${++k}-${Date.now()}` }) },
  });
  const check = (phone: string, name: string) => req('GET', `/customers/check?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`);
  const partners = async (code: string) => (await sql<{ name: string; kind: string }>`SELECT name, kind FROM partners WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(db)).rows;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-029', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA029', name: 'Sữa 029', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/products/SUA029', { taxOutCode: 'R08' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SUA029', 100, 'Hộp']]);
    await khaiGia(tenantId, [['SUA029', 'Hộp', 330_000]]);
    // Khách cũ đã có ở danh mục đối tượng (mã = SĐT).
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: OLD, name: 'Anh Cũ', phone: OLD })).status).toBeLessThan(300);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§2 dòng 1: tạo "Chị Lan" SĐT mới → máy bán chọn được ngay; đơn sau gắn đúng khách; khách có trong danh mục đối tượng', async () => {
    const r = await check(LAN, 'Chị Lan');
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d).toMatchObject({ status: 'new', customer: { id: LAN, name: 'Chị Lan', phone: LAN, orderCount: 0 } });
    // Máy bán chọn khách mới vào đơn (khách kèm đơn: SĐT + tên) → cửa nạp Core thêm đối tượng theo mã = SĐT.
    const o = await req('POST', '/orders', {
      id: '0193a1b2-0000-7000-8000-000000029001', branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA',
      customer: { phone: d.customer.phone, name: d.customer.name },
      lines: [{ lineId: 'l1', sku: 'SUA029', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 330_000 }],
      promotionSelections: [], payment: { mode: 'cash', cashGiven: 330_000 }, clientTotal: 330_000, coreVersion: '0.1.0', promotionsVersion: '',
    });
    expect(o.statusCode, o.body).toBe(201);
    expect(o.json().data.order.customer).toEqual({ id: LAN, name: 'Chị Lan', phone: LAN });
    expect(await partners(LAN)).toEqual([{ name: 'Chị Lan', kind: 'customer' }]);
    const found = await req('GET', `/customers?q=${LAN}`);
    expect(found.json().data).toEqual([expect.objectContaining({ id: LAN, name: 'Chị Lan', orderCount: 1 })]);
    // Bấm "Tạo khách" lại cùng SĐT: đã có → mở khách đó.
    expect((await check(LAN, 'Chị Lan')).json().data).toMatchObject({ status: 'exists', customer: { id: LAN, orderCount: 1 } });
  });

  it('§2 dòng 2: tạo lại cùng SĐT → không tạo trùng; báo "SĐT … đã thuộc khách …" và mở khách cũ', async () => {
    const r = await check(OLD, 'Tên khác');
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d).toMatchObject({ status: 'exists', customer: { id: OLD, name: 'Anh Cũ' } });
    expect(d.message).toBe(`SĐT ${OLD} đã thuộc khách Anh Cũ (${OLD}) — không tạo mới, mở khách này`);
    // Dạng +84 cũng nhận ra là SĐT đã có.
    expect((await check(`+84${OLD.slice(1)}`, 'Anh Cũ')).json().data).toMatchObject({ status: 'exists', customer: { id: OLD } });
    expect(await partners(OLD)).toEqual([{ name: 'Anh Cũ', kind: 'customer' }]);
  });

  it('§2 dòng 3: SĐT sai dạng / thiếu tên → báo lỗi, không tạo', async () => {
    for (const bad of ['12345', '090100002', '1901000029', '09010000299']) {
      const r = await check(bad, 'Khách lỗi');
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().error.details).toMatchObject({ reason: 'POS_BAD_PHONE', field: 'phone' });
    }
    const noName = await check('0901000030', '  ');
    expect(noName.statusCode).toBe(400);
    expect(noName.json().error.details).toMatchObject({ reason: 'POS_MISSING_NAME', field: 'name' });
    expect(await partners('0901000030')).toEqual([]);
  });
});
