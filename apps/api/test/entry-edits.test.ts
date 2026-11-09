// [2026-11-10 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-16 (D004-14, D004-16): API sửa đầu bút toán + xác nhận của kế toán trưởng; T004-EE-1…6
/**
 * GET /api/v1/ledger/entry-edits và action core.ledger.header-edit-ack (POST /api/v1/ledger/entry-edits/ack).
 *   T004-EE-1  lần E2 qua ứng dụng hiện với nguồn 'app', không cần xác nhận
 *   T004-EE-2  UPDATE thẳng bằng ketoan_app hiện với nguồn 'db', cột / trước / sau / vai trò / txid, cần xác nhận; tóm tắt đếm đúng
 *   T004-EE-3  bộ lọc nguồn, cột, trạng thái, khoảng ngày
 *   T004-EE-4  khoá API không xác nhận được; lý do ngắn bị từ chối; lần qua ứng dụng không xác nhận; lần không có thì 404
 *   T004-EE-5  kế toán trưởng xác nhận ⇒ dòng có người / lý do, chẩn đoán LEDGER_HEADER_EDIT_UNATTRIBUTED về 0 (khoá kỳ hết chặn)
 *   T004-EE-6  xác nhận không xoá dấu vết: dòng nhật ký của trigger còn nguyên
 * Lần sửa trực tiếp được COMMIT (API đọc ở kết nối khác); ca T004-EE-5 xác nhận nó nên bất biến sổ cuối tệp vẫn sạch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../src/db/client.js';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let entryId = '';
let postingDate = '';
let directTxid = '';
const DOC = 'pos:CN01:EE1';
const send = (over: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: DOC, docNo: 'EE1', ...over }));
const list = (qs = '') => call(ctx, 'GET', `/api/v1/ledger/entry-edits${qs}`);
const check = LEDGER_DIAGNOSTICS.find((c) => c.code === 'LEDGER_HEADER_EDIT_UNATTRIBUTED')!;
const diag = () => db.transaction().execute((trx) => check.run(trx, { tenantId } as never));

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await send({ version: 1 })).status).toBe(200);
  const e = await db.selectFrom('ledger_entries').select(['id', 'posting_date']).where('tenant_id', '=', tenantId).where('is_reversal', '=', false).executeTakeFirstOrThrow();
  entryId = String(e.id);
  postingDate = new Date(e.posting_date as never).toISOString().slice(0, 10);
  // Lần 1: E2 qua ứng dụng (đổi số hoá đơn, diễn giải)
  expect((await send({ version: 2, invoice: { no: '0000456', serial: 'C26TAA', form: '1', date: '2026-10-05' }, description: 'Hoá đơn phát hành muộn' })).status).toBe(200);
  // Lần 2: UPDATE thẳng bằng ketoan_app, COMMIT
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE ketoan_app');
    await c.query(`UPDATE ledger_entries SET description = 'sửa lén bằng SQL' WHERE id = $1`, [entryId]);
    directTxid = (await c.query<{ t: string }>('SELECT pg_current_xact_id()::text AS t')).rows[0]!.t;
    await c.query('COMMIT');
  } finally {
    c.release();
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T004-EE — sửa đầu bút toán', () => {
  it('T004-EE-1/2 hai lần sửa: một qua ứng dụng, một ngoài ứng dụng; tóm tắt đếm đúng', async () => {
    const r = await list();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const items = r.body.data.items as any[];
    expect(items).toHaveLength(2);
    const app = items.find((x) => x.source === 'app')!;
    const out = items.find((x) => x.source === 'db')!;
    expect(app.needsAck).toBe(false);
    expect(app.changes.map((c: any) => c.column)).toEqual(expect.arrayContaining(['description', 'invoice_no']));
    expect(out).toMatchObject({ entryId, needsAck: true, ack: null, role: 'ketoan_app', txid: directTxid, postingDate, docKey: DOC });
    expect(out.changes).toEqual([{ column: 'description', before: 'Hoá đơn phát hành muộn', after: 'sửa lén bằng SQL' }]);
    expect(r.body.data.summary).toMatchObject({ total: 2, outside: 1, unacked: 1, topColumn: { column: 'description', count: 2 } });
    expect(r.body.meta).toMatchObject({ total: 2 });
  });

  it('T004-EE-3 bộ lọc nguồn, cột, trạng thái, khoảng ngày', async () => {
    expect((await list('?source=db')).body.data.items).toHaveLength(1);
    expect((await list('?source=app')).body.data.items).toHaveLength(1);
    expect((await list('?column=invoice_no')).body.data.items).toHaveLength(1);
    expect((await list('?status=unacked')).body.data.items).toHaveLength(1);
    expect((await list('?status=acked')).body.data.items).toHaveLength(0);
    expect((await list('?from=2000-01-01&to=2000-01-31')).body.data.items).toHaveLength(0);
    expect((await list(`?from=${postingDate}&to=${postingDate}`)).body.data.items).toHaveLength(2);
    expect((await list('?source=x')).status).toBe(400);
  });

  it('T004-EE-4 từ chối: khoá API, lý do ngắn, lần qua ứng dụng, lần không có', async () => {
    const byKey = await ctx.app.inject({ method: 'POST', url: '/api/v1/ledger/entry-edits/ack', payload: { entryId, txid: directTxid, reason: 'đã hỏi người sửa' }, headers: { 'x-api-key': ctx.apiKey, 'idempotency-key': 'ee-4-key' } });
    expect(byKey.statusCode).toBe(403);
    const short = await call(ctx, 'POST', '/api/v1/ledger/entry-edits/ack', { entryId, txid: directTxid, reason: 'ngắn' });
    expect(short.status).toBe(400);
    const appTxid = ((await list('?source=app')).body.data.items as any[])[0].txid;
    const viaApp = await call(ctx, 'POST', '/api/v1/ledger/entry-edits/ack', { entryId, txid: appTxid, reason: 'lần này đi qua ứng dụng' });
    expect(viaApp.status).toBe(400);
    const none = await call(ctx, 'POST', '/api/v1/ledger/entry-edits/ack', { entryId, txid: '1', reason: 'không có lần sửa này' });
    expect(none.status).toBe(404);
    expect((await diag()).count).toBe(1); // chưa xác nhận: khoá kỳ còn chặn
  });

  it('T004-EE-5 kế toán trưởng xác nhận ⇒ dòng có người / lý do, chẩn đoán về 0', async () => {
    const r = await call(ctx, 'POST', '/api/v1/ledger/entry-edits/ack', { entryId, txid: directTxid, reason: 'Đã hỏi người sửa, đúng yêu cầu của kế toán trưởng' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toEqual({ entryId, txid: directTxid, already: false });
    const out = ((await list('?source=db')).body.data.items as any[])[0];
    expect(out.needsAck).toBe(false);
    expect(out.ack).toMatchObject({ reason: 'Đã hỏi người sửa, đúng yêu cầu của kế toán trưởng' });
    expect((await list('?status=acked')).body.data.items).toHaveLength(1);
    expect((await list()).body.data.summary).toMatchObject({ outside: 1, unacked: 0 });
    expect((await diag()).count).toBe(0);
    const again = await call(ctx, 'POST', '/api/v1/ledger/entry-edits/ack', { entryId, txid: directTxid, reason: 'Xác nhận lại lần thứ hai' });
    expect(again.body.data.already).toBe(true);
  });

  it('T004-EE-6 xác nhận không xoá dấu vết: dòng nhật ký của trigger còn nguyên', async () => {
    const rows = await pool.query(`SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND object_id = $2 AND action = 'ledger.entry.header_update' AND after_data->>'_txid' = $3`, [tenantId, entryId, directTxid]);
    expect(rows.rowCount).toBe(1);
  });
});
