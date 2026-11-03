#!/usr/bin/env node
// [2026-11-03 10:45 PM Johnny Chu - Chu Hoàng Anh] FLOW — Bước 0 của AGENTS.md bằng lệnh: xem bảng giữ chỗ trên origin/main, kiểm nhánh đang làm trước khi đẩy (R-FLOW-1 / 2 / 3 / 4 / 5)
/**
 * Nhiều phiên cùng làm một kho: giữ chỗ vào main trước khi code (docs/rules/RULE-FLOW.md, docs/phases/CLAIMS.md).
 *
 *   node scripts/nhan-viec.mjs              # = list: bảng giữ chỗ TRÊN origin/main + nhánh đang mở chưa vào main
 *   node scripts/nhan-viec.mjs kiem         # trước khi đẩy: nhánh hiện tại đã giữ chỗ chưa, tệp đổi có trong phạm vi không,
 *                                           #   đổi thứ dùng chung đã có chữ chốt chưa, nhánh ngắn không, đã gộp main và không xung đột
 *   … --khong-fetch                         # không git fetch (máy không mạng)
 *   … --nhanh <tên>                         # kiểm nhánh khác (mặc định: nhánh hiện tại)
 *
 * Thoát 1 khi có ✘ (R-FLOW-1/2/3/5); ▲ (R-FLOW-4, dòng bỏ quên) chỉ cảnh báo. Bảng được kiểm tĩnh ở SC-FLOW-1 (selfcheck);
 * phần cần git nằm ở đây — check của bộ kiểm chuẩn chỉ được đọc qua ctx, như so-tiep-theo.mjs với số migration.
 * Ngoại lệ không cần giữ chỗ (R-FLOW): chỉ tài liệu; một tệp không đụng thứ dùng chung.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALWAYS_OK, CLAIMS_FILE, inScope, isDocsOnly, parseClaims, sharedTouched } from '../tests/conformance/checks/flow/flow.lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--nhanh') ?? 'list';
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const MAX_COMMITS = 10; // R-FLOW-4
const MAX_HOURS = 24;
const STALE_DAYS = 3; // R-FLOW-6
const LOOKBACK_DAYS = 14; // chữ chốt vào main trong 14 ngày trước ngày giữ chỗ vẫn tính

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const lines = (s) => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

if (!flag('khong-fetch')) tryGit('fetch', '--all', '--prune', '-q');
if (!tryGit('rev-parse', '--verify', 'origin/main')) { console.error('Không thấy origin/main (chưa có remote?). Dùng --khong-fetch khi không có mạng và đã có origin/main.'); process.exit(2); }
const claimsOnMain = tryGit('show', `origin/main:${CLAIMS_FILE}`);

function list() {
  console.log('Việc đang có người nhận — bản trên origin/main (đọc bản này, không đọc bản trong nhánh của mình)\n');
  if (claimsOnMain == null) { console.log(`  origin/main chưa có ${CLAIMS_FILE}.`); return 0; }
  const { rows, problems } = parseClaims(claimsOnMain);
  if (!rows.length) console.log('  (chưa có dòng nào — phạm vi nào cũng nhận được)');
  const claimed = new Set(rows.map((r) => r.nhanh));
  for (const r of rows) {
    const last = tryGit('log', '-1', '--format=%ct', `origin/${r.nhanh}`);
    const ageDays = last ? (Date.now() - Number(last) * 1000) / 86_400_000 : (Date.now() - Date.parse(`${r.tu}T00:00:00Z`)) / 86_400_000;
    console.log(`• ${r.dot}`);
    console.log(`    phạm vi : ${r.phamvi.join('; ')}`);
    console.log(`    nhánh   : ${r.nhanh}${last ? '' : '  (chưa có trên origin)'} · ${r.nguoi} · ${r.trang} · từ ${r.tu}`);
    if (ageDays > STALE_DAYS) console.log(`    ▲ ${last ? 'commit cuối' : 'giữ chỗ'} cách đây ${Math.floor(ageDays)} ngày — quá ${STALE_DAYS} ngày coi là đã nhả (R-FLOW-6); hỏi người giữ hoặc chủ dự án trước khi nhận`);
  }
  for (const p of problems) console.log(`  ✘ bảng sai khuôn${p.line ? ` (dòng ${p.line})` : ''}: ${p.message}`);
  const open = tryGit('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
    ?.split('\n').filter((b) => b && b !== 'origin' && b !== 'origin/HEAD' && b !== 'origin/main') ?? [];
  const extra = open.map((b) => ({ b, ahead: Number(tryGit('rev-list', '--count', `origin/main..${b}`) ?? 0), t: Number(tryGit('log', '-1', '--format=%ct', b) ?? 0) })).filter((x) => x.ahead > 0);
  if (extra.length) {
    console.log('\nNhánh trên origin còn commit chưa vào main:');
    for (const x of extra.sort((a, b) => b.t - a.t)) {
      const name = x.b.replace(/^origin\//, '');
      const hours = Math.round((Date.now() - x.t * 1000) / 3_600_000);
      console.log(`  ${name}  +${x.ahead} commit · ${hours} giờ trước${claimed.has(name) ? '' : '  ▲ không có dòng giữ chỗ'}`);
    }
  }
  return problems.length ? 1 : 0;
}

function kiem() {
  const out = [];
  const add = (lvl, rule, msg) => out.push({ lvl, rule, msg });
  const branch = opt('nhanh') ?? tryGit('branch', '--show-current');
  if (!branch || branch === 'main' || branch === 'master') { console.log('Đang ở main (hoặc HEAD rời): không có nhánh để kiểm.'); return 0; }
  const ref = tryGit('rev-parse', '--verify', branch) ? branch : `origin/${branch}`;
  const changed = lines(tryGit('diff', '--name-only', `origin/main...${ref}`));
  console.log(`Kiểm nhánh ${branch} so với origin/main — ${changed.length} tệp đổi\n`);
  if (!changed.length) { console.log('  ✔ chưa có thay đổi so với main'); return 0; }

  // R-FLOW-1 / 3 — giữ chỗ và phạm vi
  const parsed = claimsOnMain == null ? null : parseClaims(claimsOnMain);
  const mine = parsed ? parsed.rows.filter((r) => r.nhanh === branch) : [];
  const shared = sharedTouched(changed);
  let claim = null;
  if (isDocsOnly(changed)) add('ok', 'R-FLOW-1', 'chỉ tài liệu — không cần giữ chỗ (ngoại lệ)');
  else if (changed.length <= 1 && !shared.length) add('ok', 'R-FLOW-1', 'một tệp, không đụng thứ dùng chung — không cần giữ chỗ (ngoại lệ)');
  else if (!parsed) add('warn', 'R-FLOW-1', `origin/main chưa có ${CLAIMS_FILE} — bỏ qua kiểm giữ chỗ`);
  else if (!mine.length) add('fail', 'R-FLOW-1', `nhánh \`${branch}\` chưa có dòng giữ chỗ trên origin/main. Thêm một dòng vào ${CLAIMS_FILE} bằng PR chỉ tài liệu, chờ merge, rồi mới code (Bước 0 AGENTS.md). Xem: node scripts/nhan-viec.mjs`);
  else if (mine.length > 1) add('fail', 'R-FLOW-3', `nhánh \`${branch}\` có ${mine.length} dòng trong ${CLAIMS_FILE} — một nhánh một dòng`);
  else {
    claim = mine[0];
    add('ok', 'R-FLOW-1', `có dòng giữ chỗ: "${claim.dot}" (${claim.trangthai}, từ ${claim.tu})`);
    const outside = changed.filter((f) => !ALWAYS_OK.some((re) => re.test(f)) && !inScope(f, claim.phamvi));
    if (outside.length) add('fail', 'R-FLOW-3', `${outside.length} tệp ngoài phạm vi đã giữ chỗ: ${outside.slice(0, 10).join(', ')}${outside.length > 10 ? ', …' : ''}. Mở rộng phạm vi bằng PR chỉ tài liệu vào main trước, hoặc bỏ các tệp này khỏi nhánh`);
    else add('ok', 'R-FLOW-3', 'mọi tệp đổi nằm trong phạm vi đã giữ chỗ');
  }

  // R-FLOW-2 — thứ dùng chung phải có chữ chốt
  for (const s of shared) {
    const inBranch = changed.filter((f) => s.docs.some((re) => re.test(f)));
    if (inBranch.length) { add('warn', 'R-FLOW-2', `${s.ten}: chữ chốt (${inBranch.join(', ')}) nằm CÙNG nhánh với code — R-FLOW-2 muốn PR tài liệu vào main trước`); continue; }
    const since = dayStr((claim ? Date.parse(`${claim.tu}T00:00:00Z`) : Date.now()) - LOOKBACK_DAYS * 86_400_000);
    const onMain = lines(tryGit('log', 'origin/main', `--since=${since}`, '--name-only', '--pretty=format:')).filter((f) => s.docs.some((re) => re.test(f)));
    if (onMain.length) add('ok', 'R-FLOW-2', `${s.ten}: chữ chốt đã vào main (${[...new Set(onMain)].slice(0, 3).join(', ')})`);
    else add('fail', 'R-FLOW-2', `${s.ten} (${s.code.slice(0, 3).join(', ')}): đổi thứ dùng chung nhưng chưa thấy tài liệu chốt nào vào main kể từ ${since}. Mở PR tài liệu chốt thiết kế (hợp đồng / ADR) vào main trước — bảng ở RULE-FLOW §3`);
  }

  // R-FLOW-4 — nhánh ngắn
  const commits = Number(tryGit('rev-list', '--count', '--no-merges', `origin/main..${ref}`) ?? 0);
  const times = lines(tryGit('log', '--no-merges', '--format=%ct', `origin/main..${ref}`)).map(Number);
  const hours = times.length ? Math.round((Date.now() - Math.min(...times) * 1000) / 3_600_000) : 0;
  if (commits > MAX_COMMITS) add('warn', 'R-FLOW-4', `nhánh có ${commits} commit (quá ${MAX_COMMITS}) — chia nhỏ, merge sớm`);
  if (hours > MAX_HOURS) add('warn', 'R-FLOW-4', `commit đầu của nhánh cách đây ${hours} giờ (quá ${MAX_HOURS} giờ) — nhánh sống lâu dễ lệch main`);
  if (commits <= MAX_COMMITS && hours <= MAX_HOURS) add('ok', 'R-FLOW-4', `nhánh ngắn: ${commits} commit, ${hours} giờ`);

  // R-FLOW-5 — đã gộp main, không xung đột
  const behind = Number(tryGit('rev-list', '--count', `${ref}..origin/main`) ?? 0);
  if (behind > 0) add('fail', 'R-FLOW-5', `nhánh đứng sau origin/main ${behind} commit — git merge origin/main (không rebase nhánh đã đẩy, không push --force)`);
  else add('ok', 'R-FLOW-5', 'đã gộp origin/main');
  try {
    git('merge-tree', '--write-tree', '--name-only', 'origin/main', ref);
    add('ok', 'R-FLOW-5', 'gộp thử với origin/main không xung đột');
  } catch (e) {
    const files = String(e.stdout ?? '').split('\n').slice(1).map((l) => l.trim());
    const conflicted = files.slice(0, Math.max(0, files.indexOf(''))).filter(Boolean);
    add('fail', 'R-FLOW-5', `gộp thử với origin/main xung đột${conflicted.length ? `: ${conflicted.slice(0, 8).join(', ')}` : ''}`);
  }

  const mark = { ok: '✔', fail: '✘', warn: '▲' };
  for (const r of out) console.log(`  ${mark[r.lvl]} ${r.rule}  ${r.msg}`);
  const fails = out.filter((r) => r.lvl === 'fail').length;
  const warns = out.filter((r) => r.lvl === 'warn').length;
  console.log(`\n${fails ? `✘ ${fails} chỗ chưa đạt` : '✔ đạt'}${warns ? ` · ▲ ${warns} cảnh báo` : ''}. Chạy thêm: node tests/conformance/selfcheck.mjs --strict`);
  return fails ? 1 : 0;
}

if (cmd === 'list') process.exit(list());
else if (cmd === 'kiem') process.exit(kiem());
else { console.error(`Lệnh không có: ${cmd}. Dùng: list | kiem`); process.exit(2); }
