#!/usr/bin/env node
// [2026-11-03 07:32 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — đo bằng chứng "Core đã làm sẵn gì" và "AI phải đọc bao nhiêu": số đếm từ mã nguồn, không gõ tay
/**
 * Đo từ chính repo, CHỈ ĐỌC, không cần cài gì:   node scripts/do-bang-chung-core.mjs [--json]
 *
 *   A. Core đã làm sẵn   số loại chứng từ, luật định khoản, route API, migration, test, mã phát hiện, ca F22, luật kiểm chuẩn,
 *                        số dòng mã (không tính test). Đây là khối lượng một dev sẽ KHÔNG phải tự viết.
 *   B. AI phải đọc       kích thước bộ tài liệu tối thiểu (AGENTS.md + skill nền + một skill + hợp đồng nạp + docs/core).
 *                        Token chỉ là ƯỚC LƯỢNG theo khoảng ký tự trên token (tiếng Việt thường 2,5 - 4 ký tự / token);
 *                        chưa đo bằng bộ tách token của nhà cung cấp mô hình.
 *
 * Không so với "toàn văn thông tư": repo không chứa toàn văn, nên chi phí của cách tự làm KHÔNG đo được ở đây.
 * Số đếm là ĐÃ ĐO (route, test: đếm theo mẫu viết, là mức tối thiểu). Số giờ, số token, chi phí trong docs/core/05-tiet-kiem-thoi-gian-va-token.md là GIẢ ĐỊNH (mô hình), không ở đây.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const SKIP = new Set(['node_modules', 'dist', '.git', '.bizcity', 'coverage', 'output']);

function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, accept, out);
    else if (accept(p)) out.push(p);
  }
  return out;
}
const read = (p) => readFileSync(p, 'utf8');
const lines = (p) => read(p).split('\n').length;
const isCode = (p) => /\.(ts|tsx|mjs|js)$/.test(p) && !/\.(test|spec)\.|[\\/]test[\\/]|[\\/]fixtures[\\/]|\.d\.ts$/.test(p);
const sum = (files) => files.reduce((s, f) => s + lines(f), 0);
const count = (files, re) => files.reduce((s, f) => s + (read(f).match(re) ?? []).length, 0);

// ── A. Core đã làm sẵn ──
const codeDirs = ['packages/kernel/src', 'packages/platform/src', 'packages/contracts/src', 'packages/module-sdk/src', 'apps/api/src', 'packages/cli'];
const codeFiles = codeDirs.flatMap((d) => walk(path.join(ROOT, d), isCode));
const apiFiles = [...walk(path.join(ROOT, 'packages/kernel/src'), isCode), ...walk(path.join(ROOT, 'apps/api/src'), isCode)];
const testFiles = walk(path.join(ROOT, 'apps/api/test'), (p) => /\.test\.ts$/.test(p));
const ruleFiles = walk(path.join(ROOT, 'packages/kernel/src/modules/posting/rules'), (p) => /\.rule\.ts$/.test(p));
const diagFiles = walk(path.join(ROOT, 'packages'), (p) => /\.diagnostics\.ts$/.test(p)).concat(walk(path.join(ROOT, 'apps/api/src'), (p) => /\.diagnostics\.ts$/.test(p)));
const checkFiles = walk(path.join(ROOT, 'tests/conformance/checks'), (p) => /\.check\.mjs$/.test(p));
const docTypes = (/APPROVABLE_DOC_TYPES = \[([^\]]+)\]/.exec(read(path.join(ROOT, 'packages/contracts/src/documents.ts')))?.[1] ?? '').split(',').filter((x) => x.trim()).length;
const intakeFile = path.join(ROOT, 'packages/contracts/src/intake-findings.ts');
const faultFile = path.join(ROOT, 'packages/kernel/src/modules/review/fault-catalog.ts');

const A = {
  docTypes,
  postingRuleFiles: ruleFiles.length,
  // Hai đường đăng ký route: r.get('/api/…') / app.get(…) và action có expose.http { method, path } (tránh đếm thiếu, đã gặp: 361 thay vì 453)
  apiRoutes: count(apiFiles, /\b(?:r|app)\.(get|post|put|patch|delete)\(\s*['"`]\/api\//g) + count(apiFiles, /method:\s*'(?:GET|POST|PUT|PATCH|DELETE)',\s*path:\s*'\/api\//g),
  migrations: walk(path.join(ROOT, 'db/migrations'), (p) => p.endsWith('.sql')).length,
  testFilesApi: testFiles.length,
  testCasesApi: count(testFiles, /^\s*(it|test)\(/gm),
  intakeFindingCodes: existsSync(intakeFile) ? new Set(read(intakeFile).match(/'IN-[A-Z]+-\d{3}'/g) ?? []).size : 0,
  f22Cases: existsSync(faultFile) ? (read(faultFile).match(/"id": "F22-/g) ?? []).length : 0,
  diagnosticChecks: count(diagFiles, /^\s*code: '[A-Z_]+', layer:/gm),
  conformanceCheckFiles: checkFiles.length,
  skills: walk(path.join(ROOT, 'skills'), (p) => p.endsWith('SKILL.md')).length,
  sourceLines: sum(codeFiles),
  sourceFiles: codeFiles.length,
};

// ── B. AI phải đọc ──
const READING = {
  'AGENTS.md (mục Xây app ghi sổ)': (() => {
    const t = read(path.join(ROOT, 'AGENTS.md'));
    const i = t.indexOf('## Xây app ghi sổ');
    return i < 0 ? '' : t.slice(i, t.indexOf('\n## ', i + 5) < 0 ? undefined : t.indexOf('\n## ', i + 5));
  })(),
  'skill nền open-ketoan-standard': read(path.join(ROOT, 'skills/open-ketoan-standard/SKILL.md')),
  'một skill theo việc (build-pos-with-open-ketoan)': read(path.join(ROOT, 'skills/build-pos-with-open-ketoan/SKILL.md')),
  'hợp đồng nạp chứng từ': read(path.join(ROOT, 'docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md')),
};
const coreDocs = walk(path.join(ROOT, 'docs/core'), (p) => p.endsWith('.md'));
const TOKEN_CHARS = [2.5, 4];
const measure = (text) => ({ chars: text.length, words: text.split(/\s+/).filter(Boolean).length, tokensMin: Math.round(text.length / TOKEN_CHARS[1]), tokensMax: Math.round(text.length / TOKEN_CHARS[0]) });
const readingRows = Object.entries(READING).map(([name, text]) => ({ name, ...measure(text) }));
const total = readingRows.reduce((a, r) => ({ chars: a.chars + r.chars, words: a.words + r.words, tokensMin: a.tokensMin + r.tokensMin, tokensMax: a.tokensMax + r.tokensMax }), { chars: 0, words: 0, tokensMin: 0, tokensMax: 0 });
const B = {
  tokenCharsPerToken: TOKEN_CHARS,
  minimalReadingSet: { rows: readingRows, total },
  docsCore: { files: coreDocs.map(rel), ...measure(coreDocs.map(read).join('\n')) },
};

const result = { measuredAt: new Date().toISOString().slice(0, 10), A, B };
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const n = (v) => Number(v).toLocaleString('vi-VN');
  const out = [];
  out.push('A. Core đã làm sẵn (ĐÃ ĐO từ mã nguồn)');
  for (const [k, label] of [['docTypes', 'loại chứng từ nhận vào'], ['postingRuleFiles', 'tệp luật định khoản'], ['apiRoutes', 'route API (/api/…)'], ['migrations', 'migration CSDL'],
    ['testFilesApi', 'tệp test API'], ['testCasesApi', 'ca test API'], ['intakeFindingCodes', 'mã phát hiện ở cửa nạp (IN-*)'], ['f22Cases', 'ca lỗi F22 có cách khắc phục theo vai'],
    ['diagnosticChecks', 'kiểm tự chẩn đoán'], ['conformanceCheckFiles', 'tệp luật bộ kiểm chuẩn'], ['skills', 'skill cho AI'], ['sourceFiles', 'tệp mã nguồn (không tính test)'], ['sourceLines', 'dòng mã nguồn (không tính test)']]) out.push(`  ${n(A[k]).padStart(8)}  ${label}`);
  out.push('', `B. Bộ tài liệu tối thiểu AI phải đọc (ký tự, từ ĐÃ ĐO; token là ƯỚC LƯỢNG ${TOKEN_CHARS[0]}–${TOKEN_CHARS[1]} ký tự/token)`);
  for (const r of readingRows) out.push(`  ${n(r.chars).padStart(8)} ký tự  ${n(r.words).padStart(7)} từ  ~${n(r.tokensMin)}–${n(r.tokensMax)} token  ${r.name}`);
  out.push(`  ${n(total.chars).padStart(8)} ký tự  ${n(total.words).padStart(7)} từ  ~${n(total.tokensMin)}–${n(total.tokensMax)} token  CỘNG`);
  out.push(`  docs/core (${coreDocs.length} tệp, đọc theo vai, không phải đọc hết): ${n(B.docsCore.chars)} ký tự, ~${n(B.docsCore.tokensMin)}–${n(B.docsCore.tokensMax)} token`);
  process.stdout.write(`${out.join('\n')}\n`);
}
