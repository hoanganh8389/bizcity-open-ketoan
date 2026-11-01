// @bizcity-layer P observability
// [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: API trung gian chỉ đọc của Bàn điều tra — status, trace, request, evidence; gác đơn vị, giới hạn, nhật ký truy cập
/**
 * Bàn điều tra cho nhà phát triển — API trung gian (PHASE-019, 20-KIEN-TRUC §2). Trình duyệt KHÔNG gọi Tempo / Loki / Prometheus /
 * Grafana (N1); mọi màn đọc qua đây:
 *   GET /api/v1/system/devtools/status                 core.devtools.status    nguồn nào bật, chế độ (Đơn vị / Vận hành), giới hạn
 *   GET /api/v1/system/devtools/traces/:traceId        core.devtools.trace     cây span đã lọc + tóm tắt "chuyện gì đã xảy ra"
 *   GET /api/v1/system/devtools/requests/:requestId    core.devtools.request   log của yêu cầu (Loki) → traceId → trace nếu có
 *   GET /api/v1/system/devtools/evidence               core.devtools.evidence  bằng chứng theo traceId / requestId — chỉ cột mô tả
 *   GET /api/v1/system/devtools/logs                   core.devtools.logs      nhật ký mới nhất (≤ 24 giờ, ≤ 200 dòng) theo bộ lọc     (W3)
 *   GET /api/v1/system/devtools/traces                 core.devtools.traces    tìm trace theo kết quả / module / thời gian (≤ 7 ngày)   (W3)
 *   GET /api/v1/system/devtools/summary                core.devtools.summary   câu kết luận + ô lỗi, chậm, trace lỗi, sự kiện, chẩn đoán (W3)
 *
 * Bất biến (00-MASTER-PLAN §3): chỉ đọc; quyền devtools:read (chủ đơn vị + vai trò developer; không khoá API, không AI, không MCP);
 * bộ lọc đơn vị do máy chủ gắn từ phiên; không nhận truy vấn tự do; trace của đơn vị khác → 404 giống hệt "không có" (D019-5);
 * lọc trường lần hai; ≤ 30 truy vấn / phút / người; mỗi lượt ghi một dòng log evt=bizcity.devtools.query (không ghi nội dung trả về).
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { env } from '@bizcity/platform/config/env';
import { Errors } from '@bizcity/platform/core/errors';
import { defineAction, mountActions, type ActionContext } from '@bizcity/platform/core/actions';
import { currentRequest } from '@bizcity/platform/core/request-context';
import { TRACE_ATTRIBUTES } from '@bizcity/platform/core/tracing';
import { errorKind } from '@bizcity/platform/core/errors';
import { eventStatus } from '@bizcity/platform/core/events';
import { getJson, LIMITS, LOGQL, logWindow, ping, queryLogMetric, queryLogs, searchTraces, takeQuota, traceSearchQuery, windowRange, type SourceState } from './devtools.sources.js';
import { ownsTrace, parseTempoTrace, summarize, viewTrace } from './devtools.trace.js';

const TRACE_ID = z.string().trim().toLowerCase().regex(/^[0-9a-f]{32}$/, 'traceId gồm 32 ký tự hex');
/** Khuôn mã yêu cầu R-OBS-1 (app.ts genReqId / X-Request-Id hợp lệ): không có ngoặc kép, khoảng trắng, dấu ngoặc nhọn. */
const REQUEST_ID = z.string().trim().regex(/^[A-Za-z0-9._:-]{4,128}$/, 'requestId không đúng khuôn');

/** Kết quả từng lượt cho nhật ký truy cập (onResponse) — theo mã yêu cầu. */
const resultSize = new Map<string, number>();
const noteSize = (n: number) => {
  const id = currentRequest()?.requestId;
  if (id) resultSize.set(id, n);
};

/**
 * Chế độ Vận hành (Q019-2, chủ chốt 2026-11-01): DEVTOOLS_OPS=true + người gọi là chủ đơn vị + bản cài có ĐÚNG MỘT đơn vị.
 * Bảng tenants không có RLS (không có cột tenant_id) nên đếm được cả bản cài. Nhiều đơn vị → luôn tắt, kể cả môi trường thử.
 */
