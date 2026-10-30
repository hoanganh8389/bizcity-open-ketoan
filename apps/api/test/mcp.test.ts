/**
 * MCP (bizcity_mcp@1, PHASES 2.11, 2.12): POST /mcp JSON-RPC; công cụ sinh từ registry action (CONF-MCP-1, -3), chỉ hiện công cụ
 * được phép (STD-MCP-7), đọc có as_of, ghi phải xác nhận trước (CONF-MCP-4), ghi một lần (STD-MCP-5), bằng chứng actor AI (STD-MCP-9).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, viewer: TestCtx;
let tenantId = '';
let seq = 0;
const rpc = async (c: TestCtx, method: string, params?: unknown, id: number | null = ++seq) => {
  const res = await c.app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params } as never, headers: { authorization: `Bearer ${c.token}` } });
  return { status: res.statusCode, body: res.body ? res.json() : null };
};
const tool = async (c: TestCtx, name: string, args: unknown, meta?: unknown) => (await rpc(c, 'tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) })).body.result;
const requestBody = { requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-MCP', amount: 450000, debitAccount: '64211', description: 'Chi qua trợ lý' };
const countRequests = async () => Number((await db.selectFrom('payment_requests').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/partners/NCC-MCP', { name: 'Nhà cung cấp MCP', kind: 'supplier' });
  expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'xemmcp@ketoan.local', fullName: 'xem', role: 'viewer', password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xemmcp@ketoan.local', password: 'Pass@12345' } });
  viewer = { ...ctx, token: res.json().data.token };
});
afterAll(async () => {
  await ctx.app.close();
});

describe('MCP', () => {
  it('giao thức: cần đăng nhập; initialize; thông báo không trả lời; sai khuôn / phương thức lạ → lỗi JSON-RPC', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })).statusCode).toBe(401);
    const init = await rpc(ctx, 'initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'test' } });
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'bizcity-core-ketoan' } });
    expect((await rpc(ctx, 'notifications/initialized', undefined, null)).status).toBe(202);
    expect((await rpc(ctx, 'resources/list')).body.error.code).toBe(-32601);
    const bad = await ctx.app.inject({ method: 'POST', url: '/mcp', payload: [{ jsonrpc: '2.0', id: 1, method: 'ping' }] as never, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(bad.json().error.code).toBe(-32600);
  });

  it('tools/list: sinh từ action — tên dạng chấm, confirm / annotations suy từ expose.ai, ẩn action ai = deny và công cụ không có quyền', async () => {
    const tools = (await rpc(ctx, 'tools/list')).body.result.tools as { name: string; annotations: { readOnlyHint: boolean }; _meta: { bizcity: { confirm: string; llm_alias: string; action: string } }; description: string; inputSchema: { type: string } }[];
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['ketoan.report.trial_balance', 'ketoan.cash.balances', 'ketoan.debts.partner_balances', 'quy.payment_request.list', 'quy.payment_request.create', 'core.evidence.get']));
    expect(names).not.toEqual(expect.arrayContaining(['quy.payment_request.approve']));
    expect(names.filter((n) => /pay$|approve|cancel|settings\.update/.test(n))).toEqual([]);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+){2,}$/);
      expect(t._meta.bizcity.llm_alias).toMatch(/^kt_[a-z0-9_]{1,61}$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema.type).toBe('object');
      expect(t._meta.bizcity.confirm).toBe(t.annotations.readOnlyHint ? 'never' : 'always');
    }
    expect(tools.find((t) => t.name === 'quy.payment_request.create')).toMatchObject({ annotations: { readOnlyHint: false }, _meta: { bizcity: { confirm: 'always', action: 'quy.payment-request.create' } } });
    // Người chỉ xem: không thấy công cụ ghi.
    const vnames = ((await rpc(viewer, 'tools/list')).body.result.tools as { name: string }[]).map((t) => t.name);
    expect(vnames).toContain('ketoan.report.trial_balance');
    expect(vnames).not.toContain('quy.payment_request.create');
  });

  it('đọc: phong bì success / complete / data.as_of; danh sách có total; lỗi tham số → isError + hint tiếng Việt', async () => {
    const tb = await tool(ctx, 'ketoan.report.trial_balance', { from: '2026-10-01', to: '2026-10-31' });
    expect(tb.isError).toBeUndefined();
    expect(tb.structuredContent).toMatchObject({ success: true, complete: true, data: { as_of: expect.any(String) } });
    expect(tb.structuredContent.data.rows.length).toBeGreaterThan(0);
    expect(tb.content[0].type).toBe('text');

    const list = await tool(ctx, 'quy.payment_request.list', {});
    expect(list.structuredContent).toMatchObject({ success: true, data: { items: [] }, meta: { total: 0 } });

    const bad = await tool(ctx, 'ketoan.report.trial_balance', { from: '10/2026', to: '2026-10-31' });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent).toMatchObject({ success: false, code: 'VALIDATION_ERROR', hint: expect.stringContaining('error.details'), error: { retryable: false } });
  });

  it('ghi: không token → xem trước + confirm_token, không ghi gì; đổi tham số → ARGS_CHANGED; xác nhận → ghi một lần, biên nhận, bằng chứng actor AI', async () => {
    const before = await countRequests();
    const p = await tool(ctx, 'quy.payment_request.create', requestBody);
    expect(p.structuredContent).toMatchObject({ success: true, complete: false, data: { status: 'needs_confirmation', preview: { requestNo: expect.stringMatching(/^YC26-/) }, confirm_token: expect.any(String) } });
    expect(await countRequests()).toBe(before);
    const token = p.structuredContent.data.confirm_token;

    const changed = await tool(ctx, 'quy.payment_request.create', { ...requestBody, amount: 999000 }, { confirm_token: token });
    expect(changed.structuredContent.code).toBe('MCP_CONFIRM_ARGS_CHANGED');
    expect((await tool(viewer, 'quy.payment_request.create', requestBody, { confirm_token: token })).structuredContent.code).toBe('NOT_FOUND');
    expect((await tool(ctx, 'quy.payment_request.create', requestBody, { confirm_token: 'khong-co-token-nay' })).structuredContent.code).toBe('MCP_CONFIRM_INVALID');

    const done = await tool(ctx, 'quy.payment_request.create', requestBody, { confirm_token: token, idempotency_key: 'zalo:msg:1', client: 'claude' });
    expect(done.structuredContent).toMatchObject({ success: true, complete: true, data: { status: 'done', result: { requestNo: p.structuredContent.data.preview.requestNo, status: 'draft' } }, meta: { replayed: false, receipt: { evidenceId: expect.any(String) } } });
    expect(await countRequests()).toBe(before + 1);
    const ev = await db.selectFrom('audit_logs').select(['actor_kind', 'actor_via', 'on_behalf_of', 'action']).where('id', '=', done.structuredContent.meta.receipt.evidenceId).executeTakeFirstOrThrow();
    expect(ev).toMatchObject({ actor_kind: 'ai', actor_via: 'mcp:claude', on_behalf_of: expect.stringMatching(/^user:/), action: 'quy.payment-request.create' });

    // Token một lần: dùng lại không kèm đúng idempotency_key → INVALID; kèm đúng khoá → kết quả cũ, không ghi thêm.
    expect((await tool(ctx, 'quy.payment_request.create', requestBody, { confirm_token: token })).structuredContent.code).toBe('MCP_CONFIRM_INVALID');
    const replay = await tool(ctx, 'quy.payment_request.create', requestBody, { confirm_token: token, idempotency_key: 'zalo:msg:1' });
    expect(replay.structuredContent).toMatchObject({ success: true, data: { result: { id: done.structuredContent.data.result.id } }, meta: { replayed: true } });
    expect(await countRequests()).toBe(before + 1);
  });

  it('token hết hạn → MCP_CONFIRM_INVALID', async () => {
    const p = await tool(ctx, 'quy.payment_request.create', { ...requestBody, description: 'hết hạn' });
    const token = p.structuredContent.data.confirm_token;
    await db.updateTable('mcp_confirm_tokens').set({ expires_at: new Date(Date.now() - 1000) }).where('jti', '=', token).execute();
    expect((await tool(ctx, 'quy.payment_request.create', { ...requestBody, description: 'hết hạn' }, { confirm_token: token })).structuredContent.code).toBe('MCP_CONFIRM_INVALID');
  });
});
