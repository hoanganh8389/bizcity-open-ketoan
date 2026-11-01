// @bizcity-layer P events
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — số đo outbox: lượt giao theo subscriber (dispatchOnce), việc chờ / chết, tuổi chờ lâu nhất (collectOutboxMetrics)
/**
 * SỰ KIỆN MIỀN (bizcity_event@1, R-OUTBOX-1..7; PHASE-006, PHASES 3.4) — transactional outbox, chạy chỉ với PostgreSQL.
 *
 *   emitEvent(trx, …)     ghi event_outbox + một event_deliveries cho mỗi subscriber đang đăng ký loại đó — CÙNG giao dịch
 *                          với dữ liệu: giao dịch huỷ thì không có sự kiện (R-OUTBOX-1). Phản hồi trả sau commit (R-OUTBOX-2).
 *   dispatchOnce()        đọc việc giao đến hạn; mỗi việc một giao dịch: khoá dòng giao (SKIP LOCKED) → chèn (consumer, event_id)
 *                          vào event_consumptions → handler (cùng giao dịch) → đánh dấu done. Lỗi: huỷ cả giao dịch, ghi lần thử
 *                          ở giao dịch riêng, hẹn lại giãn nhịp luỹ thừa; quá số lần → dead (R-OUTBOX-3).
 *                          Giao lại một sự kiện đã xử lý → khoá trùng ở event_consumptions → bỏ qua (R-OUTBOX-4, AP-6).
 *                          Thứ tự: trong cùng (đơn vị, subject), consumer nhận theo seq; khác subject có thể song song (R-OUTBOX-5).
 *   tickClock()           bizcity.clock.hourly / bizcity.clock.daily (01:00 giờ VN) cho từng đơn vị, chỉ khi có subscriber; khoá
 *                          chống trùng theo giờ / ngày nên nhiều tiến trình cùng chạy vẫn phát một lần (STD-EVT-6).
 *   replayEvents()        đặt lại việc giao của một consumer trong khoảng thời gian / loại / subject (R-OUTBOX-7); người gọi
 *                          (action core.events.replay) ghi bằng chứng ai phát lại.
 *   startEventRuntime()   vòng dispatcher + đồng hồ trong tiến trình API (main.ts). Đây là chỗ hẹn giờ DUY NHẤT được phép
 *                          (SC-EVT-1 miễn tệp này); module dùng sự kiện đồng hồ, không setInterval riêng.
 *
 * Subscriber mới chỉ nhận sự kiện phát SAU khi nó được đăng ký (việc giao tạo lúc phát); sự kiện cũ thì replay.
 * Gửi ra ngoài (webhook, Cell) là subscriber: hiệu ứng ngoài CSDL phải kèm Idempotency-Key = event.id (STD-EVT-2, SC-EVT-2).
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { db, readWithTimeout, type Db } from '../db/client.js';
import { currentRequest, withRequestContext } from './request-context.js';
import { COLLECTOR_TIMEOUT_MS, metrics } from './metrics.js';

export type EventActorKind = 'user' | 'apikey' | 'ai' | 'system';

/** Phong bì sự kiện (bizcity_event@1 §3). */
export interface EventEnvelope<D = Record<string, unknown>> {
  id: string;
  type: string;
  version: number;
  tenantId: string;
  occurredAt: string;
  source: { module: string };
  subject: string;
  actor: { kind: EventActorKind; id: string };
  correlationId: string | null;
  causationId: string | null;
  data: D;
}

export interface EmitInput {
  tenantId: string;
  /** `<module>.<thực thể>.<việc ở quá khứ>`; sự kiện Core bắt đầu bằng `bizcity.`. */
  type: string;
  version?: number;
  /** Khoá thứ tự giao: docKey, `period:<yyyy-mm>`, `clock`… */
  subject: string;
  /** Chỉ mã và số; không dữ liệu cá nhân thô, không tài khoản kế toán. */
  data?: Record<string, unknown>;
  /** Module phát: `bizcity.kernel`, `bizcity.platform`, hoặc khoá module. */
  source: string;
  actor: { kind: EventActorKind; id: string };
  correlationId?: string | null;
  causationId?: string | null;
  /** Chống phát trùng trong một đơn vị (vd `bizcity.clock.daily:2026-10-30`): đã có thì không phát, trả null. */
  dedupeKey?: string;
}