async function opsMode(ctx: ActionContext): Promise<{ on: boolean; blocked: string | null }> {
  if (env.DEVTOOLS_OPS !== 'true') return { on: false, blocked: null };
  if (ctx.legacyAuth.role !== 'owner') return { on: false, blocked: 'Chế độ Vận hành chỉ dành cho chủ đơn vị' };
  const row = await ctx.data.tx.selectFrom('tenants').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
  if (Number(row.n) !== 1) return { on: false, blocked: 'Bản cài có nhiều đơn vị — chế độ Vận hành chưa mở (chờ vai trò vận hành liên đơn vị, Q018-6)' };
  return { on: true, blocked: null };
}

const sourceState = z.enum(['off', 'up', 'down']);
const attrValue = z.union([z.string(), z.number(), z.boolean()]);
const spanSchema = z.object({
  spanId: z.string(), parentId: z.string().nullable(), name: z.string(), kind: z.string(),
  startMs: z.number(), durationMs: z.number(), outcome: z.enum(['ok', 'rejected', 'error']),
  attributes: z.record(attrValue), events: z.array(z.object({ name: z.string(), exceptionType: z.string().optional() })),
});
const summarySchema = z.object({
  outcome: z.enum(['ok', 'rejected', 'error']), route: z.string().nullable(), status: z.number().nullable(), errorCode: z.string().nullable(),
  stoppedAt: z.object({ spanId: z.string(), name: z.string(), module: z.string().nullable() }).nullable(),
  kernel: z.object({ state: z.enum(['not-called', 'ok', 'rejected', 'error']), ops: z.array(z.string()) }),
  slowest: z.object({ spanId: z.string(), name: z.string(), selfMs: z.number(), share: z.number() }).nullable(),
  events: z.array(z.string()), playbook: z.string().nullable(), lines: z.array(z.string()),
});
const traceSchema = z.object({
  traceId: z.string(), startedAt: z.string().nullable(), durationMs: z.number(), summary: summarySchema, spans: z.array(spanSchema),
  links: z.object({ logs: z.string(), evidence: z.string(), grafana: z.string().nullable() }),
});
const logSchema = z.object({ time: z.string(), level: z.string(), msg: z.string() }).catchall(z.unknown());

/** Đọc trace của đơn vị; không có / không thuộc đơn vị → cùng một lỗi NOT_FOUND. */
async function loadTrace(ctx: ActionContext, traceId: string, ops: boolean): Promise<z.infer<typeof traceSchema>> {
  const { status, body } = await getJson('tempo', `/api/traces/${traceId}`);
  const spans = status === 404 ? [] : parseTempoTrace(body);
  if (!spans.length || !ownsTrace(spans, ctx.tenant.id)) throw Errors.notFound('trace (chưa có trong Tempo — chờ ~20 giây rồi thử lại — hoặc không thuộc đơn vị của bạn)');
  const view = viewTrace(spans);
  const grafana = ops && env.DEVTOOLS_GRAFANA_URL
    ? `${env.DEVTOOLS_GRAFANA_URL.replace(/\/+$/, '')}/explore?left=${encodeURIComponent(JSON.stringify({ datasource: 'tempo', queries: [{ refId: 'A', queryType: 'traceql', query: traceId }] }))}`
    : null;
  return {
    traceId, startedAt: view.startedAt, durationMs: view.durationMs, summary: summarize(view.spans), spans: view.spans,
    links: { logs: `/dev/nhat-ky?traceId=${traceId}`, evidence: `/dev/tra-ma?tab=bang-chung&traceId=${traceId}`, grafana },
  };
}

