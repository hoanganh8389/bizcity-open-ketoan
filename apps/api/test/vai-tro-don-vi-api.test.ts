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
// [2026-11-09 02:10 PM kiennt] PHASE-028 — S028-12..15 (80 F1–F4, F9): test vá an toàn — leo thang ở người dùng / khoá API, ký theo quyền, route tường minh, giới hạn đăng nhập sai
import { signProblem } from '@bizcity/platform/documents/signature.routes';
import { resetLoginThrottle, LOGIN_LIMITS } from '../src/modules/auth/auth.routes.js';
// [2026-11-09 02:45 PM kiennt] PHASE-028 — S028-16 (giai đoạn 2): test đệm quyền theo authz_version, so song song có số đếm theo đơn vị (vé SSO tách ra S028-17, chờ dòng POS nhả wp-sso.ts)
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { metrics } from '@bizcity/platform/core/metrics';
import { resetShadowStats, shadowCompare, shadowStats } from '@bizcity/platform/core/authz/shadow';

const OWNER_PASSWORD = 'Test@123'; // setupTenant
let ctx: TestCtx;
let other: TestCtx;
let viewerId = '';
let viewerToken = '';

async function login(c: TestCtx, email: string, password: string): Promise<string> {
  const res = await c.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: c.tenantCode, email, password } });
  return res.json().data.token as string;
}
const withToken = (token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
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

describe('Ma trận quyền × vai trò và "Xem như"', () => {
  let grantRole = '';
  let denyRole = '';
  let targetId = '';

  beforeAll(async () => {
    grantRole = (await newRole({ code: 'ma_tran_cho', label: 'Ma trận Cho', kind: 'job', baseRole: 'viewer' })).body.data.id;
    await addRule(grantRole, { permission: 'catalog:write', effect: 'allow' });
    denyRole = (await newRole({ code: 'ma_tran_cam', label: 'Ma trận Cấm', kind: 'restriction' })).body.data.id;
    await addRule(denyRole, { permission: 'ledger:*', effect: 'deny' });
    targetId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'mt@ketoan.local', fullName: 'Người xem ma trận', role: 'viewer', password: 'Xem@12345' })).body.data.id);
  });

  it('ma trận: sổ quyền, vai trò hệ thống + vai trò đơn vị, ô Có / Cấm', async () => {
    const res = await call(ctx, 'GET', '/api/v1/roles/matrix');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const m = res.body.data;
    expect(m.permissions.map((p: any) => p.key)).toEqual(expect.arrayContaining(['catalog:write', 'users:write', 'periods:lock']));
    expect(m.roles.filter((r: any) => r.system).map((r: any) => r.code).sort()).toEqual(['accountant', 'auditor', 'chief_accountant', 'developer', 'owner', 'viewer']);
    expect(m.cells['system:owner'].allow).toContain('users:write');
    expect(m.cells['system:viewer'].allow).toContain('catalog:read');
    expect(m.cells['system:viewer'].allow).not.toContain('documents:write');
    expect(m.cells['tenant:' + grantRole].allow).toEqual(expect.arrayContaining(['catalog:read', 'catalog:write']));
    expect(m.cells['tenant:' + denyRole].deny).toEqual(expect.arrayContaining(['ledger:read']));
    expect(m.cells['tenant:' + denyRole].allow).toEqual([]);
  });

  it('ma trận chỉ cho người có users:write', async () => {
    expect((await withToken(viewerToken, 'GET', '/api/v1/roles/matrix')).statusCode).toBe(403);
  });

  it('Xem như: quyền hiệu lực khớp /auth/me của chính người đó và nêu nguồn', async () => {
    expect((await assign(targetId, { tenantRoleId: grantRole })).status).toBe(201);
    expect((await assign(targetId, { tenantRoleId: denyRole })).status).toBe(201);
    const res = await call(ctx, 'GET', '/api/v1/users/' + targetId + '/effective-permissions');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const e = res.body.data;
    expect(e).toMatchObject({ primaryRole: 'viewer', baseRoles: ['viewer'], allow: ['catalog:write'], deny: ['ledger:*'] });
    expect(e.permissions).toContain('catalog:write');
    expect(e.permissions).not.toContain('ledger:read');
    const token = await login(ctx, 'mt@ketoan.local', 'Xem@12345');
    expect([...(await permsOf(token))].sort()).toEqual(e.permissions);
  });

  it('Xem như: người không tồn tại 404; người không có users:write 403', async () => {
    expect((await call(ctx, 'GET', '/api/v1/users/999999999/effective-permissions')).status).toBe(404);
    expect((await withToken(viewerToken, 'GET', '/api/v1/users/' + targetId + '/effective-permissions')).statusCode).toBe(403);
  });
});

