// [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b (B3b, PHASE-030 · 26 §7.1): test cấu hình thư viện theo đơn vị + phiếu đề xuất — khuôn cấu hình, ghi đè áp vào bộ kiểm / ô chọn, hạ mức luật, tắt thư viện tuỳ chọn, chặn kỳ khoá, chỉ thêm, vòng trạng thái phiếu, quyền, cô lập
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { checkLibraryConfig, getLibrary, validateAgainstLibrary } from '@bizcity/platform/core/libraries/index';
import { call, setupTenant, type TestCtx } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const P = () => getLibrary('vn.tham-so-phap-ly')!;

describe('Khuôn cấu hình (checkLibraryConfig)', () => {
  it('chỉ tắt được thư viện tuỳ chọn; atPolicy chỉ cho thư viện tham số', () => {
    expect(checkLibraryConfig(P(), { enabled: false }).join()).toMatch(/không phải tuỳ chọn/);
    expect(checkLibraryConfig(getLibrary('authz.tgs-nhom')!, { enabled: false })).toEqual([]);
    expect(checkLibraryConfig(getLibrary('vn.ngay-nghi-le')!, { atPolicy: 'today' }).join()).toMatch(/chỉ dùng cho thư viện tham số/);
  });

  it('mức luật chỉ hạ, chỉ luật của thư viện (không hạ LIB-* chuẩn)', () => {
    expect(checkLibraryConfig(P(), { ruleLevels: { 'TSPL-LAW-001': 'info' } })).toEqual([]);
    expect(checkLibraryConfig(P(), { ruleLevels: { 'TSPL-LAW-001': 'warn' } }).join()).toMatch(/chỉ được hạ/);
    expect(checkLibraryConfig(P(), { ruleLevels: { 'LIB-VALUE-001': 'info' } as any }).join()).toMatch(/không phải luật của thư viện/);
  });

  it('ghi đè: chỉ mục có giá trị theo ngày, đúng khuôn giá trị, có lý do, ngày không trùng', () => {
    const ok = { overrides: { GIO_LAM_VIEC_NGAY: [{ from: '2026-01-01', value: 7.5, reason: 'Nội quy công ty 2026' }] } };
    expect(checkLibraryConfig(P(), ok)).toEqual([]);
    expect(checkLibraryConfig(getLibrary('vn.ngay-nghi-le')!, { overrides: { '2026-01-01': [{ from: '2026-01-01', value: 1, reason: 'không hợp lệ' }] } }).join()).toMatch(/không có giá trị theo ngày/);
    const bad = checkLibraryConfig(P(), { overrides: { BHXH_NLD: [{ from: '2026-01-01', value: -1, reason: 'x' }, { from: '2026-01-01', value: 'tám', reason: 'Lý do đủ dài' }] } });
    expect(bad.join('\n')).toMatch(/phải ≥ 0/);
    expect(bad.join('\n')).toMatch(/reason bắt buộc/);
    expect(bad.join('\n')).toMatch(/from trùng ngày/);
    expect(bad.join('\n')).toMatch(/phải là number/);
  });

  it('bộ kiểm dùng ghi đè có hiệu lực tại ngày; trước ngày ghi đè vẫn là thư viện; luật bị hạ mức', () => {
    const config = { overrides: { GIO_LAM_VIEC_NGAY: [{ from: '2026-01-01', value: 7.5, reason: 'Nội quy công ty 2026' }] }, ruleLevels: { 'TSPL-LAW-001': 'info' as const } };
    const same = validateAgainstLibrary(P(), { code: 'GIO_LAM_VIEC_NGAY', value: 7.5 }, { at: '2026-03-01', config });
    expect(same).toMatchObject({ value: 7.5, valueSource: 'tenant' });
    expect(same.findings.map((f) => f.code)).not.toContain('LIB-VALUE-001');
    const lib8 = validateAgainstLibrary(P(), { code: 'GIO_LAM_VIEC_NGAY', value: 8 }, { at: '2026-03-01', config });
    expect(lib8.findings.find((f) => f.code === 'LIB-VALUE-001')!.message).toMatch(/giá trị đơn vị đang dùng/);
    expect(validateAgainstLibrary(P(), { code: 'GIO_LAM_VIEC_NGAY', value: 8 }, { at: '2025-12-31', config })).toMatchObject({ value: 8, valueSource: 'library' });
    const law = validateAgainstLibrary(P(), { code: 'BHXH_NLD', override: true }, { at: '2026-03-01', config });
    expect(law.findings.find((f) => f.code === 'TSPL-LAW-001')!.level).toBe('info');
  });
});

