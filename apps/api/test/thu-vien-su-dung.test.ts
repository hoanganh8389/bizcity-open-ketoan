// [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 (B2, PHASE-030 · 26 §8–§9): test theo dõi sử dụng thư viện — đếm theo thư viện / nguồn / kết quả, mã lạ, không lưu giá trị nhập, cô lập đơn vị, gom theo lượt
/**
 * - core.library.validate đếm một lượt / giá trị; core.library.usage ghi nốt bộ nhớ rồi trả số liệu bảng đánh giá.
 * - Cột chỉ có mã: giá trị người nhập (số tiền, mã lạ) không xuất hiện trong library_usage_daily (R-SEC-10).
 * - Nguồn lạ thành "api"; đơn vị khác không thấy số của nhau; gom theo lượt (30 giây / 200 dòng), không hẹn giờ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { outcomeOf, normalizeSource, pendingUsageRows, recordLibraryUsage, resetLibraryUsage, shouldFlush, validateInLibrary } from '@bizcity/platform/core/libraries/index';
import { call, setupTenant, type TestCtx } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Bộ đếm thuần', () => {
  it('kết quả lượt: chặn > cảnh báo > qua; mức nhắc không tính; nguồn lạ thành api', () => {
    expect(outcomeOf({ findings: [{ code: 'LIB-UNVERIFIED-001', level: 'info' } as any] })).toEqual({ outcome: 'pass', findingCode: '' });
    expect(outcomeOf({ findings: [{ code: 'LIB-VALUE-001', level: 'warn' } as any, { code: 'LIB-UNVERIFIED-001', level: 'info' } as any] })).toEqual({ outcome: 'warn', findingCode: 'LIB-VALUE-001' });
    expect(outcomeOf({ findings: [{ code: 'LIB-VALUE-001', level: 'warn' } as any, { code: 'LIB-EFFECTIVE-001', level: 'block' } as any] })).toEqual({ outcome: 'block', findingCode: 'LIB-EFFECTIVE-001' });
    expect(normalizeSource('modules/luong')).toBe('modules/luong');
    expect(normalizeSource("x'; DROP TABLE t;--")).toBe('api');
    expect(normalizeSource(undefined)).toBe('api');
  });

  it('gom theo lượt: đủ 200 dòng thì ghi, chưa đủ và chưa 30 giây thì chưa', () => {
    resetLibraryUsage();
    const r = validateInLibrary('vn.ngay-nghi-le', '2026-02-16')!;
    recordLibraryUsage('1', r, '2026-02-16', 'a');
    expect(pendingUsageRows()).toBe(1);
    expect(shouldFlush(Date.now())).toBe(false);
    expect(shouldFlush(Date.now() + 31_000)).toBe(true);
    for (let i = 0; i < 199; i++) recordLibraryUsage('1', r, '2026-02-16', `s${i}`);
    expect(pendingUsageRows()).toBe(200);
    expect(shouldFlush(Date.now())).toBe(true);
    resetLibraryUsage();
  });
});

describe('Theo dõi sử dụng qua API', () => {
  let a: TestCtx;
  let b: TestCtx;
  beforeAll(async () => { resetLibraryUsage(); a = await setupTenant(); b = await setupTenant(); });
  afterAll(async () => {
    await a.app.close();
    await b.app.close();
    await closeDb();
  });

  const check = (ctx: TestCtx, body: unknown) => call(ctx, 'POST', '/api/v1/libraries/vn.tham-so-phap-ly/validate', body);
  /** id đơn vị của bối cảnh test — mọi truy vấn thẳng bảng chỉ đọc dòng của đơn vị này (CSDL test dùng lại giữa các lần chạy). */
  const tid = async (ctx: TestCtx) => (await sql<{ id: string }>`SELECT id::text AS id FROM tenants WHERE code = ${ctx.tenantCode}`.execute(db)).rows[0]!.id;

  it('đếm qua / cảnh báo / chặn theo thư viện và nguồn; mã lạ; không lưu giá trị nhập', async () => {
    expect((await check(a, { inputs: [{ code: 'BHXH_NLD', value: 8 }, { code: 'BHXH_NLD', value: 8 }], at: '2026-03-01', source: 'modules/luong' })).status).toBe(200);
    expect((await check(a, { input: { code: 'LUONG_CO_SO', value: 1777777 }, at: '2026-03-01', source: 'modules/luong' })).status).toBe(200);
    expect((await check(a, { input: 'MA_LA_9876543', source: 'ket-noi/pos' })).status).toBe(200);
    expect((await call(a, 'POST', '/api/v1/libraries/vn.ngay-nghi-le/validate', { input: '2026-02-16' })).status).toBe(200);

    const u = await call(a, 'GET', '/api/v1/libraries/usage?from=2026-01-01&to=2099-12-31');
    expect(u.status, JSON.stringify(u.body)).toBe(200);
    const d = u.body.data;
    expect(d.total).toEqual({ pass: 3, warn: 1, block: 1 });
    expect(d.byLibrary).toEqual([
      { libraryId: 'vn.ngay-nghi-le', pass: 1, warn: 0, block: 0 },
      { libraryId: 'vn.tham-so-phap-ly', pass: 2, warn: 1, block: 1 },
    ]);
    expect(d.bySource.find((s: any) => s.source === 'modules/luong')).toMatchObject({ pass: 2, warn: 1, block: 0 });
    expect(d.bySource.find((s: any) => s.source === 'api')).toMatchObject({ libraryId: 'vn.ngay-nghi-le', pass: 1 });
    expect(d.topFindings.map((f: any) => f.code).sort()).toEqual(['LIB-UNKNOWN-001', 'LIB-VALUE-001']);
    expect(d.unknown).toEqual([{ libraryId: 'vn.tham-so-phap-ly', source: 'ket-noi/pos', count: 1 }]);

    // Không lưu giá trị nhập: số tiền và mã lạ không nằm trong bảng.
    const dump = await sql<{ t: string }>`SELECT string_agg(row_to_json(u)::text, ' ') AS t FROM library_usage_daily u WHERE tenant_id = ${await tid(a)}::bigint`.execute(db);
    expect(dump.rows[0]!.t).not.toContain('1777777');
    expect(dump.rows[0]!.t).not.toContain('MA_LA_9876543');
    expect(dump.rows[0]!.t).toContain('LUONG_CO_SO');
  });

  it('cộng dồn khi ghi lại cùng khoá; lọc theo thư viện / nguồn', async () => {
    await check(a, { input: { code: 'BHXH_NLD', value: 8 }, at: '2026-03-01', source: 'modules/luong' });
    const u = (await call(a, 'GET', '/api/v1/libraries/usage?library=vn.tham-so-phap-ly&source=modules/luong')).body.data;
    expect(u.byLibrary).toEqual([{ libraryId: 'vn.tham-so-phap-ly', pass: 3, warn: 1, block: 0 }]);
    const rows = await sql<{ count: string }>`SELECT count FROM library_usage_daily WHERE tenant_id = ${await tid(a)}::bigint AND item_code = 'BHXH_NLD' AND source = 'modules/luong'`.execute(db);
    expect(rows.rows.map((r) => Number(r.count))).toEqual([3]); // một dòng, cộng dồn
  });

  it('đơn vị khác không thấy số của nhau; khoảng ngày sai bị từ chối', async () => {
    const u = (await call(b, 'GET', '/api/v1/libraries/usage')).body.data;
    expect(u.total).toEqual({ pass: 0, warn: 0, block: 0 });
    expect((await call(b, 'GET', '/api/v1/libraries/usage?from=2026-12-01&to=2026-01-01')).status).toBe(400);
  });
});
