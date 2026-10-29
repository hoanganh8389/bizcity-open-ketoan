/**
 * Cấu hình mẫu in (HT05): lưu theo đơn vị / chi nhánh / người dùng, mỗi màn một mẫu mặc định trong cùng phạm vi,
 * cấu hình áp cho shop gồm cả chi nhánh cha, phân quyền (người không có quyền cấu hình chỉ đặt được cho chính mình), nhật ký.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
let viewer: { id: string; token: string };

const as = (token: string, method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` } }).then((r) => ({ status: r.statusCode, body: r.json() }));

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  // Chi nhánh cha 10000 và shop 10001 thuộc nó.
  await call(ctx, 'POST', '/api/v1/branches', { code: '10000', name: 'CN cha' });
  await call(ctx, 'POST', '/api/v1/branches', { code: '10001', name: 'Shop 1' });
  const parent = await db.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', '10000').executeTakeFirstOrThrow();
  await db.updateTable('branches').set({ parent_id: parent.id }).where('tenant_id', '=', tenantId).where('code', '=', '10001').execute();
  const u = await call(ctx, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' });
  const login = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem@ketoan.local', password: 'Xem@12345' } });
  viewer = { id: u.body.data.id, token: login.json().data.token };
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Cấu hình mẫu in', () => {
  it('đặt mẫu mặc định cho cả đơn vị; đặt mẫu khác cùng màn làm mặc định thì mẫu cũ thôi mặc định', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'tenant', isDefault: true, overrides: { title: 'PHIẾU XUẤT KHO KIÊM BẢO HÀNH', copies: 2 } })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a4', scope: 'tenant', isDefault: true })).status).toBe(200);
    // Mẫu màn khác không bị ảnh hưởng.
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH11:a5', scope: 'tenant', isDefault: true })).status).toBe(200);
    const list = (await call(ctx, 'GET', '/api/v1/print-templates/settings?scope=tenant')).body.data as { templateCode: string; isDefault: boolean; overrides: Record<string, unknown> }[];
    expect(list.map((x) => [x.templateCode, x.isDefault])).toEqual([['BH10:a4', true], ['BH10:a5', false], ['BH11:a5', true]]);
    // Thôi mặc định nhưng giữ phần chỉnh nội dung.
    expect(list.find((x) => x.templateCode === 'BH10:a5')!.overrides).toEqual({ title: 'PHIẾU XUẤT KHO KIÊM BẢO HÀNH', copies: 2 });
  });

  it('kiểm tra dữ liệu: mã mẫu, phạm vi, chi nhánh không có, mẫu tắt mà đặt mặc định, trường lạ trong phần chỉnh', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10', scope: 'tenant' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'branch' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'branch', scopeRef: 'KHONGCO' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:bill', scope: 'tenant', isEnabled: false, isDefault: true })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'tenant', overrides: { mauLa: 1 } })).status).toBe(400);
  });

  it('shop nhận cấu hình của chính shop, của chi nhánh cha và của cả đơn vị; người dùng nhận thêm cấu hình riêng', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:bill', scope: 'branch', scopeRef: '10000', isDefault: true })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:pxk', scope: 'branch', scopeRef: '10001', isEnabled: false })).status).toBe(200);
    expect((await as(viewer.token, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'user', scopeRef: viewer.id, isDefault: true })).status).toBe(200);

    const eff = (await as(viewer.token, 'GET', '/api/v1/print-templates/effective?branchCode=10001')).body.data;
    expect(eff.branches).toEqual(['10001', '10000']);
    expect(eff.userId).toBe(viewer.id);
    const keys = (eff.settings as { templateCode: string; scope: string; scopeRef: string }[]).map((x) => `${x.templateCode}@${x.scope}:${x.scopeRef}`).sort();
    expect(keys).toEqual(['BH10:a4@tenant:', 'BH10:a5@tenant:', 'BH10:a5@user:' + viewer.id, 'BH10:bill@branch:10000', 'BH10:pxk@branch:10001', 'BH11:a5@tenant:'].sort());
    // Chi nhánh khác không nhận cấu hình của 10000; người khác không nhận cấu hình riêng của người xem.
    const other = (await call(ctx, 'GET', '/api/v1/print-templates/effective?branchCode=CN01')).body.data.settings as { scope: string }[];
    expect(other.every((x) => x.scope === 'tenant')).toBe(true);
  });

  it('người không có quyền cấu hình chỉ đặt được cho chính mình, không thấy cấu hình riêng của người khác', async () => {
    expect((await as(viewer.token, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'tenant' })).status).toBe(403);
    expect((await as(viewer.token, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'branch', scopeRef: '10001' })).status).toBe(403);
    const owner = (await call(ctx, 'GET', '/api/v1/users')).body.data.find((x: { email: string }) => x.email === 'tester@ketoan.local');
    expect((await as(viewer.token, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:a5', scope: 'user', scopeRef: owner.id })).status).toBe(403);
    expect((await call(ctx, 'PUT', '/api/v1/print-templates/settings', { templateCode: 'BH10:bill', scope: 'user', scopeRef: owner.id, isDefault: true })).status).toBe(200);
    const seen = (await as(viewer.token, 'GET', '/api/v1/print-templates/settings?scope=user')).body.data as { scopeRef: string }[];
    expect(seen.map((x) => x.scopeRef)).toEqual([viewer.id]);
    // Người quản trị thấy cả hai.
    expect(((await call(ctx, 'GET', '/api/v1/print-templates/settings?scope=user')).body.data as unknown[]).length).toBe(2);
  });

  it('bỏ cấu hình thì về như mặc định; mỗi lần sửa / bỏ có nhật ký', async () => {
    const del = await call(ctx, 'DELETE', '/api/v1/print-templates/settings?templateCode=BH10:pxk&scope=branch&scopeRef=10001');
    expect(del.body.data).toEqual({ removed: true });
    expect((await call(ctx, 'DELETE', '/api/v1/print-templates/settings?templateCode=BH10:pxk&scope=branch&scopeRef=10001')).body.data).toEqual({ removed: false });
    expect((await call(ctx, 'GET', '/api/v1/print-templates/settings?scope=branch&scopeRef=10001')).body.data).toEqual([]);
    const logs = await db.selectFrom('audit_logs').select(['action']).where('tenant_id', '=', tenantId).where('action', 'like', 'settings.print-template%').execute();
    expect(logs.filter((x) => x.action === 'settings.print-template').length).toBeGreaterThanOrEqual(7);
    expect(logs.filter((x) => x.action === 'settings.print-template.reset').length).toBe(1);
  });
});
