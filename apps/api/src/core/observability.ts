// @bizcity-layer P observability
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * Truy vết + log + số đo HTTP cho mọi yêu cầu (docs/ops/OBSERVABILITY.md §1–§3):
 *   - header X-Request-Id trả lại ở mọi phản hồi (R-OBS-1); mã do app.ts genReqId sinh / nhận;
 *   - traceparent (W3C) hợp lệ → traceId vào log của yêu cầu;
 *   - sau xác thực: tenant, actor, actorKind vào log (không tên người, không tên đơn vị — R-SEC-10);
 *   - xong yêu cầu: một dòng log { route, method, status, ms, errCode } + bizcity_http_* (nhãn ít giá trị, R-OBS-4).
 */
import type { FastifyInstance } from 'fastify';
import { metrics } from './metrics.js';
import { BUILD_VERSION } from './version.js';

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;

export function registerObservability(app: FastifyInstance): void {
  metrics.buildInfo.set({ version: BUILD_VERSION.version, kernel: BUILD_VERSION.kernel, standard: BUILD_VERSION.standard ?? '' }, 1);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    const tp = req.headers.traceparent;
    const m = typeof tp === 'string' ? TRACEPARENT.exec(tp) : null;
    if (m) req.log = req.log.child({ traceId: m[1] });
  });

  // Sau authPlugin (onRequest): gắn danh tính vào log của yêu cầu.
  app.addHook('preHandler', async (req) => {
    const a = req.auth;
    if (a) req.log = req.log.child({ tenant: a.tenantId, actor: a.actor, actorKind: a.kind });
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? 'unmatched';
    const status = reply.statusCode;
    const seconds = reply.elapsedTime / 1000;
    metrics.httpRequests.inc({ method: req.method, route, status: String(status) });
    metrics.httpDuration.observe({ method: req.method, route }, seconds);
    if (reply.errCode) metrics.httpErrors.inc({ code: reply.errCode });
    req.log.info({ route, method: req.method, status, ms: Math.round(reply.elapsedTime), ...(reply.errCode ? { errCode: reply.errCode } : {}) }, 'xong yêu cầu');
  });
}
