// @bizcity-layer P permissions
// [2026-11-06 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2 (ADR-0027 Phụ lục A, chữ chốt bước 3): quản trị vai trò của đơn vị — tạo / sửa / vô hiệu, thêm / gỡ luật Cho + Cấm; chống leo thang, confirmPassword cho quyền rủi ro cao
/**
 * Vai trò của đơn vị (tenant_roles, tenant_role_rules — 0075). Luật máy chủ:
 *  - Cho: quyền đích danh, có trong sổ quyền của code; người thêm phải tự có quyền đó (chống leo thang). Cấm: mẫu phải khớp ≥ 1 quyền đã biết.
 *  - Loại `restriction` chỉ nhận Cấm. Mã / loại / vai trò nền bất biến (trigger 0075) — chỉ sửa tên, bật / tắt (version + 1).
 *  - Thêm Cho quyền `risk: high` đòi `confirmPassword` của chính người thao tác. Mọi thay đổi ghi nhật ký có lý do.
 *  - Ghi vai trò / luật làm xoá đệm quyền của cả đơn vị trong tiến trình này (không biết ai đang giữ vai trò).
 * Bảng không có trong db/types.ts — truy vấn bằng `sql` có tham số (như role-assignment.service.ts).
 */
import { sql } from 'kysely';
import { db, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { isHighRiskPermission, isKnownPermission, listModulePermissions, PERMISSIONS, rolePermissions, type AuthContext } from '@bizcity/platform/core/auth';
import { matchPattern } from '@bizcity/platform/core/authz/engine';
import { CORE_PERMISSION_META } from '@bizcity/platform/core/authz/catalog';
import { forgetAllRoles } from '@bizcity/platform/core/security/role-assignments';
import { verifyPassword } from '../../core/security/password.js';
import type { ActionTx } from '@bizcity/platform/core/actions';
import type { Role } from '@ketoan/contracts';
import type { TenantRoleCreate, TenantRoleUpdate, TenantRuleAdd } from './access.schemas.js';
import { accessRepository } from './access.repository.js';

const ROLES_SYSTEM = ['owner', 'chief_accountant', 'accountant', 'viewer', 'developer', 'auditor'] as const;

export interface TenantRoleRow { id: string; code: string; label: string; kind: 'job' | 'privilege' | 'restriction'; base_role: Role | null; is_active: boolean; version: number }

/** Mọi khoá quyền đang biết: Core + module đã đăng ký. */
const knownPermissions = (): string[] => [...(PERMISSIONS as readonly string[]), ...listModulePermissions().map((p) => p.key)];

const selfId = (auth: AuthContext) => (auth.kind === 'user' ? auth.actor.slice('user:'.length) : null);

/** Nhập lại mật khẩu của chính người thao tác (luật cứng 2). Thiếu / sai → VALIDATION, chưa ghi gì. */
export async function assertConfirmPassword(trx: ActionTx, auth: AuthContext, confirmPassword: string | undefined, what: string): Promise<void> {
  const id = selfId(auth);
  if (!id) throw Errors.forbidden('Chỉ người dùng đăng nhập mới cấp quyền rủi ro cao');
  if (!confirmPassword) throw Errors.validation(`${what} — nhập lại mật khẩu của bạn (confirmPassword)`);
  const me = await accessRepository.findUser(trx, auth.tenantId, id);
  if (!me || !(await verifyPassword(confirmPassword, me.password_hash))) throw Errors.validation('Mật khẩu xác nhận không đúng');
}

async function loadRole(trx: ActionTx | Db, tenantId: string, id: string, lock = false): Promise<TenantRoleRow> {
  const { rows } = lock
    ? await sql<TenantRoleRow>`SELECT id::text, code, label, kind, base_role, is_active, version FROM tenant_roles WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)
    : await sql<TenantRoleRow>`SELECT id::text, code, label, kind, base_role, is_active, version FROM tenant_roles WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  if (!rows[0]) throw Errors.notFound('vai trò');
  return rows[0];
}

/** Quyền mà một vai trò của đơn vị cấp: nền + Cho đích danh còn áp dụng (chống leo thang, quyền cao). */
export async function tenantRoleGrants(trx: ActionTx, tenantId: string, roleId: string): Promise<{ role: TenantRoleRow; grants: Set<string>; allow: string[] }> {
  const role = await loadRole(trx, tenantId, roleId);
  const { rows } = await sql<{ permission: string }>`
    SELECT permission FROM tenant_role_rules WHERE tenant_id = ${tenantId} AND tenant_role_id = ${roleId} AND effect = 'allow' AND removed_at IS NULL`.execute(trx);
  const grants = new Set<string>(role.base_role ? rolePermissions(role.base_role) : []);
  for (const r of rows) grants.add(r.permission);
  return { role, grants, allow: rows.map((r) => r.permission) };
}

/** Quyền rủi ro cao: Core theo sổ quyền của bộ tính (CORE_PERMISSION_META), module theo manifest (risk: high). */
const isHigh = (p: string): boolean => (CORE_PERMISSION_META as Record<string, { risk?: string }>)[p]?.risk === 'high' || isHighRiskPermission(p);

export const tenantRoleService = {
  /** Danh sách vai trò của đơn vị: số luật đang áp dụng, số người đang giữ (lần gán chưa thu hồi). */
  async list(auth: AuthContext) {
    const { rows } = await sql<TenantRoleRow & { rules: number; holders: number; created_at: Date }>`
      SELECT r.id::text, r.code, r.label, r.kind, r.base_role, r.is_active, r.version, r.created_at,
             (SELECT count(*)::int FROM tenant_role_rules x WHERE x.tenant_role_id = r.id AND x.removed_at IS NULL) AS rules,
             (SELECT count(DISTINCT a.user_id)::int FROM user_role_assignments a WHERE a.tenant_role_id = r.id AND a.revoked_at IS NULL) AS holders
        FROM tenant_roles r WHERE r.tenant_id = ${auth.tenantId} ORDER BY r.created_at, r.id`.execute(db);
    return rows.map((r) => ({ id: r.id, code: r.code, label: r.label, kind: r.kind, baseRole: r.base_role, isActive: r.is_active, version: r.version, rules: r.rules, holders: r.holders, createdAt: r.created_at }));
  },

  /** Một vai trò kèm luật đang áp dụng và lịch sử luật (cả luật đã gỡ). */
  async get(auth: AuthContext, id: string) {
    const role = await loadRole(db, auth.tenantId, id);
    const { rows } = await sql<{ id: string; permission: string; effect: string; note: string | null; created_by: string; created_at: Date; removed_by: string | null; removed_at: Date | null; remove_reason: string | null }>`
      SELECT id::text, permission, effect, note, created_by, created_at, removed_by, removed_at, remove_reason
        FROM tenant_role_rules WHERE tenant_id = ${auth.tenantId} AND tenant_role_id = ${id} ORDER BY created_at DESC, id DESC`.execute(db);
    return {
      id: role.id, code: role.code, label: role.label, kind: role.kind, baseRole: role.base_role, isActive: role.is_active, version: role.version,
      rules: rows.map((r) => ({ id: r.id, permission: r.permission, effect: r.effect, note: r.note, createdBy: r.created_by, createdAt: r.created_at, removedBy: r.removed_by, removedAt: r.removed_at, removeReason: r.remove_reason, active: !r.removed_at })),
    };
  },

  async createIn(trx: ActionTx, auth: AuthContext, input: TenantRoleCreate) {
    if ((ROLES_SYSTEM as readonly string[]).includes(input.code)) throw Errors.validation(`Mã ${input.code} trùng vai trò hệ thống`);
    if (input.kind === 'restriction' && input.baseRole) throw Errors.validation('Vai trò loại restriction chỉ để Cấm — không có vai trò nền');
    const { rows: dup } = await sql<{ id: string }>`SELECT id FROM tenant_roles WHERE tenant_id = ${auth.tenantId} AND code = ${input.code}`.execute(trx);
    if (dup.length) throw Errors.conflict(`Mã vai trò ${input.code} đã có`);
    // Vai trò nền: người tạo phải có mọi quyền của nền (không dựng đường vòng để cấp cái mình không có).
    if (input.baseRole) assertHolds(auth, [...rolePermissions(input.baseRole)], `vai trò nền ${input.baseRole}`);
    const { rows } = await sql<{ id: string }>`
      INSERT INTO tenant_roles (tenant_id, code, label, kind, base_role, created_by)
      VALUES (${auth.tenantId}, ${input.code}, ${input.label}, ${input.kind}, ${input.baseRole ?? null}, ${auth.actor}) RETURNING id::text`.execute(trx);
    const id = rows[0]!.id;
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'role.create', objectType: 'tenant_role', objectId: id, after: { code: input.code, label: input.label, kind: input.kind, baseRole: input.baseRole ?? null, reason: input.reason } });
    forgetAllRoles();
    return { id, code: input.code, version: 1 };
  },

  async updateIn(trx: ActionTx, auth: AuthContext, id: string, input: TenantRoleUpdate) {
    const role = await loadRole(trx, auth.tenantId, id, true);
    if (role.version !== input.version) throw Errors.conflict(`Vai trò đã đổi (version ${role.version}, bạn gửi ${input.version}) — tải lại rồi sửa`);
    if (input.label === undefined && input.isActive === undefined) throw Errors.validation('Không có gì để sửa (label hoặc isActive)');
    const label = input.label ?? role.label;
    const isActive = input.isActive ?? role.is_active;
    // Bật lại vai trò: người bật phải giữ mọi quyền vai trò sẽ cấp (như khi gán).
    if (isActive && !role.is_active) assertHolds(auth, [...(await tenantRoleGrants(trx, auth.tenantId, id)).grants], `vai trò ${role.code}`);
    await sql`UPDATE tenant_roles SET label = ${label}, is_active = ${isActive}, version = version + 1, updated_by = ${auth.actor}, updated_at = now()
               WHERE tenant_id = ${auth.tenantId} AND id = ${id}`.execute(trx);
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'role.update', objectType: 'tenant_role', objectId: id,
      before: { label: role.label, isActive: role.is_active, version: role.version }, after: { label, isActive, version: role.version + 1, reason: input.reason } });
    forgetAllRoles();
    return { id, version: role.version + 1, isActive };
  },

  async ruleAddIn(trx: ActionTx, auth: AuthContext, roleId: string, input: TenantRuleAdd) {
    const role = await loadRole(trx, auth.tenantId, roleId, true);
    if (!role.is_active) throw Errors.conflict(`Vai trò ${role.code} đã vô hiệu — bật lại trước khi thêm luật`);
    if (role.kind === 'restriction' && input.effect !== 'deny') throw Errors.validation('Vai trò loại restriction chỉ nhận luật Cấm');
    if (input.effect === 'allow') {
      if (input.permission.includes('*')) throw Errors.validation('Luật Cho phải ghi đích danh một quyền (không dùng *)');
      if (!isKnownPermission(input.permission)) throw Errors.validation(`Quyền ${input.permission} không có trong sổ quyền`);
      assertHolds(auth, [input.permission], `quyền ${input.permission}`);
      if (isHigh(input.permission)) await assertConfirmPassword(trx, auth, input.confirmPassword, `Cho quyền rủi ro cao ${input.permission}`);
    } else if (!knownPermissions().some((p) => matchPattern(input.permission, p))) {
      throw Errors.validation(`Mẫu ${input.permission} không khớp quyền nào trong sổ quyền`);
    }
    const { rows: open } = await sql<{ id: string }>`
      SELECT id FROM tenant_role_rules WHERE tenant_role_id = ${roleId} AND permission = ${input.permission} AND effect = ${input.effect} AND removed_at IS NULL`.execute(trx);
    if (open.length) throw Errors.conflict(`Luật ${input.effect} ${input.permission} đã có (dòng ${open[0]!.id})`);
    const { rows } = await sql<{ id: string }>`
      INSERT INTO tenant_role_rules (tenant_id, tenant_role_id, permission, effect, note, created_by)
      VALUES (${auth.tenantId}, ${roleId}, ${input.permission}, ${input.effect}, ${input.note ?? null}, ${auth.actor}) RETURNING id::text`.execute(trx);
    const id = rows[0]!.id;
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'role.rule_add', objectType: 'tenant_role', objectId: roleId,
      after: { ruleId: id, permission: input.permission, effect: input.effect, reason: input.reason } });
    forgetAllRoles();
    return { id, roleId, permission: input.permission, effect: input.effect };
  },

  async ruleRemoveIn(trx: ActionTx, auth: AuthContext, roleId: string, ruleId: string, reason: string) {
    await loadRole(trx, auth.tenantId, roleId, true);
    const { rows } = await sql<{ id: string; permission: string; effect: string; removed_at: Date | null }>`
      SELECT id::text, permission, effect, removed_at FROM tenant_role_rules WHERE tenant_id = ${auth.tenantId} AND tenant_role_id = ${roleId} AND id = ${ruleId} FOR UPDATE`.execute(trx);
    const rule = rows[0];
    if (!rule) throw Errors.notFound('luật của vai trò');
    if (rule.removed_at) throw Errors.conflict(`Luật ${ruleId} đã gỡ`);
    // Gỡ Cho = thu bớt quyền (không cần quyền đó); gỡ Cấm = mở lại quyền → người gỡ phải tự có quyền khớp mẫu (không dùng gỡ Cấm để cấp cái mình không có).
    if (rule.effect === 'deny') assertHolds(auth, knownPermissions().filter((p) => matchPattern(rule.permission, p)), `quyền mà luật Cấm ${rule.permission} đang chặn`);
    await sql`UPDATE tenant_role_rules SET removed_by = ${auth.actor}, removed_at = now(), remove_reason = ${reason} WHERE tenant_id = ${auth.tenantId} AND id = ${ruleId}`.execute(trx);
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'role.rule_remove', objectType: 'tenant_role', objectId: roleId,
      before: { ruleId, permission: rule.permission, effect: rule.effect }, after: { reason } });
    forgetAllRoles();
    return { id: ruleId, removed: true };
  },
};

/** Người thao tác phải tự có mọi quyền trong danh sách (chống leo thang). */
export function assertHolds(auth: AuthContext, permissions: readonly string[], what: string): void {
  const missing = permissions.filter((p) => !auth.permissions.has(p as never));
  if (missing.length) throw Errors.forbidden(`${what} có quyền bạn không có (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}) — không cấp được`);
}

export { isHigh as isHighPermission };
