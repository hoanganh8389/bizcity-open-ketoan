// @bizcity-layer P observability
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
/**
 * Truy vết + log + số đo HTTP cho mọi yêu cầu (docs/ops/OBSERVABILITY.md §1–§3):
 *   - header X-Request-Id trả lại ở mọi phản hồi (R-OBS-1); mã do app.ts genReqId sinh / nhận;
 *   - span HTTP (S1, ADR-0010): nhận traceparent (W3C) của bên gọi, mọi hook / handler sau đó chạy trong ngữ cảnh của span;
 *     traceId vào log của yêu cầu. Không có SDK (OTEL_SDK_DISABLED, test) thì vẫn lấy traceId từ traceparent hợp lệ như trước;
 *   - sau xác thực: tenant, actor, actorKind vào log (không tên người, không tên đơn vị — R-SEC-10);
 *   - xong yêu cầu: một dòng log { route, method, status, ms, errCode } + bizcity_http_* (nhãn ít giá trị, R-OBS-4).
 * /metrics và health không có span: Prometheus / Docker gọi mỗi 15 giây, trace chỉ thêm nhiễu (đã có số đo, nhật ký).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { metrics } from './metrics.js';
import { currentTraceId, endServerSpan, runInScope, startServerSpan, type TraceScope } from './tracing.js';
import { BUILD_VERSION } from './version.js';

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;
const UNTRACED = new Set(['/metrics', '/api/v1/system/health', '/api/v1/system/health/ready']);
const scopes = new WeakMap<FastifyRequest, TraceScope>();

const incomingTraceId = (req: FastifyRequest) => {
  const tp = req.headers.traceparent;
  return typeof tp === 'string' ? TRACEPARENT.exec(tp)?.[1] : undefined;
};

export function registerObservability(app: FastifyInstance): void {
  metrics.buildInfo.set({ version: BUILD_VERSION.version, kernel: BUILD_VERSION.kernel, standard: BUILD_VERSION.standard ?? '' }, 1);

  // Hook dạng callback: done() chạy bên trong ngữ cảnh của span nên mọi hook / handler sau đó là con của span HTTP.
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-request-id', req.id);
    const route = req.routeOptions.url ?? 'unmatched';
    if (UNTRACED.has(route) || route.startsWith('/api/docs')) {
      const traceId = incomingTraceId(req);
      if (traceId) req.log = req.log.child({ traceId });
      done();
      return;
    }
    const scope = startServerSpan(req.method, route, req.headers, String(req.id));
    scopes.set(req, scope);
    runInScope(scope, () => {
      const traceId = currentTraceId() ?? incomingTraceId(req);
      if (traceId) req.log = req.log.child({ traceId });
      done();
    });
  });

  // Sau authPlugin (onRequest): gắn danh tính vào log của yêu cầu; mã nội bộ đơn vị vào span (như trường tenant của log).
  app.addHook('preHandler', async (req) => {
    const a = req.auth;
    if (a) {
      req.log = req.log.child({ tenant: a.tenantId, actor: a.actor, actorKind: a.kind });
      scopes.get(req)?.span.setAttribute('bizcity.tenant', a.tenantId);
    }
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? 'unmatched';
    const status = reply.statusCode;
    const seconds = reply.elapsedTime / 1000;
    metrics.httpRequests.inc({ method: req.method, route, status: String(status) });
    metrics.httpDuration.observe({ method: req.method, route }, seconds);
    if (reply.errCode) metrics.httpErrors.inc({ code: reply.errCode });
    req.log.info({ route, method: req.method, status, ms: Math.round(reply.elapsedTime), ...(reply.errCode ? { errCode: reply.errCode } : {}) }, 'xong yêu cầu');
    const scope = scopes.get(req);
    if (scope) {
      scopes.delete(req);
      endServerSpan(scope, status, reply.errCode);
    }
  });

  // Bên gọi ngắt kết nối giữa chừng: onResponse không chạy — vẫn đóng span (499 theo quy ước nginx).
  app.addHook('onRequestAbort', async (req) => {
    const scope = scopes.get(req);
    if (scope) {
      scopes.delete(req);
      endServerSpan(scope, 499);
    }
  });
}
