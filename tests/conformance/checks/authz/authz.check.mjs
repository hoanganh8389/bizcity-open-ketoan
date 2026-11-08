// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 1): SC-AUTH-03 — danh sách đóng các route ghi cố ý không là defineAction
/**
 * SC-AUTH-03 (bổ sung cho SC-ACT-1): route ghi thô chỉ được giữ khi khai `// @bizcity-route: <lý do>` VÀ có tên trong
 * `tests/conformance/checks/authz/route-giu.json`. Thêm route thô mới = thêm một dòng vào danh sách (Nhóm Lõi duyệt), không chỉ viết lý do.
 *   1. route khai @bizcity-route trong mã mà chưa có trong danh sách → báo;
 *   2. mục trong danh sách không còn route tương ứng (hoặc mất chú thích) → báo (danh sách không được mồ côi);
 *   3. lớp `cong-khai`: khối route phải khai `public: true`; lớp `quyen`: khối route phải có preHandler; lớp lạ → báo.
 */
import { LAYER_ROOTS } from '../../lib/layers.mjs';
// [2026-11-07 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 2: SC-AUTH-04 — thư viện phân quyền mẫu TGS khớp nguồn, ánh xạ không cho thừa
import { build as buildTgs, OUT_CODES as TGS_CODES, OUT_GROUPS as TGS_GROUPS, SOURCE as TGS_SOURCE } from '../../../../scripts/phan-quyen/tgs-anh-xa.mjs';

const TGS_CATALOG = 'packages/platform/src/core/authz/catalog.ts';
const TGS_AUTH = 'packages/platform/src/core/auth.ts';
/** Quyền chỉ đọc — báo cáo chỉ được ánh xạ ra những quyền này (hoặc quyền đề xuất chưa tồn tại). */
const READ_ONLY = (p) => p.endsWith(':read');

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
  {
    id: 'SC-AUTH-04',
    title: 'Thư viện phân quyền mẫu TGS (docs/standard/phan-quyen): khớp bản sinh lại từ CSV nguồn, quyền Core có thật, báo cáo không ra quyền ghi, quyền suy ra không thừa',
    gate: 'CONF-STATIC', contract: 'bizcity_action', rules: ['STD-ACT-1'], conf: [], tier: 2, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const r = ctx.repo;
      if (!r.exists(TGS_SOURCE)) return { examined: 0, findings: [], notes: ['chưa có thư viện TGS'] };
      const findings = [];
      for (const f of [TGS_CODES, TGS_GROUPS, TGS_CATALOG, TGS_AUTH]) if (!r.exists(f)) findings.push(ctx.finding(f, 1, `thiếu ${f}`, `missing:${f}`));
      if (findings.length) return { examined: 1, findings };
      let codes; let groups;
      try { codes = r.json(TGS_CODES); groups = r.json(TGS_GROUPS); } catch (e) { return { examined: 1, findings: [ctx.finding(TGS_CODES, 1, `JSON hỏng: ${e.message}`, 'json')] }; }
      // 1. khớp bản sinh lại (không chỉnh tay JSON)
      const again = buildTgs(r.read(TGS_SOURCE), r.read(TGS_CATALOG));
      if (JSON.stringify(again.codes) !== JSON.stringify(codes) || JSON.stringify(again.groups) !== JSON.stringify(groups)) {
        findings.push(ctx.finding(TGS_CODES, 1, 'thư viện TGS lệch bản sinh lại từ CSV nguồn — chạy node scripts/phan-quyen/tgs-anh-xa.mjs (không chỉnh tay JSON)', 'stale'));
      }
      // 2. quyền Core có thật
      const authText = r.read(TGS_AUTH);
      const block = authText.slice(authText.indexOf('export const PERMISSIONS'), authText.indexOf('] as const', authText.indexOf('export const PERMISSIONS')));
      const known = new Set([...block.matchAll(/'([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)'/g)].map((m) => m[1]));
      const lines = r.lines(TGS_CODES);
      const lineOf = (needle) => Math.max(1, lines.findIndex((l) => l.includes(needle)) + 1);
      const byCode = new Map(codes.items.map((c) => [c.code, c]));
      for (const c of codes.items) {
        for (const m of c.mapsTo) {
          if (m.status === 'core' && !known.has(m.permission)) findings.push(ctx.finding(TGS_CODES, lineOf(`"code": "${c.code}"`), `${c.code}: quyền Core ${m.permission} không có trong PERMISSIONS`, `unknown:${c.code}:${m.permission}`));
          // 3. báo cáo không ra quyền ghi
          if (c.kind === 'report' && m.status !== 'de-xuat' && !READ_ONLY(m.permission)) findings.push(ctx.finding(TGS_CODES, lineOf(`"code": "${c.code}"`), `${c.code} là báo cáo nhưng ánh xạ ra quyền ghi ${m.permission}`, `report-write:${c.code}`));
        }
      }
      // 4. quyền suy ra của nhóm chỉ đến từ ánh xạ có thật, độ tin cậy cao hoặc đã duyệt, trên thao tác nhóm được cấp
      const glines = r.lines(TGS_GROUPS);
      for (const g of groups.items) {
        const justified = new Set();
        for (const [code, ops] of Object.entries(g.grants)) {
          const c = byCode.get(code);
          for (const m of c?.mapsTo ?? []) if (ops.includes(m.op) && (m.status === 'core' || m.status === 'module') && (m.confidence === 'cao' || c.verified === 'da-duyet')) justified.add(m.permission);
        }
        for (const p of g.derived) if (!justified.has(p)) findings.push(ctx.finding(TGS_GROUPS, Math.max(1, glines.findIndex((l) => l.includes(`"code": "${g.code}"`)) + 1), `nhóm ${g.code} có quyền suy ra ${p} không có ánh xạ chứng minh (cao / đã duyệt)`, `derived:${g.code}:${p}`));
      }
      return { examined: codes.items.length + groups.items.length, findings, notes: [`${codes.items.length} mã · ${groups.items.length} nhóm · ${codes.rows} dòng nguồn`] };
    },
  },
];
