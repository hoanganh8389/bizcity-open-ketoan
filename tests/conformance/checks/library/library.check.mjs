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
import { pathToFileURL } from 'node:url';
import { validate } from '../../lib/jsonschema.mjs';
import { lintLibrary, serialize } from '../../../../scripts/thu-vien/thu-vien.mjs';

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
      let items = 0;
      for (const { d, file, lib } of libs) {
        items += lib.items?.length ?? 0;
        const lines = r.lines(file);
        const lineOf = (needle) => Math.max(1, lines.findIndex((l) => l.includes(needle)) + 1);
        const add = (message, key) => findings.push(ctx.finding(file, lineOf(key.split(':')[1] ?? '"contract"'), `${d}: ${message}`, `${d}:${key}`));
        // Mục (items) do lintLibrary kiểm chi tiết hơn; ở đây chỉ phong bì, tối đa 5 lỗi.
        if (envelopeSchema) for (const e of validate(envelopeSchema, lib).filter((x) => !x.path.startsWith('/items/')).slice(0, 5)) add(`phong bì ${e.path} ${e.message}`, `envelope:${e.path}`);
        for (const p of lintLibrary(lib, { dir: d, hasReadme: r.exists(`${ROOT}/${d}/README.md`), previous: onMain(r.root, file), libraryIds, prefixes })) add(p.message, p.key);
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
];
