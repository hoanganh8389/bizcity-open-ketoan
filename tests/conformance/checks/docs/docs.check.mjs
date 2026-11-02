// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Tài liệu là một phần của chuẩn: liên kết không gãy, cột "Kiểm bằng" của mỗi luật trỏ tới thứ có thật.
 */
import path from 'node:path';

export const checks = [
  {
    id: 'SC-DOC-1',
    title: 'Liên kết tương đối và neo (#…) trong tệp .md đều tới được',
    gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 2, enforce: 'ratchet', weight: 1, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ ext: ['.md'] });
      const anchors = new Map();
      const anchorsOf = (f) => {
        if (!anchors.has(f)) {
          const set = new Set();
          const counts = new Map();
          for (const t of ctx.repo.lines(f)) {
            const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(t);
            if (!h) continue;
            const base = slug(h[1]);
            const n = counts.get(base) ?? 0;
            counts.set(base, n + 1);
            set.add(n ? `${base}-${n}` : base);
          }
          for (const t of ctx.repo.lines(f)) for (const m of t.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) set.add(m[1]);
          anchors.set(f, set);
        }
        return anchors.get(f);
      };
      const findings = []; let links = 0;
      for (const f of files) {
        let fence = false;
        ctx.repo.lines(f).forEach((t, i) => {
          if (/^\s*```/.test(t)) fence = !fence;
          if (fence) return;
          for (const m of t.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
            const href = m[1];
            if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue;
            links++;
            const [p, hash] = href.split('#');
            const target = p ? path.posix.normalize(path.posix.join(path.posix.dirname(f), decodeURIComponent(p))) : f;
            if (p && !ctx.repo.exists(target)) { findings.push(ctx.finding(f, i + 1, `liên kết gãy: ${href}`, href)); continue; }
            if (hash && target.endsWith('.md') && !/^L\d+/.test(hash) && !anchorsOf(target).has(hash.toLowerCase())) findings.push(ctx.finding(f, i + 1, `neo không có: ${href}`, href));
          }
        });
      }
      return { examined: links, findings };
    },
  },
  {
    id: 'SC-DOC-2',
    title: 'Cột "Kiểm bằng" của luật R-* trỏ tới test / tệp có thật',
    gate: 'DOCS', contract: 'docs', rules: ['R-QG-1'], conf: [], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      const tests = new Set(ctx.repo.list('apps/api/test'));
      const findings = []; let rules = 0;
      for (const f of ctx.repo.files({ under: ['docs/rules'], ext: ['.md'] })) {
        ctx.repo.lines(f).forEach((t, i) => {
          const m = /^\|\s*\*{0,2}(R-[A-Z]+-\d+)\*{0,2}[^|]*\|.*\|([^|]*)\|\s*$/.exec(t);
          if (!m) return;
          rules++;
          for (const ref of m[2].matchAll(/`?([\w.-]+\.test\.ts)`?/g)) {
            if (!tests.has(ref[1])) findings.push(ctx.finding(f, i + 1, `${m[1]}: "Kiểm bằng" trỏ ${ref[1]} — không có trong apps/api/test/`, `${m[1]}:${ref[1]}`));
          }
          for (const ref of m[2].matchAll(/`((?:apps|packages|scripts|db|\.github)\/[\w./-]+)`/g)) {
            if (!ctx.repo.exists(ref[1])) findings.push(ctx.finding(f, i + 1, `${m[1]}: "Kiểm bằng" trỏ ${ref[1]} — không có`, `${m[1]}:${ref[1]}`));
          }
        });
      }
      return { examined: rules, findings };
    },
  },
  // [2026-11-02 06:49 PM Johnny Chu - Chu Hoàng Anh] SO-DANG-KY — SC-DOC-3: số ADR không trùng, chỉ mục khớp tệp (trùng ADR-0014, ADR-0015 ngày 2026-11-02)
  {
    id: 'SC-DOC-3',
    title: 'ADR: số không trùng; mỗi tệp ADR có đúng một dòng ở docs/adr/README.md, số ở dòng chỉ mục khớp số tệp',
    gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const DIR = 'docs/adr';
      const files = ctx.repo.list(DIR).filter((f) => /^ADR-\d{4}-.+\.md$/.test(f));
      if (!files.length) return { examined: 0, findings: [], notes: [`chưa có ${DIR}/ADR-*.md`] };
      const findings = [];
      const byNo = new Map();
      for (const f of files) byNo.set(f.slice(4, 8), [...(byNo.get(f.slice(4, 8)) ?? []), f]);
      for (const [no, fs] of byNo) if (fs.length > 1) findings.push(ctx.finding(DIR, null, `trùng số ADR-${no}: ${fs.join(', ')} — đổi số tệp mới: node scripts/so-tiep-theo.mjs kiem --doi-so`, `dup:${no}`));
      const index = `${DIR}/README.md`;
      const rows = new Map();
      ctx.repo.lines(index).forEach((t, i) => {
        const m = /^\| \[(\d{4})\]\((ADR-(\d{4})-[^)]+\.md)\)/.exec(t);
        if (!m) return;
        if (m[1] !== m[3]) findings.push(ctx.finding(index, i + 1, `dòng chỉ mục ghi [${m[1]}] nhưng trỏ ${m[2]}`, `row:${m[2]}`));
        rows.set(m[2], (rows.get(m[2]) ?? 0) + 1);
      });
      for (const f of files) {
        const n = rows.get(f) ?? 0;
        if (n !== 1) findings.push(ctx.finding(index, null, n ? `${f} có ${n} dòng chỉ mục` : `${f} chưa có dòng trong chỉ mục`, `index:${f}`));
      }
      return { examined: files.length, findings };
    },
  },
];

/** Neo theo cách GitHub: chữ thường, bỏ dấu câu, khoảng trắng → '-'; giữ chữ có dấu tiếng Việt. */
function slug(s) {
  return s.replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}
