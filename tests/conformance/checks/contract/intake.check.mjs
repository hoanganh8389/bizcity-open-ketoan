// [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1 (R-INTAKE-11, ADR-0014 D11): SC-INTAKE-1 — danh mục IN-* ⇔ bảng hợp đồng ⇔ trang bài học
/**
 * bizcity_intake_findings@1 (R-INTAKE-5, R-INTAKE-11): danh mục máy đọc packages/contracts/src/intake-findings.ts là nguồn
 * duy nhất. Mỗi mã: một dòng đúng khuôn (đủ title / why / fix / ref), một dòng ở bảng §3 của BIZCITY-INTAKE-FINDINGS-v1.md
 * (lớp, mức, giai đoạn, trọng số khớp), một trang docs/huong-dan/loi-dau-vao/<mã>.md. Mã advice không được là block.
 */
const CATALOG = 'packages/contracts/src/intake-findings.ts';
const DOC = 'docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md';
const LESSONS = 'docs/huong-dan/loi-dau-vao';
const ROW = /^ {2}'(IN-[A-Z]+-\d{3})': \{ layer: '(L[1-5])', severity: '(block|warn|hint)', stage: '(door|posting|advice)', weight: (\d+), title: '([^']+)', why: '([^']+)', fix: '([^']+)', ref: '([^']+)', acceptable: (true|false) \},$/;

export default {
  id: 'SC-INTAKE-1',
  title: 'Danh mục mã IN-* khớp bảng BIZCITY-INTAKE-FINDINGS §3 và có trang bài học',
  gate: 'DOCS', contract: 'bizcity_ledger_intake', rules: ['R-INTAKE-5', 'R-INTAKE-11'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const src = ctx.repo.read(CATALOG);
    if (src == null) return { examined: 0, findings: [], notes: [`không có ${CATALOG}`] };
    const findings = [];
    const start = src.indexOf('export const INTAKE_CATALOG');
    const block = src.slice(start, src.indexOf('} as const', start));
    const catalog = new Map();
    for (const line of block.split(/\r?\n/)) {
      const m = ROW.exec(line);
      if (m) catalog.set(m[1], { layer: m[2], severity: m[3], stage: m[4], weight: m[5] });
      else if (/^ {2}'IN-/.test(line)) findings.push(ctx.finding(CATALOG, null, `dòng danh mục không đúng khuôn một dòng (thiếu trường?): ${line.trim().slice(0, 60)}`, `format:${line.trim().slice(1, 13)}`));
    }
    for (const [code, c] of catalog) if (c.stage === 'advice' && c.severity === 'block') findings.push(ctx.finding(CATALOG, null, `${code}: mã advice (chỉ có ở trạm) không được là block (R-INTAKE-4)`, `advice-block:${code}`));
    const doc = ctx.repo.read(DOC) ?? '';
    const rows = new Map([...doc.matchAll(/^\| `(IN-[A-Z]+-\d{3})` \| (L[1-5]) \| (\w+) \| (\w+) \| (\d+) \|/gm)].map((m) => [m[1], { layer: m[2], severity: m[3], stage: m[4], weight: m[5] }]));
    for (const [code, c] of catalog) {
      const d = rows.get(code);
      if (!d) findings.push(ctx.finding(DOC, null, `bảng §3 thiếu mã ${code}`, `doc-missing:${code}`));
      else for (const f of ['layer', 'severity', 'stage', 'weight']) if (d[f] !== c[f]) findings.push(ctx.finding(DOC, null, `${code}: ${f} "${d[f]}" ≠ danh mục "${c[f]}"`, `doc-diff:${code}:${f}`));
      if (!ctx.repo.exists(`${LESSONS}/${code}.md`)) findings.push(ctx.finding(`${LESSONS}/${code}.md`, null, `thiếu trang bài học cho ${code} (R-INTAKE-11)`, `lesson:${code}`));
    }
    for (const code of rows.keys()) if (!catalog.has(code)) findings.push(ctx.finding(DOC, null, `bảng §3 có ${code} nhưng danh mục không có`, `doc-extra:${code}`));
    return { examined: catalog.size, unitBy: 'key', findings };
  },
};
