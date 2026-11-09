// [2026-11-09 10:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-21 (BIZCITY-ERRORS 1.6.0 §4c, R-ERR-11): SC-ERR-2 — reason viết trong mã có trong ERROR_REASONS và bảng §4 / §4c
/**
 * SC-ERR-2 (R-ERR-11): mọi `reason: 'UPPER_SNAKE'` viết bằng chữ trong mã nguồn (Kernel, Platform, API, module) phải có trong
 * `ERROR_REASONS` (packages/contracts/src/errors.ts), và mọi khoá của `ERROR_REASONS` phải có trong bảng §4 hoặc §4c của
 * docs/contracts/BIZCITY-ERRORS-v1.md. Không thì bên gọi / khay Mã tra cứu gặp một mã không ai định nghĩa.
 * Chỉ bắt chuỗi chữ hoa có `_` (khuôn reason); lý do người dùng gõ (chữ thường, câu tiếng Việt) không thuộc phạm vi.
 */
const CATALOG = 'packages/contracts/src/errors.ts';
const DOC = 'docs/contracts/BIZCITY-ERRORS-v1.md';
const UNDER = ['apps/api/src', 'packages/platform/src', 'packages/kernel/src', 'packages/module-sdk/src', 'modules'];
const USE_RE = /\breason:\s*'([A-Z][A-Z0-9]*_[A-Z0-9_]+)'/g;

export default {
  id: 'SC-ERR-2',
  title: 'details.reason viết trong mã có trong ERROR_REASONS; mỗi reason có dòng ở BIZCITY-ERRORS §4 / §4c',
  gate: 'DOCS', contract: 'bizcity_api', rules: ['R-ERR-11', 'R-ERR-6'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const src = ctx.repo.read(CATALOG);
    if (src == null) return { examined: 0, findings: [], notes: [`không có ${CATALOG}`] };
    const start = src.indexOf('export const ERROR_REASONS');
    const block = src.slice(start, src.indexOf('} as const', start));
    const known = new Set([...block.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
    const findings = [];
    const files = ctx.repo.files({ under: UNDER, ext: ['.ts', '.tsx'], not: /(^|\/)(test|tests|dist|node_modules)\// });
    let uses = 0;
    for (const file of files) {
      if (file === CATALOG) continue;
      const lines = ctx.repo.lines(file) ?? [];
      lines.forEach((text, i) => {
        if (/^\s*(\/\/|\*)/.test(text)) return;
        for (const m of text.matchAll(USE_RE)) {
          uses += 1;
          if (!known.has(m[1])) findings.push(ctx.finding(file, i + 1, `reason ${m[1]} chưa khai ở ERROR_REASONS (R-ERR-11) — thêm vào danh mục và bảng BIZCITY-ERRORS §4 / §4c`, `use:${m[1]}`));
        }
      });
    }
    const doc = ctx.repo.read(DOC) ?? '';
    const a = doc.indexOf('## 4.');
    const sec = a < 0 ? '' : doc.slice(a, doc.indexOf('## 5.', a) < 0 ? undefined : doc.indexOf('## 5.', a));
    for (const r of known) {
      if (!sec.includes(`\`${r}\``)) findings.push(ctx.finding(DOC, null, `ERROR_REASONS có ${r} nhưng bảng §4 / §4c chưa có dòng`, `doc-missing:${r}`));
    }
    return { examined: files.length + known.size, unitBy: 'key', findings, metrics: { reasons: known.size, uses } };
  },
};
