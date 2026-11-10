// [2026-11-10 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 (S034-7): hợp đồng GET /api/v1/system/engines — 13 bộ máy, mốc đọc bảng việc, mức tính từ mốc, không có đường ghi
/**
 * Thẻ Bộ máy (HT10) đọc GET /api/v1/system/engines. Test giữ:
 *   - 13 bộ máy E01..E13, đúng hợp đồng bizcity_engines@1; không bộ máy nào có trường trạng thái gõ tay;
 *   - mỗi mốc có trong bảng việc (title, column); `pct` = (xong 1 · chờ đủ tín hiệu ½) / số mốc, null khi không có mốc;
 *   - không có POST / PUT / PATCH (R-CONT-7).
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

describe('GET /api/v1/system/engines', () => {
  it('13 bộ máy E01..E13, không có trường trạng thái gõ tay', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/engines');
    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.contract).toBe('bizcity_engines@1');
    expect(b.boardLoaded).toBe(true);
    expect(b.engines.map((e: any) => e.id)).toEqual(Array.from({ length: 13 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`));
    for (const e of b.engines) expect(e).not.toHaveProperty('status');
  });

  it('mốc đọc từ bảng việc; mức tính từ mốc', async () => {
    const b = (await call(ctx, 'GET', '/api/v1/system/engines')).body.data;
    for (const e of b.engines) {
      for (const m of e.milestones) {
        expect(m.title, `${e.id} ${m.task}`).toBeTruthy();
        expect(m.column).not.toBe('unknown');
      }
      if (!e.milestones.length) { expect(e.pct).toBeNull(); continue; }
      const w = e.milestones.reduce((s: number, m: any) => s + (m.column === 'done' ? 1 : m.column === 'partial' ? 0.5 : 0), 0);
      expect(e.pct).toBe(Math.round((w / e.milestones.length) * 100));
      expect(e.done).toBe(e.milestones.filter((m: any) => m.column === 'done').length);
    }
  });

  it('không có đường ghi (R-CONT-7)', async () => {
    for (const m of ['POST', 'PUT', 'PATCH'] as const) {
      expect((await call(ctx, m, '/api/v1/system/engines', { pct: 100 })).status).toBe(404);
    }
  });
});