const statusAction = defineAction({
  id: 'core.devtools.status', title: 'Bàn điều tra: nguồn đã bật, chế độ, giới hạn', tags: ['Bàn điều tra'],
  description: 'Nguồn quan sát nào đã bật / trả lời (Tempo, Loki; Prometheus, Alertmanager chỉ ở chế độ Vận hành), chế độ của phiên (Đơn vị / Vận hành, PHASE-019 Q019-2), giới hạn truy vấn.',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.object({
    mode: z.enum(['unit', 'ops']),
    opsBlocked: z.string().nullable().describe('DEVTOOLS_OPS=true nhưng chưa mở được — lý do'),
    sources: z.object({ tempo: sourceState, loki: sourceState, prometheus: sourceState.nullable(), alertmanager: sourceState.nullable() }),
    grafanaUrl: z.string().nullable(),
    bugReportUrl: z.string().nullable(),
    limits: z.object({ logHours: z.number(), logLines: z.number(), traceDays: z.number(), traces: z.number(), perMinute: z.number() }),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/status' }, mcp: false, ai: 'deny' },
  handler: async (ctx) => {
    takeQuota(ctx.actor.id);
    const ops = await opsMode(ctx);
    const [tempo, loki, prometheus, alertmanager] = await Promise.all([
      ping('tempo'), ping('loki'),
      ops.on ? ping('prometheus') : Promise.resolve(null as SourceState | null),
      ops.on ? ping('alertmanager') : Promise.resolve(null as SourceState | null),
    ]);
    noteSize(1);
    return {
      mode: ops.on ? 'ops' as const : 'unit' as const, opsBlocked: ops.blocked,
      sources: { tempo, loki, prometheus, alertmanager },
      grafanaUrl: ops.on && env.DEVTOOLS_GRAFANA_URL ? env.DEVTOOLS_GRAFANA_URL : null,
      bugReportUrl: env.BUG_REPORT_URL || null,
      limits: { ...LIMITS },
    };
  },
});

const traceAction = defineAction({
  id: 'core.devtools.trace', title: 'Bàn điều tra: một trace của đơn vị', tags: ['Bàn điều tra'],
  description: 'Cây span đã lọc (chỉ thuộc tính được phép) + tóm tắt theo luật cố định. Trace không có hoặc thuộc đơn vị khác → 404 như nhau (D019-5).',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({ traceId: TRACE_ID }),
  output: traceSchema,
  errors: ['NOT_FOUND', 'NOT_READY', 'RATE_LIMITED'],
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/traces/:traceId' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    takeQuota(ctx.actor.id);
    const t = await loadTrace(ctx, input.traceId, (await opsMode(ctx)).on);
    noteSize(t.spans.length);
    return t;
  },
});

const requestAction = defineAction({
  id: 'core.devtools.request', title: 'Bàn điều tra: một yêu cầu theo requestId', tags: ['Bàn điều tra'],
  description: 'Dòng log của yêu cầu trong đơn vị (Loki, khung ≤ 24 giờ quanh `at`, mặc định 24 giờ gần nhất) → traceId → trace nếu Tempo còn giữ. Trace bị lấy mẫu bỏ thì chỉ có log.',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({ requestId: REQUEST_ID, at: z.string().datetime({ offset: true }).optional().describe('Mốc thời gian gần lúc lỗi (ISO 8601)') }),
  output: z.object({
    requestId: z.string(), traceId: z.string().nullable(), logs: z.array(logSchema),
    trace: traceSchema.nullable(), traceMissing: z.string().nullable().describe('Vì sao không có trace (bị lấy mẫu bỏ, Tempo chưa bật…)'),
  }),
  errors: ['NOT_FOUND', 'NOT_READY', 'RATE_LIMITED'],
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/requests/:requestId' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    takeQuota(ctx.actor.id);
    const ops = (await opsMode(ctx)).on;
    const logs = await queryLogs(LOGQL.byRequest(input.requestId, ctx.tenant.id), ctx.tenant.id, logWindow(input.at), { ops });
    if (!logs.length) throw Errors.notFound('yêu cầu trong 24 giờ quanh mốc đã chọn (hoặc không thuộc đơn vị của bạn)');
    const traceId = logs.map((l) => l.traceId).find((v): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v)) ?? null;
    let trace: z.infer<typeof traceSchema> | null = null;
    let traceMissing: string | null = traceId ? null : 'Yêu cầu không có traceId (truy vết tắt)';
    if (traceId) {
      try {
        trace = await loadTrace(ctx, traceId, ops);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== 'NOT_FOUND' && code !== 'NOT_READY') throw e;
        traceMissing = code === 'NOT_READY' ? (e as Error).message : 'Trace không còn trong Tempo — có thể đã bị lấy mẫu bỏ (TRACE_SAMPLE_PERCENT), xem Sổ tay TH-14';
      }
    }
    noteSize(logs.length + (trace?.spans.length ?? 0));
    return { requestId: input.requestId, traceId, logs, trace, traceMissing };
  },
});

