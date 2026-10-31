// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Truy vấn dữ liệu cho đăng nhập. Repository chỉ đọc/ghi database, không chứa luật nghiệp vụ.
 */
import type { Db } from '../../db/client.js';

export const authRepository = {
  findUserForLogin(db: Db, tenantCode: string, email: string) {
    return db
      .selectFrom('users as u')
      .innerJoin('tenants as t', 't.id', 'u.tenant_id')
      .select(['u.id', 'u.email', 'u.full_name', 'u.password_hash', 'u.role', 'u.is_active', 'u.session_version', 't.id as tenant_id', 't.code as tenant_code', 't.name as tenant_name', 't.is_active as tenant_active'])
      .where('t.code', '=', tenantCode)
      .where('u.email', '=', email)
      .executeTakeFirst();
  },

  findUserById(db: Db, tenantId: string, userId: string) {
    return db
      .selectFrom('users as u')
      .innerJoin('tenants as t', 't.id', 'u.tenant_id')
      .select(['u.id', 'u.email', 'u.full_name', 'u.role', 't.id as tenant_id', 't.code as tenant_code', 't.name as tenant_name'])
      .where('u.tenant_id', '=', tenantId)
      .where('u.id', '=', userId)
      .where('u.is_active', '=', true)
      .executeTakeFirst();
  },

  touchLogin(db: Db, userId: string) {
    return db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', userId).execute();
  },
};
