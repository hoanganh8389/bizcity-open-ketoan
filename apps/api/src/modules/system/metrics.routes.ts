// @bizcity-layer P observability
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — đối soát: số kiểm theo kết quả, mốc chạy / thành công gần nhất theo tầng; trần pool bizcity_db_pool_max
/**
 * GET /metrics — số đo Prometheus (docs/ops/OBSERVABILITY.md §3). Không qua nginx ra ngoài (chỉ /api/ và /mcp được chuyển);
 * đặt METRICS_TOKEN thì phải gửi Authorization: Bearer <token> (R-OBS-3). Trước khi trả: chạy các bộ thu đến hạn
 * (sổ cái do Kernel đăng ký; kết quả tự chẩn đoán gần nhất; pool kết nối).
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql, type Transaction } from 'kysely';
import { pool, readWithTimeout } from '../../db/client.js';
import type { Database } from '../../db/types.js';
import { env } from '../../config/env.js';
import { Errors } from '../../core/errors.js';
import { COLLECTOR_TIMEOUT_MS, collect, metrics, registerCollector, renderMetrics } from '../../core/metrics.js';

const DIAG_OUTCOMES = ['pass', 'empty', 'info', 'warn', 'error'] as const;

/**
 * Lượt tự chẩn đoán gần nhất của mỗi đơn vị, cộng theo tầng: số kiểm error (LedgerIntegrityError), số kiểm theo kết quả
 * (summary của lượt), mốc chạy / thành công gần nhất (ReconciliationStale). Chi tiết từng kiểm ở diagnostic_runs (có quyền).
 */
function collectDiagnostics(): Promise<void> {
  return readWithTimeout(COLLECTOR_TIMEOUT_MS, (tx) => collectDiagnosticsIn(tx));
}

async function collectDiagnosticsIn(tx: Transaction<Database>): Promise<void> {
  const rows = await sql<{ layer: string; errors: number } & Record<(typeof DIAG_OUTCOMES)[number], number>>`
    SELECT layer, sum(error_count)::int AS errors,
           sum(COALESCE((summary->>'pass')::int, 0))::int AS pass, sum(COALESCE((summary->>'empty')::int, 0))::int AS empty,
           sum(COALESCE((summary->>'info')::int, 0))::int AS info, sum(COALESCE((summary->>'warn')::int, 0))::int AS warn,
           sum(COALESCE((summary->>'error')::int, 0))::int AS error
      FROM (SELECT DISTINCT ON (tenant_id, layer) tenant_id, layer, error_count, summary FROM diagnostic_runs ORDER BY tenant_id, layer, id DESC) x
     GROUP BY layer`.execute(tx);
  const got = new Map(rows.rows.map((r) => [r.layer, r]));
  const times = await sql<{ layer: string; last_run: number | null; last_ok: number | null }>`
    SELECT layer, extract(epoch FROM max(created_at))::float AS last_run,
           extract(epoch FROM max(created_at) FILTER (WHERE error_count = 0))::float AS last_ok
      FROM diagnostic_runs GROUP BY layer`.execute(tx);
  const at = new Map(times.rows.map((r) => [r.layer, r]));
  for (const layer of ['L1', 'L3']) {
    const r = got.get(layer);
    metrics.diagnosticsErrors.set({ layer }, r?.errors ?? 0);
    for (const result of DIAG_OUTCOMES) metrics.diagnosticsChecks.set({ layer, result }, r?.[result] ?? 0);
    // Chưa từng chạy thì không đặt mốc — Prometheus thấy "không có dữ liệu", không phải 0 (= năm 1970).
    const t = at.get(layer);
    if (t?.last_run != null) metrics.diagnosticsLastRun.set({ layer }, Number(t.last_run));
    if (t?.last_ok != null) metrics.diagnosticsLastSuccess.set({ layer }, Number(t.last_ok));
  }
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
      metrics.dbPoolMax.set({}, pool.options.max ?? 10);
      return reply.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics());
    },
  });
}
