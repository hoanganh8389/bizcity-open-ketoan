// [2026-11-04 12:13 AM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — tài liệu không trôi khỏi mã: đường dẫn trong dấu huyền, route trong tài liệu, mục menu có hướng dẫn
/**
 * Ba chiều tài liệu ↔ mã mà SC-DOC-1 (chỉ liên kết markdown) không thấy:
 *  - SC-DOC-4  `đường/dẫn` trong tài liệu còn hiệu lực phải tồn tại
 *  - SC-DOC-5  "GET /api/v1/…" trong tài liệu phải có route trong mã
 *  - SC-DOC-6  mỗi mục menu web (key) có docs/huong-dan/<key>.md, không thì nút Hướng dẫn hiện "Chưa có hướng dẫn"
 */

/** Nhật ký lịch sử và tài liệu kế hoạch: được phép nhắc thứ đã dời hoặc chưa có. */
const HISTORY = /^(docs\/(phases|adr|audits|nghiem-thu\/.*\/lich-su)\/|CHANGELOG\.md$)/;
const PLAN_DOCS = new Set(['docs/standard/PHASES.md', 'docs/standard/REUSE-MAP.md', 'docs/standard/TARGET-LAYOUT.md', 'docs/standard/GOLDEN-CASE-HOP-DONG.md',
  'docs/standard/CHANNEL-GATEWAY-PORT.md', 'docs/standard/CELL-CONNECT.md', 'docs/framework/02-SHARED-PACKAGES.md']);
/** Dòng tự nói đây là đích chưa có (gói chưa tách, đề xuất, lộ trình). */
const PLANNED = /chưa tách|gói đích|đề xuất|chưa có|lộ trình|dự kiến|để sau|planned|sẽ (tạo|sinh|thêm|tách|về)/i;
const ROOTS = '(?:packages|apps|scripts|tests|docs|db|templates|skills|infrastructure|presets|examples|modules|\\.github)';
const PATH_RE = new RegExp('`(' + ROOTS + '\\/[A-Za-z0-9_\\-./]+)`', 'g');
/** Chỗ giữ chỗ trong đường dẫn mẫu: <x>, {x}, *, …, NNNN, PHASE-xxx, ADR-00xx. */
const PLACEHOLDER = /[*<>{}]|\.\.\.|NNNN|xxx|\dxx/i;
/** Thư mục kết quả chạy: sinh ra lúc chạy, không có sẵn trong repo. */
const GENERATED = /^tests\/conformance\/output(\/|$)|\/secrets\//;

/** Viết tắt quen dùng trong tài liệu: `modules/ledger` = thư mục modules của Kernel hoặc của API. */
const BASES = ['', 'packages/kernel/src/', 'apps/api/src/', 'packages/platform/src/'];
/** Tên import không đuôi (`db/client`, `modules/x/y.service`) cũng tính. */
const VARIANTS = ['', '.ts', '/index.ts'];
/** Khi kiểm một module, tài liệu của nó được nhắc tệp của Core (ctx.core). */
const resolves = (ctx, f, p) => [ctx.repo, ctx.core].some((r) => BASES.some((b) => VARIANTS.some((v) => r.exists(b + p + v))))
  || ctx.repo.exists(f.split('/').slice(0, -1).concat(p).join('/'));
