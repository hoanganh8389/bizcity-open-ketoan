// [2026-11-15 11:05 AM Võ Hoàng] POS-BILLZ — NT-BH-019 bước 1: bill Z nhận trên chứng từ bán dạng dòng quà, khách mới đi kèm đơn (đóng góp)
/**
 * NT-BH-019 bước 1 — máy bán POS: hàng 0đ không gửi thuế (bill Z) và khách mới tại quầy đi kèm đơn. Gọi HTTP như máy bán vào
 * module pos, đối chiếu đơn trả máy, chứng từ và bút toán với phiếu docs/nghiem-thu/ban-hang/NT-BH-019-pos-tao-khach-bill-z.md.
 * Chưa có module → bỏ qua.
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

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners'];

const ID1 = '0193a1b2-0000-7000-8000-000000019001';
const ID2 = '0193a1b2-0000-7000-8000-000000019002';
const SKU = '100021001';
const QUA = '11005100103Z';

const order = (over: Record<string, unknown> = {}) => ({
  id: ID1,
  branchCode: 'CN01',
  businessDate: '2026-11-15',
  shiftId: 'ngay-2026-11-15',
  exportReasonCode: 'XBA',
  customer: { phone: '0901 234 567', name: 'Chị Lan' },
  lines: [
    { lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000 },
    { lineId: 'l2', sku: QUA, unitName: 'Cái', unitQty: 1, clientUnitPrice: 0 },
  ],
  promotionSelections: [],
  payment: { mode: 'cash', cashGiven: 500_000 },
  clientTotal: 325_000,
  coreVersion: '0.1.0',
  promotionsVersion: '',
  ...over,
});

describe.skipIf(!HAS)('NT-BH-019 — máy bán POS: bill Z và khách mới đi kèm đơn', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const post = (url: string, payload: unknown, key = `nt-bh-019-${++k}-${Date.now()}`) =>
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
  const payload = async (docKey: string) => (await sql<{ p: { partner?: { code: string; name: string }; lines: { sku: string; isGift?: boolean; amountBeforeTax: number; taxAmount: number }[] } }>`
    SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]!.p;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-019', trx as never); });
    app = await buildApp();
    const put = await app.inject({
      method: 'PUT', url: '/api/v1/products', headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-019-sp-${Date.now()}` },
      payload: { products: [{ sku: SKU, name: 'Sữa bột Biomil Plus 1 400g', unit: 'Lon', taxOutCode: 'R08' }] },
    });
    expect(put.statusCode, put.body).toBeLessThan(300);
    const tax = await app.inject({ method: 'PUT', url: `/api/v1/products/${SKU}`, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-019-tax-${Date.now()}` }, payload: { taxOutCode: 'R08' } });
    expect(tax.statusCode, tax.body).toBe(200);
    // Quà mã không gửi thuế (Nội bộ, 0đ) — như dữ liệu mẫu của NT-BH-004.
    await sql`INSERT INTO products (tenant_id, sku, name, unit, tax_out_code, variant_code) VALUES
      (${tenantId}, ${QUA}, 'Bình sữa quà tặng (không gửi thuế)', 'Cái', 'R08', 'internal')`.execute(db);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('kiểm 1 + 2: khách mới 0901234567 + 1 lon 325.000 + quà 11005100103Z 0đ → đơn nhận; quà sendTax = false (máy in bill Z); chứng từ: dòng quà 0đ, chỉ doanh thu / thuế của lon sữa', async () => {
    const r = await post('/orders', order());
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o).toMatchObject({ code: 'HD2611000001', status: 'completed', subtotal: 300_926, taxTotal: 24_074, total: 325_000 });
    expect(o.payment).toMatchObject({ mode: 'cash', cashGiven: 500_000, change: 175_000 });
    expect(o.customer).toEqual({ id: '0901234567', name: 'Chị Lan', phone: '0901234567' });
    // Đơn trả máy: bill chính có lon sữa; quà tách sang bill Z HD2611000001Z (in riêng, bản sao website zsale / zexport).
    expect(o.lines.map((l: { sku: string; sendTax: boolean; amount: number; taxAmount: number }) => [l.sku, l.sendTax, l.amount, l.taxAmount])).toEqual([[SKU, true, 300_926, 24_074]]);
    expect(o.zBill).toEqual({ code: 'HD2611000001Z', lines: [expect.objectContaining({ lineId: 'l2', sku: QUA, sendTax: false, amount: 0, taxAmount: 0 })] });

    const key = `pos:CN01:sale:${ID1}`;
    const doc = await payload(key);
    expect(doc.lines.map((l) => [l.sku, l.isGift ?? false, l.amountBeforeTax, l.taxAmount])).toEqual([[SKU, false, 300_926, 24_074], [QUA, true, 0, 0]]);
    expect(doc.partner).toMatchObject({ code: '0901234567', name: 'Chị Lan' });
    // Không doanh thu, không thuế cho quà: sổ chỉ có phần của lon sữa.
    expect(await byAccount(key)).toEqual({ '1111': [325_000, 0], '1311': [325_000, 325_000], '33311': [0, 24_074], '51111': [0, 300_926] });
  });

  it('kiểm 1: khách mới có ở danh mục đối tượng theo chứng từ bán; tìm lại ở máy bán thấy kèm số đơn', async () => {
    const partner = (await sql<{ name: string; kind: string }>`SELECT name, kind FROM partners WHERE tenant_id = ${tenantId} AND code = '0901234567'`.execute(db)).rows;
    expect(partner).toEqual([{ name: 'Chị Lan', kind: 'customer' }]);
    const found = await get('/customers?q=0901234567');
    expect(found.statusCode, found.body).toBe(200);
    expect(found.json().data).toEqual([expect.objectContaining({ id: '0901234567', name: 'Chị Lan', orderCount: 1 })]);
    const lookup = await get('/customers/lookup?phone=0901234567');
    expect(lookup.statusCode, lookup.body).toBe(200);
    expect(lookup.json().data).toMatchObject({ id: '0901234567', name: 'Chị Lan' });
  });

  it('kiểm 1 (SĐT đã có): đơn sau gửi khách cũ theo mã → không tạo đối tượng thứ hai, tên cũ giữ nguyên', async () => {
    const r = await post('/orders', order({ id: ID2, customer: { partnerId: '0901234567' }, lines: [{ lineId: 'l1', sku: QUA, unitName: 'Cái', unitQty: 2, clientUnitPrice: 0 }], clientTotal: 0, payment: { mode: 'cash', cashGiven: 0 } }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    // Đơn chỉ có quà 0đ: nhận, tổng 0, cả đơn là bill Z.
    expect(o).toMatchObject({ total: 0, customer: { id: '0901234567', name: 'Chị Lan' } });
    expect(o.lines).toEqual([]);
    expect(o.zBill.lines).toEqual([expect.objectContaining({ sku: QUA, unitQty: 2, sendTax: false })]);
    expect((await payload(`pos:CN01:sale:${ID2}`)).lines).toEqual([expect.objectContaining({ sku: QUA, isGift: true, qty: 2, amountBeforeTax: 0 })]);
    const n = (await sql<{ n: string }>`SELECT count(*) AS n FROM partners WHERE tenant_id = ${tenantId} AND code = '0901234567'`.execute(db)).rows[0]!.n;
    expect(Number(n)).toBe(1);
    expect((await get('/customers?q=0901234567')).json().data[0].orderCount).toBe(2);
  });

  // [2026-11-15 01:50 PM Võ Hoàng] POS-BILLZ — NT-BH-019 bước 2: phiếu trả mang cờ quà (đóng góp)
  it('kiểm 5: trả hàng — quà bill Z trả kèm, phiếu trả ghi dòng quà 0đ như chứng từ bán; lon sữa trả đúng tiền', async () => {
    const left = await get(`/orders/${ID1}/returnable?branch=CN01`);
    expect(left.statusCode, left.body).toBe(200);
    expect(left.json().data.lines.map((l: { lineId: string; returnableQty: number; lineTotal: number }) => [l.lineId, l.returnableQty, l.lineTotal])).toEqual([['l1', 1, 325_000], ['l2', 1, 0]]);
    const RID = '0193a1b2-0000-7000-8000-000000019101';
    const r = await post('/returns', { id: RID, orderId: ID1, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }, { lineId: 'l2', qty: 1 }], refundMethod: 'TM', reason: 'Khách trả cả quà' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data).toMatchObject({ refundTotal: 325_000 });
    const p = (await sql<{ p: { lines: { sku: string; isGift?: boolean; amountBeforeTax: number }[]; totals: unknown } }>`
      SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`pos:CN01:sale_return:${RID}`}`.execute(db)).rows[0]!.p;
    expect(p.lines.map((l) => [l.sku, l.isGift ?? false, l.amountBeforeTax])).toEqual([[SKU, false, 300_926], [QUA, true, 0]]);
    expect(p.totals).toEqual({ beforeTax: 300_926, tax: 24_074, total: 325_000 });
  });

  it('kiểm 4: chuyển dòng 0đ của đơn đã xong sang bill Z — đơn phiên bản mới, bản sao website phát lại; sổ không đổi; dòng có tiền bị chặn', async () => {
    const ID3 = '0193a1b2-0000-7000-8000-000000019005';
    // Dòng 0đ của mã CÓ gửi thuế (giảm tay 100%) ở bill chính — POS cũ cho chuyển sang bill Z để không lên hoá đơn.
    const r = await post('/orders', order({ id: ID3, customer: { retail: true }, lines: [
      { lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000 },
      { lineId: 'l2', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000, manualDiscount: { kind: 'percent', value: 100 } },
    ] }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.zBill).toBeUndefined();
    const ledgerBefore = await byAccount(`pos:CN01:sale:${ID3}`);

    const money = await post(`/orders/${ID3}/lines/l1/move-to-z`, {});
    expect(money.statusCode, money.body).toBe(409);
    expect((await post(`/orders/${ID3}/lines/khong-co/move-to-z`, {})).statusCode).toBe(404);

    const m = await post(`/orders/${ID3}/lines/l2/move-to-z`, {});
    expect(m.statusCode, m.body).toBe(200);
    const moved = m.json().data;
    expect(moved.lines.map((l: { lineId: string }) => l.lineId)).toEqual(['l1']);
    expect(moved.zBill).toEqual({ code: `${o.code}Z`, lines: [expect.objectContaining({ lineId: 'l2', amount: 0, sendTax: false })] });
    // Gọi lại: trả đơn như đã chuyển, không tăng phiên bản.
    const again = await post(`/orders/${ID3}/lines/l2/move-to-z`, {});
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().data.zBill.lines).toHaveLength(1);
    const row = (await sql<{ version: number }>`SELECT version FROM mod_pos.orders WHERE tenant_id = ${tenantId} AND order_id = ${ID3}`.execute(db)).rows[0]!;
    expect(row.version).toBe(2);
    const evts = (await sql<{ n: string }>`SELECT count(*) AS n FROM event_outbox WHERE tenant_id = ${tenantId} AND dedupe_key = ${`pos.order.recorded:${ID3}:v2`}`.execute(db)).rows[0]!.n;
    expect(Number(evts)).toBe(1);
    // Sổ không đổi: một phiên bản chứng từ, cùng số phát sinh.
    expect(await byAccount(`pos:CN01:sale:${ID3}`)).toEqual(ledgerBefore);
    expect((await get(`/orders/${ID3}?branch=CN01`)).json().data.zBill.code).toBe(`${o.code}Z`);
  });

  it('lệch chuẩn 1: SĐT sai khuôn / thiếu tên → chặn, chỉ rõ ô', async () => {
    const bad = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-000000019003', customer: { phone: '090123', name: 'Chị Lan' } }));
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ reason: 'POS_BAD_PHONE', field: 'customer.phone' });
    const noName = await post('/orders', order({ id: '0193a1b2-0000-7000-8000-000000019004', customer: { phone: '0901234568', name: ' ' } }));
    expect(noName.statusCode, noName.body).toBe(400);
    expect(noName.json().error.details).toMatchObject({ reason: 'POS_MISSING_NAME', field: 'customer.name' });
  });
});
