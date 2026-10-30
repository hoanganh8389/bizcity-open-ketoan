// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Luật đăng nhập: kiểm mật khẩu, trạng thái, cấp phiên.
 */
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth.js';
import { verifyPassword } from '../../core/security/password.js';
import { signSession } from '../../core/security/tokens.js';
import { authRepository } from './auth.repository.js';
import type { LoginBody, SessionUser } from './auth.schemas.js';

export const authService = {
  async login(body: LoginBody): Promise<{ token: string; user: SessionUser }> {
    const row = await authRepository.findUserForLogin(db, body.tenantCode, body.email);
    // Cùng một thông báo cho mọi trường hợp sai để không lộ email nào tồn tại.
    const invalid = Errors.unauthorized('Mã đơn vị, email hoặc mật khẩu không đúng');
    if (!row || !row.is_active || !row.tenant_active) throw invalid;
    if (!(await verifyPassword(body.password, row.password_hash))) throw invalid;

    await authRepository.touchLogin(db, row.id);
    const token = await signSession({ sub: row.id, tid: row.tenant_id, role: row.role, name: row.full_name, sv: Number(row.session_version) });
    return {
      token,
      user: {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        tenant: { id: row.tenant_id, code: row.tenant_code, name: row.tenant_name },
        permissions: [],
      },
    };
  },

  async me(auth: AuthContext): Promise<SessionUser> {
    if (auth.kind !== 'user') throw Errors.forbidden('Chỉ dùng cho người dùng đăng nhập');
    const userId = auth.actor.slice('user:'.length);
    const row = await authRepository.findUserById(db, auth.tenantId, userId);
    if (!row) throw Errors.unauthorized();
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      tenant: { id: row.tenant_id, code: row.tenant_code, name: row.tenant_name },
      permissions: [...auth.permissions],
    };
  },
};
