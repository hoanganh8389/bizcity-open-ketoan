// [2026-11-07 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 2 (ADR-0027 Phụ lục A, W5 đợt 2 mục 7): test thư viện phân quyền mẫu TGS — số liệu khớp nguồn, luật ánh xạ đóng an toàn, nạp vai trò bản nháp qua API
/**
 * - Thư viện: 349 mã, 28 nhóm, 1.618 dòng; sinh lại ra đúng JSON trong repo; báo cáo không ra quyền ghi; cờ chỉ Tìm / In không cấp gì.
 * - Nạp qua API (scripts/phan-quyen/nap-vai-tro-tgs.mjs): 28 vai trò vô hiệu, luật chỉ là quyền có thật; người được gán vai trò bản nháp
 *   không có thêm quyền nào cho tới khi bật; chạy lại không tạo trùng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { PERMISSIONS } from '@bizcity/platform/core/auth';
import { call, setupTenant, type TestCtx } from './helpers.js';

const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'scripts/phan-quyen/tgs-anh-xa.mjs');
const SEED = path.join(ROOT, 'scripts/phan-quyen/nap-vai-tro-tgs.mjs');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */
let lib: any;
let seed: any;
let codes: any;
let groups: any;

beforeAll(async () => {
  lib = await import(LIB);
  seed = await import(SEED);
  codes = JSON.parse(read('docs/standard/phan-quyen/tgs-ma-chuc-nang.json'));
  groups = JSON.parse(read('docs/standard/phan-quyen/tgs-nhom.json'));
});

describe('Thư viện phân quyền mẫu TGS', () => {
  it('khớp nguồn: 349 mã, 28 nhóm, 1.618 dòng; sinh lại ra đúng tệp trong repo', () => {
    expect([codes.items.length, groups.items.length, codes.rows]).toEqual([349, 28, 1618]);
    const again = lib.build(read('docs/standard/phan-quyen/tgs-nguon.csv'), read('packages/platform/src/core/authz/catalog.ts'));
    expect(again.codes).toEqual(codes);
    expect(again.groups).toEqual(groups);
  });

  it('báo cáo không ra quyền ghi; quyền Core trong ánh xạ đều có thật', () => {
    const known = new Set<string>(PERMISSIONS as readonly string[]);
    for (const c of codes.items) {
      for (const m of c.mapsTo) {
        if (m.status === 'core') expect(known.has(m.permission), `${c.code} → ${m.permission}`).toBe(true);
        if (c.kind === 'report' && m.status !== 'de-xuat') expect(m.permission.endsWith(':read'), `${c.code} → ${m.permission}`).toBe(true);
      }
    }
  });

  it('bí danh đọc chỉ ứng Tìm / In; xem màn Phân quyền (HT4 chỉ Tìm) không ra users:write', () => {
    const ht4 = codes.items.find((c: any) => c.code === 'HT4');
    expect(ht4.mapsTo.filter((m: any) => m.permission === 'users:write').map((m: any) => m.op).sort()).toEqual(['cancel', 'create', 'update']);
    const acc3 = codes.items.find((c: any) => c.code === 'ACC3');
    expect(acc3.mapsTo.find((m: any) => m.op === 'read')).toMatchObject({ permission: 'ledger:read', confidence: 'cao' });
  });

  it('cờ chỉ có Tìm / In / Xuất không cấp gì (đóng an toàn), có ghi bất thường', () => {
    const ktcn = groups.items.find((g: any) => g.code === 'tgs-ke-toan-cong-no');
    expect(ktcn.grants.HT10).toBeUndefined(); // HT10 của nhóm này chỉ "Tìm, In"
    expect(ktcn.derived).not.toContain('documents:bypass-date-lock');
    expect(ktcn.anomalies.join('\n')).toMatch(/HT10: cờ chỉ có read, print/);
  });

  it('mọi quyền rủi ro cao suy ra đều được nêu trong bất thường của nhóm', () => {
    const thuKho = groups.items.find((g: any) => g.code === 'tgs-thu-kho');
    expect(thuKho.derived).toContain('users:write'); // bảng gốc: Thủ kho có "Sửa" ở HT4 Phân quyền
    expect(thuKho.anomalies.join('\n')).toMatch(/quyền rủi ro cao suy ra: users:write/);
  });

  it('mã vai trò hợp lệ, không trùng, không trùng vai trò hệ thống', () => {
    const cs = groups.items.map((g: any) => g.code);
    expect(new Set(cs).size).toBe(28);
    for (const c of cs) expect(c).toMatch(/^tgs-[a-z0-9-]{1,36}$/);
  });
});

