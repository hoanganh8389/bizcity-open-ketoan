// [2026-11-13 09:30 PM kiennt] NT-HT-003 — màn Danh mục / Hệ thống — gác lệnh của lõi chỉ thu hẹp bằng Cấm, không ai mất quyền (đóng góp)
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const tokens: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => call(ctx, method, url, payload, { authorization: `Bearer ${tokens[who]}` });
const dvt = (n: string) => ({ name: `Hộp thử ${n}` });

async function user(key: string, role: string) {
  const email = `${key}@pqdm.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqdm@12345' }));
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqdm@12345' } })).json().data.token;
  return String(u.id);
}
async function role(code: string, kind: 'job' | 'restriction', rules: [string, 'allow' | 'deny'][], baseRole?: string) {
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Vai trò thử danh mục' }));
  for (const [permission, effect] of rules) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect, reason: 'Luật thử danh mục' }));
  return r.id;
}

beforeAll(async () => {
  ctx = await setupTenant();
  await user('ketoan', 'accountant');
  await user('xem', 'viewer');
  const dm = await user('chidanhmuc', 'viewer');
  const kx = await user('khongxoa', 'accountant');
  // Vai trò chỉ có catalog:write (KHÔNG documents:write) — quyền chi tiết không được kéo theo, nhưng không được mất quyền
  ok(await call(ctx, 'POST', `/api/v1/users/${dm}/roles`, { tenantRoleId: await role('chi_danh_muc', 'job', [['catalog:write', 'allow']], 'viewer'), reason: 'Gán thử' }));
  ok(await call(ctx, 'POST', `/api/v1/users/${kx}/roles`, { tenantRoleId: await role('khong_xoa_dvt', 'restriction', [['he-thong:don-vi-tinh-xoa', 'deny']]), reason: 'Gán thử' }));
});

describe('Danh mục — gác lệnh của lõi, chỉ thu hẹp bằng Cấm', () => {
  it('GET /man-hinh có các màn Danh mục / Hệ thống', async () => {
    const ds = ok(await call<{ data: { key: string }[] }>(ctx, 'GET', '/api/v1/man-hinh'));
    expect(ds.map((m) => m.key)).toEqual(expect.arrayContaining(['he-thong.mat-hang', 'he-thong.don-vi-tinh', 'he-thong.doi-tuong', 'he-thong.nguoi-dung']));
  });

  it('Kế toán: thêm, sửa, xoá đơn vị tính như cũ', async () => {
    const u = ok(await as('ketoan', 'POST', '/api/v1/unit-names', dvt('KT'))) as { id: string };
    ok(await as('ketoan', 'PATCH', `/api/v1/unit-names/${u.id}`, { name: 'Hộp thử KT 2' }));
    ok(await as('ketoan', 'DELETE', `/api/v1/unit-names/${u.id}`));
  });

  it('Vai trò chỉ catalog:write (không documents:write) vẫn làm được — không mất quyền', async () => {
    const u = ok(await as('chidanhmuc', 'POST', '/api/v1/unit-names', dvt('DM'))) as { id: string };
    ok(await as('chidanhmuc', 'DELETE', `/api/v1/unit-names/${u.id}`));
  });

  it('Cấm "xoá đơn vị tính": thêm được, xoá bị 403 kèm tên màn', async () => {
    const u = ok(await as('khongxoa', 'POST', '/api/v1/unit-names', dvt('KX'))) as { id: string };
    const r = await as('khongxoa', 'DELETE', `/api/v1/unit-names/${u.id}`);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('Đơn vị tính');
  });

  it('Người xem không ghi được danh mục (quyền gốc của lệnh vẫn chặn)', async () => {
    expect((await as('xem', 'POST', '/api/v1/unit-names', dvt('X'))).status).toBe(403);
  });

  it('Khoá API (catalog:write) không bị móc áp', async () => {
    const r = await call(ctx, 'POST', '/api/v1/unit-names', dvt('API'), { 'x-api-key': ctx.apiKey, authorization: '' });
    expect(r.status).not.toBe(403);
  });
});
