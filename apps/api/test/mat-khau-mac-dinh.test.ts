// [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3 + Q027-5: không có mật khẩu viết sẵn trong mã — T027-SEC-1..4 (thiết kế: docs/rules/RULE-QUALITY-GATE.md SC-SEC-5)
/**
 *   T027-SEC-1  mật khẩu công cụ: chưa đặt biến → công cụ tắt, câu lỗi nói cách bật; sai → từ chối; đúng → qua
 *   T027-SEC-2  API nạp dữ liệu tình huống khi chưa đặt biến: 403 "đang tắt", không nạp gì; mật khẩu cũ viết trong mã không còn mở được
 *   T027-SEC-3  mật khẩu quản trị ban đầu: bỏ trống → tự sinh 16 ký tự đủ loại, mỗi lần khác nhau; có biến → dùng đúng biến
 *   T027-SEC-4  mã các lớp không còn hai mật khẩu đã công bố ("Admin@123", "Thuy!@#")
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkToolPassword, toolPasswordSet } from '@bizcity/platform/core/security/tool-password';
import { initialAdminPassword } from '@bizcity/kernel/db/seed';
import { call, setupTenant, type TestCtx } from './helpers.js';

const ROOT = path.resolve(__dirname, '../../..');
const SAVED = process.env.PURCHASE_SEED_PASSWORD;
let ctx: TestCtx;

beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });
afterEach(() => { process.env.PURCHASE_SEED_PASSWORD = SAVED; });

describe('T027-SEC — không có mật khẩu viết sẵn trong mã', () => {
  it('T027-SEC-1 mật khẩu công cụ: tắt khi chưa đặt biến, sai thì từ chối, đúng thì qua', () => {
    delete process.env.PURCHASE_SEED_PASSWORD;
    expect(toolPasswordSet()).toBe(false);
    expect(() => checkToolPassword('bat-ky', 'nạp dữ liệu')).toThrow(/nạp dữ liệu đang tắt.*PURCHASE_SEED_PASSWORD/);
    process.env.PURCHASE_SEED_PASSWORD = 'mat-khau-cong-cu-thu';
    expect(toolPasswordSet()).toBe(true);
    expect(() => checkToolPassword('sai', 'nạp dữ liệu')).toThrow(/Sai mật khẩu nạp dữ liệu/);
    expect(() => checkToolPassword(undefined)).toThrow(/Sai mật khẩu/);
    expect(() => checkToolPassword('mat-khau-cong-cu-thu')).not.toThrow();
  });

  it('T027-SEC-2 API nạp dữ liệu tình huống: chưa đặt biến → 403 "đang tắt"; mật khẩu cũ trong mã không mở được', async () => {
    delete process.env.PURCHASE_SEED_PASSWORD;
    const off = await call(ctx, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(off.status).toBe(403);
    expect(off.body.error.message).toMatch(/đang tắt/);
    process.env.PURCHASE_SEED_PASSWORD = 'mat-khau-khac';
    const wrong = await call(ctx, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.message).toMatch(/Sai mật khẩu/);
  });

  it('T027-SEC-3 mật khẩu quản trị ban đầu: tự sinh khi bỏ trống, dùng biến khi có', () => {
    const a = initialAdminPassword({});
    const b = initialAdminPassword({ SEED_ADMIN_PASSWORD: '   ' });
    for (const p of [a, b]) {
      expect(p.generated).toBe(true);
      expect(p.password).toHaveLength(16);
      expect(p.password).toMatch(/[A-Z]/);
      expect(p.password).toMatch(/[a-z]/);
      expect(p.password).toMatch(/\d/);
      expect(p.password).toMatch(/[^A-Za-z0-9]/);
    }
    expect(a.password).not.toBe(b.password);
    expect(initialAdminPassword({ SEED_ADMIN_PASSWORD: 'Rieng@2026' })).toEqual({ password: 'Rieng@2026', generated: false });
  });

  it('T027-SEC-4 mã các lớp không còn mật khẩu đã công bố', () => {
    const roots = ['apps/api/src', 'packages/platform/src', 'packages/kernel/src', 'packages/module-sdk/src'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx|mjs|js)$/.test(n)) continue;
        const t = readFileSync(p, 'utf8');
        if (t.includes('Admin@123') || t.includes('Thuy!@#')) hits.push(path.relative(ROOT, p));
      }
    };
    for (const r of roots) walk(path.join(ROOT, r));
    expect(hits).toEqual([]);
  });
});
