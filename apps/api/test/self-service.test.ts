/**
 * Route tự phục vụ (requireUser / requireAuthenticated — R-API-6) và phiên bản ở /system/health (R-REL-1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

const asUser = () => ({ authorization: `Bearer ${ctx.token}` });
const asKey = () => ({ 'x-api-key': ctx.apiKey });
const ping = { deviceId: 'may-kiem-thu', tabId: 'tab-1', path: '/app', screen: 'Trang chủ' };

describe('Route tự phục vụ khai guard tường minh', () => {
  it('người dùng báo online và xem được số đang online', async () => {
    const p = await ctx.app.inject({ method: 'POST', url: '/api/v1/presence/ping', headers: asUser(), payload: ping });
    expect(p.statusCode).toBe(200);
    const g = await ctx.app.inject({ method: 'GET', url: '/api/v1/presence', headers: asUser() });
    expect(g.statusCode).toBe(200);
    expect(g.json().data.online).toBeGreaterThanOrEqual(1);
  });

  it('khoá API gọi được presence (requireAuthenticated) nhưng không gọi được logout-others (requireUser → 403)', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/presence/ping', headers: asKey(), payload: ping })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/presence', headers: asKey() })).statusCode).toBe(200);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout-others', headers: asKey() });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('không đăng nhập → 401', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/presence' })).statusCode).toBe(401);
  });
});

describe('Phiên bản ở /system/health', () => {
  it('trả version, kernel, standard', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/health' });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status).toBe('up');
    expect(d.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(d.kernel).toBe(d.version);
    expect(d.standard).toMatch(/^\d+\.\d+\.\d+/);
  });
});
