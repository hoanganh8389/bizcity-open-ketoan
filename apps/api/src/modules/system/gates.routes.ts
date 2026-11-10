// @bizcity-layer P module-sdk
// [2026-11-10 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a (S034-5): thẻ Cổng & bộ kiểm ở HT10 — một API chỉ đọc gom mã kiểm từ sổ đăng ký trong mã, không gõ tay (D034-3)
// [2026-11-11 04:35 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — S034-11 (D034-13): kết quả lane selfcheck chạy lúc dựng ảnh (build/scoreboard.json) → `ciRun` + `last` của từng mã CI
// [2026-11-11 02:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b (S034-6, D034-11): trụ cột theo họ mã + test của mã + bộ kiểm CI + trigger CSDL từ docs/standard/cong-kiem.json; mức mỗi mã đủ bốn ý
/**
 * GET /api/v1/system/gates — mọi mã kiểm của Core xếp theo CỔNG mà dữ liệu đi qua (PHASE-034 · 00 §3):
 *   A        danh mục → nháp (FINDINGS_LIBRARY gate A: ACC-*, PART-*, ITEM-* …)
 *   B        cửa nạp, bậc L1..L5 (gate B: IN-*, POL-*), trừ IN-GUARD-001
 *   guard    Commit Guard (IN-GUARD-001)
 *   L        thư viện dùng chung (gate L: LIB-* + mã luật riêng của thư viện)
 *   diag     tự chẩn đoán trong app L1 / L3 / L5 (listDiagnostics), kèm kết quả lượt gần nhất của đơn vị
 *   trigger  trigger CSDL khai trong db/migrations (LEDGER_TRIGGERS kiểm còn đủ, đang bật)    ┐ từ cong-kiem.json, sinh bằng
 *   ci       bộ kiểm CI SC-* / DG-* (mỗi PR, scripts/kiem-chuan.sh)                           ┘ scripts/cong-kiem.mjs
 *   C · lock — chưa có sổ chạy được: dòng giữ chỗ nói bước làm (PHASE-032 / 033)
 * Trụ cột của mã: `map[]` họ mã → trụ cột trong cong-kiem.json (D034-11). Mức một mã (`score`, 0..100):
 *   mã cổng / chẩn đoán: có Cách sửa · có phương án có cấu trúc · có test · gắn trụ cột — mỗi ý 25
 *   CI: gắn trụ cột 50 + có ca tự kiểm 50 · trigger: gắn trụ cột 50 + được LEDGER_TRIGGERS kiểm 50
 * Kết quả bộ kiểm của bản dựng (S034-11): ảnh api chạy lane selfcheck lúc dựng (giai đoạn `conformance` ở docker/api.Dockerfile) và chép
 * build/scoreboard.json; mã CI có `last` (pass · debt · fail · warn · planned · error · skip), phản hồi có `ciRun`. Chạy dev / thiếu tệp → ciRun = null.
 * Nguồn là bản dựng (không theo đơn vị), trừ `last` của mã chẩn đoán đọc diagnostic_runs của đơn vị đang đăng nhập. Không có đường ghi (R-CONT-7).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { FINDINGS_LIBRARY, INTAKE_REMEDIES, type FindingEntry } from '@ketoan/contracts';
import { authOf, requireAuthenticated } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { db } from '../../db/client.js';
import { listDiagnostics, type DiagResult } from './diagnostics.js';
import { libraryRuleFindings } from '@bizcity/platform/core/libraries/index';

export type GateKey = 'A' | 'B' | 'guard' | 'L' | 'diag' | 'C' | 'lock' | 'trigger' | 'ci';

export interface GateCode {
  code: string;
  /** Bậc / lớp trong cổng: L1..L5 (cổng B, chẩn đoán), loại danh mục (cổng A), id thư viện (cổng L), lane (CI), bảng (trigger). */
  step: string;
  level: string;
  title: string;
  /** Có câu Cách sửa (không áp cho CI / trigger). */
  hasFix: boolean;
  /** Có phương án khắc phục có cấu trúc: bước, màn, vai, kiểm lại (R-FIX-1) (không áp cho CI / trigger). */
  hasRemedy: boolean;
  /** Có test: tệp apps/api/test nhắc mã (mã cổng / chẩn đoán) · ca tự kiểm (CI) · LEDGER_TRIGGERS kiểm (trigger). */
  hasTest: boolean;
  tests: string[];
  /** Trụ cột (tru-cot.json) theo họ mã — rỗng = chưa gắn. */
  pillars: string[];
  /** Mức của mã, 0..100. */
  score: number;
  /** Điều kiện khoá sổ mà mã nuôi (R-DIAG-10), chỉ có ở chẩn đoán. */
  closeRef?: string;
  /** Kết quả ở lượt chẩn đoán gần nhất của đơn vị (chỉ cổng diag). */
  last?: { level: string; count: number; examined: number } | null;
}

