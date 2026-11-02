#!/usr/bin/env node
// [2026-11-02 06:49 PM Johnny Chu - Chu Hoàng Anh] SO-DANG-KY — giữ chỗ số migration / ADR giữa các nhánh song song; đổi số tự động trước khi merge (RULE-REVIEW W-13)
/**
 * Số migration (db/migrations/NNNN_ten.sql) và số ADR (docs/adr/ADR-NNNN-ten.md) cấp tuần tự, nhiều nhánh làm song song → trùng số
 * (gặp ≥ 5 lần ngày 2026-11-02: 0049, 0050, 0051–0053, ADR-0014, ADR-0015). Git không báo vì tên tệp khác nhau; SC-DATA-1 chỉ bắt
 * khi cả hai đã vào cùng một cây.
 *
 *   node scripts/so-tiep-theo.mjs migration        # lúc bắt đầu: số kế tiếp chưa nhánh nào dùng + số đang bị nhánh khác giữ
 *   node scripts/so-tiep-theo.mjs adr
 *   node scripts/so-tiep-theo.mjs kiem             # trước khi merge: số mới của nhánh có trùng main / nhánh khác, có nối tiếp main không
 *   node scripts/so-tiep-theo.mjs kiem --doi-so    # như trên, và đổi số cho liền sau main: git mv + sửa dẫn chiếu
 *   … --khong-fetch                                # không git fetch (máy không mạng)
 *
 * Đổi số chỉ sửa những dòng NHÁNH NÀY thêm so với origin/main (git diff) — dẫn chiếu tới migration / ADR cùng số của main giữ nguyên.
 * Migration đổi tên theo cả tên (0051_ho_so_ke_toan → 0054_ho_so_ke_toan) lẫn số trần trên dòng có tên bảng / tên tệp của nó; ADR đổi
 * `ADR-NNNN`. Dòng dấu ký cũ (R-SIG) không đổi — thêm một dấu mới ghi lần đổi số. Xem lại `git diff` trước khi commit.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args[0];
if (!['migration', 'adr', 'kiem'].includes(cmd)) {
  console.error('Dùng: node scripts/so-tiep-theo.mjs migration | adr | kiem [--doi-so] [--khong-fetch]');
  process.exit(2);
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
if (!args.includes('--khong-fetch')) {
  try { git('fetch', '--quiet', '--prune', 'origin'); } catch { console.warn('git fetch không chạy được — dùng bản origin/* đã có trên máy'); }
}

const KINDS = {
  migration: { dir: 'db/migrations', re: /^(\d{4})_([a-z0-9_]+)\.sql$/, label: 'migration', file: (n, s) => `${n}_${s}.sql` },
  adr: { dir: 'docs/adr', re: /^ADR-(\d{4})-([a-z0-9-]+)\.md$/, label: 'ADR', file: (n, s) => `ADR-${n}-${s}.md` },
};

/** Tệp của một loại ở một ref (null = cây làm việc). */
function filesAt(kind, ref) {
  const k = KINDS[kind];
  const names = ref
    ? (() => { try { return git('ls-tree', '--name-only', `${ref}:${k.dir}`).split('\n'); } catch { return []; } })()
    : (fs.existsSync(path.join(ROOT, k.dir)) ? fs.readdirSync(path.join(ROOT, k.dir)) : []);
  return names.map((f) => f.match(k.re)).filter(Boolean).map((m) => ({ num: m[1], slug: m[2] }));
}

const remotes = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin').split('\n')
  .filter((r) => r && r !== 'origin/HEAD' && r !== 'origin' && r !== 'origin/main');
