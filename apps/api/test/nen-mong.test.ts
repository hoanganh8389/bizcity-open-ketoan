/**
 * PHASE-029 E1 (S029-30, ADR-0028): bản đồ nền móng chỉ đọc — sáu năng lực lõi, 17 trụ cột, 13 ECP; không có đường ghi "đạt"
 * (R-ECP-SCORE-3). Khớp repo do SC-CORE-1 kiểm; test này giữ hợp đồng API.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('GET /api/v1/system/foundations', () => {
  it('trả sáu năng lực lõi, 17 trụ cột thuộc bốn nhóm, đủ ECP-01..13', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/foundations');
    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.contract).toBe('bizcity_foundations@1');
    expect(b.cores.map((c: any) => c.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    expect(b.pillars).toHaveLength(17);
    expect(new Set(b.pillars.map((p: any) => p.group))).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(b.ecp.map((e: any) => e.id)).toHaveLength(13);
    expect(b.lean.map((l: any) => l.id)).toEqual(['LEAN-1', 'LEAN-2', 'LEAN-3', 'LEAN-4', 'LEAN-5', 'LEAN-6', 'LEAN-7']);
  });

  it('mức "đạt" không đi kèm tín hiệu "chưa có" (R-ECP-SCORE-1)', async () => {
    const b = (await call(ctx, 'GET', '/api/v1/system/foundations')).body.data;
    for (const p of b.pillars) if (p.status === 'dat') expect(p.signals.some((s: any) => s.state === 'chua')).toBe(false);
  });

  it('không có đường ghi: POST / PUT / PATCH không tồn tại (R-ECP-SCORE-3)', async () => {
    for (const m of ['POST', 'PUT', 'PATCH'] as const) {
      expect((await call(ctx, m, '/api/v1/system/foundations', { status: 'dat' })).status).toBe(404);
    }
  });

  it('cần đăng nhập', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/foundations' });
    expect(res.statusCode).toBe(401);
  });
});
