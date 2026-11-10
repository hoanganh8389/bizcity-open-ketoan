// @bizcity-layer P module-sdk
// [2026-11-10 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a (S034-5): thẻ Cổng & bộ kiểm ở HT10 — một API chỉ đọc gom mã kiểm từ sổ đăng ký trong mã, không gõ tay (D034-3)
/**
 * GET /api/v1/system/gates — mọi mã kiểm của Core xếp theo CỔNG mà dữ liệu đi qua (PHASE-034 · 00 §3):
 *   A        danh mục → nháp (FINDINGS_LIBRARY gate A: ACC-*, PART-*, ITEM-* …)
 *   B        cửa nạp, bậc L1..L5 (gate B: IN-*, POL-*), trừ IN-GUARD-001
 *   guard    Commit Guard (IN-GUARD-001)
 *   L        thư viện dùng chung (gate L: LIB-* + mã luật riêng của thư viện)
 *   diag     tự chẩn đoán trong app L1 / L3 / L5 (listDiagnostics), kèm kết quả lượt gần nhất của đơn vị
 *   C · lock · trigger · ci — chưa có sổ đăng ký chạy được ở bản cài: trả dòng giữ chỗ để thấy khoảng trống (B3b, PHASE-032)
 * Nguồn là mã của bản dựng (không theo đơn vị), trừ `lastRun` đọc diagnostic_runs của đơn vị đang đăng nhập.
 * Không có đường ghi: mức "đủ" của một mã đi theo khuôn có thật (cách sửa, phương án có cấu trúc), không ai tích tay (R-CONT-7).
 */
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
  /** Bậc / lớp trong cổng: L1..L5 (cổng B, chẩn đoán), loại danh mục (cổng A), id thư viện (cổng L). */
  step: string;
  level: string;
  title: string;
  /** Có câu Cách sửa. */
  hasFix: boolean;
  /** Có phương án khắc phục có cấu trúc: bước, màn, vai, kiểm lại (R-FIX-1). */
  hasRemedy: boolean;
  /** Điều kiện khoá sổ mà mã nuôi (R-DIAG-10), chỉ có ở chẩn đoán. */
  closeRef?: string;
  /** Kết quả ở lượt chẩn đoán gần nhất của đơn vị (chỉ cổng diag). */
  last?: { level: DiagResult['level']; count: number; examined: number } | null;
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
  codes: GateCode[];
}

const GROUPS: Omit<GateGroup, 'codes'>[] = [
  { key: 'A', title: 'Cổng A · Danh mục → nháp', runsAt: 'khi gọi /products|partners|accounts/validate, lúc lập danh mục', source: 'packages/contracts/src/catalog-hint.ts', live: true },
  { key: 'B', title: 'Cổng B · Cửa nạp (tiền kiểm L1..L5)', runsAt: 'mỗi lần nạp / Kiểm thử chứng từ', source: 'packages/kernel/src/modules/intake/preflight.ts · packages/contracts/src/intake-findings.ts', live: true },
  { key: 'guard', title: 'Commit Guard', runsAt: 'POST /documents, core.document.submit — ngay trước ghi sổ', source: 'packages/kernel/src/modules/intake/guard.ts', live: true },
  { key: 'L', title: 'Cổng L · Thư viện dùng chung', runsAt: 'cửa nạp kiểm theo thư viện (chỉ cảnh báo)', source: 'packages/platform/src/core/libraries', live: true },
  { key: 'diag', title: 'Tự chẩn đoán trong app (L1 · L3 · L5)', runsAt: 'health/ready (L1), GET /system/diagnostics, lịch đêm 01:00, trước khoá kỳ (R-DIAG-4)', source: 'packages/platform/src/system/diagnostics.ts + *.diagnostics.ts', live: true },
  { key: 'C', title: 'Cổng C · Sau ghi sổ (giá vốn, CT-*)', runsAt: 'lần tính giá, settle', source: 'ADR-0021 / ADR-0033', live: false, next: 'PHASE-032 S032-12..20 — chưa có mã CT-* trong mã nguồn' },
  { key: 'lock', title: 'Khoá kỳ', runsAt: 'mọi lần ghi sổ, POST /periods/locks', source: 'packages/kernel/src/modules/periods · ledger.service.ts (PERIOD_LOCKED)', live: false, next: 'PHASE-034 B3b — gom mã chặn khoá kỳ vào sổ' },
  { key: 'trigger', title: 'Trigger CSDL', runsAt: 'mọi lệnh ghi (chỉ thêm, cân bằng, chuỗi băm, guard)', source: 'db/migrations/*.sql · kiểm L1 LEDGER_TRIGGERS', live: false, next: 'PHASE-034 B3b — sinh danh sách trigger từ migration' },
  { key: 'ci', title: 'Bộ kiểm CI (SC-* · DG-*)', runsAt: 'mỗi PR, scripts/kiem-chuan.sh', source: 'tests/conformance/**', live: false, next: 'PHASE-034 B3b — scripts/cong-kiem-json.mjs sinh cong-kiem.json' },
];

