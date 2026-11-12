/**
 * NT-BH-005 — hoàn hàng, đổi hàng, huỷ đơn từ máy bán POS (kế hoạch module POS đợt W2): gọi HTTP như máy bán vào module pos,
 * đối chiếu phiếu trả, chứng từ sale_return / sale + bút toán trong sổ với phiếu docs/nghiem-thu/ban-hang/NT-BH-005-pos-hoan-doi-huy.md.
 * Ngày bán = hôm qua (trong hạn 3 ngày), ngày trả = hôm nay theo giờ Việt Nam. Chưa có module → bỏ qua.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners'];
const vnDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
const YESTERDAY = vnDate(-1);
const PERIOD = TODAY.slice(2, 4) + TODAY.slice(5, 7);

const O2 = '0193a1b2-0000-7000-8000-000000005002';
const O3 = '0193a1b2-0000-7000-8000-000000005003';
const R1 = '0193a1b2-0000-7000-8000-00000000r001';
const R2 = '0193a1b2-0000-7000-8000-00000000r002';
const R3 = '0193a1b2-0000-7000-8000-00000000r003';
const N3 = '0193a1b2-0000-7000-8000-00000000n003';

const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, branchCode: 'CN01', businessDate: YESTERDAY, shiftId: `ngay-${YESTERDAY}`, exportReasonCode: 'XBA', customer: { retail: true },
  lines: [
    { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 324_000, manualDiscount: { kind: 'percent', value: 10 } },
    { lineId: 'l2', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 },
  ],
  promotionSelections: [], payment: { mode: 'split', parts: [{ method: 'TM', amount: 300_000 }, { method: 'CK', amount: 498_200 }] },
  clientTotal: 798_200, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-005 — hoàn hàng, đổi hàng, huỷ đơn từ máy POS', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const post = (url: string, payload: unknown, key = `nt-bh-005-${++k}-${Date.now()}`) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': key } });
  const get = (url: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: { authorization: `Bearer ${ctx.token}` } });
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
  const payload = async (docKey: string) => (await sql<{ p: Record<string, unknown> }>`
    SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]?.p;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-005', trx as never); });
    app = await buildApp();
    const put = await app.inject({
      method: 'PUT', url: '/api/v1/products', headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-005-sp-${Date.now()}` },
      payload: { products: [{ sku: 'SUA400', name: 'Sữa bột 400g', unit: 'Hộp' }, { sku: 'TA01', name: 'Tã quần L', unit: 'Gói' }] },
    });
    expect(put.statusCode, put.body).toBeLessThan(300);
    for (const [sku, taxOutCode] of [['SUA400', 'R08'], ['TA01', 'R10']] as const) {
      const r = await app.inject({ method: 'PUT', url: `/api/v1/products/${sku}`, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-005-${sku}-${Date.now()}` }, payload: { taxOutCode } });
      expect(r.statusCode, r.body).toBe(200);
    }
    for (const id of [O2, O3]) {
      const r = await post('/orders', order(id, id === O3 ? { payment: { mode: 'cash', cashGiven: 800_000 } } : {}));
      expect(r.statusCode, r.body).toBe(201);
    }
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('tra đơn theo mã phiếu; còn trả được của đơn gốc; hạn trả = ngày bán + 3', async () => {
    const code = (await get(`/orders/${O2}`)).json().data.code as string;
    const lk = await get(`/orders/lookup?code=${code.toLowerCase()}&branch=CN01`);
    expect(lk.statusCode, lk.body).toBe(200);
    expect(lk.json().data.id).toBe(O2);
    const r = await get(`/orders/${O2}/returnable?branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d).toMatchObject({ late: false, blockers: [] });
    expect(d.lines.map((l: { lineId: string; returnableQty: number; lineTotal: number }) => [l.lineId, l.returnableQty, l.lineTotal])).toEqual([['l1', 2, 583_200], ['l2', 1, 215_000]]);
  });

  it('tình huống 1: trả 1 hộp, TM 291.600 → TH…0001; Nợ 52131 270.000, Nợ 33311 21.600 / Có 1311; Nợ 1311 / Có 1111 291.600', async () => {
    const r = await post('/returns', { id: R1, orderId: O2, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
    expect(r.statusCode, r.body).toBe(201);
    const ret = r.json().data;
    expect(ret).toMatchObject({ code: `TH${PERIOD}000001`, orderId: O2, refundTotal: 291_600, refundMethod: 'TM', businessDate: TODAY });
    expect(ret.lines).toEqual([expect.objectContaining({ lineId: 'l1', qty: 1, refund: 291_600 })]);
    const docKey = `pos:CN01:sale_return:${R1}`;
    const p = await payload(docKey) as { originalDocKey: string; totals: unknown; payments: unknown };
    expect(p.originalDocKey).toBe(`pos:CN01:sale:${O2}`);
    expect(p.totals).toEqual({ beforeTax: 270_000, tax: 21_600, total: 291_600 });
    expect(p.payments).toEqual([{ methodCode: 'TM', amount: 291_600 }]);
    const a = await byAccount(docKey);
    expect(a['52131']).toEqual([270_000, 0]);
    expect(a['33311']).toEqual([21_600, 0]);
    expect(a['1311']).toEqual([291_600, 291_600]);
    expect(a['1111']).toEqual([0, 291_600]);
  });

  it('lệch chuẩn 1: gửi lại đúng phiếu (khoá gửi khác) → phiếu cũ, không thêm chứng từ', async () => {
    const before = await docCount('pos:CN01:sale_return:%');
    const r = await post('/returns', { id: R1, orderId: O2, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.code).toBe(`TH${PERIOD}000001`);
    expect(await docCount('pos:CN01:sale_return:%')).toBe(before);
  });

  it('tình huống 2: trả nốt hộp còn lại bằng CK → đúng phần còn lại; hết hàng SUA400 có thể trả', async () => {
    const r = await post('/returns', { id: R2, orderId: O2, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'CK', reason: 'Khách đổi ý' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data).toMatchObject({ code: `TH${PERIOD}000002`, refundTotal: 291_600 });
    const a = await byAccount(`pos:CN01:sale_return:${R2}`);
    expect(a['52131']).toEqual([270_000, 0]);
    expect(a['11210005']).toEqual([0, 291_600]);
    const left = (await get(`/orders/${O2}/returnable?branch=CN01`)).json().data.lines;
    expect(left.map((l: { lineId: string; returnableQty: number; refundedAmount: number }) => [l.lineId, l.returnableQty, l.refundedAmount])).toEqual([['l1', 0, 583_200], ['l2', 1, 0]]);
  });

  it('lệch chuẩn 2–7: trả quá số, dòng lạ, khác chi nhánh của máy, hình thức sai, thiếu lý do → không phiếu, không chứng từ', async () => {
    const before = await docCount('pos:%:sale_return:%');
    const base = { orderId: O2, branchCode: 'CN01', refundMethod: 'TM', reason: 'x' };
    const cases: [string, Record<string, unknown>, number, string | null][] = [
      ['trả quá số', { lines: [{ lineId: 'l1', qty: 1 }] }, 400, 'POS_RETURN_QTY'],
      ['dòng lạ', { lines: [{ lineId: 'zz', qty: 1 }] }, 400, 'POS_RETURN_QTY'],
      ['hình thức QR', { lines: [{ lineId: 'l2', qty: 1 }], refundMethod: 'QR' }, 400, 'POS_REFUND_METHOD'],
      ['đối trừ ngoài đổi hàng', { lines: [{ lineId: 'l2', qty: 1 }], refundMethod: 'doi_tru' }, 400, 'POS_REFUND_METHOD'],
      ['thiếu lý do', { lines: [{ lineId: 'l2', qty: 1 }], reason: ' ' }, 400, null],
    ];
    for (const [name, over, status, reason] of cases) {
      const r = await post('/returns', { ...base, id: `0193a1b2-0000-7000-8000-0000000bad${++k}`, ...over });
      expect(r.statusCode, `${name}: ${r.body}`).toBe(status);
      if (reason) expect(r.json().error.details.reason, name).toBe(reason);
    }
    expect(await docCount('pos:%:sale_return:%')).toBe(before);
  });

  it('tình huống 3: đổi 1 hộp lấy 2 gói tã — sale_return không trả tiền + sale mới đối trừ 291.600, khách trả thêm TM 138.400', async () => {
    const r = await post('/exchanges', {
      id: R3,
      return: { id: R3, orderId: O3, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'doi_tru', reason: 'Đổi hàng' },
      order: order(N3, {
        businessDate: TODAY, shiftId: `ngay-${TODAY}`, lines: [{ lineId: 'n1', sku: 'TA01', unitName: 'Gói', unitQty: 2, clientUnitPrice: 215_000 }],
        payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 291_600 }, { method: 'TM', amount: 138_400 }] }, clientTotal: 430_000,
      }),
    });
    expect(r.statusCode, r.body).toBe(201);
    const d = r.json().data;
    expect(d.return).toMatchObject({ refundTotal: 291_600, refundMethod: 'doi_tru', exchangeOrderId: N3 });
    expect(d.order.order).toMatchObject({ id: N3, subtotal: 390_909, taxTotal: 39_091, total: 430_000 });
    const ret = await payload(`pos:CN01:sale_return:${R3}`) as { payments: unknown };
    expect(ret.payments).toEqual([]);
    const sale = await payload(`pos:CN01:sale:${N3}`) as { offsets: unknown; payments: unknown };
    expect(sale.offsets).toEqual([{ docKey: `pos:CN01:sale_return:${R3}`, amount: 291_600 }]);
    expect(sale.payments).toEqual([{ methodCode: 'TM', amount: 138_400 }]);
    const a = await byAccount(`pos:CN01:sale:${N3}`);
    expect(a['51111']).toEqual([0, 390_909]);
    expect(a['33311']).toEqual([0, 39_091]);
    expect(a['1111']).toEqual([138_400, 0]);
  });

  it('lệch chuẩn 8, 10: đổi sang hàng rẻ hơn → chặn, không phiếu trả, không đơn mới', async () => {
    const before = [await docCount('pos:%:sale_return:%'), await docCount('pos:%:sale:%')];
    const id = '0193a1b2-0000-7000-8000-00000000r004';
    const r = await post('/exchanges', {
      id, return: { id, orderId: O3, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'doi_tru', reason: 'Đổi hàng' },
      order: order('0193a1b2-0000-7000-8000-00000000n004', {
        businessDate: TODAY, lines: [{ lineId: 'n1', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 }],
        payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 291_600 }] }, clientTotal: 215_000,
      }),
    });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details.reason).toBe('POS_EXCHANGE_LOWER');
    expect([await docCount('pos:%:sale_return:%'), await docCount('pos:%:sale:%')]).toEqual(before);
  });

  it('lệch chuẩn 11: huỷ đơn đã hoàn tất → 409 POS_CANCEL_COMPLETED', async () => {
    const r = await post(`/orders/${O2}/cancel`, { reason: 'Bấm nhầm' });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().error.details.reason).toBe('POS_CANCEL_COMPLETED');
  });

  it('danh sách phiếu trả của chi nhánh: 3 phiếu, tổng hoàn 874.800', async () => {
    const r = await get(`/returns?branch=CN01&from=${TODAY}&to=${TODAY}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toHaveLength(3);
    expect(r.json().meta).toMatchObject({ page: 1, total: 3, sums: { refundTotal: 874_800 } });
  });

  it('khách hàng: đơn có SĐT tự thêm khách; tìm theo SĐT / tên không dấu, tra theo SĐT, đơn của khách', async () => {
    const id = '0193a1b2-0000-7000-8000-000000005009';
    const o = await post('/orders', order(id, { customer: { phone: '0911 555 666', name: 'Nguyễn Thị Hoà' }, payment: { mode: 'cash', cashGiven: 800_000 } }));
    expect(o.statusCode, o.body).toBe(201);
    const byPhone = await get('/customers?q=555666');
    expect(byPhone.statusCode, byPhone.body).toBe(200);
    expect(byPhone.json().data[0]).toMatchObject({ id: '0911555666', name: 'Nguyễn Thị Hoà', orderCount: 1 });
    const byName = await get('/customers?q=' + encodeURIComponent('thi hoa'));
    expect(byName.json().data.map((c: { id: string }) => c.id)).toContain('0911555666');
    expect((await get('/customers/lookup?phone=0911555666')).json().data).toMatchObject({ id: '0911555666' });
    expect((await get('/customers/lookup?phone=0999999999')).statusCode).toBe(404);
    const orders = await get('/customers/0911555666/orders');
    expect(orders.statusCode, orders.body).toBe(200);
    expect(orders.json().data.map((x: { id: string }) => x.id)).toEqual([id]);
    expect(orders.json().meta).toMatchObject({ total: 1, sums: { total: 798_200 } });
  });

  it('bản sao WP: mỗi đơn / phiếu trả phát đúng một sự kiện outbox (pos.order.recorded / pos.return.recorded) mang bản chụp; gửi lại không phát thêm', async () => {
    const ev = async (type: string, subject: string) => (await sql<{ data: Record<string, unknown> }>`
      SELECT data FROM event_outbox WHERE tenant_id = ${tenantId} AND type = ${type} AND subject = ${subject}`.execute(db)).rows;
    const o = await ev('pos.order.recorded', `pos.order:${O2}`);
    expect(o).toHaveLength(1);
    expect(o[0]!.data).toMatchObject({ orderId: O2, branchCode: 'CN01', docKey: `pos:CN01:sale:${O2}`, order: { id: O2, total: 798_200 } });
    const r = await ev('pos.return.recorded', `pos.return:${R1}`);
    expect(r).toHaveLength(1);
    expect(r[0]!.data).toMatchObject({ returnId: R1, orderId: O2, originalDocKey: `pos:CN01:sale:${O2}`, return: { refundTotal: 291_600 } });
    expect(await ev('pos.order.recorded', `pos.order:${N3}`)).toHaveLength(1);
  });

  it('app tgs-wp: đơn vị đã kết nối thì sự kiện đơn mới có việc giao cho tgs-wp.webhook; đơn vị chưa kết nối thì không', async () => {
    const O9 = '0193a1b2-0000-7000-8000-000000005021';
    const O10 = '0193a1b2-0000-7000-8000-000000005022';
    const queued = async (id: string) => (await sql<{ status: string }>`
      SELECT d.status FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id
       WHERE d.tenant_id = ${tenantId} AND d.consumer = 'tgs-wp.webhook' AND o.subject = ${`pos.order:${id}`}`.execute(db)).rows;
    { const r9 = await post('/orders', order(O9, { payment: { mode: 'cash', cashGiven: 800_000 } })); expect(r9.statusCode, r9.body).toBe(201); }
    expect(await queued(O9)).toHaveLength(0);
    const inst = await app.inject({ method: 'POST', url: '/api/v1/apps/tgs-wp/install', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(inst.statusCode, inst.body).toBe(201);
    expect(inst.json().data).toMatchObject({ events: ['pos.order.recorded', 'pos.return.recorded', 'pos.order.cancelled'] });
    expect(inst.json().data.webhookSecret).toMatch(/^whsec_/);
    expect((await post('/orders', order(O10, { payment: { mode: 'cash', cashGiven: 800_000 } }))).statusCode).toBe(201);
    expect(await queued(O10)).toEqual([{ status: 'pending' }]);
  });

  it('app tgs-wp: APP_WEBHOOK_URL_TGS_WP đè địa chỉ webhook của manifest (mỗi môi trường một website)', async () => {
    const before = process.env['APP_WEBHOOK_URL_TGS_WP'];
    process.env['APP_WEBHOOK_URL_TGS_WP'] = 'http://shop.example.test/wp-json/tgs-pos/v1/ketoan-events';
    try {
      vi.resetModules();
      const { APP_MANIFESTS } = await import('../src/ung-dung/index.js');
      expect(APP_MANIFESTS.find((m) => m.key === 'tgs-wp')?.app?.webhook?.url).toBe('http://shop.example.test/wp-json/tgs-pos/v1/ketoan-events');
    } finally {
      if (before === undefined) delete process.env['APP_WEBHOOK_URL_TGS_WP']; else process.env['APP_WEBHOOK_URL_TGS_WP'] = before;
    }
  });
});
