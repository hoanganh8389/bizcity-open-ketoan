// [2026-11-10 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B1 (S034-3): SC-REL-3 — tệp docs/ mà mã đọc lúc chạy phải có COPY trong ảnh api (R-REL-11); thẻ Nền móng HT10 từng báo NOT_FOUND vì thiếu COPY nen-mong.json
/**
 * SC-REL-3 — R-REL-11. Đọc tĩnh:
 *   1. Tệp mã chạy (packages/<gói>/src, apps/api/src, modules/<module>, bỏ test) có `import … 'node:fs'` thì mọi chuỗi
 *      'docs/….json' / '.yaml' / '.yml' trên dòng mã (không phải chú thích) là tệp ĐỌC LÚC CHẠY.
 *   2. Tệp đó phải có trong repo, và có `COPY` (đúng tệp hoặc thư mục cha) ở giai đoạn chạy của docker/api.Dockerfile
 *      (sau `FROM` cuối, bỏ `COPY --from=`). Chạy dev đọc thẳng repo nên lỗi chỉ lộ ở bản cài Docker.
 */
const DOCKERFILE = 'docker/api.Dockerfile';
const UNDER = ['packages', 'apps/api/src', 'modules'];
const FS_IMPORT = /from\s+['"](node:)?fs(\/promises)?['"]|require\(\s*['"](node:)?fs['"]\s*\)/;
const DOC_LIT = /['"`](docs\/[\w./-]+\.(?:json|ya?ml))['"`]/g;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

/** Nguồn của các lệnh COPY ở giai đoạn chạy (sau FROM cuối), bỏ COPY --from=. */
function runtimeCopies(text) {
  const lines = text.split(/\r?\n/);
  const lastFrom = lines.reduce((k, l, i) => (/^\s*FROM\s/i.test(l) ? i : k), -1);
  const out = [];
  for (const l of lines.slice(lastFrom + 1)) {
    const m = /^\s*COPY\s+(.+)$/i.exec(l);
    if (!m || /--from=/.test(m[1])) continue;
    const parts = m[1].replace(/--\S+/g, '').trim().split(/\s+/);
    out.push(...parts.slice(0, -1).map((p) => p.replace(/\/$/, '')));
  }
  return out;
}

export const checks = [
  {
    id: 'SC-REL-3',
    title: 'Tệp docs/ mà mã đọc lúc chạy có trong repo và có COPY trong giai đoạn chạy của docker/api.Dockerfile',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-REL-11'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const docker = ctx.repo.read(DOCKERFILE);
      const findings = [];
      if (docker == null) return { examined: 0, unitBy: 'key', findings };
      const copies = runtimeCopies(docker);
      const covered = (p) => copies.some((s) => s === p || s === '.' || p.startsWith(`${s}/`));
      const seen = new Map();
      const src = ctx.repo.files({ under: UNDER, ext: ['.ts', '.mts', '.mjs', '.js'], not: /(^|\/)(test|tests|__tests__|dist|node_modules)\/|\.(test|spec)\.[mc]?[jt]s$|\.d\.ts$/ });
      for (const f of src) {
        const text = ctx.repo.read(f) ?? '';
        if (!FS_IMPORT.test(text)) continue;
        text.split(/\r?\n/).forEach((line, i) => {
          if (COMMENT.test(line)) return;
          for (const m of line.matchAll(DOC_LIT)) if (!seen.has(m[1])) seen.set(m[1], { file: f, line: i + 1 });
        });
      }
      for (const [doc, at] of seen) {
        if (!ctx.repo.exists(doc)) findings.push(ctx.finding(at.file, at.line, `đọc ${doc} lúc chạy nhưng repo không có tệp này`, `missing-file:${doc}`));
        else if (!covered(doc)) findings.push(ctx.finding(DOCKERFILE, null, `${at.file}:${at.line} đọc ${doc} lúc chạy nhưng ảnh api không COPY tệp này — bản cài Docker sẽ trả NOT_FOUND; thêm "COPY ${doc} ${doc}" (R-REL-11)`, `missing-copy:${doc}`));
      }
      return { examined: seen.size, unitBy: 'key', findings };
    },
  },
];
