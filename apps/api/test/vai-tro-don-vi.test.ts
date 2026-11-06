// [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 1 (ADR-0027 Phụ lục A bước 1–2): test vai trò của đơn vị — bất biến CSDL, RLS, authz_version, lớp đọc + bộ tính
/**
 * PHASE-028 W2 đợt 1: vai trò của đơn vị (tenant_roles, tenant_role_rules, user_role_assignments.tenant_role_id).
 *  - CSDL chặn: xoá / đổi mã / đổi nền vai trò, sửa / xoá luật, relax, Cho có *, luật trỏ vai trò đơn vị khác, lần gán có hai vai trò.
 *  - RLS cô lập đơn vị; tenants.authz_version tăng ở mỗi lần ghi.
 *  - loadAuthzSnapshot + authorize: nền ∪ Cho, Cấm thắng cả vai trò chính, vai trò vô hiệu không cấp, thu hồi có hiệu lực ngay.
 *  - Quyền hiệu lực của đường yêu cầu (auth.ts) chưa đổi: lần gán vai trò của đơn vị không thêm quyền ở /auth/me.
 * Dữ liệu là dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { authorize, buildCatalog, codePermissions } from '@bizcity/platform/core/authz/index';
import { loadAuthzSnapshot, tenantRoleToAuthz } from '@bizcity/platform/core/authz/store';
import { forgetRoles } from '@bizcity/platform/core/security/role-assignments';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
let tenantId = '';
let otherTenantId = '';
let viewerId = '';
let viewerToken = '';

const tenantOf = async (code: string) => String((await db.selectFrom('tenants').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id);
const authzVersion = async () => Number((await sql<{ v: string }>`SELECT authz_version::text AS v FROM tenants WHERE id = ${tenantId}`.execute(db)).rows[0]!.v);

async function newRole(code: string, kind: string, base: string | null, tid = tenantId): Promise<string> {
  const { rows } = await sql<{ id: string }>`INSERT INTO tenant_roles (tenant_id, code, label, kind, base_role, created_by)
    VALUES (${tid}, ${code}, ${`Vai trò ${code}`}, ${kind}, ${base}, 'user:test') RETURNING id::text`.execute(db);
  return rows[0]!.id;
}
async function addRule(roleId: string, permission: string, effect: string, tid = tenantId): Promise<string> {
  const { rows } = await sql<{ id: string }>`INSERT INTO tenant_role_rules (tenant_id, tenant_role_id, permission, effect, created_by)
    VALUES (${tid}, ${roleId}, ${permission}, ${effect}, 'user:test') RETURNING id::text`.execute(db);
  return rows[0]!.id;
}
async function assign(roleId: string): Promise<string> {
  const { rows } = await sql<{ id: string }>`INSERT INTO user_role_assignments (tenant_id, user_id, tenant_role_id, reason, granted_by)
    VALUES (${tenantId}, ${viewerId}, ${roleId}, 'Gán thử vai trò của đơn vị', 'user:test') RETURNING id::text`.execute(db);
  return rows[0]!.id;
}

/** Chạy như chủ CSDL (bỏ SET ROLE ketoan_app): vai trò API không có DELETE, nên trigger chỉ thấy được ở lớp này. */
const asSchemaOwner = (q: ReturnType<typeof sql>) => db.transaction().execute(async (trx) => {
  await sql`SET LOCAL ROLE NONE`.execute(trx);
  return q.execute(trx);
});
/** Chạy như vai trò API (ketoan_app) bất kể bộ test có đặt DB_SET_ROLE hay không. */
const asAppRole = (q: ReturnType<typeof sql>) => db.transaction().execute(async (trx) => {
  await sql`SET LOCAL ROLE ketoan_app`.execute(trx);
  return q.execute(trx);
});

async function can(permission: string): Promise<boolean> {
  const snap = await loadAuthzSnapshot(db, tenantId, viewerId);
  return authorize({
    principal: { kind: 'user', id: viewerId }, permission, now: new Date(), authzVersion: snap.authzVersion,
    catalog: buildCatalog(codePermissions()), assignments: snap.assignments, roles: snap.roles,
  }).allowed;
}

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = await tenantOf(ctx.tenantCode);
  otherTenantId = await tenantOf(other.tenantCode);
  const created = await call(ctx, 'POST', '/api/v1/users', { email: 'vdv@ketoan.local', fullName: 'Người xem kho', role: 'viewer', password: 'Xem@12345' });
  viewerId = String(created.body.data.id);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'vdv@ketoan.local', password: 'Xem@12345' } });
  viewerToken = res.json().data.token;
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
  await closeDb();
});

