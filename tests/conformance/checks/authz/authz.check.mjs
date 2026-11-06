// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 1): SC-AUTH-03 — danh sách đóng các route ghi cố ý không là defineAction
/**
 * SC-AUTH-03 (bổ sung cho SC-ACT-1): route ghi thô chỉ được giữ khi khai `// @bizcity-route: <lý do>` VÀ có tên trong
 * `tests/conformance/checks/authz/route-giu.json`. Thêm route thô mới = thêm một dòng vào danh sách (Nhóm Lõi duyệt), không chỉ viết lý do.
 *   1. route khai @bizcity-route trong mã mà chưa có trong danh sách → báo;
 *   2. mục trong danh sách không còn route tương ứng (hoặc mất chú thích) → báo (danh sách không được mồ côi);
 *   3. lớp `cong-khai`: khối route phải khai `public: true`; lớp `quyen`: khối route phải có preHandler; lớp lạ → báo.
 */
import { LAYER_ROOTS } from '../../lib/layers.mjs';

const LIST = 'tests/conformance/checks/authz/route-giu.json';
const ROUTE_RE = /\b(?:r|app|fastify|server|router|api)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]*)['"`]/;
const BLOCK_LINES = 8;

export const checks = [
  {
    id: 'SC-AUTH-03',
    title: 'Route ghi cố ý không là defineAction nằm trong danh sách đóng (route-giu.json), đúng lớp: công khai có public, quản trị có preHandler quyền',
    gate: 'CONF-STATIC', contract: 'bizcity_action', rules: ['STD-ACT-1'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const r = ctx.repo;
      const findings = [];
      if (!r.exists(LIST)) return { examined: 0, findings: [ctx.finding(LIST, 1, `thiếu ${LIST} — danh sách đóng route ghi cố ý (ADR-0027 W3 đợt 2)`, 'list:missing')] };
      let list;
      try { list = r.json(LIST); } catch (e) { return { examined: 1, findings: [ctx.finding(LIST, 1, `JSON hỏng: ${e.message}`, 'list:json')] }; }
      const listLines = r.lines(LIST);
      const lineOf = (needle) => Math.max(1, listLines.findIndex((l) => l.includes(needle)) + 1);
      const classes = Object.keys(list.classes ?? {});
      const entries = new Map();
      for (const e of list.routes ?? []) {
        if (entries.has(e.route)) findings.push(ctx.finding(LIST, lineOf(e.route), `${e.route} khai hai lần`, `dup:${e.route}`));
        entries.set(e.route, e);
        if (!classes.includes(e.class)) findings.push(ctx.finding(LIST, lineOf(e.route), `${e.route}: lớp "${e.class}" không có trong classes`, `class:unknown:${e.route}`));
      }

      const seen = new Set();
      let examined = 0;
      for (const file of r.files({ under: LAYER_ROOTS.concat(['modules']), ext: ['.ts'], not: /(^|\/)(test|tests|__tests__)\// })) {
        const ls = r.lines(file);
        ls.forEach((t, i) => {
          const m = ROUTE_RE.exec(t);
          if (!m || m[1] === 'get' || !/\/\/\s*@bizcity-route:\s*\S/.test(ls[i - 1] ?? '')) return;
          examined++;
          const route = `${m[1].toUpperCase()} ${m[2]}`;
          seen.add(route);
          const e = entries.get(route);
          if (!e) { findings.push(ctx.finding(file, i + 1, `${route} khai @bizcity-route nhưng chưa có trong ${LIST} — thêm một dòng (Nhóm Lõi duyệt) hoặc dùng defineAction`, `unlisted:${route}`)); return; }
          const block = ls.slice(i, i + BLOCK_LINES).join('\n');
          if (e.class === 'cong-khai' && !/public:\s*true/.test(block)) findings.push(ctx.finding(file, i + 1, `${route} lớp cong-khai nhưng khối route không có config: { public: true }`, `class:public:${route}`));
          if (e.class === 'quyen' && !/preHandler\s*:/.test(block)) findings.push(ctx.finding(file, i + 1, `${route} lớp quyen nhưng khối route không có preHandler quyền`, `class:prehandler:${route}`));
        });
      }
      for (const route of entries.keys()) {
        if (!seen.has(route)) findings.push(ctx.finding(LIST, lineOf(route), `${route} có trong danh sách nhưng không còn route khai @bizcity-route trong mã — bỏ dòng hoặc khôi phục chú thích`, `stale:${route}`));
      }
      return { examined: Math.max(examined, entries.size), findings, notes: [`${entries.size} route ghi cố ý trong danh sách đóng; ${seen.size} route khai trong mã`] };
    },
  },
];