export interface GateGroup {
  key: GateKey;
  title: string;
  /** Lúc mã của cổng chạy. */
  runsAt: string;
  /** Mã nguồn định nghĩa cổng. */
  source: string;
  /** false = chưa có sổ đăng ký chạy được ở bản cài; `next` nói bước nào làm. */
  live: boolean;
  next?: string;
  /** Cách tính `score`: 'code' = bốn ý · 'meta' = trụ cột + có kiểm. */
  scoring: 'code' | 'meta';
  codes: GateCode[];
}

const GROUPS: Omit<GateGroup, 'codes'>[] = [
  { key: 'A', title: 'Cổng A · Danh mục → nháp', runsAt: 'khi gọi /products|partners|accounts/validate, lúc lập danh mục', source: 'packages/contracts/src/catalog-hint.ts', live: true, scoring: 'code' },
  { key: 'B', title: 'Cổng B · Cửa nạp (tiền kiểm L1..L5)', runsAt: 'mỗi lần nạp / Kiểm thử chứng từ', source: 'packages/kernel/src/modules/intake/preflight.ts · packages/contracts/src/intake-findings.ts', live: true, scoring: 'code' },
  { key: 'guard', title: 'Commit Guard', runsAt: 'POST /documents, core.document.submit — ngay trước ghi sổ', source: 'packages/kernel/src/modules/intake/guard.ts', live: true, scoring: 'code' },
  { key: 'L', title: 'Cổng L · Thư viện dùng chung', runsAt: 'cửa nạp kiểm theo thư viện (chỉ cảnh báo)', source: 'packages/platform/src/core/libraries', live: true, scoring: 'code' },
  { key: 'diag', title: 'Tự chẩn đoán trong app (L1 · L3 · L5)', runsAt: 'health/ready (L1), GET /system/diagnostics, lịch đêm 01:00, trước khoá kỳ (R-DIAG-4)', source: 'packages/platform/src/system/diagnostics.ts + *.diagnostics.ts', live: true, scoring: 'code' },
  { key: 'trigger', title: 'Trigger CSDL', runsAt: 'mọi lệnh ghi (chỉ thêm, cân bằng, chuỗi băm, guard); LEDGER_TRIGGERS kiểm còn đủ', source: 'db/migrations/*.sql', live: true, scoring: 'meta' },
  { key: 'ci', title: 'Bộ kiểm CI (SC-* · DG-*)', runsAt: 'mỗi PR, scripts/kiem-chuan.sh', source: 'tests/conformance/**', live: true, scoring: 'meta' },
  { key: 'C', title: 'Cổng C · Sau ghi sổ (giá vốn, CT-*)', runsAt: 'lần tính giá, settle', source: 'ADR-0021 / ADR-0033', live: false, scoring: 'code', next: 'PHASE-032 S032-12..20 — chưa có mã CT-* trong mã nguồn' },
  { key: 'lock', title: 'Khoá kỳ', runsAt: 'mọi lần ghi sổ, POST /periods/locks', source: 'packages/kernel/src/modules/periods · ledger.service.ts (PERIOD_LOCKED)', live: false, scoring: 'code', next: 'PHASE-033 / PHASE-032 B2c — sổ điều kiện khoá sổ PC-001..023' },
];

