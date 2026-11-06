// @bizcity-layer P permissions
// [2026-11-05 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 (ADR-0027 D-AUTH-01 / -04): đọc vai trò bổ sung còn hiệu lực của người dùng (user_role_assignments, 0074), đệm 15 giây, xoá đệm khi gán / thu hồi
/**
 * VAI TRÒ BỔ SUNG. users.role là vai trò chính; user_role_assignments thêm vai trò cho cùng người. Quyền hiệu lực = vai trò chính ∪
 * các vai trò ở đây (core/auth.ts). W1 chỉ thi hành dòng phạm vi cả đơn vị + mục đích "operate" (chữ chốt PHASE-028 00 §4a): dòng
 * chi nhánh / kho / mục đích khác được lưu nhưng chưa cấp quyền cho tới bộ giải phạm vi W3.
 * Nhớ đệm CACHE_MS / người dùng như session-state.ts; gán / thu hồi trong tiến trình này xoá đệm ngay.
 */
import { sql } from 'kysely';
import type { Role } from '@ketoan/contracts';
import { db, type Db } from '../../db/client.js';

const CACHE_MS = 15_000;
const cache = new Map<string, { roles: Role[]; at: number }>();

/** Vai trò bổ sung còn hiệu lực hôm nay (giờ Việt Nam), phạm vi cả đơn vị, mục đích operate. */
export async function extraRoles(userId: string, conn: Db = db): Promise<Role[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.roles;
  // [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 1: bỏ qua lần gán vai trò của đơn vị (tenant_role_id, role NULL) — chưa cấp quyền cho tới bước 4 (ADR-0027 Phụ lục A)
  const { rows } = await sql<{ role: Role }>`
    SELECT DISTINCT role FROM user_role_assignments
     WHERE user_id = ${userId} AND role IS NOT NULL AND revoked_at IS NULL AND scope_type = 'tenant' AND purpose = 'operate'
       AND valid_from <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       AND (valid_to IS NULL OR valid_to >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`.execute(conn);
  const roles = rows.map((r) => r.role);
  cache.set(userId, { roles, at: Date.now() });
  return roles;
}

/** Bỏ đệm của người dùng (vừa gán / thu hồi vai trò). */
export function forgetRoles(userId: string): void {
  cache.delete(userId);
}
