// [2026-11-17 11:21 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 (B5a, chữ chốt PHASE-036 · 00 §14): Công ty mẫu — tạo + nạp, không tạo lần hai, không trùng đơn vị thật, T036-4 chặn gửi ra ngoài
/**
 * Công ty mẫu (tenants.is_sample). Dữ liệu là gói mẫu hư cấu (presets/thuong-mai-ban-le). Mã đơn vị mẫu ngẫu nhiên mỗi lần chạy
 * (CSDL test dùng chung); điều kiện "CSDL vừa khởi tạo" của job cài kiểm ở sampleDecision.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction, runAction } from '@bizcity/platform/core/actions';
import { rolePermissions, type AuthContext } from '@bizcity/platform/core/auth';
import { createSampleTenant, sampleDecision } from '../src/modules/system/setup-run.js';
import { seed } from '../src/kernel/public.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const PRESET = 'thuong-mai-ban-le';
const PASSWORD = 'Mau@Thu12345';
let EMAIL = '';
const code = `mau${Date.now().toString(36)}`;
let ctx: TestCtx;
let sampleId = '';

beforeAll(async () => { ctx = await setupTenant(); }, 60_000);
afterAll(async () => { await ctx.app.close(); });

const login = async (tenantCode: string) => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode, email: EMAIL, password: PASSWORD } });
  return { status: r.statusCode, token: r.json().data?.token as string | undefined };
};
const authOf = (tenantId: string): AuthContext => ({ tenantId, actor: 'user:0', actorName: 'thử', kind: 'user', role: 'owner', roles: ['owner'], permissions: rolePermissions('owner') });

describe('Công ty mẫu (B5a)', () => {
  it('job cài chỉ tạo khi BIZCITY_SAMPLE là mã gói, CSDL vừa khởi tạo, chưa có đơn vị mẫu', () => {
    expect(sampleDecision(PRESET, 0, false).run).toBe(true);
    expect(sampleDecision(undefined, 0, false).run).toBe(false);
    expect(sampleDecision('off', 0, false).run).toBe(false);
    expect(sampleDecision(' ', 0, false).run).toBe(false);
    expect(sampleDecision(PRESET, 1, false)).toMatchObject({ run: false, why: expect.stringContaining('đã có đơn vị') });
    expect(sampleDecision(PRESET, 0, true).run).toBe(false);
    expect(sampleDecision('../x', 0, false).run).toBe(false);
  });

  it('tạo đơn vị mẫu is_sample + nạp gói xong; đăng nhập bằng cùng tài khoản quản trị; status báo isSample', async () => {
    const r = await createSampleTenant({ presetId: PRESET, code, adminPassword: PASSWORD }, seed);
    expect(r.created).toBe(true);
    expect(r.run?.status, JSON.stringify(r.run?.steps)).toBe('done');
    for (const s of r.run!.steps) expect(s.failed, `${s.key}: ${JSON.stringify(s.firstError)}`).toBe(0);
    sampleId = r.tenantId;
    EMAIL = r.adminEmail!;
    const t = await sql<{ is_sample: boolean }>`SELECT is_sample FROM tenants WHERE id = ${sampleId}`.execute(db);
    expect(t.rows[0]!.is_sample).toBe(true);
    const keys = await sql<{ n: string }>`SELECT count(*) AS n FROM api_keys WHERE tenant_id = ${sampleId}`.execute(db);
    expect(Number(keys.rows[0]!.n), 'đơn vị mẫu không có khoá API tích hợp').toBe(0);

    const l = await login(code);
    expect(l.status).toBe(200);
    const st = await call({ ...ctx, token: l.token! }, 'GET', '/api/v1/setup/status');
    expect(st.body.data).toMatchObject({ isSample: true, empty: false });
    const mine = await call(ctx, 'GET', '/api/v1/setup/status');
    expect(mine.body.data.isSample).toBe(false);
    expect(mine.body.data.sampleTenantCode).toEqual(expect.any(String));
  }, 300_000);

  it('gọi lần hai → không tạo thêm, không nạp lại', async () => {
    const r = await createSampleTenant({ presetId: PRESET, code, adminPassword: PASSWORD }, seed);
    expect(r).toMatchObject({ created: false, tenantId: sampleId, adminEmail: null, run: null });
    const runs = await sql<{ n: string }>`SELECT count(*) AS n FROM sample_runs WHERE tenant_id = ${sampleId}`.execute(db);
    expect(Number(runs.rows[0]!.n)).toBe(1);
  });

  it('mã trùng đơn vị thật → từ chối, không nạp mẫu vào đơn vị thật', async () => {
    await expect(createSampleTenant({ presetId: PRESET, code: ctx.tenantCode }, seed)).rejects.toMatchObject({ details: { reason: 'SETUP_NOT_EMPTY' } });
    const tid = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    const runs = await sql<{ n: string }>`SELECT count(*) AS n FROM sample_runs WHERE tenant_id = ${tid}`.execute(db);
    expect(Number(runs.rows[0]!.n)).toBe(0);
  });

  it('T036-4: đơn vị mẫu — action gửi ra ngoài và kết nối app bị chặn ở máy chủ; đơn vị thường không', async () => {
    let ran = 0;
    const ext = defineAction({
      id: 'test.sample.send', title: 'thử gửi ra ngoài', permission: 'catalog:read', effect: 'write', sideEffects: ['external'], idempotency: 'natural',
      input: z.object({}), output: z.object({ ok: z.boolean() }), expose: { mcp: false, ai: 'deny' },
      handler: async () => { ran++; return { ok: true }; },
    });
    await expect(runAction(ext, {}, { auth: authOf(sampleId), requestId: 'mau-1' })).rejects.toMatchObject({ details: { reason: 'SAMPLE_TENANT' } });
    expect(ran).toBe(0);
    const tid = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
    await runAction(ext, {}, { auth: authOf(tid), requestId: 'mau-2' });
    expect(ran).toBe(1);

    const l = await login(code);
    const inst = await call({ ...ctx, token: l.token! }, 'POST', '/api/v1/apps/thu-app/install', {}, { 'idempotency-key': 'mau-app-1' });
    expect(inst.status).toBe(409);
    expect(inst.body.error.details.reason).toBe('SAMPLE_TENANT');
    const normal = await call(ctx, 'POST', '/api/v1/apps/thu-app/install', {}, { 'idempotency-key': 'mau-app-2' });
    expect(normal.body.error?.details?.reason).not.toBe('SAMPLE_TENANT');
  });
});

// [2026-11-17 09:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 B5b (00 §15): tạo Công ty Mẫu theo yêu cầu — tắt 403; một đơn vị dù bấm trùng; đăng nhập bằng email / mật khẩu của người bấm
describe('Tạo Công ty Mẫu theo yêu cầu (B5b)', () => {
  const create = (key: string) => call(ctx, 'POST', '/api/v1/setup/sample-tenant', {}, { 'idempotency-key': key });

  it('chưa bật BIZCITY_SAMPLE_ON_DEMAND → 403', async () => {
    const old = process.env.BIZCITY_SAMPLE_ON_DEMAND;
    process.env.BIZCITY_SAMPLE_ON_DEMAND = '';
    try {
      expect((await create('od-off-1')).status).toBe(403);
      expect((await call(ctx, 'GET', '/api/v1/setup/status')).body.data.sampleOnDemand).toBe(false);
    } finally { process.env.BIZCITY_SAMPLE_ON_DEMAND = old; }
  });

  it('bật, bản cài chưa có mẫu → hai lệnh cùng lúc chỉ tạo một; đăng nhập bằng email / mật khẩu người bấm; gói nạp xong; lần sau SAMPLE_EXISTS', async () => {
    // CSDL test dùng chung: tạm gỡ cờ mẫu của đơn vị mẫu khác (ca trên tạo), trả lại sau
    const others = (await sql<{ id: string }>`UPDATE tenants SET is_sample = false WHERE is_sample RETURNING id`.execute(db)).rows.map((r) => r.id);
    const oldOn = process.env.BIZCITY_SAMPLE_ON_DEMAND;
    const oldCode = process.env.SAMPLE_TENANT_CODE;
    const odCode = `mau${Date.now().toString(36)}od`;
    process.env.BIZCITY_SAMPLE_ON_DEMAND = '1';
    process.env.SAMPLE_TENANT_CODE = odCode;
    try {
      expect((await call(ctx, 'GET', '/api/v1/setup/status')).body.data.sampleOnDemand).toBe(true);
      const [a, b] = await Promise.all([create('od-1'), create('od-2')]);
      expect([a.status, b.status].sort(), JSON.stringify([a.body, b.body])).toEqual([202, 409]);
      const won = a.status === 202 ? a : b;
      const lost = a.status === 202 ? b : a;
      expect(lost.body.error.details.reason).toBe('SAMPLE_EXISTS');
      expect(won.body.data.tenantCode).toBe(odCode);
      const n = await sql<{ n: string }>`SELECT count(*) AS n FROM tenants WHERE code = ${odCode} AND is_sample`.execute(db);
      expect(Number(n.rows[0]!.n)).toBe(1);

      const login = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: odCode, email: 'tester@ketoan.local', password: 'Test@123' } });
      expect(login.statusCode, 'đăng nhập Công ty Mẫu bằng chính email / mật khẩu người bấm').toBe(200);
      const mau = { ...ctx, token: login.json().data.token as string };
      let run: { status: string; steps: { failed: number }[] } | undefined;
      for (let i = 0; i < 1500; i++) {
        run = (await call(mau, 'GET', `/api/v1/setup/runs/${won.body.data.runId}`)).body.data;
        if (run?.status !== 'running') break;
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(run?.status).toBe('done');
      expect(run!.steps.every((s) => s.failed === 0)).toBe(true);
      expect((await call(mau, 'GET', '/api/v1/setup/status')).body.data.isSample).toBe(true);

      const again = await create('od-3');
      expect(again.status).toBe(409);
      expect(again.body.error.details.reason).toBe('SAMPLE_EXISTS');
      expect((await call(ctx, 'GET', '/api/v1/setup/status')).body.data).toMatchObject({ sampleOnDemand: false, sampleTenantCode: expect.any(String) });
    } finally {
      process.env.BIZCITY_SAMPLE_ON_DEMAND = oldOn;
      process.env.SAMPLE_TENANT_CODE = oldCode;
      if (others.length) await sql`UPDATE tenants SET is_sample = true WHERE id = ANY(${others})`.execute(db);
    }
  }, 300_000);
});
