/**
 * Registry quyền theo module (PHASES 3.3, năng lực permissions.module) + ctx.ledger.cancel / get (PHASES 3.1):
 *   - quyền module phải dạng `<key>:<việc>`, không trùng quyền Core / module khác;
 *   - vai trò nhận quyền module theo `roles`; chủ đơn vị nhận mọi quyền module; người xem không;
 *   - quyền risk high: người dùng làm được, trợ lý AI (call.via) bị FORBIDDEN;
 *   - GET /api/v1/system/permissions nhóm quyền theo module;
 *   - ctx.ledger.get / cancel chỉ trên chứng từ của chính module; cancel chỉ trong action ghi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineAction, z, type AnyActionDef } from '@bizcity/module-sdk';
import { isKnownPermission, registerModulePermissions, rolePermissions, type Permission } from '@bizcity/platform/core/auth';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import type { AuthContext } from '../src/core/auth.js';
import { runAction } from '../src/core/actions.js';
import { db } from '../src/db/client.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

registerModulePermissions('thu-quyen', [
  { key: 'thu-quyen:duyet', label: 'Duyệt phiếu thử', roles: ['accountant', 'chief_accountant'], risk: 'low' },
  { key: 'thu-quyen:xoa-het', label: 'Xoá hết dữ liệu thử', roles: ['chief_accountant'], risk: 'high' },
]);

let ctx: TestCtx;
let tenantId = '';
const auth = (perms: string[]): AuthContext => ({ tenantId, actor: 'system:perm-test', actorName: 'Thử quyền', kind: 'user', role: 'owner', permissions: new Set(perms as Permission[]) } as AuthContext);
const run = (def: AnyActionDef, input: unknown, a: AuthContext, via?: string) => withRequestContext(
  { requestId: `perm-${Math.random().toString(36).slice(2, 10)}`, correlationId: 'perm', tenantId },
  () => runAction(def, input, { auth: a, requestId: `perm-${Math.random().toString(36).slice(2, 10)}`, idempotencyKey: `perm-${Math.random().toString(36).slice(2, 12)}`, via }),
);

const xoaHet = defineAction({
  id: 'thu-quyen.du-lieu.xem-truoc-xoa', title: 'Xem trước xoá dữ liệu thử', permission: 'thu-quyen:xoa-het', effect: 'read', idempotency: 'none',
  input: z.object({}), output: z.object({ ok: z.boolean() }), expose: {}, handler: async () => ({ ok: true }),
});
const nopVaHuy = defineAction({
  id: 'thu-quyen.phieu.nop-huy', title: 'Nộp rồi huỷ phiếu', permission: 'documents:write', effect: 'write', idempotency: 'required', sideEffects: ['documents', 'ledger'],
  input: z.object({ no: z.string(), foreign: z.boolean().optional() }),
  output: z.object({ before: z.string().nullable(), after: z.string().nullable(), cancelRequested: z.boolean() }), expose: {},
  handler: async (c, { no, foreign }) => {
    const key = `thu-quyen:CN01:${no}`;
    if (foreign) await c.ledger.get(`pos:CN01:${no}`);
    await c.ledger.submit(saleDoc({ docKey: key, docNo: no }));
    const before = await c.ledger.get(key);
    await c.ledger.cancel(key, 'Khách huỷ đơn (thử)');
    const after = await c.ledger.get(key);
    return { before: before?.status ?? null, after: after?.status ?? null, cancelRequested: after?.cancelRequested ?? false };
  },
});
const huyTrongDoc = defineAction({
  id: 'thu-quyen.phieu.huy-doc', title: 'Huỷ trong action đọc', permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({}), output: z.object({ ok: z.boolean() }), expose: {},
  handler: async (c) => { await c.ledger.cancel('thu-quyen:CN01:X', 'không được'); return { ok: true }; },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Registry quyền theo module', () => {
  it('quyền module phải mang tiền tố module, không trùng Core', () => {
    expect(() => registerModulePermissions('thu-quyen', [{ key: 'khac:duyet', label: 'x' }])).toThrow(/phải dạng "thu-quyen:/);
    expect(() => registerModulePermissions('documents', [{ key: 'documents:read', label: 'x' }])).toThrow(/trùng quyền Core/);
    expect(isKnownPermission('thu-quyen:duyet')).toBe(true);
    expect(isKnownPermission('thu-quyen:khong-co')).toBe(false);
  });

  it('vai trò nhận quyền module theo roles; chủ đơn vị nhận hết; người xem không', () => {
    expect([...rolePermissions('accountant')]).toEqual(expect.arrayContaining(['thu-quyen:duyet', 'documents:write']));
    expect(rolePermissions('accountant').has('thu-quyen:xoa-het')).toBe(false);
    expect(rolePermissions('chief_accountant').has('thu-quyen:xoa-het')).toBe(true);
    expect(rolePermissions('owner').has('thu-quyen:xoa-het')).toBe(true);
    expect(rolePermissions('viewer').has('thu-quyen:duyet')).toBe(false);
  });

  it('quyền risk high: người dùng làm được, trợ lý AI → FORBIDDEN', async () => {
    expect((await run(xoaHet, {}, auth(['thu-quyen:xoa-het']))).data).toEqual({ ok: true });
    await expect(run(xoaHet, {}, auth(['thu-quyen:xoa-het']), 'mcp')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('GET /api/v1/system/permissions nhóm quyền theo module', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/permissions', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.core).toContain('documents:write');
    expect(res.json().data.modules).toEqual(expect.arrayContaining([{ module: 'thu-quyen', permissions: expect.arrayContaining([expect.objectContaining({ key: 'thu-quyen:xoa-het', risk: 'high' })]) }]));
  });
});

describe('ctx.ledger.get / cancel (3.1)', () => {
  it('nộp → get thấy posted → cancel → huỷ (hoặc chờ huỷ) chứng từ của chính module', async () => {
    const r = await run(nopVaHuy, { no: 'Q1' }, auth(['documents:write']));
    expect(r.data.before).toBe('posted');
    expect(r.data.after === 'cancelled' || r.data.cancelRequested).toBe(true);
  });

  it('get chứng từ của nguồn khác → VALIDATION; cancel trong action đọc → lỗi', async () => {
    await expect(run(nopVaHuy, { no: 'Q2', foreign: true }, auth(['documents:write']))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(run(huyTrongDoc, {}, auth(['documents:read']))).rejects.toThrow(/chỉ trong action ghi/);
  });
});
