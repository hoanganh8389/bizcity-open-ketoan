/**
 * Phiên đăng nhập giao diện: JWT ký HS256 bằng JWT_SECRET.
 */
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionClaims {
  sub: string; // user id
  tid: string; // tenant id
  role: string;
  name: string;
  /** Quyền do hệ thống quản trị cấp (đăng nhập qua vé) — có thì dùng thay cho quyền theo vai trò. */
  perms?: string[];
  /** Số phiên bản phiên của người dùng lúc cấp vé (users.session_version); vé cũ không có = 1. */
  sv?: number;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ tid: claims.tid, role: claims.role, name: claims.name, sv: claims.sv ?? 1, ...(claims.perms ? { perms: claims.perms } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_TTL_HOURS}h`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.tid !== 'string') return null;
    return {
      sub: payload.sub,
      tid: payload.tid,
      role: String(payload.role),
      name: String(payload.name ?? ''),
      ...(Array.isArray(payload.perms) ? { perms: payload.perms.map(String) } : {}),
      sv: typeof payload.sv === 'number' ? payload.sv : 1,
    };
  } catch {
    return null;
  }
}
