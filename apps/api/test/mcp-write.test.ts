/**
 * MCP ghi (bizcity_mcp@1 §5.2, PHASE-009, PHASES 2.16): accounting.document.create_draft, accounting.entry.reverse.
 * Chỉ đề xuất: xem trước = bút toán dựng thử bằng luật định khoản thật rồi huỷ (STD-MCP-4); sau xác nhận vẫn chờ người duyệt dù đơn
 * vị đặt chế độ "Tự động" (STD-MCP-6); sổ không đổi tới khi kế toán duyệt; bằng chứng actor AI (STD-MCP-9).
 * CONF-MCP-5: không công cụ nào trỏ action duyệt / khoá kỳ / cấu hình / người dùng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';
import { listActions } from '../src/core/actions.js';

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
const eventOf = (docKey: string) => db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
const activeEntries = async (docKey: string) => {
  const ev = await eventOf(docKey);
  if (!ev) return 0;
  return (await db.selectFrom('ledger_entries').select('id').where('event_id', '=', ev.id).where('status', '=', 'posted').where('is_reversal', '=', false).execute()).length;
};

beforeAll(async () => {
  ctx = await setupTenant(); // setupTenant đặt mọi loại chứng từ chế độ "Tự động"
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('MCP ghi — chỉ đề xuất', () => {
  it('tools/list có hai công cụ ghi, confirm luôn; không công cụ nào trỏ action duyệt / khoá kỳ / cấu hình (CONF-MCP-5)', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } as never });
    const tools = res.json().result.tools as { name: string; annotations: { destructiveHint: boolean }; _meta: { bizcity: { confirm: string; action: string } } }[];
    expect(tools.find((t) => t.name === 'accounting.entry.reverse')?.annotations.destructiveHint).toBe(true);
    for (const n of ['accounting.document.create_draft', 'accounting.entry.reverse']) {
      expect(tools.find((t) => t.name === n)?._meta.bizcity.confirm).toBe('always');
    }
    const forbidden = new Set(['periods:lock', 'settings:write', 'users:write', 'payments:approve', 'payments:approve-final']);
    const exposed = listActions().filter((a) => a.expose.mcp && (a.expose.ai === 'read' || a.expose.ai === 'propose'));
    expect(exposed.filter((a) => forbidden.has(String(a.permission))).map((a) => a.id)).toEqual([]);
    expect(exposed.filter((a) => a.expose.ai === 'execute')).toEqual([]);
  });

  it('create_draft: xem trước có bút toán, không lưu gì; xác nhận → chờ duyệt (không vào sổ) dù chế độ Tự động; bằng chứng actor AI', async () => {
    const doc = saleDoc({ docKey: 'mcp:CN01:HD-AI-1', docNo: 'HD-AI-1' });
    const p = await tool('accounting.document.create_draft', { document: doc });
    expect(p.structuredContent).toMatchObject({ success: true, complete: false, data: { status: 'needs_confirmation', preview: { status: 'preview', docKey: doc.docKey } } });
    const lines = p.structuredContent.data.preview.entries as { accountCode: string; debit: number; credit: number }[];
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
    expect(await eventOf(doc.docKey)).toBeUndefined();

    const done = await tool('accounting.document.create_draft', { document: doc }, { confirm_token: p.structuredContent.data.confirm_token, client: 'claude' });
    expect(done.structuredContent).toMatchObject({ success: true, data: { status: 'done', result: { docKey: doc.docKey, status: 'pending', entries: [] } } });
    expect(await eventOf(doc.docKey)).toMatchObject({ status: 'pending', posted_version: null });
    expect(await activeEntries(doc.docKey)).toBe(0);
    const ev = await db.selectFrom('audit_logs').select(['actor_kind', 'actor_via', 'action', 'object_id']).where('id', '=', done.structuredContent.meta.receipt.evidenceId).executeTakeFirstOrThrow();
    expect(ev).toMatchObject({ actor_kind: 'ai', actor_via: 'mcp:claude', action: 'accounting.document.create-draft', object_id: doc.docKey });
  });

  it('entry.reverse: xem trước liệt kê bút toán sẽ đảo, sổ giữ nguyên; xác nhận → Chờ huỷ, sổ vẫn giữ tới khi kế toán duyệt', async () => {
    const doc = saleDoc({ docKey: 'pos:CN01:HD-HUY-AI', docNo: 'HD-HUY-AI' });
    expect((await call(ctx, 'POST', '/api/v1/documents', doc)).body.data.status).toBe('posted');
    const before = await activeEntries(doc.docKey);
    expect(before).toBeGreaterThan(0);

    const args = { docKey: doc.docKey, reason: 'Khách đổi ý, trả lại hàng' };
    const p = await tool('accounting.entry.reverse', args);
    expect(p.structuredContent.data).toMatchObject({ status: 'needs_confirmation', preview: { requested: true } });
    expect(p.structuredContent.data.preview.willReverse.length).toBeGreaterThan(0);
    expect(await eventOf(doc.docKey)).toMatchObject({ status: 'posted', cancel_requested_at: null });

    const done = await tool('accounting.entry.reverse', args, { confirm_token: p.structuredContent.data.confirm_token });
    expect(done.structuredContent.data).toMatchObject({ status: 'done', result: { requested: true } });
    const ev = await eventOf(doc.docKey);
    expect(ev).toMatchObject({ status: 'pending', cancel_reason: args.reason });
    expect(ev!.cancel_requested_at).not.toBeNull();
    expect(await activeEntries(doc.docKey)).toBe(before); // chế độ Tự động nhưng AI chỉ đề xuất: không đảo
    const log = await db.selectFrom('posting_log').select('action').where('event_id', '=', ev!.id).orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(log.action).toBe('cancel_request');
  });

  it('entry.reverse: lý do ngắn → lỗi tham số; chứng từ không có → NOT_FOUND', async () => {
    expect((await tool('accounting.entry.reverse', { docKey: 'pos:CN01:HD0001', reason: 'ngắn' })).structuredContent.code).toBe('VALIDATION_ERROR');
    expect((await tool('accounting.entry.reverse', { docKey: 'khong-co', reason: 'Lý do đủ dài' })).structuredContent.code).toBe('NOT_FOUND');
  });
});
