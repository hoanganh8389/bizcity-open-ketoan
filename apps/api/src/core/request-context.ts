// @bizcity-layer P observability
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
/**
 * Ngữ cảnh của yêu cầu đang chạy (AsyncLocalStorage): mã yêu cầu + mã tương quan, để bằng chứng (audit_logs.correlation_id)
 * và sự kiện miền (event_outbox.correlation_id) tự gắn mà không phải truyền qua từng hàm (C-8, bizcity_event@1 §3).
 *
 * - correlationId = header X-Correlation-Id hợp lệ (Cell / MCP gửi cùng một mã cho cả hội thoại), không thì = mã yêu cầu.
 * - Ngoài yêu cầu HTTP (dispatcher, đồng hồ, script) thì không có ngữ cảnh: người gọi tự truyền, hoặc để NULL.
 * - tenantId: gán sau khi xác thực (core/auth.ts). Pool CSDL (db/client.ts) đặt bizcity.tenant_id theo giá trị này mỗi lần mượn
 *   kết nối → RLS (migration 0041) chỉ cho thấy dữ liệu của đơn vị đó, kể cả khi một truy vấn quên lọc tenant_id (PHASE-007).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  /** Đơn vị của người gọi (đã xác thực); chưa có = chưa xác thực / việc nền. */
  tenantId?: string;
}

const store = new AsyncLocalStorage<RequestContext>();
const ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function currentRequest(): RequestContext | undefined {
  return store.getStore();
}

/** Chạy fn trong một ngữ cảnh (dispatcher dùng để subscriber kế thừa mã tương quan của sự kiện). */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function registerRequestContext(app: FastifyInstance): void {
  // Hook dạng callback: done() chạy bên trong store.run nên mọi hook / handler sau đó thấy ngữ cảnh.
  app.addHook('onRequest', (req, reply, done) => {
    const h = req.headers['x-correlation-id'];
    const v = Array.isArray(h) ? h[0] : h;
    const correlationId = v && ID.test(v) ? v : String(req.id);
    reply.header('x-correlation-id', correlationId);
    store.run({ requestId: String(req.id), correlationId }, done);
  });
}
