/**
 * NT-BH-014 — phiếu kế toán chênh lệch két khi chốt ca (chữ chốt docs/nghiep-vu/20): module pos nộp manual_journal theo lý do
 * thiếu (Nợ 1381 / Có 1111) / thừa (Nợ 1111 / Có 3381), đối tượng chi nhánh; lý do chưa có → Core từ chối phiếu, ca vẫn chốt, biên bản
 * ghi "chưa lập" → Lập lại phiếu ở Sổ ca sau khi khai lý do; lệch 0 hoặc tắt → không lập. Đơn vị test để phiếu kế toán ghi ngay (manual_journal = auto) để thấy bút toán.
 */
// [2026-11-13 09:30 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-014 (đóng góp)
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

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

describe.skipIf(!HAS)('NT-BH-014 — phiếu kế toán chênh lệch két khi chốt ca', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const auth = () => ({ authorization: `Bearer ${ctx.token}` });
  const get = (url: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: auth() });
  const post = (url: string, payload: unknown, key = `nt-bh-014-${++k}-${Date.now()}`) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...auth(), 'idempotency-key': key } });
  const byAccount = async (docKey: string) => {
    const rows = (await sql<{ account: string; d: string; c: string; partner: string | null }>`
      SELECT l.account_code AS account, SUM(l.debit) AS d, SUM(l.credit) AS c, max(p.code) AS partner
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
        LEFT JOIN partners p ON p.id = l.partner_id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND NOT e.is_reversal
       GROUP BY l.account_code ORDER BY l.account_code`.execute(db)).rows;
    return Object.fromEntries(rows.map((r) => [r.account, [Number(r.d), Number(r.c), r.partner]]));
  };
  const docOf = async (docKey: string) => (await sql<{ doc_type: string; status: string }>`
    SELECT doc_type, status FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows;
  /** Mở ca 1.000.000 (không bán) rồi chốt với số đếm được → biên bản. */
  const shift = async (counted: number) => {
    const o = await post('/shifts/open', { openingCash: 1_000_000, branchCode: 'CN01' });
    expect(o.statusCode, o.body).toBe(201);
    const id = o.json().data.id as string;
    const c = await post('/shifts/close', { shiftId: id, countedCash: counted });
    expect(c.statusCode, c.body).toBe(200);
    return { id, report: c.json().data as Record<string, any>, docKey: `pos:shift:${id}:cash-diff` };
  };
  const reason = (code: string, name: string, debitAccount: string, creditAccount: string) =>
    call(ctx, 'PUT', `/api/v1/posting/reasons/${code}`, { name, kind: 'journal', debitAccount, creditAccount, isActive: true });

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-014', trx as never); });
    app = await buildApp();
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, manual_journal: 'auto' })).status).toBe(200);
    // Đối tượng chi nhánh (1381 / 3381 theo dõi đối tượng) — Kernel tạo khi chi nhánh có chứng từ; ở đây tạo sẵn như danh mục thật.
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'CN-CN01', name: 'Chi nhánh CN01' })).status).toBeLessThan(300);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  let firstShift = '';
  it('§6 dòng 1: chưa có lý do → Core từ chối phiếu; ca vẫn chốt, biên bản ghi "chưa lập" kèm câu lỗi; không để lại chứng từ dở', async () => {
    const s = await shift(990_000);
    firstShift = s.id;
    expect(s.report).toMatchObject({ difference: -10_000, journal: { docKey: s.docKey, reasonCode: 'POS-THIEU-KET', amount: 10_000, status: 'not_created' } });
    expect(s.report.journal.error).toContain('POS-THIEU-KET');
    expect(await docOf(s.docKey)).toEqual([]);
    expect((await get(`/shifts/current?branch=CN01`)).json().data).toBeNull();
    const redo = await post(`/admin/shifts/${s.id}/journal`, {});
    expect(redo.statusCode).toBe(400);
    expect(redo.json().error.message).toContain('Chưa lập được phiếu');
  });

  it('§5 dòng 5: thiếu 10.000 → Nợ 1381 (đối tượng CN-CN01) / Có 1111 — 10.000; gửi lại cùng khoá không có phiếu thứ hai', async () => {
    for (const [code, name, d, c] of [['POS-THIEU-KET', 'Thiếu tiền két chờ xử lý', '1381', '1111'], ['POS-THUA-KET', 'Thừa tiền két chờ xử lý', '1111', '3381']] as const) {
      const r = await reason(code, name, d, c);
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    }
    const o = await post('/shifts/open', { openingCash: 1_000_000, branchCode: 'CN01' });
    const id = o.json().data.id as string;
    const key = `nt-bh-014-chot-${Date.now()}`;
    const c = await post('/shifts/close', { shiftId: id, countedCash: 990_000 }, key);
    expect(c.statusCode, c.body).toBe(200);
    expect(c.json().data.journal).toMatchObject({ status: 'posted', amount: 10_000 });
    const docKey = `pos:shift:${id}:cash-diff`;
    expect(await byAccount(docKey)).toEqual({ 1111: [0, 10_000, 'CN-CN01'], 1381: [10_000, 0, 'CN-CN01'] });
    expect((await post('/shifts/close', { shiftId: id, countedCash: 990_000 }, key)).statusCode).toBe(200);
    expect(await docOf(docKey)).toHaveLength(1);
  });

  it('§6 dòng 1 (tiếp): khai lý do rồi Lập lại phiếu ở Sổ ca → phiếu ca đầu ghi sổ; lập lần hai → 409 đã có phiếu', async () => {
    const r = await post(`/admin/shifts/${firstShift}/journal`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.journal).toMatchObject({ status: 'posted', amount: 10_000 });
    expect(await byAccount(`pos:shift:${firstShift}:cash-diff`)).toEqual({ 1111: [0, 10_000, 'CN-CN01'], 1381: [10_000, 0, 'CN-CN01'] });
    const again = await post(`/admin/shifts/${firstShift}/journal`, {});
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toContain('đã có phiếu kế toán');
  });

  it('§5 dòng 6: thừa 5.000 → Nợ 1111 / Có 3381 (đối tượng CN-CN01) — 5.000', async () => {
    const s = await shift(1_005_000);
    expect(s.report.journal).toMatchObject({ reasonCode: 'POS-THUA-KET', status: 'posted' });
    expect(await byAccount(s.docKey)).toEqual({ 1111: [5_000, 0, 'CN-CN01'], 3381: [0, 5_000, 'CN-CN01'] });
  });

  it('§5 dòng 7: lệch 0 → không lập; tắt ở Cài đặt bán hàng → không lập', async () => {
    const zero = await shift(1_000_000);
    expect(zero.report.journal).toBeUndefined();
    expect(await docOf(zero.docKey)).toEqual([]);
    const off = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.pos.cash_diff_journal', { key: 'bizcity.pos.cash_diff_journal', value: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const s = await shift(900_000);
    expect(s.report).toMatchObject({ difference: -100_000 });
    expect(s.report.journal).toBeUndefined();
    expect(await docOf(s.docKey)).toEqual([]);
  });

  it('§5 dòng 1–3: GET /admin/settings trả khoá mới; Sổ ca hiện phiếu kế toán của ca', async () => {
    const st = (await get('/admin/settings')).json().data;
    expect(st.values).toMatchObject({ cashDiffJournal: false, cashShortReason: 'POS-THIEU-KET', cashOverReason: 'POS-THUA-KET' });
    expect(st.keys.cashDiffJournal).toBe('bizcity.pos.cash_diff_journal');
    const rows = (await get(`/admin/shifts?from=${TODAY}`)).json().data as { journal: { status: string } | null; difference: number }[];
    expect(rows.map((r) => [r.difference, r.journal?.status ?? null]).sort()).toEqual([
      [-10_000, 'posted'], [-10_000, 'posted'], [-100_000, null], [0, null], [5_000, 'posted'],
    ].sort());
  });
});
