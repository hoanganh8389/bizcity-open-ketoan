// [2026-11-06 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — đổi số migration W1 0074 → 0075 (W-13: 0073 / 0074 PHASE-026 đợt 2 / 3 giữ)
/**
 * PHASE-028 W1 (ADR-0027): vai trò bổ sung — một người nhiều vai trò, quyền hiệu lực là hợp các vai trò còn hiệu lực;
 * thu hồi có hiệu lực ngay; không tự gán; không leo thang quyền; lịch sử chỉ thêm (CSDL chặn xoá / sửa).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { ADMIN_ROLES, effectivePermissions, rolePermissions } from '@bizcity/platform/core/auth';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let viewerId = '';
let viewerToken = '';
let ownerId = '';

async function login(email: string, password: string): Promise<string> {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password } });
  return res.json().data.token as string;
}
const DEVTOOLS = '/api/v1/system/devtools/status';
const perms = async (): Promise<string[]> => (await asViewer('GET', '/api/v1/auth/me')).json().data.permissions;
const asViewer = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${viewerToken}`, 'idempotency-key': `t-${Date.now()}-${Math.random()}` } });

beforeAll(async () => {
  ctx = await setupTenant();
  const created = await call(ctx, 'POST', '/api/v1/users', { email: 'vt@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' });
  viewerId = created.body.data.id;
  viewerToken = await login('vt@ketoan.local', 'Xem@12345');
  ownerId = (await call(ctx, 'GET', '/api/v1/users')).body.data.find((u: any) => u.role === 'owner').id;
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Quyền hiệu lực nhiều vai trò (ADR-0027)', () => {
  it('owner thuộc ADMIN_ROLES; hợp quyền của hai vai trò chứa quyền của từng vai trò', () => {
    expect(ADMIN_ROLES.has('owner')).toBe(true);
    const both = effectivePermissions(['viewer', 'developer']);
    for (const p of rolePermissions('developer')) expect(both.has(p)).toBe(true);
    expect(both.has('devtools:read')).toBe(true);
    expect(both.has('documents:write')).toBe(false);
  });
});

describe('Gán / thu hồi vai trò bổ sung', () => {
  let assignmentId = '';

  it('chưa gán: người xem không đọc được Bàn điều tra (devtools:read)', async () => {
    expect((await asViewer('GET', DEVTOOLS)).statusCode).toBe(403);
    expect(await perms()).not.toContain('devtools:read');
  });

  it('gán developer → quyền có ngay trên vé cũ, không phải đăng nhập lại', async () => {
    const res = await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'developer', reason: 'Hỗ trợ điều tra lỗi' });
    expect(res.status).toBe(201);
    assignmentId = res.body.data.id;
    const list = await call(ctx, 'GET', `/api/v1/users/${viewerId}/roles`);
    expect(list.body.data.primaryRole).toBe('viewer');
    expect(list.body.data.assignments).toMatchObject([{ id: assignmentId, role: 'developer', scopeType: 'tenant', purpose: 'operate', active: true }]);
    // Vé cũ của người xem vẫn dùng được (không bị đăng xuất) và mang quyền mới ngay (cùng tiến trình: đệm đã xoá).
    expect(await perms()).toContain('devtools:read');
    expect((await asViewer('GET', DEVTOOLS)).statusCode).not.toBe(403);
  });

  it('gán trùng dòng đang mở hoặc trùng vai trò chính → 409', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'developer', reason: 'Gán lại' })).status).toBe(409);
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'viewer', reason: 'Trùng vai trò chính' })).status).toBe(409);
  });

  it('không tự gán cho chính mình', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${ownerId}/roles`, { role: 'auditor', reason: 'Tự gán' })).status).toBe(403);
  });

  it('lý do thiếu, hạn trước ngày bắt đầu → 400', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'auditor' })).status).toBe(400);
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'auditor', reason: 'Có hạn', validFrom: '2030-01-10', validTo: '2030-01-01' })).status).toBe(400);
  });

  it('vai trò bổ sung chưa tới ngày hiệu lực thì chưa cấp quyền', async () => {
    const res = await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'auditor', reason: 'Bắt đầu năm sau', validFrom: '2099-01-01' });
    expect(res.status).toBe(201);
    const list = (await call(ctx, 'GET', `/api/v1/users/${viewerId}/roles`)).body.data.assignments;
    expect(list.find((a: any) => a.role === 'auditor').active).toBe(false);
  });

  it('thu hồi cần lý do; thu hồi xong dòng còn trong lịch sử, không thu hồi hai lần', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${assignmentId}/revoke`, {})).status).toBe(400);
    const res = await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${assignmentId}/revoke`, { reason: 'Xong việc điều tra' });
    expect(res.status).toBe(200);
    const row = (await call(ctx, 'GET', `/api/v1/users/${viewerId}/roles`)).body.data.assignments.find((a: any) => a.id === assignmentId);
    expect(row).toMatchObject({ active: false, revokeReason: 'Xong việc điều tra' });
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${assignmentId}/revoke`, { reason: 'Lần hai' })).status).toBe(409);
    // Thu hồi có hiệu lực ngay trên vé cũ.
    expect(await perms()).not.toContain('devtools:read');
    expect((await asViewer('GET', DEVTOOLS)).statusCode).toBe(403);
  });

  it('người xem không gán được vai trò cho người khác (thiếu users:write)', async () => {
    const res = await asViewer('POST', `/api/v1/users/${ownerId}/roles`, { role: 'auditor', reason: 'Leo thang' });
    expect(res.statusCode).toBe(403);
  });
});

describe('Quyền hiệu lực qua vé đăng nhập', () => {
  it('gán chief_accountant → có documents:write; thu hồi → mất ngay; vai trò chính không đổi', async () => {
    expect(await perms()).not.toContain('documents:write');
    const a = await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { role: 'chief_accountant', reason: 'Thay kế toán trưởng nghỉ phép' });
    expect(a.status).toBe(201);
    expect(await perms()).toEqual(expect.arrayContaining(['documents:write', 'periods:lock']));
    expect((await asViewer('GET', '/api/v1/auth/me')).json().data.role).toBe('viewer');
    const r = await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${a.body.data.id}/revoke`, { reason: 'Kế toán trưởng đã về' });
    expect(r.status).toBe(200);
    expect(await perms()).not.toContain('documents:write');
  });
});

describe('Bất biến ở CSDL (0075)', () => {
  it('không xoá, không sửa dòng gán; không sửa dòng đã thu hồi', async () => {
    const { rows } = await sql<{ id: string; revoked_at: Date | null }>`SELECT id, revoked_at FROM user_role_assignments WHERE user_id = ${viewerId} ORDER BY id`.execute(db);
    const open = rows.find((r) => !r.revoked_at)!;
    const done = rows.find((r) => r.revoked_at)!;
    await expect(sql`DELETE FROM user_role_assignments WHERE id = ${open.id}`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`UPDATE user_role_assignments SET role = 'owner' WHERE id = ${open.id}`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`UPDATE user_role_assignments SET revoke_reason = 'đổi lý do', revoked_at = now(), revoked_by = 'x' WHERE id = ${done.id}`.execute(db)).rejects.toThrow(/đã thu hồi/);
  });
});
