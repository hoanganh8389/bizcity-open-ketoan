// [2026-11-09 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51a (B5a, PHASE-030 · 26 §4.1): test ctx.libraries trong action — validate / require, cấu hình đơn vị, at theo manifest, bằng chứng, đếm sử dụng, dryRun; core.library.modules
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { env } from '@bizcity/platform/config/env';
import { defineAction, runAction } from '../src/core/actions.js';
import type { AuthContext, Permission } from '../src/core/auth.js';
import { flushLibraryUsage, getLibrary, resetLibraryUsage, saveLibraryConfig } from '@bizcity/platform/core/libraries/index';
import { resetModuleLibraryDecls } from '@bizcity/platform/core/libraries/context';
import { moduleVerdict } from '../src/modules/system/libraries.routes.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
let ctx: TestCtx;
let tenantId = '';
const root = mkdtempSync(path.join(tmpdir(), 'bizcity-mod-'));
const auth = (): AuthContext => ({ tenantId, actor: 'user:test', actorName: 'Test', kind: 'user', role: null, permissions: new Set<Permission>(['documents:write', 'documents:read', 'settings:write']) } as AuthContext);

/** Module giả: luong khai vn.tham-so-phap-ly theo ngày chứng từ (bắt buộc); nghi khai vn.ngay-nghi-le theo hôm nay. */
function writeModule(key: string, libraries: unknown[]) {
  mkdirSync(path.join(root, key), { recursive: true });
  writeFileSync(path.join(root, key, 'bizcity.module.json'), JSON.stringify({ contract: 'bizcity_module@1', key, kind: 'module', label: `Module ${key}`, requires: { capabilities: [] }, libraries }));
}

const act = (id: string, f: (c: any) => Promise<unknown>, effect: 'read' | 'write' = 'write') => defineAction({
  dryRun: true,
  id, title: 'Thử ctx.libraries', permission: effect === 'write' ? 'documents:write' : 'documents:read', effect,
  ...(effect === 'write' ? { idempotency: 'natural' as const, sideEffects: ['documents' as const] } : { idempotency: 'none' as const }),
  input: z.object({}), output: z.any(), expose: {}, handler: (c: any) => f(c),
} as any) as any;
const run = (def: any, opts: { dryRun?: boolean } = {}) => runAction(def, {}, { auth: auth(), requestId: `ml-${Math.random()}`, dryRun: opts.dryRun } as any);
const usageRows = async (source: string) => {
  await flushLibraryUsage(db);
  return (await sql`SELECT library_id, count FROM library_usage_daily WHERE tenant_id = ${tenantId}::bigint AND source = ${source}`.execute(db)).rows as { library_id: string; count: string }[];
};

beforeAll(async () => {
  // Dựng ứng dụng với thư mục module thật TRƯỚC, rồi mới trỏ BIZCITY_MODULES_DIR sang module giả (chỉ bizcity.module.json, không mã).
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  (env as any).BIZCITY_MODULES_DIR = root;
  writeModule('luong', [{ id: 'vn.tham-so-phap-ly', fields: ['luong.tinh.luong#gioLam'], at: 'docDate', required: true }]);
  writeModule('nghi', [{ id: 'vn.ngay-nghi-le', fields: ['nghi.dang-ky.nghi#ngay'] }]);
  resetModuleLibraryDecls();
  resetLibraryUsage();
});
afterAll(async () => {
  delete (env as any).BIZCITY_MODULES_DIR;
  rmSync(root, { recursive: true, force: true });
  await ctx.app.close();
});