export interface SubscriberContext {
  /** Giao dịch của lần giao này: mọi ghi CSDL của subscriber đi qua đây để cùng commit với dấu đã xử lý. */
  tx: Db;
  tenantId: string;
  /** Phát tiếp (cùng giao dịch); causationId = sự kiện đang xử lý, giữ correlationId của chuỗi. */
  emit(type: string, data: Record<string, unknown>, opts: { subject: string; version?: number; dedupeKey?: string }): Promise<string | null>;
}

export interface SubscriberDef {
  /** = consumer, ổn định (`<module>.<việc>`); đổi id = mất lịch sử đã xử lý. */
  id: string;
  /** Module sở hữu (khoá module, hoặc `bizcity.platform`). */
  module: string;
  on: string[];
  retry?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  handle(ctx: SubscriberContext, event: EventEnvelope): Promise<void>;
}

const TYPE_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){2,}$/;
const ID_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DEFAULT_RETRY = { maxAttempts: 8, baseDelayMs: 5_000, maxDelayMs: 3_600_000 };
/** Giữ outbox 90 ngày sau khi mọi việc giao xong (bizcity_event@1 §5). */
export const EVENT_RETENTION_DAYS = 90;
export const CLOCK_TZ = 'Asia/Ho_Chi_Minh';

const registry = new Map<string, SubscriberDef>();

export function defineSubscriber(def: SubscriberDef): SubscriberDef {
  if (!ID_RE.test(def.id)) throw new Error(`Subscriber id "${def.id}" phải dạng <module>.<việc>`);
  for (const t of def.on) if (!TYPE_RE.test(t)) throw new Error(`Subscriber ${def.id}: loại sự kiện "${t}" sai khuôn`);
  return def;
}

/** Đăng ký subscriber (buildApp gọi nhiều lần trong test: cùng đối tượng thì bỏ qua; khác đối tượng cùng id → lỗi). */
export function registerSubscribers(defs: SubscriberDef[]): void {
  for (const d of defs) {
    const cur = registry.get(d.id);
    if (cur && cur !== d) throw new Error(`Subscriber ${d.id} đăng ký hai lần`);
    registry.set(d.id, d);
  }
}

export function listSubscribers(): SubscriberDef[] {
  return [...registry.values()];
}

const subscribersOf = (type: string) => [...registry.values()].filter((s) => s.on.includes(type));

/** UUID v7: 48 bit mili giây + ngẫu nhiên — sắp theo thời gian (bizcity_event@1 §3). */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  let ts = BigInt(now);
  for (let i = 5; i >= 0; i -= 1) { b[i] = Number(ts & 0xffn); ts >>= 8n; }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Ghi sự kiện vào outbox trong giao dịch của người gọi. Trả id, hoặc null nếu dedupeKey đã có. */
export async function emitEvent(trx: Db, e: EmitInput): Promise<string | null> {
  if (!TYPE_RE.test(e.type)) throw new Error(`Loại sự kiện "${e.type}" sai khuôn <module>.<thực thể>.<việc>`);
  const req = currentRequest();
  const id = uuidv7();
  const row = await trx
    .insertInto('event_outbox')
    .values({
      id, tenant_id: e.tenantId, type: e.type, version: e.version ?? 1, subject: e.subject, source_module: e.source,
      actor_kind: e.actor.kind, actor_id: e.actor.id, correlation_id: e.correlationId ?? req?.correlationId ?? null,
      causation_id: e.causationId ?? null, dedupe_key: e.dedupeKey ?? null, data: JSON.stringify(e.data ?? {}),
    })
    .onConflict((oc) => oc.columns(['tenant_id', 'dedupe_key']).where('dedupe_key', 'is not', null).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!row) return null;
  const subs = subscribersOf(e.type);
  if (subs.length) await trx.insertInto('event_deliveries').values(subs.map((s) => ({ tenant_id: e.tenantId, consumer: s.id, event_id: id }))).execute();
  return id;
}

