// [2026-11-11 02:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b-2: tách SC-DEV-3 (info) — tiêu chí T1..T6 cũ không chặn PR sửa màn DEV của người khác; SC-DEV-2 chặn phần khai báo (khớp menu, màn có thật)
// [2026-11-11 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): SC-DEV-2 — bảng công cụ nhà phát triển (cong-cu-dev.json) khớp menu và khớp lần sinh lại từ repo
/**
 * SC-DEV-2 — docs/standard/cong-cu-dev.json (bizcity_devtools@1):
 *   1. Mỗi mục menu Nhà phát triển (apps/web/src/phan-he/dev/menu.ts) có đúng một dòng cùng `code` và `path`; không có dòng thừa.
 *   2. `page` của mỗi dòng là tệp có thật.
 * SC-DEV-3 (info):
 *   3. `criteria` (T1..T6) đúng bằng kết quả tính lại từ repo (devtools.lib.mjs) — trường này không gõ tay;
 *      lệch thì chạy `node scripts/cong-cu-dev.mjs --write` (R-CONT-7).
 */
import { computeCriteria, menuItems } from './devtools.lib.mjs';

const FILE = 'docs/standard/cong-cu-dev.json';
const MENU = 'apps/web/src/phan-he/dev/menu.ts';

export const checks = [
  {
    id: 'SC-DEV-2',
    title: 'Bảng công cụ nhà phát triển (cong-cu-dev.json) khớp menu Nhà phát triển và khớp tiêu chí T1..T6 tính lại từ repo',
    gate: 'DOCS', contract: 'quality', rules: ['R-CONT-7'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const b = ctx.repo.json(FILE);
      if (!b) return { examined: 0, unitBy: 'key', findings };
      const f = (msg, key) => findings.push(ctx.finding(FILE, null, msg, key));
      const menu = menuItems(ctx.repo.read(MENU));
      const rows = b.tools ?? [];
      for (const m of menu) {
        const n = rows.filter((t) => t.code === m.code).length;
        if (!n) f(`${m.code} (${m.path}) có trong menu Nhà phát triển nhưng chưa có dòng trong ${FILE}`, `missing:${m.code}`);
        if (n > 1) f(`${m.code} có ${n} dòng`, `dup:${m.code}`);
      }
      for (const t of rows) {
        const m = menu.find((x) => x.code === t.code);
        if (!m) { f(`${t.code} không có trong menu Nhà phát triển (${MENU})`, `extra:${t.code}`); continue; }
        if (m.path !== t.path) f(`${t.code}: path "${t.path}" khác menu "${m.path}"`, `path:${t.code}`);
        if (!ctx.repo.exists(t.page)) { f(`${t.code}: màn ${t.page} không có`, `page:${t.code}`); continue; }
      }
      return { examined: menu.length, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-DEV-3',
    title: 'Bảng công cụ nhà phát triển theo kịp repo: tiêu chí T1..T6 khớp lần tính lại (node scripts/cong-cu-dev.mjs --write)',
    gate: 'DOCS', contract: 'quality', rules: ['R-CONT-7'], conf: [], tier: 2, enforce: 'info', weight: 1, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const b = ctx.repo.json(FILE);
      if (!b) return { examined: 0, unitBy: 'key', findings };
      const r = { read: (x) => ctx.repo.read(x), exists: (x) => ctx.repo.exists(x), files: (o) => ctx.repo.files(o) };
      for (const t of b.tools ?? []) {
        if (!ctx.repo.exists(t.page ?? '')) continue;
        const want = computeCriteria(r, t);
        if (JSON.stringify(want) !== JSON.stringify(t.criteria ?? null)) findings.push(ctx.finding(FILE, null, `${t.code}: tiêu chí T1..T6 lệch với repo — chạy node scripts/cong-cu-dev.mjs --write rồi commit (không sửa tay)`, `stale:${t.code}`));
      }
      return { examined: (b.tools ?? []).length, unitBy: 'key', findings };
    },
  },
];
