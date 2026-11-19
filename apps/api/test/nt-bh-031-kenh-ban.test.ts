// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-031 kênh bán hàng (đóng góp)
/**
 * NT-BH-031 — kênh bán hàng (chốt 18/11/2026): danh mục kênh ở module pos (nạp sẵn 14 nguồn của POS cũ), máy bán lấy kênh đang dùng ở
 * khởi động, đơn mang mã kênh (mã lạ / đã ngừng → POS_SALE_SOURCE), phiếu bán BH10 chọn kênh (module phieu-ban hỏi pos qua action đọc),
 * báo cáo "Bán hàng theo kênh" gộp đơn máy bán + phiếu BH10, quyền pos:kenh-ban-lap / -sua / -xoa.
 * Gọi HTTP như máy bán / màn kế toán. Số theo docs/nghiem-thu/ban-hang/NT-BH-031-kenh-ban-hang.md §3.
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
const M = '/api/v1/m/pos';
const PB_M = '/api/v1/m/phieu-ban';
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

let n = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(31_000 + ++n).padStart(12, '0')}`;
const order = (over: Record<string, unknown> = {}) => ({
  id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku: 'SUA031', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 300_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 300_000 }, clientTotal: 300_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-031 — kênh bán hàng', () => {
  let ctx: TestCtx;
  let ktv: TestCtx;
  let xem: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-031-${++k}-${Date.now()}` }) },
  });
  const login = async (email: string, fullName: string, role: string): Promise<TestCtx> => {
    expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName, role, password: 'Pass@12345' })).status).toBe(201);
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
    return { ...ctx, token: r.json().data.token };
  };
  const bootSources = async () => {
    const r = await req(ctx, 'GET', `${M}/bootstrap?branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.saleSources as { code: string; name: string; kind: string }[];
  };
  const sell = async (over: Record<string, unknown> = {}) => {
    const r = await req(ctx, 'POST', `${M}/orders`, order(over));
    expect(r.statusCode, r.body).toBe(201);
    return r.json().data.order as { id: string; code: string; saleSource: string; saleSourceName: string };
  };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-031', trx as never); });
    app = await buildApp();
    ktv = await login('ktv031@ketoan.local', 'Kế toán viên', 'accountant');
    xem = await login('xem031@ketoan.local', 'Người xem', 'viewer');
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng CN02' })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA031', name: 'Sữa 031', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/products/SUA031', { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH031', name: 'Đại lý 031' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SUA031', 500, 'Hộp']]);
    await nhapTon(ctx, 'CN02', [['SUA031', 500, 'Hộp']], '2026-10-01', 'NHAP-TON-CN02');
    await khaiGia(tenantId, [['SUA031', 'Hộp', 300_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1: mở màn Kênh bán hàng lần đầu → có sẵn 14 kênh của POS cũ (đúng thứ tự, loại online / offline)', async () => {
    const r = await req(ctx, 'GET', `${M}/channels`);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d.defaultCode).toBe('GAN_SHOP');
    expect(d.items.map((c: { name: string }) => c.name)).toEqual(['Gần shop', 'Giới thiệu', 'Hotline', 'Zalo', 'Website', 'Khác', 'Facebook CT', 'Facebook CN',
      'IG-Tik Tok CT', 'IG-Tik Tok CN', 'Livestream CT', 'Livestream CN', 'TMĐT-Shopee', 'TMĐT-Lazada']);
    expect(d.items.filter((c: { kind: string }) => c.kind === 'offline').map((c: { code: string }) => c.code)).toEqual(['GAN_SHOP', 'GIOI_THIEU', 'HOTLINE', 'KHAC']);
    expect(d.items.every((c: { active: boolean }) => c.active)).toBe(true);
    // Đọc lại không nạp thêm; kế toán viên (catalog:read) cũng xem được.
    expect((await req(ktv, 'GET', `${M}/channels`)).json().data.items).toHaveLength(14);
    // Máy bán: bootstrap trả kênh từ danh mục thay danh sách viết cứng.
    expect((await bootSources()).slice(0, 3)).toEqual([
      { code: 'GAN_SHOP', name: 'Gần shop', kind: 'offline' }, { code: 'GIOI_THIEU', name: 'Giới thiệu', kind: 'offline' }, { code: 'HOTLINE', name: 'Hotline', kind: 'offline' }]);
  });

  it('§3 dòng 2: kế toán thêm "TMĐT-TikTok Shop" loại online → máy bán thấy kênh mới khi khởi động lại, bán được', async () => {
    const r = await req(ktv, 'POST', `${M}/channels`, { code: 'tmdt_tiktok', name: 'TMĐT-TikTok Shop', kind: 'online' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data).toMatchObject({ code: 'TMDT_TIKTOK', name: 'TMĐT-TikTok Shop', kind: 'online', active: true, sortOrder: 150 });
    const src = await bootSources();
    expect(src.at(-1)).toEqual({ code: 'TMDT_TIKTOK', name: 'TMĐT-TikTok Shop', kind: 'online' });
    expect((await sell({ saleSource: 'TMDT_TIKTOK' }))).toMatchObject({ saleSource: 'TMDT_TIKTOK', saleSourceName: 'TMĐT-TikTok Shop' });
    // Trùng mã / tên → CONFLICT.
    const dup = await req(ktv, 'POST', `${M}/channels`, { code: 'TMDT_TIKTOK', name: 'Khác nữa', kind: 'online' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.details).toMatchObject({ reason: 'POS_SALE_SOURCE_EXISTS', field: 'code' });
    expect((await req(ktv, 'POST', `${M}/channels`, { code: 'ZALO2', name: 'zalo', kind: 'online' })).json().error.details).toMatchObject({ reason: 'POS_SALE_SOURCE_EXISTS', field: 'name' });
    // Sửa tên / loại (mã không đổi).
    const ed = await req(ktv, 'PUT', `${M}/channels/KHAC`, { name: 'Khác (tại quầy)', kind: 'offline', sortOrder: 60 });
    expect(ed.statusCode, ed.body).toBe(200);
    expect(ed.json().data).toMatchObject({ code: 'KHAC', name: 'Khác (tại quầy)' });
  });

  it('§3 dòng 3: ngừng dùng "Hotline" → máy bán không còn chọn được; đơn cũ vẫn hiện "Hotline"; dùng lại được', async () => {
    const old = await sell({ saleSource: 'HOTLINE' });
    expect(old.saleSourceName).toBe('Hotline');
    const stop = await req(ctx, 'POST', `${M}/channels/HOTLINE/stop`, {});
    expect(stop.statusCode, stop.body).toBe(200);
    expect(stop.json().data).toMatchObject({ code: 'HOTLINE', active: false });
    expect((await bootSources()).map((s) => s.code)).not.toContain('HOTLINE');
    const list = await req(ctx, 'GET', `${M}/admin/orders?from=${TODAY}&to=${TODAY}&saleSource=HOTLINE`);
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data).toEqual([expect.objectContaining({ id: old.id, saleSource: 'HOTLINE', saleSourceName: 'Hotline' })]);
    // Kênh đã dùng không có lệnh xoá; danh mục vẫn giữ kênh (đã có đơn).
    const all = (await req(ctx, 'GET', `${M}/channels`)).json().data.items as { code: string; active: boolean; used: boolean }[];
    expect(all.find((c) => c.code === 'HOTLINE')).toMatchObject({ active: false, used: true });
    expect((await req(ctx, 'GET', `${M}/channels?active=1`)).json().data.items.map((c: { code: string }) => c.code)).not.toContain('HOTLINE');
  });

  it('§3 dòng 4: máy bán gửi mã kênh lạ / đã ngừng → từ chối, báo rõ; không gửi → Gần shop; máy cũ gửi TÊN → nhận theo tên', async () => {
    const bad = await req(ctx, 'POST', `${M}/orders`, order({ saleSource: 'KHONG_CO' }));
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_SALE_SOURCE', field: 'saleSource', cause: 'unknown' });
    expect(bad.json().error.message).toContain('Không có kênh bán "KHONG_CO"');
    const stopped = await req(ctx, 'POST', `${M}/orders`, order({ saleSource: 'HOTLINE' }));
    expect(stopped.statusCode).toBe(400);
    expect(stopped.json().error.details).toMatchObject({ reason: 'POS_SALE_SOURCE', cause: 'inactive' });
    expect(stopped.json().error.message).toContain('"Hotline" (HOTLINE) đã ngừng dùng');
    expect(await sell()).toMatchObject({ saleSource: 'GAN_SHOP', saleSourceName: 'Gần shop' });
    expect(await sell({ saleSource: 'Zalo' })).toMatchObject({ saleSource: 'ZALO', saleSourceName: 'Zalo' });
    expect(await sell({ saleSource: 'tai_quay' })).toMatchObject({ saleSource: 'GAN_SHOP' });
    // Đơn bán lúc mất mạng gửi bù: hàng đã bán — kênh đã ngừng vẫn nhận.
    expect(await sell({ saleSource: 'HOTLINE', offlineCreatedAt: `${TODAY}T01:00:00.000Z` })).toMatchObject({ saleSource: 'HOTLINE' });
    // Dùng lại kênh → bán được.
    expect((await req(ktv, 'POST', `${M}/channels/HOTLINE/resume`, {})).json().data).toMatchObject({ active: true });
    expect(await sell({ saleSource: 'HOTLINE' })).toMatchObject({ saleSource: 'HOTLINE' });
  });

  it('§3 dòng 5: BH10 lập phiếu kênh "Livestream CT" → phiếu lưu kênh; BH10 lọc theo kênh được; kênh lạ → từ chối', async () => {
    const doc = await req(ctx, 'POST', `${PB_M}/docs`, {
      docType: 'sale', docDate: TODAY, branchCode: 'CN02', partner: { code: 'KH031' }, saleChannel: 'Livestream CT',
      lines: [{ lineKey: 'L1', sku: 'SUA031', qty: 2, unitPrice: 250_000 }], payments: [{ methodCode: 'TM', amount: 540_000 }],
    });
    expect(doc.statusCode, doc.body).toBe(200);
    const d = doc.json().data;
    expect(d).toMatchObject({ saleChannel: 'LIVESTREAM_CT', saleChannelName: 'Livestream CT' });
    const ok = await req(ctx, 'POST', `${PB_M}/docs/${d.id}/approve`, {});
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data).toMatchObject({ status: 'approved', saleChannel: 'LIVESTREAM_CT' });
    const other = await req(ctx, 'POST', `${PB_M}/docs`, {
      docType: 'sale', docDate: TODAY, branchCode: 'CN02', partner: { code: 'KH031' }, lines: [{ lineKey: 'L1', sku: 'SUA031', qty: 1, unitPrice: 250_000 }],
    });
    expect(other.statusCode, other.body).toBe(200);
    const byChannel = await req(ctx, 'GET', `${PB_M}/docs?docType=sale&saleChannel=LIVESTREAM_CT`);
    expect(byChannel.json().data.map((x: { id: string }) => x.id)).toEqual([d.id]);
    // Phiếu không chọn kênh tính vào kênh mặc định.
    expect((await req(ctx, 'GET', `${PB_M}/docs?docType=sale&saleChannel=GAN_SHOP`)).json().data.map((x: { id: string }) => x.id)).toEqual([other.json().data.id]);
    const bad = await req(ctx, 'POST', `${PB_M}/docs`, {
      docType: 'sale', docDate: TODAY, branchCode: 'CN02', partner: { code: 'KH031' }, saleChannel: 'KENH_LA', lines: [{ lineKey: 'L1', sku: 'SUA031', qty: 1, unitPrice: 250_000 }],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_SALE_SOURCE', field: 'saleChannel' });
  });

  it('§3 dòng 6: báo cáo bán theo kênh trong kỳ — mỗi kênh × cửa hàng: số đơn, doanh thu, trả hàng, thực thu; gồm đơn máy bán và phiếu BH10', async () => {
    const zalo = await sell({ saleSource: 'ZALO' });
    const ret = await req(ctx, 'POST', `${M}/returns`, { id: uuid(), orderId: zalo.id, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách trả' });
    expect(ret.statusCode, ret.body).toBe(201);
    const r = await req(ctx, 'GET', `${M}/reports/channels?from=${TODAY}&to=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as { channelCode: string; branchCode: string; orders: number; posOrders: number; phieuBanDocs: number; revenue: number; returns: number; net: number; kind: string }[];
    const row = (c: string, b: string) => rows.find((x) => x.channelCode === c && x.branchCode === b);
    // Zalo CN01: 2 đơn (Zalo theo tên + đơn vừa bán), trả 1 đơn 300.000.
    expect(row('ZALO', 'CN01')).toMatchObject({ kind: 'online', orders: 2, posOrders: 2, revenue: 600_000, returns: 300_000, net: 300_000 });
    // Phiếu BH10 đã duyệt ở CN02 kênh Livestream CT (phiếu nháp không tính).
    expect(row('LIVESTREAM_CT', 'CN02')).toMatchObject({ orders: 1, phieuBanDocs: 1, posOrders: 0, revenue: 540_000, returns: 0, net: 540_000 });
    expect(row('TMDT_TIKTOK', 'CN01')).toMatchObject({ orders: 1, revenue: 300_000 });
    expect(r.json().meta).toMatchObject({ phieuBan: 'ok' });
    expect(r.json().meta.byKind.all.net).toBe(rows.reduce((s, x) => s + x.net, 0));
    expect(r.json().meta.byKind.online.orders + r.json().meta.byKind.offline.orders).toBe(r.json().meta.byKind.all.orders);
    // Lọc cửa hàng (branchCodes).
    const cn02 = (await req(ctx, 'GET', `${M}/reports/channels?from=${TODAY}&to=${TODAY}&branchCodes=CN02`)).json().data as { branchCode: string }[];
    expect(cn02.length).toBeGreaterThan(0);
    expect(cn02.every((x) => x.branchCode === 'CN02')).toBe(true);
  });

  it('§3 dòng 7: người không có pos:kenh-ban-lap thêm kênh → 403; kế toán viên không ngừng dùng được (pos:kenh-ban-xoa)', async () => {
    const r = await req(xem, 'POST', `${M}/channels`, { code: 'THU_403', name: 'Thử 403', kind: 'online' });
    expect(r.statusCode, r.body).toBe(403);
    expect((await req(xem, 'PUT', `${M}/channels/ZALO`, { name: 'Zalo 2', kind: 'online' })).statusCode).toBe(403);
    expect((await req(ktv, 'POST', `${M}/channels/ZALO/stop`, {})).statusCode).toBe(403);
    expect((await req(ctx, 'GET', `${M}/channels`)).json().data.items.map((c: { code: string }) => c.code)).not.toContain('THU_403');
  });
});