// Chạy từ src (tsx) hay dist (node): apps/api/{src,dist}/modules/system → gốc repo cách 5 cấp.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const GATES_FILE = 'docs/standard/cong-kiem.json';
/** Sinh lúc dựng ảnh, không có trong repo (D034-13). */
const BUILD_SCOREBOARD = 'build/scoreboard.json';

interface MapRow { match: string | string[]; pillars: string[] }
interface GatesFile {
  map: MapRow[];
  generated: {
    tests: Record<string, string[]>;
    ci: { id: string; title: string; enforce: string; lane: string; selftest: boolean }[];
    triggers: { name: string; table: string; migration: string }[];
  };
}
let gatesFile: GatesFile | null | undefined;
function loadGatesFile(): GatesFile | null {
  if (gatesFile === undefined) {
    try { gatesFile = JSON.parse(readFileSync(path.join(root, GATES_FILE), 'utf8')) as GatesFile; } catch { gatesFile = null; }
  }
  return gatesFile;
}

export interface CiRun { runId: string | null; at: string | null; verdict: string | null; counts: Record<string, number> }
interface ScoreboardLike { runId?: string; at?: string; verdict?: string; counts?: Record<string, number>; checks?: { id: string; status: string; findings?: number; examined?: number }[] }

/** Thu gọn bảng điểm của selfcheck (bizcity_scoreboard@1) thành lượt CI + kết quả theo mã. Không có check nào thì null. */
export function ciResults(sb: ScoreboardLike | null): { run: CiRun; byId: Map<string, { level: string; count: number; examined: number }> } | null {
  if (!sb || !Array.isArray(sb.checks) || !sb.checks.length) return null;
  const byId = new Map(sb.checks.filter((c) => c?.id).map((c) => [c.id, { level: c.status, count: c.findings ?? 0, examined: c.examined ?? 0 }]));
  return { run: { runId: sb.runId ?? null, at: sb.at ?? null, verdict: sb.verdict ?? null, counts: sb.counts ?? {} }, byId };
}

let buildSb: ReturnType<typeof ciResults> | undefined;
function loadBuildScoreboard() {
  if (buildSb === undefined) {
    try { buildSb = ciResults(JSON.parse(readFileSync(path.join(root, BUILD_SCOREBOARD), 'utf8')) as ScoreboardLike); } catch { buildSb = null; }
  }
  return buildSb;
}

const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\-]/g, (ch) => `\\${ch}`);
const globs = new Map<string, RegExp>();
/** Trụ cột của mã theo map[] (cùng luật với tests/conformance/checks/gates/gates.lib.mjs: dòng đầu khớp, `*` khớp mọi chuỗi). */
export function pillarsOf(map: MapRow[], code: string): string[] {
  for (const row of map) {
    for (const g of ([] as string[]).concat(row.match)) {
      if (!globs.has(g)) globs.set(g, new RegExp(`^${g.split('*').map(escapeRe).join('.*')}$`));
      if (globs.get(g)!.test(code)) return row.pillars;
    }
  }
  return [];
}

const remedies = INTAKE_REMEDIES as Partial<Record<string, unknown>>;
type FindingLike = Pick<FindingEntry, 'code' | 'step' | 'title' | 'fix'> & { gate: string; level: string };
type Base = Pick<GateCode, 'code' | 'step' | 'level' | 'title' | 'hasFix' | 'hasRemedy' | 'closeRef'>;

const codeScore = (c: Pick<GateCode, 'hasFix' | 'hasRemedy' | 'hasTest' | 'pillars'>) => (c.hasFix ? 25 : 0) + (c.hasRemedy ? 25 : 0) + (c.hasTest ? 25 : 0) + (c.pillars.length ? 25 : 0);
const metaScore = (c: Pick<GateCode, 'hasTest' | 'pillars'>) => (c.hasTest ? 50 : 0) + (c.pillars.length ? 50 : 0);