describe('ctx.libraries.validate / require', () => {
  it('validate không ném lỗi, trả phát hiện; mã đúng thì ok', async () => {
    const r: any = (await run(act('nghi.dang-ky.thu', async (c) => ({
      bad: await c.libraries.validate('vn.ngay-nghi-le', 'KHONG-CO'),
      good: await c.libraries.validate('vn.ngay-nghi-le', '2026-02-16'),
    })))).data;
    expect(r.bad.ok).toBe(false);
    expect(r.bad.findings.map((f: any) => f.code)).toContain('LIB-UNKNOWN-001');
    expect(r.good.ok).toBe(true);
  });

  it('require: block → VALIDATION kèm mã LIB-* trong details; giao dịch rollback (không ghi gì)', async () => {
    const def = act('nghi.dang-ky.chan', async (c) => {
      await c.libraries.require('vn.ngay-nghi-le', 'KHONG-CO', { field: 'nghi.dang-ky.chan#ngay' });
      return { reached: true };
    });
    await expect(run(def)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { library: 'vn.ngay-nghi-le', code: 'LIB-UNKNOWN-001', field: 'nghi.dang-ky.chan#ngay' } });
  });

  it('require: warn không chặn, gom vào meta.libraryWarnings; thư viện không có → NOT_FOUND', async () => {
    const res = await run(act('luong.tinh.canh-bao', async (c) => c.libraries.require('vn.tham-so-phap-ly', { code: 'GIO_LAM_VIEC_NGAY', value: 9 }, { at: '2026-03-01', field: 'luong.tinh.canh-bao#gioLam' })));
    expect((res.data as any).ok).toBe(true);
    const warnings = (res.meta as any).libraryWarnings as any[];
    expect(warnings.map((w) => w.code)).toContain('LIB-VALUE-001');
    expect(warnings[0]).toMatchObject({ library: 'vn.tham-so-phap-ly', field: 'luong.tinh.canh-bao#gioLam' });
    await expect(run(act('nghi.dang-ky.khong-co', async (c) => c.libraries.require('vn.khong-co', 'X')))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('manifest khai at = docDate: thiếu { at } → VALIDATION (không đoán ngày); có at thì chạy; at sai khuôn bị từ chối', async () => {
    await expect(run(act('luong.tinh.thieu-ngay', async (c) => c.libraries.validate('vn.tham-so-phap-ly', 'GIO_LAM_VIEC_NGAY'))))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringMatching(/docDate/) });
    const ok: any = (await run(act('luong.tinh.co-ngay', async (c) => c.libraries.validate('vn.tham-so-phap-ly', 'GIO_LAM_VIEC_NGAY', { at: '2026-03-01' })))).data;
    expect(ok.ok).toBe(true);
    await expect(run(act('luong.tinh.sai-ngay', async (c) => c.libraries.validate('vn.tham-so-phap-ly', 'GIO_LAM_VIEC_NGAY', { at: '01/03/2026' })))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // module không khai at: mặc định hôm nay
    const today: any = (await run(act('nghi.dang-ky.hom-nay', async (c) => c.libraries.validate('vn.ngay-nghi-le', '2026-02-16')))).data;
    expect(today.at).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('Cấu hình đơn vị áp vào ctx.libraries', () => {
  it('ghi đè của đơn vị đổi kết quả (valueSource tenant); đơn vị tắt thư viện tuỳ chọn → null, không lỗi', async () => {
    await saveLibraryConfig(db, tenantId, getLibrary('vn.tham-so-phap-ly')!, { overrides: { GIO_LAM_VIEC_NGAY: [{ from: '2026-01-01', value: 7.5, reason: 'Nội quy công ty 2026' }] } }, 'Đặt giờ làm việc theo nội quy', 'user:test');
    const r: any = (await run(act('luong.tinh.ghi-de', async (c) => c.libraries.validate('vn.tham-so-phap-ly', { code: 'GIO_LAM_VIEC_NGAY', value: 7.5 }, { at: '2026-03-01' })))).data;
    expect(r).toMatchObject({ value: 7.5, valueSource: 'tenant' });
    expect(r.findings.map((f: any) => f.code)).not.toContain('LIB-VALUE-001');

    await saveLibraryConfig(db, tenantId, getLibrary('authz.tgs-nhom')!, { enabled: false }, 'Đơn vị không dùng nhóm TGS', 'user:test');
    const off: any = (await run(act('nghi.dang-ky.tat', async (c) => ({ a: await c.libraries.validate('authz.tgs-nhom', 'X'), b: await c.libraries.require('authz.tgs-nhom', 'X') })))).data;
    expect(off).toEqual({ a: null, b: null });
  });
});

describe('Bằng chứng và đếm sử dụng', () => {
  it('action ghi: bằng chứng có notes.libraries (mã mục, giá trị thư viện — không có giá trị người nhập); nguồn modules/<key> được đếm', async () => {
    resetLibraryUsage();
    const secret = 'GIA-TRI-NGUOI-NHAP-KHONG-DUOC-GHI';
    const res = await run(act('nghi.dang-ky.chung-cu', async (c) => {
      await c.libraries.validate('vn.ngay-nghi-le', '2026-02-16', { field: 'nghi.dang-ky.chung-cu#ngay' });
      await c.libraries.validate('vn.ngay-nghi-le', secret);
      return {};
    }));
    const ev: any = await db.selectFrom('audit_logs').select(['after_data']).where('id', '=', (res.meta as any).receipt.evidenceId).executeTakeFirstOrThrow();
    const rows = ev.after_data.notes.libraries as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ library: 'vn.ngay-nghi-le', code: '2026-02-16', outcome: 'pass', valueSource: 'library', field: 'nghi.dang-ky.chung-cu#ngay' });
    expect(rows[0].hash).toMatch(/^sha256:/);
    expect(rows[1].outcome).toBe('block');
    expect(JSON.stringify(ev.after_data)).not.toContain(secret);
    const used = await usageRows('modules/nghi');
    expect(used.filter((u: any) => u.library_id === 'vn.ngay-nghi-le').reduce((s: number, u: any) => s + Number(u.count), 0)).toBe(2);
  });

  it('dryRun không đếm', async () => {
    resetLibraryUsage();
    const before = (await usageRows('modules/nghi')).reduce((s: number, u: any) => s + Number(u.count), 0);
    await run(act('nghi.dang-ky.thu-chay', async (c) => c.libraries.validate('vn.ngay-nghi-le', '2026-02-16')), { dryRun: true }).catch(() => undefined);
    const after = (await usageRows('modules/nghi')).reduce((s: number, u: any) => s + Number(u.count), 0);
    expect(after).toBe(before);
  });
});

describe('core.library.modules', () => {
  it('liệt kê module khai libraries[], số lượt theo nguồn, kết luận thời gian chạy', async () => {
    const r = await call(ctx, 'GET', '/api/v1/libraries/modules');
    expect(r.status).toBe(200);
    const mods = r.body.data.items as any[];
    const nghi = mods.find((m) => m.module === 'nghi');
    expect(nghi).toBeTruthy();
    expect(nghi.libraries[0]).toMatchObject({ id: 'vn.ngay-nghi-le', exists: true });
    expect(nghi.usage.total).toBeGreaterThanOrEqual(2);
    expect(['dat', 'co-dieu-kien', 'khong-dat']).toContain(nghi.verdict.status);
  });
});

describe('moduleVerdict (26 §9, phần thời gian chạy)', () => {
  const lib = (o: Partial<{ id: string; required: boolean; exists: boolean; enabled: boolean; deprecatedOnly: boolean; calls: number }> = {}) =>
    ({ id: 'vn.ngay-nghi-le', required: false, exists: true, enabled: true, deprecatedOnly: false, calls: 10, ...o });
  const base = { total: 1000, block: 5, deprecated: 0, undeclaredUse: [] as string[] };

  it('ĐẠT: khai đủ, có dùng, chặn < 1 %, không mã ngừng', () => {
    expect(moduleVerdict({ ...base, decls: [lib({ required: true })] })).toEqual({ status: 'dat', reasons: [] });
  });
  it('KHÔNG ĐẠT: thư viện bắt buộc không có / bị đơn vị tắt / chỉ còn mục ngừng', () => {
    expect(moduleVerdict({ ...base, decls: [lib({ required: true, exists: false })] }).status).toBe('khong-dat');
    expect(moduleVerdict({ ...base, decls: [lib({ required: true, enabled: false })] }).status).toBe('khong-dat');
    expect(moduleVerdict({ ...base, decls: [lib({ required: true, deprecatedOnly: true })] }).status).toBe('khong-dat');
  });
  it('ĐẠT có điều kiện: chặn ≥ 1 %, mã ngừng, chưa có lượt, dùng mà chưa khai, khai thư viện không có (không bắt buộc)', () => {
    expect(moduleVerdict({ ...base, block: 10, decls: [lib()] }).reasons.join()).toMatch(/tỉ lệ chặn 1\.0 %/);
    expect(moduleVerdict({ ...base, deprecated: 3, decls: [lib()] }).reasons.join()).toMatch(/3 lượt dùng mã ngừng/);
    expect(moduleVerdict({ ...base, total: 0, block: 0, decls: [lib({ calls: 0 })] }).status).toBe('co-dieu-kien');
    expect(moduleVerdict({ ...base, decls: [lib()], undeclaredUse: ['vn.can-cu-phap-ly'] }).reasons.join()).toMatch(/chưa khai libraries\[\]/);
    expect(moduleVerdict({ ...base, decls: [lib({ exists: false })] }).status).toBe('co-dieu-kien');
  });
  it('lỗi bắt buộc thắng điều kiện: có cả hai vẫn KHÔNG ĐẠT, liệt kê đủ lý do', () => {
    const v = moduleVerdict({ ...base, deprecated: 2, decls: [lib({ required: true, enabled: false })] });
    expect(v.status).toBe('khong-dat');
    expect(v.reasons).toHaveLength(2);
  });
});
