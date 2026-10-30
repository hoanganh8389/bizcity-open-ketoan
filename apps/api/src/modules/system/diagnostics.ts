// @bizcity-layer P cli
/**
 * TỰ CHẨN ĐOÁN (RULE-SELF-DIAGNOSTICS, docs/ops/DIAGNOSTICS.md §2) — phần Platform: kiểu một kiểm, sổ đăng ký, bộ chạy, lưu kết quả.
 * Platform không biết kế toán (LAYOUT-1): kiểm sổ (LEDGER_*, EVENT_*, LEDGER_TRIGGERS) do Kernel khai ở
 * modules/ledger/ledger.diagnostics.ts và được đăng ký lúc lắp ráp (app.ts). Ở đây có kiểm chung của Platform: L1 (migration, CSDL
 * ghi được) và chuỗi băm bằng chứng (L3, EVIDENCE_CHAIN).
 *
 *   L1 Sẵn sàng   GET /api/v1/system/health/ready (công khai, chỉ trả mã + đạt / không — không lộ số liệu)
 *   L3 Toàn vẹn   GET /api/v1/system/diagnostics; chạy trước khi khoá kỳ (R-DIAG-4)
 *
 * Luật: chỉ đọc — mọi kiểm chạy trong giao dịch READ ONLY (R-DIAG-2); cùng mã với lane diagnostics của bộ kiểm chuẩn (R-DIAG-1,
 * R-DIAG-9, check SC-DIAG-1); kiểm không có gì để xét là "rỗng", không phải "đạt" (R-DIAG-7); mẫu chỉ là khoá chứng từ / số bút toán,
 * không số tiền, không tên khách (R-DIAG-6).
 */
import { sql } from 'kysely';
import type { Kysely, RawBuilder, Transaction } from 'kysely';
import { db } from '../../db/client.js';
import type { Database } from '../../db/types.js';
import { pendingMigrations } from '../../db/migrate.js';

export type DiagLayer = 'L1' | 'L3';
export type DiagLevel = 'error' | 'warn' | 'info';
export type DiagOutcome = 'pass' | 'empty' | DiagLevel;

/** Phạm vi một lần chạy: cả sổ của đơn vị, hoặc một khoảng ngày hạch toán (khoá kỳ), một chi nhánh. */
export interface DiagScope {
  tenantId: string;
  from?: string;
  to?: string;
  branchId?: string;
}

export interface DiagCheck {
  /** Mã ổn định, trùng mã ở DIAGNOSTICS.md §2 và metrics.code của check DG-* (R-DIAG-1). */
  code: string;
  layer: DiagLayer;
  /** Mức khi có chỗ sai. */
  level: DiagLevel;
  title: string;
  /** Hậu quả và cách sửa, một câu tiếng Việt (R-DIAG-1). */
  fix: string;
  /** Có xét được theo khoảng ngày không (kiểm cả bản cài như migration thì không). */
  scoped: boolean;
  run(trx: Transaction<Database>, scope: DiagScope): Promise<{ examined: number; count: number; sample: string[] }>;
}

export interface DiagResult {
  code: string;
  level: DiagOutcome;
  title: string;
  fix: string;
  examined: number;
  count: number;
  sample: string[];
}

export interface DiagReport {
  layer: DiagLayer;
  at: string;
  scope: { from?: string; to?: string; branchCode?: string };
  summary: Record<DiagOutcome, number>;
  checks: DiagResult[];
}

const SAMPLE = 20;
const registry = new Map<string, DiagCheck>();

/** Đăng ký kiểm (Kernel, module sau này). Cùng mã đăng ký lại thì thay — buildApp chạy nhiều lần trong test. */
export function registerDiagnostics(checks: DiagCheck[]): void {
  for (const c of checks) registry.set(c.code, c);
}

export function listDiagnostics(layer?: DiagLayer): DiagCheck[] {
  return [...registry.values()].filter((c) => !layer || c.layer === layer);
}

