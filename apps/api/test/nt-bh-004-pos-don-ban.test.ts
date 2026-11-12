/**
 * NT-BH-004 — đơn bán tại quầy từ máy bán POS (kế hoạch module POS đợt W1): gọi HTTP như máy bán vào module pos, đối chiếu chứng từ + bút
 * toán trong sổ với phiếu docs/nghiem-thu/ban-hang/NT-BH-004-pos-don-ban-tai-quay.md. Chưa có module → bỏ qua.
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
import { setupTenant, type TestCtx } from './helpers.js';
import { createHmac } from 'node:crypto';
import { env } from '../src/config/env.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners'];

const ID1 = '0193a1b2-0000-7000-8000-000000000001';
const ID2 = '0193a1b2-0000-7000-8000-000000000002';

const order = (over: Record<string, unknown> = {}) => ({
  id: ID1,
  branchCode: 'CN01',
  businessDate: '2026-11-09',
  shiftId: 'ngay-2026-11-09',
  exportReasonCode: 'XBA',
  customer: { retail: true },
  lines: [{ lineId: 'l1', productId: 'SUA400', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000 }],
  promotionSelections: [],
  payment: { mode: 'cash', cashGiven: 500_000 },
  clientTotal: 324_000,
  coreVersion: '0.1.0',
  promotionsVersion: '',
  ...over,
});

describe.skipIf(!HAS)('NT-BH-004 — đơn bán tại quầy từ máy POS vào sổ', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const post = (url: string, payload: unknown, key = `nt-bh-004-${++k}-${Date.now()}`) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': key } });
  const get = (url: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: { authorization: `Bearer ${ctx.token}` } });

  /** Số phát sinh theo tài khoản của chứng từ: { tk: [Nợ, Có] } (bút toán đang hiệu lực, không tính đảo). */
  const byAccount = async (docKey: string) => {
    const rows = (await sql<{ account: string; d: string; c: string }>`
      SELECT l.account_code AS account, SUM(l.debit) AS d, SUM(l.credit) AS c
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND NOT e.is_reversal
       GROUP BY l.account_code ORDER BY l.account_code`.execute(db)).rows;
    return Object.fromEntries(rows.map((r) => [r.account, [Number(r.d), Number(r.c)]]));
  };
  const docCount = async (like: string) => Number((await sql<{ n: string }>`
    SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key LIKE ${like}`.execute(db)).rows[0]!.n);
  const orderCount = async () => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_pos.orders WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-004', trx as never); });
    app = await buildApp();
    const put = await app.inject({
      method: 'PUT', url: '/api/v1/products', headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-004-sp-${Date.now()}` },
      payload: { products: [
        { sku: 'SUA400', name: 'Sữa bột 400g', unit: 'Hộp', taxOutCode: 'R08' },
        { sku: 'TA01', name: 'Tã quần L', unit: 'Gói', taxOutCode: 'R10' },
        { sku: 'CHUATHUE', name: 'Hàng chưa khai thuế', unit: 'Cái' },
      ] },
    });
    expect(put.statusCode, put.body).toBeLessThan(300);
    // Thêm hàng loạt không ghi mã thuế cho mặt hàng mới tạo: khai mã thuế đầu ra từng mặt hàng (như màn Danh mục hàng).
    for (const [sku, taxOutCode] of [['SUA400', 'R08'], ['TA01', 'R10']] as const) {
      const r = await app.inject({ method: 'PUT', url: `/api/v1/products/${sku}`, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-004-${sku}-${Date.now()}` }, payload: { taxOutCode } });
      expect(r.statusCode, r.body).toBe(200);
    }
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('khởi động màn bán: chi nhánh CN01, hình thức thanh toán theo danh mục, ca theo ngày', async () => {
    const r = await get('/bootstrap');
    expect(r.statusCode, r.body).toBe(200);
    const b = r.json().data;
    expect(b.branch.code).toBe('CN01');
    expect(b.paymentMethods).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TM', kind: 'cash', accountingCode: 'TM' }),
      expect.objectContaining({ code: 'CK', kind: 'transfer', accountingCode: 'CK' }),
    ]));
    expect(b.paymentMethods.some((m: { kind: string }) => m.kind === 'credit' || m.kind === 'offset')).toBe(false);
    expect(b.openShift.id).toMatch(/^ngay-\d{4}-\d{2}-\d{2}$/);
  });

  it('tình huống 1: khách lẻ, tiền mặt → HD2611000001, 300.000 + 24.000, thối 176.000; Nợ 1311 / Có 51111, 33311; Nợ 1111 / Có 1311', async () => {
    const r = await post('/orders', order());
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o).toMatchObject({ id: ID1, code: 'HD2611000001', status: 'completed', businessDate: '2026-11-09', subtotal: 300_000, taxTotal: 24_000, total: 324_000 });
    expect(o.payment).toMatchObject({ mode: 'cash', cashGiven: 500_000, change: 176_000 });
    expect(o.customer).toEqual({ id: '', name: 'Khách lẻ', phone: '' });
    expect(o.lines[0]).toMatchObject({ sku: 'SUA400', amount: 300_000, taxAmount: 24_000, taxRate: 8 });

    const key = `pos:CN01:sale:${ID1}`;
    const ev = (await sql<{ doc_type: string; doc_no: string; doc_date: string; status: string }>`
      SELECT doc_type, doc_no, to_char(doc_date, 'YYYY-MM-DD') AS doc_date, status FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${key}`.execute(db)).rows;
    expect(ev).toEqual([{ doc_type: 'sale', doc_no: 'HD2611000001', doc_date: '2026-11-09', status: 'posted' }]);
    expect(await byAccount(key)).toEqual({ '1111': [324_000, 0], '1311': [324_000, 324_000], '33311': [0, 24_000], '51111': [0, 300_000] });
  });

  it('tình huống 2: giảm tay 10%, R08 + R10, TM 300.000 + CK 498.200, khách mới 0911222333 → HD2611000002', async () => {
    const r = await post('/orders', order({
      id: ID2,
      customer: { phone: '0911 222 333', name: 'Khách thử POS' },
      lines: [
        { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 324_000, manualDiscount: { kind: 'percent', value: 10 } },
        { lineId: 'l2', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 },
      ],
      payment: { mode: 'split', parts: [{ method: 'TM', amount: 300_000 }, { method: 'CK', amount: 498_200 }] },
      clientTotal: 798_200,
    }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o).toMatchObject({ code: 'HD2611000002', subtotal: 735_455, taxTotal: 62_745, total: 798_200 });
    expect(o.lines.map((l: { amount: number; taxAmount: number }) => [l.amount, l.taxAmount])).toEqual([[540_000, 43_200], [195_455, 19_545]]);
    expect(o.customer).toEqual({ id: '0911222333', name: 'Khách thử POS', phone: '0911222333' });

    const accounts = await byAccount(`pos:CN01:sale:${ID2}`);
    expect(accounts['51111']).toEqual([0, 735_455]);
    expect(accounts['33311']).toEqual([0, 62_745]);
    expect(accounts['1111']).toEqual([300_000, 0]);
    expect(accounts['1311']).toEqual([798_200, 798_200]);
    expect(accounts['11210005']).toEqual([498_200, 0]); // CK theo gói định khoản mặc định
    expect(Object.keys(accounts).sort()).toEqual(['1111', '11210005', '1311', '33311', '51111']);

    const partner = (await sql<{ name: string }>`SELECT name FROM partners WHERE tenant_id = ${tenantId} AND code = '0911222333'`.execute(db)).rows;
    expect(partner).toEqual([{ name: 'Khách thử POS' }]);

    // Đơn giá chứng từ là giá chưa thuế TRƯỚC giảm: đơn giá × SL − giảm = thành tiền chưa thuế (không trừ chiết khấu hai lần).
    const doc = (await sql<{ p: { lines: { unitPrice: number; unitQty: number; discount: number; amountBeforeTax: number }[] } }>`
      SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`pos:CN01:sale:${ID2}`}`.execute(db)).rows[0]!.p;
    expect(doc.lines.map((l) => [l.unitPrice, l.discount, l.amountBeforeTax])).toEqual([[300_000, 60_000, 540_000], [195_455, 0, 195_455]]);
    for (const l of doc.lines) expect(Math.abs(l.unitPrice * l.unitQty - l.discount - l.amountBeforeTax)).toBeLessThanOrEqual(l.unitQty);
    // Dòng đơn lưu định danh mặt hàng, mã chỉ là ảnh chụp.
    const lines = (await sql<{ sku: string; same: boolean; amount_before_tax: string }>`
      SELECT l.sku, l.item_id = p.item_id AS same, l.amount_before_tax FROM mod_pos.order_lines l
        JOIN products p ON p.tenant_id = l.tenant_id AND p.sku = l.sku
       WHERE l.tenant_id = ${tenantId} AND l.order_id = ${ID2} ORDER BY l.line_key`.execute(db)).rows;
    expect(lines.map((l) => [l.sku, l.same, Number(l.amount_before_tax)])).toEqual([['SUA400', true, 540_000], ['TA01', true, 195_455]]);
  });

  it('báo cáo: ngày 09/11 chi nhánh CN01 doanh thu 1.035.455, thuế 86.745; 1311 của khách 0911222333 về 0', async () => {
    const r = (await sql<{ rev: string; vat: string }>`
      SELECT SUM(CASE WHEN l.account_code = '51111' THEN l.credit - l.debit ELSE 0 END) AS rev,
             SUM(CASE WHEN l.account_code = '33311' THEN l.credit - l.debit ELSE 0 END) AS vat
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key LIKE 'pos:CN01:sale:%' AND e.status = 'posted'`.execute(db)).rows[0]!;
    expect([Number(r.rev), Number(r.vat)]).toEqual([1_035_455, 86_745]);
    const bal = (await sql<{ v: string | null }>`
      SELECT SUM(l.debit - l.credit) AS v FROM ledger_lines l JOIN partners p ON p.id = l.partner_id
       WHERE l.tenant_id = ${tenantId} AND p.code = '0911222333' AND l.account_code = '1311'`.execute(db)).rows[0]!;
    expect(Number(bal.v ?? 0)).toBe(0);
  });

  it('lệch chuẩn 1: gửi lại đúng đơn (khoá gửi khác) → đơn cũ, cùng mã phiếu, không thêm chứng từ', async () => {
    const before = await docCount('pos:CN01:sale:%');
    const r = await post('/orders', order());
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order.code).toBe('HD2611000001');
    expect(await docCount('pos:CN01:sale:%')).toBe(before);
    expect(await orderCount()).toBe(2);
    const again = await get(`/orders/${ID1}`);
    expect(again.json().data).toMatchObject({ code: 'HD2611000001', total: 324_000 });
    // Tra theo mã phiếu kèm chi nhánh (mã phiếu chỉ duy nhất trong một chi nhánh).
    expect((await get('/orders/HD2611000001?branch=CN01')).json().data).toMatchObject({ id: ID1 });
    expect((await get('/orders/HD2611000001?branch=CN99')).statusCode).toBe(404);
  });

  it('lệch chuẩn 1b: cùng id đơn mà nội dung khác → 409 POS_ORDER_ID_REUSED, không trả nhầm đơn cũ, không thêm chứng từ', async () => {
    const before = await docCount('pos:CN01:sale:%');
    const r = await post('/orders', order({ clientTotal: 648_000, lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 324_000 }] }));
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().error.details).toMatchObject({ reason: 'POS_ORDER_ID_REUSED' });
    expect(await docCount('pos:CN01:sale:%')).toBe(before);
  });

  it('lệch chuẩn 2–9: đúng lý do, không đơn, không chứng từ', async () => {
    const cases: [string, Record<string, unknown>, number, string][] = [
      ['mã hàng lạ', { lines: [{ lineId: 'l1', sku: 'KHONGCO', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 1000 }], clientTotal: 1000 }, 400, 'POS_UNKNOWN_SKU'],
      ['chưa khai thuế', { lines: [{ lineId: 'l1', sku: 'CHUATHUE', unitName: 'Cái', unitQty: 1, clientUnitPrice: 1000 }], clientTotal: 1000 }, 400, 'POS_TAX_NOT_DECLARED'],
      ['tiền mặt thiếu', { payment: { mode: 'cash', cashGiven: 100_000 } }, 400, 'POS_CASH_INSUFFICIENT'],
      ['chia tiền lệch', { payment: { mode: 'split', parts: [{ method: 'TM', amount: 300_000 }] } }, 400, 'POS_SPLIT_MISMATCH'],
      ['tổng máy khác', { clientTotal: 323_999 }, 409, 'POS_PRICE_CHANGED'],
      ['giảm tiền quá thành tiền', { lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000, manualDiscount: { kind: 'amount', value: 400_000 } }] }, 400, 'POS_DISCOUNT_TOO_LARGE'],
      ['có CTKM', { promotionSelections: [{ kind: 'coupon', code: 'KM1' }] }, 400, 'POS_NOT_SUPPORTED_YET'],
      ['trả QR', { payment: { mode: 'qr' } }, 400, 'POS_NOT_SUPPORTED_YET'],
      ['chi nhánh lạ', { branchCode: 'CN99' }, 400, 'POS_UNKNOWN_BRANCH'],
    ];
    const docsBefore = await docCount('pos:%');
    for (const [name, over, status, reason] of cases) {
      const r = await post('/orders', order({ id: `0193a1b2-0000-7000-8000-${String(++k).padStart(12, '0')}`, ...over }));
      expect(r.statusCode, `${name}: ${r.body}`).toBe(status);
      expect(r.json().error.details.reason, name).toBe(reason);
    }
    const bad = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-00000000bad1', lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 0, clientUnitPrice: 1 }] }));
    expect(bad.statusCode).toBe(400);
    expect(await docCount('pos:%')).toBe(docsBefore);
    expect(await orderCount()).toBe(2);
  });

  it('lệch chuẩn 10: đơn bán ngoại tuyến hôm trước → ngày chứng từ = ngày bán, số phiếu theo tháng của ngày bán', async () => {
    const id = '0193a1b2-0000-7000-8000-0000000000aa';
    const r = await post('/orders', order({ id, businessDate: '2026-10-31', offlineCreatedAt: '2026-10-31T20:00:00+07:00' }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order.code).toBe('HD2610000001');
    const d = (await sql<{ d: string }>`SELECT to_char(doc_date, 'YYYY-MM-DD') AS d FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`pos:CN01:sale:${id}`}`.execute(db)).rows[0]!;
    expect(d.d).toBe('2026-10-31');
  });

  it('cấp trước số phiếu: dải tiếp nối, đơn dùng đúng số đã cấp; số chưa cấp thì không nhận mà cấp số mới', async () => {
    const r = await post('/sequences/reserve', { kind: 'sale', count: 2, branchCode: 'CN01', businessDate: '2026-11-09' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.codes).toEqual(['HD2611000003', 'HD2611000004']);
    const used = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-0000000000b1', reservedCode: 'HD2611000004' }));
    expect(used.json().data.order.code).toBe('HD2611000004');
    const fake = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-0000000000b2', reservedCode: 'HD2611000099' }));
    expect(fake.json().data.order.code).toBe('HD2611000005');
  });

  it('lệch chuẩn 11: lỗi lúc ghi sổ (kỳ đã khoá) → không lưu đơn, máy gửi lại được', async () => {
    const lock = await app.inject({
      method: 'PUT', url: '/api/v1/periods/locks', headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `lock-${Date.now()}` },
      payload: { year: 2026, month: 9, changes: [{ branchCode: 'CN01', docType: 'sale', locked: true }] },
    });
    expect(lock.statusCode, lock.body).toBe(200);
    const before = await orderCount();
    const counter = (await sql<{ n: number }>`SELECT last_no AS n FROM mod_pos.code_counters WHERE tenant_id = ${tenantId} AND period = '2609'`.execute(db)).rows;
    const r = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-0000000000c1', businessDate: '2026-09-15' }));
    expect(r.statusCode, r.body).toBeGreaterThanOrEqual(400);
    expect(r.json().error.code).toBe('PERIOD_LOCKED');
    expect(await orderCount()).toBe(before);
    // Số phiếu cấp trong giao dịch lỗi cũng huỷ theo: không có bộ đếm kỳ 2609.
    expect(counter).toEqual([]);
    expect((await sql<{ n: number }>`SELECT last_no AS n FROM mod_pos.code_counters WHERE tenant_id = ${tenantId} AND period = '2609'`.execute(db)).rows).toEqual([]);
  });

  // Mã số cha – con (khung nhìn 0102): thuế xét ô Gửi lên thuế, giá 0đ xét ô Biến thể; mã chỉ là số, không đọc chữ cuối mã.
  // [2026-11-12 Nguyễn Văn Thủy] luật 0111: gửi lên thuế suy theo mã (chỉ đuôi Z không gửi), mã con có tiền luôn sendTax = true (đóng góp)
  it('lệch chuẩn 12–13: hàng Nội bộ 0đ (bill Z) chặn rõ; mã con thu tiền vẫn bán, gửi thuế theo mã; dòng chứng từ mang itemId', async () => {
    await sql`INSERT INTO products (tenant_id, sku, name, unit, tax_out_code, variant_code) VALUES
      (${tenantId}, '11005100103Z', 'Bình sữa quà tặng', 'Cái', 'R08', 'internal'),
      (${tenantId}, '11005100102', 'Bình sữa kẹp quà', 'Cái', 'R08', 'clip')`.execute(db);
    const docsBefore = await docCount('pos:%');

    const z = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-0000000000c1', lines: [
      { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000 },
      { lineId: 'l2', sku: '11005100103Z', unitName: 'Cái', unitQty: 1, clientUnitPrice: 0 },
    ] }));
    expect(z.statusCode, z.body).toBe(400);
    expect(z.json().error.details).toMatchObject({ reason: 'POS_NOT_SUPPORTED_YET', billZ: ['11005100103Z'] });
    const price = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-0000000000c2', lines: [{ lineId: 'l1', sku: '11005100103Z', unitName: 'Cái', unitQty: 1, clientUnitPrice: 5_000 }], clientTotal: 5_000 }));
    expect(price.statusCode, price.body).toBe(409);
    expect(price.json().error.details.reason).toBe('POS_PRICE_CHANGED');
    expect(await docCount('pos:%')).toBe(docsBefore);

    const id = '0193a1b2-0000-7000-8000-0000000000c3';
    const r = await post('/orders', order({ id, lines: [
      { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000 },
      { lineId: 'l2', sku: '11005100102', unitName: 'Cái', unitQty: 1, clientUnitPrice: 54_000 },
    ], clientTotal: 378_000 }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.total).toBe(378_000);
    expect(o).not.toHaveProperty('zBill');
    expect(o.lines.map((l: { sku: string; sendTax: boolean }) => [l.sku, l.sendTax])).toEqual([['SUA400', true], ['11005100102', true]]);
    const ids = (await sql<{ sku: string; item_id: string }>`SELECT sku, item_id FROM products WHERE tenant_id = ${tenantId} AND sku IN ('SUA400', '11005100102') ORDER BY sku`.execute(db)).rows;
    const payload = (await sql<{ p: { lines: { sku: string; itemId?: string }[] } }>`
      SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`pos:CN01:sale:${id}`}`.execute(db)).rows[0]!.p;
    expect(payload.lines.map((l) => [l.sku, l.itemId]).sort()).toEqual(ids.map((x) => [x.sku, x.item_id]));
  });

  it('lệch chuẩn 1c: hai máy gửi cùng lúc cùng một đơn (khoá gửi khác nhau) → một mã phiếu, một chứng từ, không lỗi CSDL thô', async () => {
    const id = '0193a1b2-0000-7000-8000-0000000000d1';
    const before = await docCount('pos:CN01:sale:%');
    const [a, b] = await Promise.all([post('/orders', order({ id, businessDate: '2026-08-20' })), post('/orders', order({ id, businessDate: '2026-08-20' }))]);
    expect([a.statusCode, b.statusCode], a.body + b.body).toEqual([201, 201]);
    expect(a.json().data.order.code).toBe(b.json().data.order.code);
    expect(await docCount('pos:CN01:sale:%')).toBe(before + 1);
  });

  it('quyền riêng máy bán: thu ngân đăng nhập bằng vé chỉ mang pos:sell bán được, không gọi được chứng từ của Core (P-MP-7)', async () => {
    const SECRET = 'kiem-thu-nt-bh-004-pos-sell';
    const old = env.WP_SSO_SECRET;
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = SECRET;
    try {
      const now = Math.floor(Date.now() / 1000);
      const body = Buffer.from(JSON.stringify({ email: 'thu-ngan-cn01@example.test', name: 'Thu ngân CN01', tenant: ctx.tenantCode, perms: ['pos:sell'], iat: now, exp: now + 60 })).toString('base64url');
      const ticket = `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
      const sso = await app.inject({ method: 'POST', url: '/api/v1/auth/wp-sso', payload: { ticket } });
      expect(sso.statusCode, sso.body).toBe(200);
      expect(sso.json().data.user.permissions).toEqual(['pos:sell']);
      const auth = { authorization: `Bearer ${sso.json().data.token}` };

      expect((await app.inject({ method: 'GET', url: `${M}/bootstrap`, headers: auth })).statusCode).toBe(200);
      const r = await app.inject({ method: 'POST', url: `${M}/orders`, headers: { ...auth, 'idempotency-key': `nt-bh-004-pos-sell-${Date.now()}` },
        payload: order({ id: '0193a1b2-0000-7000-8000-0000000000e1', businessDate: '2026-07-15' }) as never });
      expect(r.statusCode, r.body).toBe(201);
      // Phiên thu ngân không lập / xem được chứng từ khác qua Core.
      expect((await app.inject({ method: 'GET', url: '/api/v1/documents', headers: auth })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v1/documents', headers: { ...auth, 'idempotency-key': `x-${Date.now()}` }, payload: { docType: 'sale' } })).statusCode).toBe(403);
    } finally {
      (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = old;
    }
  });
});
