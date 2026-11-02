// @bizcity-layer K kernel/conformance
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Conformance Engine trên bản cài (S020-18): hồ sơ kế toán thật + kết quả tự chẩn đoán L1/L3/L5 → bộ đánh giá dùng chung @bizcity/vn-rulepacks/engine → ảnh chụp conformance_runs (ADR-0012 T1, T2, T7).
// [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19: thêm lớp Doanh nghiệp (C09: hoá đơn đầu vào chờ, sự việc treo, tồn kho âm, việc cuối kỳ) — bằng chứng từ kiểm L3 của chính đơn vị.
// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20: listRuns (xu hướng ở màn Kiểm chuẩn); lịch đêm: subscriber core.conformance-nightly nghe bizcity.clock.daily (01:00 giờ VN), mỗi đơn vị một lượt, actor system:nightly (R-DIAG-3, STD-EVT-6).
// [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0014: lượt chạy dùng lượt duyệt rulepack tại bản cài của đơn vị.
/**
 * CONFORMANCE ENGINE (ADR-0012) — ba lớp Module · Cấu hình · Doanh nghiệp trên bản cài.
 *
 *   loadKit()             kho rulepack của gói @bizcity/vn-rulepacks (đọc một lần mỗi tiến trình) + băm nội dung
 *   runConformance(...)   1. hồ sơ kế toán áp cho asOf (ADR-0013; chưa khai → 'unknown', không đoán)
 *                         2. tự chẩn đoán L1 + L3 + L5 của đơn vị (READ ONLY, cùng mã với lane DG-*); lớp Doanh nghiệp
 *                            dùng kiểm L3 trạng thái theo kỳ (TAX_INPUT_NO_INVOICE, EVENT_PENDING_AGE, INVENTORY_NEGATIVE, PERIOD_CLOSE_OPEN)
 *                         3. engine.evaluate(runtimeOnly): chỉ bằng chứng có được trên bản cài; SC-* / test là bằng chứng build
 *                         4. lưu ảnh chụp vào conformance_runs (bảng duy nhất được ghi)
 *
 * Không sửa sổ, không đổi cấu hình, không chặn gì, không tự chạy giá vốn / kết chuyển / khoá kỳ: kết luận để người dùng quyết định
 * (R-VNC-10). Báo cáo có layer_results: mỗi lớp trả lời một câu hỏi riêng.
 *
 *   listRuns(...)         các lượt gần đây (kết quả theo lớp) cho xu hướng
 *   conformanceNightlySubscriber  lịch đêm qua sự kiện đồng hồ — không setInterval riêng (STD-EVT-6); chạy lại đúng ngày thì khoá
 *                         chống trùng của đồng hồ giữ một lượt / đơn vị / ngày
 */
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { sql } from 'kysely';
import { buildReport, evaluate, evidenceFromDiagnostics, loadKitFromDir, PACKAGE_DIR, type Kit, type Profile } from '@bizcity/vn-rulepacks/engine';
import type { Db } from '@bizcity/platform/db/client';
import { runDiagnostics } from '@bizcity/platform/system/diagnostics';
import { defineSubscriber } from '@bizcity/platform/core/events';
import { BUILD_VERSION } from '@bizcity/platform/core/version';
import { profileAt } from '../posting-config/profile.js';
import { approvalsOf } from './conformance.approvals.js';

export const LAYERS = ['module', 'configuration', 'enterprise'] as const;
const STATUSES = ['PASS', 'FAIL', 'ERROR', 'NOT_APPLICABLE', 'NOT_TESTED', 'REVIEW_REQUIRED'] as const;

let cached: { kit: Kit; hash: string } | null = null;

