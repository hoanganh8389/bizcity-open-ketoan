// [2026-11-11 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): hợp đồng GET /api/v1/system/dev-tools — chín công cụ, sáu tiêu chí, mức = tiêu chí đạt / 6, không có đường ghi
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); await closeDb(); });

describe('GET /api/v1/system/dev-tools', () => {
  it('chín công cụ DEV01..09, mỗi công cụ đủ T1..T6 có bằng chứng; mức = số tiêu chí đạt / 6', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/dev-tools');
    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.contract).toBe('bizcity_devtools@1');
    expect(Object.keys(b.criteria)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    expect(b.tools.map((t: any) => t.code).sort()).toEqual(['DEV01', 'DEV02', 'DEV03', 'DEV04', 'DEV05', 'DEV06', 'DEV07', 'DEV08', 'DEV09']);
    for (const t of b.tools) {
      for (const k of Object.keys(b.criteria)) {
        expect(['co', 'chua']).toContain(t.criteria[k].state);
        expect(t.criteria[k].ev, `${t.code} ${k}`).toBeTruthy();
      }
      const met = Object.values(t.criteria).filter((c: any) => c.state === 'co').length;
      expect(t.met).toBe(met);
      expect(t.pct).toBe(Math.round((met / 6) * 100));
    }
  });

  it('không có đường ghi (R-CONT-7)', async () => {
    for (const m of ['POST', 'PUT', 'PATCH'] as const) {
      expect((await call(ctx, m, '/api/v1/system/dev-tools', { met: 6 })).status).toBe(404);
    }
  });
});
