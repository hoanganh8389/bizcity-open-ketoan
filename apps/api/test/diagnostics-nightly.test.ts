// [2026-11-09 11:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-1 (S032-27): tự chẩn đoán L3 mỗi đêm — đồng hồ ngày ⇒ một lượt trigger schedule cho đơn vị; chạy lại không thêm
/**
 * Lịch tự chẩn đoán mỗi đêm (subscriber core.diagnostics-nightly, bizcity.clock.daily 01:00 giờ VN).
 * Sáng ra thẻ Việc hôm nay ở Bàn làm việc kế toán (HT08) đọc lượt này thay vì chạy lại.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { dispatchOnce, tickClock } from '../src/core/events.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx?.app.close();
});

describe('Tự chẩn đoán mỗi đêm', () => {
  it('bizcity.clock.daily ⇒ một lượt L3 trigger schedule, actor system:nightly, đủ kết quả từng kiểm; cùng ngày đồng hồ không thêm', async () => {
    const at = new Date('2027-02-09T19:10:00Z'); // 02:10 ngày 10/02/2027 giờ VN
    await tickClock(at, { tenantIds: [tenantId] });
    for (let i = 0; i < 30; i++) {
      await dispatchOnce();
      const d = await db.selectFrom('event_deliveries').select('status').where('tenant_id', '=', tenantId).where('consumer', '=', 'core.diagnostics-nightly').execute();
      if (d.length && d.every((x) => x.status !== 'pending')) break;
    }
    const delivered = await db.selectFrom('event_deliveries').select('status').where('tenant_id', '=', tenantId).where('consumer', '=', 'core.diagnostics-nightly').execute();
    expect(delivered.map((x) => x.status)).toEqual(['done']);
    const runs = await db.selectFrom('diagnostic_runs').select(['layer', 'trigger', 'actor', 'checks']).where('tenant_id', '=', tenantId).where('trigger', '=', 'schedule').execute();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ layer: 'L3', trigger: 'schedule', actor: 'system:nightly' });
    const checks = runs[0]!.checks as { code: string }[];
    expect(checks.map((c) => c.code)).toContain('TRANSIT_NONZERO');
    expect(await tickClock(at, { tenantIds: [tenantId] })).toBe(0);
  });
});
