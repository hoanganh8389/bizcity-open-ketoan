/**
 * Bảng điểm, chẩn đoán, sự kiện bể chờ (PHASE-021 W4, PHASES 2.20; ADR-0014 Q3; RULE-INTAKE-10/12):
 *   T021-13 bảng điểm: số khớp truy vấn đối chiếu; kế toán xem được, người xem không
 *   T021-14 INTAKE_OPEN_AGE (DG-INTAKE-1) cảnh báo khi có mục mở quá ngưỡng, đạt khi không
 *   T021-17 bizcity.intake.rejected / .resolved: chỉ mã và số, không nguyên văn; gửi trùng không phát lại
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let viewer = '';
let openId = '';
const send = (doc: Record<string, unknown>) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${ctx.token}` } });
const events = (type: string) => db.selectFrom('event_outbox').select(['subject', 'data']).where('tenant_id', '=', tenantId).where('type', '=', type).orderBy('seq').execute();

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'xem-bd@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).status).toBe(201);
  viewer = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem-bd@ketoan.local', password: 'Xem@12345' } })).json().data.token;
  // Bốn chứng từ: hai đạt lần đầu, một bị từ chối rồi nguồn sửa, một còn mở
  expect((await send(saleDoc({ docKey: 'bd:CN01:A', docNo: 'A' }))).statusCode).toBe(200);
  expect((await send(saleDoc({ docKey: 'bd:CN01:B', docNo: 'B', invoice: { no: '8880002', serial: 'C26TAA', form: '1', date: '2026-10-05' } }))).statusCode).toBe(200);
  expect((await send(saleDoc({ docKey: 'bd:CN01:C', docNo: 'C', docDate: '05/10/2026', invoice: { no: '8880003', serial: 'C26TAA', form: '1', date: '2026-10-05' } }))).statusCode).toBe(400);
  expect((await send(saleDoc({ docKey: 'bd:CN01:C', docNo: 'C', invoice: { no: '8880003', serial: 'C26TAA', form: '1', date: '2026-10-05' } }))).statusCode).toBe(200);
  const d = saleDoc({ docKey: 'bd:CN01:D', docNo: 'D', branchCode: 'KHONG-CO-CN', description: 'BI-MAT-BD-001' });
  const r = await send(d);
  expect(r.statusCode).toBe(400);
  openId = r.json().error.intake.id;
  await send(d); // gửi trùng: không phát rejected lần nữa
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Bảng điểm (T021-13)', () => {
  it('số khớp truy vấn đối chiếu (chứng từ gửi, đạt lần đầu, mục mở, đã đóng)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/intake/score?days=30', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode, res.body).toBe(200);
    const s = res.json().data;
    // Đối chiếu độc lập: docKey khác nhau của sự việc ∪ mục bể (không mục thử); đạt lần đầu = không có mục bể nào
    const ref = (await sql<{ sent: number; first: number }>`
      WITH k AS (SELECT doc_key AS k FROM accounting_events WHERE tenant_id = ${tenantId} UNION SELECT coalesce(doc_key, '#' || id) FROM intake_inbox WHERE tenant_id = ${tenantId} AND status <> 'trial')
      SELECT count(*)::int AS sent, count(*) FILTER (WHERE k NOT IN (SELECT coalesce(doc_key, '#' || id) FROM intake_inbox WHERE tenant_id = ${tenantId} AND status <> 'trial'))::int AS first FROM k`.execute(db)).rows[0]!;
    expect(s.totals).toMatchObject({ sent: ref.sent, firstPass: ref.first, open: 1, closed: 1, patchedAtInbox: 0 });
    expect(ref).toMatchObject({ sent: 4, first: 2 });
    expect(s.totals.firstPassRate).toBe(50);
    expect(s.totals.oldestOpenKey).toBe('bd:CN01:D');
    expect(s.topCodes.map((c: { code: string }) => c.code)).toEqual(expect.arrayContaining(['IN-MD-001', 'IN-SHAPE-003']));
    expect(s.byDocType.find((r: { key: string }) => r.key === 'sale')).toMatchObject({ sent: 4, firstPass: 2 });
    expect(s.byActor[0].label).toBeTruthy();
    expect(JSON.stringify(s)).not.toContain('BI-MAT-BD-001');
  });

  it('người xem (không documents:write) → 403', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/intake/score', headers: { authorization: `Bearer ${viewer}` } })).statusCode).toBe(403);
  });
});

describe('INTAKE_OPEN_AGE (T021-14)', () => {
  const check = async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/diagnostics', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json().data.checks as { code: string; level: string; count: number; sample: string[] }[]).find((c) => c.code === 'INTAKE_OPEN_AGE')!;
  };

  it('mục mở chưa quá ngưỡng → không cảnh báo; lùi 5 ngày → warn kèm docKey', async () => {
    expect((await check()).count).toBe(0);
    await db.updateTable('intake_inbox').set({ received_at: new Date(Date.now() - 5 * 86_400_000) }).where('id', '=', openId).execute();
    const c = await check();
    expect(c).toMatchObject({ level: 'warn', count: 1, sample: ['bd:CN01:D'] });
  });
});

describe('Sự kiện bể chờ (T021-17)', () => {
  it('rejected: một lần mỗi mục (gửi trùng không phát), chỉ mã + số, không nguyên văn', async () => {
    const rej = await events('bizcity.intake.rejected');
    expect(rej.map((e) => (e.data as { docKey: string }).docKey).sort()).toEqual(['bd:CN01:C', 'bd:CN01:D']);
    const d = rej.find((e) => (e.data as { docKey: string }).docKey === 'bd:CN01:D')!;
    expect(d.subject).toBe(`intake:${openId}`);
    expect(d.data).toMatchObject({ inboxId: openId, channel: 'api', codes: expect.arrayContaining(['IN-MD-001']), score: 0 });
    expect(Object.keys(d.data as object).sort()).toEqual(['appKey', 'channel', 'codes', 'docKey', 'docType', 'inboxId', 'score']);
    expect(JSON.stringify(rej)).not.toContain('BI-MAT-BD-001');
  });

  it('resolved: nguồn sửa → fixed_at_source kèm eventId', async () => {
    const res = await events('bizcity.intake.resolved');
    expect(res).toHaveLength(1);
    expect(res[0]!.data).toMatchObject({ docKey: 'bd:CN01:C', status: 'fixed_at_source', eventId: expect.any(String), patched: false });
  });
});
