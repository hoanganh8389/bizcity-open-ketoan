// @bizcity-layer P observability
// [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: API trung gian chỉ đọc của Bàn điều tra — status, trace, request, evidence; gác đơn vị, giới hạn, nhật ký truy cập
/**
 * Bàn điều tra cho nhà phát triển — API trung gian (PHASE-019, 20-KIEN-TRUC §2). Trình duyệt KHÔNG gọi Tempo / Loki / Prometheus /
 * Grafana (N1); mọi màn đọc qua đây:
 *   GET /api/v1/system/devtools/status                 core.devtools.status    nguồn nào bật, chế độ (Đơn vị / Vận hành), giới hạn
 *   GET /api/v1/system/devtools/traces/:traceId        core.devtools.trace     cây span đã lọc + tóm tắt "chuyện gì đã xảy ra"
 *   GET /api/v1/system/devtools/requests/:requestId    core.devtools.request   log của yêu cầu (Loki) → traceId → trace nếu có
 *   GET /api/v1/system/devtools/evidence               core.devtools.evidence  bằng chứng theo traceId / requestId — chỉ cột mô tả
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
import { getJson, LIMITS, LOGQL, logWindow, ping, queryLogs, takeQuota, type SourceState } from './devtools.sources.js';
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

export const DEVTOOLS_ACTIONS = [statusAction, traceAction, requestAction, evidenceAction];

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
