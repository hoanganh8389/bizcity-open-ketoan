// [2026-11-18 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-030 trả lại hàng bán đợt 3 (đóng góp)
/**
 * NT-BH-030 — trả lại hàng bán đợt 3 (chốt 18/11/2026): trả ở cửa hàng khác cùng MST chi nhánh (Q1), quá hạn gửi yêu cầu trả quá hạn,
 * kế toán trưởng duyệt / từ chối (Q2), hạn trả riêng từng shop (Q3), phiếu trả BH11 trả cả phiếu bán gốc thì trả lượt khuyến mại (Q4).
 * Gọi HTTP như máy bán / màn kế toán vào module pos, phieu-ban. MST chi nhánh khai qua API danh mục chi nhánh (MST giả, đúng khuôn).
 * Số theo docs/nghiem-thu/ban-hang/NT-BH-030-tra-hang-dot-3.md §3.
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
const PB = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(PB, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const M = '/api/v1/m/pos';
const DAYS_BY_SHOP = 'bizcity.pos.return_days_by_shop';
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
const YESTERDAY = vnDate(-1);
/** MST giả (đúng khuôn 10 số) — repo công khai, không dùng MST thật. CN01, CN02 cùng MST; CN03 MST khác; CN04 chưa khai. */
const MST = '0100000030';
const MST_KHAC = '0100000031';

