// [2026-11-13 06:30 PM kiennt] PHAN-QUYEN — bản thử: quyền theo chi nhánh × màn × thao tác (đóng góp)
/**
 * Vai trò gán tại chi nhánh chỉ có hiệu lực ở chi nhánh đó; người có lần gán theo chi nhánh chỉ làm việc ở các chi nhánh đó.
 * Số liệu: CN01, CN02, CN03. "nv" vai trò chính Người xem;
 *   - tại CN01: vai trò đơn vị "Lập kiểm kê" (Cho kho:kiem-ke-lap, kho:kiem-ke-sua)
 *   - tại CN02: Kế toán (đủ quyền).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let nv = '';
let tok = '';
const bid: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, cn?: string) => call(ctx, method, url, payload, { authorization: `Bearer ${tok}`, ...(cn ? { 'x-chi-nhanh': cn } : {}) });
const draft = (cn: string) => ({ countDate: '2026-11-30', branchCode: cn, purpose: 'Thử quyền theo chi nhánh' });

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['CN02', 'Chi nhánh 02'], ['CN03', 'Chi nhánh 03']]) ok(await call(ctx, 'POST', '/api/v1/branches', { code, name }));
  for (const b of ok(await call<{ data: { id: string; code: string }[] }>(ctx, 'GET', '/api/v1/branches'))) bid[b.code] = String(b.id);
  for (const [code, cn] of [['KA-1', 'CN01'], ['KB-1', 'CN02'], ['KC-1', 'CN03']]) ok(await call(ctx, 'POST', '/api/v1/warehouses', { code, branchCode: cn, name: `Kho ${cn}`, isDefault: true }));
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email: 'nv@pqcn.local', fullName: 'Nhân viên', role: 'viewer', password: 'Pqcn@12345' }));
  nv = String(u.id);
  tok = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'nv@pqcn.local', password: 'Pqcn@12345' } })).json().data.token;
});

describe('Chưa gán theo chi nhánh', () => {
  it('mọi chi nhánh, chỉ quyền của vai trò chính (Người xem): lập ở CN01 bị chặn vì thiếu quyền', async () => {
    expect(ok(await as('GET', '/api/v1/quyen-chi-nhanh'))).toEqual({ branches: null, theoChiNhanh: {}, camTheoChiNhanh: {} });
    expect((await as('POST', '/api/v1/kho/kiem-ke', draft('CN01'))).status).toBe(403);
  });
});

describe('Gán vai trò tại chi nhánh', () => {
  beforeAll(async () => {
    const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code: 'lap_kk', label: 'Lập kiểm kê', kind: 'job', baseRole: 'viewer', reason: 'Vai trò thử' }));
    for (const p of ['kho:kiem-ke-lap', 'kho:kiem-ke-sua']) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission: p, effect: 'allow', reason: 'Luật thử' }));
    ok(await call(ctx, 'POST', `/api/v1/users/${nv}/roles`, { tenantRoleId: r.id, scopeType: 'branch', scopeId: bid.CN01, reason: 'Gán tại CN01' }));
    ok(await call(ctx, 'POST', `/api/v1/users/${nv}/roles`, { role: 'accountant', scopeType: 'branch', scopeId: bid.CN02, reason: 'Gán tại CN02' }));
  });

  // [2026-11-14 09:30 PM kiennt] NT-HT-003 — công tắc đơn vị mặc định tắt: đã gán tại chi nhánh vẫn như cũ cho tới khi bật (đóng góp)
  it('công tắc tắt (mặc định): như cũ — mọi chi nhánh; bảng rà cho thấy phạm vi sẽ thành CN01, CN02', async () => {
    expect(ok(await as('GET', '/api/v1/quyen-chi-nhanh'))).toEqual({ branches: null, theoChiNhanh: {}, camTheoChiNhanh: {} });
    const ra = ok(await call(ctx, 'GET', '/api/v1/quyen-chi-nhanh/ra-soat')) as { batGioiHan: boolean; nguoi: { userId: string; branches: string[] | null }[] };
    expect(ra.batGioiHan).toBe(false);
    expect(ra.nguoi.find((x) => x.userId === nv)!.branches).toEqual(['CN01', 'CN02']);
    ok(await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'Bật giới hạn theo chi nhánh (test)' }));
  });

  it('phạm vi = CN01, CN02; quyền thêm khác nhau theo chi nhánh', async () => {
    const q = ok(await as('GET', '/api/v1/quyen-chi-nhanh')) as { branches: string[]; theoChiNhanh: Record<string, string[]> };
    expect(q.branches).toEqual(['CN01', 'CN02']);
    expect(q.theoChiNhanh.CN01).toEqual(expect.arrayContaining(['kho:kiem-ke-lap', 'kho:kiem-ke-sua']));
    expect(q.theoChiNhanh.CN01).not.toContain('kho:kiem-ke-ghi-nhan');
    expect(q.theoChiNhanh.CN02).toEqual(expect.arrayContaining(['documents:write', 'kho:kiem-ke-ghi-nhan', 'kho:chuyen-kho-lap']));
    // /auth/me trả quyền gốc (không dính chi nhánh đang làm việc)
    const me = ok(await as('GET', '/api/v1/auth/me', undefined, 'CN02')) as { permissions: string[] };
    expect(me.permissions).not.toContain('kho:kiem-ke-lap');
  });

  it('CN01: lập / sửa nháp được, ghi nhận bị chặn (vai trò tại CN01 không có)', async () => {
    const d = ok(await as('POST', '/api/v1/kho/kiem-ke', draft('CN01'))) as { id: string };
    ok(await as('PUT', `/api/v1/kho/kiem-ke/${d.id}`, { ...draft('CN01'), purpose: 'Sửa' }));
    expect((await as('POST', `/api/v1/kho/kiem-ke/${d.id}/ghi-nhan`, {})).status).toBe(403);
  });

  it('CN02: Kế toán tại CN02 — lập và ghi nhận được (theo chi nhánh của biên bản, không cần header)', async () => {
    const d = ok(await as('POST', '/api/v1/kho/kiem-ke', draft('CN02'))) as { id: string };
    const r = await as('POST', `/api/v1/kho/kiem-ke/${d.id}/ghi-nhan`, {});
    expect(r.status).not.toBe(403);
  });

  it('CN03 ngoài phạm vi → 403 BRANCH_OUT_OF_SCOPE', async () => {
    const r = await as('POST', '/api/v1/kho/kiem-ke', draft('CN03'));
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('BRANCH_OUT_OF_SCOPE');
  });

  it('chuyển kho: chi nhánh xuất CN02 (có quyền) → CN03 nhận được; xuất CN01 (không có quyền lập chuyển kho) → 403', async () => {
    const t = (from: string, to: string) => ({ docDate: '2026-11-30', fromBranchCode: from, toBranchCode: to, lines: [{ lineKey: 'l1', sku: 'X', qty: 1 }] });
    expect(JSON.stringify((await as('POST', '/api/v1/kho/transfers', t('CN02', 'CN03'))).body)).not.toMatch(/BRANCH_OUT_OF_SCOPE|Không có quyền/);
    expect((await as('POST', '/api/v1/kho/transfers', t('CN01', 'CN02'))).status).toBe(403);
  });

  it('xem danh sách theo chi nhánh đang làm việc: header CN02 → được; header ngoài phạm vi khi đọc → bỏ qua header', async () => {
    ok(await as('GET', '/api/v1/kho/kiem-ke', undefined, 'CN02'));
    ok(await as('GET', '/api/v1/kho/kiem-ke', undefined, 'CN03'));
  });
});