/** Mọi nhóm cổng, chưa có kết quả lượt chẩn đoán (phần không theo đơn vị). */
export function gateGroups(): GateGroup[] {
  const file = loadGatesFile();
  const map = file?.map ?? [];
  const testIdx = file?.generated?.tests ?? {};
  const enrich = (b: Base): GateCode => {
    const tests = testIdx[b.code] ?? [];
    const c = { ...b, tests, hasTest: tests.length > 0, pillars: pillarsOf(map, b.code) };
    return { ...c, score: codeScore(c) };
  };
  const fromFinding = (f: FindingLike): GateCode => enrich({ code: f.code, step: f.step, level: f.level, title: f.title, hasFix: !!f.fix?.trim(), hasRemedy: f.gate === 'B' && !!remedies[f.code] });
  const findings = [...FINDINGS_LIBRARY, ...libraryRuleFindings()];
  const codesOf = (key: GateKey): GateCode[] => {
    switch (key) {
      case 'A': return findings.filter((f) => f.gate === 'A').map(fromFinding);
      case 'B': return findings.filter((f) => f.gate === 'B' && f.code !== 'IN-GUARD-001').map(fromFinding);
      case 'guard': return findings.filter((f) => f.code === 'IN-GUARD-001').map(fromFinding);
      case 'L': return findings.filter((f) => f.gate === 'L').map(fromFinding);
      case 'diag': return listDiagnostics().map((c) => enrich({ code: c.code, step: c.layer, level: c.level, title: c.title, hasFix: !!c.fix?.trim(), hasRemedy: !!c.remedy, closeRef: c.closeRef }));
      case 'ci': return (file?.generated?.ci ?? []).map((c) => {
        const x = { code: c.id, step: c.lane, level: c.enforce, title: c.title, hasFix: false, hasRemedy: false, hasTest: c.selftest, tests: c.selftest ? ['tests/conformance/fixtures/expect.json'] : [], pillars: pillarsOf(map, c.id) };
        return { ...x, score: metaScore(x) };
      });
      case 'trigger': return (file?.generated?.triggers ?? []).map((t) => {
        const x = { code: t.name, step: t.table, level: 'guard', title: `${t.table} · ${t.migration}`, hasFix: false, hasRemedy: false, hasTest: true, tests: ['LEDGER_TRIGGERS'], pillars: pillarsOf(map, t.name) };
        return { ...x, score: metaScore(x) };
      });
      default: return [];
    }
  };
  return GROUPS.map((g) => {
    const live = g.live && (g.scoring !== 'meta' || !!file);
    return { ...g, live, next: live ? g.next : g.next ?? `bản cài thiếu ${GATES_FILE}`, codes: live ? codesOf(g.key) : [] };
  });
}

export async function gatesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/system/gates', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Mọi mã kiểm của Core theo cổng (A · B · Commit Guard · L · chẩn đoán L1/L3/L5 · trigger CSDL · bộ kiểm CI; giữ chỗ C · khoá kỳ), mỗi mã có trụ cột, test, mức — cho thẻ Cổng & bộ kiểm ở HT10; chỉ đọc' },
    handler: async (req) => {
      const run = await db.selectFrom('diagnostic_runs').select(['id', 'layer', 'trigger', 'checks', 'created_at'])
        .where('tenant_id', '=', authOf(req).tenantId).orderBy('id', 'desc').limit(1).executeTakeFirst();
      const results = new Map<string, DiagResult>();
      for (const c of (Array.isArray(run?.checks) ? run.checks : []) as DiagResult[]) if (c?.code) results.set(c.code, c);
      const ci = loadBuildScoreboard();
      const groups = gateGroups().map((g) => {
        if (g.key === 'diag') {
          return { ...g, codes: g.codes.map((c) => { const x = results.get(c.code); return { ...c, last: x ? { level: x.level, count: x.count, examined: x.examined } : null }; }) };
        }
        if (g.key === 'ci') return { ...g, codes: g.codes.map((c) => ({ ...c, last: ci?.byId.get(c.code) ?? null })) };
        return g;
      });
      return ok({
        contract: 'bizcity_gates@1',
        lastRun: run ? { id: run.id, layer: run.layer, trigger: run.trigger, at: run.created_at } : null,
        ciRun: ci?.run ?? null,
        groups,
      });
    },
  });
}
