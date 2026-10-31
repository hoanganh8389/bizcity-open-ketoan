// @bizcity-layer K kernel/ledger
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * Số đo sổ cái cho Prometheus (docs/ops/OBSERVABILITY.md §3) — Kernel đăng ký vào bộ thu của Platform lúc lắp ráp (app.ts).
 * Đếm trên MỌI đơn vị, không nhãn tenant (R-OBS-4). Chạy tối đa một lần / 60 giây khi Prometheus đọc /metrics.
 */
import { sql } from 'kysely';
import { db } from '../../db/client.js';
import { metrics } from '../../core/metrics.js';

const STATUSES = ['posted', 'pending', 'error', 'cancelled'];

export async function collectLedgerMetrics(): Promise<void> {
  const byStatus = await sql<{ status: string; n: number }>`SELECT status, count(*)::int AS n FROM accounting_events GROUP BY status`.execute(db);
  const counts = new Map(byStatus.rows.map((r) => [r.status, r.n]));
  for (const s of new Set([...STATUSES, ...counts.keys()])) metrics.ledgerEvents.set({ status: s }, counts.get(s) ?? 0);
  const oldest = await sql<{ age: number | null }>`
    SELECT extract(epoch FROM now() - min(received_at))::float AS age FROM accounting_events WHERE status IN ('pending', 'error')`.execute(db);
  metrics.ledgerOldestPending.set({}, Number(oldest.rows[0]?.age ?? 0));
  const entries = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_entries WHERE created_at > now() - interval '24 hours'`.execute(db);
  metrics.ledgerEntries24h.set({}, entries.rows[0]?.n ?? 0);
}