const remedies = INTAKE_REMEDIES as Partial<Record<string, unknown>>;

type FindingLike = Pick<FindingEntry, 'code' | 'step' | 'title' | 'fix'> & { gate: string; level: string };

function fromFinding(f: FindingLike): GateCode {
  return { code: f.code, step: f.step, level: f.level, title: f.title, hasFix: !!f.fix?.trim(), hasRemedy: f.gate === 'B' && !!remedies[f.code] };
}

/** Mọi nhóm cổng, chưa có kết quả lượt chẩn đoán (phần không theo đơn vị). */
export function gateGroups(): GateGroup[] {
  const findings = [...FINDINGS_LIBRARY, ...libraryRuleFindings()];
  const codesOf = (key: GateKey): GateCode[] => {
    switch (key) {
      case 'A': return findings.filter((f) => f.gate === 'A').map(fromFinding);
      case 'B': return findings.filter((f) => f.gate === 'B' && f.code !== 'IN-GUARD-001').map(fromFinding);
      case 'guard': return findings.filter((f) => f.code === 'IN-GUARD-001').map(fromFinding);
      case 'L': return findings.filter((f) => f.gate === 'L').map(fromFinding);
      case 'diag': return listDiagnostics().map((c) => ({ code: c.code, step: c.layer, level: c.level, title: c.title, hasFix: !!c.fix?.trim(), hasRemedy: !!c.remedy, closeRef: c.closeRef }));
      default: return [];
    }
  };
  return GROUPS.map((g) => ({ ...g, codes: codesOf(g.key) }));
}

export async function gatesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/system/gates', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Mọi mã kiểm của Core theo cổng (A · B · Commit Guard · L · chẩn đoán L1/L3/L5; giữ chỗ C · khoá kỳ · trigger · CI) — cho thẻ Cổng & bộ kiểm ở HT10; chỉ đọc' },
    handler: async (req) => {
      const run = await db.selectFrom('diagnostic_runs').select(['id', 'layer', 'trigger', 'checks', 'created_at'])
        .where('tenant_id', '=', authOf(req).tenantId).orderBy('id', 'desc').limit(1).executeTakeFirst();
      const results = new Map<string, DiagResult>();
      for (const c of (Array.isArray(run?.checks) ? run.checks : []) as DiagResult[]) if (c?.code) results.set(c.code, c);
      const groups = gateGroups().map((g) => g.key !== 'diag' ? g : {
        ...g,
        codes: g.codes.map((c) => {
          const x = results.get(c.code);
          return { ...c, last: x ? { level: x.level, count: x.count, examined: x.examined } : null };
        }),
      });
      return ok({
        contract: 'bizcity_gates@1',
        lastRun: run ? { id: run.id, layer: run.layer, trigger: run.trigger, at: run.created_at } : null,
        groups,
      });
    },
  });
}
