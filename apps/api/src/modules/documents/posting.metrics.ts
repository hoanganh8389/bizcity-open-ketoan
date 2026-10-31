// @bizcity-layer K kernel/intake
// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — số đo ghi sổ đọc từ posting_log (chỉ phần đã commit), đơn vị theo dải hoạt động, đơn vị tồn đọng; không chạm đường ghi sổ
/**
 * Số đo ghi sổ cho Prometheus (PHASE-018 W1–W3, docs/ops/OBSERVABILITY.md §3). Đọc posting_log — nhật ký ghi CÙNG giao dịch với
 * bút toán — nên chỉ đếm những gì đã commit, mọi đường vào (HTTP, MCP, việc Kernel tự lập) như nhau, và đường ghi sổ không
 * phải làm thêm gì (K0). Không nhãn đơn vị / chứng từ (R-OBS-4): nhãn kẹp về tập cố định.
 *
 * Đọc tiếp từ mốc id: chỉ lấy dòng có created_at cũ hơn LAG_SECONDS — giao dịch đã mở trước mốc mà commit muộn hơn LAG_SECONDS
 * sẽ bị bỏ sót (bất thường; HighLatency đã báo). Mọi máy API đọc cùng một bảng nên thấy cùng số: cộng các máy bằng max, không sum.
 */
import { sql, type Transaction } from 'kysely';
import { DOC_TYPE_LIST, ERROR_CATALOG, type ErrorCode } from '@ketoan/contracts';
import { readWithTimeout } from '../../db/client.js';
import type { Database } from '../../db/types.js';
import { COLLECTOR_TIMEOUT_MS, metrics } from '../../core/metrics.js';

type Tx = Transaction<Database>;

const LAG_SECONDS = 60;
const ACTIONS = new Set(['receive', 'post', 'repost', 'error', 'cancel', 'cancel_request', 'unpost']);
const DOC_TYPES = new Set<string>(DOC_TYPE_LIST);
/** Từ chối đúng luật (kỳ khoá, không cân, thiếu cấu hình, dữ liệu sai, không có quyền) — không phải sự cố (D018-5). */
const BUSINESS = new Set(['ledger', 'input', 'state', 'auth']);

let watermark: number | null = null;

export function failureKind(code: string | null): 'rejected' | 'error' {
  const entry = code ? (ERROR_CATALOG as Record<string, { category: string } | undefined>)[code] : undefined;
  return entry && BUSINESS.has(entry.category) ? 'rejected' : 'error';
}

const docTypeLabel = (t: string) => (DOC_TYPES.has(t) ? t : 'other');
const codeLabel = (c: string | null) => (c && c in ERROR_CATALOG ? (c as ErrorCode) : 'OTHER');

export function collectPostingMetrics(lagSeconds = LAG_SECONDS): Promise<void> {
  return readWithTimeout(COLLECTOR_TIMEOUT_MS, async (tx) => {
    if (watermark === null) {
      // Lần đầu: bắt đầu từ cuối bảng — không đếm lịch sử (counter Prometheus bắt đầu từ 0 khi tiến trình khởi động).
      const r = await sql<{ id: string }>`SELECT COALESCE(max(id), 0)::text AS id FROM posting_log`.execute(tx);
      watermark = Number(r.rows[0]?.id ?? 0);
      return;
    }
    const from = watermark;
    const upper = await sql<{ id: string }>`
      SELECT COALESCE(max(id), ${from})::text AS id FROM posting_log
       WHERE id > ${from} AND created_at < now() - make_interval(secs => ${lagSeconds})`.execute(tx);
    const to = Number(upper.rows[0]?.id ?? from);
    if (to <= from) return;
    const rows = await sql<{ doc_type: string; action: string; code: string | null; n: number }>`
      SELECT pl.doc_type, pl.action, CASE WHEN pl.action = 'error' THEN e.error_code END AS code, count(*)::int AS n
        FROM posting_log pl
        LEFT JOIN accounting_events e ON pl.action = 'error' AND e.id = pl.event_id
       WHERE pl.id > ${from} AND pl.id <= ${to}
       GROUP BY 1, 2, 3`.execute(tx);
    for (const r of rows.rows) {
      if (!ACTIONS.has(r.action)) continue;
      metrics.postings.inc({ doc_type: docTypeLabel(r.doc_type), action: r.action }, r.n);
      if (r.action === 'error') metrics.postingFailures.inc({ code: codeLabel(r.code), kind: failureKind(r.code) }, r.n);
    }
    watermark = to;
  });
}

/** Dải hoạt động theo số dòng posting_log 24 giờ của một đơn vị. */
export function tenantBand(n: number): 'idle' | 'small' | 'medium' | 'large' {
  return n === 0 ? 'idle' : n <= 100 ? 'small' : n <= 1000 ? 'medium' : 'large';
}

/** id nhỏ nhất x sao cho dòng đầu tiên có id ≥ x là dòng gần đây — tìm nhị phân trên khoá chính (không có chỉ mục created_at riêng). */
async function firstIdSince(tx: Tx, sinceSeconds: number): Promise<number | null> {
  const b = await sql<{ lo: string | null; hi: string | null }>`SELECT min(id)::text AS lo, max(id)::text AS hi FROM posting_log`.execute(tx);
  let lo = Number(b.rows[0]?.lo ?? NaN);
  let hi = Number(b.rows[0]?.hi ?? NaN);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const recent = async (id: number) =>
    (await sql<{ recent: boolean }>`
      SELECT created_at >= now() - make_interval(secs => ${sinceSeconds}) AS recent FROM posting_log WHERE id >= ${id} ORDER BY id LIMIT 1`
      .execute(tx)).rows[0]?.recent === true;
  if (!(await recent(hi))) return null;
  // Điều kiện đơn điệu theo x; không có id nào trong [x, dòng đầu) nên đếm "id ≥ x" đúng bằng đếm từ dòng đầu.
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await recent(mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/** Đơn vị theo dải + đơn vị tồn đọng. Chạy thưa (15 phút) vì đếm cả 24 giờ posting_log. */
export function collectTenantMetrics(): Promise<void> {
  return readWithTimeout(COLLECTOR_TIMEOUT_MS, async (tx) => {
    const counts = new Map<string, number>();
    const from = await firstIdSince(tx, 24 * 3600);
    if (from !== null) {
      const rows = await sql<{ tenant_id: string; n: number }>`
        SELECT tenant_id::text, count(*)::int AS n FROM posting_log WHERE id >= ${from} GROUP BY tenant_id`.execute(tx);
      for (const r of rows.rows) counts.set(r.tenant_id, r.n);
    }
    const all = await sql<{ id: string }>`SELECT id::text FROM tenants`.execute(tx);
    const bands = { idle: 0, small: 0, medium: 0, large: 0 };
    for (const t of all.rows) bands[tenantBand(counts.get(t.id) ?? 0)] += 1;
    for (const [band, n] of Object.entries(bands)) metrics.tenants.set({ band }, n);
    const backlog = await sql<{ n: number }>`
      SELECT count(DISTINCT tenant_id)::int AS n FROM accounting_events
       WHERE status IN ('pending', 'error') AND received_at < now() - interval '1 hour'`.execute(tx);
    metrics.tenantsWithBacklog.set({}, backlog.rows[0]?.n ?? 0);
  });
}

/** Test: đặt lại mốc đọc như tiến trình mới khởi động. */
export function resetPostingWatermark(): void {
  watermark = null;
}
