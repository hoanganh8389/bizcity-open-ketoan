// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 (ADR-0019, R-GATE-5): bizcity_findings@1 — một thư viện phát hiện cho hai cổng kiểm chuẩn
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-5): 1.2.0 — cổng L (thư viện dùng chung), nguồn bizcity_library (bảy mã LIB-*); mã luật riêng của thư viện gom ở Platform (bizcity_library:<id>)
/**
 * THƯ VIỆN PHÁT HIỆN (bizcity_findings@1). Một khuôn cho mọi mã của hai cổng kiểm chuẩn (ADR-0019, RULE-GATE):
 *   Gate A — danh mục (khung Vì sao: ACC-*, PART-*, sau này ITEM-*) — nguồn `catalog-hint.ts`
 *   Gate B — nghiệp vụ trước khi ghi sổ (trạm tiền kiểm: IN-*) — nguồn `intake-findings.ts`
 *   Cổng L — thư viện dùng chung bizcity_library@1 (LIB-*) — nguồn `library-findings.ts`; mã luật riêng của từng thư viện
 *            (`libraries/<id>/library.json`) do `@bizcity/platform/core/libraries` gom thêm lúc chạy (`source: 'bizcity_library:<id>'`)
 * Danh mục gốc giữ nguyên chỗ cũ (mã ổn định, R-INTAKE-11); tệp này CHỈ gom về một khuôn để người, dev và AI tra một chỗ:
 * `GET /api/v1/findings`, `core.findings.explain(code)` (MCP), trang `docs/huong-dan/ma-loi/README.md` (sinh bằng
 * `node scripts/sinh-ma-loi.mjs`). SC-FIND-1 kiểm: mã không trùng giữa các danh mục; đủ tiêu đề / vì sao; mức warn / block
 * có cách sửa; mỗi mã có căn cứ (R-GATE-11, legal-basis.ts); trang tra mã có đủ mã. Mọi lời Core nói ra bắt đầu từ thư viện này
 * (R-GATE-10, ADR-0020).
 *
 * Mức chung (R-GATE-4 — mức nào, hậu quả đó):
 *   block — giữ lại: Gate A → bản nháp, Gate B → bể chờ; hết khi dữ liệu đúng, không ai "chấp nhận" thay
 *   warn  — qua cổng khi có lý do (D023-6 / R-INTAKE-6), có bằng chứng
 *   info  — nhắc / học (IN-* `hint` và catalog `info` / `guide` gom về đây)
 */
import { INTAKE_CATALOG, type IntakeCode } from './intake-findings.js';
import { CATALOG_HINTS } from './catalog-hint.js';
import { LIBRARY_FINDINGS, type LibraryFindingCode } from './library-findings.js';
import { basisOf, type BasisKey } from './legal-basis.js';

export type FindingGate = 'A' | 'B' | 'L';
export type FindingLevel = 'block' | 'warn' | 'info';

export interface FindingEntry {
  code: string;
  gate: FindingGate;
  level: FindingLevel;
  /** Bước của cổng: Gate B = L1…L5; Gate A = danh mục (account, partner…); cổng L = kiểm chuẩn (code, status…) hoặc id thư viện. */
  step: string;
  title: string;
  why: string;
  /** Cách sửa — bắt buộc với block / warn (R-GATE-2). */
  fix: string;
  /** Luật / hợp đồng gốc. */
  rule: string;
  /** Trang học thêm (đường dẫn trong repo), hoặc thẻ tài khoản. */
  learn: string | null;
  /** Trạng thái nội dung trong danh mục gốc (giữ để tương thích; không còn là cổng chờ duyệt — ADR-0020). */
  status: 'draft' | 'approved';
  /** Căn cứ (R-GATE-11): văn bản trong docs/can-cu hoặc NOI-BO = quy ước phần mềm. */
  basis: { key: BasisKey; title: string; page: string }[];
  /** Danh mục gốc. */
  source: 'bizcity_intake_findings' | 'bizcity_catalog_hint' | 'bizcity_library' | `bizcity_library:${string}`;
}

function fromIntake(code: IntakeCode): FindingEntry {
  const s = INTAKE_CATALOG[code];
  return {
    code, gate: 'B', level: s.severity === 'hint' ? 'info' : s.severity, step: s.layer, title: s.title, why: s.why, fix: s.fix,
    rule: s.ref, learn: `docs/huong-dan/loi-dau-vao/${code}.md`, status: 'approved', basis: basisOf(code), source: 'bizcity_intake_findings',
  };
}

/** Mọi mã tĩnh của các cổng, một khuôn. Thứ tự: Gate A, Gate B, cổng L; mỗi cổng theo thứ tự khai trong danh mục gốc. */
export const FINDINGS_LIBRARY: readonly FindingEntry[] = [
  ...Object.values(CATALOG_HINTS).map((d): FindingEntry => ({
    code: d.id, gate: 'A', level: d.level === 'guide' ? 'info' : d.level, step: d.entity, title: d.title, why: d.why,
    fix: d.fix ?? '', rule: d.rule ?? 'R-GATE-2', learn: d.learn && !d.learn.includes('{') ? d.learn : null, status: d.status, basis: basisOf(d.id), source: 'bizcity_catalog_hint',
  })),
  ...(Object.keys(INTAKE_CATALOG) as IntakeCode[]).map(fromIntake),
  ...(Object.keys(LIBRARY_FINDINGS) as LibraryFindingCode[]).map((code): FindingEntry => {
    const d = LIBRARY_FINDINGS[code];
    return {
      code, gate: 'L', level: d.level, step: d.step, title: d.title, why: d.why, fix: d.fix, rule: 'ADR-0032',
      learn: 'docs/contracts/BIZCITY-LIBRARY-v1.md', status: 'approved', basis: basisOf(code), source: 'bizcity_library',
    };
  }),
];

const BY_CODE = new Map(FINDINGS_LIBRARY.map((f) => [f.code, f]));

/** Tra một mã (người, dev, AI). Không có → undefined. */
export function explainFinding(code: string): FindingEntry | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}
