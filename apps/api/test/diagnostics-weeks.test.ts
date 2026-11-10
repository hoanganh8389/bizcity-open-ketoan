// [2026-11-11 01:05 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B4a (S032-31 phần xem): kết quả từng tuần từ lượt tự kiểm đã lưu
/**
 * GET /api/v1/system/diagnostics/weeks — gom lượt L3 cả sổ theo tuần ISO, tách theo tháng (PHASE-032 · 60 §9.1).
 * Ba lượt dựng sẵn (giờ VN):
 *   28/10 (T4, W44, tháng 10): A đạt, B cảnh báo 2 chỗ, C rỗng
 *   01/11 (CN, W44, tháng 11): A lỗi 1 chỗ, B cảnh báo 1 chỗ, C rỗng
 *   04/11 (T4, W45, tháng 11): A đạt, B cảnh báo 1 chỗ, D cảnh báo 3 chỗ
 * Một lượt có khoảng ngày (khoá kỳ) không được tính.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const chk = (code: string, level: string, count = 0) => ({ code, level, title: `Kiểm ${code}`, fix: 'x', examined: level === 'empty' ? 0 : 5, count, sample: [] });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const run = (at: string, checks: unknown[], scope: Record<string, string> = {}) => ({
    tenant_id: tenantId, layer: 'L3' as const, trigger: 'schedule' as const, scope: JSON.stringify(scope), summary: JSON.stringify({}), checks: JSON.stringify(checks),
    error_count: (checks as { level: string }[]).filter((c) => c.level === 'error').length, actor: 'system:nightly', created_at: new Date(at),
  });
  await db.insertInto('diagnostic_runs').values([
    run('2026-10-28T03:00:00Z', [chk('A', 'pass'), chk('B', 'warn', 2), chk('C', 'empty')]),
    run('2026-11-01T03:00:00Z', [chk('A', 'error', 1), chk('B', 'warn', 1), chk('C', 'empty')]),
    run('2026-11-02T03:00:00Z', [chk('Z', 'error', 9)], { from: '2026-10-01', to: '2026-10-31' }), // lượt khoá kỳ có khoảng ngày: không tính
    run('2026-11-04T03:00:00Z', [chk('A', 'pass'), chk('B', 'warn', 1), chk('D', 'warn', 3)]),
  ]).execute();
});
afterAll(async () => {
  await ctx?.app.close();
});

describe('Kết quả từng tuần (PHASE-032 B4a)', () => {
  it('tuần ISO tách theo tháng, mới nhất trước; kết quả lát = lượt cuối; việc mới / đã đóng; có từ ngày; việc cũ nhất', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/diagnostics/weeks');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const w = (res.body.data as { week: string; period: string }[]).filter((x) => ['2026-W44', '2026-W45'].includes(x.week));
    expect(w.map((x) => `${x.week}|${x.period}`)).toEqual(['2026-W45|2026-11', '2026-W44|2026-11', '2026-W44|2026-10']);
    const [w45, w44n, w44o] = w as never as Record<string, unknown>[];

    expect(w44o).toMatchObject({ from: '2026-10-26', to: '2026-10-31', runs: 1, days: 1, applicable: 2, passed: 1, errors: 0, opened: ['B'], closed: [], oldestDays: 0 });
    expect(w44n).toMatchObject({ from: '2026-11-01', to: '2026-11-01', runs: 1, applicable: 2, passed: 0, errors: 1, closed: [], oldestDays: 4 });
    expect((w44n!.opened as string[]).sort()).toEqual(['A']);
    expect(w45).toMatchObject({ from: '2026-11-02', to: '2026-11-08', runs: 1, applicable: 3, passed: 1, errors: 0, opened: ['D'], closed: ['A'], oldestDays: 7 });
    const open = Object.fromEntries((w45!.open as { code: string; since: string; count: number }[]).map((x) => [x.code, [x.since, x.count]]));
    expect(open).toEqual({ B: ['2026-10-28', 1], D: ['2026-11-04', 3] });
  });

  it('chỉ đọc theo quyền reports:read; weeks giới hạn số lát', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/diagnostics/weeks?weeks=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
