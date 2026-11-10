// [2026-11-10 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a (S034-5): hợp đồng GET /api/v1/system/gates — cổng theo thứ tự, mã lấy từ sổ đăng ký trong mã, kết quả lượt chẩn đoán của đúng đơn vị, không có đường ghi
/**
 * Thẻ Cổng & bộ kiểm (HT10) đọc GET /api/v1/system/gates. Test giữ:
 *   - chín nhóm cổng đúng thứ tự (PHASE-034 · 00 §3.1); năm nhóm chạy được có mã, bốn nhóm giữ chỗ không có mã và nói bước làm;
 *   - mã lấy từ sổ đăng ký: cổng B có IN-*, Commit Guard chỉ IN-GUARD-001, chẩn đoán có đủ mã của listDiagnostics();
 *   - sau một lượt chẩn đoán L3, mã L3 có `last`; lượt của đơn vị khác không lộ sang (cô lập đơn vị);
 *   - không có POST / PUT / PATCH (R-CONT-7).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { listDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
  await closeDb();
});

const get = async (c: TestCtx) => {
  const res = await call(c, 'GET', '/api/v1/system/gates');
  expect(res.status).toBe(200);
  return res.body.data;
};

describe('GET /api/v1/system/gates', () => {
  it('chín nhóm cổng đúng thứ tự; nhóm chạy được có mã, nhóm giữ chỗ nói bước làm', async () => {
    const b = await get(ctx);
    expect(b.contract).toBe('bizcity_gates@1');
    expect(b.groups.map((g: any) => g.key)).toEqual(['A', 'B', 'guard', 'L', 'diag', 'C', 'lock', 'trigger', 'ci']);
    for (const g of b.groups) {
      if (g.live) expect(g.codes.length, g.key).toBeGreaterThan(0);
      else { expect(g.codes, g.key).toEqual([]); expect(g.next, g.key).toBeTruthy(); }
    }
  });

  it('mã lấy từ sổ đăng ký trong mã: B có IN-*, Guard chỉ IN-GUARD-001, chẩn đoán đủ listDiagnostics()', async () => {
    const b = await get(ctx);
    const by = (k: string) => b.groups.find((g: any) => g.key === k).codes.map((c: any) => c.code);
    expect(by('B').some((c: string) => c.startsWith('IN-'))).toBe(true);
    expect(by('B')).not.toContain('IN-GUARD-001');
    expect(by('guard')).toEqual(['IN-GUARD-001']);
    expect(new Set(by('diag'))).toEqual(new Set(listDiagnostics().map((c) => c.code)));
    const diag = b.groups.find((g: any) => g.key === 'diag').codes;
    for (const c of diag) {
      expect(typeof c.hasFix).toBe('boolean');
      expect(typeof c.hasRemedy).toBe('boolean');
    }
  });

  it('kết quả lượt chẩn đoán gần nhất thuộc đúng đơn vị', async () => {
    expect((await get(other)).lastRun).toBeNull();
    const run = await call(ctx, 'GET', '/api/v1/system/diagnostics?layer=L3');
    expect(run.status).toBe(200);
    const b = await get(ctx);
    expect(b.lastRun).not.toBeNull();
    const l3 = b.groups.find((g: any) => g.key === 'diag').codes.filter((c: any) => c.step === 'L3');
    expect(l3.some((c: any) => c.last && typeof c.last.count === 'number')).toBe(true);
    expect((await get(other)).lastRun).toBeNull();
  });

  it('không có đường ghi (R-CONT-7)', async () => {
    for (const m of ['POST', 'PUT', 'PATCH'] as const) {
      expect((await call(ctx, m, '/api/v1/system/gates', { codes: [] })).status).toBe(404);
    }
  });
});
