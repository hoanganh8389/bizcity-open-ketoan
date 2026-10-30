/**
 * Runtime action (bizcity_action@1, PHASES 2.5) trên mẫu yêu cầu thanh toán: CONF-RUN-1 (không quyền → 403), CONF-RUN-4 (gửi lặp cùng
 * Idempotency-Key → một kết quả), CONF-RUN-9 (dry-run không để lại gì), bằng chứng tự động, luật khai báo (STD-ACT-2/4/6).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction } from '../src/core/actions.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, viewer: TestCtx;
let tenantId = '';
const body = (over: Record<string, unknown> = {}) => ({ requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-AC', amount: 1500000, debitAccount: '64211', description: 'Chi dịch vụ', ...over });
const post = (c: TestCtx, url: string, payload: unknown, key?: string) =>
  c.app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: `Bearer ${c.token}`, ...(key ? { 'idempotency-key': key } : {}) } });
const countRequests = async () => Number((await db.selectFrom('payment_requests').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/partners/NCC-AC', { name: 'Nhà cung cấp AC', kind: 'supplier' });
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'xem', role: 'viewer', password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem@ketoan.local', password: 'Pass@12345' } });
  viewer = { ...ctx, token: res.json().data.token };
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Runtime action', () => {
  it('CONF-RUN-1: không có quyền của action → 403; action đọc vẫn gọi được', async () => {
    expect((await post(viewer, '/api/v1/payment-requests', body(), 'khoa-viewer-0001')).statusCode).toBe(403);
    expect((await call(viewer, 'GET', '/api/v1/payment-requests')).status).toBe(200);
  });

  it('action idempotency required: thiếu Idempotency-Key → 400, không tạo gì', async () => {
    const before = await countRequests();
    const res = await post(ctx, '/api/v1/payment-requests', body());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Idempotency-Key/);
    expect(await countRequests()).toBe(before);
  });

  it('CONF-RUN-4: gửi lặp cùng khoá + cùng nội dung → đúng phản hồi lần đầu, một yêu cầu; khác nội dung → IDEMPOTENCY_CONFLICT', async () => {
    const before = await countRequests();
    const first = await post(ctx, '/api/v1/payment-requests', body(), 'khoa-lap-yc-0001');
    expect(first.statusCode, first.body).toBe(201);
    const again = await post(ctx, '/api/v1/payment-requests', body(), 'khoa-lap-yc-0001');
    expect(again.statusCode).toBe(201);
    expect(again.json().data).toEqual(first.json().data);
    expect(again.json().meta).toMatchObject({ idempotency: 'replayed' });
    expect(await countRequests()).toBe(before + 1);

    const other = await post(ctx, '/api/v1/payment-requests', body({ amount: 2000000 }), 'khoa-lap-yc-0001');
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await countRequests()).toBe(before + 1);
  });

  it('hai yêu cầu cùng khoá chạy song song → một yêu cầu, cùng một phản hồi', async () => {
    const before = await countRequests();
    const [a, b] = await Promise.all([
      post(ctx, '/api/v1/payment-requests', body({ description: 'song song' }), 'khoa-song-song-01'),
      post(ctx, '/api/v1/payment-requests', body({ description: 'song song' }), 'khoa-song-song-01'),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json().data.id).toBe(b.json().data.id);
    expect(await countRequests()).toBe(before + 1);
  });

  it('CONF-RUN-9: dry-run chạy thật trong giao dịch rồi huỷ — trả kết quả, không để lại yêu cầu, số, phiếu chi', async () => {
    const before = await countRequests();
    const dry = await post(ctx, '/api/v1/payment-requests?dryRun=1', body());
    expect(dry.statusCode, dry.body).toBe(200);
    expect(dry.json().meta).toMatchObject({ dryRun: true });
    expect(dry.json().data.requestNo).toMatch(/^YC26-/);
    expect(await countRequests()).toBe(before);
    // Số thứ tự cũng huỷ theo: lần lập thật kế tiếp nhận đúng số mà lần chạy thử đã thấy.
    const real = await call(ctx, 'POST', '/api/v1/payment-requests', body({ submit: true }));
    expect(real.body.data.requestNo).toBe(dry.json().data.requestNo);

    const id = real.body.data.id;
    expect((await call(ctx, 'POST', `/api/v1/payment-requests/${id}/approve`)).body.data.status).toBe('approved');
    const preview = await post(ctx, `/api/v1/payment-requests/${id}/pay?dryRun=1`, { docDate: '2026-10-13', moneyAccount: '1111' });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json().data).toMatchObject({ status: 'paid' });
    expect(preview.json().data.paidDocNo).toBeTruthy();
    expect((await call(ctx, 'GET', `/api/v1/payment-requests/${id}`)).body.data).toMatchObject({ status: 'approved', paidDocumentId: null });
    const docs = await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_no', '=', preview.json().data.paidDocNo).execute();
    expect(docs).toHaveLength(0);

    const paid = await post(ctx, `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' }, 'khoa-chi-yc-00001');
    expect(paid.statusCode, paid.body).toBe(200);
    const replay = await post(ctx, `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' }, 'khoa-chi-yc-00001');
    expect(replay.json().data.paidDocNo).toBe(paid.json().data.paidDocNo);
    expect(replay.json().meta).toMatchObject({ idempotency: 'replayed' });
  });

  it('action không hỗ trợ chạy thử thì ?dryRun=1 bị từ chối', async () => {
    const [row] = (await call(ctx, 'GET', '/api/v1/payment-requests?status=draft')).body.data;
    expect((await post(ctx, `/api/v1/payment-requests/${row.id}/submit?dryRun=1`, {})).statusCode).toBe(400);
  });

  it('bằng chứng: runtime ghi audit_logs với mã action, không cần handler gọi writeAudit', async () => {
    const logs = await db.selectFrom('audit_logs').select(['action', 'object_type', 'object_id', 'after_data'])
      .where('tenant_id', '=', tenantId).where('action', 'like', 'quy.payment-request.%').execute();
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['quy.payment-request.create', 'quy.payment-request.approve', 'quy.payment-request.pay']));
    const pay = logs.find((l) => l.action === 'quy.payment-request.pay')!;
    expect(pay.object_type).toBe('payment_request');
    expect(pay.after_data).toMatchObject({ notes: { voucher: expect.any(String) } });
    // Gửi lặp (replay) và chạy thử không thêm bằng chứng: đúng một dòng create cho mỗi yêu cầu đã lập thật.
    expect(actions.filter((a) => a === 'quy.payment-request.pay')).toHaveLength(1);
  });

  it('capabilities liệt kê action đã gắn: mã, quyền, idempotency, đường dẫn, AI', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/system/capabilities')).body.data;
    expect(d.actions.find((a: { id: string }) => a.id === 'quy.payment-request.pay')).toMatchObject({
      effect: 'write', permission: 'documents:write', idempotency: 'required', dryRun: true, http: { method: 'POST', path: '/api/v1/payment-requests/:id/pay' }, ai: 'deny',
      sideEffects: ['documents', 'ledger'], evidence: 'receipt', inputSchema: { type: 'object', required: expect.arrayContaining(['id', 'docDate', 'moneyAccount']) },
    });
    expect(d.actions.find((a: { id: string }) => a.id === 'quy.payment-request.list')).toMatchObject({ effect: 'read', sideEffects: [], evidence: 'none' });
  });

  it('luật khai báo: mã sai dạng, action ghi không idempotency, ghi công khai → lỗi lúc nạp', () => {
    const base = { title: 't', input: z.object({}), output: z.object({}), effect: 'write' as const, idempotency: 'required' as const, permission: 'documents:write' as const, expose: {}, handler: async () => ({}) };
    expect(() => defineAction({ ...base, id: 'quy.lap' })).toThrow(/<module>.<thực thể>.<động từ>/);
    expect(() => defineAction({ ...base, id: 'quy.x.lap', idempotency: 'none' })).toThrow(/STD-ACT-4/);
    expect(() => defineAction({ ...base, id: 'quy.x.lap', permission: 'public' })).toThrow(/STD-ACT-2/);
    expect(() => defineAction({ ...base, id: 'quy.x.lap', expose: { ai: 'execute' } })).toThrow(/execute/);
    // Capability Contract: action ghi phải khai tác dụng phụ; action đọc không được có.
    expect(() => defineAction({ ...base, id: 'quy.x.lap' })).toThrow(/sideEffects/);
    expect(() => defineAction({ ...base, id: 'quy.x.xem', effect: 'read', idempotency: 'none', sideEffects: ['ledger'] })).toThrow(/sideEffects/);
  });
});