describe('Bất biến CSDL của vai trò của đơn vị (0075)', () => {
  it('mã trùng vai trò hệ thống, nền owner, loại restriction có nền → từ chối', async () => {
    await expect(newRole('accountant', 'job', null)).rejects.toThrow();
    await expect(newRole('vt_owner', 'job', 'owner')).rejects.toThrow();
    await expect(newRole('vt_han_che', 'restriction', 'viewer')).rejects.toThrow();
  });

  it('không xoá vai trò; không đổi mã / nền; sửa tên phải tăng version đúng 1', async () => {
    const id = await newRole('vt_bat_bien', 'job', 'viewer');
    await expect(asAppRole(sql`DELETE FROM tenant_roles WHERE id = ${id}`)).rejects.toThrow(/permission denied/);
    await expect(asSchemaOwner(sql`DELETE FROM tenant_roles WHERE id = ${id}`)).rejects.toThrow(/không xoá/);
    await expect(sql`UPDATE tenant_roles SET code = 'vt_moi', version = 2, updated_by = 'user:test', updated_at = now() WHERE id = ${id}`.execute(db)).rejects.toThrow(/bất biến/);
    await expect(sql`UPDATE tenant_roles SET base_role = 'accountant', version = 2, updated_by = 'user:test', updated_at = now() WHERE id = ${id}`.execute(db)).rejects.toThrow(/bất biến/);
    await expect(sql`UPDATE tenant_roles SET label = 'Tên mới' WHERE id = ${id}`.execute(db)).rejects.toThrow(/version/);
    await sql`UPDATE tenant_roles SET label = 'Tên mới', version = 2, updated_by = 'user:test', updated_at = now() WHERE id = ${id}`.execute(db);
  });

  it('luật: Cho có *, relax, conditions khác {} → từ chối; Cấm được dùng *', async () => {
    const id = await newRole('vt_luat', 'job', 'viewer');
    await expect(addRule(id, 'documents:*', 'allow')).rejects.toThrow();
    await expect(addRule(id, 'documents:write', 'relax')).rejects.toThrow();
    await expect(sql`INSERT INTO tenant_role_rules (tenant_id, tenant_role_id, permission, effect, conditions, created_by)
      VALUES (${tenantId}, ${id}, 'documents:write', 'allow', '{"amount_max": 1}', 'user:test')`.execute(db)).rejects.toThrow();
    await addRule(id, 'documents:*', 'deny');
  });

  it('luật chỉ thêm: không xoá, không sửa; gỡ một lần, có lý do', async () => {
    const id = await newRole('vt_go_luat', 'job', 'viewer');
    const rule = await addRule(id, 'catalog:write', 'allow');
    await expect(asAppRole(sql`DELETE FROM tenant_role_rules WHERE id = ${rule}`)).rejects.toThrow(/permission denied/);
    await expect(asSchemaOwner(sql`DELETE FROM tenant_role_rules WHERE id = ${rule}`)).rejects.toThrow(/không xoá/);
    await expect(sql`UPDATE tenant_role_rules SET permission = 'documents:write' WHERE id = ${rule}`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`UPDATE tenant_role_rules SET removed_by = 'user:test', removed_at = now() WHERE id = ${rule}`.execute(db)).rejects.toThrow();
    await sql`UPDATE tenant_role_rules SET removed_by = 'user:test', removed_at = now(), remove_reason = 'Không cần nữa' WHERE id = ${rule}`.execute(db);
    await expect(sql`UPDATE tenant_role_rules SET remove_reason = 'Đổi lý do' WHERE id = ${rule}`.execute(db)).rejects.toThrow(/đã gỡ/);
  });

  it('luật / lần gán không trỏ được vai trò của đơn vị khác; lần gán không có hai vai trò', async () => {
    const foreign = await newRole('vt_ngoai', 'job', 'viewer', otherTenantId);
    await expect(addRule(foreign, 'catalog:write', 'allow')).rejects.toThrow();
    await expect(assign(foreign)).rejects.toThrow();
    const id = await newRole('vt_hai_vai', 'job', 'viewer');
    await expect(sql`INSERT INTO user_role_assignments (tenant_id, user_id, role, tenant_role_id, reason, granted_by)
      VALUES (${tenantId}, ${viewerId}, 'developer', ${id}, 'Gán hai vai trò', 'user:test')`.execute(db)).rejects.toThrow();
  });

  it('RLS: kết nối gắn đơn vị khác không thấy vai trò của đơn vị này', async () => {
    await newRole('vt_rls', 'job', 'viewer');
    const seen = await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL ROLE ketoan_app`.execute(trx);
      await sql`SELECT set_config('bizcity.tenant_id', ${otherTenantId}, true)`.execute(trx);
      return (await sql<{ n: number }>`SELECT count(*)::int AS n FROM tenant_roles WHERE code = 'vt_rls' AND tenant_id = ${tenantId}`.execute(trx)).rows[0]!.n;
    });
    expect(seen).toBe(0);
  });

  it('vai trò API không có quyền DELETE trên hai bảng mới', async () => {
    const { rows } = await sql<{ t: boolean; r: boolean }>`SELECT has_table_privilege('ketoan_app', 'tenant_roles', 'DELETE') AS t,
      has_table_privilege('ketoan_app', 'tenant_role_rules', 'DELETE') AS r`.execute(db);
    expect(rows[0]).toEqual({ t: false, r: false });
  });

  it('authz_version tăng khi thêm vai trò, thêm luật, gán', async () => {
    const v0 = await authzVersion();
    const id = await newRole('vt_phien_ban', 'job', 'viewer');
    const v1 = await authzVersion();
    await addRule(id, 'catalog:write', 'allow');
    const v2 = await authzVersion();
    expect(v1).toBeGreaterThan(v0);
    expect(v2).toBeGreaterThan(v1);
  });
});

describe('Lớp đọc + bộ tính (shadow, chưa nối đường yêu cầu)', () => {
  it('tenantRoleToAuthz: nền ∪ luật riêng; nền thuộc ADMIN_ROLES không kế thừa', () => {
    const r = tenantRoleToAuthz({ id: '9', code: 'x', label: 'X', kind: 'job', base_role: 'viewer', is_active: true },
      [{ id: '1', tenant_role_id: '9', permission: 'catalog:write', effect: 'allow' }, { id: '2', tenant_role_id: '8', permission: 'ledger:read', effect: 'deny' }]);
    expect(r.id).toBe('tenant:9');
    expect(r.rules.some((x) => x.pattern === 'documents:read' && x.effect === 'allow')).toBe(true);
    expect(r.rules.filter((x) => x.id.startsWith('rule:')).map((x) => x.pattern)).toEqual(['catalog:write']);
    const admin = tenantRoleToAuthz({ id: '7', code: 'y', label: 'Y', kind: 'job', base_role: 'owner' as never, is_active: true }, []);
    expect(admin.rules).toEqual([]);
  });

  let roleId = '';
  let assignmentId = '';

  it('chưa gán: người xem không có catalog:write', async () => {
    expect(await can('catalog:read')).toBe(true);
    expect(await can('catalog:write')).toBe(false);
  });

  it('gán vai trò của đơn vị (nền viewer + Cho catalog:write) → bộ tính cho; /auth/me chưa đổi (bước 4)', async () => {
    roleId = await newRole('thu_kho', 'job', 'viewer');
    await addRule(roleId, 'catalog:write', 'allow');
    assignmentId = await assign(roleId);
    expect(await can('catalog:write')).toBe(true);
    forgetRoles(viewerId);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${viewerToken}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.permissions).not.toContain('catalog:write');
  });

  it('lịch sử gán của W1 trả lần gán vai trò của đơn vị', async () => {
    const list = await call(ctx, 'GET', `/api/v1/users/${viewerId}/roles`);
    expect(list.body.data.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ id: assignmentId, role: null, tenantRoleId: roleId })]));
  });

  it('Cấm của vai trò hạn chế thắng cả quyền của vai trò chính', async () => {
    const r = await newRole('cam_xem_so', 'restriction', null);
    await addRule(r, 'ledger:*', 'deny');
    const a = await assign(r);
    expect(await can('ledger:read')).toBe(false);
    await sql`UPDATE user_role_assignments SET revoked_by = 'user:test', revoked_at = now(), revoke_reason = 'Bỏ hạn chế' WHERE id = ${a}`.execute(db);
    expect(await can('ledger:read')).toBe(true);
  });

  it('vô hiệu vai trò → không cấp; thu hồi lần gán → không cấp ngay', async () => {
    await sql`UPDATE tenant_roles SET is_active = false, version = version + 1, updated_by = 'user:test', updated_at = now() WHERE id = ${roleId}`.execute(db);
    expect(await can('catalog:write')).toBe(false);
    await sql`UPDATE tenant_roles SET is_active = true, version = version + 1, updated_by = 'user:test', updated_at = now() WHERE id = ${roleId}`.execute(db);
    expect(await can('catalog:write')).toBe(true);
    await sql`UPDATE user_role_assignments SET revoked_by = 'user:test', revoked_at = now(), revoke_reason = 'Chuyển việc' WHERE id = ${assignmentId}`.execute(db);
    expect(await can('catalog:write')).toBe(false);
  });
});
