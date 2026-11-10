// @bizcity-layer P cli
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: remedy có cấu trúc cho từng kiểm (bizcity_remedy@1, R-FIX-1).
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — tầng L5 (Tuân thủ, Conformance Engine ADR-0012 T1): chạy được bằng runDiagnostics, không lưu vào diagnostic_runs (ảnh chụp ở conformance_runs).
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/system/diagnostics.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
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
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: DiagCheck.remedy (bizcity_remedy@1, R-FIX-1) — kết quả chẩn đoán trả kèm phương án khắc phục có cấu trúc.
import { sql } from 'kysely';
import type { Remedy } from '@ketoan/contracts';
import type { Kysely, RawBuilder, Transaction } from 'kysely';
import { db } from '../db/client.js';
import type { Database } from '../db/types.js';
import { pendingMigrations } from '../db/migrate.js';
import { SCREENS, STOP_THE_LINE_STEP } from '@ketoan/contracts';
// [2026-11-09 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-1 (S032-27): tự chẩn đoán L3 lúc 01:00 mỗi đêm, khuôn subscriber như core.conformance-nightly
import { defineSubscriber } from '../core/events.js';

/** L1 sẵn sàng · L3 toàn vẹn sổ · L5 tuân thủ cấu hình (Conformance Engine, ADR-0012) — RULE-SELF-DIAGNOSTICS §1. */
export type DiagLayer = 'L1' | 'L3' | 'L5';
export type DiagLevel = 'error' | 'warn' | 'info';
export type DiagOutcome = 'pass' | 'empty' | DiagLevel;

// [2026-11-10 09:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2 (S032-35): phép kiểm trỏ điều kiện khoá sổ closeRef (RULE-SELF-DIAGNOSTICS §2b, PHASE-032 · 70 §3a)
/** Kỳ kiểm: hằng ngày · hằng tuần · cuối tháng (R-DIAG-11). Ngày và tuần chỉ nhắc việc, không chặn. */
export type DiagCadence = 'day' | 'week' | 'period';
/** Bước của khoá sổ: trước kết chuyển · sau kết chuyển · lúc khoá. */
export type DiagStage = 'pre' | 'post' | 'lock';
/** Mức khi khoá kỳ, lời kế toán (R-DIAG-12): chặn khoá sổ · cần giải trình · để biết. */
export type CloseSeverity = 'block' | 'explain' | 'note';

/**
 * Điều kiện khoá sổ (PC, R-DIAG-10). Sổ PC là kiến thức kế toán nên Kernel khai (periods/close-conditions.ts); Platform chỉ giữ sổ
 * đăng ký, cùng khuôn registerDiagnostics (LAYOUT-1). Kỳ kiểm và bước khoá đặt ở PC, phép kiểm chỉ trỏ closeRef.
 */
export interface CloseCondition {
  code: `PC-${string}`;
  /** Tên bằng lời kế toán. */
  title: string;
  cadence: DiagCadence[];
  stage: DiagStage;
  /** Không phép kiểm nào nuôi PC này: hôm nay kiểm bằng gì (kế toán kiểm tay, trigger, closing.service, việc S032-n sẽ thêm). */
  checkedElsewhere?: string;
}

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
  /** Phương án khắc phục có cấu trúc: bước, màn, vai, kiểm lại (R-FIX-1; SC-FIX-1 bắt buộc với mức warn / error). */
  remedy?: Remedy;
  /** Có xét được theo khoảng ngày không (kiểm cả bản cài như migration thì không). */
  scoped: boolean;
  /** Điều kiện khoá sổ mà phép kiểm nuôi (R-DIAG-10); 'none' = việc vận hành, không thuộc khoá sổ. */
  closeRef?: `PC-${string}` | 'none';
  /** Chỉ khi khác kỳ kiểm của PC. */
  cadence?: DiagCadence[];
  /** Chỉ khi khác bước của PC. */
  stage?: DiagStage;
  /** Mức khi khoá kỳ theo kết quả (R-DIAG-12); chỉ gọi khi có chỗ sai. Không khai thì theo defaultSeverityAtClose. */
  severityAtClose?: (r: { count: number; sample: string[] }) => CloseSeverity;
  run(trx: Transaction<Database>, scope: DiagScope): Promise<{ examined: number; count: number; sample: string[] }>;
}

