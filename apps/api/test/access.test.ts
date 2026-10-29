/**
 * Kiểm thử người dùng, phân quyền, khoá API.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

async function loginAs(email: string, password: string) {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password } });
  return res.json();
}

describe('Người dùng', () => {
  let viewerId = '';

  it('chủ sở hữu thêm được người dùng; mật khẩu ngắn bị từ chối', async () => {
    const bad = await call(ctx, 'POST', '/api/v1/users', { email: 'x@ketoan.local', fullName: 'X', role: 'viewer', password: '123' });
    expect(bad.status).toBe(400);
    const okRes = await call(ctx, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' });
    expect(okRes.status).toBe(201);
    viewerId = okRes.body.data.id;
  });

  it('người chỉ xem đọc được báo cáo nhưng không gửi được chứng từ, không quản lý người dùng', async () => {
    const login = await loginAs('xem@ketoan.local', 'Xem@12345');
    const headers = { authorization: `Bearer ${login.data.token}` };
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/accounts', headers })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', headers, payload: saleDoc() })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/users', headers })).statusCode).toBe(403);
  });

  it('khoá người dùng thì không đăng nhập được nữa', async () => {
    await call(ctx, 'PATCH', `/api/v1/users/${viewerId}`, { isActive: false });
    expect((await loginAs('xem@ketoan.local', 'Xem@12345')).ok).toBe(false);
  });

  it('không khoá được chủ sở hữu cuối cùng', async () => {
    const users = (await call(ctx, 'GET', '/api/v1/users')).body.data;
    const owner = users.find((u: any) => u.role === 'owner');
    const res = await call(ctx, 'PATCH', `/api/v1/users/${owner.id}`, { isActive: false });
    expect(res.status).toBe(409);
  });

  it('tự đổi mật khẩu cần đúng mật khẩu hiện tại', async () => {
    expect((await call(ctx, 'POST', '/api/v1/auth/change-password', { currentPassword: 'sai', newPassword: 'Moi@12345' })).status).toBe(400);
    const changed = await call(ctx, 'POST', '/api/v1/auth/change-password', { currentPassword: 'Test@123', newPassword: 'Moi@12345' });
    expect(changed.status).toBe(200);
    // Đổi mật khẩu thu hồi mọi vé cũ (kể cả vé của máy đang đổi) và cấp vé mới cho máy này — dùng vé mới cho các bước sau.
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${ctx.token}` } })).statusCode).toBe(401);
    ctx.token = changed.body.data.token;
    expect((await loginAs('tester@ketoan.local', 'Moi@12345')).ok).toBe(true);
  });
});

describe('Khoá API', () => {
  it('tạo khoá → dùng được; thu hồi → hết hiệu lực; danh sách không lộ khoá', async () => {
    const created = await call(ctx, 'POST', '/api/v1/api-keys', { name: 'Kiểm thử', scopes: ['reports:read'] });
    expect(created.status).toBe(201);
    const key = created.body.data.key as string;
    expect(key.startsWith('kt_')).toBe(true);

    const use = () => ctx.app.inject({ method: 'GET', url: '/api/v1/accounts', headers: { 'x-api-key': key } });
    expect((await use()).statusCode).toBe(200);
    // Khoá chỉ có phạm vi đọc báo cáo → không gửi được chứng từ.
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', headers: { 'x-api-key': key }, payload: saleDoc() })).statusCode).toBe(403);

    const list = (await call(ctx, 'GET', '/api/v1/api-keys')).body.data;
    expect(JSON.stringify(list)).not.toContain(key);

    await call(ctx, 'DELETE', `/api/v1/api-keys/${created.body.data.id}`);
    expect((await use()).statusCode).toBe(401);
  });
});
