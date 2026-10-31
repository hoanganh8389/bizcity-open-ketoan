/**
 * accounting.journal.post (PHASE-009 S009-2, Q009-1 phương án a): trợ lý AI đề xuất phiếu kế toán NHÁP, người duyệt mới ghi sổ.
 * Xem trước = bút toán dựng thử rồi huỷ (STD-MCP-4); xác nhận → sự việc `pending`, 0 bút toán, giữ số phiếu; AI không có công cụ
 * duyệt (STD-MCP-6); duyệt → ghi qua eventStore (posted_version, posting_log), duyệt lại không ghi thêm; huỷ nháp không đảo gì.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { listActions } from '../src/core/actions.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let seq = 0;
const tool = async (name: string, args: unknown, meta?: unknown) => {
  const res = await ctx.app.inject({
    method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` },
    payload: { jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } } as never,
  });
  return res.json().result;
};
const voucher = (over: Record<string, unknown> = {}) => ({
  docType: 'manual', branchCode: 'CN01', docDate: '2026-10-08', description: 'Trích trước chi phí (AI đề xuất)', partnerCode: 'NCC01',
  lines: [
    { debitAccount: '64211', creditAccount: '335', amount: 100000 },
    { debitAccount: '64212', creditAccount: '335', amount: 50000 },
  ],
  ...over,
});
const eventOf = (docKey: string) => db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
const entriesOf = async (eventId: string) =>
  (await db.selectFrom('ledger_entries').select('id').where('event_id', '=', eventId).where('status', '=', 'posted').where('is_reversal', '=', false).execute()).length;

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/NCC01', { name: 'Nhà cung cấp 01', kind: 'supplier' });
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('accounting.journal.post — phiếu kế toán nháp chờ duyệt', () => {
  it('tools/list có journal.post (confirm luôn); action duyệt không lộ qua MCP, ai = deny', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } as never });
    const tools = res.json().result.tools as { name: string; _meta: { bizcity: { confirm: string } } }[];
    expect(tools.find((t) => t.name === 'accounting.journal.post')?._meta.bizcity.confirm).toBe('always');
    expect(tools.find((t) => t.name.startsWith('accounting.journal.approve'))).toBeUndefined();
    expect(listActions().find((a) => a.id === 'accounting.journal.approve')?.expose).toMatchObject({ mcp: false, ai: 'deny' });
  });

  it('xem trước có bút toán cân, không lưu; xác nhận → pending, 0 bút toán; duyệt → ghi sổ qua eventStore; duyệt lại không ghi thêm', async () => {
    const args = { voucher: voucher({ docNo: 'PK-AI-01' }) };
    const p = await tool('accounting.journal.post', args);
    expect(p.structuredContent).toMatchObject({ success: true, data: { status: 'needs_confirmation', preview: { status: 'preview', docKey: 'manual:manual:PK-AI-01' } } });
    const lines = p.structuredContent.data.preview.entries as { accountCode: string; debit: number; credit: number }[];
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(150000);
    expect(lines.reduce((s, l) => s + l.credit, 0)).toBe(150000);
    expect(await eventOf('manual:manual:PK-AI-01')).toBeUndefined();

    const done = await tool('accounting.journal.post', args, { confirm_token: p.structuredContent.data.confirm_token, client: 'claude' });
    expect(done.structuredContent).toMatchObject({ success: true, data: { status: 'done', result: { docNo: 'PK-AI-01', status: 'pending', entries: [] } } });
    const ev = await eventOf('manual:manual:PK-AI-01');
    expect(ev).toMatchObject({ status: 'pending', posted_version: null, source_system: 'manual' });
    expect(await entriesOf(ev!.id)).toBe(0);
    const proof = await db.selectFrom('audit_logs').select(['actor_kind', 'action']).where('id', '=', done.structuredContent.meta.receipt.evidenceId).executeTakeFirstOrThrow();
    expect(proof).toMatchObject({ actor_kind: 'ai', action: 'accounting.journal.post' });

    // Trạm định khoản (ACC14) không tự ghi phiếu nháp nhập tay: chỉ báo đi duyệt ở màn phiếu.
    const station = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [ev!.id] });
    expect(station.body.data.skipped[0].message).toMatch(/nháp/);
    expect(await entriesOf(ev!.id)).toBe(0);

    const ok = await call(ctx, 'POST', `/api/v1/vouchers/${ev!.id}/approve`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ approved: true, docNo: 'PK-AI-01', version: 1 });
    expect(await eventOf('manual:manual:PK-AI-01')).toMatchObject({ status: 'posted', posted_version: 1 });
    expect(await entriesOf(ev!.id)).toBe(1);
    const log = await db.selectFrom('posting_log').select(['action', 'message']).where('event_id', '=', ev!.id).orderBy('id').execute();
    expect(log.map((l) => l.action)).toEqual(['receive', 'post']);

    const again = await call(ctx, 'POST', `/api/v1/vouchers/${ev!.id}/approve`, {});
    expect(again.body.data).toMatchObject({ approved: false, entryIds: [] });
    expect(await entriesOf(ev!.id)).toBe(1);
  });

  it('nháp sai tài khoản bị từ chối ngay, không nằm chờ duyệt', async () => {
    const r = await tool('accounting.journal.post', { voucher: voucher({ docNo: 'PK-AI-02', lines: [{ debitAccount: '6421', creditAccount: '1111', amount: 1000 }] }) });
    expect(['VALIDATION_ERROR', 'POSTING_FAILED']).toContain(r.structuredContent.code); // chặn ngay ở bản xem trước (dựng bút toán thật)
    expect(await eventOf('manual:manual:PK-AI-02')).toBeUndefined();
  });

  it('huỷ phiếu nháp: không đảo bút toán nào, duyệt sau đó bị từ chối', async () => {
    const args = { voucher: voucher({ docNo: 'PK-AI-03' }) };
    const p = await tool('accounting.journal.post', args);
    await tool('accounting.journal.post', args, { confirm_token: p.structuredContent.data.confirm_token });
    const ev = (await eventOf('manual:manual:PK-AI-03'))!;
    const c = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: ev.doc_key, reason: 'Kế toán không đồng ý đề xuất' });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(await eventOf(ev.doc_key)).toMatchObject({ status: 'cancelled' });
    expect((await call(ctx, 'POST', `/api/v1/vouchers/${ev.id}/approve`, {})).status).toBe(409);
  });

  it('phiếu đã ghi sổ thường không phải nháp: duyệt trả approved = false', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docNo: 'PK-AI-04' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await call(ctx, 'POST', `/api/v1/vouchers/${res.body.data.id}/approve`, {})).body.data.approved).toBe(false);
  });
});