type OutboxRow = { id: string; seq: string; tenant_id: string; type: string; version: number; subject: string; source_module: string; actor_kind: EventActorKind; actor_id: string; correlation_id: string | null; causation_id: string | null; data: unknown; occurred_at: Date };

const envelope = (r: OutboxRow): EventEnvelope => ({
  id: r.id, type: r.type, version: r.version, tenantId: String(r.tenant_id), occurredAt: new Date(r.occurred_at).toISOString(),
  source: { module: r.source_module }, subject: r.subject, actor: { kind: r.actor_kind, id: r.actor_id },
  correlationId: r.correlation_id, causationId: r.causation_id, data: (r.data ?? {}) as Record<string, unknown>,
});

export function retryDelayMs(def: SubscriberDef, attempts: number): number {
  const r = { ...DEFAULT_RETRY, ...def.retry };
  return Math.min(r.maxDelayMs, r.baseDelayMs * 2 ** Math.max(0, attempts - 1));
}

export interface DispatchResult { done: number; duplicate: number; failed: number; dead: number }

/** Một lượt giao: tối đa `limit` việc đến hạn của các subscriber đăng ký trong tiến trình này (lọc thêm theo consumer / đơn vị). */
export async function dispatchOnce(opts: { limit?: number; consumers?: string[]; tenantId?: string } = {}): Promise<DispatchResult> {
  const out: DispatchResult = { done: 0, duplicate: 0, failed: 0, dead: 0 };
  const consumers = (opts.consumers ?? [...registry.keys()]).filter((c) => registry.has(c));
  if (!consumers.length) return out;
  // Việc đến hạn, bỏ việc còn việc cũ hơn (cùng consumer, đơn vị, subject) chưa xong — giữ thứ tự trong một subject.
  const due = await sql<{ consumer: string; event_id: string; tenant_id: string }>`
    SELECT d.consumer, d.event_id::text, d.tenant_id::text
      FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id
     WHERE d.status = 'pending' AND d.next_at <= now() AND d.consumer = ANY(${consumers}::text[])
       AND (${opts.tenantId ?? null}::bigint IS NULL OR d.tenant_id = ${opts.tenantId ?? null}::bigint)
       AND NOT EXISTS (SELECT 1 FROM event_deliveries d2 JOIN event_outbox o2 ON o2.id = d2.event_id
                        WHERE d2.consumer = d.consumer AND d2.status = 'pending' AND o2.tenant_id = o.tenant_id
                          AND o2.subject = o.subject AND o2.seq < o.seq)
     ORDER BY o.seq
     LIMIT ${opts.limit ?? 100}`.execute(db);
  for (const d of due.rows) {
    const def = registry.get(d.consumer)!;
    let attempts = 0;
    try {
      const r = await db.transaction().execute(async (trx) => {
        const locked = await sql<{ attempts: number }>`
          SELECT attempts FROM event_deliveries WHERE consumer = ${d.consumer} AND event_id = ${d.event_id}::uuid AND status = 'pending'
             FOR UPDATE SKIP LOCKED`.execute(trx);
        if (!locked.rows[0]) return 'skip' as const; // tiến trình khác đang giao / đã giao
        attempts = locked.rows[0].attempts;
        const fresh = await trx.insertInto('event_consumptions').values({ tenant_id: d.tenant_id, consumer: d.consumer, event_id: d.event_id })
          .onConflict((oc) => oc.columns(['consumer', 'event_id']).doNothing()).returning('event_id').executeTakeFirst();
        if (fresh) {
          const row = await trx.selectFrom('event_outbox').selectAll().where('id', '=', d.event_id).executeTakeFirstOrThrow();
          const evt = envelope(row as unknown as OutboxRow);
          const ctx: SubscriberContext = {
            tx: trx,
            tenantId: evt.tenantId,
            emit: (type, data, o) => emitEvent(trx, {
              tenantId: evt.tenantId, type, data, subject: o.subject, version: o.version, dedupeKey: o.dedupeKey, source: def.module,
              actor: { kind: 'system', id: `subscriber:${def.id}` }, correlationId: evt.correlationId ?? evt.id, causationId: evt.id,
            }),
          };
          await withRequestContext({ requestId: `evt-${evt.id}`, correlationId: evt.correlationId ?? evt.id }, () => def.handle(ctx, evt));
        }
        await trx.updateTable('event_deliveries').set({ status: 'done', attempts: attempts + 1, done_at: new Date(), last_error: null })
          .where('consumer', '=', d.consumer).where('event_id', '=', d.event_id).execute();
        return fresh ? 'done' as const : 'duplicate' as const;
      });
      if (r === 'done') out.done += 1;
      else if (r === 'duplicate') out.duplicate += 1;
      if (r !== 'skip') metrics.outboxAttempts.inc({ consumer: d.consumer, result: r });
    } catch (err) {
      const n = attempts + 1;
      const max = def.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts;
      const dead = n >= max;
      await db.updateTable('event_deliveries')
        .set({ attempts: n, status: dead ? 'dead' : 'pending', last_error: String((err as Error)?.message ?? err).slice(0, 500), next_at: new Date(Date.now() + retryDelayMs(def, n)) })
        .where('consumer', '=', d.consumer).where('event_id', '=', d.event_id).where('status', '=', 'pending').execute();
      if (dead) out.dead += 1; else out.failed += 1;
      metrics.outboxAttempts.inc({ consumer: d.consumer, result: dead ? 'dead' : 'retry' });
    }
  }
  return out;
}