export interface DiagResult {
  code: string;
  level: DiagOutcome;
  title: string;
  fix: string;
  remedy?: Remedy;
  examined: number;
  count: number;
  sample: string[];
  /** Mã PC hoặc 'none' (R-DIAG-10). Lượt lưu trước B2c-2 không có. */
  closeRef?: string;
  /** Tên PC, để màn không phải tra. */
  closeTitle?: string;
  /** Đã gộp: của phép kiểm, không có thì của PC. */
  cadence?: DiagCadence[];
  stage?: DiagStage;
  /** Chỉ khi có chỗ sai (error / warn / info). */
  atClose?: CloseSeverity;
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

const closeConditions = new Map<string, CloseCondition>();

/** Đăng ký điều kiện khoá sổ (Kernel lúc lắp ráp). Cùng mã đăng ký lại thì thay — buildApp chạy nhiều lần trong test. */
export function registerCloseConditions(list: CloseCondition[]): void {
  for (const p of list) closeConditions.set(p.code, p);
}

export function listCloseConditions(): CloseCondition[] {
  return [...closeConditions.values()];
}

/**
 * Mức khi khoá kỳ mặc định — đúng khoá thật hôm nay (R-DIAG-4): lỗi thì phải ghi lý do khi khoá, còn lại để biết.
 * 'block' chỉ có hiệu lực cùng danh sách D032-11 ở S032-30; B2c-2 chỉ hiện mức, không đổi khoá kỳ.
 */
export function defaultSeverityAtClose(level: DiagLevel): CloseSeverity {
  return level === 'error' ? 'explain' : 'note';
}

/** Gộp trường khoá sổ vào một kết quả: PC (tên, kỳ kiểm, bước) và mức khi khoá nếu có chỗ sai. */
function closeFields(c: DiagCheck, level: DiagOutcome, r: { count: number; sample: string[] }): Partial<DiagResult> {
  const pc = c.closeRef && c.closeRef !== 'none' ? closeConditions.get(c.closeRef) : undefined;
  const cadence = c.cadence ?? pc?.cadence;
  const stage = c.stage ?? pc?.stage;
  const bad = level === 'error' || level === 'warn' || level === 'info';
  return {
    ...(c.closeRef ? { closeRef: c.closeRef } : {}),
    ...(pc ? { closeTitle: pc.title } : {}),
    ...(cadence ? { cadence } : {}),
    ...(stage ? { stage } : {}),
    ...(bad ? { atClose: c.severityAtClose ? c.severityAtClose(r) : defaultSeverityAtClose(level) } : {}),
  };
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
      results.push({ code: c.code, level, title: c.title, fix: c.fix, remedy: c.remedy, examined: r.examined, count: r.count, sample: r.sample.slice(0, SAMPLE), ...closeFields(c, level, r) });
    } catch (err) {
      results.push({ code: c.code, level: 'error', title: c.title, fix: `Kiểm không chạy được: ${(err as Error).message}`, examined: 0, count: 1, sample: [], ...closeFields(c, 'error', { count: 1, sample: [] }) });
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

/**
 * Tự chẩn đoán L3 mỗi đêm (PHASE-032 B2c-1, S032-27): đồng hồ ngày phát lúc 01:00 giờ VN, mỗi đơn vị một lượt, cả sổ.
 * Lưu lượt với trigger 'schedule', người chạy 'system:nightly'. Sáng ra thẻ Việc hôm nay (HT08) đọc lượt này, không phải chạy lại.
 * runDiagnostics tự mở giao dịch READ ONLY riêng (R-DIAG-2); RLS theo đơn vị nhờ ngữ cảnh yêu cầu của dispatcher.
 */
export const diagnosticsNightlySubscriber = defineSubscriber({
  id: 'core.diagnostics-nightly',
  module: 'bizcity.platform',
  on: ['bizcity.clock.daily'],
  retry: { maxAttempts: 3 },
  async handle(ctx) {
    const report = await runDiagnostics({ tenantId: ctx.tenantId }, { layer: 'L3' });
    await saveDiagnosticRun(report, { tenantId: ctx.tenantId, actor: 'system:nightly', trigger: 'schedule' });
  },
});

// [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B4a (S032-31 phần xem): kết quả từng tuần gom từ lượt tự kiểm L3 đã lưu, tuần ISO tách theo tháng, chỉ đọc
/** Một việc còn mở ở cuối một lát tuần: kiểm nào, mức gì, bao nhiêu chỗ, có từ ngày nào (liên tục qua các lượt). */
export interface WeekIssue { code: string; title: string; level: DiagOutcome; count: number; since: string; owner?: string; closeTitle?: string }
/** Kết quả một lát tuần = (tuần ISO × tháng): tuần vắt hai tháng tách hai lát, mỗi tháng có đủ tuần của chính nó (PHASE-032 · 60 §9.1). */
export interface WeekResult {
  week: string;          // 2026-W45
  period: string;        // 2026-11
  from: string;          // ngày đầu của lát (thứ Hai hoặc mùng 1)
  to: string;            // ngày cuối của lát (Chủ nhật hoặc cuối tháng)
  runs: number;          // số lượt tự kiểm cả sổ trong lát
  days: number;          // số ngày có lượt
  lastAt: string;        // giờ của lượt cuối lát — kết quả lát = kết quả lượt này
  applicable: number;    // phép kiểm có dữ liệu để xét (bỏ "rỗng", R-DIAG-7)
  passed: number;
  errors: number;        // lỗi toàn vẹn còn mở cuối lát
  open: WeekIssue[];
  opened: string[];      // mã mới so với lượt cuối của lát trước
  closed: string[];      // mã đã hết so với lượt cuối của lát trước
  oldestDays: number | null;
}

const VN_DAY = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const dayNum = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86400_000);
const dayStr = (n: number) => new Date(n * 86400_000).toISOString().slice(0, 10);
/** Tuần ISO 8601 của một ngày (YYYY-MM-DD): thứ Hai đầu tuần, tuần 1 chứa thứ Năm đầu tiên của năm. */
function isoWeek(s: string): { week: string; monday: number } {
  const n = dayNum(s);
  const dow = (new Date(n * 86400_000).getUTCDay() + 6) % 7; // 0 = thứ Hai
  const monday = n - dow;
  const thursday = new Date((monday + 3) * 86400_000);
  const y = thursday.getUTCFullYear();
  const w = Math.floor((dayNum(thursday.toISOString().slice(0, 10)) - dayNum(`${y}-01-01`)) / 7) + 1;
  return { week: `${y}-W${String(w).padStart(2, '0')}`, monday };
}

/**
 * Kết quả từng tuần (PHASE-032 B4a). Chỉ đọc diagnostic_runs: lượt L3 cả sổ (không khoảng ngày, không chi nhánh — lượt đêm
 * core.diagnostics-nightly và Kiểm lại tất cả). Kết quả lát = lượt cuối của lát; việc mới / đã đóng so với lượt cuối lát trước;
 * "có từ" = lượt đầu tiên của chuỗi lượt liên tục còn báo mã đó. Lượt giữ 90 ngày (R-DIAG-5): xem được khoảng 12 tuần gần nhất;
 * bản lưu tuần lâu dài là bước B4b.
 */
export async function weeklyDiagnostics(tenantId: string, opts: { weeks?: number; db?: Kysely<Database> } = {}): Promise<WeekResult[]> {
  const conn = opts.db ?? db;
  const rows = await conn.selectFrom('diagnostic_runs').select(['id', 'checks', 'created_at'])
    .where('tenant_id', '=', tenantId).where('layer', '=', 'L3')
    .where(sql<boolean>`coalesce(scope->>'from', '') = '' AND coalesce(scope->>'to', '') = '' AND coalesce(scope->>'branchCode', '') = ''`)
    .orderBy('created_at').orderBy('id').execute();
  type Bad = Map<string, DiagResult>;
  const since = new Map<string, string>();
  const slices = new Map<string, { week: string; period: string; from: string; to: string; runs: number; days: Set<string>; last: DiagResult[]; lastAt: string; lastBad: Bad; prevBad: Bad | null; since: Map<string, string> }>();
  let prevKey = '';
  for (const r of rows) {
    const at = new Date(r.created_at as unknown as string);
    const day = VN_DAY(at);
    const { week, monday } = isoWeek(day);
    const period = day.slice(0, 7);
    const k = `${week}|${period}`;
    const checks = (r.checks as unknown as DiagResult[]) ?? [];
    const bad: Bad = new Map(checks.filter((c) => c.level === 'warn' || c.level === 'error' || c.level === 'info').map((c) => [c.code, c]));
    for (const code of [...since.keys()]) if (!bad.has(code)) since.delete(code);
    for (const code of bad.keys()) if (!since.has(code)) since.set(code, day);
    let s = slices.get(k);
    if (!s) {
      // Lát = tuần ∩ tháng: từ max(thứ Hai, mùng 1) đến min(Chủ nhật, cuối tháng).
      const first = dayNum(`${period}-01`);
      const [py, pm] = period.split('-').map(Number) as [number, number];
      const last = dayNum(pm === 12 ? `${py + 1}-01-01` : `${py}-${String(pm + 1).padStart(2, '0')}-01`) - 1;
      s = { week, period, from: dayStr(Math.max(monday, first)), to: dayStr(Math.min(monday + 6, last)), runs: 0, days: new Set(), last: [], lastAt: '', lastBad: new Map(), prevBad: prevKey ? slices.get(prevKey)!.lastBad : null, since: new Map() };
      slices.set(k, s);
    }
    s.runs++;
    s.days.add(day);
    s.last = checks;
    s.lastAt = at.toISOString();
    s.lastBad = bad;
    s.since = new Map(since);
    prevKey = k;
  }
  const out: WeekResult[] = [];
  for (const s of slices.values()) {
    const end = dayNum(VN_DAY(new Date(s.lastAt)));
    const open: WeekIssue[] = [...s.lastBad.values()].map((c) => ({ code: c.code, title: c.title, level: c.level, count: c.count, since: s.since.get(c.code) ?? VN_DAY(new Date(s.lastAt)), ...(c.remedy?.owner ? { owner: c.remedy.owner } : {}), ...(c.closeTitle ? { closeTitle: c.closeTitle } : {}) }));
    const prev = s.prevBad;
    out.push({
      week: s.week, period: s.period, from: s.from, to: s.to, runs: s.runs, days: s.days.size, lastAt: s.lastAt,
      applicable: s.last.filter((c) => c.level !== 'empty').length,
      passed: s.last.filter((c) => c.level === 'pass').length,
      errors: s.last.filter((c) => c.level === 'error').length,
      open,
      opened: open.filter((c) => !prev?.has(c.code)).map((c) => c.code),
      closed: prev ? [...prev.keys()].filter((code) => !s.lastBad.has(code)) : [],
      oldestDays: open.length ? Math.max(...open.map((c) => end - dayNum(c.since))) : null,
    });
  }
  return out.reverse().slice(0, opts.weeks ?? 12);
}

/** Lưu một lượt vào diagnostic_runs (chỉ thêm, R-DIAG-5). */
export async function saveDiagnosticRun(report: DiagReport, meta: { tenantId: string; actor: string; trigger: 'manual' | 'period-lock' | 'schedule' | 'release' }): Promise<string> {
  // L5 lưu ở conformance_runs (ảnh chụp báo cáo Kiểm chuẩn), không ở diagnostic_runs (CHECK layer IN ('L1','L3'), migration 0034).
  if (report.layer === 'L5') throw new Error('Lượt L5 lưu ở conformance_runs, không ở diagnostic_runs');
  const row = await db
    .insertInto('diagnostic_runs')
    .values({
      tenant_id: meta.tenantId,
      layer: report.layer as 'L1' | 'L3',
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
    code: 'MIGRATIONS_PENDING', closeRef: 'none', layer: 'L1', level: 'error', scoped: false,
    remedy: { steps: [{ text: 'Vận hành chạy job db-migrate (docker compose up db-migrate) hoặc npm run db:migrate', role: 'operator' }, { text: 'Khởi động lại API', role: 'operator' }, { text: 'Không nhập chứng từ tới khi xong' }], owner: 'operator', verify: { code: 'MIGRATIONS_PENDING' } },
    title: 'Mọi tệp db/migrations đã áp vào CSDL',
    fix: 'Code mới cần bảng / cột chưa có, màn hình sẽ lỗi. Chạy job db-migrate (docker compose up db-migrate) hoặc npm run db:migrate.',
    async run() {
      const pending = await pendingMigrations();
      return { examined: 1, count: pending.length, sample: pending };
    },
  },
  {
    code: 'DB_WRITABLE', closeRef: 'none', layer: 'L1', level: 'error', scoped: false,
    remedy: { steps: [{ text: 'Vận hành trỏ DATABASE_URL về bản chính (không phải bản sao chỉ đọc)', role: 'operator' }, { text: 'Khởi động lại API', role: 'operator' }], owner: 'operator', verify: { code: 'DB_WRITABLE' } },
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
    code: 'EVIDENCE_CHAIN', closeRef: 'PC-016', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Xuất đoạn chuỗi đứt (số thứ tự, băm) gửi nhóm Lõi và ban kiểm soát', role: 'owner' }, { text: 'Lập biên bản sự cố; không xoá / sửa thêm bằng chứng', role: 'owner' }], owner: 'core_team', verify: { code: 'EVIDENCE_CHAIN' }, stopTheLine: true },
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
    code: 'TENANT_ISOLATION', closeRef: 'PC-016', layer: 'L1', level: 'error', scoped: false,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Nhóm phát triển thêm migration bật RLS + FORCE + chính sách cho bảng trong mẫu (khuôn ở migration 0041)', role: 'core_team' }, { text: 'Phát hành bản vá, chạy migration', role: 'operator' }], owner: 'core_team', verify: { code: 'TENANT_ISOLATION' }, stopTheLine: true },
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
    code: 'EVENT_DEAD', closeRef: 'PC-003', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Xem lỗi giao của subscriber ở Hệ thống → sự kiện (GET /api/v1/system/events)' }, { text: 'Sửa nguyên nhân (địa chỉ nhận, khoá, hệ thống ngoài)', role: 'operator' }, { text: 'Phát lại sự kiện (core.events.replay)', role: 'chief_accountant' }], owner: 'accountant', verify: { code: 'EVENT_DEAD' } },
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