const current = (() => { try { return git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'); } catch { return null; } })();

/** Số → [{ slug, where }] trên main, các nhánh khác (chưa vào main), cây làm việc. */
function usage(kind) {
  const main = filesAt(kind, 'origin/main');
  const mainKeys = new Set(main.map((x) => `${x.num}_${x.slug}`));
  const others = [];
  for (const r of remotes) {
    if (r === current) continue;
    for (const x of filesAt(kind, r)) if (!mainKeys.has(`${x.num}_${x.slug}`)) others.push({ ...x, where: r.replace(/^origin\//, '') });
  }
  const local = filesAt(kind, null).filter((x) => !mainKeys.has(`${x.num}_${x.slug}`));
  const max = (xs) => xs.reduce((m, x) => Math.max(m, Number(x.num)), 0);
  const mainMax = max(main);
  // Chỉ số lớn hơn main mới là "đang giữ chỗ"; số ≤ main ở nhánh cũ là bản trước khi đổi số / nhánh bỏ dở — main đã có số đó.
  const holding = others.filter((x) => Number(x.num) > mainMax);
  return { main, others: holding, local, mainMax, allMax: Math.max(mainMax, max(holding), max(local)) };
}
const pad = (n) => String(n).padStart(4, '0');

if (cmd !== 'kiem') {
  const u = usage(cmd);
  const k = KINDS[cmd];
  console.log(`${k.label}: main tới ${pad(u.mainMax)}.`);
  if (u.others.length) {
    console.log('Đang bị nhánh khác (chưa merge) giữ:');
    for (const x of u.others.sort((a, b) => a.num.localeCompare(b.num))) console.log(`  ${x.num}  ${k.file(x.num, x.slug).padEnd(46)} ${x.where}`);
  }
  if (u.local.length) console.log(`Nhánh này đã có: ${u.local.map((x) => k.file(x.num, x.slug)).join(', ')}`);
  console.log(`\nSố kế tiếp chưa ai dùng: ${pad(u.allMax + 1)}`);
  console.log('Tạo tệp với số này và đẩy nhánh lên sớm để nhánh khác thấy. Trước khi merge: node scripts/so-tiep-theo.mjs kiem');
  process.exit(0);
}

// ------------------------------------------------------------------ kiem ----
const fix = args.includes('--doi-so');
let problems = 0;
const plan = []; // { kind, from: {num, slug}, to }
for (const kind of ['migration', 'adr']) {
  const k = KINDS[kind];
  const u = usage(kind);
  const mine = u.local.sort((a, b) => a.num.localeCompare(b.num));
  if (!mine.length) continue;
  const mainNums = new Set(u.main.map((x) => x.num));
  const otherBy = new Map(u.others.map((x) => [x.num, x]));
  let next = u.mainMax + 1;
  for (const x of mine) {
    const want = pad(next++);
    const notes = [];
    if (mainNums.has(x.num)) notes.push(`main đã có ${x.num}`);
    if (otherBy.has(x.num)) notes.push(`nhánh ${otherBy.get(x.num).where} cũng dùng ${x.num}`);
    if (x.num !== want) notes.push(`phải liền sau main → ${want}`);
    if (!notes.length) { console.log(`✔ ${k.file(x.num, x.slug)}`); continue; }
    problems++;
    console.log(`✘ ${k.file(x.num, x.slug)}: ${notes.join('; ')}`);
    if (x.num !== want) plan.push({ kind, from: x, to: want });
  }
}
if (!problems) { console.log('Số migration / ADR của nhánh nối tiếp main, không trùng.'); process.exit(0); }
if (!fix) { console.log('\nĐổi số tự động: node scripts/so-tiep-theo.mjs kiem --doi-so (gộp origin/main vào nhánh trước).'); process.exit(1); }

// ---------------------------------------------------------------- đổi số ----
// Hai bước qua tên tạm: tránh đè khi số mới của tệp này là số cũ của tệp kia.
for (const p of plan) {
  const k = KINDS[p.kind];
  git('mv', path.posix.join(k.dir, k.file(p.from.num, p.from.slug)), path.posix.join(k.dir, `tmp-doi-so-${p.kind}-${p.from.num}-${p.from.slug}`));
}
for (const p of plan) {
  const k = KINDS[p.kind];
  git('mv', path.posix.join(k.dir, `tmp-doi-so-${p.kind}-${p.from.num}-${p.from.slug}`), path.posix.join(k.dir, k.file(p.to, p.from.slug)));
}

/** Dòng nhánh thêm so với origin/main, theo tệp (sau khi đã git mv: đọc diff của chỉ mục + cây làm việc). */
const changed = git('diff', '--name-only', 'origin/main').split('\n').filter((f) => f && fs.existsSync(path.join(ROOT, f)) && !/\.(png|jpe?g|gif|webp|pdf|dump)$/i.test(f) && f !== 'package-lock.json');
const isStamp = (l) => /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2} [AP]M [^\]]+\]/.test(l);
// Tệp của main cùng số cũ (nếu có): dòng nhắc tới tên của nó thì số trần trên dòng đó nhập nhằng — không đổi, báo để sửa tay.
const words = (slug) => slug.split(/[_-]/).filter((w) => w.length > 3);
for (const p of plan) p.mainWords = words(filesAt(p.kind, 'origin/main').find((x) => x.num === p.from.num)?.slug ?? '');
const ambiguous = [];
let edited = 0;
for (const f of changed) {
  const diff = git('diff', '-U0', 'origin/main', '--', f);
  const added = new Set(diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)));
  if (!added.size) continue;
  const abs = path.join(ROOT, f);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  let n = 0;
  const out = lines.map((line) => {
    if (!added.has(line) || isStamp(line)) return line;
    let l = line;
    for (const p of plan) {
      const k = KINDS[p.kind];
      // Tên đầy đủ luôn đổi (không nhập nhằng).
      l = p.kind === 'migration'
        ? l.replaceAll(`${p.from.num}_${p.from.slug}`, `${p.to}_${p.from.slug}`)
        : l.replaceAll(`ADR-${p.from.num}-${p.from.slug}`, `ADR-${p.to}-${p.from.slug}`).replaceAll(`[${p.from.num}](ADR-${p.to}-`, `[${p.to}](ADR-${p.to}-`);
      const bare = p.kind === 'migration' ? new RegExp(`\\b${p.from.num}\\b`, 'g') : new RegExp(`ADR-${p.from.num}\\b`, 'g');
      if (!bare.test(l)) continue;
      // Số trần: migration chỉ đổi trên dòng nhắc tới tên của nó; dòng còn nhắc tệp cùng số của main → để người sửa.
      const mine = p.kind === 'adr' || words(p.from.slug).some((w) => l.includes(w));
      const theirs = p.mainWords.some((w) => l.includes(w));
      if (mine && theirs) { ambiguous.push(`${f}: ${l.slice(0, 140)}  (${k.label} ${p.from.num})`); continue; }
      if (mine) l = l.replace(bare, p.kind === 'migration' ? p.to : `ADR-${p.to}`);
    }
    if (l !== line) n++;
    return l;
  });
  if (n) { fs.writeFileSync(abs, out.join('\n')); edited += n; console.log(`  sửa ${String(n).padStart(3)} dòng  ${f}`); }
}
console.log(`\nĐã đổi số ${plan.length} tệp, sửa ${edited} dòng dẫn chiếu. Xem lại git diff, thêm dấu R-SIG ghi lần đổi số, chạy selfcheck rồi commit.`);
for (const p of plan) console.log(`  ${KINDS[p.kind].file(p.from.num, p.from.slug)} → ${KINDS[p.kind].file(p.to, p.from.slug)}`);
if (ambiguous.length) {
  console.log('\nDòng nhắc cả tệp của nhánh lẫn tệp cùng số của main — chưa đổi số trần, sửa tay:');
  for (const a of ambiguous) console.log(`  ${a}`);
}