describe('Vá an toàn sau W5 (80 F1–F4, F9)', () => {
  let hrId = '';
  let hrToken = '';
  const ownerId = async () => String((await call(ctx, 'GET', '/api/v1/users')).body.data.find((u: any) => u.email === 'tester@ketoan.local').id);

  beforeAll(async () => {
    // Quản lý nhân sự: nền viewer + Cho users:write (vai trò của đơn vị) — có users:write nhưng không có quyền kế toán.
    const hr = await call(ctx, 'POST', '/api/v1/users', { email: 'nhansu@ketoan.local', fullName: 'Quản lý nhân sự', role: 'viewer', password: 'Ns@123456' });
    hrId = String(hr.body.data.id);
    const r = (await newRole({ code: 'nhan_su', label: 'Nhân sự', kind: 'privilege', baseRole: 'viewer' })).body.data.id;
    expect((await addRule(r, { permission: 'users:write', effect: 'allow', confirmPassword: OWNER_PASSWORD })).status).toBe(201);
    expect((await assign(hrId, { tenantRoleId: r, confirmPassword: OWNER_PASSWORD })).status).toBe(201);
    hrToken = await login(ctx, 'nhansu@ketoan.local', 'Ns@123456');
    expect(await permsOf(hrToken)).toContain('users:write');
  });

  it('F1: có users:write nhưng không tạo được owner / kế toán trưởng; tạo được người xem', async () => {
    expect((await withToken(hrToken, 'POST', '/api/v1/users', { email: 'chu-gia@ketoan.local', fullName: 'Chủ giả', role: 'owner', password: 'Gia@12345' })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'POST', '/api/v1/users', { email: 'ktt-gia@ketoan.local', fullName: 'KTT giả', role: 'chief_accountant', password: 'Gia@12345' })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'POST', '/api/v1/users', { email: 'xem2@ketoan.local', fullName: 'Người xem 2', role: 'viewer', password: 'Xem@12345' })).statusCode).toBe(201);
  });

  it('F1: không tự nâng mình, không tự khoá / đặt lại mật khẩu; vẫn tự đổi tên được', async () => {
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${hrId}`, { role: 'owner' })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${hrId}`, { isActive: false })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${hrId}`, { password: 'Moi@123456' })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${hrId}`, { fullName: 'Quản lý nhân sự (đổi tên)' })).statusCode).toBe(200);
  });

  it('F1: không sửa / khoá / đặt lại mật khẩu người có quyền vượt mình (owner); sửa được người xem', async () => {
    const owner = await ownerId();
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${owner}`, { password: 'Chiem@12345' })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${owner}`, { isActive: false })).statusCode).toBe(403);
    // Người xem nhưng đang giữ vai trò bổ sung mạnh hơn mình cũng không sửa được (tính theo quyền hiệu lực, không chỉ vai trò chính).
    const strong = await call(ctx, 'POST', '/api/v1/users', { email: 'xem-manh@ketoan.local', fullName: 'Xem mạnh', role: 'viewer', password: 'Xem@12345' });
    const strongId = String(strong.body.data.id);
    expect((await assign(strongId, { role: 'accountant' })).status).toBe(201);
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${strongId}`, { password: 'Chiem@12345' })).statusCode).toBe(403);
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${viewerId}`, { fullName: 'Người xem (sửa)' })).statusCode).toBe(200);
    // Nâng người xem lên kế toán (vượt quyền của mình) bị chặn.
    expect((await withToken(hrToken, 'PATCH', `/api/v1/users/${viewerId}`, { role: 'accountant' })).statusCode).toBe(403);
  });

  it('F1: owner vẫn quản trị được người khác như cũ; vẫn còn luật "ít nhất một owner"', async () => {
    expect((await call(ctx, 'PATCH', `/api/v1/users/${viewerId}`, { role: 'accountant' })).status).toBe(200);
    expect((await call(ctx, 'PATCH', `/api/v1/users/${viewerId}`, { role: 'viewer' })).status).toBe(200);
  });

  it('F2: khoá API không mang quyền người tạo không có', async () => {
    const res = await withToken(hrToken, 'POST', '/api/v1/api-keys', { name: 'Khoá lách', scopes: ['documents:write'] });
    expect(res.statusCode).toBe(403);
    expect((await withToken(hrToken, 'POST', '/api/v1/api-keys', { name: 'Khoá báo cáo', scopes: ['reports:read'] })).statusCode).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/api-keys', { name: 'Khoá ghi của chủ', scopes: ['documents:write'] })).status).toBe(201);
  });

  it('F3 / F9: ký phiếu cần quyền ghi; cấu trúc CSDL không mở cho khoá API', async () => {
    // Đổi vai trò ở ca trước đã thu hồi vé cũ của người xem — đăng nhập lại.
    viewerToken = await login(ctx, 'xem@ketoan.local', 'Xem@12345');
    expect((await withToken(viewerToken, 'POST', '/api/v1/signatures', { ids: ['1'], role: 'preparer' })).statusCode).toBe(403);
    const key = (await call(ctx, 'POST', '/api/v1/api-keys', { name: 'Khoá đọc', scopes: ['reports:read'] })).body.data.key as string;
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/system/schema', headers: { 'x-api-key': key } })).statusCode).toBe(403);
    expect((await call(ctx, 'GET', '/api/v1/system/schema')).status).toBe(200);
    // /auth/me khai requireAuthenticated (tường minh), hành vi giữ nguyên: khoá API vẫn bị service từ chối như trước.
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { 'x-api-key': key } })).statusCode).toBe(403);
    expect((await call(ctx, 'GET', '/api/v1/auth/me')).status).toBe(200);
  });

  it('F4: ô kế toán trưởng / giám đốc ký theo quyền, không theo tên vai trò', () => {
    const who = (role: string, perms: string[]) => ({ kind: 'user', role, actor: 'user:1', permissions: new Set(perms) }) as never;
    const doc = { created_by: 'user:2' };
    // Vai trò của đơn vị được Cho periods:lock ký được ô kế toán trưởng; kế toán trưởng bị Cấm periods:lock thì không.
    expect(signProblem(who('accountant', ['periods:lock']), 'chief_accountant', doc)).toBeNull();
    expect(signProblem(who('chief_accountant', ['documents:write']), 'chief_accountant', doc)).not.toBeNull();
    expect(signProblem(who('owner', ['payments:approve-final']), 'director', doc)).toBeNull();
    expect(signProblem(who('owner', ['documents:write']), 'director', doc)).not.toBeNull();
  });

  it('F9: đăng nhập sai quá số lần thì bị chặn, kể cả khi lần sau nhập đúng', async () => {
    resetLoginThrottle();
    const body = (password: string) => ({ tenantCode: ctx.tenantCode, email: 'xem2@ketoan.local', password });
    for (let i = 0; i < LOGIN_LIMITS.perAccount; i++) {
      expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body('sai-mat-khau') })).statusCode).not.toBe(429);
    }
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body('Xem@12345') })).statusCode).toBe(429);
    resetLoginThrottle();
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body('Xem@12345') })).statusCode).toBe(200);
  });
});

