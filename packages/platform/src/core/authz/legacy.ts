// @bizcity-layer P permissions
// [2026-11-05 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 nền (ADR-0027 D7): 6 vai trò hệ thống dựng từ code (rolePermissions), lần gán suy từ users.role, so tương đương cũ ↔ mới — nền cho DUAL-READ, không ai đổi quyền khi chuyển
/**
 * Giai đoạn chuyển đổi: users.role là nguồn lần gán vai trò hệ thống; luật của vai trò hệ thống = rolePermissions(role) (code), không
 * chép vào CSDL. Bộ tính mới chạy song song, so với đường cũ (parity) — chỉ chuyển khi không có ALLOW sai (T028-9).
 */
import { ROLES, type Role } from '@ketoan/contracts';
import type { AuthzAssignment, AuthzRole } from './types.js';
import { rolePermissions } from '../auth.js';

export const SYSTEM_ROLE_PREFIX = 'system:';
export const SYSTEM_ROLES = Object.values(ROLES) as Role[];

/** Vai trò hệ thống của code dưới dạng AuthzRole: mỗi quyền cũ = một luật Cho đích danh (không điều kiện, giữ đúng hành vi hôm nay). */
export function systemRole(role: Role): AuthzRole {
  return {
    id: `${SYSTEM_ROLE_PREFIX}${role}`, code: role, label: role, kind: 'system', isActive: true,
    rules: [...rolePermissions(role)].sort().map((p) => ({ id: `${SYSTEM_ROLE_PREFIX}${role}:${p}`, pattern: p, effect: 'allow' as const })),
  };
}

export function systemRoles(): Map<string, AuthzRole> {
  return new Map(SYSTEM_ROLES.map((r) => [`${SYSTEM_ROLE_PREFIX}${r}`, systemRole(r)]));
}

/** Lần gán suy từ users.role: toàn đơn vị, mọi mục đích — đúng phạm vi hôm nay (một vai trò, không phạm vi). */
export function legacyAssignment(userId: string, role: Role): AuthzAssignment {
  return {
    id: `legacy:${userId}`, principalKind: 'user', principalId: userId, roleId: `${SYSTEM_ROLE_PREFIX}${role}`,
    scopes: [{ kind: 'all' }], purposes: ['operate', 'approve', 'report', 'export'],
  };
}

/** Khoá API / khoá app: vai trò suy từ tập quyền đã tính theo phạm vi khoá (đường cũ) + lần gán toàn đơn vị. Chỉ để SO SÁNH (shadow). */
export function apiKeyLegacy(keyId: string, permissions: Iterable<string>): { role: AuthzRole; assignment: AuthzAssignment } {
  const roleId = `${SYSTEM_ROLE_PREFIX}apikey:${keyId}`;
  return {
    role: { id: roleId, code: `apikey:${keyId}`, label: 'Phạm vi khoá', kind: 'system', isActive: true,
      rules: [...permissions].sort().map((p) => ({ id: `${roleId}:${p}`, pattern: p, effect: 'allow' as const })) },
    assignment: { id: `legacy:apikey:${keyId}`, principalKind: 'apikey', principalId: keyId, roleId, scopes: [{ kind: 'all' }], purposes: ['operate', 'approve', 'report', 'export'] },
  };
}
