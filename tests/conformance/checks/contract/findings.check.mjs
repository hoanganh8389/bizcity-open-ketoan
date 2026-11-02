// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 (ADR-0019, R-GATE-2 / R-GATE-5): SC-FIND-1 — một thư viện phát hiện cho hai cổng: mã không trùng, đủ vì sao / cách sửa, trang tra mã đủ mã
/**
 * bizcity_findings@1: hai danh mục nguồn (Gate A `catalog-hint.ts`, Gate B `intake-findings.ts`) gom về một thư viện. Kiểm:
 *   - mã không trùng giữa hai danh mục (và trong từng danh mục);
 *   - mỗi mã có tiêu đề và "vì sao"; mức block / warn có "cách sửa" (không chặn im lặng, R-GATE-2);
 *   - trang người đọc docs/huong-dan/ma-loi/README.md có đúng các mã (sinh bằng `node scripts/sinh-ma-loi.mjs --write`).
 * Đọc nguồn bằng regex (không cần build), như SC-INTAKE-1.
 */
const HINTS = 'packages/contracts/src/catalog-hint.ts';
const INTAKE = 'packages/contracts/src/intake-findings.ts';
const PAGE = 'docs/huong-dan/ma-loi/README.md';
const INTAKE_ROW = /^ {2}'(IN-[A-Z]+-\d{3})': \{[^\n]*severity: '(block|warn|hint)'[^\n]*title: '([^']*)', why: '([^']*)', fix: '([^']*)'/;

/** Các mục của CATALOG_HINTS: khối `  'MÃ': {` … `  },`. */
function hintEntries(src) {
  const out = [];
  const start = src.indexOf('export const CATALOG_HINTS');
  if (start < 0) return out;
  const body = src.slice(start);
  for (const m of body.matchAll(/^ {2}'([A-Z]+-[A-Z]+-\d{3})': \{([\s\S]*?)^ {2}\},/gm)) {
    const b = m[2];
    const field = (k) => new RegExp(`\\b${k}: '((?:[^'\\\\]|\\\\.)*)'`).exec(b)?.[1];
    out.push({ code: m[1], level: field('level'), title: field('title'), why: field('why'), fix: field('fix') });
  }
  return out;
}

export default {
  id: 'SC-FIND-1',
  title: 'Thư viện phát hiện hai cổng: mã không trùng, đủ vì sao / cách sửa, trang tra mã đủ mã',
  gate: 'DOCS', contract: 'contracts', rules: ['R-GATE-2', 'R-GATE-5'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const findings = [];
    const add = (file, msg, key) => findings.push(ctx.finding(file, null, msg, key));
    const hints = hintEntries(ctx.repo.read(HINTS) ?? '');
    const intake = (ctx.repo.read(INTAKE) ?? '').split(/\r?\n/).map((l) => INTAKE_ROW.exec(l)).filter(Boolean)
      .map((m) => ({ code: m[1], level: m[2] === 'hint' ? 'info' : m[2], title: m[3], why: m[4], fix: m[5] }));
    const seen = new Map();
    for (const [file, list] of [[HINTS, hints], [INTAKE, intake]]) {
      for (const e of list) {
        if (seen.has(e.code)) add(file, `mã ${e.code} trùng với ${seen.get(e.code)}`, `dup:${e.code}`);
        else seen.set(e.code, file);
        if (!e.title || !e.why) add(file, `${e.code}: thiếu tiêu đề hoặc "vì sao"`, `text:${e.code}`);
        if ((e.level === 'block' || e.level === 'warn') && !e.fix) add(file, `${e.code}: mức ${e.level} phải có "cách sửa" (fix) — không chặn / cảnh báo im lặng (R-GATE-2)`, `fix:${e.code}`);
      }
    }
    const page = ctx.repo.read(PAGE);
    if (page == null) add(PAGE, 'chưa có trang tra mã — chạy node scripts/sinh-ma-loi.mjs --write', 'page:missing');
    else {
      const listed = new Set([...page.matchAll(/^\| `([A-Z]+-[A-Z]+-\d{3})` \|/gm)].map((m) => m[1]));
      for (const code of seen.keys()) if (!listed.has(code)) add(PAGE, `trang tra mã thiếu ${code} — chạy node scripts/sinh-ma-loi.mjs --write`, `page-missing:${code}`);
      for (const code of listed) if (!seen.has(code)) add(PAGE, `trang tra mã có ${code} nhưng thư viện không có`, `page-extra:${code}`);
    }
    return { examined: seen.size, unitBy: 'key', findings, metrics: { gateA: hints.length, gateB: intake.length } };
  },
};
