// @bizcity-layer P observability
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * GET /metrics — số đo Prometheus (docs/ops/OBSERVABILITY.md §3). Không qua nginx ra ngoài (chỉ /api/ và /mcp được chuyển);
 * đặt METRICS_TOKEN thì phải gửi Authorization: Bearer <token> (R-OBS-3). Trước khi trả: chạy các bộ thu đến hạn
 * (sổ cái do Kernel đăng ký; kết quả tự chẩn đoán gần nhất; pool kết nối).
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db, pool } from '../../db/client.js';
import { env } from '../../config/env.js';
import { Errors } from '../../core/errors.js';
import { collect, metrics, registerCollector, renderMetrics } from '../../core/metrics.js';

/** Lượt tự chẩn đoán gần nhất của mỗi đơn vị, cộng số kiểm error theo tầng (cảnh báo LedgerIntegrityError). */
async function collectDiagnostics(): Promise<void> {
  const rows = await sql<{ layer: string; errors: number }>`
    SELECT layer, sum(error_count)::int AS errors FROM (
      SELECT DISTINCT ON (tenant_id, layer) tenant_id, layer, error_count FROM diagnostic_runs ORDER BY tenant_id, layer, id DESC
    ) x GROUP BY layer`.execute(db);
  const got = new Map(rows.rows.map((r) => [r.layer, r.errors]));
  for (const layer of ['L1', 'L3']) metrics.diagnosticsErrors.set({ layer }, got.get(layer) ?? 0);
}

function tokenOk(header: string | undefined): boolean {
  if (!env.METRICS_TOKEN) return true;
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(env.METRICS_TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  registerCollector('diagnostics', collectDiagnostics);
  app.get('/metrics', {
    config: { public: true },
    schema: { tags: ['Hệ thống'], summary: 'Số đo Prometheus (nội bộ; METRICS_TOKEN nếu đặt)', security: [] },
    handler: async (req, reply) => {
      if (!tokenOk(req.headers.authorization)) throw Errors.unauthorized('Cần Authorization: Bearer <METRICS_TOKEN>');
      await collect(req.log);
      metrics.dbPool.set({ state: 'total' }, pool.totalCount);
      metrics.dbPool.set({ state: 'idle' }, pool.idleCount);
      metrics.dbPool.set({ state: 'waiting' }, pool.waitingCount);
      return reply.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics());
    },
  });
}
