// @bizcity-layer A adapters/wordpress
/**
 * Đăng nhập bằng tài khoản hệ thống quản trị (WordPress multisite là gốc tài khoản và phân quyền).
 *
 * Hệ thống quản trị tạo VÉ ngắn hạn: base64url(JSON) + "." + base64url(HMAC-SHA256(JSON, WP_SSO_SECRET)).
 * JSON = { email, name, login, perms: string[], tenant?, iat, exp } (giây). Vé sống tối đa 5 phút.
 * Ở đây kiểm chữ ký + hạn → tìm người dùng theo email trong đơn vị (chưa có thì tạo, vai trò viewer, mật khẩu ngẫu
 * nhiên không dùng được) → cấp phiên mang ĐÚNG danh sách quyền hệ thống quản trị gửi sang (perms trong phiên),
 * không theo vai trò. Người dùng bị khoá ở đây (is_active = false) thì vẫn chặn.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../../db/client.js';
import { env } from '../../config/env.js';
import { Errors } from '../../core/errors.js';
import { PERMISSIONS, type Permission } from '../../core/auth.js';
import { hashPassword } from '../../core/security/password.js';
import { signSession } from '../../core/security/tokens.js';
import { authRepository } from './auth.repository.js';
import type { SessionUser } from './auth.schemas.js';

interface Ticket {
  email: string;
  name?: string;
  login?: string;
  perms?: string[];
  tenant?: string;
  iat: number;
  exp: number;
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyTicket(raw: string): Ticket {
  const bad = Errors.unauthorized('Vé đăng nhập không hợp lệ hoặc đã hết hạn — mở lại từ trang quản trị');
  if (!env.WP_SSO_SECRET) throw Errors.unauthorized('Chưa cấu hình đăng nhập qua trang quản trị (WP_SSO_SECRET)');
  const [body, sig] = String(raw).split('.');
  if (!body || !sig) throw bad;
  const expect = createHmac('sha256', env.WP_SSO_SECRET).update(body).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) throw bad;
  let t: Ticket;
  try {
    t = JSON.parse(b64urlDecode(body).toString('utf8')) as Ticket;
  } catch {
    throw bad;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!t || typeof t.email !== 'string' || !t.email.includes('@') || !(t.exp > now) || t.exp - t.iat > 300 || t.iat > now + 60) throw bad;
  return t;
}

async function findTenant(code: string | undefined) {
  const want = (code || env.WP_SSO_TENANT || '').trim();
  const q = db.selectFrom('tenants').select(['id', 'code', 'name', 'is_active']);
  if (want) return q.where('code', '=', want).executeTakeFirst();
  const all = await q.where('is_active', '=', true).limit(2).execute();
  return all.length === 1 ? all[0] : undefined;
}

export async function loginWithWpTicket(raw: string): Promise<{ token: string; user: SessionUser }> {
  const t = verifyTicket(raw);
  const tenant = await findTenant(t.tenant);
  if (!tenant || !tenant.is_active) throw Errors.unauthorized('Không xác định được đơn vị kế toán (WP_SSO_TENANT)');
  const email = t.email.trim().toLowerCase();
  const fullName = (t.name || t.login || email).trim().slice(0, 255);

  let user = await db.selectFrom('users').select(['id', 'full_name', 'role', 'is_active', 'session_version']).where('tenant_id', '=', tenant.id).where('email', '=', email).executeTakeFirst();
  if (!user) {
    user = await db
      .insertInto('users')
      .values({ tenant_id: tenant.id, email, full_name: fullName, role: 'viewer', password_hash: await hashPassword(randomBytes(24).toString('base64url')), is_active: true })
      .returning(['id', 'full_name', 'role', 'is_active', 'session_version'])
      .executeTakeFirstOrThrow();
  } else if (!user.is_active) {
    throw Errors.unauthorized('Tài khoản đã bị khoá ở phần mềm kế toán');
  } else if (fullName && user.full_name !== fullName) {
    await db.updateTable('users').set({ full_name: fullName }).where('id', '=', user.id).execute();
  }

  const perms = (t.perms ?? []).filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
  await authRepository.touchLogin(db, user.id);
  const token = await signSession({ sub: user.id, tid: tenant.id, role: user.role, name: fullName, perms, sv: Number(user.session_version) });
  return {
    token,
    user: { id: user.id, email, fullName, role: user.role, tenant: { id: tenant.id, code: tenant.code, name: tenant.name }, permissions: perms },
  };
}
