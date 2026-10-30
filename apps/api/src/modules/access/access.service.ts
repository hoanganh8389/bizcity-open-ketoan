// @bizcity-layer P permissions
/**
 * Luật quản lý truy cập:
 *  - Mật khẩu tối thiểu 8 ký tự; chỉ lưu bản băm.
 *  - Không khoá, không hạ quyền chủ sở hữu cuối cùng (tránh tự khoá cả đơn vị).
 *  - Khoá API chỉ hiện đầy đủ MỘT lần lúc tạo; database chỉ giữ bản băm + 10 ký tự đầu.
 *  - Thu hồi khoá có hiệu lực ngay.
 */
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { generateApiKey, hashPassword, verifyPassword } from '../../core/security/password.js';
import { accessRepository } from './access.repository.js';
import { bumpSession, forgetSession } from '../../core/security/session-state.js';
import type { ApiKeyCreate, UserCreate, UserUpdate } from './access.schemas.js';

export const accessService = {
  async listUsers(auth: AuthContext) {
    return (await accessRepository.listUsers(db, auth.tenantId)).map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      isActive: u.is_active,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    }));
  },

  async createUser(auth: AuthContext, input: UserCreate) {
    const password_hash = await hashPassword(input.password);
    return db.transaction().execute(async (trx) => {
      const row = await accessRepository.insertUser(trx, { tenant_id: auth.tenantId, email: input.email, full_name: input.fullName, password_hash, role: input.role });
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'user.create', objectType: 'user', objectId: row.id, after: { email: input.email, role: input.role } });
      return { id: row.id };
    });
  },

  async updateUser(auth: AuthContext, id: string, input: UserUpdate) {
    const password_hash = input.password ? await hashPassword(input.password) : undefined;
    return db.transaction().execute(async (trx) => {
      const user = await accessRepository.findUser(trx, auth.tenantId, id);
      if (!user) throw Errors.notFound('người dùng');

      const losingOwner = user.role === 'owner' && user.is_active && ((input.role && input.role !== 'owner') || input.isActive === false);
      if (losingOwner && (await accessRepository.activeOwnerCount(trx, auth.tenantId)) <= 1) {
        throw Errors.conflict('Phải còn ít nhất một chủ sở hữu đang hoạt động');
      }
      const patch: Record<string, unknown> = {};
      if (input.fullName !== undefined) patch.full_name = input.fullName;
      if (input.role !== undefined) patch.role = input.role;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (password_hash) patch.password_hash = password_hash;
      if (Object.keys(patch).length) await accessRepository.updateUser(trx, auth.tenantId, id, patch);
      // Đặt lại mật khẩu, khoá, đổi vai trò: mọi máy đang đăng nhập tài khoản này bị đăng xuất (vé cũ hết hiệu lực).
      const revoke = Boolean(password_hash) || input.isActive === false || (input.role !== undefined && input.role !== user.role);
      if (revoke) await bumpSession(trx, id);
      await writeAudit(trx, {
        tenantId: auth.tenantId,
        actor: auth.actor,
        action: 'user.update',
        objectType: 'user',
        objectId: id,
        after: { fullName: input.fullName, role: input.role, isActive: input.isActive, passwordReset: Boolean(password_hash), sessionsRevoked: revoke },
      });
      return { id, sessionsRevoked: revoke };
    }).finally(() => forgetSession(id));
  },

  /**
   * Người dùng tự đổi mật khẩu: phải nhập đúng mật khẩu hiện tại. Mọi máy khác đang đăng nhập tài khoản này bị đăng xuất;
   * máy đang đổi nhận vé mới (reissue) nên vẫn làm việc tiếp.
   */
  async changeOwnPassword(auth: AuthContext, current: string, next: string, reissue: (sv: number) => Promise<string>) {
    if (auth.kind !== 'user') throw Errors.forbidden('Chỉ dùng cho người dùng đăng nhập');
    const id = auth.actor.slice('user:'.length);
    const user = await accessRepository.findUser(db, auth.tenantId, id);
    if (!user || !(await verifyPassword(current, user.password_hash))) throw Errors.validation('Mật khẩu hiện tại không đúng');
    const sv = await db.transaction().execute(async (trx) => {
      await accessRepository.updateUser(trx, auth.tenantId, id, { password_hash: await hashPassword(next) });
      return bumpSession(trx, id);
    }).finally(() => forgetSession(id));
    await writeAudit(db, { tenantId: auth.tenantId, actor: auth.actor, action: 'user.change_password', objectType: 'user', objectId: id, after: { otherSessionsRevoked: true } });
    return { changed: true, token: await reissue(sv) };
  },

  /** Đăng xuất mọi máy khác đang đăng nhập tài khoản này (không đổi mật khẩu); máy đang bấm nhận vé mới. */
  async logoutOthers(auth: AuthContext, reissue: (sv: number) => Promise<string>) {
    if (auth.kind !== 'user') throw Errors.forbidden('Chỉ dùng cho người dùng đăng nhập');
    const id = auth.actor.slice('user:'.length);
    const sv = await bumpSession(db, id).finally(() => forgetSession(id));
    await writeAudit(db, { tenantId: auth.tenantId, actor: auth.actor, action: 'user.logout_others', objectType: 'user', objectId: id });
    return { token: await reissue(sv) };
  },

  async listKeys(auth: AuthContext) {
    return (await accessRepository.listKeys(db, auth.tenantId)).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      scopes: k.scopes,
      lastUsedAt: k.last_used_at,
      revokedAt: k.revoked_at,
      createdAt: k.created_at,
    }));
  },

  async createKey(auth: AuthContext, input: ApiKeyCreate) {
    const k = generateApiKey();
    return db.transaction().execute(async (trx) => {
      const row = await accessRepository.insertKey(trx, { tenant_id: auth.tenantId, name: input.name, key_prefix: k.prefix, key_hash: k.hash, scopes: input.scopes });
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'api_key.create', objectType: 'api_key', objectId: row.id, after: { name: input.name, scopes: input.scopes } });
      // Khoá đầy đủ chỉ trả về ở đây, một lần duy nhất.
      return { id: row.id, key: k.key, keyPrefix: k.prefix };
    });
  },

  async revokeKey(auth: AuthContext, id: string) {
    return db.transaction().execute(async (trx) => {
      const row = await accessRepository.revokeKey(trx, auth.tenantId, id);
      if (!row) throw Errors.notFound('khoá API đang hiệu lực');
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'api_key.revoke', objectType: 'api_key', objectId: id, before: row });
      return { revoked: true };
    });
  },
};
