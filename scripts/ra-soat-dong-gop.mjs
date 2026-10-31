#!/usr/bin/env node
// [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — rà soát lượt đầu việc của người đóng góp: commit theo tác giả, tệp theo lớp, dò vi phạm kiến trúc / dữ liệu kế toán / mã hàng trên dòng THÊM.
/**
 * Rà soát việc của người đóng góp — lượt đầu tự động (docs/rules/RULE-REVIEW.md §3, R-REV-3).
 *
 *   node scripts/ra-soat-dong-gop.mjs [--range <từ>..<đến>] [--author "<tên>"] [--out <tệp.md>]
 *     --range   mặc định HEAD..origin/main (những gì sắp kéo về); đã kéo rồi thì đưa range cụ thể, vd e2ada98..origin/main
 *     --author  chỉ commit của người này (git log --author, khớp một phần tên / email)
 *     --out     ghi biên bản Markdown (mặc định in ra màn hình)
 *
 * Chỉ đọc dòng THÊM của từng commit (git show -U0), không đọc cả tệp: phát hiện là việc của commit đó, không phải nợ cũ.
 * Phát hiện = gợi ý cho người rà (có thể dương tính giả); "chặn" = phải sửa hoặc giải thích trước khi nhận. Không thay
 * selfcheck / vitest / diagnostics — biên bản ghi kết quả của ba thứ đó riêng (R-REV-4).
 * Thoát 1 khi có phát hiện mức "chặn".
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expectedLayer } from '../tests/conformance/lib/layers.mjs';
import { isFrameworkFile } from '../tests/conformance/lib/framework-files.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const range = opt('--range', 'HEAD..origin/main');
const author = opt('--author');
const out = opt('--out');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const logArgs = ['log', '--no-merges', '--format=%H%x09%h%x09%an%x09%ad%x09%s', '--date=format:%Y-%m-%d %H:%M', range];
if (author) logArgs.push(`--author=${author}`);
const commits = git(...logArgs).trim().split('\n').filter(Boolean).map((l) => { const [sha, short, name, date, subject] = l.split('\t'); return { sha, short, name, date, subject }; });
const [, to = 'HEAD'] = range.split('..');
const firstParent = new Set(git('log', '--first-parent', '--format=%H', range).trim().split('\n').filter(Boolean));

/**
 * Luật dò trên dòng thêm. `files`: biểu thức tệp áp dụng; `level`: chặn | cảnh báo | ghi chú.
 * Mã luật trỏ về RULE-REVIEW §4 (bảng H-*) và luật gốc.
 */
