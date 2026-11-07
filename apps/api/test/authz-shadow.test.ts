// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 2, 6): test shadow và bất đẳng thức "bộ tính không cho thừa so với đường cũ"
/**
 * PHASE-028 W3 đợt 2:
 *  - Bất đẳng thức T028-9: với mọi vai trò hệ thống × mọi quyền đang biết, và với các tổ hợp vai trò đơn vị mẫu (nền + Cho − Cấm), quyết định của
 *    bộ tính `authorize` bằng quyết định của đường cũ (effectivePermissions...). Không bao giờ cho thừa.
 *  - Shadow: tắt là mặc định (không đếm); bật bằng bizcity.authz.shadow → đếm match qua requirePermission, chủ đơn vị không bị so (skipped_admin);
 *    lệch nhân tạo được nhận ra (only_engine / only_legacy) và không đổi quyết định.
 * Dữ liệu là dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../src/db/client.js';
import { effectivePermissions, effectivePermissionsWithTenantRoles, ADMIN_ROLES } from '@bizcity/platform/core/auth';
import { authorize } from '@bizcity/platform/core/authz/engine';
import { buildCatalog, codePermissions } from '@bizcity/platform/core/authz/catalog';
import { legacyAssignment, systemRoles, SYSTEM_ROLES } from '@bizcity/platform/core/authz/legacy';
import { tenantRoleToAuthz, TENANT_ROLE_PREFIX } from '@bizcity/platform/core/authz/store';
import { forgetShadowEnabled, resetShadowStats, shadowCompare, shadowStats } from '@bizcity/platform/core/authz/shadow';
import { call, setupTenant, type TestCtx } from './helpers.js';

const catalog = buildCatalog(codePermissions());
const KEYS = codePermissions().map((d) => d.key);

describe('Bất đẳng thức: bộ tính không cho thừa so với đường cũ (T028-9)', () => {
  it('mỗi vai trò hệ thống × mỗi quyền: cùng quyết định', () => {
    const roles = systemRoles();
    for (const role of SYSTEM_ROLES) {
      const legacy = effectivePermissions([role]);
      for (const key of KEYS) {
        const d = authorize({ principal: { kind: 'user', id: 'u1' }, permission: key, now: new Date(), authzVersion: 0, catalog, roles, assignments: [legacyAssignment('u1', role)] });
        expect(d.allowed, `${role} × ${key}`).toBe(legacy.has(key as never));
      }
    }
  });

  it('tổ hợp vai trò đơn vị mẫu (nền + Cho − Cấm): cùng quyết định, Cấm thắng, quyền lạ không vào', () => {
    const cases = [
      { primary: 'viewer' as const, base: 'accountant' as const, allow: ['periods:lock'], deny: ['ledger:*'] },
      { primary: 'accountant' as const, base: 'viewer' as const, allow: ['catalog:write'], deny: ['documents:write'] },
      { primary: 'auditor' as const, base: null, allow: ['devtools:read'], deny: ['*:read'] },
      { primary: 'viewer' as const, base: 'chief_accountant' as const, allow: [], deny: ['payments:*', 'periods:lock'] },
    ];
    for (const c of cases) {
      const extra = { baseRoles: c.base ? [c.base] : [], allow: c.allow, deny: c.deny };
      const legacy = effectivePermissionsWithTenantRoles([c.primary], extra);
      const tr = tenantRoleToAuthz({ id: '1', code: 'x', label: 'X', kind: 'job', base_role: c.base, is_active: true }, [
        ...c.allow.map((p, i) => ({ id: `a${i}`, tenant_role_id: '1', permission: p, effect: 'allow' as const })),
        ...c.deny.map((p, i) => ({ id: `d${i}`, tenant_role_id: '1', permission: p, effect: 'deny' as const })),
      ]);
      const roles = systemRoles();
      roles.set(`${TENANT_ROLE_PREFIX}1`, tr);
      const assignments = [
        legacyAssignment('u1', c.primary),
        { id: 'ura:1', principalKind: 'user' as const, principalId: 'u1', roleId: `${TENANT_ROLE_PREFIX}1`, scopes: [{ kind: 'all' as const }], purposes: ['operate' as const] },
      ];
      for (const key of KEYS) {
        const d = authorize({ principal: { kind: 'user', id: 'u1' }, permission: key, now: new Date(), authzVersion: 0, catalog, roles, assignments });
        expect(d.allowed, `${JSON.stringify(c)} × ${key}`).toBe(legacy.has(key as never));
      }
    }
  });
});

describe('Shadow trên requirePermission', () => {
  let ctx: TestCtx;
  let tenantId = '';
  let viewerId = '';
  let mgrId = '';
  let viewerToken = '';
  let mgrToken = '';
  const withToken = (token: string, url: string) => ctx.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  const login = async (email: string, password: string) =>
    (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password } })).json().data.token as string;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
    viewerId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'sv@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).body.data.id);
    mgrId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'sq@ketoan.local', fullName: 'Quản lý', role: 'viewer', password: 'Xem@12345' })).body.data.id);
    const role = (await call(ctx, 'POST', '/api/v1/roles', { code: 'ql_nguoi_dung', label: 'Quản lý người dùng', kind: 'privilege', baseRole: 'viewer', reason: 'Thử shadow' })).body.data.id;
    expect((await call(ctx, 'POST', `/api/v1/roles/${role}/rules`, { permission: 'users:write', effect: 'allow', reason: 'Thử shadow', confirmPassword: 'Test@123' })).status).toBe(201);
    expect((await call(ctx, 'POST', `/api/v1/users/${mgrId}/roles`, { tenantRoleId: role, reason: 'Thử shadow', confirmPassword: 'Test@123' })).status).toBe(201);
    viewerToken = await login('sv@ketoan.local', 'Xem@12345');
    mgrToken = await login('sq@ketoan.local', 'Xem@12345');
    resetShadowStats();
  });
  afterAll(async () => {
    resetShadowStats();
    await ctx.app.close();
    await closeDb();
  });

  it('mặc định tắt: gọi route có quyền không đếm gì', async () => {
    expect((await withToken(viewerToken, '/api/v1/roles')).statusCode).toBe(403);
    expect((await withToken(mgrToken, '/api/v1/roles')).statusCode).toBe(200);
    expect(shadowStats().counters).toEqual({ match: 0, only_legacy: 0, only_engine: 0, skipped_admin: 0, error: 0 });
  });

  it('bật bằng cấu hình: người xem bị từ chối, quản lý được cho — cả hai match; chủ đơn vị không bị so; quyết định không đổi', async () => {
    const set = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.shadow', { value: 'on', reason: 'Chạy thử shadow' });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    forgetShadowEnabled(tenantId);
    expect((await withToken(viewerToken, '/api/v1/roles')).statusCode).toBe(403);
    expect((await withToken(mgrToken, '/api/v1/roles')).statusCode).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/roles')).status).toBe(200);
    const s = shadowStats();
    expect(s.counters).toMatchObject({ match: 2, only_legacy: 0, only_engine: 0, skipped_admin: 1, error: 0 });
    expect(s.recent).toEqual([]);
  });

  it('lệch nhân tạo được nhận ra và ghi lại: only_engine (đường cũ từ chối, bộ tính cho) và only_legacy', async () => {
    resetShadowStats();
    const logged: object[] = [];
    const log = { warn: (o: object) => { logged.push(o); } };
    expect(await shadowCompare({ tenantId, userId: mgrId, permission: 'users:write', legacyAllowed: false, isAdmin: false }, db, log)).toBe('only_engine');
    expect(await shadowCompare({ tenantId, userId: viewerId, permission: 'users:write', legacyAllowed: true, isAdmin: false }, db, log)).toBe('only_legacy');
    const s = shadowStats();
    expect(s.counters).toMatchObject({ only_engine: 1, only_legacy: 1, match: 0 });
    expect(s.recent.map((d) => d.result)).toEqual(['only_engine', 'only_legacy']);
    expect(s.recent[0]).toMatchObject({ permission: 'users:write', engineReason: 'AUTHZ-ALLOW', legacyAllowed: false });
    expect(logged).toHaveLength(2);
    expect(JSON.stringify(logged)).not.toMatch(/password|email/i);
  });

  it('người giữ vai trò quản trị cao: bỏ qua; lỗi đọc không ném', async () => {
    resetShadowStats();
    expect(await shadowCompare({ tenantId, userId: viewerId, permission: 'users:write', legacyAllowed: true, isAdmin: ADMIN_ROLES.has('owner') }, db)).toBe('skipped_admin');
    // Đơn vị không có người dùng này: không lần gán → bộ tính từ chối; không ném.
    expect(await shadowCompare({ tenantId, userId: '999999999', permission: 'catalog:read', legacyAllowed: false, isAdmin: false }, db)).toBe('match');
  });
});