/** Kho rulepack + băm (rulepack, ca, nguồn pháp lý). Đổi thư mục: biến VN_RULEPACKS_DIR. */
export function loadKit(): { kit: Kit; hash: string } {
  if (cached) return cached;
  const kit = loadKitFromDir(process.env.VN_RULEPACKS_DIR ? path.resolve(process.env.VN_RULEPACKS_DIR) : PACKAGE_DIR);
  const content = JSON.stringify({ registry: kit.registry, rulepacks: kit.rulepacks, diagCodes: kit.diagCodes });
  cached = { kit, hash: 'sha256:' + createHash('sha256').update(content).digest('hex') };
  return cached;
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface ConformanceRunRow {
  id: string;
  as_of: string;
  result: 'PASS' | 'FAIL' | 'REVIEW_REQUIRED';
  counts: Record<string, number>;
  profile_version: number | null;
  kit_version: string | null;
  kit_hash: string;
  report: Record<string, unknown>;
  actor: string;
  created_at: Date;
}

/** Chạy một lượt cho đơn vị và lưu ảnh chụp. `trx` = giao dịch ghi của action (chỉ dùng để thêm dòng conformance_runs). */
export async function runConformance(trx: Db, tenantId: string, a: { asOf: string; actor: string }): Promise<ConformanceRunRow> {
  const { kit, hash } = loadKit();
  const prof = await profileAt(trx, tenantId, a.asOf);
  const profile: Profile = prof
    ? { accounting_regime: prof.regime, fiscal_year_start: `${pad(Number(prof.fiscal_year_start_month))}-01`, entity_type: prof.entity_type, as_of: a.asOf, simulated: false }
    : { accounting_regime: 'unknown', fiscal_year_start: '01-01', entity_type: 'unknown', as_of: a.asOf, simulated: false };

  // Bằng chứng trên bản cài: tự chẩn đoán của chính đơn vị, chỉ đọc (R-DIAG-2). L3 xét cả sổ (việc tồn đọng ở kỳ nào cũng là tình trạng
  // hiện tại của doanh nghiệp); L5 xét theo ngày đánh giá.
  const scope = { tenantId };
  const diag = [
    ...(await runDiagnostics(scope, { layer: 'L1' })).checks,
    ...(await runDiagnostics(scope, { layer: 'L3' })).checks,
    ...(await runDiagnostics({ tenantId, to: a.asOf }, { layer: 'L5' })).checks,
  ];
  // ADR-0015: lượt duyệt tại bản cài của đơn vị (bộ đánh giá tự bỏ lượt lệch phiên bản / băm).
  const approvals = await approvalsOf(trx, tenantId);
  const evaluation = evaluate({ kit, profile, evidence: { checks: evidenceFromDiagnostics(diag, kit.diagCodes) }, layers: [...LAYERS], runtimeOnly: true, approvals });

  const at = new Date();
  const runId = `${at.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${randomBytes(3).toString('hex')}`;
  const sha = process.env.BIZCITY_GIT_SHA && /^[0-9a-f]{40}$/.test(process.env.BIZCITY_GIT_SHA) ? process.env.BIZCITY_GIT_SHA : null;
  const report = buildReport({
    kit, profile, evaluation,
    run: { runId, at: at.toISOString(), gitSha: sha as string, runtime: { os: process.platform, node: process.version, postgres: null } },
    target: { kind: 'kernel', package: '@bizcity/kernel', version: BUILD_VERSION.kernel },
    exclusions: [
      { scope: 'bằng chứng build', reason: 'Kiểm SC-* và test vitest chạy ở CI / --certify, không chạy trên bản cài; ca chỉ có bằng chứng build ra NOT_TESTED ở đây' },
    ],
  });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, evaluation.cases.filter((c) => c.status === s).length]));

  const row = await trx.insertInto('conformance_runs').values({
    tenant_id: tenantId, as_of: a.asOf, layers: [...LAYERS], profile_version: prof?.version ?? null, kit_version: kit.version, kit_hash: hash,
    result: report.result, counts: JSON.stringify(counts), report: JSON.stringify(report), actor: a.actor,
  }).returning(['id', 'as_of', 'result', 'counts', 'profile_version', 'kit_version', 'kit_hash', 'report', 'actor', 'created_at']).executeTakeFirstOrThrow();
  return row as unknown as ConformanceRunRow;
}

export async function latestRun(db: Db, tenantId: string): Promise<ConformanceRunRow | null> {
  const row = await db.selectFrom('conformance_runs')
    .select(['id', 'as_of', 'result', 'counts', 'profile_version', 'kit_version', 'kit_hash', 'report', 'actor', 'created_at'])
    .where('tenant_id', '=', tenantId).orderBy('id', 'desc').limit(1).executeTakeFirst();
  return (row as unknown as ConformanceRunRow | undefined) ?? null;
}

export interface ConformanceRunSummary { id: string; as_of: string; result: 'PASS' | 'FAIL' | 'REVIEW_REQUIRED'; counts: Record<string, number>; layer_results: Record<string, string>; actor: string; created_at: Date }

/** Các lượt gần đây của đơn vị, mới trước (xu hướng ở màn Kiểm chuẩn). Không trả báo cáo đầy đủ. */
export async function listRuns(db: Db, tenantId: string, limit = 12): Promise<ConformanceRunSummary[]> {
  const rows = await db.selectFrom('conformance_runs')
    .select(['id', 'as_of', 'result', 'counts', 'actor', 'created_at', sql<Record<string, string> | null>`report -> 'layer_results'`.as('layer_results')])
    .where('tenant_id', '=', tenantId).orderBy('id', 'desc').limit(limit).execute();
  return rows as unknown as ConformanceRunSummary[];
}

/** Lịch đêm (R-DIAG-3): mỗi đơn vị đang dùng một lượt Kiểm chuẩn / ngày, ngày đánh giá = ngày của đồng hồ (giờ VN). Chỉ thêm ảnh chụp. */
export const conformanceNightlySubscriber = defineSubscriber({
  id: 'core.conformance-nightly',
  module: 'bizcity.platform',
  on: ['bizcity.clock.daily'],
  retry: { maxAttempts: 3 },
  async handle(ctx, event) {
    const date = typeof event.data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.data.date) ? event.data.date : new Date().toISOString().slice(0, 10);
    await runConformance(ctx.tx, ctx.tenantId, { asOf: date, actor: 'system:nightly' });
  },
});
