// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/core/security/session-state.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
/**
 * PHIÊN ĐĂNG NHẬP THU HỒI ĐƯỢC. Vé (JWT) mang sv = users.session_version lúc cấp; mỗi lần xác thực đối chiếu với bảng người dùng:
 * khác số (đã đổi / đặt lại mật khẩu, đổi vai trò, đăng xuất các thiết bị khác) hoặc tài khoản bị khoá → từ chối (401, máy đó tự
 * đăng xuất). Nhớ đệm CACHE_MS / người dùng để không truy vấn mỗi lần gọi; tăng số trong tiến trình này thì xoá đệm ngay.
 *
 * checkSession (đường yêu cầu, PHASE-028 S028-16): KHÔNG đệm — một truy vấn khoá chính users ⋈ tenants mỗi yêu cầu, trả cùng lúc
 * session_version và tenants.authz_version. Thu hồi phiên / đổi phân quyền có hiệu lực từ yêu cầu kế tiếp ở MỌI bản API (trước: tới 15
 * giây, mỗi tiến trình đếm riêng). authzVersion dùng làm khoá đệm quyền (role-assignments.ts).
 */
import { sql } from 'kysely';
import { db, type Db } from '../../db/client.js';

const CACHE_MS = 15_000;
const cache = new Map<string, { version: number; active: boolean; at: number }>();

/** Vé còn dùng được: tài khoản còn hoạt động và số phiên bản phiên trong vé đúng bằng số hiện tại. */
export async function sessionStillValid(userId: string, sv: number): Promise<boolean> {
  const hit = cache.get(userId);
  let state = hit && Date.now() - hit.at < CACHE_MS ? hit : null;
  if (!state) {
    const row = await db.selectFrom('users').select(['session_version', 'is_active']).where('id', '=', userId).executeTakeFirst();
    if (!row) return false;
    state = { version: Number(row.session_version), active: row.is_active, at: Date.now() };
    cache.set(userId, state);
  }
  return state.active && state.version === sv;
}

// [2026-11-09 02:30 PM kiennt] PHASE-028 — S028-16 (80 §4, draft W0 20 §5): kiểm phiên không đệm, kèm authz_version của đơn vị cho đệm quyền
export interface SessionCheck { valid: boolean; authzVersion: number }

/** Vé còn dùng được không, và phiên bản phân quyền hiện tại của đơn vị — một truy vấn, không đệm. */
export async function checkSession(userId: string, sv: number, conn: Db = db): Promise<SessionCheck> {
  const row = await conn.selectFrom('users').innerJoin('tenants', 'tenants.id', 'users.tenant_id')
    .select(['users.session_version', 'users.is_active', sql<string>`tenants.authz_version`.as('authz_version')])
    .where('users.id', '=', userId).executeTakeFirst();
  if (!row) return { valid: false, authzVersion: 0 };
  return { valid: row.is_active && Number(row.session_version) === sv, authzVersion: Number(row.authz_version) };
}

/** Thu hồi mọi vé đang có của người dùng (tăng số phiên bản phiên); trả số mới để cấp vé mới cho máy đang thao tác (nếu cần). */
export async function bumpSession(trx: Db, userId: string): Promise<number> {
  const row = await trx.updateTable('users').set({ session_version: sql`session_version + 1` }).where('id', '=', userId).returning('session_version').executeTakeFirstOrThrow();
  cache.delete(userId);
  return Number(row.session_version);
}

/** Bỏ nhớ đệm của người dùng (vd vừa khoá / mở khoá tài khoản). */
export function forgetSession(userId: string): void {
  cache.delete(userId);
}
