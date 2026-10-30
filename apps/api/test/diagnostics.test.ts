/**
 * Tự chẩn đoán (PHASES 2.9, 2.10; RULE-SELF-DIAGNOSTICS): /system/health/ready (L1), /system/diagnostics (L3) + diagnostic_runs,
 * /system/capabilities, khoá kỳ bị chặn khi sổ trong kỳ có lỗi toàn vẹn (R-DIAG-4).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const byCode = (checks: { code: string }[], code: string) => checks.find((c) => c.code === code) as { code: string; level: string; examined: number; count: number; sample: string[] };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Tự chẩn đoán', () => {
  it('health/ready (L1): công khai, migration đủ, trigger bảo vệ sổ còn, CSDL ghi được', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/health/ready' });
    expect(res.statusCode, res.body).toBe(200);
    const data = res.json().data;
    expect(data.status).toBe('ready');
    for (const code of ['MIGRATIONS_PENDING', 'DB_WRITABLE', 'LEDGER_TRIGGERS']) expect(byCode(data.checks, code).level).toBe('pass');
    expect(byCode(data.checks, 'LEDGER_TRIGGERS').count).toBe(0);
  });

  it('diagnostics (L3): sổ đúng thì không có error; đếm số đã xét; lưu lượt chạy, xem lại được', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/diagnostics');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d.tenant).toBe(ctx.tenantCode);
    expect(d.summary.error).toBe(0);
    const balanced = byCode(d.checks, 'LEDGER_BALANCED');
    expect(balanced.level).toBe('pass');
    expect(balanced.examined).toBeGreaterThan(0);
    // Mỗi mã có ở lane diagnostics của bộ kiểm chuẩn (SC-DIAG-1) — ở đây chỉ kiểm đủ bộ L3 của Kernel.
    expect(d.checks.map((c: { code: string }) => c.code)).toEqual(expect.arrayContaining(['LEDGER_BALANCED', 'LEDGER_BALANCES_DAILY', 'LEDGER_REVERSED_ONCE', 'LEDGER_ORPHAN', 'EVENT_POSTED_VERSION']));

    const runs = await call(ctx, 'GET', '/api/v1/system/diagnostics/runs');
    expect(runs.body.data[0]).toMatchObject({ id: d.runId, layer: 'L3', trigger: 'manual', errorCount: 0 });
    const one = await call(ctx, 'GET', `/api/v1/system/diagnostics/runs/${d.runId}`);
    expect(byCode(one.body.data.checks, 'LEDGER_BALANCED').level).toBe('pass');
  });

  it('kỳ chưa có gì là "rỗng", không phải "đạt" (R-DIAG-7)', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/diagnostics?from=2031-01-01&to=2031-01-31');
    expect(byCode(res.body.data.checks, 'LEDGER_BALANCED')).toMatchObject({ level: 'empty', examined: 0 });
  });

  it('diagnostic_runs chỉ thêm: không sửa được dòng đã ghi', async () => {
    const run = await db.selectFrom('diagnostic_runs').select('id').where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    await expect(sql`UPDATE diagnostic_runs SET error_count = 99 WHERE id = ${run.id}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
  });

  it('capabilities: bảng năng lực Standard + mã chẩn đoán đã đăng ký; cần đăng nhập', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/system/capabilities' })).statusCode).toBe(401);
    const res = await call(ctx, 'GET', '/api/v1/system/capabilities');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.standard.name).toBe('bizcity_standard@1');
    expect(d.capabilities.find((c: { id: string }) => c.id === 'ledger.submit')).toMatchObject({ status: 'available' });
    expect(d.errorCodes.available).toContain('NOT_READY');
    expect(d.diagnostics.map((c: { code: string }) => c.code)).toEqual(expect.arrayContaining(['LEDGER_BALANCED', 'MIGRATIONS_PENDING']));
    expect(d.enabledModules).toContain('he-thong');
  });

  it('R-DIAG-4: sổ trong kỳ có lỗi toàn vẹn thì không khoá được kỳ, trừ khi ghi lý do chấp nhận', async () => {
    // Làm lệch posted_version của chứng từ bán tháng 10/2026 (không đụng sổ cái), trả lại ở cuối phép thử.
    const ev = await db.selectFrom('accounting_events').select(['id', 'posted_version']).where('tenant_id', '=', tenantId).where('doc_key', '=', 'pos:CN01:HD0001').executeTakeFirstOrThrow();
    await db.updateTable('accounting_events').set({ posted_version: null }).where('id', '=', ev.id).execute();
    try {
      const check = await call(ctx, 'GET', '/api/v1/periods/check?year=2026&month=10');
      expect(check.body.data.find((c: { key: string }) => c.key === 'integrity')).toMatchObject({ count: 1 });

      const blocked = await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 10 });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.details.diagnostics.errors[0]).toMatchObject({ code: 'EVENT_POSTED_VERSION', count: 1, sample: ['pos:CN01:HD0001'] });
      // Kỳ khác (không có lỗi) vẫn khoá bình thường; lưới khoá hàng loạt cũng bị chặn như vậy.
      expect((await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 9 })).status).toBe(200);
      expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { year: 2026, month: 10, changes: [{ branchCode: 'CN01', docType: 'sale', locked: true }] })).status).toBe(409);
      expect((await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 10, acceptDiagnostics: 'ngắn' })).status).toBe(409);

      const accepted = await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 10, acceptDiagnostics: 'Đã đối chiếu tay với chứng từ gốc, sửa ở kỳ sau' });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
      const events = await call(ctx, 'GET', '/api/v1/periods/lock-events?year=2026&month=10');
      expect(events.body.data[0].reason).toMatch(/^Chấp nhận lỗi chẩn đoán lượt #\d+ \(EVENT_POSTED_VERSION\): Đã đối chiếu tay/);
      const runs = await call(ctx, 'GET', '/api/v1/system/diagnostics/runs');
      expect(runs.body.data.filter((x: { trigger: string; errorCount: number }) => x.trigger === 'period-lock' && x.errorCount > 0).length).toBeGreaterThanOrEqual(3);
    } finally {
      await db.updateTable('accounting_events').set({ posted_version: ev.posted_version }).where('id', '=', ev.id).execute();
    }
  });
});
