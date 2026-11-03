// [2026-11-03 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 8a: thử ctx.meta theo hợp đồng ACTION 1.2.0 §4.1 (hàm, khoá cấm, chạy thử giữ meta, gửi lặp không phát lại, dạng gán cũ còn nhận)
/**
 * ctx.meta(key, value) của runtime action: handler thêm trường vào meta của phản hồi — vd `findings` của cổng kiểm chuẩn Gate A.
 * Khoá của runtime (requestId, receipt, idempotency, dryRun) là của runtime. Gửi lặp trả dữ liệu lần đầu, không kèm meta bổ sung.
 * Mã đã có trên main ghi bằng Object.assign(ctx.meta, {…}) hoặc gán thuộc tính — vẫn nhận, cùng luật khoá cấm (§4.1 Tương thích).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction, runAction, type ActionContext } from '../src/core/actions.js';
import type { AuthContext, Permission } from '../src/core/auth.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const auth = (): AuthContext => ({ tenantId, actor: 'user:test', actorName: 'Test', kind: 'user', role: null, permissions: new Set<Permission>(['documents:write', 'documents:read']) });

function run(f: (c: ActionContext) => Promise<unknown>, opts: { dryRun?: boolean; key?: string } = {}) {
  const def = defineAction({
    id: 'hop-dong.contract.meta', title: 'Thử meta', permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents'], dryRun: true,
    input: z.object({}), output: z.any(), expose: {},
    handler: (c) => f(c),
  });
  return runAction(def, {}, { auth: auth(), requestId: `am-${Math.random()}`, dryRun: opts.dryRun, idempotencyKey: opts.key });
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('ctx.meta — dạng hàm (chuẩn)', () => {
  it('trường thêm nằm ở meta cạnh requestId và biên nhận', async () => {
    const r = await run(async (c) => { c.meta('findings', [{ code: 'X-1' }]); c.meta('gate', 'A'); return { ok: true }; });
    expect(r.data).toEqual({ ok: true });
    expect(r.meta).toMatchObject({ requestId: expect.any(String), findings: [{ code: 'X-1' }], gate: 'A', receipt: { evidenceId: expect.anything() } });
  });

  it('gọi lại cùng khoá thì ghi đè', async () => {
    const r = await run(async (c) => { c.meta('n', 1); c.meta('n', 2); return 1; });
    expect(r.meta.n).toBe(2);
  });

  it('chạy thử (dryRun) vẫn trả meta bổ sung, kèm dryRun', async () => {
    const r = await run(async (c) => { c.meta('findings', []); return 1; }, { dryRun: true });
    expect(r.meta).toMatchObject({ dryRun: true, findings: [] });
  });

  it('khoá của runtime bị từ chối', async () => {
    for (const k of ['requestId', 'receipt', 'idempotency', 'dryRun']) {
      await expect(run(async (c) => { c.meta(k, 'x'); return 1; }), k).rejects.toThrow(/của runtime/);
    }
  });

  it('gửi lặp cùng Idempotency-Key: dữ liệu lần đầu, replayed, KHÔNG kèm meta bổ sung', async () => {
    const key = `meta-lap-${Date.now()}`;
    const first = await run(async (c) => { c.meta('findings', [{ code: 'X-2' }]); return { n: 1 }; }, { key });
    expect(first.meta).toMatchObject({ findings: [{ code: 'X-2' }] });
    const again = await run(async (c) => { c.meta('findings', [{ code: 'X-2' }]); return { n: 1 }; }, { key });
    expect(again.data).toEqual({ n: 1 });
    expect(again.meta.idempotency).toBe('replayed');
    expect(again.meta.findings).toBeUndefined();
  });
});

describe('ctx.meta — dạng gán cũ vẫn nhận (tương thích)', () => {
  it('Object.assign(ctx.meta, {…}) và gán thuộc tính cho cùng kết quả như dạng hàm', async () => {
    const r = await run(async (c) => { Object.assign(c.meta, { gate: 'A', findings: [1] }); c.meta.held = { kind: 'draft' }; return 1; });
    expect(r.meta).toMatchObject({ gate: 'A', findings: [1], held: { kind: 'draft' } });
  });

  it('Object.assign với nguồn undefined không làm gì (mã cũ: drafts.length ? {…} : undefined)', async () => {
    const r = await run(async (c) => { Object.assign(c.meta, undefined); return 1; });
    expect(r.meta.requestId).toEqual(expect.any(String));
  });

  it('khoá của runtime cũng bị từ chối khi gán', async () => {
    await expect(run(async (c) => { c.meta.requestId = 'x'; return 1; })).rejects.toThrow(/của runtime/);
    await expect(run(async (c) => { Object.assign(c.meta, { receipt: 1 }); return 1; })).rejects.toThrow(/của runtime/);
  });

  it('chạy thử giữ meta ở dạng gán', async () => {
    const r = await run(async (c) => { c.meta.findings = ['a']; return 1; }, { dryRun: true });
    expect(r.meta).toMatchObject({ dryRun: true, findings: ['a'] });
  });
});

describe('Đầu cuối qua HTTP: đối tượng trả meta.findings như cũ', () => {
  it('tạo đối tượng qua action: 201, data là DTO, meta.findings là mảng, có biên nhận', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/partners', payload: { code: 'KH-META-1', name: 'Khách thử meta', kind: 'customer' } as never, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().data).toMatchObject({ code: 'KH-META-1', name: 'Khách thử meta' });
    expect(Array.isArray(res.json().meta.findings)).toBe(true);
    expect(res.json().meta.receipt).toBeTruthy();
    expect((await call(ctx, 'GET', '/api/v1/partners?search=KH-META-1')).status).toBe(200);
  });
});
