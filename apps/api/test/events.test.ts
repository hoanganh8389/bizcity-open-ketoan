/**
 * Sự kiện miền (bizcity_event@1, R-OUTBOX-1..7; PHASE-006, PHASES 3.4): outbox cùng giao dịch, Kernel phát sự kiện sổ / kỳ,
 * dispatcher giao ít nhất một lần nhưng không thực thi trùng (CONF-RUN-10), thử lại → dead, thứ tự trong một subject,
 * đồng hồ chống trùng, phát lại có bằng chứng, correlation_id từ X-Correlation-Id.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import type { AuthContext } from '../src/core/auth.js';
import { defineSubscriber, dispatchOnce, emitEvent, registerSubscribers, tickClock, type EventEnvelope } from '../src/core/events.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;

// Subscriber thử: ghi lại mỗi lần chạy; có thể bắt lỗi theo subject.
const seen: { id: string; type: string; subject: string }[] = [];
const failSubjects = new Set<string>();
const probe = defineSubscriber({
  id: 'test.probe',
  module: 'test',
  on: ['test.thing.happened', 'bizcity.clock.daily'],
  retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
  async handle(c, evt: EventEnvelope) {
    if (failSubjects.has(evt.subject)) throw new Error(`lỗi thử cho ${evt.subject}`);
    seen.push({ id: evt.id, type: evt.type, subject: evt.subject });
  },
});

const emit = (subject: string, extra: Record<string, unknown> = {}) =>
  db.transaction().execute((trx) => emitEvent(trx, { tenantId, type: 'test.thing.happened', subject, source: 'test', actor: { kind: 'system', id: 'test' }, data: extra }));
const delivery = (eventId: string) => db.selectFrom('event_deliveries').selectAll().where('consumer', '=', 'test.probe').where('event_id', '=', eventId).executeTakeFirstOrThrow();
const dispatch = () => dispatchOnce({ consumers: ['test.probe'], tenantId, limit: 1000 });
const outbox = (type: string) => db.selectFrom('event_outbox').selectAll().where('tenant_id', '=', tenantId).where('type', '=', type).orderBy('seq').execute();

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  auth = { tenantId, actor: 'system:events-test', actorName: 'Thử sự kiện', kind: 'user', role: null, permissions: new Set() };
  registerSubscribers([probe]);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Sự kiện miền', () => {
  it('ghi cùng giao dịch: giao dịch huỷ thì không có sự kiện, không có việc giao (R-OUTBOX-1)', async () => {
    await expect(db.transaction().execute(async (trx) => {
      await emitEvent(trx, { tenantId, type: 'test.thing.happened', subject: 'rollback', source: 'test', actor: { kind: 'system', id: 'test' } });
      throw new Error('huỷ');
    })).rejects.toThrow('huỷ');
    const rows = await db.selectFrom('event_outbox').select('id').where('tenant_id', '=', tenantId).where('subject', '=', 'rollback').execute();
    expect(rows).toEqual([]);
  });

  it('sự kiện không sửa được (trigger chặn UPDATE)', async () => {
    const id = (await emit('khong-sua'))!;
    await expect(sql`UPDATE event_outbox SET subject = 'x' WHERE id = ${id}::uuid`.execute(db)).rejects.toThrow(/không sửa được/);
  });

  it('Kernel phát bizcity.ledger.entry.posted khi ghi sổ, mang correlation_id từ X-Correlation-Id; huỷ → entry.reversed', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/v1/vouchers',
      headers: { authorization: `Bearer ${ctx.token}`, 'x-correlation-id': 'cell-hoi-thoai-0001' },
      payload: { docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-08', description: 'Thu thử sự kiện', counterparty: 'Khách lẻ', lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 250000, description: 'Thu' }] },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.headers['x-correlation-id']).toBe('cell-hoi-thoai-0001');
    const { docKey, entryIds } = res.json().data;
    const posted = (await outbox('bizcity.ledger.entry.posted')).filter((e) => e.subject === docKey);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ source_module: 'bizcity.kernel', correlation_id: 'cell-hoi-thoai-0001', actor_kind: 'user' });
    expect(posted[0]!.data).toMatchObject({ docKey, version: 1, entryIds });
    // Bằng chứng của cùng yêu cầu mang cùng mã tương quan.
    const audit = await db.selectFrom('audit_logs').select('correlation_id').where('tenant_id', '=', tenantId).where('object_id', '=', docKey).executeTakeFirstOrThrow();
    expect(audit.correlation_id).toBe('cell-hoi-thoai-0001');

    expect((await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey, reason: 'Thử huỷ' })).status).toBeLessThan(300);
    const reversed = (await outbox('bizcity.ledger.entry.reversed')).filter((e) => e.subject === docKey);
    expect(reversed).toHaveLength(1);
    expect(reversed[0]!.data).toMatchObject({ docKey, reversed: 1, reason: 'cancel' });
  });

  it('khoá / mở kỳ phát bizcity.period.locked / unlocked, subject period:<yyyy-mm>', async () => {
    const period = { year: 2026, month: 3 };
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN01', docType: 'payment', locked: true }] })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, reason: 'Mở để sửa', changes: [{ branchCode: 'CN01', docType: 'payment', locked: false }] })).status).toBe(200);
    const locked = await outbox('bizcity.period.locked');
    const unlocked = await outbox('bizcity.period.unlocked');
    expect(locked.at(-1)).toMatchObject({ subject: 'period:2026-03', data: { year: 2026, month: 3, locks: [{ branchCode: 'CN01', docType: 'payment' }] } });
    expect(unlocked.at(-1)).toMatchObject({ subject: 'period:2026-03' });
  });

  it('dispatcher giao một lần; giao lại sự kiện đã xử lý không chạy handler lần hai (CONF-RUN-10)', async () => {
    const id = (await emit('giao-mot-lan'))!;
    await dispatch();
    expect(seen.filter((s) => s.id === id)).toHaveLength(1);
    expect(await delivery(id)).toMatchObject({ status: 'done', attempts: 1 });
    // Mô phỏng giao lại (vd tiến trình chết sau khi xử lý, trước khi đánh dấu): đặt lại việc giao, giữ dấu đã xử lý.
    await db.updateTable('event_deliveries').set({ status: 'pending' }).where('consumer', '=', 'test.probe').where('event_id', '=', id).execute();
    const r = await dispatch();
    expect(r.duplicate).toBeGreaterThanOrEqual(1);
    expect(seen.filter((s) => s.id === id)).toHaveLength(1);
    expect(await delivery(id)).toMatchObject({ status: 'done' });
  });

  it('lỗi thì thử lại; hết lượt → dead, hiện ở tự chẩn đoán EVENT_DEAD; sự kiện sau cùng subject chờ, subject khác vẫn giao', async () => {
    failSubjects.add('hong');
    const bad = (await emit('hong'))!;
    const after = (await emit('hong'))!;
    const other = (await emit('lanh'))!;
    await dispatch();
    expect(await delivery(bad)).toMatchObject({ status: 'pending', attempts: 1, last_error: 'lỗi thử cho hong' });
    expect(await delivery(after)).toMatchObject({ status: 'pending', attempts: 0 }); // giữ thứ tự trong subject
    expect(seen.some((s) => s.id === other)).toBe(true);
    await dispatch();
    expect(await delivery(bad)).toMatchObject({ status: 'dead', attempts: 2 });
    const report = await runDiagnostics({ tenantId }, { layer: 'L3', codes: ['EVENT_DEAD'] });
    expect(report.checks.find((c) => c.code === 'EVENT_DEAD')).toMatchObject({ count: 1 });
    failSubjects.delete('hong');
    await dispatch(); // sự kiện sau không còn bị chặn khi sự kiện trước đã dead
    expect(seen.some((s) => s.id === after)).toBe(true);
  });

  it('phát lại qua core.events.replay: xử lý lại, có bằng chứng ai phát lại (R-OUTBOX-7)', async () => {
    const id = (await emit('phat-lai'))!;
    await dispatch();
    const from = new Date(Date.now() - 60_000).toISOString();
    const res = await call(ctx, 'POST', '/api/v1/system/events/replay', { consumer: 'test.probe', from, subject: 'phat-lai' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.replayed).toBe(1);
    expect(res.body.meta.receipt.evidenceId).toMatch(/^\d+$/);
    await dispatch();
    expect(seen.filter((s) => s.id === id)).toHaveLength(2);
    const status = await call(ctx, 'GET', '/api/v1/system/events');
    expect(status.body.data.subscribers.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining(['test.probe', 'catalog.notify-sales', 'core.events-retention']));
    expect(status.body.data.consumers.find((c: { consumer: string }) => c.consumer === 'test.probe')).toMatchObject({ dead: 1 });
  });

  it('đồng hồ: bizcity.clock.daily một lần mỗi ngày mỗi đơn vị (chống trùng), sau 01:00 giờ VN', async () => {
    const at = new Date('2026-10-30T02:30:00Z'); // 09:30 giờ VN
    await tickClock(at, { tenantIds: [tenantId] });
    await tickClock(at, { tenantIds: [tenantId] });
    const clock = (await outbox('bizcity.clock.daily')).filter((e) => (e.data as { date: string }).date === '2026-10-30');
    expect(clock).toHaveLength(1);
    expect(clock[0]).toMatchObject({ subject: 'clock', actor_kind: 'system', dedupe_key: 'bizcity.clock.daily:2026-10-30' });
    expect(await tickClock(new Date('2026-10-30T17:30:00Z'), { tenantIds: [tenantId] })).toBe(0); // 00:30 ngày 31 giờ VN: chưa tới 01:00
  });

  it('danh mục đổi → bizcity.masterdata.catalog.changed (gom theo khung 5 giây), có việc giao cho catalog.notify-sales', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/products/SK-EVT-1', { name: 'Hàng thử sự kiện', unit: 'Cái' })).status).toBeLessThan(300);
    const ev = (await outbox('bizcity.masterdata.catalog.changed')).at(-1)!;
    expect(ev).toMatchObject({ subject: 'catalog', source_module: 'bizcity.platform' });
    const d = await db.selectFrom('event_deliveries').select(['consumer', 'status']).where('event_id', '=', ev.id).execute();
    expect(d).toEqual([{ consumer: 'catalog.notify-sales', status: 'pending' }]);
  });
});
