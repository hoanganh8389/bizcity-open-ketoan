// [2026-11-10 09:10 PM Võ Hoàng] POS-W1 — vé đăng nhập từ hệ thống quản trị mang được quyền do module khai (đề xuất P-MP-7, đóng góp)
/**
 * POST /api/v1/auth/wp-sso: phiên mang đúng danh sách quyền vé gửi sang — quyền Core và quyền module đang bật (manifest
 * permissions[], vd `pos:sell`); quyền lạ bị bỏ. Máy bán POS chỉ cần `pos:sell`, không cần `documents:write`.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { registerModulePermissions } from '../src/core/auth.js';
import { loginWithWpTicket } from '../src/modules/auth/wp-sso.js';
import { setupTenant, type TestCtx } from './helpers.js';

const SECRET = 'kiem-thu-wp-sso-quyen-module';
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function ticket(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ iat: now, exp: now + 60, ...claims }));
  return `${body}.${b64(createHmac('sha256', SECRET).update(body).digest())}`;
}

let ctx: TestCtx;
let oldSecret = '';

beforeAll(async () => {
  ctx = await setupTenant();
  oldSecret = env.WP_SSO_SECRET;
  (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = SECRET;
  registerModulePermissions('kiem-thu-sso', [{ key: 'kiem-thu-sso:ban', label: 'Quyền module dùng trong test' }]);
});
afterAll(async () => {
  (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = oldSecret;
  await ctx.app.close();
});

describe('đăng nhập bằng vé hệ thống quản trị — quyền module', () => {
  it('vé mang quyền module đang bật → phiên có quyền đó; quyền lạ bị bỏ', async () => {
    const r = await loginWithWpTicket(ticket({
      email: 'thu-ngan-sso@example.test', name: 'Thu ngân thử', tenant: ctx.tenantCode,
      perms: ['kiem-thu-sso:ban', 'documents:read', 'khong-co:quyen-nay'],
    }));
    expect(r.user.permissions).toEqual(['kiem-thu-sso:ban', 'documents:read']);
  });

  it('phiên chỉ có quyền module thì không có quyền Core nào', async () => {
    const r = await loginWithWpTicket(ticket({ email: 'thu-ngan-sso-2@example.test', tenant: ctx.tenantCode, perms: ['kiem-thu-sso:ban'] }));
    expect(r.user.permissions).toEqual(['kiem-thu-sso:ban']);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/documents', headers: { authorization: `Bearer ${r.token}` } });
    expect(me.statusCode).toBe(403);
  });
});
