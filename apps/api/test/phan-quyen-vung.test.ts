// [2026-11-17 04:40 PM khanhtd] NT-HT-003 — GĐ5 (§15): gán vai trò tại nút sơ đồ tổ chức (vùng, gồm cây con)
/**
 * Sơ đồ tổ chức: MB (Miền Bắc) → HN (Hà Nội) → cửa hàng CN01; MB → cửa hàng CN03; MN (Miền Nam) → cửa hàng CN02.
 * "ql" vai trò chính Nhân viên + "Quản lý vùng" (Cho reports:read, ledger:read, documents:read, catalog:write) gán TẠI nút MB.
 * Công tắc bizcity.authz.branch_scope = on.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tok = '';
let qlId = '';
const bid: Record<string, string> = {};
const nid: Record<string, string> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = { status: number; body: any };
const ok = (r: R) => { expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeLessThan(300); return r.body.data; };
const as = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  call(ctx, method, url, payload, { authorization: `Bearer ${tok}` }) as Promise<R>;
const chi = (cn: string) => ({ docType: 'payment', branchCode: cn, docDate: '2026-10-20', description: `Phiếu chi ${cn}`, lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 1000, cashflowCode: '33' }] });
const TB = '/api/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31';
const no64 = (data: { rows: { code: string; debit: number }[] }) => data.rows.find((x) => x.code === '64211')?.debit ?? 0;

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['CN02', 'Cửa hàng 02'], ['CN03', 'Cửa hàng 03']]) ok(await call(ctx, 'POST', '/api/v1/branches', { code, name }));
  for (const b of ok(await call(ctx, 'GET', '/api/v1/branches'))) bid[b.code] = String(b.id);
  for (const [code, name, parentCode] of [['MB', 'Miền Bắc', null], ['HN', 'Hà Nội', 'MB'], ['MN', 'Miền Nam', null]] as const) {
    ok(await call(ctx, 'POST', '/api/v1/org-units', { code, name, ...(parentCode ? { parentCode } : {}) }));
  }
  ok(await call(ctx, 'PUT', '/api/v1/org-units/HN/branches', { branchCodes: ['CN01'] }));
  ok(await call(ctx, 'PUT', '/api/v1/org-units/MB/branches', { branchCodes: ['CN03'] }));
  ok(await call(ctx, 'PUT', '/api/v1/org-units/MN/branches', { branchCodes: ['CN02'] }));
  for (const v of ok(await call(ctx, 'GET', '/api/v1/quyen-chi-nhanh/vung'))) nid[v.code] = String(v.id);
  for (const cn of ['CN01', 'CN02', 'CN03']) ok(await call(ctx, 'POST', '/api/v1/vouchers', chi(cn)));

  const u = ok(await call(ctx, 'POST', '/api/v1/users', { email: 'ql@vung.local', fullName: 'Quản lý Miền Bắc', role: 'staff', password: 'Vung@12345' }));
  qlId = String(u.id);
  const r = ok(await call(ctx, 'POST', '/api/v1/roles', { code: 'ql_vung', label: 'Quản lý vùng', kind: 'job', baseRole: 'staff', reason: 'Vai trò thử vùng' }));
  for (const p of ['reports:read', 'ledger:read', 'documents:read', 'catalog:write']) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission: p, effect: 'allow', reason: 'Luật thử vùng' }));
  ok(await call(ctx, 'POST', `/api/v1/users/${qlId}/roles`, { tenantRoleId: r.id, scopeType: 'org_unit', scopeId: nid.MB, reason: 'Gán tại Miền Bắc' }));
  ok(await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'Bật giới hạn (test vùng)' }));
  tok = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'ql@vung.local', password: 'Vung@12345' } })).json().data.token;
});

describe('GĐ5 — gán vai trò tại nút sơ đồ tổ chức', () => {
  it('danh sách vùng cho HT12: số cửa hàng tính cả cây con (MB = CN01 qua HN + CN03)', async () => {
    const ds = ok(await call(ctx, 'GET', '/api/v1/quyen-chi-nhanh/vung')) as { code: string; branches: number }[];
    expect(ds.find((x) => x.code === 'MB')?.branches).toBe(2);
    expect(ds.find((x) => x.code === 'MN')?.branches).toBe(1);
  });

  it('phạm vi = mọi cửa hàng thuộc Miền Bắc và nút con: CN01, CN03 (không có CN02)', async () => {
    const q = ok(await as('GET', '/api/v1/quyen-chi-nhanh')) as { branches: string[] };
    expect(q.branches).toEqual(['CN01', 'CN03']);
  });

  it('bảng cân đối không lọc → số của CN01 + CN03; xin CN02 → 403', async () => {
    expect(no64(ok(await call(ctx, 'GET', TB)))).toBe(3000);
    expect(no64(ok(await as('GET', TB)))).toBe(2000);
    const r = await as('GET', `${TB}&branchCodes=CN02`);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('BRANCH_OUT_OF_SCOPE');
  });

  it('bảng rà trước khi bật: hiện "tại vùng MB (2 cửa hàng)"', async () => {
    const ra = ok(await call(ctx, 'GET', '/api/v1/quyen-chi-nhanh/ra-soat')) as { nguoi: { userId: string; branches: string[]; ganTai: string[] }[] };
    const x = ra.nguoi.find((n) => n.userId === qlId)!;
    expect(x.branches).toEqual(['CN01', 'CN03']);
    expect(x.ganTai.join(' ')).toContain('tại vùng MB (2 cửa hàng)');
  });

  it('cửa hàng chuyển vùng (CN02 sang Miền Bắc) → quyền đổi ngay yêu cầu kế tiếp', async () => {
    ok(await call(ctx, 'PUT', '/api/v1/org-units/MB/branches', { branchCodes: ['CN02'] }));
    const q = ok(await as('GET', '/api/v1/quyen-chi-nhanh')) as { branches: string[] };
    expect(q.branches).toEqual(['CN01', 'CN02', 'CN03']);
    expect(no64(ok(await as('GET', `${TB}&branchCodes=CN02`)))).toBe(1000);
    ok(await call(ctx, 'PUT', '/api/v1/org-units/MN/branches', { branchCodes: ['CN02'] })); // trả về chỗ cũ
    expect((await as('GET', `${TB}&branchCodes=CN02`)).status).toBe(403);
  });

  it('ngừng / xoá nút (không còn cửa hàng) mà còn lần gán theo vùng → chặn ở CSDL, báo người được gán; thu hồi rồi thì xoá được', async () => {
    ok(await call(ctx, 'POST', '/api/v1/org-units', { code: 'TRONG', name: 'Vùng trống' }));
    const v = (ok(await call(ctx, 'GET', '/api/v1/quyen-chi-nhanh/vung')) as { id: string; code: string }[]).find((x) => x.code === 'TRONG')!;
    const a = ok(await call(ctx, 'POST', `/api/v1/users/${qlId}/roles`, { role: 'viewer', scopeType: 'org_unit', scopeId: v.id, reason: 'Gán tại vùng trống' })) as { id: string };
    const stop = await call(ctx, 'PATCH', '/api/v1/org-units/TRONG', { isActive: false });
    expect(stop.status, JSON.stringify(stop.body)).toBe(409);
    expect(JSON.stringify(stop.body)).toContain('ql@vung.local');
    const del = await call(ctx, 'DELETE', '/api/v1/org-units/TRONG');
    expect(del.status, JSON.stringify(del.body)).toBe(409);
    expect(JSON.stringify(del.body)).toContain('ql@vung.local');
    ok(await call(ctx, 'POST', `/api/v1/users/${qlId}/roles/${a.id}/revoke`, { reason: 'Thu hồi để xoá vùng' }));
    expect((await call(ctx, 'DELETE', '/api/v1/org-units/TRONG')).status).toBeLessThan(300);
  });

  it('gán theo vùng không thành quyền toàn đơn vị: /auth/me chỉ có quyền của vai trò chính Nhân viên', async () => {
    const me = ok(await as('GET', '/api/v1/auth/me')) as { permissions: string[] };
    expect(me.permissions).not.toContain('reports:read');
  });

  it('API gán: nút không thuộc đơn vị → 404; thiếu scopeId → 400', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${qlId}/roles`, { role: 'accountant', scopeType: 'org_unit', scopeId: '999999999', reason: 'Thử' })).status).toBe(404);
    expect((await call(ctx, 'POST', `/api/v1/users/${qlId}/roles`, { role: 'accountant', scopeType: 'org_unit', reason: 'Thử' })).status).toBe(400);
  });

  it('cửa nạp (requireScope của Core, công tắc tắt): Kế toán gán tại Miền Bắc nộp chứng từ bán CN01 → được, CN02 → 403', async () => {
    const kt = ok(await call(ctx, 'POST', '/api/v1/users', { email: 'kt@vung.local', fullName: 'Kế toán Miền Bắc', role: 'viewer', password: 'Vung@12345' }));
    ok(await call(ctx, 'POST', `/api/v1/users/${kt.id}/roles`, { role: 'accountant', scopeType: 'org_unit', scopeId: nid.MB, reason: 'Kế toán Miền Bắc' }));
    ok(await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'off', reason: 'Tắt để kiểm cửa nạp' }));
    const t = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'kt@vung.local', password: 'Vung@12345' } })).json().data.token;
    const nop = (docKey: string, branchCode: string) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents',
      payload: { ...saleDoc({ docKey, docNo: docKey, version: 1 }), branchCode } as never, headers: { authorization: `Bearer ${t}`, 'idempotency-key': `vung-${docKey}` } });
    try {
      expect((await nop('VUNG-CN01', 'CN01')).statusCode).not.toBe(403);
      expect((await nop('VUNG-CN02', 'CN02')).statusCode).toBe(403);
    } finally {
      ok(await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'Bật lại' }));
    }
  });
});