/** Tài liệu tự ghi là đề xuất / dự thảo ở phần đầu: route trong đó là đích, chưa phải mã. */
const isProposal = (ctx, f) => ctx.repo.lines(f).slice(0, 15).some((t) => /Trạng thái:\**\s*(Đề xuất|Dự thảo|Kế hoạch)|^#.*(đề xuất|dự thảo)/i.test(t));

/** templates/: đường dẫn trong đó tính từ module được sinh ra, không từ gốc repo. */
const livingDocs = (ctx) => ctx.repo.files({ ext: ['.md'] }).filter((f) => !HISTORY.test(f) && !PLAN_DOCS.has(f) && !f.startsWith('templates/'));

/** Duyệt từng dòng ngoài khối ``` của một tệp .md. */
function eachLine(ctx, f, fn) {
  let fence = false;
  ctx.repo.lines(f).forEach((t, i) => {
    if (/^\s*```/.test(t)) { fence = !fence; return; }
    if (!fence) fn(t, i + 1);
  });
}

/** Mẫu route trong mã: chuỗi thường, hoặc template literal (`${…}` thành một đoạn bất kỳ). */
function codeRoutes(ctx) {
  const src = ctx.repo.files({ under: ['apps/api/src', 'packages/kernel/src', 'packages/platform/src', 'modules'], ext: ['.ts'], not: /\.test\.ts$/ });
  const exact = new Set();
  const patterns = [];
  const add = (raw) => {
    if (raw.includes('${')) {
      const re = raw.split(/\$\{[^}]*\}/).map((s) => normSeg(s).replace(/[.*+?^()|[\]\\]/g, '\\$&')).join('[^/]+(?:/[^/]+)*?');
      patterns.push(new RegExp('^' + re + '$'));
    } else exact.add(norm(raw));
  };
  for (const f of src) {
    const t = ctx.repo.read(f) ?? '';
    for (const m of t.matchAll(/\b(?:r|app|router|fastify|server)\.(?:get|post|put|patch|delete)\(\s*(['"`])(\/api\/[^'"`]+)\1/g)) add(m[2]);
    for (const m of t.matchAll(/path:\s*(['"`])(\/api\/[^'"`]+)\1/g)) add(m[2]);
  }
  return { has: (p) => exact.has(p) || patterns.some((re) => re.test(p)), size: exact.size + patterns.length };
}
const normSeg = (s) => s.replace(/:[A-Za-z_]+/g, ':p').replace(/\{[A-Za-z_]+\}/g, ':p');
const norm = (s) => s.replace(/\/\d+(?=\/|$)/g, '/:p').replace(/:[A-Za-z_]+/g, ':p').replace(/\{[A-Za-z_]+\}/g, ':p').replace(/\?.*$/, '').replace(/\/$/, '');

export const checks = [
  {
    id: 'SC-DOC-4',
    title: 'Đường dẫn `trong dấu huyền` ở tài liệu còn hiệu lực đều tồn tại (trừ nhật ký, kế hoạch, dòng ghi rõ "chưa tách / đề xuất")',
    gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 2, enforce: 'block', weight: 1, targets: ['repo'],
    run(ctx) {
      const findings = []; let refs = 0;
      for (const f of livingDocs(ctx)) {
        eachLine(ctx, f, (t, line) => {
          for (const m of t.matchAll(PATH_RE)) {
            const p = m[1].replace(/[.,;:)]+$/, '');
            if (PLACEHOLDER.test(p) || GENERATED.test(p)) continue;
            refs++;
            if (resolves(ctx, f, p) || PLANNED.test(t)) continue;
            findings.push(ctx.finding(f, line, `đường dẫn không có: ${p} — sửa về vị trí thật, hoặc ghi rõ "chưa tách" / "đề xuất" nếu là đích lộ trình`, p));
          }
        });
      }
      return { examined: refs, findings };
    },
  },
  {
    id: 'SC-DOC-5',
    title: 'Route "GET|POST|… /api/v1/…" nhắc trong tài liệu có trong mã (route thường hoặc expose.http của action)',
    gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 2, enforce: 'block', weight: 1, targets: ['repo'],
    run(ctx) {
      const code = codeRoutes(ctx);
      if (!code.size) return { examined: 0, findings: [], notes: ['không thấy route nào trong mã'] };
      const findings = []; let refs = 0;
      for (const f of livingDocs(ctx).filter((x) => !isProposal(ctx, x))) {
        eachLine(ctx, f, (t, line) => {
          for (const m of t.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+`?(\/api\/v1\/[A-Za-z0-9_\-/:{}.?=&]+)/g)) {
            const raw = m[2].replace(/[.,;)`]+$/, '');
            if (PLACEHOLDER.test(raw.replace(/\{[A-Za-z_]+\}/g, '')) || raw.startsWith('/api/v1/m/')) continue; // /m/<module>: route của module cài thêm, không nằm trong mã Core
            refs++;
            const p = norm(raw);
            if (code.has(p) || PLANNED.test(t)) continue;
            findings.push(ctx.finding(f, line, `${m[1]} ${raw}: không có route này trong mã — sửa đường, hoặc ghi "(đề xuất, chưa có trong mã)"`, `${m[1]} ${p}`));
          }
        });
      }
      return { examined: refs, findings };
    },
  },
  {
    id: 'SC-DOC-6',
    title: 'Mỗi mục menu web có docs/huong-dan/<key>.md (nút Hướng dẫn của màn)',
    gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 2, enforce: 'ratchet', weight: 1, targets: ['repo'],
    run(ctx) {
      const menus = ctx.repo.files({ under: ['apps/web/src/phan-he'], match: /\/menu\.ts$/ });
      if (!menus.length) return { examined: 0, findings: [], notes: ['không có apps/web/src/phan-he/*/menu.ts'] };
      const findings = []; const seen = new Set();
      for (const f of menus) {
        const text = ctx.repo.read(f) ?? '';
        for (const m of text.matchAll(/\{[^{}]*?\bkey:\s*'([^']+)'[^{}]*?\bpath:\s*'\/[^{}]*?\}/g)) {
          const key = m[1];
          if (seen.has(key)) continue;
          seen.add(key);
          if (ctx.repo.exists(`docs/huong-dan/${key}.md`)) continue;
          const line = text.slice(0, m.index).split('\n').length;
          const label = /\blabel:\s*'([^']+)'/.exec(m[0])?.[1] ?? key;
          findings.push(ctx.finding(f, line, `"${label}" chưa có docs/huong-dan/${key}.md — nút Hướng dẫn hiện "Chưa có hướng dẫn"`, `guide:${key}`));
        }
      }
      return { examined: seen.size, findings };
    },
  },
];
