// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Người dùng và khoá API của một đơn vị.
 */
import type { Db } from '../../db/client.js';

export const accessRepository = {
  listUsers(db: Db, tenantId: string) {
    return db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'role', 'is_active', 'last_login_at', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at')
      .execute();
  },

  findUser(db: Db, tenantId: string, id: string) {
    return db.selectFrom('users').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  },

  insertUser(db: Db, v: { tenant_id: string; email: string; full_name: string; password_hash: string; role: string }) {
    return db.insertInto('users').values(v).returning(['id']).executeTakeFirstOrThrow();
  },

  updateUser(db: Db, tenantId: string, id: string, patch: Record<string, unknown>) {
    return db.updateTable('users').set(patch).where('tenant_id', '=', tenantId).where('id', '=', id).execute();
  },

  /** Số chủ sở hữu còn hoạt động (không cho khoá/hạ quyền người cuối cùng). */
  async activeOwnerCount(db: Db, tenantId: string): Promise<number> {
    const r = await db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('tenant_id', '=', tenantId)
      .where('role', '=', 'owner')
      .where('is_active', '=', true)
      .executeTakeFirst();
    return Number(r?.n ?? 0);
  },

  listKeys(db: Db, tenantId: string) {
    return db
      .selectFrom('api_keys')
      .select(['id', 'name', 'key_prefix', 'scopes', 'last_used_at', 'revoked_at', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .execute();
  },

  insertKey(db: Db, v: { tenant_id: string; name: string; key_prefix: string; key_hash: string; scopes: string[] }) {
    return db.insertInto('api_keys').values(v).returning(['id']).executeTakeFirstOrThrow();
  },

  revokeKey(db: Db, tenantId: string, id: string) {
    return db
      .updateTable('api_keys')
      .set({ revoked_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .returning(['id', 'name'])
      .executeTakeFirst();
  },
};
