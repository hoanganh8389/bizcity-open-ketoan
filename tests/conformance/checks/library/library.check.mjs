// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, BIZCITY-LIBRARY-v1 §11): SC-LIB-1 — mọi thư viện libraries/<id>/library.json đúng khuôn bizcity_library@1: phong bì, mã không mất, payload theo itemSchema, giá trị theo ngày không chồng, băm + phiên bản, luật khai báo, sinh lại khớp
/**
 * Kiểm (hợp đồng §11): 1. phong bì khớp BIZCITY-LIBRARY-v1.schema.json, id = tên thư mục, có README.md;
 * 2. mã duy nhất, replacedBy có thật / không vòng, mã có trên origin/main không mất; 3. payload khớp itemSchema, effective[] đúng;
 * 4. contentHash đúng, changelog[0] khớp, đổi nội dung phải lên phiên bản, phiên bản cũ không đổi băm; có generatedBy thì chạy
 * lại build() ra đúng tệp; 5. rules[]: mã theo codePrefix, không trùng, block / warn có fix, op cho phép, thư viện gợi ý có thật;
 * 6. sources[] có, sources/ không chứa mã nguồn (D-LIB-9). Logic ở scripts/thu-vien/thu-vien.mjs (dùng chung với script sinh).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { validate } from '../../lib/jsonschema.mjs';
import { basisKeysOf, lintLibrary, serialize } from '../../../../scripts/thu-vien/thu-vien.mjs';
// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a: basis[].key của mọi thư viện phải có trong vn.can-cu-phap-ly (khi thư viện đó có)

const ROOT = 'libraries';
const SCHEMA = 'docs/contracts/BIZCITY-LIBRARY-v1.schema.json';
/** Tệp mã nguồn không được nằm trong sources/ (D-LIB-9: không mang mã của phần mềm khác vào repo). */
const CODE_EXT = /\.(py|pyc|js|ts|cs|java|php|rb|go|dll|exe|sql|xml)$/i;

