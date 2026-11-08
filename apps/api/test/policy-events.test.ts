// [2026-11-08 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3b (S031-26, chữ chốt PHASE-031 · 00 §11): sự kiện bizcity.policy.published / .retired qua outbox
/**
 *   T031-EV-1  phát hành inline → đúng một `published`, data có định danh + băm; bản kế tiếp có `closes` đúng
 *   T031-EV-2  giao dịch huỷ → không có sự kiện
 *   T031-EV-3  lưu chính sách mua hàng (đường module) → `published`; xoá → `retired`
 *   T031-EV-4  ghi lặp cùng bản không phát đôi (dedupeKey)
 *   T031-EV-5  data không mang nội dung chính sách (params / content)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { registerPolicyVersion, retirePolicy } from '@bizcity/platform/core/policies';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const REASON = 'Chiến dịch thử nghiệm';
const promo = (over: Record<string, unknown> = {}) => ({ buy: { sku: 'A', qty: 2 }, get: { sku: 'B', qty: 1 }, repeat: true, ...over });
const pub = (key: string, params: unknown, effectiveFrom: string) =>
  call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: 'sale.promo.buy_x_get_y@1', params, effectiveFrom, reason: REASON });
const events = async (type: string, subjectLike = '%') => (await sql<{ id: string; subject: string; actor_kind: string; source_module: string; data: Record<string, any> }>`
  SELECT id::text, subject, actor_kind, source_module, data FROM event_outbox WHERE tenant_id = ${tenantId} AND type = ${type} AND subject LIKE ${subjectLike} ORDER BY seq`.execute(db)).rows;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => { await ctx.app.close(); });

describe('T031-EV-1 · phát hành → published', () => {
  it('bản 1 không có closes; bản 2 đóng bản 1 ở ngày trước ngày áp', async () => {
    const r1 = await pub('EV-A', promo(), '2026-11-10');
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    const policyId = r1.body.data.policyId as string;
    const e1 = await events('bizcity.policy.published', `policy:${policyId}`);
    expect(e1).toHaveLength(1);
    expect(e1[0]).toMatchObject({ source_module: 'bizcity.platform', actor_kind: 'user' });
    expect(e1[0]!.data).toMatchObject({ policyId, policyKey: 'EV-A', version: 1, ruleContract: 'sale.promo.buy_x_get_y@1', effectiveFrom: '2026-11-10', closes: null });
    expect(e1[0]!.data.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const r2 = await pub('EV-A', promo({ get: { sku: 'B', qty: 2 } }), '2026-12-01');
    expect(r2.status, JSON.stringify(r2.body)).toBe(201);
    const e2 = await events('bizcity.policy.published', `policy:${policyId}`);
    expect(e2).toHaveLength(2);
    expect(e2[1]!.data).toMatchObject({ version: 2, effectiveFrom: '2026-12-01', closes: { version: 1, effectiveTo: '2026-11-30' } });
    expect(e2[1]!.data.contentHash).not.toBe(e2[0]!.data.contentHash);
  });
});

describe('T031-EV-2 · giao dịch huỷ không có sự kiện', () => {
  it('rollback sau khi ghi → không còn dòng outbox', async () => {
    await expect(db.transaction().execute(async (trx) => {
      await registerPolicyVersion(trx, {
        tenantId, policyKey: 'EV-ROLL', policyId: 'test:inline:EV-ROLL', version: 1, ownerModule: 'test', ruleContract: 'test.x@1', effectiveFrom: '2026-11-10',
        store: 'inline', content: { a: 1 }, actor: 'user:1',
      });
      throw new Error('huỷ giao dịch');
    })).rejects.toThrow('huỷ giao dịch');
    expect(await events('bizcity.policy.published', 'policy:test:inline:EV-ROLL')).toHaveLength(0);
    expect((await sql`SELECT 1 FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = 'test:inline:EV-ROLL'`.execute(db)).rows).toHaveLength(0);
  });
});

describe('T031-EV-3 · đường module (mua hàng) và ngừng chính sách', () => {
  it('lưu chính sách mua hàng → published; xoá → retired kèm các bản đã ngừng', async () => {
    const created = await call(ctx, 'POST', '/api/v1/purchase/policies', { code: 'EV-CK', kind: 'trade_discount', name: 'CK thử sự kiện', scope: {}, priority: 0, isActive: true, rule: { pct: 3 } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.id as number;
    const policyId = `mua-hang:purchase_policies:${id}`;
    const pubd = await events('bizcity.policy.published', `policy:${policyId}`);
    expect(pubd).toHaveLength(1);
    expect(pubd[0]!.data).toMatchObject({ policyKey: 'EV-CK', ownerModule: 'mua-hang', version: 1 });

    expect((await call(ctx, 'DELETE', `/api/v1/purchase/policies/${id}`)).status).toBe(200);
    const ret = await events('bizcity.policy.retired', `policy:${policyId}`);
    expect(ret).toHaveLength(1);
    expect(ret[0]!.data).toMatchObject({ policyId, retiredVersions: [1] });
  });
});

describe('T031-EV-4 · không phát đôi', () => {
  it('retire lần hai không còn bản published → không phát thêm; sự kiện published trùng bản bị dedupeKey chặn', async () => {
    const r = await pub('EV-D', promo(), '2026-11-10');
    const policyId = r.body.data.policyId as string;
    expect(await db.transaction().execute((trx) => retirePolicy(trx, tenantId, policyId, 'user:1'))).toBe(1);
    expect(await db.transaction().execute((trx) => retirePolicy(trx, tenantId, policyId, 'user:1'))).toBe(0);
    expect(await events('bizcity.policy.retired', `policy:${policyId}`)).toHaveLength(1);
    const dup = await sql`SELECT count(*)::int AS n FROM event_outbox WHERE tenant_id = ${tenantId} AND dedupe_key = ${`policy.published:${policyId}:1`}`.execute(db);
    expect((dup.rows[0] as { n: number }).n).toBe(1);
  });
});

describe('T031-EV-5 · data không mang nội dung', () => {
  it('không có params / content / scope trong data của hai loại sự kiện', async () => {
    const all = [...(await events('bizcity.policy.published')), ...(await events('bizcity.policy.retired'))];
    expect(all.length).toBeGreaterThan(3);
    for (const e of all) for (const k of ['params', 'content', 'scope', 'rule']) expect(Object.keys(e.data), `${e.subject}: ${k}`).not.toContain(k);
  });
});