/** Chạy các kiểm của một tầng trong giao dịch READ ONLY (R-DIAG-2). Kiểm lỗi SQL thì ghi là error kèm thông báo, không dừng cả lượt. */
export async function runDiagnostics(scope: DiagScope, opts: { layer: DiagLayer; codes?: string[]; branchCode?: string; db?: Kysely<Database> }): Promise<DiagReport> {
  const conn = opts.db ?? db; // test truyền kết nối riêng: chạy được sau khi tệp test đã đóng pool chung
  const checks = listDiagnostics(opts.layer).filter((c) => !opts.codes || opts.codes.includes(c.code));
  const results: DiagResult[] = [];
  for (const c of checks) {
    // Mỗi kiểm một giao dịch riêng: một kiểm lỗi SQL không làm hỏng giao dịch của kiểm sau.
    try {
      const r = await conn.transaction().execute(async (trx) => {
        await sql`SET TRANSACTION READ ONLY`.execute(trx);
        return c.run(trx, scope);
      });
      const level: DiagOutcome = r.count > 0 ? c.level : r.examined === 0 ? 'empty' : 'pass';
      results.push({ code: c.code, level, title: c.title, fix: c.fix, examined: r.examined, count: r.count, sample: r.sample.slice(0, SAMPLE) });
    } catch (err) {
      results.push({ code: c.code, level: 'error', title: c.title, fix: `Kiểm không chạy được: ${(err as Error).message}`, examined: 0, count: 1, sample: [] });
    }
  }
  const summary: Record<DiagOutcome, number> = { pass: 0, empty: 0, info: 0, warn: 0, error: 0 };
  for (const r of results) summary[r.level]++;
  return {
    layer: opts.layer,
    at: new Date().toISOString(),
    scope: { from: scope.from, to: scope.to, branchCode: opts.branchCode },
    summary,
    checks: results,
  };
}