const evidenceAction = defineAction({
  id: 'core.devtools.evidence', title: 'Bàn điều tra: bằng chứng theo traceId / requestId', tags: ['Bàn điều tra'],
  description: 'Bản ghi bằng chứng (audit_logs, RLS) của đơn vị theo trace_id / request_id — chỉ cột mô tả; không before_data / after_data / input_hash / idempotency_key (20-KIEN-TRUC §3.3). Tối đa 50 dòng.',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({ traceId: TRACE_ID.optional(), requestId: REQUEST_ID.optional() }),
  output: z.array(z.object({
    id: z.string(), at: z.string(), action: z.string(), module: z.string().nullable(),
    object: z.object({ type: z.string(), id: z.string().nullable() }),
    actor: z.object({ kind: z.string(), id: z.string() }),
    result: z.object({ ok: z.boolean(), code: z.string().nullable() }),
    requestId: z.string().nullable(), traceId: z.string().nullable(),
  })),
  errors: ['VALIDATION_ERROR', 'RATE_LIMITED'],
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/evidence' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    if (!input.traceId && !input.requestId) throw Errors.validation('Cần traceId hoặc requestId');
    takeQuota(ctx.actor.id);
    const res = await sql<{
      id: string; created_at: Date; action: string; module_id: string | null; object_type: string; object_id: string | null;
      actor: string; actor_kind: string; result_ok: boolean; result_code: string | null; request_id: string | null; trace_id: string | null;
    }>`
      SELECT id, created_at, action, module_id, object_type, object_id, actor, actor_kind, result_ok, result_code, request_id, trace_id
        FROM audit_logs
       WHERE tenant_id = ${ctx.tenant.id}
         AND ((${input.traceId ?? null}::text IS NOT NULL AND trace_id = ${input.traceId ?? null})
           OR (${input.requestId ?? null}::text IS NOT NULL AND request_id = ${input.requestId ?? null}))
       ORDER BY created_at, id
       LIMIT 50`.execute(ctx.data.tx);
    noteSize(res.rows.length);
    return res.rows.map((x) => ({
      id: String(x.id), at: new Date(x.created_at).toISOString(), action: x.action, module: x.module_id,
      object: { type: x.object_type, id: x.object_id }, actor: { kind: x.actor_kind, id: x.actor },
      result: { ok: x.result_ok, code: x.result_code }, requestId: x.request_id, traceId: x.trace_id,
    }));
  },
});

// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: core.devtools.logs / traces / summary cho màn Nhật ký, Tổng quan, Tra mã

/** Khuôn chặt cho giá trị chèn vào LogQL / TraceQL (lớp một; quote() là lớp hai). */
const ERR_CODE = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Mã lỗi viết hoa, số, gạch dưới');
const EVT = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, 'evt: chữ thường, số, chấm, gạch');
const ROUTE = z.string().regex(/^\/[A-Za-z0-9/_:.-]{0,200}$/, 'route mẫu, vd /api/v1/payment-requests/:id/pay');
const MODULE = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'mã module chữ thường');

/** NOT_READY của nguồn → trạng thái cho từng ô (Tổng quan vẫn trả phần còn lại — N5). */
async function part<T>(fn: () => Promise<T>): Promise<{ state: 'up'; data: T } | { state: 'off' | 'down' }> {
  try {
    return { state: 'up', data: await fn() };
  } catch (e) {
    const err = e as { code?: string; details?: { reason?: string } };
    if (err.code !== 'NOT_READY') throw e;
    return { state: err.details?.reason === 'off' ? 'off' : 'down' };
  }
}

const logsAction = defineAction({
  id: 'core.devtools.logs', title: 'Bàn điều tra: nhật ký kỹ thuật của đơn vị', tags: ['Bàn điều tra'],
  description: 'Dòng log mới nhất của đơn vị (Loki) trong khung ≤ 24 giờ, ≤ 200 dòng, mới trước; lọc theo mức, mã lỗi, evt, route, traceId. Trường theo danh sách cho phép (20-KIEN-TRUC §3.3).',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({
    window: z.enum(['1h', '6h', '24h']).default('1h'),
    level: z.enum(['error', 'warn', 'info']).optional(),
    errCode: ERR_CODE.optional(), evt: EVT.optional(), route: ROUTE.optional(), traceId: TRACE_ID.optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.logLines).default(LIMITS.logLines),
  }),
  output: z.object({ window: z.string(), from: z.string(), to: z.string(), lines: z.array(logSchema) }),
  errors: ['NOT_READY', 'RATE_LIMITED'],
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/logs' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    takeQuota(ctx.actor.id);
    const range = windowRange(input.window);
    const lines = await queryLogs(LOGQL.list(ctx.tenant.id, input), ctx.tenant.id, range, { ops: (await opsMode(ctx)).on, limit: input.limit, newest: true });
    noteSize(lines.length);
    return { window: input.window, from: range.from.toISOString(), to: range.to.toISOString(), lines };
  },
});

const hitSchema = z.object({ traceId: z.string(), rootName: z.string(), startedAt: z.string(), durationMs: z.number(), attributes: z.record(attrValue) });

