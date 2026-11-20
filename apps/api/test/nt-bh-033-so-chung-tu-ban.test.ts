/**
 * NT-BH-033 — chứng từ bán vào sổ chứng từ chung (business_documents) bằng trigger trong migration của module pos / phieu-ban / voucher /
 * loyalty; trigger chạy dưới vai trò mod_<key>_rw lúc phục vụ (mọi lệnh ở đây đi qua API của module → ctx.data.module) nhờ migration lõi
 * 0167 (bizcity_doc_put / bizcity_doc_link SECURITY DEFINER + kiểm đơn vị của phiên).
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-033 (đóng góp)
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

const MOD = (k: string) => fileURLToPath(new URL(`../../../modules/${k}/`, import.meta.url));
const KEYS = ['pos', 'phieu-ban', 'voucher', 'loyalty'] as const;
const HAS = KEYS.every((k) => existsSync(path.join(MOD(k), 'bizcity.module.json')));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const MOD_READS: Record<(typeof KEYS)[number], string[]> = {
  pos: READS, 'phieu-ban': READS,
  voucher: ['bizcity_read.partners', 'bizcity_read.products', 'bizcity_read.payment_methods'],
  loyalty: ['bizcity_read.partners', 'bizcity_read.branches'],
};
const SKU = 'SUA330';
const vnDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() + offset * 86_400_000));
const TODAY = vnDay();
const ID = (n: number) => `0193a1b2-0000-7000-8000-0000003300${String(n).padStart(2, '0')}`;
const posOrder = (id: string, qty: number, payment: unknown) => ({
  id, branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Hộp', unitQty: qty, clientUnitPrice: 330_000 }], promotionSelections: [],
  payment, clientTotal: qty * 330_000, coreVersion: '0.1.0', promotionsVersion: '',
});

type Doc = { doc_ref: string; module: string; doc_type: string; doc_no: string; status: string; status_raw: string; version: number; title: string };

describe.skipIf(!HAS)('NT-BH-033 — chứng từ bán vào sổ chứng từ chung', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-033-${++k}-${Date.now()}` }) },
  });
  const ok = async (method: 'POST' | 'PUT', url: string, payload: unknown) => {
    const r = await req(method, url, payload);
    expect(r.statusCode, r.body).toBeLessThan(300);
    return r.json().data;
  };
  const doc = async (ref: string) => (await sql<Doc>`SELECT doc_ref, module, doc_type, doc_no, status, status_raw, version, title FROM business_documents
    WHERE tenant_id = ${tenantId} AND doc_ref = ${ref}`.execute(db)).rows[0];
  const links = async (ref: string) => (await sql<{ to_ref: string; role: string }>`SELECT to_ref, role FROM document_links
    WHERE tenant_id = ${tenantId} AND from_ref = ${ref} ORDER BY role, to_ref`.execute(db)).rows;
  const setting = async (key: string, value: unknown) => {
    const r = await req('PUT', `/api/v1/settings/values/${key}`, { key, value });
    expect(r.statusCode, r.body).toBeLessThan(300);
  };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
    for (const key of KEYS) await runModuleMigrations(key, path.join(MOD(key), 'migrations'), { reads: MOD_READS[key] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-033', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 330', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH033', name: 'Đại lý 033', phone: '0909033033', paymentTermDays: 30 })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-K1', branchCode: 'CN01', name: 'Kho bán CN01', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-KCB', branchCode: 'CN01', name: 'Kho chờ bán CN01', typeCode: 'KCB' })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-KHG', branchCode: 'CN01', name: 'Kho hàng gửi bán CN01', typeCode: 'KHG' })).status).toBe(201);
    await nhapTon(ctx, 'CN01', [[SKU, 100, 'Hộp']]);
    await khaiGia(tenantId, [[SKU, 'Hộp', 330_000]]);
    await setting('bizcity.phieu_ban.hold_warehouses', ['CN01=CN01-KCB']);
    await setting('bizcity.phieu_ban.ship_warehouses', ['CN01=CN01-KHG']);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1: bán một đơn máy bán → pos.order sales.order Hoàn tất, phiên bản 1, liên kết ledger tới sự việc kế toán', async () => {
    const o = (await ok('POST', '/api/v1/m/pos/orders', posOrder(ID(1), 1, { mode: 'cash', cashGiven: 330_000 }))).order;
    expect(o.status).toBe('completed');
    expect(await doc(`pos.order:${ID(1)}`)).toMatchObject({ module: 'pos', doc_type: 'sales.order', doc_no: o.code, status: 'done', status_raw: 'completed', version: 1, title: 'Đơn bán máy POS' });
    const ledger = `pos:CN01:sale:${ID(1)}`;
    expect((await sql`SELECT 1 FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${ledger}`.execute(db)).rows).toHaveLength(1);
    expect(await links(`pos.order:${ID(1)}`)).toEqual([{ to_ref: `ledger.event:${ledger}`, role: 'ledger' }]);
  });

  it('§3 dòng 2: đơn chờ QR → Đang thực hiện; xác nhận tiền → Hoàn tất, phiên bản không tăng', async () => {
    await ok('POST', '/api/v1/m/pos/orders', posOrder(ID(2), 2, { mode: 'qr' }));
    const ref = `pos.order:${ID(2)}`;
    expect(await doc(ref)).toMatchObject({ status: 'in_progress', status_raw: 'awaiting_payment', version: 1 });
    expect((await ok('POST', `/api/v1/m/pos/orders/${ID(2)}/qr/confirm`, { source: 'bank', amount: 660_000, paymentRef: 'TT-033' })).status).toBe('completed');
    expect(await doc(ref)).toMatchObject({ status: 'done', status_raw: 'completed', version: 1 });
  });

  it('§3 dòng 3: trả hàng → pos.return sales.return Hoàn tất, liên kết source tới đơn gốc + ledger', async () => {
    const r = await ok('POST', '/api/v1/m/pos/returns', { id: ID(3), orderId: ID(1), branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
    const ref = `pos.return:${ID(3)}`;
    expect(await doc(ref)).toMatchObject({ module: 'pos', doc_type: 'sales.return', doc_no: r.code, status: 'done', version: 1 });
    expect(await links(ref)).toEqual([
      { to_ref: `ledger.event:pos:CN01:sale_return:${ID(3)}`, role: 'ledger' },
      { to_ref: `pos.order:${ID(1)}`, role: 'source' },
    ]);
    // HT18: liên kết có tên dễ đọc, đơn gốc mở được.
    const det = await call<{ data: { links: { role: string; label: string; openable: boolean }[] } }>(ctx, 'GET', `/api/v1/business-documents/detail?docRef=${ref}`);
    expect(det.status).toBe(200);
    expect(det.body.data.links.find((l) => l.role === 'source')).toMatchObject({ label: expect.stringMatching(/^Đơn bán máy POS /), openable: true });
  });

  let orderId = '';
  let shipDoc = '';
  it('§3 dòng 4: đơn đặt hàng nháp → gửi → giao một phần → đóng: Nháp → Đã duyệt → Đang thực hiện → Hoàn tất; đổi nội dung thì phiên bản tăng', async () => {
    const body = { orderDate: TODAY, branchCode: 'CN01', validUntil: vnDay(3), partner: { code: 'KH033' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 10, unitPrice: 330_000 }] };
    const o = (await ok('POST', '/api/v1/m/phieu-ban/orders', body)).order;
    orderId = o.id;
    const ref = `phieu-ban.order:${orderId}`;
    expect(await doc(ref)).toMatchObject({ module: 'phieu-ban', doc_type: 'sales.order', doc_no: o.orderNo, status: 'draft', version: 1, title: 'Đơn đặt hàng bán' });
    await ok('PUT', `/api/v1/m/phieu-ban/orders/${orderId}`, { ...body, lines: [{ lineKey: 'L1', sku: SKU, qty: 8, unitPrice: 330_000 }] });
    expect(await doc(ref)).toMatchObject({ status: 'draft', version: 2 });
    await ok('POST', `/api/v1/m/phieu-ban/orders/${orderId}/send`, {});
    expect(await doc(ref)).toMatchObject({ status: 'approved', status_raw: 'open', version: 2 });
    const sh = (await ok('POST', `/api/v1/m/phieu-ban/orders/${orderId}/shipments`, { lines: [{ lineKey: 'L1', qty: 3 }] })).shipments[0];
    expect(await doc(ref)).toMatchObject({ status: 'in_progress', status_raw: 'open', version: 2 });
    await ok('POST', `/api/v1/m/phieu-ban/orders/${orderId}/shipments/${sh.id}/status`, { status: 'shipping' });
    const done = (await ok('POST', `/api/v1/m/phieu-ban/orders/${orderId}/shipments/${sh.id}/status`, { status: 'delivered' })).shipments[0];
    expect(done.saleDocId).toBeTruthy();
    expect(await doc(ref)).toMatchObject({ status: 'in_progress', version: 2 });
    shipDoc = done.saleDocId as string;
    await ok('POST', `/api/v1/m/phieu-ban/orders/${orderId}/close`, { note: 'Khách không lấy phần còn lại' });
    expect(await doc(ref)).toMatchObject({ status: 'done', status_raw: 'closed', version: 2 });
  });

  it('§3 dòng 5: phiếu bán BH10 từ chuyến giao → sales.invoice nháp, liên kết source tới đơn; duyệt → Hoàn tất + ledger', async () => {
    const ref = `phieu-ban.doc:${shipDoc}`;
    expect(await doc(ref)).toMatchObject({ module: 'phieu-ban', doc_type: 'sales.invoice', status: 'draft', version: 1, title: 'Phiếu bán hàng' });
    expect(await links(ref)).toEqual([{ to_ref: `phieu-ban.order:${orderId}`, role: 'source' }]);
    await ok('POST', `/api/v1/m/phieu-ban/docs/${shipDoc}/approve`, {});
    expect(await doc(ref)).toMatchObject({ status: 'done', status_raw: 'approved', version: 1 });
    expect(await links(ref)).toEqual([
      { to_ref: `ledger.event:phieu-ban:${shipDoc}`, role: 'ledger' },
      { to_ref: `phieu-ban.order:${orderId}`, role: 'source' },
    ]);
  });

  it('§3 dòng 6: ngừng chiến dịch voucher → pricing.voucher Huỷ (đang chạy = Đang thực hiện); chương trình tích điểm: bản mới đang dùng, bản cũ hoàn tất', async () => {
    const body = { validFrom: TODAY, code: 'VC033', name: 'Voucher 033', kind: 'cash', issuer: 'tgs', faceValue: 20_000 };
    const c = await ok('POST', '/api/v1/m/voucher/campaigns', body);
    const ref = `voucher.campaign:${c.id}`;
    expect(await doc(ref)).toMatchObject({ module: 'voucher', doc_type: 'pricing.voucher', doc_no: 'VC033', status: 'in_progress', version: 1 });
    await ok('PUT', `/api/v1/m/voucher/campaigns/${c.id}`, { ...body, status: 'stopped' });
    expect(await doc(ref)).toMatchObject({ status: 'cancelled', status_raw: 'stopped', version: 1 });

    const program = { version: 'lp-033-1', settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'điểm' }, tiers: [], policies: [] };
    await ok('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program });
    expect(await doc('loyalty.program:CN01:lp-033-1')).toMatchObject({ module: 'loyalty', doc_type: 'pricing.loyalty', status: 'in_progress', version: 1 });
    await ok('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: { ...program, version: 'lp-033-2' } });
    expect(await doc('loyalty.program:CN01:lp-033-1')).toMatchObject({ status: 'done', status_raw: 'superseded', version: 1 });
    expect(await doc('loyalty.program:CN01:lp-033-2')).toMatchObject({ status: 'in_progress', status_raw: 'current', version: 1 });
  });

  it('§3 dòng 7: dữ liệu cũ — mọi dòng của bảng nguồn (mọi đơn vị trên CSDL, kể cả lập trước migration) đều có trong sổ', async () => {
    const missing = (await sql<{ src: string; n: string }>`
      SELECT 'pos.order' AS src, count(*) AS n FROM mod_pos.orders o
       WHERE NOT EXISTS (SELECT 1 FROM business_documents b WHERE b.tenant_id = o.tenant_id AND b.doc_ref = 'pos.order:' || o.order_id)
      UNION ALL SELECT 'pos.return', count(*) FROM mod_pos.returns r
       WHERE NOT EXISTS (SELECT 1 FROM business_documents b WHERE b.tenant_id = r.tenant_id AND b.doc_ref = 'pos.return:' || r.return_id)
      UNION ALL SELECT 'phieu-ban.order', count(*) FROM mod_phieu_ban.orders o
       WHERE NOT EXISTS (SELECT 1 FROM business_documents b WHERE b.tenant_id = o.tenant_id AND b.doc_ref = 'phieu-ban.order:' || o.order_id)
      UNION ALL SELECT 'phieu-ban.doc', count(*) FROM mod_phieu_ban.docs d
       WHERE NOT EXISTS (SELECT 1 FROM business_documents b WHERE b.tenant_id = d.tenant_id AND b.doc_ref = 'phieu-ban.doc:' || d.doc_id)
      UNION ALL SELECT 'voucher.campaign', count(*) FROM mod_voucher.campaigns c
       WHERE NOT EXISTS (SELECT 1 FROM business_documents b WHERE b.tenant_id = c.tenant_id AND b.doc_ref = 'voucher.campaign:' || c.campaign_id)
      UNION ALL SELECT 'loyalty.program', count(*) FROM mod_loyalty.programs p
       WHERE NOT EXISTS (SELECT 1 FROM business_documents b WHERE b.tenant_id = p.tenant_id
                           AND b.doc_ref = 'loyalty.program:' || regexp_replace(p.branch_code, '\\s', '_', 'g') || ':' || regexp_replace(p.version, '\\s', '_', 'g'))`.execute(db)).rows;
    expect(missing.filter((m) => Number(m.n) > 0)).toEqual([]);
    // Nạp lại (chạy lại phần nạp của migration) không sinh thêm phiên bản.
    const before = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM document_versions WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);
    await sql`SELECT mod_pos.doc_put_order(o) FROM mod_pos.orders o WHERE o.tenant_id = ${tenantId}`.execute(db);
    await sql`SELECT mod_phieu_ban.doc_put_order(o) FROM mod_phieu_ban.orders o WHERE o.tenant_id = ${tenantId}`.execute(db);
    await sql`SELECT mod_phieu_ban.doc_put_doc(d) FROM mod_phieu_ban.docs d WHERE d.tenant_id = ${tenantId}`.execute(db);
    expect(Number((await sql<{ n: string }>`SELECT count(*) AS n FROM document_versions WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n)).toBe(before);
  });
});