describe('API cấu hình + phiếu đề xuất', () => {
  let a: TestCtx;
  let b: TestCtx;
  let tidA = '';
  beforeAll(async () => {
    a = await setupTenant(); b = await setupTenant();
    tidA = (await sql<{ id: string }>`SELECT id::text AS id FROM tenants WHERE code = ${a.tenantCode}`.execute(db)).rows[0]!.id;
    const p = await sql<{ id: string }>`INSERT INTO fiscal_periods (tenant_id, year, month, start_date, end_date) VALUES (${tidA}, 2025, 3, '2025-03-01', '2025-03-31') RETURNING id`.execute(db);
    await sql`INSERT INTO period_locks (tenant_id, period_id, branch_id, doc_type, locked_by) VALUES (${tidA}, ${p.rows[0]!.id}, NULL, '*', 'test')`.execute(db);
  });
  afterAll(async () => {
    await a.app.close();
    await b.app.close();
    await closeDb();
  });
  const cfg = (ctx: TestCtx, id: string, body: unknown) => call(ctx, 'POST', `/api/v1/libraries/${id}/config`, body);

  it('cấu hình có phiên bản; ghi đè áp vào validate và ô chọn; chỉ thêm ở CSDL', async () => {
    const one = await cfg(a, 'vn.tham-so-phap-ly', { config: { overrides: { GIO_LAM_VIEC_NGAY: [{ from: '2026-01-01', value: 7.5, reason: 'Nội quy công ty 2026' }] } }, reason: 'Áp nội quy 2026' });
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.data.version).toBe(1);
    expect((await cfg(a, 'vn.tham-so-phap-ly', { config: { overrides: { GIO_LAM_VIEC_NGAY: [{ from: '2026-01-01', value: 7.5, reason: 'Nội quy công ty 2026' }] }, atPolicy: 'docDate' }, reason: 'Ghi rõ đọc theo ngày chứng từ' })).body.data.version).toBe(2);
    const g = (await call(a, 'GET', '/api/v1/libraries/vn.tham-so-phap-ly/config')).body.data;
    expect(g.history.map((h: any) => h.version)).toEqual([2, 1]);

    const v = (await call(a, 'POST', '/api/v1/libraries/vn.tham-so-phap-ly/validate', { input: { code: 'GIO_LAM_VIEC_NGAY', value: 7.5 }, at: '2026-03-01' })).body.data.results[0];
    expect(v).toMatchObject({ value: 7.5, valueSource: 'tenant' });
    const rows = (await call(a, 'GET', '/api/v1/libraries/vn.tham-so-phap-ly/items?q=GIO_LAM_VIEC_NGAY&at=2026-03-01')).body.data.rows;
    expect(rows[0]).toMatchObject({ value: 'GIO_LAM_VIEC_NGAY', valueAt: 7.5, overridden: true });
    // đơn vị khác vẫn đọc giá trị thư viện
    expect((await call(b, 'POST', '/api/v1/libraries/vn.tham-so-phap-ly/validate', { input: 'GIO_LAM_VIEC_NGAY', at: '2026-03-01' })).body.data.results[0]).toMatchObject({ value: 8, valueSource: 'library' });

    await expect(sql`UPDATE library_settings SET reason = 'sửa lén' WHERE tenant_id = ${tidA}::bigint`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`DELETE FROM library_settings WHERE tenant_id = ${tidA}::bigint`.execute(db)).rejects.toThrow(/chỉ thêm/);
  });

  it('ghi đè rơi vào kỳ đã khoá bị chặn; khuôn sai bị từ chối; lý do bắt buộc', async () => {
    const locked = await cfg(a, 'vn.tham-so-phap-ly', { config: { overrides: { GIO_LAM_VIEC_NGAY: [{ from: '2025-03-15', value: 7, reason: 'Thử lùi vào kỳ khoá' }] } }, reason: 'Thử kỳ khoá' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('PERIOD_LOCKED');
    expect((await cfg(a, 'vn.tham-so-phap-ly', { config: { enabled: false }, reason: 'Tắt thử thư viện lõi' })).status).toBe(400);
    expect((await cfg(a, 'vn.tham-so-phap-ly', { config: { la: 1 }, reason: 'Khoá lạ' })).status).toBe(400);
    expect((await cfg(a, 'vn.tham-so-phap-ly', { config: {}, reason: 'x' })).status).toBe(400);
  });

  it('tắt thư viện tuỳ chọn: đơn vị đó không đọc được; danh sách ghi rõ', async () => {
    expect((await cfg(a, 'authz.tgs-nhom', { config: { enabled: false }, reason: 'Không dùng vai trò mẫu TGS' })).status).toBe(200);
    expect((await call(a, 'GET', '/api/v1/libraries/authz.tgs-nhom/items')).status).toBe(404);
    expect((await call(a, 'POST', '/api/v1/libraries/authz.tgs-nhom/validate', { input: 'tgs-thu-kho' })).status).toBe(404);
    const la = (await call(a, 'GET', '/api/v1/libraries')).body.data.items.find((x: any) => x.id === 'authz.tgs-nhom');
    expect(la).toMatchObject({ optional: true, enabled: false, configVersion: 1 });
    expect((await call(b, 'GET', '/api/v1/libraries/authz.tgs-nhom/items')).status).toBe(200);
  });

  it('phiếu đề xuất: gửi, vòng trạng thái, rút chỉ người gửi, vào bản cần số bản, không xoá; đơn vị khác không thấy', async () => {
    const p = await call(a, 'POST', '/api/v1/libraries/vn.ngay-nghi-le/proposals', { kind: 'them-muc', content: 'Thêm 2026-09-01, 2026-09-02 — nghỉ Quốc khánh', basisKey: 'vn.law.88-2015-qh13' });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    const pid = p.body.data.id;
    expect(p.body.data.status).toBe('gui');
    expect((await call(a, 'POST', '/api/v1/libraries/vn.ngay-nghi-le/proposals', { kind: 'sua-gia-tri', content: 'Sửa mà không có mã mục' })).status).toBe(400);
    expect((await call(a, 'POST', '/api/v1/libraries/vn.ngay-nghi-le/proposals', { kind: 'them-muc', content: 'Căn cứ lạ', basisKey: 'KHONG-CO' })).status).toBe(400);

    const st = (body: unknown, id = pid) => call(a, 'POST', `/api/v1/libraries/proposals/${id}/status`, body);
    expect((await st({ status: 'da-vao', resolvedVersion: '1.1.0' })).status).toBe(409); // gui → da-vao không được
    expect((await st({ status: 'nhan', note: 'Nhóm Lõi đã nhận' })).body.data.status).toBe('nhan');
    expect((await st({ status: 'da-vao' })).status).toBe(400); // thiếu bản
    expect((await st({ status: 'da-vao', resolvedVersion: '1.1.0' })).body.data).toMatchObject({ status: 'da-vao', resolvedVersion: '1.1.0' });
    expect((await st({ status: 'rut' })).status).toBe(409); // đã xong thì không rút

    const q = await call(a, 'POST', '/api/v1/libraries/vn.tham-so-phap-ly/proposals', { kind: 'bao-sai', itemCode: 'LUONG_CO_SO', content: 'Mức từ 01/07/2026 cần đối chiếu Nghị định' });
    expect((await st({ status: 'rut' }, q.body.data.id)).body.data.status).toBe('rut');

    expect((await call(a, 'GET', '/api/v1/libraries/proposals?library=vn.ngay-nghi-le')).body.data.items.map((x: any) => x.status)).toEqual(['da-vao']);
    expect((await call(b, 'GET', '/api/v1/libraries/proposals')).body.data.items).toEqual([]);
    await expect(sql`DELETE FROM library_change_requests WHERE id = ${pid}::bigint`.execute(db)).rejects.toThrow(/không xoá/);
    await expect(sql`UPDATE library_change_requests SET content = 'sửa lén' WHERE id = ${pid}::bigint`.execute(db)).rejects.toThrow(/không sửa/);
  });

  it('kế toán (catalog:write, không settings:write): gửi và rút được, không xử lý phiếu, không đổi cấu hình', async () => {
    expect((await call(b, 'POST', '/api/v1/users', { email: 'kt@ketoan.local', fullName: 'Kế toán', role: 'accountant', password: 'Ketoan@123' })).status).toBe(201);
    const login = await b.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: b.tenantCode, email: 'kt@ketoan.local', password: 'Ketoan@123' } });
    const kt: TestCtx = { ...b, token: (login.json() as any).data.token };
    const p = await call(kt, 'POST', '/api/v1/libraries/vn.tham-so-phap-ly/proposals', { kind: 'can-cu', itemCode: 'BHXH_NLD', content: 'Thêm căn cứ Luật BHXH 2024' });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect((await call(kt, 'POST', `/api/v1/libraries/proposals/${p.body.data.id}/status`, { status: 'nhan' })).status).toBe(403);
    expect((await call(kt, 'POST', `/api/v1/libraries/proposals/${p.body.data.id}/status`, { status: 'rut' })).body.data.status).toBe('rut');
    expect((await cfg(kt, 'vn.tham-so-phap-ly', { config: {}, reason: 'Kế toán đổi cấu hình' })).status).toBe(403);
  });
});