/** Ngày giờ theo giờ Việt Nam: { date: YYYY-MM-DD, hour: 0..23 }. */
/** Số đo outbox mọi đơn vị (R-OBS-4: không nhãn đơn vị). `dead` phải có người xem (R-OUTBOX-3) → cảnh báo OutboxDeadLetter. */
export async function collectOutboxMetrics(): Promise<void> {
  const r = await readWithTimeout(COLLECTOR_TIMEOUT_MS, (tx) => sql<{ pending: number; dead: number; oldest: number | null }>`
    SELECT count(*) FILTER (WHERE d.status = 'pending')::int AS pending,
           count(*) FILTER (WHERE d.status = 'dead')::int AS dead,
           extract(epoch FROM now() - min(o.occurred_at) FILTER (WHERE d.status = 'pending'))::float AS oldest
      FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id
     WHERE d.status IN ('pending', 'dead')`.execute(tx));
  const row = r.rows[0];
  metrics.outboxDeliveries.set({ status: 'pending' }, row?.pending ?? 0);
  metrics.outboxDeliveries.set({ status: 'dead' }, row?.dead ?? 0);
  metrics.outboxOldestPending.set({}, Number(row?.oldest ?? 0));
}

export function localClock(now: Date): { date: string; hour: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: CLOCK_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Phát sự kiện đồng hồ đến hạn (chỉ loại có subscriber) cho mọi đơn vị đang dùng, hoặc chỉ các đơn vị chỉ định. Trả số sự kiện mới phát. */
export async function tickClock(now = new Date(), opts: { tenantIds?: string[] } = {}): Promise<number> {
  const { date, hour } = localClock(now);
  const due: { type: string; key: string }[] = [];
  if (subscribersOf('bizcity.clock.hourly').length) due.push({ type: 'bizcity.clock.hourly', key: `${date}T${String(hour).padStart(2, '0')}` });
  if (hour >= 1 && subscribersOf('bizcity.clock.daily').length) due.push({ type: 'bizcity.clock.daily', key: date });
  if (!due.length) return 0;
  return db.transaction().execute(async (trx) => {
    let q = trx.selectFrom('tenants').select('id').where('is_active', '=', true);
    if (opts.tenantIds) q = q.where('id', 'in', opts.tenantIds.length ? opts.tenantIds : ['0']);
    const tenants = await q.execute();
    let n = 0;
    for (const t of tenants) {
      for (const c of due) {
        const id = await emitEvent(trx, {
          tenantId: t.id, type: c.type, subject: 'clock', source: 'bizcity.platform', actor: { kind: 'system', id: 'clock' },
          dedupeKey: `${c.type}:${c.key}`, data: { at: now.toISOString(), date, hour },
        });
        if (id) n += 1;
      }
    }
    return n;
  });
}

/** Phát lại cho một consumer: xoá dấu đã xử lý, đặt lại việc giao (tạo nếu chưa có). Trả số sự kiện được giao lại. */
export async function replayEvents(trx: Db, a: { tenantId: string; consumer: string; from: string; to?: string; type?: string; subject?: string }): Promise<number> {
  const def = registry.get(a.consumer);
  if (!def) throw new Error(`Không có subscriber ${a.consumer}`);
  let q = trx.selectFrom('event_outbox').select('id').where('tenant_id', '=', a.tenantId).where('type', 'in', def.on).where('occurred_at', '>=', new Date(a.from));
  if (a.to) q = q.where('occurred_at', '<=', new Date(a.to));
  if (a.type) q = q.where('type', '=', a.type);
  if (a.subject) q = q.where('subject', '=', a.subject);
  const ids = (await q.execute()).map((r) => r.id);
  if (!ids.length) return 0;
  await trx.deleteFrom('event_consumptions').where('consumer', '=', a.consumer).where('event_id', 'in', ids).execute();
  await trx.insertInto('event_deliveries').values(ids.map((id) => ({ tenant_id: a.tenantId, consumer: a.consumer, event_id: id })))
    .onConflict((oc) => oc.columns(['consumer', 'event_id']).doUpdateSet({ status: 'pending', attempts: 0, next_at: new Date(), last_error: null, done_at: null }))
    .execute();
  return ids.length;
}

/** Tình trạng giao của một đơn vị theo consumer (màn hệ thống, tự chẩn đoán). */
export async function eventStatus(trx: Db, tenantId: string) {
  const rows = await sql<{ consumer: string; pending: number; dead: number; done: number; oldest_pending: Date | null }>`
    SELECT d.consumer,
           count(*) FILTER (WHERE d.status = 'pending')::int AS pending,
           count(*) FILTER (WHERE d.status = 'dead')::int AS dead,
           count(*) FILTER (WHERE d.status = 'done')::int AS done,
           min(o.occurred_at) FILTER (WHERE d.status = 'pending') AS oldest_pending
      FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id
     WHERE o.tenant_id = ${tenantId}
     GROUP BY d.consumer ORDER BY d.consumer`.execute(trx);
  return rows.rows.map((r) => ({ consumer: r.consumer, pending: r.pending, dead: r.dead, done: r.done, oldestPendingAt: r.oldest_pending ? new Date(r.oldest_pending).toISOString() : null }));
}

/** Dọn outbox quá hạn giữ của đơn vị (mọi việc giao đã xong / dead). Subscriber core.events.retention gọi mỗi ngày. */
export const retentionSubscriber = defineSubscriber({
  id: 'core.events-retention',
  module: 'bizcity.platform',
  on: ['bizcity.clock.daily'],
  async handle(ctx) {
    await sql`
      DELETE FROM event_outbox o
       WHERE o.tenant_id = ${ctx.tenantId} AND o.occurred_at < now() - make_interval(days => ${EVENT_RETENTION_DAYS})
         AND NOT EXISTS (SELECT 1 FROM event_deliveries d WHERE d.event_id = o.id AND d.status = 'pending')`.execute(ctx.tx);
  },
});

/** Vòng dispatcher (1 giây) + đồng hồ (1 phút) trong tiến trình API. Trả hàm dừng. */
export function startEventRuntime(log: { warn: (o: object, m: string) => void; error: (o: object, m: string) => void }): () => Promise<void> {
  let busy = false;
  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();
  const guard = (name: string, fn: () => Promise<unknown>) => () => {
    if (busy || stopped) return;
    busy = true;
    running = fn()
      .then((r) => { const x = r as Partial<DispatchResult> | undefined; if (x?.dead) log.warn({ dead: x.dead }, 'Sự kiện hết lượt thử (dead): xem /api/v1/system/events'); })
      .catch((err: unknown) => log.error({ err: String(err) }, `${name}: lỗi`))
      .finally(() => { busy = false; });
  };
  const dispatch = setInterval(guard('dispatcher sự kiện', () => dispatchOnce()), 1_000);
  const clock = setInterval(guard('đồng hồ sự kiện', () => tickClock()), 60_000);
  dispatch.unref();
  clock.unref();
  return async () => {
    stopped = true;
    clearInterval(dispatch);
    clearInterval(clock);
    await running;
  };
}
