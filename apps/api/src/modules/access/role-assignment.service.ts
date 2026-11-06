// @bizcity-layer P permissions
// [2026-11-05 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 (ADR-0027, chữ chốt 00 §4a): gán / thu hồi vai trò bổ sung — không tự gán cho mình, không leo thang quyền, chỉ thêm
// [2026-11-06 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — đổi số migration W1 0074 → 0075 (W-13: 0073 / 0074 PHASE-026 đợt 2 / 3 giữ)
// [2026-11-06 01:35 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — đổi số migration W1 0075 → 0073 (chủ dự án chọn: ai merge trước lấy số trước, so-tiep-theo kiem; PHASE-026 đợt 2 / 3 đổi số khi merge)
/**
 * Vai trò bổ sung của người dùng (user_role_assignments, 0073). Luật:
 *  - Không tự gán / thu hồi vai trò của chính mình.
 *  - Không gán / thu hồi vai trò có quyền vượt quyền của người thao tác (chống leo thang).
 *  - Không gán trùng vai trò chính, không gán trùng một dòng đang mở.
 *  - W1 chỉ phạm vi cả đơn vị + mục đích "operate" (dòng phạm vi khác chưa thi hành — schema không nhận).
 *  - Chỉ thêm: thu hồi đặt revoked_* một lần; CSDL chặn xoá / sửa (trigger 0073).
 * Bảng không có trong db/types.ts (PHASE-026 đợt 3 đang giữ tệp đó) — truy vấn bằng `sql` có tham số.
 */
import { sql } from 'kysely';
import type { Role } from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { rolePermissions, type AuthContext } from '@bizcity/platform/core/auth';
import { forgetRoles } from '@bizcity/platform/core/security/role-assignments';
import type { ActionTx } from '@bizcity/platform/core/actions';
import { accessRepository } from './access.repository.js';
import type { RoleAssign, RoleRevoke } from './access.schemas.js';

interface AssignmentRow {
  id: string; role: Role | null; tenant_role_id: string | null; scope_type: string; scope_id: string | null; purpose: string; valid_from: string; valid_to: string | null;
  reason: string; granted_by: string; granted_at: Date; revoked_by: string | null; revoked_at: Date | null; revoke_reason: string | null; active: boolean;
}

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const selfId = (auth: AuthContext) => (auth.kind === 'user' ? auth.actor.slice('user:'.length) : null);

/** Người thao tác phải có mọi quyền của vai trò được gán / thu hồi (chống leo thang). */
function assertNotEscalating(auth: AuthContext, role: Role): void {
  const missing = [...rolePermissions(role)].filter((p) => !auth.permissions.has(p));
  if (missing.length) throw Errors.forbidden(`Vai trò ${role} có quyền bạn không có (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}) — không gán / thu hồi được`);
}

async function targetUser(trx: ActionTx, auth: AuthContext, userId: string) {
  if (selfId(auth) === userId) throw Errors.forbidden('Không tự gán / thu hồi vai trò của chính mình');
  const user = await accessRepository.findUser(trx, auth.tenantId, userId);
  if (!user) throw Errors.notFound('người dùng');
  return user;
}

export const roleAssignmentService = {
  // [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 1: lịch sử gán trả cả lần gán vai trò của đơn vị (tenantRoleId, role NULL)
  /** Lịch sử gán vai trò của một người (cả dòng đã thu hồi), mới nhất trước. */
  async list(auth: AuthContext, userId: string) {
    const user = await accessRepository.findUser(db, auth.tenantId, userId);
    if (!user) throw Errors.notFound('người dùng');
    const { rows } = await sql<AssignmentRow>`
      SELECT id, role, tenant_role_id, scope_type, scope_id, purpose, valid_from::text, valid_to::text, reason, granted_by, granted_at, revoked_by, revoked_at, revoke_reason,
             (revoked_at IS NULL AND valid_from <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              AND (valid_to IS NULL OR valid_to >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) AS active
        FROM user_role_assignments WHERE tenant_id = ${auth.tenantId} AND user_id = ${userId}
       ORDER BY granted_at DESC, id DESC`.execute(db);
    return {
      primaryRole: user.role,
      assignments: rows.map((r) => ({
        id: String(r.id), role: r.role, tenantRoleId: r.tenant_role_id, scopeType: r.scope_type, scopeId: r.scope_id, purpose: r.purpose, validFrom: r.valid_from, validTo: r.valid_to,
        reason: r.reason, grantedBy: r.granted_by, grantedAt: r.granted_at, revokedBy: r.revoked_by, revokedAt: r.revoked_at, revokeReason: r.revoke_reason, active: r.active,
      })),
    };
  },

  async assignIn(trx: ActionTx, auth: AuthContext, userId: string, input: RoleAssign) {
    const from = input.validFrom ?? todayVn();
    if (input.validTo && input.validTo < from) throw Errors.validation('validTo phải từ validFrom (mặc định hôm nay) trở đi');
    const user = await targetUser(trx, auth, userId);
    assertNotEscalating(auth, input.role);
    if (user.role === input.role) throw Errors.conflict(`${input.role} đã là vai trò chính của người này`);
    const { rows: open } = await sql<{ id: string }>`
      SELECT id FROM user_role_assignments
       WHERE tenant_id = ${auth.tenantId} AND user_id = ${userId} AND role = ${input.role} AND scope_type = 'tenant' AND purpose = 'operate' AND revoked_at IS NULL`.execute(trx);
    if (open.length) throw Errors.conflict(`Người này đang có vai trò bổ sung ${input.role} (dòng ${open[0]!.id}) — thu hồi dòng cũ trước khi gán lại`);
    const { rows } = await sql<{ id: string }>`
      INSERT INTO user_role_assignments (tenant_id, user_id, role, valid_from, valid_to, reason, granted_by)
      VALUES (${auth.tenantId}, ${userId}, ${input.role},
              ${from}::date, ${input.validTo ?? null}::date, ${input.reason}, ${auth.actor})
      RETURNING id`.execute(trx);
    const id = String(rows[0]!.id);
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'user.role_assign', objectType: 'user', objectId: userId, after: { assignmentId: id, role: input.role, validFrom: from, validTo: input.validTo, reason: input.reason } });
    forgetRoles(userId);
    return { id, userId, role: input.role };
  },

  async revokeIn(trx: ActionTx, auth: AuthContext, userId: string, assignmentId: string, input: RoleRevoke) {
    await targetUser(trx, auth, userId);
    const { rows } = await sql<{ id: string; role: Role; revoked_at: Date | null }>`
      SELECT id, role, revoked_at FROM user_role_assignments
       WHERE tenant_id = ${auth.tenantId} AND user_id = ${userId} AND id = ${assignmentId} FOR UPDATE`.execute(trx);
    const row = rows[0];
    if (!row) throw Errors.notFound('dòng gán vai trò');
    if (row.revoked_at) throw Errors.conflict(`Dòng gán vai trò ${assignmentId} đã thu hồi`);
    assertNotEscalating(auth, row.role);
    await sql`UPDATE user_role_assignments SET revoked_by = ${auth.actor}, revoked_at = now(), revoke_reason = ${input.reason}
               WHERE tenant_id = ${auth.tenantId} AND id = ${assignmentId}`.execute(trx);
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'user.role_revoke', objectType: 'user', objectId: userId, before: { assignmentId, role: row.role }, after: { reason: input.reason } });
    forgetRoles(userId);
    return { id: assignmentId, revoked: true };
  },
};
