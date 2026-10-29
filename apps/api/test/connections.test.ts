/**
 * Kết nối hệ thống khác (ACC14): kéo chứng từ từ đầu chuẩn (2 trang, có cursor) và từ WooCommerce; chứng từ kéo về
 * luôn chờ định khoản dù loại chứng từ đặt định khoản ngay; nguồn = mã kết nối, có loại phiếu nguồn để lọc; kéo lại
 * cùng phiên bản thì bỏ qua; khoá bí mật trả dạng che, ghi lại chuỗi che thì giữ khoá cũ.
 * Xem trước định khoản: bút toán sẽ ghi, không ghi gì thật.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'kysely';
import { SECRET_MASK, APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

const setModes = (m: 'auto' | 'approve') => call(ctx, 'PUT', '/api/v1/settings/posting-modes', Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, m])));
let server: Server;
let base = '';
const seen: { url: string; auth: string | undefined }[] = [];
const acks: { received: { docKey: string; status: string }[]; rejected: { docKey: string }[] }[] = [];

const wpDocs = [
  saleDoc({ docKey: 'wp:26001:10:501', docNo: 'BL501', sourceRef: { type: 'sale_order', id: '501', label: 'Phiếu bán hàng' } }),
  saleDoc({ docKey: 'wp:26001:10:502', docNo: 'BL502', invoice: undefined, sourceRef: { type: 'sale_order', id: '502' } }),
  { docType: 'transfer', docKey: 'wp:26001:12:77', branchCode: 'CN01', toBranchCode: 'CN01', docNo: 'CK77', docDate: '2026-10-05', status: 'received', sourceRef: { type: 'transfer_export', id: '77' },
    lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 0 }], totals: { total: 0 } },
  { docType: 'sale', docKey: 'wp:26001:10:bad', docNo: 'SAI' }, // sai khuôn
];
const wooOrders = [
  { id: 9001, number: '9001', status: 'completed', date_created: '2026-10-05T10:00:00', date_modified_gmt: '2026-10-05T03:00:00', date_paid: '2026-10-05T10:01:00',
    customer_id: 0, billing: { first_name: 'B', last_name: 'Trần', phone: '0988000111' }, payment_method: 'cod', payment_method_title: 'Trả tiền khi nhận',
    line_items: [{ id: 1, sku: 'SUA01', name: 'Sữa bột 900g', quantity: 2, subtotal: '400000', total: '370000', total_tax: '0' }],
    shipping_lines: [{ id: 5, method_title: 'Giao nhanh', total: '30000', total_tax: '0' }] },
  { id: 9002, status: 'cancelled', line_items: [] },
];

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp' }] });
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    seen.push({ url: req.url ?? '', auth: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/cong-huy') {
      if (req.method === 'POST') { let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { acks.push(JSON.parse(body)); res.end('{}'); }); return; }
      res.end(JSON.stringify({ documents: [], cancelled: [{ docKey: 'wp:26001:10:502', reason: 'Phiếu đã xoá ở shop' }, { docKey: 'wp:khong-co', reason: '' }], nextCursor: null }));
      return;
    }
    if (u.pathname === '/cong-httt') {
      if (req.method === 'POST') { req.resume(); res.end('{}'); return; }
      res.end(JSON.stringify({ documents: [
        saleDoc({ docKey: 'wp:httt:10:1', docNo: 'BL-HTTT-1', invoice: undefined, payments: [{ methodCode: 'QR-DI-BIDB', amount: 100000, reference: 'TT-1' }] }),
        { docType: 'customer_payment', docKey: 'wp:httt:7:1', docNo: 'TT-HTTT-1', docDate: '2026-10-10', branchCode: 'CN01', methodCode: 'QR-DI-BIDB', version: 1,
          partner: { code: '0912345678' }, lines: [{ lineKey: 'l1', amount: 50000, invoiceDocKey: 'wp:httt:10:1' }], totals: { total: 50000 } },
      ], nextCursor: null }));
      return;
    }
    if (u.pathname === '/cong-chan-post') {
      if (req.method === 'POST') { res.statusCode = 403; res.setHeader('content-type', 'text/html'); res.end('<h1>Request blocked by firewall</h1>'); return; }
      if (u.searchParams.get('ack')) { acks.push(JSON.parse(u.searchParams.get('ack')!)); res.end('{"ok":true}'); return; }
      res.end(JSON.stringify({ documents: [saleDoc({ docKey: 'wp:08016:10:1', docNo: 'BL-08016-1', branchCode: '08016', invoice: undefined }), saleDoc({ docKey: 'wp:CP:10:1', docNo: 'BL-CP-1', branchCode: 'CHAUPHONG', invoice: undefined })], nextCursor: null }));
      return;
    }
    if (u.pathname === '/cong-cho' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { acks.push(JSON.parse(body)); res.end('{"ok":true}'); });
      return;
    }
    if (u.pathname === '/cong-cho') {
      if (req.headers.authorization !== 'Bearer khoa-wp') { res.statusCode = 401; res.end('{"message":"sai khoá"}'); return; }
      const page2 = u.searchParams.get('cursor') === 'p2';
      res.end(JSON.stringify(page2 ? { documents: wpDocs.slice(2), nextCursor: null } : { documents: wpDocs.slice(0, 2), nextCursor: 'p2' }));
      return;
    }
    if (u.pathname === '/wp-json/wc/v3/orders') {
      res.setHeader('x-wp-totalpages', '1');
      res.end(JSON.stringify(wooOrders));
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await ctx.app.close();
});

const conns = () => ({
  connections: [
    { code: 'btsoft', name: 'Multisite bán hàng', kind: 'standard', url: `${base}/cong-cho`, apiKey: 'khoa-wp' },
    { code: 'shop-online', name: 'Cửa hàng online', kind: 'woocommerce', url: base, apiKey: 'ck_1', apiSecret: 'cs_1', branchCode: 'CN01', taxCode: 'KCT', methodMap: { cod: 'TM' } },
  ],
});

describe('Kết nối hệ thống khác', () => {
  it('ghi cấu hình; khoá bí mật trả dạng che, ghi lại chuỗi che thì giữ khoá cũ', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/connections', conns());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data[0]).toMatchObject({ code: 'btsoft', apiKey: SECRET_MASK, lastPull: null });
    const again = conns();
    again.connections[0]!.apiKey = SECRET_MASK;
    expect((await call(ctx, 'PUT', '/api/v1/connections', again)).status).toBe(200);
    const t = await call(ctx, 'POST', '/api/v1/connections/btsoft/test');
    expect(t.body.data, JSON.stringify(t.body)).toMatchObject({ ok: true });
    expect(seen.at(-1)?.auth).toBe('Bearer khoa-wp');
  });

  it('kéo từ đầu chuẩn: đọc hết các trang, chứng từ chờ định khoản (dù đang đặt định khoản ngay), báo chứng từ sai khuôn', async () => {
    const r = await call(ctx, 'POST', '/api/v1/connections/btsoft/pull', { from: '2026-10-01', to: '2026-10-31' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ fetched: 4, received: 3, unchanged: 0 });
    expect(r.body.data.errors.map((e: { docNo: string }) => e.docNo)).toEqual(['SAI']);
    expect(seen.some((s) => s.url.includes('cursor=p2'))).toBe(true);
    // Báo nhận từng trang cho hệ thống nguồn.
    expect(acks.flatMap((a) => a.received.map((x) => x.docKey)).sort()).toEqual(['wp:26001:10:501', 'wp:26001:10:502', 'wp:26001:12:77']);
    expect(acks.flatMap((a) => a.rejected.map((x) => x.docKey))).toEqual(['wp:26001:10:bad']);
    const list = await call(ctx, 'GET', '/api/v1/documents?status=pending&sourceSystem=btsoft&from=2026-10-01&to=2026-10-31');
    expect(list.body.data.map((d: { docNo: string }) => d.docNo).sort()).toEqual(['BL501', 'BL502', 'CK77']);
    const sale = list.body.data.find((d: { docNo: string }) => d.docNo === 'BL501');
    expect(sale).toMatchObject({ sourceSystem: 'btsoft', sourceType: 'sale_order', sourceLabel: 'Phiếu bán hàng' });
    const byType = await call(ctx, 'GET', '/api/v1/documents?sourceType=transfer_export&from=2026-10-01&to=2026-10-31');
    expect(byType.body.data.map((d: { docNo: string }) => d.docNo)).toEqual(['CK77']);
    // Kéo lại: cùng phiên bản thì bỏ qua.
    const again = await call(ctx, 'POST', '/api/v1/connections/btsoft/pull', { from: '2026-10-01', to: '2026-10-31' });
    expect(again.body.data).toMatchObject({ received: 0, unchanged: 3 });
    expect((await call(ctx, 'GET', '/api/v1/connections')).body.data[0].lastPull).toMatchObject({ fetched: 4, unchanged: 3 });
  });

  it('xem trước định khoản: bút toán sẽ ghi, không ghi gì thật; định khoản xong thì vào sổ', async () => {
    const doc = await db.selectFrom('accounting_events').select('id').where('doc_key', '=', 'wp:26001:10:501').orderBy('id', 'desc').executeTakeFirstOrThrow();
    const p = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/preview`);
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.data.ok).toBe(true);
    const lines = p.body.data.entries.flatMap((e: { lines: { accountCode: string; debit: number; credit: number }[] }) => e.lines);
    expect(lines.reduce((s: number, l: { debit: number }) => s + l.debit, 0)).toBe(lines.reduce((s: number, l: { credit: number }) => s + l.credit, 0));
    expect(lines.some((l: { accountCode: string; credit: number }) => l.accountCode.startsWith('511') && l.credit === 185185)).toBe(true);
    expect(p.body.data.invoice).toMatchObject({ no: '0000123' });
    const n = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM ledger_entries WHERE event_id = ${doc.id}`.execute(db);
    expect(Number(n.rows[0]!.n)).toBe(0); // không ghi gì
    expect((await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id] })).body.data.posted).toBe(1);
  });

  it('xem trước chứng từ lỗi cấu hình: trả lời lỗi, không văng', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'wp:26001:10:600', docNo: 'BL600', lines: [{ lineKey: 'l1', sku: 'X', qty: 1, amountBeforeTax: 100, taxCode: 'R99', taxAmount: 0 }], payments: [], invoice: undefined, totals: { beforeTax: 100, tax: 0, total: 100 } }));
    const doc = await db.selectFrom('accounting_events').select('id').where('doc_key', '=', 'wp:26001:10:600').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(r.status).toBe(200);
    const p = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/preview`);
    expect(p.body.data).toMatchObject({ ok: false });
    expect(p.body.data.error).toContain('R99');
  });

  it('kéo từ WooCommerce: đơn hoàn tất thành hoá đơn bán (phí giao hàng một dòng, thu theo cổng thanh toán), đơn huỷ bỏ qua', async () => {
    const r = await call(ctx, 'POST', '/api/v1/connections/shop-online/pull', { from: '2026-10-01', to: '2026-10-31' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ fetched: 1, received: 1, errors: [] });
    expect(seen.at(-1)?.auth).toBe(`Basic ${Buffer.from('ck_1:cs_1').toString('base64')}`);
    const d = await call(ctx, 'GET', '/api/v1/documents?sourceSystem=shop-online&from=2026-10-01&to=2026-10-31');
    expect(d.body.data).toHaveLength(1);
    expect(d.body.data[0]).toMatchObject({ docNo: 'WOO9001', status: 'pending', total: 400000, sourceType: 'woo_order' });
    const full = (await call(ctx, 'GET', `/api/v1/documents/${d.body.data[0].id}`)).body.data;
    expect(full.payload.lines.map((l: { sku: string; amountBeforeTax: number }) => `${l.sku}:${l.amountBeforeTax}`)).toEqual(['SUA01:370000', 'PHIVANCHUYEN:30000']);
    expect(full.payload.payments).toEqual([expect.objectContaining({ methodCode: 'TM', amount: 400000 })]);
  });

  it('chi nhánh theo mã shop: đuôi chữ của danh mục cũ (08016 → 08016Plus), hoặc mã tham chiếu ở hệ thống nguồn; POST báo nhận bị chặn thì báo nhận bằng GET', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: '08016Plus', name: 'Đền Hùng' })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN-CP', name: 'Châu Phong', externalRef: 'CHAUPHONG' })).status).toBe(201);
    const list = conns();
    list.connections.push({ code: 'chan-post', name: 'Máy chủ chặn POST', kind: 'standard', url: `${base}/cong-chan-post`, apiKey: '' } as never);
    expect((await call(ctx, 'PUT', '/api/v1/connections', list)).status).toBe(200);
    acks.length = 0;
    const r = await call(ctx, 'POST', '/api/v1/connections/chan-post/pull', { from: '2026-10-01', to: '2026-10-31' });
    expect(r.body.data, JSON.stringify(r.body)).toMatchObject({ received: 2, errors: [] });
    expect(r.body.data.ackError).toBeUndefined();
    expect(acks.flatMap((a) => a.received.map((x) => x.docKey)).sort()).toEqual(['wp:08016:10:1', 'wp:CP:10:1']);
    const d = await call(ctx, 'GET', '/api/v1/documents?sourceSystem=chan-post&from=2026-10-01&to=2026-10-31');
    expect(d.body.data.map((x: { docNo: string; branchCode: string }) => `${x.docNo}@${x.branchCode}`).sort()).toEqual(['BL-08016-1@08016Plus', 'BL-CP-1@CN-CP']);
  });

  it('bảng đổi hình thức của kết nối: mã hình thức nguồn đổi sang mã đã khai (phiếu thanh toán, khoản thu kèm phiếu)', async () => {
    const list = conns();
    list.connections.push({ code: 'httt', name: 'Nguồn có hình thức riêng', kind: 'standard', url: `${base}/cong-httt`, apiKey: '', methodMap: { 'QR-DI-BIDB': 'TM' } } as never);
    expect((await call(ctx, 'PUT', '/api/v1/connections', list)).status).toBe(200);
    const r = await call(ctx, 'POST', '/api/v1/connections/httt/pull', { from: '2026-10-01', to: '2026-10-31' });
    expect(r.body.data, JSON.stringify(r.body)).toMatchObject({ received: 2, errors: [] });
    const rows = await db.selectFrom('accounting_events').select(['doc_key', 'payload']).innerJoin('tenants', 'tenants.id', 'accounting_events.tenant_id').where('tenants.code', '=', ctx.tenantCode).where('doc_key', 'in', ['wp:httt:10:1', 'wp:httt:7:1']).execute();
    const by = new Map(rows.map((x) => [x.doc_key, x.payload as { methodCode?: string; payments?: { methodCode: string }[] }]));
    expect(by.get('wp:httt:7:1')!.methodCode).toBe('TM');
    expect(by.get('wp:httt:10:1')!.payments!.map((x) => x.methodCode)).toEqual(['TM']);
  });

  it('kéo theo chi nhánh đang chọn: đầu chuẩn gửi shops= mã chi nhánh; WooCommerce chỉ kéo khi chi nhánh nhận đơn nằm trong danh sách', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/connections', conns())).status).toBe(200);
    seen.length = 0;
    await call(ctx, 'POST', '/api/v1/connections/btsoft/pull', { from: '2026-10-01', to: '2026-10-31', branchCodes: ['CN01'] });
    const reads = seen.map((x) => new URL(x.url, 'http://x').searchParams).filter((q) => q.get('from')); // bỏ lượt báo nhận
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((q) => q.get('shops') === 'CN01')).toBe(true);
    const woo = await call(ctx, 'POST', '/api/v1/connections/shop-online/pull', { from: '2026-10-01', to: '2026-10-31', branchCodes: ['CN02'] });
    expect(woo.body.data).toMatchObject({ fetched: 0, received: 0 });
  });

  it('phiếu đã xoá ở nguồn (cancelled): KHÔNG tự huỷ — về cổng chờ ở trạng thái Chờ huỷ, kế toán định khoản mới huỷ; báo nhận lại; khoá chưa từng nhận thì bỏ qua', async () => {
    // Chế độ Vào cổng chờ: nguồn báo xoá thì vào Chờ huỷ (chế độ Tự động tự huỷ — xem auto-push.test.ts).
    await setModes('approve');
    const list = conns();
    list.connections.push({ code: 'huy', name: 'Nguồn có phiếu xoá', kind: 'standard', url: `${base}/cong-huy`, apiKey: '' } as never);
    expect((await call(ctx, 'PUT', '/api/v1/connections', list)).status).toBe(200);
    acks.length = 0;
    const r = await call(ctx, 'POST', '/api/v1/connections/huy/pull', { from: '2026-10-01', to: '2026-10-31' });
    expect(r.body.data, JSON.stringify(r.body)).toMatchObject({ cancelled: 1, errors: [] });
    const doc = await db.selectFrom('accounting_events').select(['id', 'status', 'cancel_requested_at', 'posted_version']).where('doc_key', '=', 'wp:26001:10:502').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(doc.status).toBe('pending');
    expect(doc.cancel_requested_at).not.toBeNull();
    const active = async () => Number((await db.selectFrom('ledger_entries').select((eb) => eb.fn.countAll<string>().as('n')).where('event_id', '=', doc.id).where('status', '=', 'posted').where('is_reversal', '=', false).executeTakeFirstOrThrow()).n);
    const before = await active();
    // Kéo lại lần nữa: không báo trùng.
    expect((await call(ctx, 'POST', '/api/v1/connections/huy/pull', { from: '2026-10-01', to: '2026-10-31' })).body.data.cancelled).toBe(0);
    const waiting = await call(ctx, 'GET', '/api/v1/documents?status=pending&search=wp:26001:10:502&from=2026-10-01&to=2026-10-31');
    expect(waiting.body.data[0]).toMatchObject({ status: 'pending', cancelReason: 'Phiếu đã xoá ở shop' });
    const pv = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/preview`);
    expect(pv.body.data).toMatchObject({ ok: true, cancel: true, willReverse: before });
    expect(await active()).toBe(before); // chưa định khoản: sổ giữ nguyên
    const posted = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id] });
    expect(posted.body.data.posted, JSON.stringify(posted.body)).toBe(1);
    expect((await db.selectFrom('accounting_events').select('status').where('id', '=', doc.id).executeTakeFirstOrThrow()).status).toBe('cancelled');
    expect(await active()).toBe(0);
    expect((acks[0] as unknown as { cancelled: { docKey: string }[] }).cancelled.map((x) => x.docKey)).toEqual(['wp:26001:10:502', 'wp:khong-co']);
    await setModes('auto');
  });
});
