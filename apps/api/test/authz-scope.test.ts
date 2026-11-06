// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 4, 6): test requireScope / authorizeScoped / allowedScope / restrictToScope
/**
 * Quyền theo phạm vi: có quyền toàn đơn vị thì qua; lần gán chi nhánh / kho chứa vị trí tài nguyên thì qua; ngoài phạm vi, không vị trí, sai mục đích,
 * đã thu hồi, hết hạn, bị Cấm → từ chối (đóng an toàn). Dữ liệu là dữ liệu giả; lần gán có phạm vi chèn thẳng vào user_role_assignments
 * (API gán chưa mở trường phạm vi — chờ route đầu tiên dùng requireScope ở W5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { effectivePermissionsWithTenantRoles } from '@bizcity/platform/core/auth';
import type { AuthContext } from '@bizcity/platform/core/auth';
import { extraAuthz, forgetAllRoles } from '@bizcity/platform/core/security/role-assignments';
import { allowedScope, authorizeScoped, requireScope, restrictToScope, SCOPE_REASONS } from '@bizcity/platform/core/authz/scope';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let viewerId = '';

/** AuthContext như auth.ts dựng cho người dùng (cùng công thức quyền toàn đơn vị). */
async function authOf(userId: string, role: 'viewer' | 'owner' = 'viewer'): Promise<AuthContext> {
  forgetAllRoles();
  const extra = await extraAuthz(userId);
  const roles = [role, ...extra.roles];
  return { tenantId, actor: `user:${userId}`, actorName: 'Thử', kind: 'user', role, roles, permissions: effectivePermissionsWithTenantRoles(roles, extra) };
}
const row = (over: { role?: string; scopeType?: string; scopeId?: string | null; purpose?: string; validTo?: string | null; validFrom?: string } = {}) =>
  sql<{ id: string }>`INSERT INTO user_role_assignments (tenant_id, user_id, role, scope_type, scope_id, purpose, valid_from, valid_to, reason, granted_by)
    VALUES (${tenantId}, ${viewerId}, ${over.role ?? 'accountant'}, ${over.scopeType ?? 'branch'}, ${over.scopeId === undefined ? '501' : over.scopeId}, ${over.purpose ?? 'operate'},
            coalesce(${over.validFrom ?? null}::date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), ${over.validTo ?? null}::date, 'Gán thử phạm vi', 'user:test') RETURNING id::text`.execute(db).then((r) => r.rows[0]!.id);
const revoke = (id: string) => sql`UPDATE user_role_assignments SET revoked_by = 'user:test', revoked_at = now(), revoke_reason = 'Thu hồi thử' WHERE id = ${id}`.execute(db);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  viewerId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'pv@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).body.data.id);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('authorizeScoped', () => {
  it('quyền toàn đơn vị: qua, không cần vị trí', async () => {
    const owner = await authOf('1', 'owner');
    expect(await authorizeScoped(owner, 'documents:write', {})).toMatchObject({ allowed: true, via: 'tenant', reasonCode: SCOPE_REASONS.TENANT });
  });

  it('chưa có lần gán phạm vi: người xem bị từ chối dù tài nguyên có vị trí', async () => {
    const viewer = await authOf(viewerId);
    expect(viewer.permissions.has('documents:write')).toBe(false);
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '501' })).toMatchObject({ allowed: false, via: 'none' });
  });

  it('lần gán chi nhánh 501: tài nguyên ở 501 qua, ở 502 và không vị trí bị từ chối (đóng an toàn)', async () => {
    const id = await row();
    const viewer = await authOf(viewerId);
    expect(viewer.permissions.has('documents:write')).toBe(false); // lần gán có phạm vi KHÔNG thành quyền toàn đơn vị
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '501' })).toMatchObject({ allowed: true, via: 'scope' });
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '502' })).toMatchObject({ allowed: false });
    expect(await authorizeScoped(viewer, 'documents:write', { warehouseId: '9' })).toMatchObject({ allowed: false });
    expect(await authorizeScoped(viewer, 'documents:write', {})).toMatchObject({ allowed: false, reasonCode: SCOPE_REASONS.NO_LOCATION });
    // Quyền ngoài vai trò được gán: vẫn từ chối.
    expect(await authorizeScoped(viewer, 'periods:lock', { branchId: '501' })).toMatchObject({ allowed: false });
    await revoke(id);
  });

  it('mục đích tách bạch; thu hồi và hết hạn có hiệu lực ngay', async () => {
    const approve = await row({ purpose: 'approve' });
    const viewer = await authOf(viewerId);
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '501' }, 'operate')).toMatchObject({ allowed: false });
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '501' }, 'approve')).toMatchObject({ allowed: true });
    await revoke(approve);
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '501' }, 'approve')).toMatchObject({ allowed: false });
    await row({ validFrom: '2019-01-01', validTo: '2020-01-01' });
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '501' })).toMatchObject({ allowed: false });
  });

  it('khoá API / không phải người dùng: chỉ đường toàn đơn vị', async () => {
    const key: AuthContext = { tenantId, actor: 'apikey:1', actorName: 'khoá', kind: 'apikey', role: null, permissions: new Set() };
    expect(await authorizeScoped(key, 'documents:write', { branchId: '501' })).toMatchObject({ allowed: false, reasonCode: SCOPE_REASONS.NOT_USER });
  });

  it('Cấm toàn đơn vị thắng lần gán phạm vi', async () => {
    const id = await row({ role: 'accountant', scopeId: '777' });
    const r = (await call(ctx, 'POST', '/api/v1/roles', { code: 'cam_chung_tu', label: 'Cấm chứng từ', kind: 'restriction', reason: 'Thử Cấm' })).body.data.id;
    await call(ctx, 'POST', `/api/v1/roles/${r}/rules`, { permission: 'documents:*', effect: 'deny', reason: 'Thử Cấm' });
    const a = (await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles`, { tenantRoleId: r, reason: 'Thử Cấm' })).body.data.id;
    const viewer = await authOf(viewerId);
    expect(await authorizeScoped(viewer, 'documents:write', { branchId: '777' })).toMatchObject({ allowed: false });
    await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${a}/revoke`, { reason: 'Hết thử' });
    await revoke(id);
  });
});