let n = 0;
const uuid = (p = '0') => `0193a1b2-0000-7000-8000-${p}${String(30_000 + ++n).padStart(11, '0')}`;
type Ref = { key: string; version: number; hash: string };
// Đơn mẫu (như NT-BH-024): SUA400 2 × 324.000 (R08) + TA01 215.000 (R10) = 863.000, tiền mặt, bán ở CN01.
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, branchCode: 'CN01', businessDate: YESTERDAY, shiftId: `ngay-${YESTERDAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [
    { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 324_000 },
    { lineId: 'l2', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 },
  ],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 900_000 }, clientTotal: 863_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-030 — trả lại hàng bán đợt 3', () => {
  let ctx: TestCtx;
  let ktt: TestCtx;
  let ktv: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-030-${++k}-${Date.now()}` }) },
  });
  const post = (url: string, payload: unknown, who = ctx) => req(who, 'POST', `${M}${url}`, payload);
  const get = (url: string, who = ctx) => req(who, 'GET', `${M}${url}`);
  const setting = async (key: string, value: unknown) => {
    const r = await req(ctx, 'PUT', `/api/v1/settings/values/${key}`, { key, value });
    expect(r.statusCode, r.body).toBeLessThan(300);
  };
  const login = async (email: string, fullName: string, role: string): Promise<TestCtx> => {
    expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName, role, password: 'Pass@12345' })).status).toBe(201);
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
    return { ...ctx, token: r.json().data.token };
  };
  const sell = async (id: string, over: Record<string, unknown> = {}) => {
    const r = await post('/orders', order(id, over));
    expect(r.statusCode, r.body).toBe(201);
    return r.json().data.order as { code: string };
  };
  /** Lùi ngày bán của đơn (bảng của module pos) để thử hạn trả — không chạm sổ. */
  const ageOrder = (id: string, days: number) => sql`UPDATE mod_pos.orders SET business_date = ${vnDate(-days)}::date WHERE order_id = ${id}`.execute(db);
  const ret = (orderId: string, branchCode: string, lines: unknown[], over: Record<string, unknown> = {}) =>
    post('/returns', { id: uuid('r'), orderId, branchCode, lines, refundMethod: 'TM', reason: 'Khách trả hàng', ...over });
  const stockAt = async (branch: string, sku: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = ${branch} AND sku = ${sku}`.execute(db)).rows[0]?.q ?? 0);
  const docCount = async () => Number((await sql<{ n: string }>`
    SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key LIKE 'pos:%:sale_return:%'`.execute(db)).rows[0]!.n);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-030', trx as never); });
    app = await buildApp();
    ktt = await login('ktt030@ketoan.local', 'Kế toán trưởng', 'chief_accountant');
    ktv = await login('ktv030@ketoan.local', 'Kế toán viên', 'accountant');
    // Chi nhánh và MST chi nhánh qua API danh mục chi nhánh (DM02).
    expect((await call(ctx, 'PATCH', '/api/v1/branches/CN01', { taxCode: MST })).status).toBe(200);
    for (const [code, taxCode] of [['CN02', MST], ['CN03', MST_KHAC], ['CN04', '']] as const) {
      expect((await call(ctx, 'POST', '/api/v1/branches', { code, name: `Cửa hàng ${code}`, ...(taxCode ? { taxCode } : {}) })).status).toBe(201);
    }
    for (const b of ['CN01', 'CN02', 'CN03', 'CN04']) {
      expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: `${b}-K1`, branchCode: b, name: `Kho bán ${b}`, isDefault: true })).status).toBe(201);
    }
    const products = [['SUA400', 'Sữa bột 400g', 'R08'], ['TA01', 'Tã quần L', 'R10'], ['SUA900', 'Sữa 900', 'R08']] as const;
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: products.map(([sku, name]) => ({ sku, name, unit: sku === 'TA01' ? 'Gói' : 'Hộp' })) })).status).toBeLessThan(300);
    for (const [sku, , tax] of products) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: tax })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SUA400', 1000, 'Hộp'], ['TA01', 1000, 'Gói'], ['SUA900', 100, 'Hộp']]);
    await khaiGia(tenantId, [['SUA400', 'Hộp', 324_000], ['TA01', 'Gói', 215_000], ['SUA900', 'Hộp', 900_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1: CN01, CN02 cùng MST — mua ở CN01, trả ở CN02: phiếu trả ở CN02 tham chiếu đơn CN01, tồn CN02 tăng, tiền chi từ két CN02', async () => {
    const A = uuid();
    const sold = await sell(A);
    // Máy bán CN02 tra mã phiếu của CN01 (cùng MST) được.
    const look = await get(`/orders/lookup?code=${sold.code}&branch=CN02`);
    expect(look.statusCode, look.body).toBe(200);
    expect(look.json().data).toMatchObject({ id: A });
    const able = await get(`/orders/${sold.code}/returnable?branch=CN02`);
    expect(able.statusCode, able.body).toBe(200);
    expect(able.json().data).toMatchObject({ blockers: [], late: false, orderBranchCode: 'CN01', days: 3, approvals: [] });

    expect((await post('/shifts/open', { openingCash: 1_000_000, branchCode: 'CN02' })).statusCode).toBe(201);
    const ta = await stockAt('CN02', 'TA01');
    const r = await ret(A, 'CN02', [{ lineId: 'l2', qty: 1 }]);
    expect(r.statusCode, r.body).toBe(201);
    const snap = r.json().data;
    expect(snap).toMatchObject({ orderId: A, orderCode: sold.code, branch: { code: 'CN02' }, orderBranchCode: 'CN01', refundTotal: 215_000 });
    expect(snap).not.toHaveProperty('approval');
    const ev = (await sql<{ branch: string; p: { originalDocKey: string; branchCode: string; payments: { methodCode: string; amount: number }[] }; status: string }>`
      SELECT e.status, e.payload AS p, b.code AS branch FROM accounting_events e JOIN branches b ON b.id = e.branch_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_key = ${`pos:CN02:sale_return:${snap.id}`}`.execute(db)).rows[0];
    const orig = (await sql<{ doc_key: string }>`SELECT doc_key FROM mod_pos.orders WHERE order_id = ${A}`.execute(db)).rows[0]!;
    expect(ev).toMatchObject({ status: 'posted', branch: 'CN02', p: { branchCode: 'CN02', originalDocKey: orig.doc_key, payments: [{ methodCode: 'TM', amount: 215_000 }] } });
    expect(await stockAt('CN02', 'TA01')).toBe(ta + 1);
    const shift = (await get('/shifts/current?branch=CN02')).json().data;
    expect(shift).toMatchObject({ returnCount: 1, cashRefunds: 215_000, expectedCash: 785_000 });
    // BH14 lọc theo cửa hàng nhận CN02.
    const list = await get(`/admin/returns?branches=CN02&q=${snap.code}`, ktt);
    expect(list.json().data).toEqual([expect.objectContaining({ code: snap.code, orderCode: sold.code, branchCode: 'CN02' })]);
  });

  it('§3 dòng 2: CN03 khác MST → "khác mã số thuế"; CN04 chưa khai MST → "chưa khai MST"; không lập chứng từ', async () => {
    const A = uuid();
    const sold = await sell(A);
    const blk = await get(`/orders/${A}/returnable?branch=CN03`);
    expect(blk.json().data.blockers).toEqual([expect.objectContaining({ code: 'OTHER_SHOP' })]);
    expect(blk.json().data.blockers[0].message).toContain('khác mã số thuế');
    // Tra mã phiếu ở CN03 (khác MST) không thấy đơn của CN01.
    expect((await get(`/orders/lookup?code=${sold.code}&branch=CN03`)).statusCode).toBe(404);
    const before = await docCount();
    const diff = await ret(A, 'CN03', [{ lineId: 'l2', qty: 1 }]);
    expect(diff.statusCode, diff.body).toBe(409);
    expect(diff.json().error.details).toMatchObject({ reason: 'POS_RETURN_OTHER_SHOP', orderBranch: 'CN01', cause: 'TAX_CODE_DIFFERENT' });
    expect(diff.json().error.message).toContain('khác mã số thuế');
    const none = await ret(A, 'CN04', [{ lineId: 'l2', qty: 1 }]);
    expect(none.statusCode, none.body).toBe(409);
    expect(none.json().error.details).toMatchObject({ reason: 'POS_RETURN_OTHER_SHOP', cause: 'TAX_CODE_MISSING', branches: ['CN04'] });
    expect(none.json().error.message).toContain('chưa khai MST');
    expect(await docCount()).toBe(before);
  });

  it('§3 dòng 3: trả trong hạn (≤ 3 ngày) như hiện nay, không cần duyệt; gửi yêu cầu trả quá hạn cho đơn còn hạn → báo không cần', async () => {
    const A = uuid();
    await sell(A);
    await ageOrder(A, 3);
    const r = await ret(A, 'CN01', [{ lineId: 'l1', qty: 1 }]);
    expect(r.statusCode, r.body).toBe(201);
    const ap = await post('/return-approvals', { id: uuid('a'), orderId: A, branchCode: 'CN01', lines: [{ lineId: 'l2', qty: 1 }], refundMethod: 'TM', reason: 'Thử' });
    expect(ap.statusCode, ap.body).toBe(409);
    expect(ap.json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_STATE', status: 'not_late' });
  });

  it('§3 dòng 4: CN02 khai hạn riêng 7 ngày — trả ngày thứ 5 ở CN02 trong hạn; CN01 (mặc định 3) quá hạn', async () => {
    const A = uuid();
    await sell(A);
    await ageOrder(A, 5);
    await setting(DAYS_BY_SHOP, ['CN02=7']);
    const s = (await get('/admin/settings', ktt)).json().data;
    expect(s.values).toMatchObject({ returnDays: 3, returnDaysByShop: ['CN02=7'] });
    expect(s.keys.returnDaysByShop).toBe(DAYS_BY_SHOP);
    expect((await get('/bootstrap?branch=CN02')).json().data.returnPolicy).toEqual({ days: 7, crossShop: 'same_tax_code' });
    expect((await get(`/orders/${A}/returnable?branch=CN01`)).json().data).toMatchObject({ late: true, days: 3 });
    expect((await get(`/orders/${A}/returnable?branch=CN02`)).json().data).toMatchObject({ late: false, days: 7 });
    const r = await ret(A, 'CN02', [{ lineId: 'l1', qty: 1 }]);
    expect(r.statusCode, r.body).toBe(201);
  });

  it('§3 dòng 5–8: quá hạn → gửi yêu cầu; chưa duyệt không lập được; người gửi / người không có quyền không duyệt được; KTT duyệt → lập đúng nội dung, nhật ký', async () => {
    const A = uuid();
    const sold = await sell(A);
    await ageOrder(A, 10);
    const lines = [{ lineId: 'l1', qty: 1, condition: 'good' }, { lineId: 'l2', qty: 1 }];
    const before = await docCount();
    const late = await ret(A, 'CN01', lines);
    expect(late.statusCode, late.body).toBe(400);
    expect(late.json().error.details.reason).toBe('POS_RETURN_EXPIRED');

    const id = uuid('a');
    const body = { id, orderId: A, branchCode: 'CN01', lines, refundMethod: 'TM', reason: 'Khách đi công tác về muộn' };
    const ap = await post('/return-approvals', body);
    expect(ap.statusCode, ap.body).toBe(201);
    expect(ap.json().data).toMatchObject({ id, status: 'pending', orderCode: sold.code, branchCode: 'CN01', refundTotal: 539_000, requestedByName: expect.any(String) });
    // Gửi lại cùng id cùng nội dung → yêu cầu cũ; yêu cầu thứ hai cho cùng đơn → báo đang có yêu cầu mở.
    expect((await post('/return-approvals', body)).json().data).toMatchObject({ id, status: 'pending' });
    const dup = await post('/return-approvals', { ...body, id: uuid('a') });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_STATE', status: 'pending', approvalId: id });

    // §3 dòng 5: chưa duyệt → không hoàn tất được.
    const wait = await ret(A, 'CN01', lines, { approvalId: id });
    expect(wait.statusCode, wait.body).toBe(409);
    expect(wait.json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_STATE', status: 'pending' });
    expect((await get(`/orders/${A}/returnable?branch=CN01`)).json().data.approvals).toEqual([expect.objectContaining({ id, status: 'pending' })]);

    // §3 dòng 8: người gửi (thu ngân) không tự duyệt; kế toán viên không có quyền "Duyệt trả quá hạn".
    expect((await post(`/return-approvals/${id}/approve`, {})).statusCode).toBe(403);
    expect((await post(`/return-approvals/${id}/approve`, {}, ktv)).statusCode).toBe(403);
    expect(await docCount()).toBe(before);

    // §3 dòng 6: kế toán trưởng duyệt.
    const ok = await post(`/return-approvals/${id}/approve`, { note: 'Đồng ý, hàng còn nguyên' }, ktt);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data).toMatchObject({ status: 'approved', decidedByName: 'Kế toán trưởng', decisionNote: 'Đồng ý, hàng còn nguyên' });
    expect((await post(`/return-approvals/${id}/reject`, { reason: 'Đổi ý' }, ktt)).json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_STATE', status: 'approved' });
    // Khác nội dung đã duyệt → không lập.
    const wrong = await ret(A, 'CN01', [{ lineId: 'l1', qty: 2 }, { lineId: 'l2', qty: 1 }], { approvalId: id });
    expect(wrong.statusCode, wrong.body).toBe(400);
    expect(wrong.json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_MISMATCH', approvalId: id });
    const done = await ret(A, 'CN01', [{ lineId: 'l2', qty: 1 }, { lineId: 'l1', qty: 1 }], { approvalId: id });
    expect(done.statusCode, done.body).toBe(201);
    expect(done.json().data).toMatchObject({ refundTotal: 539_000, approval: { id, by: 'Kế toán trưởng', note: 'Đồng ý, hàng còn nguyên' } });
    expect(await docCount()).toBe(before + 1);
    // Yêu cầu đã dùng: nhật ký gửi → duyệt → lập phiếu; không dùng lại cho phiếu thứ hai.
    const g = (await get(`/return-approvals/${id}`)).json().data;
    expect(g).toMatchObject({ status: 'used', returnId: done.json().data.id, decidedByName: 'Kế toán trưởng' });
    expect(g.log.map((l: { action: string }) => l.action)).toEqual(['submit', 'approve', 'use']);
    expect(g.log[1]).toMatchObject({ actorName: 'Kế toán trưởng', note: 'Đồng ý, hàng còn nguyên' });
    const again = await ret(A, 'CN01', [{ lineId: 'l1', qty: 1 }], { approvalId: id });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_STATE', status: 'used' });
    // Màn kế toán: danh sách yêu cầu + BH14 cột người duyệt.
    const adm = await get('/admin/return-approvals?branches=CN01', ktt);
    expect(adm.statusCode, adm.body).toBe(200);
    expect(adm.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ id, status: 'used', log: expect.any(Array) })]));
    const bh14 = await get(`/admin/returns?q=${done.json().data.code}&from=${TODAY}&to=${TODAY}`, ktt);
    expect(bh14.json().data[0]).toMatchObject({ approvedBy: 'Kế toán trưởng', approvalNote: 'Đồng ý, hàng còn nguyên' });
  });

  it('§3 dòng 7: kế toán trưởng từ chối → máy bán thấy "bị từ chối" kèm lý do; không lập được phiếu', async () => {
    const A = uuid();
    await sell(A);
    await ageOrder(A, 10);
    const id = uuid('a');
    expect((await post('/return-approvals', { id, orderId: A, branchCode: 'CN01', lines: [{ lineId: 'l2', qty: 1 }], refundMethod: 'TM', reason: 'Khách muốn trả' })).statusCode).toBe(201);
    expect((await post(`/return-approvals/${id}/reject`, {}, ktt)).statusCode).toBe(400); // phải ghi lý do
    const no = await post(`/return-approvals/${id}/reject`, { reason: 'Quá 10 ngày, hàng đã mở' }, ktt);
    expect(no.statusCode, no.body).toBe(200);
    expect(no.json().data).toMatchObject({ status: 'rejected', statusText: 'bị từ chối', rejectReason: 'Quá 10 ngày, hàng đã mở', decidedByName: 'Kế toán trưởng' });
    expect((await get(`/orders/${A}/returnable?branch=CN01`)).json().data.approvals[0]).toMatchObject({ id, status: 'rejected', rejectReason: 'Quá 10 ngày, hàng đã mở' });
    const before = await docCount();
    const r = await ret(A, 'CN01', [{ lineId: 'l2', qty: 1 }], { approvalId: id });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().error.details).toMatchObject({ reason: 'POS_RETURN_APPROVAL_STATE', status: 'rejected', rejectReason: 'Quá 10 ngày, hàng đã mở' });
    expect(r.json().error.message).toContain('bị từ chối');
    expect(await docCount()).toBe(before);
  });

  it('§3 dòng 9: BH11 trả cả phiếu bán có khuyến mại hạn mức 2 lượt (đã dùng 2) → còn 1 lượt; trả một phần không trả lượt; bỏ duyệt phiếu trả → lấy lại lượt', async () => {
    const key = 'KM-030';
    const draft = await post('/promo/drafts', {
      key, ruleContract: 'sale.promo.tiered@1', effectiveFrom: vnDate(-1), branchCodes: ['CN01'], reason: 'Giảm 10 % SUA900', quota: { branches: { CN01: 2 } }, submit: true,
      params: { priority: 0, exclusive: false, validFrom: vnDate(-1), validTo: vnDate(10), skus: ['SUA900'], basis: 'qty', tiers: [{ min: 1, pct: 10 }] },
    });
    expect(draft.statusCode, draft.body).toBe(200);
    const did = draft.json().data.draft.id as string;
    const a = (await post(`/promo/drafts/${did}/approve`, {}, ktt)).json().data;
    const pub = await call(ktt, 'POST', '/api/v1/policies', { key: a.key, ruleContract: a.ruleContract, params: a.params, effectiveFrom: a.effectiveFrom, scope: { branchCodes: a.branchCodes }, reason: 'NT-BH-030' });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    expect((await post(`/promo/drafts/${did}/published`, { version: pub.body.data.version }, ktt)).statusCode).toBe(200);
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: 'SUA900', qty: 1, price: 900_000 }], policies: [{ key }] });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const refs = ev.body.data.policyRefs.map(({ key: k2, version, hash }: Ref) => ({ key: k2, version, hash }));
    const left = async () => (await get(`/promo/quota?branch=CN01&keys=${key}`)).json().data.items[0] as { used: number; left: number };
    const deliver = () => dispatchOnce({ consumers: ['pos.promo-use-phieu-ban'], limit: 100 });
    const PB_M = '/api/v1/m/phieu-ban';

    // Hai phiếu bán BH10, mỗi phiếu 2 hộp SUA900 áp KM-030 → dùng 2 lượt.
    const sales: { id: string; docNo: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const d = await req(ctx, 'POST', `${PB_M}/docs`, {
        docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, payments: [], policyRefs: refs,
        lines: [{ lineKey: 'L1', sku: 'SUA900', qty: 2, unitPrice: 900_000, discount: 180_000, policyRef: { key, version: 1, line: 'discount' } }],
      });
      expect(d.statusCode, d.body).toBe(200);
      const id = d.json().data.id as string;
      const ok = await req(ctx, 'POST', `${PB_M}/docs/${id}/approve`, {});
      expect(ok.statusCode, ok.body).toBe(200);
      sales.push({ id, docNo: ok.json().data.docNo });
    }
    await deliver();
    expect(await left()).toMatchObject({ used: 2, left: 0 });

    const retDoc = async (docNo: string, qty: number) => {
      const d = await req(ctx, 'POST', `${PB_M}/docs`, {
        docType: 'sale_return', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, originalDocNo: docNo, payments: [],
        lines: [{ lineKey: 'R1', sku: 'SUA900', qty, unitPrice: 810_000 }],
      });
      expect(d.statusCode, d.body).toBe(200);
      const id = d.json().data.id as string;
      const ok = await req(ctx, 'POST', `${PB_M}/docs/${id}/approve`, {});
      expect(ok.statusCode, ok.body).toBe(200);
      await deliver();
      return id;
    };
    // Trả một phần phiếu 2 (1/2 hộp) → không trả lượt.
    await retDoc(sales[1]!.docNo, 1);
    expect(await left()).toMatchObject({ used: 2, left: 0 });
    // Trả cả phiếu 1 → trả lượt: còn 1.
    const full = await retDoc(sales[0]!.docNo, 2);
    expect(await left()).toMatchObject({ used: 1, left: 1 });
    const rows = (await get(`/promo/report/orders?key=${key}&branch=CN01&from=${TODAY}&to=${TODAY}`)).json().data as { refId: string; released: boolean; releaseReason: string }[];
    expect(rows.find((r) => r.refId === sales[0]!.id)).toMatchObject({ released: true, releaseReason: 'return' });
    expect(rows.find((r) => r.refId === sales[1]!.id)).toMatchObject({ released: false });
    // Bỏ duyệt phiếu trả cả phiếu → lượt tính lại.
    expect((await req(ctx, 'POST', `${PB_M}/docs/${full}/unapprove`, { reason: 'Lập nhầm' })).statusCode).toBe(200);
    await deliver();
    expect(await left()).toMatchObject({ used: 2, left: 0 });
  });
});
