/**
 * NT-BH-015 — phiếu bán / trả hàng nhập tay vào sổ thật (module phieu-ban, chữ chốt docs/nghiep-vu/21): số theo cửa hàng, chặn trùng;
 * duyệt nộp sale / sale_return; bỏ duyệt đảo bút toán, duyệt lại phiên bản mới; trả nối phiếu gốc, không trả quá số đã bán.
 * Đơn vị test để sale / sale_return ghi ngay để thấy bút toán.
 */
// [2026-11-13 11:50 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-015 (đóng góp)
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

const DIR = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/phieu-ban';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const PERIOD = `${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}`;

/** Phiếu bán 2 hộp SUA330 giá trước thuế 300.000 (thuế 8 %) = 648.000, ghi nợ khách KH001. */
const sale = (over: Record<string, unknown> = {}) => ({
  docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' },
  lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000 }], payments: [], note: 'Bán buôn', ...over,
});

describe.skipIf(!HAS)('NT-BH-015 — phiếu bán / trả nhập tay vào sổ thật', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const auth = () => ({ authorization: `Bearer ${ctx.token}` });
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => app.inject({
    method, url: `${M}${url}`, ...(payload ? { payload: payload as never } : {}), headers: { ...auth(), ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-015-${++k}-${Date.now()}` }) },
  });
  /** Số dư Nợ − Có theo tài khoản của mọi bút toán (kể cả đảo) của một chứng từ. */
  const net = async (docKey: string) => {
    const rows = (await sql<{ account: string; n: string }>`
      SELECT l.account_code AS account, SUM(l.debit - l.credit) AS n
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey}
       GROUP BY l.account_code ORDER BY l.account_code`.execute(db)).rows;
    return Object.fromEntries(rows.map((r) => [r.account, Number(r.n)] as const).filter(([, n]) => n !== 0)) as Record<string, number>;
  };
  const event = async (docKey: string) => (await sql<{ status: string; version: number }>`
    SELECT status, version FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0];

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('phieu-ban', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-015', trx as never); });
    app = await buildApp();
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02') ON CONFLICT DO NOTHING`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/products/SUA330', { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  let saleId = '';
  let saleNo = '';
  it('§5 dòng 1–2: lưu nháp ở máy chủ, số theo cửa hàng × tháng; chi nhánh khác dãy riêng; gõ số đã có → chặn', async () => {
    const a = await req('POST', '/docs', sale());
    expect(a.statusCode, a.body).toBe(200);
    const d = a.json().data;
    expect(d).toMatchObject({ docType: 'sale', status: 'draft', docNo: `BH${PERIOD}000001`, branchCode: 'CN01', totals: { beforeTax: 600_000, tax: 48_000, total: 648_000 } });
    expect(d.lines[0]).toMatchObject({ name: 'Sữa 330', unit: 'Hộp', taxCode: 'R08', amountBeforeTax: 600_000, taxAmount: 48_000 });
    saleId = d.id;
    saleNo = d.docNo;
    expect((await req('POST', '/docs', sale())).json().data.docNo).toBe(`BH${PERIOD}000002`);
    expect((await req('POST', '/docs', sale({ branchCode: 'CN02' }))).json().data.docNo).toBe(`BH${PERIOD}000001`);
    const dup = await req('POST', '/docs', sale({ docNo: saleNo }));
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error.message).toContain('đã có ở chi nhánh CN01');
    const list = await req('GET', `/docs?docType=sale&branchCodes=CN01&from=${TODAY}&to=${TODAY}`);
    expect(list.json().meta.total).toBe(2);
  });

  it('§6: thiếu khách khi ghi nợ, mã hàng lạ, tiền thu quá tổng → báo đủ lỗi, không lưu', async () => {
    const r = await req('POST', '/docs', sale({ partner: undefined, lines: [{ lineKey: 'L1', sku: 'KHONG-CO', qty: 1, unitPrice: 1 }], payments: [{ methodCode: 'TM', amount: 9_999_999 }] }));
    expect(r.statusCode).toBe(400);
    const msg = r.json().error.message as string;
    expect(msg).toContain('KHONG-CO');
    expect(msg).toContain('lớn hơn tổng phiếu');
  });

  it('§5 dòng 5: duyệt → chứng từ sale vào sổ, Nợ phải thu khách 648.000, cân Nợ / Có; phiếu đã duyệt không sửa / xoá được', async () => {
    const r = await req('POST', `/docs/${saleId}/approve`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ status: 'approved', ledgerStatus: 'posted' });
    expect(await event(`phieu-ban:${saleId}`)).toMatchObject({ status: 'posted', version: 1 });
    const n = await net(`phieu-ban:${saleId}`);
    const receivable = Object.entries(n).find(([a]) => a.startsWith('131'));
    expect(receivable?.[1]).toBe(648_000);
    expect(Object.values(n).reduce((s, x) => s + x, 0)).toBe(0);
    expect((await req('PUT', `/docs/${saleId}`, sale({ id: saleId }))).statusCode).toBe(409);
    expect((await req('DELETE', `/docs/${saleId}`)).statusCode).toBe(409);
  });

  it('§5 dòng 6: bỏ duyệt → đảo bút toán (số dư về 0), phiếu về nháp; sửa rồi duyệt lại → phiên bản 2', async () => {
    const u = await req('POST', `/docs/${saleId}/unapprove`, { reason: 'Sai giá' });
    expect(u.statusCode, u.body).toBe(200);
    expect(u.json().data.status).toBe('draft');
    expect(await net(`phieu-ban:${saleId}`)).toEqual({});
    const e = await req('PUT', `/docs/${saleId}`, sale({ id: saleId, lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 3, unitPrice: 300_000 }] }));
    expect(e.statusCode, e.body).toBe(200);
    expect(e.json().data.docNo).toBe(saleNo);
    const a = await req('POST', `/docs/${saleId}/approve`);
    expect(a.statusCode, a.body).toBe(200);
    expect(await event(`phieu-ban:${saleId}`)).toMatchObject({ status: 'posted', version: 2 });
    expect(Object.entries(await net(`phieu-ban:${saleId}`)).find(([x]) => x.startsWith('131'))?.[1]).toBe(972_000);
  });

  it('§5 dòng 7, §6 dòng 6: trả nối phiếu gốc (originalDocKey), không trả quá số còn trả; bỏ duyệt phiếu bán còn phiếu trả → chặn', async () => {
    const ret = (qty: number) => ({ docType: 'sale_return', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, originalDocNo: saleNo, lines: [{ lineKey: 'R1', sku: 'SUA330', qty, unitPrice: 300_000 }] });
    const r1 = await req('POST', '/docs', ret(1));
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json().data.docNo).toBe(`TL${PERIOD}000001`);
    const a1 = await req('POST', `/docs/${r1.json().data.id}/approve`);
    expect(a1.statusCode, a1.body).toBe(200);
    const payload = (await sql<{ p: { originalDocKey?: string } }>`SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`phieu-ban:${r1.json().data.id}`}`.execute(db)).rows[0]!.p;
    expect(payload.originalDocKey).toBe(`phieu-ban:${saleId}`);
    expect((await req('GET', `/docs/${saleId}/returnable`)).json().data.lines[0]).toMatchObject({ sku: 'SUA330', qty: 3, returnable: 2 });
    const r2 = await req('POST', '/docs', ret(3));
    const a2 = await req('POST', `/docs/${r2.json().data.id}/approve`);
    expect(a2.statusCode).toBe(400);
    expect(a2.json().error.message).toContain('còn trả được 2');
    const u = await req('POST', `/docs/${saleId}/unapprove`, {});
    expect(u.statusCode).toBe(400);
    expect(u.json().error.message).toContain('bỏ duyệt phiếu trả trước');
  });

  // [2026-11-14 03:20 PM Võ Hoàng] NGHIEM-THU — bước 2: giá theo cửa hàng + tồn sổ cho form (đóng góp)
  it('bước 2: quote — mặt hàng, mã thuế, tồn theo sổ của chi nhánh (sau bán 3 trả 1 → −2); mã lạ không có; thiếu chi nhánh → rỗng', async () => {
    const r = await app.inject({ method: 'GET', url: `${M}/quote?branch=CN01&skus=SUA330,KHONG-CO`, headers: auth() });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual([expect.objectContaining({ sku: 'SUA330', taxCode: 'R08', stock: -2 })]);
    expect((await app.inject({ method: 'GET', url: `${M}/quote?skus=SUA330`, headers: auth() })).json().data).toEqual([]);
  });
});
