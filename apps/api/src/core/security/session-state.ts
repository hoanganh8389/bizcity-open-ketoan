/**
 * PHIÊN ĐĂNG NHẬP THU HỒI ĐƯỢC. Vé (JWT) mang sv = users.session_version lúc cấp; mỗi lần xác thực đối chiếu với bảng người dùng:
 * khác số (đã đổi / đặt lại mật khẩu, đổi vai trò, đăng xuất các thiết bị khác) hoặc tài khoản bị khoá → từ chối (401, máy đó tự
 * đăng xuất). Nhớ đệm CACHE_MS / người dùng để không truy vấn mỗi lần gọi; tăng số trong tiến trình này thì xoá đệm ngay.
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
