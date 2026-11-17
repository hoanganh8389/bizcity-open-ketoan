/**
 * NT-BH-025 — CTKM: duyệt chương trình (nháp → người có quyền Duyệt khuyến mại duyệt → phát hành), cảnh báo trùng, hạn mức lượt theo cửa
 * hàng (máy bán + phiếu bán đếm chung, trả cả đơn trả lượt, khoá chống bán đồng thời vượt, đơn mất mạng gửi bù nhận + đánh dấu), báo cáo
 * khuyến mại đã dùng, nhận nháp hàng loạt (công cụ chuyển chương trình cũ của website).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-025 (đóng góp)
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
const PB = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(PB, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const M = '/api/v1/m/pos';
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(25_000_000 + ++seq).padStart(12, '0')}`;
type Ref = { key: string; version: number; hash: string };

describe.skipIf(!HAS)('NT-BH-025 — CTKM duyệt, cảnh báo trùng, hạn mức lượt, báo cáo', () => {
  let ctx: TestCtx;
  let ktt: TestCtx;
  let app: FastifyInstance;
  let k = 0;
  let refs: Ref[] = [];
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-025-${++k}-${Date.now()}` }) },
  });
  const tiered = (key: string, sku: string, pct: number, extra: Record<string, unknown> = {}) => ({
    key, ruleContract: 'sale.promo.tiered@1', effectiveFrom: vnDate(-1), branchCodes: ['CN01'],
    params: { priority: 0, exclusive: false, validFrom: vnDate(-1), validTo: vnDate(10), skus: [sku], basis: 'qty', tiers: [{ min: 1, pct }] }, ...extra,
  });
  /** Duyệt như màn: action duyệt (người duyệt) → POST /api/v1/policies (quyền người duyệt) → ghi bản đã phát hành. */
  const approveAndPublish = async (id: string) => {
    const a = await req(ktt, 'POST', `${M}/promo/drafts/${id}/approve`, { note: 'Đồng ý' });
    expect(a.statusCode, a.body).toBe(200);
    const d = a.json().data;
    const pub = await call(ktt, 'POST', '/api/v1/policies', {
      key: d.key, ruleContract: d.ruleContract, params: d.params, effectiveFrom: d.effectiveFrom, scope: { branchCodes: d.branchCodes }, reason: d.reason || 'NT-BH-025',
    });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    const p = await req(ktt, 'POST', `${M}/promo/drafts/${id}/published`, { version: pub.body.data.version });
    expect(p.statusCode, p.body).toBe(200);
    return p.json().data;
  };
  const order = (qty = 1, over: Record<string, unknown> = {}) => {
    const total = 810_000 * qty;
    return {
      id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
      lines: [{ lineId: 'l1', productId: 'SUA900', sku: 'SUA900', unitName: 'Hộp', unitQty: qty, clientUnitPrice: 900_000, promoDiscount: 90_000 * qty,
        policyRef: { key: 'KM-BAC', version: 1, line: 'discount' } }],
      promotionSelections: [], payment: { mode: 'cash', cashGiven: total }, clientTotal: total, coreVersion: '0.1.0', promotionsVersion: '', policyRefs: refs, ...over,
    };
  };
  const left = async () => {
    const r = await req(ctx, 'GET', `${M}/promo/quota?branch=CN01&keys=KM-BAC`);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.items[0] as { key: string; quota: number; used: number; left: number };
  };
  const deliver = () => dispatchOnce({ consumers: ['pos.promo-use-phieu-ban'], limit: 100 });

  beforeAll(async () => {
    ctx = await setupTenant();
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-025', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'POST', '/api/v1/users', { email: 'ktt025@ketoan.local', fullName: 'Kế toán trưởng', role: 'chief_accountant', password: 'Pass@12345' })).status).toBe(201);
    const login = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'ktt025@ketoan.local', password: 'Pass@12345' } });
    ktt = { ...ctx, token: login.json().data.token };
    const products = [['SUA330', 'Sữa 330'], ['SUA900', 'Sữa 900']];
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: products.map(([sku, name]) => ({ sku, name, unit: 'Hộp' })) })).status).toBeLessThan(300);
    for (const [sku] of products) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SUA330', 100, 'Hộp'], ['SUA900', 100, 'Hộp']]);
    await khaiGia(tenantId, [['SUA330', 'Hộp', 330_000], ['SUA900', 'Hộp', 900_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1–3: lập "Giảm 10 % SUA330" = nháp, chưa áp; người lập không tự duyệt; KTT duyệt → phát hành, nhật ký ghi người duyệt', async () => {
    const c = await req(ctx, 'POST', `${M}/promo/drafts`, { ...tiered('KM10-SUA330', 'SUA330', 10), reason: 'Giảm 10 % SUA330', submit: true });
    expect(c.statusCode, c.body).toBe(200);
    const d = c.json().data.draft;
    expect(d).toMatchObject({ key: 'KM10-SUA330', status: 'pending' });
    const pol = await call(ctx, 'GET', `/api/v1/policies?domain=sale&at=${TODAY}`);
    expect(pol.body.data.items.map((x: { policyKey: string }) => x.policyKey)).not.toContain('KM10-SUA330');

    const self = await req(ctx, 'POST', `${M}/promo/drafts/${d.id}/approve`, {});
    expect(self.statusCode, self.body).toBe(403);
    const pub = await approveAndPublish(d.id);
    expect(pub).toMatchObject({ status: 'published', publishedVersion: 1, approvedByName: 'Kế toán trưởng' });
    const pol2 = await call(ctx, 'GET', `/api/v1/policies?domain=sale&at=${TODAY}`);
    expect(pol2.body.data.items.map((x: { policyKey: string }) => x.policyKey)).toContain('KM10-SUA330');
    const log = (await req(ctx, 'GET', `${M}/promo/drafts/${d.id}`)).json().data.log as { action: string; actorName: string }[];
    expect(log.map((l) => l.action)).toEqual(['create', 'submit', 'approve', 'publish']);
    expect(log.find((l) => l.action === 'approve')!.actorName).toBe('Kế toán trưởng');
  });

  it('§3 dòng 4: lập "Giảm 5 % SUA330" cùng CN01, trùng thời gian → cảnh báo trùng, vẫn lưu; KTT từ chối → sửa gửi lại', async () => {
    const c = await req(ctx, 'POST', `${M}/promo/drafts`, { ...tiered('KM5-SUA330', 'SUA330', 5), reason: 'Giảm 5 % SUA330' });
    expect(c.statusCode, c.body).toBe(200);
    expect(c.json().data.draft.status).toBe('draft');
    expect(c.json().data.overlaps).toEqual([expect.objectContaining({ key: 'KM10-SUA330', source: 'published', name: 'Giảm 10 % SUA330', branches: ['CN01'], skus: ['SUA330'] })]);
    const id = c.json().data.draft.id as string;
    const ov = await req(ktt, 'GET', `${M}/promo/drafts/${id}/overlaps`);
    expect(ov.json().data.map((o: { key: string }) => o.key)).toEqual(['KM10-SUA330']);
    // Mã khác cửa hàng → không trùng.
    const other = await req(ctx, 'POST', `${M}/promo/drafts`, { ...tiered('KM5-CN02', 'SUA330', 5), branchCodes: ['CN02'] });
    expect(other.json().data.overlaps).toEqual([]);

    expect((await req(ktt, 'POST', `${M}/promo/drafts/${id}/reject`, { reason: 'Trùng KM10' })).json().data).toMatchObject({ status: 'rejected', rejectReason: 'Trùng KM10' });
    const again = await req(ctx, 'PUT', `${M}/promo/drafts/${id}`, { ...tiered('KM5-SUA330', 'SUA330', 5), branchCodes: ['CN02'], submit: true });
    expect(again.json().data).toMatchObject({ draft: { status: 'pending' }, overlaps: [] });
    // Mã đã có nháp đang mở → không lập nháp thứ hai.
    const dup = await req(ctx, 'POST', `${M}/promo/drafts`, tiered('KM5-SUA330', 'SUA330', 5));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.details.reason).toBe('POS_PROMO_DRAFT_STATE');
  });

  it('§3 dòng 5: chương trình bậc, hạn mức CN01 = 2 lượt → đơn 1, 2 áp; đơn 3 POS_PROMO_QUOTA; trả cả đơn 1 → đơn sau áp lại được', async () => {
    const c = await req(ctx, 'POST', `${M}/promo/drafts`, { ...tiered('KM-BAC', 'SUA900', 10), reason: 'Bậc SUA900', quota: { branches: { CN01: 2 } }, submit: true });
    expect(c.statusCode, c.body).toBe(200);
    await approveAndPublish(c.json().data.draft.id);
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: 'SUA900', qty: 1, price: 900_000 }], policies: [{ key: 'KM-BAC' }] });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.data.discounts.map((x: { amount: number }) => x.amount)).toEqual([90_000]);
    refs = ev.body.data.policyRefs.map(({ key, version, hash }: Ref) => ({ key, version, hash }));

    const o1 = order();
    expect((await req(ctx, 'POST', `${M}/orders`, o1)).statusCode).toBe(201);
    expect((await req(ctx, 'POST', `${M}/orders`, order())).statusCode).toBe(201);
    expect(await left()).toEqual({ key: 'KM-BAC', quota: 2, used: 2, left: 0 });
    const o3 = await req(ctx, 'POST', `${M}/orders`, order());
    expect(o3.statusCode, o3.body).toBe(400);
    expect(o3.json().error.details).toMatchObject({ reason: 'POS_PROMO_QUOTA', items: [{ key: 'KM-BAC', quota: 2, used: 2 }] });

    // BH10 cùng cửa hàng cũng hết lượt (đếm chung).
    const doc = await req(ctx, 'POST', '/api/v1/m/phieu-ban/docs', {
      docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, payments: [], policyRefs: refs,
      lines: [{ lineKey: 'L1', sku: 'SUA900', qty: 1, unitPrice: 900_000, discount: 90_000, policyRef: { key: 'KM-BAC', version: 1, line: 'discount' } }],
    });
    expect(doc.statusCode, doc.body).toBe(200);
    const docId = doc.json().data.id as string;
    const blocked = await req(ctx, 'POST', `/api/v1/m/phieu-ban/docs/${docId}/approve`, {});
    expect(blocked.statusCode, blocked.body).toBe(400);
    expect(blocked.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_PROMO_QUOTA', items: [{ key: 'KM-BAC', quota: 2, used: 2 }] });

    // Trả cả đơn 1 → trả lượt.
    const r = await req(ctx, 'POST', `${M}/returns`, { id: uuid(), orderId: o1.id, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách trả cả đơn' });
    expect(r.statusCode, r.body).toBe(201);
    expect((await left()).left).toBe(1);

    // Phiếu bán duyệt được, lượt của phiếu tính chung (sự kiện phieu-ban.doc.recorded) → máy bán hết lượt.
    const ok = await req(ctx, 'POST', `/api/v1/m/phieu-ban/docs/${docId}/approve`, {});
    expect(ok.statusCode, ok.body).toBe(200);
    await deliver();
    expect((await left()).left).toBe(0);
    expect((await req(ctx, 'POST', `${M}/orders`, order())).json().error?.details?.reason).toBe('POS_PROMO_QUOTA');
    // Bỏ duyệt phiếu → trả lượt.
    expect((await req(ctx, 'POST', `/api/v1/m/phieu-ban/docs/${docId}/unapprove`, { reason: 'Thử trả lượt' })).statusCode).toBe(200);
    await deliver();
    expect((await left()).left).toBe(1);
  });

  it('lệch chuẩn: hai máy cùng lúc áp chương trình còn 1 lượt → một đơn nhận, đơn kia POS_PROMO_QUOTA; đơn mất mạng gửi bù vẫn nhận, đánh dấu', async () => {
    const [a, b] = await Promise.all([req(ctx, 'POST', `${M}/orders`, order()), req(ctx, 'POST', `${M}/orders`, order())]);
    expect([a.statusCode, b.statusCode].sort(), `${a.body} ${b.body}`).toEqual([201, 400]);
    const bad = a.statusCode === 400 ? a : b;
    expect(bad.json().error.details.reason).toBe('POS_PROMO_QUOTA');
    const off = await req(ctx, 'POST', `${M}/orders`, order(1, { offlineCreatedAt: `${TODAY}T03:00:00.000Z` }));
    expect(off.statusCode, off.body).toBe(201);
    expect(off.json().data.order.promoQuotaOffline).toEqual([{ key: 'KM-BAC', quota: 2, used: 2 }]);
  });

  it('§3 dòng 6: báo cáo khuyến mại đã dùng theo chương trình × cửa hàng × kỳ: số đơn, tiền giảm, lượt; bấm xem đơn', async () => {
    const r = await req(ctx, 'GET', `${M}/promo/report?from=${TODAY}&to=${TODAY}&branches=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    const row = (r.json().data as { key: string }[]).find((x) => x.key === 'KM-BAC');
    // Còn tính: đơn 2, đơn đồng thời được nhận, đơn mất mạng = 3; đã trả lượt: đơn 1 (trả cả đơn), phiếu bán (bỏ duyệt).
    expect(row).toMatchObject({ key: 'KM-BAC', name: 'Bậc SUA900', branchCode: 'CN01', orders: 3, released: 2, discount: 270_000, used: 3, quota: 2, left: 0, offlineOver: 1 });
    const list = await req(ctx, 'GET', `${M}/promo/report/orders?key=KM-BAC&branch=CN01&from=${TODAY}&to=${TODAY}`);
    const rows = list.json().data as { source: string; released: boolean; releaseReason: string; code: string }[];
    expect(rows).toHaveLength(5);
    expect(rows.filter((x) => x.released).map((x) => x.releaseReason).sort()).toEqual(['return', 'unapprove']);
    expect(rows.every((x) => x.code)).toBe(true);
  });

  it('§3 dòng 7: nhận nháp hàng loạt (chuyển chương trình cũ) — tạo nháp chưa áp; chạy lại không trùng', async () => {
    const items = [
      { sourceRef: 'tgs_selling_policy:11', ...tiered('TSP-11', 'SUA330', 3), reason: 'Chương trình cũ 11' },
      { sourceRef: 'tgs_selling_policy:12', ...tiered('TSP-12', 'SUA900', 4), reason: 'Chương trình cũ 12', quota: { perBranch: 50 } },
    ];
    const a = await req(ctx, 'POST', `${M}/promo/drafts/import`, { source: 'tgs_selling_policy', items });
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json().data.created.map((x: { key: string }) => x.key)).toEqual(['TSP-11', 'TSP-12']);
    const b = await req(ctx, 'POST', `${M}/promo/drafts/import`, { source: 'tgs_selling_policy', items });
    expect(b.json().data).toMatchObject({ created: [], skipped: [{ key: 'TSP-11', reason: 'đã chuyển lần trước' }, { key: 'TSP-12', reason: 'đã chuyển lần trước' }] });
    const list = await req(ctx, 'GET', `${M}/promo/drafts?status=draft`);
    expect((list.json().data as { key: string; source: string }[]).filter((x) => x.source === 'migrate').map((x) => x.key).sort()).toEqual(['TSP-11', 'TSP-12']);
  });
});