const API_D = /^apps\/api\/src\/phan-he\//;
const RULES = [
  { id: 'H-LEDGER', level: 'chặn', rule: 'Câu 2, R-LEDGER', files: /^apps\/api\/src\//, re: /(insertInto|updateTable|deleteFrom)\(\s*['"]ledger_|\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+ledger_/i, msg: 'ghi thẳng bảng ledger_* — sổ chỉ ghi qua Kernel (bút toán đảo khi sửa / huỷ)' },
  { id: 'H-LEDGERSVC', level: 'chặn', rule: 'Câu 3, R-BOUND', files: API_D, re: /\bledgerService\b/, msg: 'phân hệ gọi ledgerService — phải nộp sự việc qua documentService / ctx.ledger.submit' },
  { id: 'H-KERNEL-IMPORT', level: 'chặn', rule: 'SC-KERNEL-6', files: API_D, re: /from\s+['"][^'"]*\/modules\/(ledger|posting|posting-config|documents|vouchers|periods|closing)\//, msg: 'phân hệ import thẳng mô-đun Kernel — chỉ qua apps/api/src/kernel/public.ts' },
  { id: 'H-CROSS-MODULE', level: 'chặn', rule: 'R-BOUND', files: /^apps\/(api|web)\/src\/phan-he\/([^/]+)\//, re: /from\s+['"]\.\.\//, check: (file, line) => { const own = file.split('/')[4]; const m = /from\s+['"](?:\.\.\/)+(?:phan-he\/)?([a-z-]+)\//.exec(line); return m && m[1] !== own && /^(ban-hang|mua-hang|kho|quy|thue|tai-san|ke-toan|he-thong|api)$/.test(m[1]); }, msg: 'phân hệ import phân hệ khác — nối bằng khoá tham chiếu / sự kiện (R-WF-8)' },
  { id: 'H-ACCOUNT-LITERAL', level: 'chặn', rule: 'Câu 4, R-POST-2', files: /^apps\/api\/src\/.*(posting|dinh-khoan|hach-toan)[^/]*\.ts$/, re: /['"`](1[1-5]\d|2[1-4]\d|3[3-5]\d|4[1-2]\d|5[1-2]\d|6[1-4]\d|711|811|911)\d{0,5}['"`]/, msg: 'viết số tài khoản trong mã định khoản — tra qua AccountResolver / gói định khoản' },
  { id: 'H-SEQ', level: 'cảnh báo', rule: 'STD-DOC-6', files: API_D, re: /['"]document_sequences['"]/, msg: 'phân hệ tự đếm số chứng từ — dùng cấp số chung (documents.numbering)' },
  { id: 'H-STATUS', level: 'cảnh báo', rule: 'R-WF-1', files: API_D, re: /\.set\(\{[^}]*\bstatus:\s*['"`]/, msg: 'đổi trạng thái bằng UPDATE viết cứng — đi qua workflow (*.workflow.yaml, wf.plan)' },
  { id: 'H-REPLY', level: 'chặn', rule: 'R-API', files: /^apps\/api\/src\//, re: /\breply\.status\(/, msg: 'reply.status() — lỗi qua Errors.*' },
  { id: 'H-MONEY', level: 'cảnh báo', rule: 'Quy ước tiền', files: /^apps\/api\/src\/|^packages\/contracts\/src\//, re: /\b(parseFloat|toFixed)\(|\*\s*0\.1\b/, check: (_f, l) => !/\$\{[^}]*toFixed\(/.test(l), msg: 'tính tiền bằng số thực — cộng trừ qua toCents / fromCents, làm tròn một chỗ' },
  { id: 'H-FETCH', level: 'cảnh báo', rule: 'R-OUTBOX', files: /^apps\/api\/src\//, re: /\b(fetch|axios)\s*\(/, msg: 'gọi HTTP ra ngoài — trong giao dịch ghi phải qua outbox (core/events.ts)' },
  { id: 'H-ROUTE-PERM', level: 'cảnh báo', rule: 'R-TEN, SC-ACT-1', files: API_D, re: /\br\.(post|put|patch|delete)\(\s*['"`]\/api\//, check: (_f, line) => !/preHandler/.test(line), msg: 'route ghi mới không khai preHandler quyền — ưu tiên defineAction (quyền, zod, Idempotency-Key, bằng chứng)' },
  { id: 'H-SKIP', level: 'chặn', rule: 'R-QG-8', files: /\.test\.ts$/, re: /\b(it|describe|test)\.(skip|only)\(/, msg: 'test .skip / .only mới' },
  { id: 'H-SECRET', level: 'chặn', rule: 'R-SEC', files: /./, re: /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{12,}['"]/i, check: (f) => !/\.test\.ts$|\.example$|fixtures\//.test(f), msg: 'giống bí mật viết trong mã' },
  { id: 'H-MD-TABLE', level: 'chặn', rule: 'R-MD-1, Standard §5', files: /^db\/migrations\/.*\.sql$/, re: /CREATE\s+TABLE[^(]*\b\w*(customer|khach|product|mat_hang|item|branch|chi_nhanh|partner|supplier|ncc)\w*\s*\(/i, msg: 'bảng danh mục riêng (khách, hàng, chi nhánh, đối tượng) — dùng danh mục chuẩn' },
  { id: 'H-MIGRATION', level: 'ghi chú', rule: 'R-DB', files: /^db\/migrations\/.*\.sql$/, re: /^/, once: true, msg: 'migration mới — rà COMMENT ON, numeric(18,2) cho tiền, RLS cho bảng có tenant_id, chỉ thêm' },
  { id: 'H-SKU', level: 'cảnh báo', rule: 'R-MD-11', files: /^apps\/(api|web)\/src\//, re: /\bsku\s*[:=]\s*`|\bsku\s*\+=|\bsku\s*=\s*[^=;]*\+\s*['"`]/, check: (f) => !/catalog\/sku-rule\.ts$/.test(f), msg: 'tự ghép mã hàng — sinh mã chỉ qua nextSku (modules/catalog/sku-rule.ts, SKU_RULE)' },
  { id: 'H-UNIT', level: 'cảnh báo', rule: 'R-MD-12', files: /^apps\/(api|web)\/src\/|^packages\/contracts\/src\//, re: /\b(ratio|he_?so|factor)\s*[:=]\s*([2-9]|\d{2,})\b/i, check: (f) => !/\.test\.ts$/.test(f), msg: 'hệ số quy đổi ĐVT viết cứng — đọc product_units (ĐVT tồn kho tỉ lệ 1)' },
  // Mã hàng trong dữ liệu (seed, kịch bản, JSON mẫu): SKU_RULE — 2 + 3 + 1 + 3 số (9 ký tự), quà "Q" + 3 + 1 + 4 số, đuôi biến thể chữ hoa.
  { id: 'H-SKU-DATA', level: 'cảnh báo', rule: 'R-REV-7, SKU_RULE', files: /\.(json|jsonl|csv)$/, re: /"sku"\s*:\s*"([^"]*)"/, check: (_f, l) => { const v = /"sku"\s*:\s*"([^"]*)"/.exec(l)[1]; return !/^(\d{9}|Q\d{8})[A-Z]{0,2}$/.test(v); }, msg: 'mã hàng trong dữ liệu không theo quy tắc 3 cấp nhóm + số thứ tự (modules/catalog/sku-rule.ts)' },
];

const findings = [];
const files = new Map(); // tệp → { commits:Set, added, removed }
for (const c of commits) {
  const diff = git('show', '--format=', '-U0', '--no-color', '--no-renames', c.sha);
  let file = null, lineNo = 0;
  const onceHit = new Set();
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, ''); if (file === '/dev/null') file = null; continue; }
    if (raw.startsWith('--- ')) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (h) { lineNo = Number(h[1]); continue; }
    if (!file) continue;
    const f = files.get(file) ?? { commits: new Set(), added: 0, removed: 0 };
    files.set(file, f);
    f.commits.add(c.short);
    if (raw.startsWith('-')) { f.removed++; continue; }
    if (!raw.startsWith('+')) continue;
    f.added++;
    const line = raw.slice(1);
    for (const r of RULES) {
      if (!r.files.test(file) || !r.re.test(line)) continue;
      if (r.check && !r.check(file, line)) continue;
      if (r.once) { const k = `${r.id}:${file}`; if (onceHit.has(k)) continue; onceHit.add(k); }
      findings.push({ ...r, file, line: lineNo, commit: c.short, text: line.trim().slice(0, 140) });
    }
    lineNo++;
  }
}

const layerOf = (f) => expectedLayer(f)?.layer ?? (f.startsWith('apps/web/') ? 'web' : f.startsWith('packages/contracts/') ? 'contracts' : f.startsWith('db/') ? 'db' : f.includes('.test.') || f.startsWith('apps/api/test/') ? 'test' : 'khác');
const fw = [...files.keys()].filter((f) => isFrameworkFile(f));
const direct = commits.filter((c) => firstParent.has(c.sha));
const touchedApi = [...files.keys()].some((f) => API_D.test(f) || f.startsWith('packages/contracts/src/'));
const touchedTests = [...files.keys()].some((f) => f.startsWith('apps/api/test/'));
if (direct.length) findings.push({ id: 'H-DIRECT-MAIN', level: 'cảnh báo', rule: 'R-QG-1, R-REV-1', file: '(git)', line: 0, commit: direct.map((c) => c.short).join(' '), text: `${direct.length}/${commits.length} commit đẩy thẳng ${to}`, msg: 'không qua PR / CI / người duyệt' });
if (touchedApi && !touchedTests) findings.push({ id: 'H-NO-TEST', level: 'cảnh báo', rule: 'R-QG-2', file: '(tổng)', line: 0, commit: '', text: 'đổi logic API / contracts nhưng không thêm / sửa test', msg: 'mỗi tính năng / sửa lỗi cần test hồi quy' });
for (const f of files.keys()) if (!fw.includes(f) && (expectedLayer(f)?.layer ?? '').split('+').includes('M')) findings.push({ id: 'H-MASTERDATA', level: 'cảnh báo', rule: 'R-REV-2, R-MD', file: f, line: 0, commit: [...files.get(f).commits].join(' '), text: '', msg: 'người đóng góp sửa danh mục chuẩn (lớp M) — Nhóm Lõi rà mã, ĐVT, ràng buộc' });
for (const f of fw) findings.push({ id: 'H-FRAMEWORK', level: 'cảnh báo', rule: 'R-REV-2, R-SIG', file: f, line: 0, commit: [...files.get(f).commits].join(' '), text: '', msg: 'người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG' });

const order = { 'chặn': 0, 'cảnh báo': 1, 'ghi chú': 2 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.id.localeCompare(b.id) || a.file.localeCompare(b.file) || a.line - b.line);
const count = (lv) => findings.filter((x) => x.level === lv).length;
const byLayer = {};
for (const [f, s] of files) { const l = layerOf(f); byLayer[l] ??= { files: 0, added: 0, removed: 0 }; byLayer[l].files++; byLayer[l].added += s.added; byLayer[l].removed += s.removed; }

const md = [];
md.push(`# Rà soát lượt đầu — ${range}${author ? ` · tác giả "${author}"` : ''}`, '');
md.push(`Sinh bởi \`node scripts/ra-soat-dong-gop.mjs\` (R-REV-3) lúc ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Phát hiện là **gợi ý** trên dòng thêm, người rà xác nhận từng dòng.`, '');
md.push(`**${commits.length} commit · ${files.size} tệp · ${count('chặn')} chặn · ${count('cảnh báo')} cảnh báo · ${count('ghi chú')} ghi chú**`, '');
md.push('## Commit', '', '| Commit | Tác giả | Lúc | Nội dung | Thẳng nhánh đích |', '|---|---|---|---|---|');
for (const c of commits) md.push(`| ${c.short} | ${c.name} | ${c.date} | ${c.subject.replace(/\|/g, '\\|')} | ${firstParent.has(c.sha) ? 'có' : ''} |`);
md.push('', '## Tệp theo lớp', '', '| Lớp | Tệp | Dòng thêm | Dòng bỏ |', '|---|---|---|---|');
for (const [l, s] of Object.entries(byLayer).sort()) md.push(`| ${l} | ${s.files} | ${s.added} | ${s.removed} |`);
md.push('', '## Phát hiện', '');
if (!findings.length) md.push('Không có.');
else {
  md.push('| Mức | Mã | Luật | Chỗ | Commit | Vì sao | Dòng |', '|---|---|---|---|---|---|---|');
  for (const x of findings) md.push(`| ${x.level} | ${x.id} | ${x.rule} | \`${x.file}${x.line ? `:${x.line}` : ''}\` | ${x.commit} | ${x.msg} | ${x.text ? `\`${x.text.replace(/\|/g, '\\|').replace(/`/g, "'")}\`` : ''} |`);
}
md.push('', '## Người rà điền (R-REV-4)', '', '- [ ] `node tests/conformance/selfcheck.mjs --strict` trên mã đã gộp', '- [ ] `npm run typecheck`, `npm test` (số test qua / lỗi)', '- [ ] diagnostics trên CSDL test (DG-*): sổ cân, công nợ = số dư 131 / 331, hoá đơn = thuế, tài khoản trung gian về 0', '- [ ] dữ liệu mẫu / mã hàng / ĐVT (RULE-REVIEW §5)', '- [ ] kết luận: ĐẠT · ĐẠT có điều kiện · KHÔNG ĐẠT', '');
const text = md.join('\n');
if (out) { writeFileSync(out, text); console.log(`Đã ghi ${out}: ${commits.length} commit, ${count('chặn')} chặn, ${count('cảnh báo')} cảnh báo`); } else console.log(text);
process.exit(count('chặn') ? 1 : 0);
