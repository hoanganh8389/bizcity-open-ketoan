// [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: phân quyền theo màn × thao tác do phân hệ đăng ký (Kho: KHO01, KHO02) (đóng góp)
/**
 * Phân hệ Kho tự đăng ký màn + thao tác (apps/api/src/phan-he/man-hinh.ts). Kiểm:
 * - GET /api/v1/man-hinh trả màn, thao tác, quyền gác;
 * - không ai mất quyền: Kế toán (documents:write) vẫn làm mọi thao tác; Người xem (documents:read) chỉ xem;
 * - vai trò của đơn vị chỉ Cho quyền chi tiết → chỉ làm đúng thao tác đó; Cấm quyền chi tiết → thao tác đó bị chặn.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => call(ctx, method, url, payload, { authorization: `Bearer ${tokens[who]}` });
const draft = { countDate: '2026-11-30', branchCode: 'CN01', purpose: 'Thử phân quyền' };

async function addUser(key: string, role: string) {
  const email = `${key}@pqmh.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqmh@12345' }));
  ids[key] = String(u.id);
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqmh@12345' } })).json().data.token;
}
async function role(code: string, kind: 'job' | 'restriction', rules: { permission: string; effect: 'allow' | 'deny' }[], baseRole?: string) {
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Vai trò thử phân quyền màn' }));
  for (const x of rules) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { ...x, reason: 'Luật thử phân quyền màn' }));
  return r.id;
}

beforeAll(async () => {
  ctx = await setupTenant();
  ok(await call(ctx, 'POST', '/api/v1/warehouses', { code: 'KA-1', branchCode: 'CN01', name: 'Kho hàng', isDefault: true }));
  await addUser('ketoan', 'accountant');
  await addUser('xem', 'viewer');
  await addUser('lapkk', 'viewer');
  await addUser('kthan', 'accountant');
  // Người xem + vai trò "Lập biên bản kiểm kê": chỉ Cho thêm / sửa nháp, không Cho ghi nhận
  const lap = await role('lap_kiem_ke', 'job', [{ permission: 'kho:kiem-ke-lap', effect: 'allow' }, { permission: 'kho:kiem-ke-sua', effect: 'allow' }], 'viewer');
  ok(await call(ctx, 'POST', `/api/v1/users/${ids.lapkk}/roles`, { tenantRoleId: lap, reason: 'Gán thử' }));
  // Kế toán + vai trò hạn chế: Cấm quyết định xử lý kiểm kê, Cấm huỷ phiếu chuyển kho
  const han = await role('han_che_kho', 'restriction', [{ permission: 'kho:kiem-ke-quyet-dinh', effect: 'deny' }, { permission: 'kho:chuyen-kho-huy', effect: 'deny' }]);
  ok(await call(ctx, 'POST', `/api/v1/users/${ids.kthan}/roles`, { tenantRoleId: han, reason: 'Gán thử' }));
});

describe('Sổ đăng ký màn hình', () => {
  it('GET /api/v1/man-hinh trả màn Kho đã đăng ký kèm quyền gác từng thao tác', async () => {
    const ds = ok(await call<{ data: { key: string; ma: string; thaoTac: Record<string, { quyen: string }> }[] }>(ctx, 'GET', '/api/v1/man-hinh'));
    const ck = ds.find((m) => m.key === 'kho.chuyen-kho')!;
    expect(ck.ma).toBe('KHO01');
    expect(ck.thaoTac.sua!.quyen).toBe('kho:chuyen-kho-sua');
    expect(ck.thaoTac.nhan!.quyen).toBe('kho:chuyen-kho-nhan');
    expect(ds.find((m) => m.key === 'kho.kiem-ke')!.thaoTac.quyetDinh!.quyen).toBe('kho:kiem-ke-quyet-dinh');
  });

  it('quyền hiệu lực ở /auth/me: Kế toán có đủ quyền chi tiết (kéo theo), Người xem chỉ quyền xem', async () => {
    const kt = (ok(await as('ketoan', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(kt).toEqual(expect.arrayContaining(['kho:chuyen-kho-sua', 'kho:chuyen-kho-nhan', 'kho:kiem-ke-ghi-nhan', 'kho:kiem-ke-quyet-dinh']));
    const xem = (ok(await as('xem', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(xem).toEqual(expect.arrayContaining(['kho:chuyen-kho-xem', 'kho:kiem-ke-xem']));
    expect(xem).not.toContain('kho:kiem-ke-lap');
    expect(xem).not.toContain('kho:chuyen-kho-sua');
  });
});

describe('Máy chủ gác từng thao tác', () => {
  it('Người xem: xem được, thêm biên bản bị chặn', async () => {
    ok(await as('xem', 'GET', '/api/v1/kho/kiem-ke'));
    expect((await as('xem', 'POST', '/api/v1/kho/kiem-ke', draft)).status).toBe(403);
  });

  it('Vai trò chỉ Cho "lập / sửa nháp": thêm, sửa được; ghi nhận chênh lệch bị chặn', async () => {
    const d = ok(await as('lapkk', 'POST', '/api/v1/kho/kiem-ke', draft)) as { id: string };
    ok(await as('lapkk', 'PUT', `/api/v1/kho/kiem-ke/${d.id}`, { ...draft, purpose: 'Sửa nháp' }));
    expect((await as('lapkk', 'POST', `/api/v1/kho/kiem-ke/${d.id}/ghi-nhan`, {})).status).toBe(403);
  });

  it('Kế toán (không hạn chế) vẫn làm mọi thao tác như trước — không bị 403', async () => {
    const d = ok(await as('ketoan', 'POST', '/api/v1/kho/kiem-ke', draft)) as { id: string };
    const r = await as('ketoan', 'POST', `/api/v1/kho/kiem-ke/${d.id}/ghi-nhan`, {});
    expect(r.status).not.toBe(403);
  });

  it('Cấm quyền chi tiết: Kế toán có vai trò hạn chế bị chặn đúng thao tác bị Cấm', async () => {
    const d = ok(await as('kthan', 'POST', '/api/v1/kho/kiem-ke', draft)) as { id: string };
    expect((await as('kthan', 'POST', `/api/v1/kho/kiem-ke/${d.id}/quyet-dinh`, { decisionNo: 'QD1', decisionDate: '2026-11-30', signer: 'A', reasons: {} })).status).toBe(403);
    expect((await as('kthan', 'POST', '/api/v1/kho/transfers/1/cancel', { reason: 'Thử huỷ phiếu' })).status).toBe(403);
    const me = (ok(await as('kthan', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(me).not.toContain('kho:kiem-ke-quyet-dinh');
    expect(me).toContain('kho:kiem-ke-ghi-nhan');
  });
});
