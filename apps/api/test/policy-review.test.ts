// [2026-11-08 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2c (S031-22, chữ chốt PHASE-031 · 00 §10): hàng việc "Chờ kế toán xem" + Đánh dấu đã xem
/**
 * Nhánh policy_review của bizcity_read.document_queue (migration 0083) và action core.queue.policy-review.ack.
 *   T031-Q-1  sự việc đã ghi sổ có phát hiện chính sách hiện ở hàng việc (cờ policy); pending chỉ một dòng; không phát hiện / đã huỷ thì không
 *   T031-Q-2  ack đóng việc; ack lặp trả kết quả cũ, không thêm dòng
 *   T031-Q-3  bản kiểm mới (checkedAt đổi) mở lại việc
 *   T031-Q-4  cô lập đơn vị; bảng bằng chứng chỉ thêm
 *   T031-Q-5  người chỉ có documents:read không ack được (403); sự việc không có policy_check → 409
 * Sự việc dựng bằng cửa nạp thật (policyRefs trỏ mã không có trong sổ → IN-POL-001), không chèn tay — sổ đơn vị test phải qua bất biến.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, other: TestCtx, viewer: TestCtx;
let tenantId = '', otherId = '', posted = '', none = '', foreign = '';

const BAD_REF = [{ key: 'KHONG-CO', version: 1, hash: '0'.repeat(64) }];
const ingest = async (c: TestCtx, key: string, over: Record<string, unknown> = {}) => {
  const r = await c.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: `pr:CN01:${key}`, docNo: `PR-${key}`, docDate: '2026-11-15', ...over }) as never, headers: { authorization: `Bearer ${c.token}` } });
  expect(r.statusCode, r.body).toBeLessThan(300);
};
const idOf = async (t: string, key: string): Promise<string> =>
  (await sql<{ id: string }>`SELECT id::text AS id FROM accounting_events WHERE tenant_id = ${t} AND doc_key = ${'pr:CN01:' + key}`.execute(db)).rows[0]!.id;
const queue = async (t: string) => (await sql<{ source: string; doc_no: string; status_group: string; flag: string | null }>`
  SELECT source, doc_no, status_group, flag FROM bizcity_read.document_queue WHERE tenant_id = ${t} AND doc_no LIKE 'PR-%' ORDER BY source, doc_no`.execute(db)).rows;
const check = (at: string) => JSON.stringify({ checkedAt: at, mode: 'advice', findings: [{ code: 'IN-POL-001', severity: 'warn', message: 'x' }], refs: [] });

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  otherId = (await db.selectFrom('tenants').select('id').where('code', '=', other.tenantCode).executeTakeFirstOrThrow()).id;
  const made = await call(ctx, 'POST', '/api/v1/users', { email: 'xem@polreview.local', fullName: 'xem', role: 'viewer', password: 'Pass@12345' });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const l = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem@polreview.local', password: 'Pass@12345' } });
  viewer = { ...ctx, token: l.json().data.token };

  // chế độ gợi ý (mặc định): ghi sổ ngay, policy_check có IN-POL-001 (tham chiếu không có trong sổ)
  await ingest(ctx, 'POSTED', { policyRefs: BAD_REF });
  await ingest(ctx, 'NONE');
  await ingest(other, 'FOREIGN', { policyRefs: BAD_REF });
  // chế độ strict: cùng phát hiện nhưng chờ duyệt (pending) -> chỉ một dòng ở hàng việc
  expect((await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.intake.policy_check', { value: 'strict', reason: 'Thử nhánh pending' })).status).toBe(200);
  await ingest(ctx, 'PENDING', { policyRefs: BAD_REF });
  posted = await idOf(tenantId, 'POSTED'); none = await idOf(tenantId, 'NONE'); foreign = await idOf(otherId, 'FOREIGN');
});
afterAll(async () => { await ctx.app.close(); await other.app.close(); });

const ack = (c: TestCtx, id: string, body: unknown = {}) => call(c, 'POST', `/api/v1/queue/policy-review/${id}/ack`, body);

describe('T031-Q-1 · nhánh policy_review', () => {
  it('chỉ sự việc đã ghi sổ có phát hiện; pending hiện một dòng ở nhánh accounting_event', async () => {
    const by = Object.fromEntries((await queue(tenantId)).map((r) => [`${r.source}:${r.doc_no}`, `${r.status_group}/${r.flag}`]));
    expect(by).toEqual({ 'policy_review:PR-POSTED': 'pending/policy', 'accounting_event:PR-PENDING': 'pending/held' });
  });
  it('hiện ở danh sách và việc của tôi (người có quyền ghi); người xem không thấy ở mine', async () => {
    const items = (await call(ctx, 'GET', '/api/v1/queue/items?source=policy_review&flag=policy')).body.data.items;
    expect(items.map((i: { docNo: string }) => i.docNo)).toEqual(['PR-POSTED']);
    const mine = (await call(ctx, 'GET', '/api/v1/queue/mine')).body.data;
    expect(mine.entries.some((e: { part: string; source: string }) => e.part === 'policy' && e.source === 'policy_review')).toBe(true);
    const vm = (await call(viewer, 'GET', '/api/v1/queue/mine')).body.data;
    expect(vm.entries.some((e: { part: string }) => e.part === 'policy')).toBe(false);
    const sum = (await call(ctx, 'GET', '/api/v1/queue/summary')).body.data;
    expect(sum.bySource.find((s: { source: string }) => s.source === 'policy_review')).toMatchObject({ total: 1, pending: 1, policy: 1 });
  });
});

describe('T031-Q-2 · Đánh dấu đã xem', () => {
  it('đóng việc; gọi lặp trả kết quả cũ và không thêm dòng', async () => {
    const r1 = await ack(ctx, posted, { note: 'đã xem, khuyến mại đúng' });
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    expect(r1.body.data).toMatchObject({ eventId: Number(posted), alreadyAcked: false });
    expect(r1.body.data.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await queue(tenantId)).map((r) => r.source)).toEqual(['accounting_event']);
    const r2 = await ack(ctx, posted);
    expect(r2.status).toBe(200);
    expect(r2.body.data).toMatchObject({ alreadyAcked: true, ackedAt: r1.body.data.ackedAt, ackedBy: r1.body.data.ackedBy });
    const n = await sql<{ n: number }>`SELECT count(*)::int AS n FROM policy_review_acks WHERE tenant_id = ${tenantId} AND event_id = ${posted}`.execute(db);
    expect(n.rows[0]!.n).toBe(1);
  });
});

describe('T031-Q-3 · kiểm lại mở lại việc', () => {
  it('checkedAt mới → hiện lại; xem bản mới là dòng bằng chứng thứ hai', async () => {
    await sql`UPDATE accounting_events SET policy_check = ${check('2026-11-09T02:00:00.000Z')}::jsonb WHERE id = ${posted}`.execute(db);
    expect((await queue(tenantId)).map((r) => r.source).sort()).toEqual(['accounting_event', 'policy_review']);
    const r = await ack(ctx, posted);
    expect(r.body.data).toMatchObject({ checkedAt: '2026-11-09T02:00:00.000Z', alreadyAcked: false });
    const n = await sql<{ n: number }>`SELECT count(*)::int AS n FROM policy_review_acks WHERE tenant_id = ${tenantId} AND event_id = ${posted}`.execute(db);
    expect(n.rows[0]!.n).toBe(2);
  });
});

describe('T031-Q-4 · cô lập đơn vị và bảng chỉ thêm', () => {
  it('đơn vị khác không thấy, không ack được sự việc của đơn vị này', async () => {
    expect((await queue(otherId)).map((r) => r.doc_no)).toEqual(['PR-FOREIGN']);
    expect((await ack(other, posted)).status).toBe(404);
    expect((await ack(ctx, foreign)).status).toBe(404);
  });
  it('policy_review_acks không sửa / xoá', async () => {
    await expect(sql`UPDATE policy_review_acks SET note = 'x' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`DELETE FROM policy_review_acks WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ thêm/);
  });
});

describe('T031-Q-5 · quyền và điều kiện', () => {
  it('documents:read không ack được', async () => {
    const r = await ack(viewer, posted);
    expect(r.status).toBe(403);
  });
  it('sự việc không có phát hiện / không có policy_check → 409', async () => {
    {
      const r = await ack(ctx, none);
      expect(r.status, JSON.stringify(r.body)).toBe(409);
      expect(JSON.stringify(r.body)).toContain('POLICY_REVIEW_NOT_OPEN');
    }
  });
});