describe('Giai đoạn 2: đệm theo authz_version, so song song (S028-16)', () => {
  const tenantIdOf = async (c: TestCtx) => String((await sql<{ id: string }>`SELECT id FROM tenants WHERE code = ${c.tenantCode}`.execute(db)).rows[0]!.id);

  it('đổi luật ở "bản API khác" (ghi thẳng CSDL, không xoá đệm) có hiệu lực ngay yêu cầu kế tiếp', async () => {
    const u = await call(ctx, 'POST', '/api/v1/users', { email: 'dem@ketoan.local', fullName: 'Đệm', role: 'viewer', password: 'Dem@12345' });
    const uid = String(u.body.data.id);
    const r = (await newRole({ code: 'dem_kho', label: 'Đệm khoá kỳ', kind: 'privilege' })).body.data.id;
    await addRule(r, { permission: 'periods:lock', effect: 'allow', confirmPassword: OWNER_PASSWORD });
    expect((await assign(uid, { tenantRoleId: r, confirmPassword: OWNER_PASSWORD })).status).toBe(201);
    const t = await login(ctx, 'dem@ketoan.local', 'Dem@12345');
    expect(await permsOf(t)).toContain('periods:lock'); // đệm đã nóng
    // Bản API khác thêm luật Cấm: chỉ có CSDL đổi (trigger tăng authz_version), đệm của tiến trình này không bị xoá.
    const tid = await tenantIdOf(ctx);
    await sql`INSERT INTO tenant_role_rules (tenant_id, tenant_role_id, permission, effect, created_by) VALUES (${tid}, ${r}, 'periods:lock', 'deny', 'test')`.execute(db);
    expect(await permsOf(t)).not.toContain('periods:lock');
  });

  it('khoá tài khoản ở "bản API khác" chặn vé ngay yêu cầu kế tiếp (trước: tới 15 giây)', async () => {
    const u = await call(ctx, 'POST', '/api/v1/users', { email: 'khoa@ketoan.local', fullName: 'Khoá', role: 'viewer', password: 'Khoa@12345' });
    const t = await login(ctx, 'khoa@ketoan.local', 'Khoa@12345');
    expect((await withToken(t, 'GET', '/api/v1/auth/me')).statusCode).toBe(200);
    await sql`UPDATE users SET is_active = false WHERE id = ${String(u.body.data.id)}`.execute(db);
    expect((await withToken(t, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('so song song: số đếm và lệch tách theo đơn vị, có số đo Prometheus; API xem cần users:write', async () => {
    resetShadowStats();
    const tid = await tenantIdOf(ctx);
    // Người xem: đường cũ giả sử cho periods:lock, bộ tính từ chối → only_legacy.
    const res = await shadowCompare({ tenantId: tid, userId: viewerId, permission: 'periods:lock', legacyAllowed: true, isAdmin: false });
    expect(res).toBe('only_legacy');
    expect(shadowStats(tid).counters.only_legacy).toBe(1);
    expect(shadowStats(await tenantIdOf(other)).counters.only_legacy).toBe(0);
    expect(metrics.authzShadow.render().some((l) => l.includes('result="only_legacy"'))).toBe(true);
    const view = await call(ctx, 'GET', '/api/v1/system/authz-shadow');
    expect(view.status).toBe(200);
    expect(view.body.data.counters.only_legacy).toBe(1);
    expect(view.body.data.recent).toHaveLength(1);
    expect((await call(other, 'GET', '/api/v1/system/authz-shadow')).body.data.recent).toEqual([]);
    viewerToken = await login(ctx, 'xem@ketoan.local', 'Xem@12345');
    expect((await withToken(viewerToken, 'GET', '/api/v1/system/authz-shadow')).statusCode).toBe(403);
  });
});
