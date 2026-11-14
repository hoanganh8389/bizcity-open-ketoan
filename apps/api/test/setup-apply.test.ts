// [2026-11-14 05:53 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4 (B2, chữ chốt PHASE-036 · 00 §11): máy chủ chạy gói mẫu — T036-2, T036-3, chạy lại không nhân đôi
/**
 * core.setup.presets / plan / run + POST /api/v1/setup/presets/:id/apply. Dữ liệu trong test là giả lập (presets/thuong-mai-ban-le).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const PRESET = 'thuong-mai-ban-le';
const opened: TestCtx[] = [];
async function fresh(): Promise<{ ctx: TestCtx; id: string }> {
  const ctx = await setupTenant();
  opened.push(ctx);
  const id = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  return { ctx, id };
}
afterAll(async () => { for (const c of opened) await c.app.close(); });

const apply = (c: TestCtx, key = `ap-${Math.random()}`) => call(c, 'POST', `/api/v1/setup/presets/${PRESET}/apply`, {}, { 'idempotency-key': key });
async function waitRun(c: TestCtx, runId: string) {
  for (let i = 0; i < 200; i++) {
    const r = await call(c, 'GET', `/api/v1/setup/runs/${runId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    if (r.body.data.status !== 'running') return r.body.data as { status: string; steps: { key: string; written: number; skipped: number; failed: number; firstError: unknown }[] };
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('lần chạy không xong');
}
const counts = async (t: string) => {
  const r = await sql<{ ev: number; le: number; br: number; pa: number; pr: number; sr: number }>`SELECT
    (SELECT count(*)::int FROM accounting_events WHERE tenant_id = ${t}) AS ev, (SELECT count(*)::int FROM ledger_entries WHERE tenant_id = ${t}) AS le,
    (SELECT count(*)::int FROM branches WHERE tenant_id = ${t}) AS br, (SELECT count(*)::int FROM partners WHERE tenant_id = ${t}) AS pa,
    (SELECT count(*)::int FROM products WHERE tenant_id = ${t}) AS pr, (SELECT count(*)::int FROM sample_runs WHERE tenant_id = ${t}) AS sr`.execute(db);
  return r.rows[0]!;
};
async function viewerOf(c: TestCtx): Promise<TestCtx> {
  const email = `xem${Date.now()}@setupapply.local`;
  const r = await call(c, 'POST', '/api/v1/users', { email, fullName: 'Người xem', role: 'viewer', password: 'Pass@12345' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const login = await c.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: c.tenantCode, email, password: 'Pass@12345' } });
  return { ...c, token: login.json().data.token };
}

describe('Máy chủ chạy gói mẫu (core.setup.*)', () => {
  it('danh sách gói có thuong-mai-ban-le; xem trước đếm đúng và không ghi gì', async () => {
    const t = await fresh();
    const list = await call(t.ctx, 'GET', '/api/v1/setup/presets');
    expect(list.status).toBe(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(PRESET);
    const before = await counts(t.id);
    const plan = await call(t.ctx, 'GET', `/api/v1/setup/presets/${PRESET}/plan`);
    expect(plan.status, JSON.stringify(plan.body)).toBe(200);
    expect(plan.body.data).toMatchObject({ allowed: true, empty: true, previousRun: null, missingCapabilities: [] });
    expect(plan.body.data.blocks.find((b: { key: string }) => b.key === 'documents')).toMatchObject({ total: 3, existing: 0, toAdd: 3 });
    expect(await counts(t.id)).toEqual(before);
    const nosample = await call(t.ctx, 'GET', `/api/v1/setup/presets/${PRESET}/plan?sample=0`);
    expect(nosample.body.data.blocks.map((b: { key: string }) => b.key)).toEqual(['settings']);
  });

  it('đơn vị trắng → chạy xong, chứng từ mẫu vào sổ; chạy lại → 0 ghi; gửi lại cùng khoá → cùng lần chạy', async () => {
    const t = await fresh();
    const a = await apply(t.ctx, 'k-1');
    expect(a.status, JSON.stringify(a.body)).toBe(202);
    const run1 = await waitRun(t.ctx, a.body.data.runId);
    expect(run1.status).toBe('done');
    expect(run1.steps.every((s) => s.failed === 0), JSON.stringify(run1.steps)).toBe(true);
    expect(run1.steps.find((s) => s.key === 'documents')).toMatchObject({ written: 3, skipped: 0 });
    const c1 = await counts(t.id);
    expect(c1.le).toBeGreaterThan(0);
    const posted = await sql<{ status: string }>`SELECT status FROM accounting_events WHERE tenant_id = ${t.id} AND doc_key LIKE ${'preset:' + PRESET + ':%'}`.execute(db);
    expect(posted.rows.map((r) => r.status)).toEqual(['posted', 'posted', 'posted']);

    const same = await apply(t.ctx, 'k-1');
    expect(same.body.data).toMatchObject({ runId: a.body.data.runId, fresh: false });

    const b = await apply(t.ctx, 'k-2');
    expect(b.status, JSON.stringify(b.body)).toBe(202);
    const run2 = await waitRun(t.ctx, b.body.data.runId);
    expect(run2.status).toBe('done');
    expect(run2.steps.reduce((n, s) => n + s.written, 0)).toBe(0);
    expect(run2.steps.find((s) => s.key === 'settings')).toMatchObject({ written: 0, skipped: 1 });
    const c2 = await counts(t.id);
    expect({ ...c2, sr: 0 }).toEqual({ ...c1, sr: 0 });

    const st = await call(t.ctx, 'GET', '/api/v1/setup/status');
    expect(st.body.data.empty).toBe(false);
    expect(st.body.data.runs).toMatchObject([{ presetId: PRESET, status: 'done' }]);
  });

  it('T036-2: đơn vị có phiếu mua nháp → SETUP_NOT_EMPTY, không ghi gì', async () => {
    const t = await fresh();
    await sql`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, created_by)
      VALUES (${t.id}, 'receipt', 'draft', 'PM-NHAP-9', '2026-10-12', 'CN01', 'NCC-GL', 1000, 'test')`.execute(db);
    const before = await counts(t.id);
    const plan = await call(t.ctx, 'GET', `/api/v1/setup/presets/${PRESET}/plan`);
    expect(plan.body.data).toMatchObject({ allowed: false, empty: false });
    const a = await apply(t.ctx);
    expect(a.status).toBe(409);
    expect(a.body.error.details.reason).toBe('SETUP_NOT_EMPTY');
    expect(await counts(t.id)).toEqual(before);
  });

  it('T036-3: hai lệnh cùng lúc → một chạy, lệnh kia SETUP_RUNNING; không nhân đôi', async () => {
    const t = await fresh();
    const [x, y] = await Promise.all([apply(t.ctx), apply(t.ctx)]);
    const st = [x.status, y.status].sort();
    expect(st, JSON.stringify([x.body, y.body])).toEqual([202, 409]);
    const won = x.status === 202 ? x : y;
    const lost = x.status === 202 ? y : x;
    expect(lost.body.error.details.reason).toBe('SETUP_RUNNING');
    expect((await waitRun(t.ctx, won.body.data.runId)).status).toBe('done');
    expect((await counts(t.id)).sr).toBe(1);
  });

  it('người không có settings:write → 403 xem trước / nạp; vẫn đọc được danh sách gói', async () => {
    const t = await fresh();
    const v = await viewerOf(t.ctx);
    expect((await call(v, 'GET', `/api/v1/setup/presets/${PRESET}/plan`)).status).toBe(403);
    expect((await apply(v)).status).toBe(403);
    expect((await call(v, 'GET', '/api/v1/setup/presets')).status).toBe(200);
    expect((await counts(t.id)).sr).toBe(0);
  });

  it('thiếu Idempotency-Key → 400; gói lạ → 404', async () => {
    const t = await fresh();
    const noKey = await t.ctx.app.inject({ method: 'POST', url: `/api/v1/setup/presets/${PRESET}/apply`, headers: { authorization: `Bearer ${t.ctx.token}` }, payload: {} });
    expect(noKey.statusCode).toBe(400);
    expect((await call(t.ctx, 'GET', '/api/v1/setup/presets/khong-co/plan')).status).toBe(404);
  });

  it('lần chạy mất nhịp sống quá 5 phút → báo failed, cho chạy lại', async () => {
    const t = await fresh();
    const r = await sql<{ id: string }>`INSERT INTO sample_runs (tenant_id, preset_id, preset_version, first_run, steps, idempotency_key, started_by, heartbeat_at)
      VALUES (${t.id}, ${PRESET}, '1.0.0', true, '[]'::jsonb, 'cu-1', 'test', now() - interval '10 minutes') RETURNING id`.execute(db);
    const old = await call(t.ctx, 'GET', `/api/v1/setup/runs/${r.rows[0]!.id}`);
    expect(old.body.data).toMatchObject({ status: 'failed' });
    const a = await apply(t.ctx);
    expect(a.status, JSON.stringify(a.body)).toBe(202);
    expect((await waitRun(t.ctx, a.body.data.runId)).status).toBe('done');
    const row = await sql<{ status: string }>`SELECT status FROM sample_runs WHERE id = ${r.rows[0]!.id}`.execute(db);
    expect(row.rows[0]!.status).toBe('failed');
  });
});
