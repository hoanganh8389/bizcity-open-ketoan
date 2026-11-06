// @bizcity-layer P permissions
// [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 1 (ADR-0027 Phụ lục A bước 2): lớp đọc cho bộ tính — vai trò hệ thống + vai trò của đơn vị + lần gán của một người, kèm authz_version
/**
 * Nạp dữ liệu cho bộ tính thuần (engine.ts) từ CSDL, theo `bizcity_authorization@1`:
 *   vai trò  = 6 vai trò hệ thống (legacy.ts, từ code) + vai trò của đơn vị `tenant:<id>` (luật = Cho của vai trò nền + Cho / Cấm riêng)
 *   lần gán  = users.role (legacyAssignment) + các dòng còn mở của user_role_assignments (vai trò hệ thống hoặc vai trò của đơn vị)
 *   phiên bản = tenants.authz_version (trigger 0075 tăng ở mọi lần ghi vai trò / luật / lần gán)
 * Đợt này CHƯA nối vào đường yêu cầu (bước 4): auth.ts vẫn tính quyền như W1. Hàm chuyển đổi tách riêng, thuần, test không cần CSDL.
 * Không xuất qua index.ts để bộ tính thuần không kéo theo kết nối CSDL.
 */
import { sql } from 'kysely';
import type { Role } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { ADMIN_ROLES } from '../auth.js';
import { legacyAssignment, systemRole, systemRoles, SYSTEM_ROLE_PREFIX } from './legacy.js';
import type { AuthzAssignment, AuthzPurpose, AuthzRole, AuthzRule, AuthzScope } from './types.js';

export const TENANT_ROLE_PREFIX = 'tenant:';

export interface TenantRoleRow { id: string; code: string; label: string; kind: 'job' | 'privilege' | 'restriction'; base_role: Role | null; is_active: boolean }
export interface TenantRuleRow { id: string; tenant_role_id: string; permission: string; effect: 'allow' | 'deny' }
export interface RoleAssignmentRow {
  id: string; role: Role | null; tenant_role_id: string | null; scope_type: 'tenant' | 'branch' | 'warehouse'; scope_id: string | null;
  purpose: AuthzPurpose; valid_from: string; valid_to: string | null; revoked_at: Date | string | null;
}

/**
 * Vai trò của đơn vị → AuthzRole: Cho của vai trò nền (tính từ code, kế thừa một cấp) + luật riêng chưa gỡ. Vai trò nền thuộc
 * ADMIN_ROLES không kế thừa gì (D-AUTH-14: không lách D-AUTH-03 bằng nền owner) — CSDL đã chặn, đây là lớp thứ hai.
 */
export function tenantRoleToAuthz(row: TenantRoleRow, rules: readonly TenantRuleRow[]): AuthzRole {
  const id = `${TENANT_ROLE_PREFIX}${row.id}`;
  const base: AuthzRule[] = row.base_role && !ADMIN_ROLES.has(row.base_role)
    ? systemRole(row.base_role).rules.map((r) => ({ ...r, id: `${id}:base:${r.pattern}` }))
    : [];
  const own: AuthzRule[] = rules.filter((r) => String(r.tenant_role_id) === String(row.id))
    .map((r) => ({ id: `rule:${r.id}`, pattern: r.permission, effect: r.effect }));
  return { id, code: row.code, label: row.label, kind: row.kind, isActive: row.is_active, rules: [...base, ...own] };
}

/** Ngày (giờ Việt Nam) → mốc bắt đầu ngày đó; valid_to gồm cả ngày cuối nên hết hiệu lực từ 00:00 ngày kế tiếp. */
const vnDayStart = (d: string, plusDays = 0): string => new Date(new Date(`${d}T00:00:00+07:00`).getTime() + plusDays * 86_400_000).toISOString();

/** Một dòng user_role_assignments → AuthzAssignment (phạm vi tenant = all; một mục đích mỗi dòng). */
export function roleAssignmentToAuthz(userId: string, row: RoleAssignmentRow): AuthzAssignment {
  const scope: AuthzScope = row.scope_type === 'tenant' ? { kind: 'all' } : { kind: row.scope_type, id: String(row.scope_id) };
  return {
    id: `ura:${row.id}`, principalKind: 'user', principalId: String(userId),
    roleId: row.role ? `${SYSTEM_ROLE_PREFIX}${row.role}` : `${TENANT_ROLE_PREFIX}${row.tenant_role_id}`,
    scopes: [scope], purposes: [row.purpose],
    validFrom: vnDayStart(row.valid_from), validTo: row.valid_to ? vnDayStart(row.valid_to, 1) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}

export interface AuthzSnapshot { authzVersion: number; roles: Map<string, AuthzRole>; assignments: AuthzAssignment[] }

/** Dữ liệu bộ tính cần để quyết định cho một người dùng của đơn vị. Người không thuộc đơn vị → không lần gán nào. */
export async function loadAuthzSnapshot(conn: Db, tenantId: string, userId: string): Promise<AuthzSnapshot> {
  const [ver, user, rows] = await Promise.all([
    sql<{ v: string }>`SELECT authz_version::text AS v FROM tenants WHERE id = ${tenantId}`.execute(conn),
    sql<{ role: Role }>`SELECT role FROM users WHERE tenant_id = ${tenantId} AND id = ${userId}`.execute(conn),
    sql<RoleAssignmentRow>`
      SELECT id::text, role, tenant_role_id::text, scope_type, scope_id::text, purpose, valid_from::text, valid_to::text, revoked_at
        FROM user_role_assignments WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND revoked_at IS NULL`.execute(conn),
  ]);
  const roles = systemRoles();
  const assignments: AuthzAssignment[] = [];
  const primary = user.rows[0]?.role;
  if (primary) {
    assignments.push(legacyAssignment(String(userId), primary), ...rows.rows.map((r) => roleAssignmentToAuthz(userId, r)));
    const ids = [...new Set(rows.rows.map((r) => r.tenant_role_id).filter((x): x is string => !!x))];
    if (ids.length) {
      const [tr, rules] = await Promise.all([
        sql<TenantRoleRow>`SELECT id::text, code, label, kind, base_role, is_active FROM tenant_roles
                            WHERE tenant_id = ${tenantId} AND id = ANY(${ids}::bigint[])`.execute(conn),
        sql<TenantRuleRow>`SELECT id::text, tenant_role_id::text, permission, effect FROM tenant_role_rules
                            WHERE tenant_id = ${tenantId} AND tenant_role_id = ANY(${ids}::bigint[]) AND removed_at IS NULL`.execute(conn),
      ]);
      for (const r of tr.rows) roles.set(`${TENANT_ROLE_PREFIX}${r.id}`, tenantRoleToAuthz(r, rules.rows));
    }
  }
  return { authzVersion: Number(ver.rows[0]?.v ?? 0), roles, assignments };
}