describe('Nạp vai trò bản nháp qua API', () => {
  let ctx: TestCtx;
  const request = async (method: string, url: string, body?: unknown) => {
    const r = await call(ctx, method as never, url, body);
    return { status: r.status, body: r.body };
  };

  beforeAll(async () => { ctx = await setupTenant(); });
  afterAll(async () => {
    await ctx.app.close();
    await closeDb();
  });

  it('tạo 28 vai trò vô hiệu; luật chỉ là quyền có thật; chạy lại không trùng', async () => {
    const res = await seed.seedTgsRoles(request, groups.items, { confirmPassword: 'Test@123' });
    expect(res.failed, JSON.stringify(res.failed)).toEqual([]);
    expect(res.created).toHaveLength(28);
    const list = (await call(ctx, 'GET', '/api/v1/roles')).body.data as any[];
    const tgs = list.filter((r) => r.code.startsWith('tgs-'));
    expect(tgs).toHaveLength(28);
    expect(tgs.every((r) => r.isActive === false && r.baseRole === 'viewer')).toBe(true);
    const admin = tgs.find((r) => r.code === 'tgs-admin-tckt');
    const detail = (await call(ctx, 'GET', `/api/v1/roles/${admin.id}`)).body.data;
    const allow = detail.rules.filter((x: any) => x.active).map((x: any) => x.permission).sort();
    // nền viewer đã có ledger:read / reports:read → không thêm luật trùng
    expect(allow).toEqual(['documents:bypass-date-lock', 'documents:edit-all', 'settings:write', 'users:write']);
    const again = await seed.seedTgsRoles(request, groups.items, { confirmPassword: 'Test@123' });
    expect(again.created).toEqual([]);
    expect(again.skipped).toHaveLength(28);
  });

  it('người được gán vai trò bản nháp không có thêm quyền; bật vai trò thì có', async () => {
    const u = String((await call(ctx, 'POST', '/api/v1/users', { email: 'tgs@ketoan.local', fullName: 'Người thử TGS', role: 'viewer', password: 'Xem@12345' })).body.data.id);
    const role = ((await call(ctx, 'GET', '/api/v1/roles')).body.data as any[]).find((r) => r.code === 'tgs-kt-chi-nhanh');
    // Vai trò vô hiệu không gán mới được — bản nháp phải được duyệt (bật) trước.
    expect((await call(ctx, 'POST', `/api/v1/users/${u}/roles`, { tenantRoleId: role.id, reason: 'Gán thử', confirmPassword: 'Test@123' })).status).toBe(409);
    const before = (await call(ctx, 'GET', `/api/v1/users/${u}/effective-permissions`)).body.data.permissions;
    expect(before).not.toContain('documents:edit-all');
    const on = await call(ctx, 'PATCH', `/api/v1/roles/${role.id}`, { isActive: true, version: role.version, reason: 'Kế toán trưởng duyệt vai trò mẫu' });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect((await call(ctx, 'POST', `/api/v1/users/${u}/roles`, { tenantRoleId: role.id, reason: 'Gán sau duyệt', confirmPassword: 'Test@123' })).status).toBe(201);
    const after = (await call(ctx, 'GET', `/api/v1/users/${u}/effective-permissions`)).body.data.permissions;
    expect(after).toEqual(expect.arrayContaining(['documents:edit-all', 'documents:bypass-date-lock']));
  });
});
