// [2026-11-06 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2 (ADR-0027 Phụ lục A, chữ chốt bước 3): test API vai trò của đơn vị + thi hành Cho / Cấm
/**
 * PHASE-028 W2 đợt 2: tạo / sửa / vô hiệu vai trò, thêm / gỡ luật, gán qua core.user.role-assign; quyền hiệu lực = (chính ∪ bổ sung ∪ nền + Cho) − Cấm
 * có hiệu lực ngay trên vé cũ; chống leo thang; confirmPassword cho quyền rủi ro cao; vai trò quản trị cao không bị Cấm; cô lập đơn vị.
 * Dữ liệu là dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { effectivePermissionsWithTenantRoles } from '@bizcity/platform/core/auth';
import { call, setupTenant, type TestCtx } from './helpers.js';

const OWNER_PASSWORD = 'Test@123'; // setupTenant
let ctx: TestCtx;
let other: TestCtx;
let viewerId = '';
let viewerToken = '';

async function login(c: TestCtx, email: string, password: string): Promise<string> {
  const res = await c.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: c.tenantCode, email, password } });
  return res.json().data.token as string;
}
const withToken = (token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}`, 'idempotency-key': `t-${Date.now()}-${Math.random()}` } });
const permsOf = async (token: string): Promise<string[]> => (await withToken(token, 'GET', '/api/v1/auth/me')).json().data.permissions;

const newRole = (body: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/roles', { reason: 'Lập vai trò thử', ...body });
const addRule = (roleId: string, body: Record<string, unknown>) => call(ctx, 'POST', `/api/v1/roles/${roleId}/rules`, { reason: 'Thêm luật thử', ...body });
const assign = (userId: string, body: Record<string, unknown>) => call(ctx, 'POST', `/api/v1/users/${userId}/roles`, { reason: 'Gán vai trò thử', ...body });

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  const created = await call(ctx, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' });
  viewerId = String(created.body.data.id);
  viewerToken = await login(ctx, 'xem@ketoan.local', 'Xem@12345');
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
  await closeDb();
});

describe('effectivePermissionsWithTenantRoles (hàm thuần)', () => {
  it('nền ∪ Cho − Cấm; Cấm thắng quyền của vai trò chính; quyền lạ không vào; vai trò quản trị không bị Cấm', () => {
    const p = effectivePermissionsWithTenantRoles(['viewer'], { baseRoles: ['accountant'], allow: ['periods:lock', 'khong:ton-tai'], deny: ['ledger:*'] });
    expect(p.has('documents:write')).toBe(true);
    expect(p.has('periods:lock')).toBe(true);
    expect(p.has('khong:ton-tai' as never)).toBe(false);
    expect(p.has('ledger:read')).toBe(false);
    expect(p.has('catalog:read')).toBe(true);
    const owner = effectivePermissionsWithTenantRoles(['owner'], { baseRoles: [], allow: [], deny: ['*:*'] });
    expect(owner.has('users:write')).toBe(true);
  });
});

describe('Tạo, sửa, vô hiệu vai trò', () => {
  let roleId = '';
  let version = 1;

  it('tạo vai trò; trùng mã 409; restriction có nền 400; nền owner 400', async () => {
    const ok = await newRole({ code: 'thu_kho', label: 'Thủ kho', kind: 'job', baseRole: 'viewer' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    roleId = ok.body.data.id;
    expect((await newRole({ code: 'thu_kho', label: 'Trùng', kind: 'job' })).status).toBe(409);
    expect((await newRole({ code: 'han_che_a', label: 'Hạn chế', kind: 'restriction', baseRole: 'viewer' })).status).toBe(400);
    expect((await newRole({ code: 'nen_owner', label: 'Nền owner', kind: 'job', baseRole: 'owner' })).status).toBe(400);
    expect((await newRole({ code: 'accountant', label: 'Trùng mã hệ thống', kind: 'job' })).status).toBe(400);
  });

  it('danh sách và chi tiết', async () => {
    const list = await call(ctx, 'GET', '/api/v1/roles');
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: roleId, code: 'thu_kho', baseRole: 'viewer', isActive: true, version: 1, rules: 0, holders: 0 })]));
    const one = await call(ctx, 'GET', `/api/v1/roles/${roleId}`);
    expect(one.body.data).toMatchObject({ id: roleId, code: 'thu_kho', kind: 'job', rules: [] });
  });

  it('sửa tên cần version hiện tại; sai version 409; không có gì để sửa 400', async () => {
    const bad = await call(ctx, 'PATCH', `/api/v1/roles/${roleId}`, { label: 'Thủ kho 2', version: 9, reason: 'Đổi tên' });
    expect(bad.status).toBe(409);
    expect((await call(ctx, 'PATCH', `/api/v1/roles/${roleId}`, { version, reason: 'Không đổi gì' })).status).toBe(400);
    const ok = await call(ctx, 'PATCH', `/api/v1/roles/${roleId}`, { label: 'Thủ kho chi nhánh', version, reason: 'Đổi tên' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    version = ok.body.data.version;
    expect(version).toBe(2);
  });

  it('người không có users:write không đọc / ghi được', async () => {
    expect((await withToken(viewerToken, 'GET', '/api/v1/roles')).statusCode).toBe(403);
    expect((await withToken(viewerToken, 'POST', '/api/v1/roles', { code: 'lach', label: 'Lách', kind: 'job', reason: 'Thử lách' })).statusCode).toBe(403);
  });
});

describe('Luật Cho / Cấm', () => {
  let roleId = '';
  let restrictionId = '';

  beforeAll(async () => {
    roleId = (await newRole({ code: 'ke_toan_kho', label: 'Kế toán kho', kind: 'job', baseRole: 'viewer' })).body.data.id;
    restrictionId = (await newRole({ code: 'cam_xem_so', label: 'Cấm xem sổ', kind: 'restriction' })).body.data.id;
  });

  it('Cho: phải đích danh, có trong sổ quyền; trùng luật 409', async () => {
    expect((await addRule(roleId, { permission: 'catalog:*', effect: 'allow' })).status).toBe(400);
    expect((await addRule(roleId, { permission: 'khong:ton-tai', effect: 'allow' })).status).toBe(400);
    const ok = await addRule(roleId, { permission: 'catalog:write', effect: 'allow', note: 'Cập nhật danh mục kho' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await addRule(roleId, { permission: 'catalog:write', effect: 'allow' })).status).toBe(409);
  });

  it('Cấm: mẫu phải khớp quyền đã biết; restriction chỉ nhận Cấm', async () => {
    expect((await addRule(restrictionId, { permission: 'zzz:*', effect: 'deny' })).status).toBe(400);
    expect((await addRule(restrictionId, { permission: 'catalog:write', effect: 'allow' })).status).toBe(400);
    expect((await addRule(restrictionId, { permission: 'ledger:*', effect: 'deny' })).status).toBe(201);
  });

  it('Cho quyền rủi ro cao đòi confirmPassword đúng của người thao tác', async () => {
    const hi = { permission: 'periods:lock', effect: 'allow' };
    expect((await addRule(roleId, hi)).status).toBe(400);
    expect((await addRule(roleId, { ...hi, confirmPassword: 'sai-mat-khau' })).status).toBe(400);
    const ok = await addRule(roleId, { ...hi, confirmPassword: OWNER_PASSWORD });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    // Gỡ luật rủi ro cao: không cần nhập lại (thu bớt quyền).
    const rm = await call(ctx, 'POST', `/api/v1/roles/${roleId}/rules/${ok.body.data.id}/remove`, { reason: 'Không cần khoá kỳ' });
    expect(rm.status).toBe(200);
    expect((await call(ctx, 'POST', `/api/v1/roles/${roleId}/rules/${ok.body.data.id}/remove`, { reason: 'Gỡ lần hai' })).status).toBe(409);
  });

  it('chi tiết giữ luật đã gỡ (lịch sử) kèm lý do', async () => {
    const one = await call(ctx, 'GET', `/api/v1/roles/${roleId}`);
    const removed = one.body.data.rules.find((r: any) => r.permission === 'periods:lock');
    expect(removed).toMatchObject({ active: false, removeReason: 'Không cần khoá kỳ' });
  });
});

describe('Gán và thi hành quyền hiệu lực', () => {
  let grantRole = '';
  let denyRole = '';
  let assignmentId = '';

  beforeAll(async () => {
    grantRole = (await newRole({ code: 'thu_ngan', label: 'Thu ngân', kind: 'job', baseRole: 'viewer' })).body.data.id;
    await addRule(grantRole, { permission: 'catalog:write', effect: 'allow' });
    denyRole = (await newRole({ code: 'khong_xem_so', label: 'Không xem sổ', kind: 'restriction' })).body.data.id;
    await addRule(denyRole, { permission: 'ledger:*', effect: 'deny' });
  });

  it('gán đúng một trong role / tenantRoleId', async () => {
    expect((await assign(viewerId, {})).status).toBe(400);
    expect((await assign(viewerId, { role: 'developer', tenantRoleId: grantRole })).status).toBe(400);
    expect((await assign(viewerId, { tenantRoleId: '999999999' })).status).toBe(404);
  });

  it('chưa gán: người xem không sửa được danh mục', async () => {
    expect(await permsOf(viewerToken)).not.toContain('catalog:write');
  });

  it('gán vai trò → Cho có ngay trên vé cũ; gán trùng 409', async () => {
    const res = await assign(viewerId, { tenantRoleId: grantRole });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    assignmentId = res.body.data.id;
    expect(await permsOf(viewerToken)).toContain('catalog:write');
    expect((await assign(viewerId, { tenantRoleId: grantRole })).status).toBe(409);
    const list = await call(ctx, 'GET', `/api/v1/users/${viewerId}/roles`);
    expect(list.body.data.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ id: assignmentId, role: null, tenantRoleId: grantRole, active: true })]));
  });

  it('Cấm thắng quyền của vai trò chính; thu hồi lần gán Cấm trả quyền ngay', async () => {
    expect(await permsOf(viewerToken)).toContain('ledger:read');
    const d = await assign(viewerId, { tenantRoleId: denyRole });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    expect(await permsOf(viewerToken)).not.toContain('ledger:read');
    expect(await permsOf(viewerToken)).toContain('catalog:write');
    const rv = await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${d.body.data.id}/revoke`, { reason: 'Bỏ hạn chế' });
    expect(rv.status).toBe(200);
    expect(await permsOf(viewerToken)).toContain('ledger:read');
  });

  it('gỡ luật Cho → quyền mất ngay; thêm lại → có lại', async () => {
    const one = await call(ctx, 'GET', `/api/v1/roles/${grantRole}`);
    const rule = one.body.data.rules.find((r: any) => r.permission === 'catalog:write' && r.active);
    expect((await call(ctx, 'POST', `/api/v1/roles/${grantRole}/rules/${rule.id}/remove`, { reason: 'Thu bớt' })).status).toBe(200);
    expect(await permsOf(viewerToken)).not.toContain('catalog:write');
    expect((await addRule(grantRole, { permission: 'catalog:write', effect: 'allow' })).status).toBe(201);
    expect(await permsOf(viewerToken)).toContain('catalog:write');
  });

  it('vô hiệu vai trò → không cấp; vai trò vô hiệu không gán mới và không nhận luật; bật lại → cấp', async () => {
    const cur = (await call(ctx, 'GET', `/api/v1/roles/${grantRole}`)).body.data.version;
    const off = await call(ctx, 'PATCH', `/api/v1/roles/${grantRole}`, { isActive: false, version: cur, reason: 'Tạm ngưng' });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(await permsOf(viewerToken)).not.toContain('catalog:write');
    expect((await addRule(grantRole, { permission: 'catalog:read', effect: 'allow' })).status).toBe(409);
    const on = await call(ctx, 'PATCH', `/api/v1/roles/${grantRole}`, { isActive: true, version: off.body.data.version, reason: 'Dùng lại' });
    expect(on.status).toBe(200);
    expect(await permsOf(viewerToken)).toContain('catalog:write');
  });

  it('thu hồi lần gán → quyền mất ngay; lịch sử giữ dòng đã thu hồi', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${assignmentId}/revoke`, { reason: 'Chuyển việc' })).status).toBe(200);
    expect(await permsOf(viewerToken)).not.toContain('catalog:write');
    const list = await call(ctx, 'GET', `/api/v1/users/${viewerId}/roles`);
    expect(list.body.data.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ id: assignmentId, active: false, revokeReason: 'Chuyển việc' })]));
  });

  it('gán vai trò có Cho quyền rủi ro cao đòi confirmPassword', async () => {
    const hi = (await newRole({ code: 'khoa_ky', label: 'Khoá kỳ', kind: 'privilege' })).body.data.id;
    expect((await addRule(hi, { permission: 'periods:lock', effect: 'allow', confirmPassword: OWNER_PASSWORD })).status).toBe(201);
    expect((await assign(viewerId, { tenantRoleId: hi })).status).toBe(400);
    expect((await assign(viewerId, { tenantRoleId: hi, confirmPassword: 'sai' })).status).toBe(400);
    const ok = await assign(viewerId, { tenantRoleId: hi, confirmPassword: OWNER_PASSWORD });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(await permsOf(viewerToken)).toContain('periods:lock');
    await call(ctx, 'POST', `/api/v1/users/${viewerId}/roles/${ok.body.data.id}/revoke`, { reason: 'Hết nhiệm vụ' });
  });
});

describe('Chống leo thang, vai trò quản trị, cô lập đơn vị', () => {
  it('người có users:write nhờ vai trò đơn vị không cấp được quyền mình không có', async () => {
    const mgr = await call(ctx, 'POST', '/api/v1/users', { email: 'ql@ketoan.local', fullName: 'Quản lý phân quyền', role: 'viewer', password: 'Xem@12345' });
    const mgrId = String(mgr.body.data.id);
    const delegated = (await newRole({ code: 'quan_ly_nguoi_dung', label: 'Quản lý người dùng', kind: 'privilege', baseRole: 'viewer' })).body.data.id;
    expect((await addRule(delegated, { permission: 'users:write', effect: 'allow', confirmPassword: OWNER_PASSWORD })).status).toBe(201);
    expect((await assign(mgrId, { tenantRoleId: delegated, confirmPassword: OWNER_PASSWORD })).status).toBe(201);
    const mgrToken = await login(ctx, 'ql@ketoan.local', 'Xem@12345');
    expect(await permsOf(mgrToken)).toContain('users:write');
    expect(await permsOf(mgrToken)).not.toContain('periods:lock');

    const target = (await newRole({ code: 'muon_khoa_ky', label: 'Muốn khoá kỳ', kind: 'privilege' })).body.data.id;
    const res = await withToken(mgrToken, 'POST', `/api/v1/roles/${target}/rules`, { permission: 'periods:lock', effect: 'allow', reason: 'Thử leo thang', confirmPassword: 'Xem@12345' });
    expect(res.statusCode).toBe(403);
    // Gán vai trò có quyền vượt quyền của mình cũng bị chặn.
    const hi = (await newRole({ code: 'khoa_ky_2', label: 'Khoá kỳ 2', kind: 'privilege' })).body.data.id;
    await addRule(hi, { permission: 'periods:lock', effect: 'allow', confirmPassword: OWNER_PASSWORD });
    const asg = await withToken(mgrToken, 'POST', `/api/v1/users/${viewerId}/roles`, { tenantRoleId: hi, reason: 'Thử gán vượt quyền', confirmPassword: 'Xem@12345' });
    expect(asg.statusCode).toBe(403);
  });

  it('Cấm không áp cho người giữ vai trò quản trị cao (owner)', async () => {
    const o2 = await call(ctx, 'POST', '/api/v1/users', { email: 'chu2@ketoan.local', fullName: 'Chủ thứ hai', role: 'owner', password: 'Chu@12345' });
    const o2Id = String(o2.body.data.id);
    const r = (await newRole({ code: 'cam_het_chung_tu', label: 'Cấm chứng từ', kind: 'restriction' })).body.data.id;
    await addRule(r, { permission: 'documents:*', effect: 'deny' });
    expect((await assign(o2Id, { tenantRoleId: r })).status).toBe(201);
    const t = await login(ctx, 'chu2@ketoan.local', 'Chu@12345');
    expect(await permsOf(t)).toContain('documents:write');
  });

  it('không tự gán cho chính mình', async () => {
    const me = (await call(ctx, 'GET', '/api/v1/users')).body.data.find((u: any) => u.role === 'owner' && u.email === 'tester@ketoan.local');
    const r = (await newRole({ code: 'tu_gan', label: 'Tự gán', kind: 'restriction' })).body.data.id;
    expect((await assign(String(me.id), { tenantRoleId: r })).status).toBe(403);
  });

  it('đơn vị khác không thấy vai trò và không gán được', async () => {
    const mine = (await call(ctx, 'GET', '/api/v1/roles')).body.data[0];
    expect((await call(other, 'GET', `/api/v1/roles/${mine.id}`)).status).toBe(404);
    expect((await call(other, 'GET', '/api/v1/roles')).body.data).toEqual([]);
    const otherUser = (await call(other, 'POST', '/api/v1/users', { email: 'nv@ketoan.local', fullName: 'Nhân viên', role: 'viewer', password: 'Xem@12345' })).body.data.id;
    expect((await call(other, 'POST', `/api/v1/users/${otherUser}/roles`, { tenantRoleId: mine.id, reason: 'Gán vai trò đơn vị khác' })).status).toBe(404);
  });
});
