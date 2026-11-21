// [2026-11-21 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-035 dọn việc treo bán hàng (đóng góp)
/**
 * NT-BH-035 — dọn việc treo bán hàng (chốt 21/11/2026), §4 của docs/nghiem-thu/ban-hang/NT-BH-035-don-viec-treo-ban-hang.md:
 *   - loại kho "Khách trả" (sale_return_in) có KKM, kho tự chọn mặc định không đổi (KTL trước);
 *   - quà khách trả (nguyên vẹn) về kho quà KKM của cửa hàng nhận — máy bán (POS) và phiếu trả BH11; chưa khai kho quà → như cũ;
 *     quà lỗi vẫn vào KTL (NT-BH-024);
 *   - mặt hàng dịch vụ (phân loại tại ngày = service) không sinh thẻ kho, không giá vốn; doanh thu / thuế vẫn ghi; kiểm tồn không chặn
 *     (máy bán, BH10 bật chặn bán quá tồn); hàng hoá thường không đổi;
 *   - giữ dải số có mã máy → device_id;
 *   - BH10: kênh bán theo danh mục, kiểm voucher trước khi ghi (mã sai báo rõ, mã đúng ra số được giảm).
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

const MOD = (k: string) => fileURLToPath(new URL(`../../../modules/${k}/`, import.meta.url));
const HAS = ['pos', 'phieu-ban', 'voucher'].every((k) => existsSync(path.join(MOD(k), 'bizcity.module.json')));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses', 'bizcity_read.item_kinds'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const KHO = 'KHO01';
const KM = 'KHO01-KM';
const TL = 'KHO01-TL';
const PHONE = '0903503500';
let n = 0;
const uuid = (p = '0') => `0193a1b2-0000-7000-8000-${p}${String(35_000 + ++n).padStart(11, '0')}`;
type Ref = { key: string; version: number; hash: string };
type Line = { lineKey: string; sku: string; isGift?: boolean; warehouseCode?: string };

describe.skipIf(!HAS)('NT-BH-035 — dọn việc treo bán hàng', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let refs: Ref[] = [];
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-035-${++k}-${Date.now()}` }) },
  });
  const pos = (url: string, payload: unknown) => req('POST', `/api/v1/m/pos${url}`, payload);
  const setting = async (key: string, value: unknown) => {
    const r = await req('PUT', `/api/v1/settings/values/${key}`, { key, value });
    expect(r.statusCode, r.body).toBeLessThan(300);
  };
  const stockAt = async (sku: string, wh: string, branch = 'CN01') => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = ${branch} AND sku = ${sku} AND coalesce(warehouse_code, '') = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const payload = async (docKey: string) => (await sql<{ p: { lines: Line[] } }>`
    SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]!.p;
  const whOf = (lines: Line[]) => Object.fromEntries(lines.map((l) => [l.lineKey, l.warehouseCode ?? '']));
  /** Dòng thẻ kho của một chứng từ: mã → tổng SL. */
  const movements = async (docKey: string) => Object.fromEntries((await sql<{ sku: string; q: string }>`
    SELECT m.sku, SUM(m.qty) AS q FROM inventory_movements m JOIN accounting_events a ON a.id = m.event_id
     WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} GROUP BY m.sku`.execute(db)).rows.map((r) => [r.sku, Number(r.q)]));
  /** Doanh thu (511 có − nợ) và thuế đầu ra (3331) của một chứng từ. */
  const revenueTax = async (docKey: string) => {
    const r = (await sql<{ rev: string | null; tax: string | null }>`
      SELECT SUM(CASE WHEN l.account_code LIKE '511%' THEN l.credit - l.debit END) AS rev, SUM(CASE WHEN l.account_code LIKE '3331%' THEN l.credit - l.debit END) AS tax
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND NOT e.is_reversal`.execute(db)).rows[0]!;
    return { rev: Number(r.rev ?? 0), tax: Number(r.tax ?? 0) };
  };
  /** Đơn máy bán mua 2 tặng 1 SUA330 (quà cùng mã theo chương trình CT-SUA330). */
  const giftOrder = (branchCode = 'CN01') => ({
    id: uuid(), branchCode, businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
    lines: [
      { lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 330_000 },
      { lineId: 'g1', sku: 'SUA330', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } },
    ],
    promotionSelections: [], payment: { mode: 'cash', cashGiven: 660_000 }, clientTotal: 660_000, coreVersion: '0.1.0', promotionsVersion: '',
    policyRefs: refs.filter((r) => r.key === 'CT-SUA330'),
  });
  const sell = async (body: Record<string, unknown>) => {
    const r = await pos('/orders', body);
    expect(r.statusCode, r.body).toBe(201);
    return body.id as string;
  };
  const ret = (orderId: string, branchCode: string, lines: unknown[]) => {
    const id = uuid('r');
    return { id, res: pos('/returns', { id, orderId, branchCode, lines, refundMethod: 'TM', reason: 'Khách trả hàng' }) };
  };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(MOD('pos'), 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(MOD('phieu-ban'), 'migrations'), { reads: READS });
    await runModuleMigrations('voucher', path.join(MOD('voucher'), 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.products', 'bizcity_read.payment_methods'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-035', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng CN02' })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [
      { sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }, { sku: 'PHISHIP', name: 'Phí ship thu khách', unit: 'Lần' },
    ] })).status).toBeLessThan(300);
    for (const sku of ['SUA330', 'PHISHIP']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    // PHISHIP là mặt hàng dịch vụ: phân loại đang mở (tạo hôm nay) của định danh → kind = service (chưa có màn khai loại — đặt thẳng).
    const upd = await sql`UPDATE item_classification c SET kind = 'service' FROM products p
      WHERE p.tenant_id = ${tenantId} AND p.sku = 'PHISHIP' AND c.tenant_id = p.tenant_id AND c.item_id = p.item_id AND c.valid_to IS NULL`.execute(db);
    expect(Number(upd.numAffectedRows)).toBe(1);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH035', name: 'Khách 035', phone: PHONE })).status).toBeLessThan(300);
    // CN01: kho bán mặc định, kho quà (KKM), kho hàng trả lại (KTL). CN02: chỉ kho bán (chưa khai kho quà).
    for (const [code, branchCode, name, extra] of [
      [KHO, 'CN01', 'Kho bán CN01', { isDefault: true }], [KM, 'CN01', 'Kho khuyến mại CN01', { typeCode: 'KKM' }],
      [TL, 'CN01', 'Kho hàng trả lại CN01', { typeCode: 'KTL' }], ['KHO02', 'CN02', 'Kho bán CN02', { isDefault: true }],
    ] as const) expect((await call(ctx, 'POST', '/api/v1/warehouses', { code, branchCode, name, ...extra })).status).toBe(201);
    await nhapTon(ctx, 'CN01', [['SUA330', 20, 'Hộp']], '2026-10-01', 'NHAP-KHO01', KHO);
    await nhapTon(ctx, 'CN01', [['SUA330', 5, 'Hộp']], '2026-10-01', 'NHAP-KHO01-KM', KM);
    await nhapTon(ctx, 'CN02', [['SUA330', 20, 'Hộp']]);
    await khaiGia(tenantId, [['SUA330', 'Hộp', 330_000], ['PHISHIP', 'Lần', 32_400]]);
    const prog = await call(ctx, 'POST', '/api/v1/sale-programs', { programKind: 'KM-CTY', validFrom: TODAY, validTo: TODAY, code: 'CT-SUA330', name: 'Mua 2 tặng 1 SUA330', mode: 'gift',
      sku: 'SUA330', buyQty: 2, giftSku: 'SUA330', giftQty: 1, quotas: ['CN01', 'CN02'].map((branchCode) => ({ branchCode, quotaQty: 100 })) });
    expect(prog.status, JSON.stringify(prog.body)).toBe(200);
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: 'SUA330', qty: 2, price: 330_000 }] });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    refs = ev.body.data.policyRefs.map(({ key, version, hash }: Ref) => ({ key, version, hash }));
    await setting('bizcity.pos.gift_warehouses', [`CN01=${KM}`]);
    await setting('bizcity.pos.return_bad_warehouses', [`CN01=${TL}`]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('loại kho "Khách trả": có KKM sau KTL, KHH — kho tự chọn mặc định vẫn là kho KTL', async () => {
    const ops = (await sql<{ c: string[] }>`SELECT type_codes AS c FROM warehouse_type_ops WHERE tenant_id = ${tenantId} AND op = 'sale_return_in'`.execute(db)).rows[0]!.c;
    expect(ops).toEqual(['KTL', 'KHH', 'KKM']);
    expect((await call(ctx, 'GET', '/api/v1/warehouses/pick?branchCode=CN01&op=sale_return_in')).body.data.code).toBe(TL);
    // Các đơn vị đã có trước 0178: nghiệp vụ "Khách trả" đều đã có KKM (chạy lại migration không thêm trùng).
    const missing = (await sql<{ n: string }>`SELECT count(*) AS n FROM warehouse_type_ops WHERE op = 'sale_return_in' AND NOT ('KKM' = ANY (type_codes))`.execute(db)).rows[0]!.n;
    expect(Number(missing)).toBe(0);
  });

  it('máy bán: trả đơn có quà (nguyên vẹn) → dòng quà nhập kho KKM, dòng bán nhập kho bán; tồn KKM tăng', async () => {
    const orderId = await sell(giftOrder());
    expect(await stockAt('SUA330', KM)).toBe(4);
    const { id, res } = ret(orderId, 'CN01', [{ lineId: 'l1', qty: 2 }, { lineId: 'g1', qty: 1 }]);
    const r = await res;
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect(whOf((await payload(`pos:CN01:sale_return:${id}`)).lines)).toEqual({ l1: '', g1: KM });
    expect(await stockAt('SUA330', KM)).toBe(5);
    // BH14: bản chụp phiếu trả ghi kho nhận của dòng quà.
    const lines = r.json().data.lines as { lineId: string; warehouseCode?: string }[];
    expect(lines.find((l) => l.lineId === 'g1')?.warehouseCode).toBe(KM);
  });

  it('máy bán: dòng quà trả lỗi vẫn vào kho KTL (NT-BH-024)', async () => {
    const orderId = await sell(giftOrder());
    const { id, res } = ret(orderId, 'CN01', [{ lineId: 'l1', qty: 2 }, { lineId: 'g1', qty: 1, condition: 'bad' }]);
    const r = await res;
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect(whOf((await payload(`pos:CN01:sale_return:${id}`)).lines)).toEqual({ l1: '', g1: TL });
  });

  it('máy bán: cửa hàng chưa khai kho quà → quà trả về kho bán như cũ', async () => {
    const orderId = await sell(giftOrder('CN02'));
    const { id, res } = ret(orderId, 'CN02', [{ lineId: 'l1', qty: 2 }, { lineId: 'g1', qty: 1 }]);
    const r = await res;
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect(whOf((await payload(`pos:CN02:sale_return:${id}`)).lines)).toEqual({ l1: '', g1: '' });
  });

  it('BH11: phiếu trả có dòng quà → dòng quà về kho KKM của cửa hàng nhận; CN02 chưa khai → kho của phiếu', async () => {
    const before = await stockAt('SUA330', KM);
    const mk = async (branchCode: string, warehouseCode: string) => {
      const c = await req('POST', '/api/v1/m/phieu-ban/docs', {
        docType: 'sale_return', docDate: TODAY, branchCode, warehouseCode, partner: { code: 'KH035' }, payments: [],
        lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 305_556 }, { lineKey: 'G1', sku: 'SUA330', qty: 1, isGift: true }],
      });
      expect(c.statusCode, c.body).toBe(200);
      const id = c.json().data.id as string;
      const a = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`);
      expect(a.statusCode, a.body).toBe(200);
      return whOf((await payload(`phieu-ban:${id}`)).lines);
    };
    expect(await mk('CN01', KHO)).toEqual({ L1: KHO, G1: KM });
    expect(await stockAt('SUA330', KM)).toBe(before + 1);
    expect(await mk('CN02', 'KHO02')).toEqual({ L1: 'KHO02', G1: 'KHO02' });
  });

  it('mặt hàng dịch vụ: bán / trả không sinh thẻ kho, không giá vốn; doanh thu + thuế vẫn ghi; hàng hoá thường không đổi', async () => {
    const line = (sku: string, qty: number, amount: number, extra: Record<string, unknown> = {}) =>
      ({ lineKey: `l-${sku}`, sku, name: sku, unit: sku === 'PHISHIP' ? 'Lần' : 'Hộp', qty, amountBeforeTax: amount, taxCode: 'R08', taxAmount: amount * 0.08, ...extra });
    const itemId = (await sql<{ id: string }>`SELECT item_id AS id FROM products WHERE tenant_id = ${tenantId} AND sku = 'PHISHIP'`.execute(db)).rows[0]!.id;
    const sale = {
      docType: 'sale', docKey: 'BAN-DV-035', branchCode: 'CN01', docNo: 'BAN-DV-035', docDate: '2026-10-05',
      lines: [line('SUA330', 1, 300_000), line('PHISHIP', 1, 30_000)], payments: [{ methodCode: 'TM', amount: 356_400 }],
      totals: { beforeTax: 330_000, tax: 26_400, total: 356_400 },
    };
    const s = await call(ctx, 'POST', '/api/v1/documents', sale);
    expect(s.body.data.status, JSON.stringify(s.body)).toBe('posted');
    expect(await movements('BAN-DV-035')).toEqual({ SUA330: -1 });
    expect(await revenueTax('BAN-DV-035')).toEqual({ rev: 330_000, tax: 26_400 });
    // Dòng gửi kèm itemId (định danh) cũng nhận ra dịch vụ.
    const ret2 = {
      docType: 'sale_return', docKey: 'TRA-DV-035', branchCode: 'CN01', docNo: 'TRA-DV-035', docDate: '2026-10-06', originalDocKey: 'BAN-DV-035',
      lines: [line('SUA330', 1, 300_000), line('PHISHIP', 1, 30_000, { itemId })], payments: [{ methodCode: 'TM', amount: 356_400 }],
      totals: { beforeTax: 330_000, tax: 26_400, total: 356_400 },
    };
    const t = await call(ctx, 'POST', '/api/v1/documents', ret2);
    expect(t.body.data.status, JSON.stringify(t.body)).toBe('posted');
    expect(await movements('TRA-DV-035')).toEqual({ SUA330: 1 });
    // Giá vốn tháng 10: chỉ hàng hoá có dòng giá vốn; dịch vụ không có.
    const c = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const skus = (await sql<{ sku: string }>`SELECT DISTINCT sku FROM costing_run_lines WHERE tenant_id = ${tenantId}`.execute(db)).rows.map((r) => r.sku);
    expect(skus).toContain('SUA330');
    expect(skus).not.toContain('PHISHIP');
    const dvCost = (await sql<{ n: string }>`SELECT count(*) AS n FROM inventory_movements WHERE tenant_id = ${tenantId} AND sku = 'PHISHIP'`.execute(db)).rows[0]!.n;
    expect(Number(dvCost)).toBe(0);
  });

  it('máy bán: dòng dịch vụ không tồn vẫn bán được (không chặn tồn), không thẻ kho', async () => {
    const o = {
      id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
      lines: [{ lineId: 'l1', sku: 'PHISHIP', unitName: 'Lần', unitQty: 1, clientUnitPrice: 32_400 }],
      promotionSelections: [], payment: { mode: 'cash', cashGiven: 32_400 }, clientTotal: 32_400, coreVersion: '0.1.0', promotionsVersion: '',
    };
    await sell(o);
    expect(await movements(`pos:CN01:sale:${o.id}`)).toEqual({});
    expect(await revenueTax(`pos:CN01:sale:${o.id}`)).toEqual({ rev: 30_000, tax: 2_400 });
  });

  it('BH10 bật chặn bán quá tồn: dòng dịch vụ (phí ship) không bị chặn, không thẻ kho; BH17 không nhắc khi mã phí là dịch vụ', async () => {
    await setting('bizcity.phieu_ban.block_negative_stock', true);
    const c = await req('POST', '/api/v1/m/phieu-ban/docs', {
      docType: 'sale', docDate: TODAY, branchCode: 'CN01', warehouseCode: KHO, partner: { code: 'KH035' }, payments: [],
      lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 305_556 }, { lineKey: 'L2', sku: 'PHISHIP', qty: 1, unitPrice: 30_000 }],
    });
    expect(c.statusCode, c.body).toBe(200);
    const id = c.json().data.id as string;
    const a = await req('POST', `/api/v1/m/phieu-ban/docs/${id}/approve`);
    expect(a.statusCode, a.body).toBe(200);
    expect(await movements(`phieu-ban:${id}`)).toEqual({ SUA330: -1 });
    await setting('bizcity.phieu_ban.block_negative_stock', false);
    await setting('bizcity.phieu_ban.ship_fee_sku', 'PHISHIP');
    const ok = (await req('GET', '/api/v1/m/phieu-ban/order-settings')).json().data.ship;
    expect(ok).toMatchObject({ shipFeeSku: 'PHISHIP', shipFeeIsService: true, shipFeeWarning: null });
    await setting('bizcity.phieu_ban.ship_fee_sku', 'SUA330');
    const warn = (await req('GET', '/api/v1/m/phieu-ban/order-settings')).json().data.ship;
    expect(warn).toMatchObject({ shipFeeSku: 'SUA330', shipFeeIsService: false });
    expect(warn.shipFeeWarning).toContain('chưa phân loại là mặt hàng dịch vụ');
    await setting('bizcity.phieu_ban.ship_fee_sku', '');
  });

  it('giữ dải số từ máy bán có mã máy → code_reservations.device_id', async () => {
    const r = await pos('/sequences/reserve', { kind: 'sale', count: 2, branchCode: 'CN01', businessDate: TODAY, deviceId: 'MAY-035' });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const rows = (await sql<{ d: string | null }>`SELECT device_id AS d FROM mod_pos.code_reservations WHERE tenant_id = ${tenantId} ORDER BY id DESC LIMIT 1`.execute(db)).rows;
    expect(rows[0]?.d).toBe('MAY-035');
    // Máy cũ không gửi mã máy vẫn giữ được số.
    const old = await pos('/sequences/reserve', { kind: 'sale', count: 1, branchCode: 'CN01', businessDate: TODAY });
    expect(old.statusCode, old.body).toBeLessThan(300);
  });

  it('BH10: kênh bán theo danh mục; kiểm voucher — mã sai báo lỗi, mã đúng ra số được giảm như lúc duyệt', async () => {
    const ch = (await req('GET', '/api/v1/m/pos/channels?active=1')).json().data as { items: { code: string; name: string }[] };
    const chan = ch.items[0]!;
    const base = { docType: 'sale', docDate: TODAY, branchCode: 'CN01', warehouseCode: KHO, partner: { code: 'KH035' }, payments: [], lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 92_593 }] };
    const d = await req('POST', '/api/v1/m/phieu-ban/docs', { ...base, saleChannel: chan.code });
    expect(d.statusCode, d.body).toBe(200);
    expect(d.json().data).toMatchObject({ saleChannel: chan.code, saleChannelName: chan.name });
    const badCh = await req('POST', '/api/v1/m/phieu-ban/docs', { ...base, saleChannel: 'KENH-KHONG-CO' });
    expect(badCh.statusCode).toBe(400);
    expect(badCh.json().error.details.reason).toBe('POS_SALE_SOURCE');

    const bad = await req('POST', '/api/v1/m/phieu-ban/vouchers/check', { ...base, vouchers: ['KHONG-CO-MA'] });
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details.field).toBe('vouchers');
    const camp = await req('POST', '/api/v1/m/voucher/campaigns', { validFrom: TODAY, code: 'TGS20K-035', name: 'TGS 20K', kind: 'cash', issuer: 'tgs', faceValue: 20_000 });
    expect(camp.statusCode, camp.body).toBe(200);
    const code = (await req('POST', `/api/v1/m/voucher/campaigns/${camp.json().data.id}/generate`, { phones: [PHONE] })).json().data.created[0].code as string;
    const good = await req('POST', '/api/v1/m/phieu-ban/vouchers/check', { ...base, vouchers: [code] });
    expect(good.statusCode, good.body).toBe(200);
    expect(good.json().data).toMatchObject({ discount: 20_000, payment: 0, before: { total: 100_000 }, after: { total: 80_000 }, vouchers: [{ code, kind: 'discount', amount: 20_000 }] });
    // Kiểm không giữ mã: duyệt phiếu dùng mã vẫn được, tiền giảm khớp số đã kiểm.
    const doc = await req('POST', '/api/v1/m/phieu-ban/docs', { ...base, vouchers: [code] });
    const ap = await req('POST', `/api/v1/m/phieu-ban/docs/${doc.json().data.id}/approve`);
    expect(ap.statusCode, ap.body).toBe(200);
    expect(ap.json().data.totals.total).toBe(80_000);
  });
  // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 (anh chốt 21/11): BH20 dòng dịch vụ không giữ hàng, không báo thiếu tồn, không chuyển kho (đóng góp)
  it('BH20: đơn có dòng dịch vụ (phí ship) — gửi không báo thiếu tồn, không giữ / chuyển kho dòng dịch vụ; hàng thường vẫn giữ', async () => {
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'KCB01', branchCode: 'CN01', name: 'Kho chờ bán CN01', typeCode: 'KCB' })).status).toBe(201);
    await setting('bizcity.phieu_ban.hold_warehouses', ['CN01=KCB01']);
    const c = await req('POST', '/api/v1/m/phieu-ban/orders', {
      orderDate: TODAY, branchCode: 'CN01', validUntil: TODAY, partner: { code: 'KH035' },
      lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 330_000 }, { lineKey: 'S1', sku: 'PHISHIP', qty: 1, unitPrice: 30_000 }],
    });
    expect(c.statusCode, c.body).toBe(200);
    const id = c.json().data.order.id as string;
    const s = await req('POST', `/api/v1/m/phieu-ban/orders/${id}/send`, {});
    expect(s.statusCode, s.body).toBe(200);
    const o = s.json().data as { status: string; lines: { lineKey: string; held: number }[] };
    expect(o.status).toBe('open');
    expect(Object.fromEntries(o.lines.map((l) => [l.lineKey, l.held]))).toEqual({ L1: 2, S1: 0 });
    expect(s.json().meta?.stockShort).toBeUndefined();
    expect(Object.keys(await movements(`phieu-ban:dh:${id}:1`))).toEqual(['SUA330']);
  });
});