describe('requireScope (preHandler)', () => {
  it('cho qua khi trong phạm vi, FORBIDDEN khi ngoài; resolver nhận request; chưa đăng nhập → UNAUTHORIZED', async () => {
    const id = await row({ scopeId: '601' });
    const viewer = await authOf(viewerId);
    const seen: unknown[] = [];
    const pre = requireScope('documents:write', (req) => { seen.push(req); return { branchId: (req as unknown as { params: { branch: string } }).params.branch }; });
    const req = (branch: string) => ({ auth: viewer, params: { branch } }) as never;
    await expect(pre(req('601'), {} as never)).resolves.toBeUndefined();
    await expect(pre(req('602'), {} as never)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(pre({ params: { branch: '601' } } as never, {} as never)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(seen).toHaveLength(2);
    await revoke(id);
  });
});

describe('allowedScope / restrictToScope', () => {
  it('phạm vi được phép là hợp các lần gán có luật Cho; quyền toàn đơn vị là all', async () => {
    const a = await row({ scopeId: '701' });
    const b = await row({ scopeType: 'warehouse', scopeId: '8' });
    const viewer = await authOf(viewerId);
    expect(await allowedScope(viewer, 'documents:write', 'operate')).toEqual({ all: false, branchIds: ['701'], warehouseIds: ['8'], orgPaths: [] });
    expect(await allowedScope(viewer, 'periods:lock', 'operate')).toEqual({ all: false, branchIds: [], warehouseIds: [], orgPaths: [] });
    expect(await allowedScope(await authOf('1', 'owner'), 'documents:write', 'operate')).toEqual({ all: true });
    await revoke(a);
    await revoke(b);
  });

  it('requested ∩ allowed; rỗng là rỗng, không bao giờ thành "tất cả"', () => {
    const allowed = { all: false as const, branchIds: ['1', '2'], warehouseIds: [], orgPaths: [] };
    expect(restrictToScope(allowed)).toEqual({ all: false, branchIds: ['1', '2'], warehouseIds: [] });
    expect(restrictToScope(allowed, { branchIds: ['2', '3'] })).toEqual({ all: false, branchIds: ['2'], warehouseIds: [] });
    expect(restrictToScope(allowed, { branchIds: ['3'] })).toEqual({ all: false, branchIds: [], warehouseIds: [] });
    expect(restrictToScope({ all: false, branchIds: [], warehouseIds: [], orgPaths: [] })).toEqual({ all: false, branchIds: [], warehouseIds: [] });
    expect(restrictToScope({ all: true })).toEqual({ all: true, branchIds: [], warehouseIds: [] });
    expect(restrictToScope({ all: true }, { branchIds: ['5'] })).toEqual({ all: false, branchIds: ['5'], warehouseIds: [] });
  });
});