const tracesAction = defineAction({
  id: 'core.devtools.traces', title: 'Bàn điều tra: tìm trace của đơn vị', tags: ['Bàn điều tra'],
  description: 'Trace của đơn vị (Tempo, khung ≤ 7 ngày, ≤ 50 trace) theo kết quả (error / rejected / failed = khác ok), module, thời gian tối thiểu. Mẫu TraceQL đóng, đơn vị do máy chủ gắn.',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({
    window: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
    outcome: z.enum(['error', 'rejected', 'failed']).optional(),
    module: MODULE.optional(),
    minDurationMs: z.coerce.number().int().min(1).max(600_000).optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.traces).default(20),
  }),
  output: z.object({ window: z.string(), traces: z.array(hitSchema) }),
  errors: ['NOT_READY', 'RATE_LIMITED'],
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/traces' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    takeQuota(ctx.actor.id);
    const traces = await searchTraces(traceSearchQuery(ctx.tenant.id, input), windowRange(input.window), input.limit, TRACE_ATTRIBUTES);
    noteSize(traces.length);
    return { window: input.window, traces };
  },
});

const partState = z.enum(['up', 'off', 'down']);
const summaryAction = defineAction({
  id: 'core.devtools.summary', title: 'Bàn điều tra: tổng quan của đơn vị', tags: ['Bàn điều tra'],
  description: 'Một câu kết luận trước (U1) + các ô: lỗi theo mã (từ chối đúng luật / lỗi kỹ thuật), yêu cầu chậm, trace lỗi gần đây, sự kiện chờ / chết, tự chẩn đoán gần nhất. Nguồn nào chưa bật thì ô đó báo, phần CSDL vẫn có.',
  permission: 'devtools:read', effect: 'read', idempotency: 'none',
  input: z.object({ window: z.enum(['1h', '24h']).default('1h') }),
  output: z.object({
    window: z.string(), generatedAt: z.string(), level: z.enum(['ok', 'warn', 'bad']), lines: z.array(z.string()),
    errors: z.object({ state: partState, rejected: z.number(), error: z.number(), byCode: z.array(z.object({ code: z.string(), count: z.number(), kind: z.enum(['rejected', 'error']) })) }),
    slow: z.object({ state: partState, count: z.number() }),
    recent: z.object({ state: partState, traces: z.array(hitSchema) }),
    events: z.object({ pending: z.number(), dead: z.number(), oldestPendingAt: z.string().nullable(), deadConsumers: z.array(z.string()) }),
    diagnostics: z.object({ at: z.string(), layer: z.string(), errorCount: z.number() }).nullable(),
  }),
  errors: ['RATE_LIMITED'],
  expose: { http: { method: 'GET', path: '/api/v1/system/devtools/summary' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    takeQuota(ctx.actor.id);
    const tenant = ctx.tenant.id;
    const range = windowRange(input.window);
    const [codes, slowP, recentP] = await Promise.all([
      part(() => queryLogMetric(LOGQL.errorsByCode(tenant, input.window), range.to)),
      part(() => queryLogMetric(LOGQL.slowRequests(tenant, input.window), range.to)),
      part(() => searchTraces(traceSearchQuery(tenant, { outcome: 'failed' }), range, 10, TRACE_ATTRIBUTES)),
    ]);
    const byCode = codes.state === 'up'
      ? codes.data.filter((r) => /^[A-Z][A-Z0-9_]{1,63}$/.test(r.metric.errCode ?? '') && r.value > 0)
        .map((r) => ({ code: r.metric.errCode!, count: Math.round(r.value), kind: errorKind(r.metric.errCode) }))
        .sort((a, b) => b.count - a.count)
      : [];
    const errors = {
      state: codes.state, byCode,
      rejected: byCode.filter((c) => c.kind === 'rejected').reduce((s, c) => s + c.count, 0),
      error: byCode.filter((c) => c.kind === 'error').reduce((s, c) => s + c.count, 0),
    };
    const slow = { state: slowP.state, count: slowP.state === 'up' ? Math.round(slowP.data.reduce((s, r) => s + r.value, 0)) : 0 };
    const recent = { state: recentP.state, traces: recentP.state === 'up' ? recentP.data : [] };

    const ev = await eventStatus(ctx.data.tx, tenant);
    const events = {
      pending: ev.reduce((s, c) => s + c.pending, 0), dead: ev.reduce((s, c) => s + c.dead, 0),
      oldestPendingAt: ev.map((c) => c.oldestPendingAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null,
      deadConsumers: ev.filter((c) => c.dead > 0).map((c) => c.consumer),
    };
    const diag = await ctx.data.tx.selectFrom('diagnostic_runs').select(['created_at', 'layer', 'error_count'])
      .where('tenant_id', '=', tenant).where('layer', '=', 'L3').orderBy('created_at', 'desc').limit(1).executeTakeFirst();
    const diagnostics = diag ? { at: new Date(diag.created_at).toISOString(), layer: diag.layer, errorCount: Number(diag.error_count) } : null;

    // Câu kết luận (U1) — luật cố định, nặng trước nhẹ sau.
    const label = input.window === '1h' ? '1 giờ qua' : '24 giờ qua';
    const lines: string[] = [];
    if (diagnostics && diagnostics.errorCount > 0) lines.push(`Tự chẩn đoán sổ gần nhất có ${diagnostics.errorCount} lỗi — xem ngay (Sổ tay TH-10, sev1).`);
    // Trace có kết quả khác ok (Tempo): dùng khi log không ghi nhận (Loki chưa bật, log mất / chậm) — kết luận không được nói "ổn"
    // trong khi bảng trace ngay dưới có lỗi (lệch thấy khi chạy thật 2026-11-01).
    const traceErr = recent.traces.filter((t) => t.attributes['bizcity.outcome'] === 'error');
    const traceRej = recent.traces.filter((t) => t.attributes['bizcity.outcome'] === 'rejected');
    const modsOf = (ts: typeof recent.traces) => [...new Set(ts.map((t) => t.attributes['bizcity.module']).filter((m): m is string => typeof m === 'string'))];
    if (errors.error > 0) {
      const mods = modsOf(traceErr);
      lines.push(`${errors.error} lỗi kỹ thuật trong ${label}${mods.length ? ` — module ${mods.join(', ')}` : ''}.`);
    } else if (traceErr.length) {
      const mods = modsOf(traceErr);
      lines.push(`${traceErr.length} trace lỗi kỹ thuật gần đây${mods.length ? ` — module ${mods.join(', ')}` : ''} (theo Tempo; nhật ký chưa ghi nhận).`);
    }
    if (events.dead > 0) lines.push(`${events.dead} việc giao sự kiện đã hết lượt thử (nơi nhận ${events.deadConsumers.join(', ')}) — Sổ tay TH-06.`);
    if (errors.rejected > 0) lines.push(`${errors.rejected} lần từ chối đúng luật trong ${label} (${errors.byCode.filter((c) => c.kind === 'rejected').slice(0, 3).map((c) => `${c.code} ${c.count}`).join(', ')}) — không phải sự cố.`);
    else if (traceRej.length) lines.push(`${traceRej.length} trace bị từ chối đúng luật gần đây${modsOf(traceRej).length ? ` — module ${modsOf(traceRej).join(', ')}` : ''} (theo Tempo) — không phải sự cố.`);
    if (slow.count > 0) lines.push(`${slow.count} yêu cầu chậm hơn 1 giây — Sổ tay TH-03.`);
    if (!lines.length) lines.push(errors.state === 'up' ? `Không có lỗi trong ${label}.` : 'Không thấy lỗi trong CSDL; Loki chưa bật nên chưa đếm được lỗi theo yêu cầu.');
    const level = (diagnostics?.errorCount ?? 0) > 0 || errors.error > 0 || traceErr.length > 0 ? 'bad' as const : events.dead > 0 || slow.count > 0 ? 'warn' as const : 'ok' as const;

    noteSize(byCode.length + recent.traces.length);
    return { window: input.window, generatedAt: new Date().toISOString(), level, lines, errors, slow, recent, events, diagnostics };
  },
});

export const DEVTOOLS_ACTIONS = [statusAction, traceAction, requestAction, evidenceAction, logsAction, tracesAction, summaryAction];

export async function devtoolsRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, DEVTOOLS_ACTIONS);
  // Nhật ký truy cập (20-KIEN-TRUC §3.4): ai, action nào, cỡ kết quả, bao lâu — không tham số tự do (không có), không nội dung trả về.
  // Plugin này đóng gói riêng (app.register) nên móc chỉ chạy cho route của Bàn điều tra; log của yêu cầu đã mang tenant, actor.
  app.addHook('onResponse', async (req, reply) => {
    const id = String(req.id);
    const size = resultSize.get(id);
    resultSize.delete(id);
    req.log.info({ evt: 'bizcity.devtools.query', action: req.routeOptions.url, status: reply.statusCode, size: size ?? 0, ms: Math.round(reply.elapsedTime) }, 'Bàn điều tra');
  });
}