/** Lưu một lượt vào diagnostic_runs (chỉ thêm, R-DIAG-5). */
export async function saveDiagnosticRun(report: DiagReport, meta: { tenantId: string; actor: string; trigger: 'manual' | 'period-lock' | 'schedule' | 'release' }): Promise<string> {
  const row = await db
    .insertInto('diagnostic_runs')
    .values({
      tenant_id: meta.tenantId,
      layer: report.layer,
      trigger: meta.trigger,
      scope: JSON.stringify(report.scope),
      summary: JSON.stringify(report.summary),
      checks: JSON.stringify(report.checks),
      error_count: report.summary.error,
      actor: meta.actor,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * Tiện ích cho kiểm viết bằng SQL: `examined` trả { n } (số đơn vị đã xét), `bad` trả { key, total } các chỗ sai —
 * `total` = count(*) OVER () để biết tổng khi `bad` đã LIMIT lấy mẫu.
 */
export async function sqlCounts(trx: Transaction<Database>, examined: RawBuilder<unknown>, bad: RawBuilder<unknown>) {
  const n = Number(((await examined.execute(trx)).rows[0] as { n?: number } | undefined)?.n ?? 0);
  const rows = (await bad.execute(trx)).rows as { key: string; total: number }[];
  return { examined: n, count: Number(rows[0]?.total ?? 0), sample: rows.map((r) => String(r.key)) };
}

/** Kiểm L1 chung của Platform. */
export const PLATFORM_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'MIGRATIONS_PENDING', layer: 'L1', level: 'error', scoped: false,
    title: 'Mọi tệp db/migrations đã áp vào CSDL',
    fix: 'Code mới cần bảng / cột chưa có, màn hình sẽ lỗi. Chạy job db-migrate (docker compose up db-migrate) hoặc npm run db:migrate.',
    async run() {
      const pending = await pendingMigrations();
      return { examined: 1, count: pending.length, sample: pending };
    },
  },
  {
    code: 'DB_WRITABLE', layer: 'L1', level: 'error', scoped: false,
    title: 'CSDL là bản chính, ghi được (không phải bản sao chỉ đọc)',
    fix: 'API đang nối vào bản sao chỉ đọc hoặc CSDL đang khôi phục: không nhận chứng từ được. Kiểm DATABASE_URL trỏ đúng máy chủ chính.',
    async run(trx) {
      const r = await sql<{ recovery: boolean }>`SELECT pg_is_in_recovery() AS recovery`.execute(trx);
      return { examined: 1, count: r.rows[0]?.recovery ? 1 : 0, sample: r.rows[0]?.recovery ? ['pg_is_in_recovery'] : [] };
    },
  },
  {
    // bizcity_evidence@1 STD-EVD-2: chuỗi băm theo đơn vị (migration 0036). Có khoảng ngày thì chỉ băm lại dòng trong khoảng
    // (phần tốn nhất), nhưng nối chuỗi vẫn xét trên cả chuỗi.
    code: 'EVIDENCE_CHAIN', layer: 'L3', level: 'error', scoped: true,
    title: 'Chuỗi băm bằng chứng liền mạch: mỗi dòng băm đúng, nối đúng dòng trước, không hở số thứ tự',
    fix: 'Có dòng nhật ký thao tác bị sửa / xoá ngoài ứng dụng (vượt trigger chỉ thêm). Không sửa lại; khoanh vùng theo mã dòng, đối chiếu bản sao lưu, báo nhóm Lõi (RULE-SECURITY).',
    run: (trx, s) => {
      const range = sql.join([
        sql`true`,
        ...(s.from ? [sql`a.created_at >= ${s.from}::date`] : []),
        ...(s.to ? [sql`a.created_at < ${s.to}::date + 1`] : []),
      ], sql` AND `);
      return sqlCounts(trx,
        sql`SELECT count(*)::int AS n FROM audit_logs a WHERE a.tenant_id = ${s.tenantId} AND a.chain_seq IS NOT NULL AND ${range}`,
        sql`WITH c AS (SELECT id, chain_seq, lag(hash) OVER w AS lag_hash, lag(chain_seq) OVER w AS lag_seq
                         FROM audit_logs WHERE tenant_id = ${s.tenantId} AND chain_seq IS NOT NULL WINDOW w AS (ORDER BY chain_seq))
            SELECT a.id::text AS key, count(*) OVER ()::int AS total FROM c JOIN audit_logs a ON a.id = c.id
             WHERE ${range}
               AND (a.hash IS DISTINCT FROM audit_log_hash(a) OR a.prev_hash IS DISTINCT FROM c.lag_hash OR c.chain_seq <> coalesce(c.lag_seq, 0) + 1)
             ORDER BY c.chain_seq LIMIT 20`);
    },
  },
  {
    // PHASE-007 (migration 0041), STD-DATA-1: bảng có tenant_id thiếu RLS / FORCE / chính sách là lỗ hổng cô lập đơn vị.
    code: 'TENANT_ISOLATION', layer: 'L1', level: 'error', scoped: false,
    title: 'Mọi bảng có tenant_id bật RLS + FORCE + có chính sách (đơn vị A không đọc / ghi được dữ liệu đơn vị B)',
    fix: 'Bảng mới có tenant_id mà chưa có chính sách RLS: thêm migration ENABLE / FORCE ROW LEVEL SECURITY + CREATE POLICY tenant_isolation theo khuôn 0041. Không tắt RLS để "chữa cháy".',
    async run(trx) {
      const r = await sql<{ name: string; rls: boolean; force: boolean; policy: boolean }>`
        SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
                 EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS policy
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
             AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)`.execute(trx);
      const bad = r.rows.filter((x) => !(x.rls && x.force && x.policy)).map((x) => x.name);
      return { examined: r.rows.length, count: bad.length, sample: bad.slice(0, 20) };
    },
  },
  {
    // bizcity_event@1 §5, R-OUTBOX-3: việc giao hết lượt thử thì nằm im — phải có người xem.
    code: 'EVENT_DEAD', layer: 'L3', level: 'warn', scoped: true,
    title: 'Không có sự kiện hết lượt giao (dead) chưa xử lý',
    fix: 'Một nơi nhận (subscriber) lỗi liên tục nên sự kiện dừng giao. Xem lỗi ở GET /api/v1/system/events, sửa nguyên nhân (kết nối, cấu hình) rồi phát lại: POST /api/v1/system/events/replay.',
    run: (trx, s) => {
      const range = sql.join([
        sql`true`,
        ...(s.from ? [sql`o.occurred_at >= ${s.from}::date`] : []),
        ...(s.to ? [sql`o.occurred_at < ${s.to}::date + 1`] : []),
      ], sql` AND `);
      return sqlCounts(trx,
        sql`SELECT count(*)::int AS n FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id WHERE o.tenant_id = ${s.tenantId} AND ${range}`,
        sql`SELECT d.consumer || ':' || o.type || ':' || o.subject AS key, count(*) OVER ()::int AS total
              FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id
             WHERE o.tenant_id = ${s.tenantId} AND d.status = 'dead' AND ${range}
             ORDER BY o.seq LIMIT 20`);
    },
  },
];

registerDiagnostics(PLATFORM_DIAGNOSTICS);