/** library.json trên origin/main — chỉ khi gốc kiểm là gốc repo git (không phải thư mục fixture). */
function onMain(root, rel) {
  try {
    if (execFileSync('git', ['-C', root, 'rev-parse', '--show-prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) return null;
    return JSON.parse(execFileSync('git', ['-C', root, 'show', `origin/main:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null;
  }
}

export const checks = [
  {
    id: 'SC-LIB-1',
    title: 'Thư viện dùng chung (libraries/*/library.json) đúng khuôn bizcity_library@1: phong bì, mã không mất, payload theo itemSchema, giá trị theo ngày, băm + phiên bản, luật khai báo, sinh lại khớp',
    gate: 'CONF-STATIC', contract: 'contracts', rules: ['R-GATE-2'], conf: [], tier: 2, enforce: 'block', weight: 2, targets: ['repo'],
    async run(ctx) {
      const r = ctx.repo;
      const dirs = r.list(ROOT).filter((d) => r.isDir(`${ROOT}/${d}`));
      if (!dirs.length) return { examined: 0, findings: [], notes: ['chưa có thư viện'] };
      const findings = [];
      let envelopeSchema = null;
      try { envelopeSchema = r.json(SCHEMA); } catch { findings.push(ctx.finding(SCHEMA, 1, `thiếu / hỏng ${SCHEMA}`, 'schema:missing')); }
      const libs = [];
      for (const d of dirs) {
        const file = `${ROOT}/${d}/library.json`;
        if (!r.exists(file)) { findings.push(ctx.finding(`${ROOT}/${d}`, null, `libraries/${d}: thiếu library.json`, `missing:${d}`)); continue; }
        try { libs.push({ d, file, lib: r.json(file) }); } catch (e) { findings.push(ctx.finding(file, 1, `JSON hỏng: ${e.message}`, `json:${d}`)); }
      }
      const libraryIds = new Set(libs.map((x) => x.lib.id));
      const prefixes = new Map();
      for (const { lib } of libs) if (lib.codePrefix && !prefixes.has(lib.codePrefix)) prefixes.set(lib.codePrefix, lib.id);
      const basisLib = libs.find((x) => x.lib.id === 'vn.can-cu-phap-ly')?.lib;
      const basisKeys = basisLib ? basisKeysOf(basisLib) : undefined;
      let items = 0;
      for (const { d, file, lib } of libs) {
        items += lib.items?.length ?? 0;
        const lines = r.lines(file);
        const lineOf = (needle) => Math.max(1, lines.findIndex((l) => l.includes(needle)) + 1);
        const add = (message, key) => findings.push(ctx.finding(file, lineOf(key.split(':')[1] ?? '"contract"'), `${d}: ${message}`, `${d}:${key}`));
        // Mục (items) do lintLibrary kiểm chi tiết hơn; ở đây chỉ phong bì, tối đa 5 lỗi.
        if (envelopeSchema) for (const e of validate(envelopeSchema, lib).filter((x) => !x.path.startsWith('/items/')).slice(0, 5)) add(`phong bì ${e.path} ${e.message}`, `envelope:${e.path}`);
        for (const p of lintLibrary(lib, { dir: d, hasReadme: r.exists(`${ROOT}/${d}/README.md`), previous: onMain(r.root, file), libraryIds, prefixes, basisKeys })) add(p.message, p.key);
        // 4b. sinh lại khớp
        if (lib.generatedBy) {
          const script = lib.generatedBy;
          if (!r.exists(script)) add(`generatedBy ${script} không có`, 'gen:missing');
          else {
            try {
              const mod = await import(pathToFileURL(r.toAbs(script)).href);
              const again = serialize(mod.build((n) => r.read(path.posix.join(path.posix.dirname(script), n)), lib));
              if (again !== r.read(file)) add(`library.json lệch bản sinh lại — chạy node ${script} (không sửa tay)`, 'gen:stale');
            } catch (e) {
              add(`chạy ${script} lỗi: ${e.message}`, 'gen:error');
            }
          }
        }
        // 6. sources/
        for (const f of r.list(`${ROOT}/${d}/sources`)) if (CODE_EXT.test(f)) add(`sources/${f} là tệp mã — chỉ để dữ liệu nguồn (D-LIB-9)`, `sources-code:${f}`);
      }
      return { examined: libs.length, findings, notes: [`${libs.length} thư viện · ${items} mục`] };
    },
  },
  // [2026-11-09 12:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51a (26 §4.1 ③): SC-LIB-2 — module dùng thư viện đúng khai báo
  {
    id: 'SC-LIB-2',
    title: 'Module khai libraries[] trong bizcity.module.json dùng thư viện đúng khai báo: thư viện có thật, mọi lời gọi ctx.libraries đã khai, mọi thư viện đã khai có được dùng, không viết cứng mã / giá trị trùng thư viện (chỉ xét module có khai hoặc có gọi)',
    gate: 'CONF-STATIC', contract: 'bizcity_module', rules: ['R-GATE-2'], conf: [], tier: 2, enforce: 'block', weight: 2, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const r = ctx.repo;
      const findings = [];
      // Thư viện: gốc kiểm có libraries/ thì dùng (repo, fixture); chế độ module dùng thư viện của repo chứa bộ kiểm.
      const libs = new Map();
      const readLibs = (dir, readDir, read) => {
        for (const d of readDir(dir)) {
          try { const lib = JSON.parse(read(`${dir}/${d}/library.json`)); if (lib?.id) libs.set(lib.id, lib); } catch { /* thư viện hỏng đã bị SC-LIB-1 báo */ }
        }
      };
      if (ctx.mode === 'repo') readLibs(ROOT, (d) => r.list(d), (p) => r.read(p));
      else {
        const abs = fileURLToPath(new URL('../../../../libraries', import.meta.url));
        if (existsSync(abs)) readLibs(abs, (d) => readdirSync(d), (p) => readFileSync(p, 'utf8'));
      }
      const mods = ctx.mode === 'module' ? [{ key: '', base: '' }] : r.list('modules').filter((k) => r.exists(`modules/${k}/bizcity.module.json`)).map((k) => ({ key: k, base: `modules/${k}` }));
      const CALL = /\blibraries\.(?:validate|require)\(\s*(['"`])([A-Za-z0-9.-]+)\1/g;
      const CALL_LINE = /\blibraries\.(?:validate|require)\(/;
      let examined = 0;
      for (const m of mods) {
        const manifestFile = m.base ? `${m.base}/bizcity.module.json` : 'bizcity.module.json';
        let manifest;
        try { manifest = r.json(manifestFile); } catch { continue; }
        if (!manifest) continue;
        const decls = Array.isArray(manifest.libraries) ? manifest.libraries : [];
        const code = r.files({ under: [m.base || '.'], ext: ['.ts', '.tsx', '.mjs', '.js'], not: /(^|\/)(test|tests|__tests__|node_modules)\// });
        const calls = []; // { id, file, line }
        for (const file of code) {
          r.lines(file).forEach((t, i) => { if (/^\s*(\/\/|\*)/.test(t)) return; for (const mm of t.matchAll(CALL)) calls.push({ id: mm[2], file, line: i + 1 }); });
        }
        if (!decls.length && !calls.length) continue;
        examined++;
        const tag = m.key || manifest.key || 'module';
        const mlines = r.lines(manifestFile);
        const at = (id) => Math.max(1, mlines.findIndex((l) => l.includes(`"${id}"`)) + 1);
        const declared = new Set(decls.map((d) => d.id));
        for (const d of decls) {
          const lib = libs.get(d.id);
          if (!lib) { findings.push(ctx.finding(manifestFile, at(d.id), `${tag}: libraries[] khai ${d.id} nhưng không có libraries/${d.id}/library.json`, `${tag}:missing:${d.id}`)); continue; }
          if (d.required === true && !(lib.items ?? []).some((i) => i.status === 'active')) findings.push(ctx.finding(manifestFile, at(d.id), `${tag}: ${d.id} là thư viện bắt buộc nhưng không còn mục nào đang dùng`, `${tag}:required:${d.id}`));
          if (!calls.some((c) => c.id === d.id)) findings.push(ctx.finding(manifestFile, at(d.id), `${tag}: khai ${d.id} nhưng mã nguồn không gọi ctx.libraries.validate / require với thư viện này`, `${tag}:unused:${d.id}`));
        }
        for (const c of calls) if (!declared.has(c.id)) findings.push(ctx.finding(c.file, c.line, `${tag}: gọi ctx.libraries với ${c.id} nhưng chưa khai trong libraries[] của bizcity.module.json`, `${tag}:undeclared:${c.id}`));
        // Mã cứng: chuỗi trùng mã thư viện lịch / danh mục, số lớn trùng giá trị hiệu lực của thư viện tham số — chỉ thư viện module đã khai.
        const strings = new Map(); // mã → thư viện
        const numbers = new Map(); // số → "thư viện:mã"
        for (const d of decls) {
          const lib = libs.get(d.id);
          if (!lib) continue;
          for (const it of lib.items ?? []) {
            if ((lib.kind === 'calendar' || lib.kind === 'code-list') && String(it.code).length >= 6) strings.set(String(it.code), lib.id);
            if (lib.kind === 'param') for (const e of it.effective ?? []) if (typeof e.value === 'number' && e.value >= 100000) numbers.set(e.value, `${lib.id}:${it.code}`);
          }
        }
        if (strings.size || numbers.size) {
          for (const file of code) {
            const ls = r.lines(file);
            ls.forEach((t, i) => {
              if (/^\s*(\/\/|\*)/.test(t) || /\/\/\s*library-ok:/.test(ls[i - 1] ?? '') || /\/\/\s*library-ok:/.test(t)) return;
              for (const mm of t.matchAll(/(['"`])([^'"`\n]{6,80})\1/g)) {
                const lib = strings.get(mm[2]);
                if (lib && !CALL_LINE.test(t)) findings.push(ctx.finding(file, i + 1, `${tag}: chuỗi "${mm[2]}" trùng mã trong ${lib} — đọc qua ctx.libraries, không viết cứng (hoặc ghi chú // library-ok: <lý do> ngay dòng trên)`, `${tag}:hard-str:${mm[2]}`));
              }
              for (const mm of t.matchAll(/(?<![\w.])(\d[\d_]{5,12})(?![\w.])/g)) {
                const n = Number(mm[1].replace(/_/g, ''));
                if (numbers.has(n)) findings.push(ctx.finding(file, i + 1, `${tag}: số ${mm[1]} trùng giá trị hiệu lực của ${numbers.get(n)} — đọc qua ctx.libraries, không viết cứng (hoặc ghi chú // library-ok: <lý do> ngay dòng trên)`, `${tag}:hard-num:${n}`));
              }
            });
          }
        }
      }
      return { examined, findings, notes: [`${examined} module dùng thư viện`] };
    },
  },
  // [2026-11-09 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51b (26 §4.2): SC-LIB-3 — bảng gắn trường ↔ thư viện của cửa nạp đúng khuôn
  {
    id: 'SC-LIB-3',
    title: 'Bảng gắn trường chứng từ ↔ thư viện (packages/contracts/src/library-bindings.ts): id duy nhất, đường trường đúng khuôn, thư viện có thật, gắn theo ngày chứng từ',
    gate: 'CONF-STATIC', contract: 'contracts', rules: ['R-GATE-2', 'R-INTAKE-4'], conf: [], tier: 2, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const r = ctx.repo;
      const file = 'packages/contracts/src/library-bindings.ts';
      if (!r.exists(file)) return { examined: 0, findings: [], notes: ['chưa có bảng gắn'] };
      const findings = [];
      const libs = new Set(r.list('libraries').filter((d) => r.exists(`libraries/${d}/library.json`)));
      const PATH_RE = /^[A-Za-z][A-Za-z0-9]*(\[\])?(\.[A-Za-z][A-Za-z0-9]*(\[\])?)*$/;
      const lines = r.lines(file);
      const seen = new Set();
      let n = 0;
      lines.forEach((t, i) => {
        const m = /\{\s*id:\s*'([^']*)'\s*,\s*path:\s*'([^']*)'\s*,\s*library:\s*'([^']*)'(?:[^}]*?at:\s*'([^']*)')?/.exec(t);
        if (!m) return;
        n++;
        const [, id, p, lib, at] = m;
        const add = (msg, key) => findings.push(ctx.finding(file, i + 1, `gắn ${id}: ${msg}`, `${id}:${key}`));
        if (!/^[a-z][a-z0-9-]*$/.test(id)) add('id phải dạng kebab-case (a-z, 0-9, gạch ngang)', 'id');
        if (seen.has(id)) add('id trùng', 'dup');
        seen.add(id);
        if (!PATH_RE.test(p)) add(`đường trường "${p}" sai khuôn (tên trường, [] cho mảng, dấu chấm cho lồng)`, 'path');
        if (!libs.has(lib)) add(`thư viện ${lib} không có trong libraries/`, 'lib');
        if (at !== undefined && at !== 'docDate') add(`at "${at}" chưa hỗ trợ (chỉ docDate)`, 'at');
      });
      return { examined: n, findings, notes: [`${n} gắn`] };
    },
  },
];
