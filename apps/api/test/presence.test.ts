/**
 * Người dùng đang online (modules/system/presence.ts) — đếm theo THIẾT BỊ: tài khoản dùng chung trên nhiều máy = nhiều online;
 * nhiều tab cùng máy = 1; tab rời → bớt; người thường chỉ thấy số, quản trị thấy danh sách tài khoản → máy (trình duyệt, màn đang
 * mở); khoá API không tính; tách đơn vị; đếm "hôm nay".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agentLabel } from '../src/modules/system/presence.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let viewer = '';
const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
};
const ping = (token: string, body: Record<string, unknown>, ua = UA.win) =>
  t.app.inject({ method: 'POST', url: '/api/v1/presence/ping', payload: body as never, headers: { authorization: `Bearer ${token}`, 'user-agent': ua } }).then((r) => r.json().data);
const read = (token: string) => t.app.inject({ method: 'GET', url: '/api/v1/presence', headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().data);

beforeAll(async () => {
  t = await setupTenant();
  expect((await call(t, 'POST', '/api/v1/users', { email: 'online-xem@ketoan.local', fullName: 'Tài khoản trải nghiệm', role: 'viewer', password: 'Xem@12345' })).status).toBe(201);
  const login = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: t.tenantCode, email: 'online-xem@ketoan.local', password: 'Xem@12345' } });
  viewer = login.json().data.token;
});
afterAll(async () => { await t.app.close(); });

describe('Người dùng đang online — đếm theo thiết bị', () => {
  it('nhận trình duyệt · hệ điều hành từ User-Agent', () => {
    expect(agentLabel(UA.win)).toBe('Chrome · Windows');
    expect(agentLabel(UA.iphone)).toBe('Safari · iPhone');
    expect(agentLabel(UA.edge)).toBe('Edge · Windows');
    expect(agentLabel('')).toBe('Trình duyệt khác');
  });

  it('tài khoản dùng chung trên 3 máy (1 máy mở 2 tab) + quản trị 1 máy = 4 online, 2 tài khoản, 5 tab', async () => {
    await ping(viewer, { deviceId: 'may-1', tabId: 'm1a', path: '/mua-hang/tong-hop', screen: 'Tổng hợp mua hàng · MH11' });
    await ping(viewer, { deviceId: 'may-1', tabId: 'm1b', path: '/mua-hang/bao-cao', screen: 'Báo cáo mua hàng · MH23' });
    await ping(viewer, { deviceId: 'may-2', tabId: 'm2a', path: '/', screen: 'Tổng quan' }, UA.iphone);
    await ping(viewer, { deviceId: 'may-3', tabId: 'm3a', path: '/mua-hang/ton-max', screen: 'Tồn max · MH16' }, UA.edge);
    const v = await ping(t.token, { deviceId: 'may-qt', tabId: 'q1', path: '/', screen: 'Tổng quan' });
    expect(v).toMatchObject({ online: 4, devices: 4, accounts: 2, tabs: 5, today: 4, todayAccounts: 2 });
    expect(v.users).toBeUndefined();
    expect((await read(viewer)).users).toBeUndefined();
    const adm = await read(t.token);
    const shared = adm.users.find((u: { name: string }) => u.name === 'Tài khoản trải nghiệm');
    expect(shared.devices.map((d: { agent: string; tabs: number }) => [d.agent, d.tabs]).sort()).toEqual([['Chrome · Windows', 2], ['Edge · Windows', 1], ['Safari · iPhone', 1]]);
    expect(adm.users[0].name).toBe('Tài khoản trải nghiệm'); // tài khoản nhiều máy lên đầu
  });

  it('đóng 1 tab trên máy có 2 tab: máy vẫn online; đóng tab cuối: máy rời; "hôm nay" vẫn giữ', async () => {
    await ping(viewer, { deviceId: 'may-1', tabId: 'm1a', leave: true });
    expect(await read(t.token)).toMatchObject({ devices: 4, tabs: 4 });
    await ping(viewer, { deviceId: 'may-1', tabId: 'm1b', leave: true });
    await ping(viewer, { deviceId: 'may-2', tabId: 'm2a', leave: true });
    expect(await read(t.token)).toMatchObject({ online: 2, devices: 2, accounts: 2, tabs: 2, today: 4 });
    await ping(viewer, { deviceId: 'may-3', tabId: 'm3a', leave: true });
    await ping(t.token, { deviceId: 'may-qt', tabId: 'q1', leave: true });
    expect(await read(t.token)).toMatchObject({ online: 0, accounts: 0, tabs: 0, today: 4, todayAccounts: 2, users: [] });
  });

  it('trình duyệt cũ không gửi deviceId: mỗi tab tính một thiết bị (không gộp nhầm nhiều máy)', async () => {
    await ping(viewer, { tabId: 'x1' });
    await ping(viewer, { tabId: 'x2' });
    expect((await read(t.token)).devices).toBe(2);
    await ping(viewer, { tabId: 'x1', leave: true });
    await ping(viewer, { tabId: 'x2', leave: true });
  });

  it('khoá API không tính là người online; đơn vị khác không thấy nhau', async () => {
    const k = await t.app.inject({ method: 'POST', url: '/api/v1/presence/ping', payload: { deviceId: 'k', tabId: 'k1' }, headers: { 'x-api-key': t.apiKey } });
    expect(k.statusCode).toBe(200);
    expect(k.json().data.online).toBe(0);
    const other = await setupTenant();
    try {
      await ping(t.token, { deviceId: 'may-qt', tabId: 'q2' });
      expect((await call(other, 'GET', '/api/v1/presence')).body.data.online).toBe(0);
    } finally { await other.app.close(); }
  });
});
