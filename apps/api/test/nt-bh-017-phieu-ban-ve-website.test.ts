/**
 * NT-BH-017 — phiếu bán / trả kế toán lập về website shop (chữ chốt docs/nghiep-vu/23), phía open-ketoan: module phieu-ban phát
 * sự kiện cùng giao dịch (outbox) khi duyệt / bỏ duyệt / duyệt lại; app tgs-wp nghe đủ để giao webhook sang cầu nối.
 */
// [2026-11-14 11:10 AM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-017 (đóng góp)
import { existsSync, readFileSync } from 'node:fs';
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

describe.skipIf(!HAS)('NT-BH-017 — phiếu kế toán lập phát sự kiện cho bản sao website', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url: `${M}${url}`, ...(payload ? { payload: payload as never } : {}), headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-017-${++k}-${Date.now()}` },
  });
  const events = async (id: string) => (await sql<{ type: string; data: Record<string, any> }>`
    SELECT type, data FROM event_outbox WHERE tenant_id = ${tenantId} AND subject = ${`phieu-ban.doc:${id}`} ORDER BY id`.execute(db)).rows;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('phieu-ban', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-017', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/products/SUA330', { taxOutCode: 'R08' })).status).toBe(200);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 dòng 1, 3, 4: duyệt → recorded (TradeDoc, phiên bản 1); bỏ duyệt → cancelled; sửa + duyệt lại → recorded phiên bản 2', async () => {
    const c = await req('POST', '/docs', { docType: 'sale', docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000 }], payments: [{ methodCode: 'TM', amount: 648_000 }] });
    expect(c.statusCode, c.body).toBe(200);
    const id = c.json().data.id as string;
    expect(await events(id)).toEqual([]);

    expect((await req('POST', `/docs/${id}/approve`)).statusCode).toBe(200);
    const e1 = await events(id);
    expect(e1.map((e) => e.type)).toEqual(['phieu-ban.doc.recorded']);
    expect(e1[0]!.data).toMatchObject({ docId: id, docKey: `phieu-ban:${id}`, version: 1, kind: 'sale', branchCode: 'CN01', doc: { docNo: c.json().data.docNo, status: 'approved', totals: { total: 648_000 }, payments: [{ methodCode: 'TM', amount: 648_000 }] } });
    expect(e1[0]!.data.doc.lines[0]).toMatchObject({ sku: 'SUA330', qty: 2, amountBeforeTax: 600_000, taxAmount: 48_000 });

    expect((await req('POST', `/docs/${id}/unapprove`, {})).statusCode).toBe(200);
    expect((await req('PUT', `/docs/${id}`, { docType: 'sale', docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 3, unitPrice: 300_000 }], payments: [{ methodCode: 'TM', amount: 972_000 }] })).statusCode).toBe(200);
    expect((await req('POST', `/docs/${id}/approve`)).statusCode).toBe(200);
    const e2 = await events(id);
    expect(e2.map((e) => [e.type, e.data.version])).toEqual([['phieu-ban.doc.recorded', 1], ['phieu-ban.doc.cancelled', 1], ['phieu-ban.doc.recorded', 2]]);
    expect(e2[2]!.data.doc.totals.total).toBe(972_000);
  });

  it('§5 dòng 5: phiếu trả nối gốc mang originalDocKey; app tgs-wp nghe đủ sự kiện của module phieu-ban', async () => {
    const s = await req('POST', '/docs', { docType: 'sale', docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000 }], payments: [{ methodCode: 'TM', amount: 648_000 }] });
    const sid = s.json().data.id as string;
    await req('POST', `/docs/${sid}/approve`);
    const r = await req('POST', '/docs', { docType: 'sale_return', docDate: TODAY, branchCode: 'CN01', originalDocNo: s.json().data.docNo, lines: [{ lineKey: 'R1', sku: 'SUA330', qty: 1, unitPrice: 300_000 }], payments: [{ methodCode: 'TM', amount: 324_000 }] });
    const rid = r.json().data.id as string;
    expect((await req('POST', `/docs/${rid}/approve`)).statusCode).toBe(200);
    expect((await events(rid))[0]!.data).toMatchObject({ kind: 'sale_return', originalDocKey: `phieu-ban:${sid}` });

    const app = JSON.parse(readFileSync(fileURLToPath(new URL('../src/ung-dung/tgs-wp/bizcity.module.json', import.meta.url)), 'utf8'));
    expect(app.events.subscribes.map((x: { type: string }) => x.type)).toEqual(expect.arrayContaining(['phieu-ban.doc.recorded', 'phieu-ban.doc.cancelled']));
  });
});
