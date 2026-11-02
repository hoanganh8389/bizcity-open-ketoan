// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: SC-FIX-1 — mọi kiểm mức warn / error và mọi mục bảng kiểm khoá kỳ có phương án khắc phục có cấu trúc (bizcity_remedy@1, R-FIX-1..4).
/**
 * SC-FIX-1 (block). Đọc mã nguồn, không chạy:
 *   1. Mỗi DiagCheck mức warn / error (`code: 'X', layer: 'Ln', level: 'warn|error'`) trong *.diagnostics.ts và
 *      packages/platform/src/system/diagnostics.ts có `remedy:` với `steps`, `owner`, `verify`.
 *   2. Kiểm Tier 0 (tier: 0 ở check DG-* cùng mã của lane diagnostics) có `stopTheLine: true` (R-FIX-2).
 *   3. `SCREENS.<X>` được dùng thì có trong sổ màn (packages/contracts/src/remedy.ts); mọi đường dẫn trong sổ màn có trong menu
 *      giao diện (apps/web/src/phan-he/* /menu.ts) — nút "mở màn" không bao giờ dẫn vào chỗ không có.
 *   4. `verify: { code: 'Y' }` trỏ mã kiểm có thật.
 *   5. Mỗi mục bảng kiểm khoá kỳ (`{ key: 'k', … count: …` ở periods/period.routes.ts) có `remedy: PERIOD_CHECK_REMEDIES.k`
 *      và khoá đó có trong period-check.remedies.ts.
 */
const REMEDY_FILE = 'packages/contracts/src/remedy.ts';
const PERIOD_ROUTES = 'packages/kernel/src/modules/periods/period.routes.ts';
const PERIOD_REMEDIES = 'packages/kernel/src/modules/periods/period-check.remedies.ts';
const CODE_RE = /code: '([A-Z][A-Z0-9_]+)', layer: 'L\d', level: '(warn|error|info)'/g;

/** Tách các đối tượng kiểm theo vị trí `code: '…'` — đoạn từ mã này tới mã kế tiếp thuộc về kiểm này. */
function checkSegments(text) {
  const hits = [...text.matchAll(CODE_RE)];
  return hits.map((m, i) => ({ code: m[1], level: m[2], body: text.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : text.length) }));
}

export default {
  id: 'SC-FIX-1',
  title: 'Mọi kiểm warn / error và mục bảng kiểm khoá kỳ có phương án khắc phục có cấu trúc; màn dẫn tới có thật (R-FIX-1)',
  gate: 'CONF-STATIC', contract: 'kernel', rules: ['R-FIX-1', 'R-FIX-2', 'R-FIX-4'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const findings = [];
    const add = (file, msg, key) => findings.push(ctx.finding(file, null, msg, key));

    // Sổ màn + menu
    const remedyText = ctx.repo.read(REMEDY_FILE) ?? '';
    const screens = new Map([...remedyText.matchAll(/^\s*([A-Z][A-Z0-9_]*): s\('([A-Z0-9_]+)', '([^']+)'/gm)].map((m) => [m[1], m[3]]));
    const menuPaths = new Set();
    for (const f of ctx.repo.files({ under: ['apps/web/src/phan-he'], match: /\/menu\.ts$/ })) {
      for (const m of (ctx.repo.read(f) ?? '').matchAll(/path: '([^']+)'/g)) menuPaths.add(m[1]);
    }
    if (menuPaths.size) for (const [k, p] of screens) if (!menuPaths.has(p)) add(REMEDY_FILE, `SCREENS.${k} → ${p} không có trong menu giao diện`, `screen-path:${k}`);

    // Tier 0 từ lane diagnostics
    const tier0 = new Set();
    for (const f of ctx.repo.files({ under: ['tests/conformance/diagnostics'], ext: ['.diag.mjs'] })) {
      const text = ctx.repo.read(f) ?? '';
      for (const chunk of text.split(/(?=\bid: 'DG-)/)) {
        const code = /code: '([A-Z0-9_]+)'/.exec(chunk)?.[1];
        if (code && /\btier: 0\b/.test(chunk.slice(0, 600))) tier0.add(code);
      }
    }

    // Kiểm trong app
    const diagFiles = ctx.repo.files({ under: ['packages', 'apps'], ext: ['.ts'], match: /(\.diagnostics\.ts|platform\/src\/system\/diagnostics\.ts)$/, not: /\/test\// });
    const allCodes = new Set();
    const segs = [];
    for (const f of diagFiles) for (const s of checkSegments(ctx.repo.read(f) ?? '')) { allCodes.add(s.code); segs.push({ f, ...s }); }
    let examined = 0;
    for (const { f, code, level, body } of segs) {
      if (level === 'info') continue;
      examined++;
      if (!/\bremedy:\s*\{/.test(body)) { add(f, `${code} (${level}) chưa có remedy (bước, màn, vai, kiểm lại)`, `missing:${code}`); continue; }
      if (!/\bsteps:\s*\[/.test(body) || !/\bowner:\s*'/.test(body) || !/\bverify:\s*\{/.test(body)) add(f, `${code}: remedy thiếu steps / owner / verify`, `shape:${code}`);
      if (tier0.has(code) && !/\bstopTheLine:\s*true/.test(body)) add(f, `${code} là Tier 0: remedy phải có stopTheLine: true (dừng ghi sổ, báo nhóm Lõi)`, `stop:${code}`);
      for (const m of body.matchAll(/SCREENS\.([A-Za-z0-9_]+)/g)) if (screens.size && !screens.has(m[1])) add(f, `${code}: SCREENS.${m[1]} không có trong sổ màn`, `screen-unknown:${code}:${m[1]}`);
      const v = /verify:\s*\{\s*code:\s*'([A-Z0-9_]+)'/.exec(body)?.[1];
      if (v && !allCodes.has(v) && !segs.some((x) => x.code === v)) add(f, `${code}: verify trỏ mã ${v} không có`, `verify:${code}:${v}`);
    }

    // Bảng kiểm khoá kỳ
    const routes = ctx.repo.read(PERIOD_ROUTES);
    if (routes) {
      const remedies = ctx.repo.read(PERIOD_REMEDIES) ?? '';
      const declared = new Set([...remedies.matchAll(/^\s{2}([a-zA-Z]+): \{/gm)].map((m) => m[1]));
      for (const m of routes.matchAll(/\{ key: '([a-zA-Z]+)', ([^\n]*count:[^\n]*)/g)) {
        examined++;
        const k = m[1];
        if (!m[2].includes(`remedy: PERIOD_CHECK_REMEDIES.${k}`)) add(PERIOD_ROUTES, `mục bảng kiểm khoá kỳ "${k}" chưa có remedy`, `period:${k}`);
        else if (!declared.has(k)) add(PERIOD_REMEDIES, `thiếu phương án cho mục "${k}"`, `period-remedy:${k}`);
      }
    }
    return { examined, unitBy: 'key', findings };
  },
};
