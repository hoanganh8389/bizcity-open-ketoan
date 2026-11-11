// @bizcity-layer P permissions
// [2026-11-05 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 (ADR-0027 D-AUTH-01 / -04): đọc vai trò bổ sung còn hiệu lực của người dùng (user_role_assignments, 0074), đệm 15 giây, xoá đệm khi gán / thu hồi
// [2026-11-06 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2 (ADR-0027 Phụ lục A, chữ chốt bước 3): đọc thêm vai trò của đơn vị — vai trò nền, luật Cho đích danh, luật Cấm; xoá đệm cả đơn vị khi đổi vai trò / luật
/**
 * VAI TRÒ BỔ SUNG + VAI TRÒ CỦA ĐƠN VỊ. users.role là vai trò chính; user_role_assignments thêm vai trò hệ thống (W1) hoặc vai trò của
 * đơn vị (tenant_roles, W2) cho cùng người. Quyền hiệu lực (core/auth.ts) = (vai trò chính ∪ vai trò bổ sung ∪ nền + Cho của vai trò đơn
 * vị) − Cấm. Chỉ thi hành dòng phạm vi cả đơn vị + mục đích "operate" (chữ chốt PHASE-028 00 §4a); dòng chi nhánh / kho / mục đích khác
 * được lưu nhưng chưa cấp quyền cho tới bộ giải phạm vi (bước 4).
 * Nhớ đệm CACHE_MS / người dùng như session-state.ts; ghi trong tiến trình này xoá đệm ngay (một người khi gán / thu hồi, cả bộ đệm khi
 * đổi vai trò hoặc luật — không biết ai đang giữ vai trò).
 */
import { sql } from 'kysely';
import type { Role } from '@ketoan/contracts';
import { db, type Db } from '../../db/client.js';

const CACHE_MS = 15_000;

export interface ExtraAuthz {
  /** Vai trò hệ thống bổ sung (W1). */
  roles: Role[];
  /** Vai trò nền của vai trò đơn vị còn hiệu lực (không thuộc ADMIN_ROLES — CSDL chặn). */
  baseRoles: Role[];
  /** Quyền Cho đích danh của vai trò đơn vị. */
  allow: string[];
  /** Mẫu quyền Cấm của vai trò đơn vị. */
  deny: string[];
}

// [2026-11-09 02:30 PM kiennt] PHASE-028 — S028-16: đệm theo tenants.authz_version — truyền version thì đệm còn đúng khi CÙNG version (không theo thời gian); đổi vai trò / luật / lần gán ở bản API nào cũng làm đệm mọi bản cũ ngay (trigger 0075)
const cache = new Map<string, { value: ExtraAuthz; at: number; version?: number }>();

const TODAY_VN = sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

/**
 * Vai trò bổ sung và vai trò của đơn vị còn hiệu lực hôm nay (giờ Việt Nam), phạm vi cả đơn vị, mục đích operate.
 * `authzVersion` (tenants.authz_version, đường yêu cầu): đệm dùng lại khi cùng version và cùng ngày (hiệu lực theo ngày); không truyền: đệm CACHE_MS như cũ.
 */
export async function extraAuthz(userId: string, conn: Db = db, authzVersion?: number): Promise<ExtraAuthz> {
  const hit = cache.get(userId);
  if (hit) {
    const sameDay = new Date(hit.at).toDateString() === new Date().toDateString();
    if (authzVersion !== undefined ? hit.version === authzVersion && sameDay : Date.now() - hit.at < CACHE_MS) return hit.value;
  }
  const { rows } = await sql<{ role: Role | null; tenant_role_id: string | null; base_role: Role | null }>`
    SELECT a.role, a.tenant_role_id::text, r.base_role
      FROM user_role_assignments a LEFT JOIN tenant_roles r ON r.id = a.tenant_role_id AND r.tenant_id = a.tenant_id
     WHERE a.user_id = ${userId} AND a.revoked_at IS NULL AND a.scope_type = 'tenant' AND a.purpose = 'operate'
       AND a.valid_from <= ${TODAY_VN} AND (a.valid_to IS NULL OR a.valid_to >= ${TODAY_VN})
       AND (a.tenant_role_id IS NULL OR r.is_active)`.execute(conn);
  const ids = [...new Set(rows.map((r) => r.tenant_role_id).filter((x): x is string => !!x))];
  const rules = ids.length
    ? (await sql<{ permission: string; effect: 'allow' | 'deny' }>`
        SELECT permission, effect FROM tenant_role_rules WHERE tenant_role_id = ANY(${ids}::bigint[]) AND removed_at IS NULL`.execute(conn)).rows
    : [];
  const value: ExtraAuthz = {
    roles: [...new Set(rows.map((r) => r.role).filter((x): x is Role => !!x))],
    baseRoles: [...new Set(rows.map((r) => r.base_role).filter((x): x is Role => !!x))],
    allow: [...new Set(rules.filter((r) => r.effect === 'allow').map((r) => r.permission))],
    deny: [...new Set(rules.filter((r) => r.effect === 'deny').map((r) => r.permission))],
  };
  cache.set(userId, { value, at: Date.now(), ...(authzVersion !== undefined ? { version: authzVersion } : {}) });
  return value;
}

/** Vai trò bổ sung hệ thống còn hiệu lực (W1) — giữ cho nơi chỉ cần danh sách vai trò. */
export async function extraRoles(userId: string, conn: Db = db): Promise<Role[]> {
  return (await extraAuthz(userId, conn)).roles;
}

/** Bỏ đệm của người dùng (vừa gán / thu hồi vai trò). */
export function forgetRoles(userId: string): void {
  cache.delete(userId);
}

/** Bỏ đệm của mọi người dùng (vừa đổi vai trò / luật của đơn vị). */
export function forgetAllRoles(): void {
  cache.clear();
}
