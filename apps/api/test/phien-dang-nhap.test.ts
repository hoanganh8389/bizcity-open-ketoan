/**
 * Phiên đăng nhập thu hồi được (core/security/session-state.ts): đổi mật khẩu → máy khác bị đăng xuất, máy đang đổi nhận vé mới;
 * "Đăng xuất các thiết bị khác"; quản trị đặt lại mật khẩu / khoá / đổi vai trò → mọi máy của người đó bị đăng xuất; sửa tên thì
 * không; vé cấp trước khi có cơ chế (không có sv) vẫn dùng được tới khi bị thu hồi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { env } from '../src/config/env.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let userId = '';
const EMAIL = 'phien@ketoan.local';
let pass = 'Phien@12345';
const login = async (password = pass) => {
  const r = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: t.tenantCode, email: EMAIL, password } });
  return { status: r.statusCode, token: r.json().data?.token as string };
};
const me = (token: string) => t.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } }).then((r) => r.statusCode);
const post = (token: string, url: string, payload?: unknown) => t.app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: `Bearer ${token}` } }).then((r) => ({ status: r.statusCode, body: r.json() }));

beforeAll(async () => {
  t = await setupTenant();
  const r = await call(t, 'POST', '/api/v1/users', { email: EMAIL, fullName: 'Kế toán phiên', role: 'accountant', password: pass });
  expect(r.status).toBe(201);
  userId = r.body.data.id;
});
afterAll(async () => { await t.app.close(); });

describe('Phiên đăng nhập thu hồi được', () => {
  it('đổi mật khẩu: máy B (đăng nhập sẵn) bị đăng xuất; máy A đang đổi nhận vé mới, vé cũ của A cũng hết hiệu lực', async () => {
    const a = await login(); const b = await login();
    expect([await me(a.token), await me(b.token)]).toEqual([200, 200]);
    const r = await post(a.token, '/api/v1/auth/change-password', { currentPassword: pass, newPassword: 'Moi@123456' });
    expect(r.status).toBe(200);
    pass = 'Moi@123456';
    const a2 = r.body.data.token as string;
    expect(await me(b.token)).toBe(401);
    expect(await me(a.token)).toBe(401);
    expect(await me(a2)).toBe(200);
    expect((await login('Phien@12345')).status).toBe(401);
    expect((await login()).status).toBe(200);
  });

  it('sai mật khẩu hiện tại: không đổi, không đá ai ra', async () => {
    const a = await login(); const b = await login();
    expect((await post(a.token, '/api/v1/auth/change-password', { currentPassword: 'sai-mat-khau', newPassword: 'Khac@123456' })).status).toBe(400);
    expect([await me(a.token), await me(b.token)]).toEqual([200, 200]);
  });

  it('"Đăng xuất các thiết bị khác": máy khác thoát, máy bấm vẫn đăng nhập (vé mới), mật khẩu không đổi', async () => {
    const a = await login(); const b = await login(); const c = await login();
    const r = await post(a.token, '/api/v1/auth/logout-others');
    expect(r.status).toBe(200);
    expect([await me(b.token), await me(c.token), await me(a.token)]).toEqual([401, 401, 401]);
    expect(await me(r.body.data.token)).toBe(200);
    expect((await login()).status).toBe(200);
  });

  it('quản trị: sửa tên không đá ra; đặt lại mật khẩu, đổi vai trò, khoá → mọi máy của người đó bị đăng xuất', async () => {
    let a = await login();
    expect((await call(t, 'PATCH', `/api/v1/users/${userId}`, { fullName: 'Kế toán phiên (đổi tên)' })).body.data.sessionsRevoked).toBe(false);
    expect(await me(a.token)).toBe(200);

    expect((await call(t, 'PATCH', `/api/v1/users/${userId}`, { password: 'DatLai@12345' })).body.data.sessionsRevoked).toBe(true);
    expect(await me(a.token)).toBe(401);
    pass = 'DatLai@12345';

    a = await login();
    expect((await call(t, 'PATCH', `/api/v1/users/${userId}`, { role: 'viewer' })).body.data.sessionsRevoked).toBe(true);
    expect(await me(a.token)).toBe(401);

    a = await login();
    expect((await call(t, 'PATCH', `/api/v1/users/${userId}`, { isActive: false })).status).toBe(200);
    expect(await me(a.token)).toBe(401);
    expect((await login()).status).toBe(401);
  });

  it('vé cấp trước khi có cơ chế (không ghi sv) vẫn dùng được khi tài khoản chưa bị thu hồi lần nào; khoá API không ảnh hưởng', async () => {
    const r = await call(t, 'POST', '/api/v1/users', { email: 've-cu@ketoan.local', fullName: 'Vé cũ', role: 'viewer', password: 'VeCu@12345' });
    const old = await new SignJWT({ tid: (await call(t, 'GET', '/api/v1/auth/me')).body.data.tenant.id, role: 'viewer', name: 'Vé cũ' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(r.body.data.id).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.JWT_SECRET));
    expect(await me(old)).toBe(200);
    await call(t, 'PATCH', `/api/v1/users/${r.body.data.id}`, { password: 'VeCu@99999' });
    expect(await me(old)).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/accounts', headers: { 'x-api-key': t.apiKey } })).statusCode).toBe(200);
  });
});
