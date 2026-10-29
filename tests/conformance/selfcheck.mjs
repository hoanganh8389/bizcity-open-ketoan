#!/usr/bin/env node
/**
 * Bộ kiểm chuẩn Bizcity Core — MỘT lệnh, HAI lane chạy song song, MỘT bảng điểm.
 *
 *   node tests/conformance/selfcheck.mjs                      kiểm cả repo (selfcheck; diagnostics nếu có CSDL)
 *   node tests/conformance/selfcheck.mjs --module modules/x   kiểm một module trước khi cài (CONF-MAN + CONF-STATIC)
 *   node tests/conformance/selfcheck.mjs --self-test          bộ kiểm tự kiểm trên fixtures (kiểm người kiểm)
 *
 * Không cần npm install. Chi tiết: tests/conformance/README.md.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyBaseline, buildBaseline } from './lib/baseline.mjs';
import { createContext } from './lib/context.mjs';
import { ruleCoverage } from './lib/coverage.mjs';
import { openDb } from './lib/db.mjs';
import { discover, SUITE_DIR } from './lib/discover.mjs';
import { validate } from './lib/jsonschema.mjs';
import { runPool } from './lib/pool.mjs';
import { renderConsole, renderEvidence, renderHtml, renderMarkdown } from './lib/render.mjs';
import { createRepo, moduleOf } from './lib/repo.mjs';
import { buildScoreboard } from './lib/scoreboard.mjs';

const ROOT = path.resolve(SUITE_DIR, '../..');
const BASELINE = path.join(SUITE_DIR, 'baseline.json');
const LOCK = path.join(SUITE_DIR, 'locks/migrations.lock.json');
const HELP = `
Dùng: node tests/conformance/selfcheck.mjs [tuỳ chọn]

  --lane <all|selfcheck|diagnostics>   lane chạy (mặc định all; diagnostics tự bỏ qua nếu chưa chỉ CSDL)
  --only <mã,tiền tố>                  chỉ chạy check khớp, vd --only SC-KERNEL,DG-LEDGER-1
  --module <thư mục>                   kiểm một module (manifest + tĩnh), báo cáo vào <thư mục>/.bizcity/
  --psql "<lệnh psql>"                 CSDL cho diagnostics, vd "docker exec -i ketoan-db-1 psql -U ketoan -d ketoan"
  --jobs <n>                           số worker (mặc định = số lõi, tối đa 8)
  --out <thư mục>                      nơi ghi kết quả (mặc định tests/conformance/output)
  --strict                             nợ đã hết mà chưa dọn khỏi baseline cũng tính KHÔNG ĐẠT (CI dùng)
  --update-baseline                    ghi nợ hiện tại vào baseline.json (chỉ bớt; thêm phải có người duyệt)
  --update-lock                        khoá băm migration hiện có (khi phát hành)
  --self-test                          chạy bộ kiểm trên fixtures và so với kết quả mong đợi
  --list                               liệt kê check
  --verbose                            in mọi phát hiện
  --json                               in bảng điểm JSON ra stdout
`;

function parseArgs(argv) {
  const a = { lane: 'all', jobs: Math.min(8, os.availableParallelism?.() ?? os.cpus().length), out: path.join(SUITE_DIR, 'output') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--lane') a.lane = v();
    else if (k === '--only') a.only = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--module') a.module = v();
    else if (k === '--psql') a.psql = v();
    else if (k === '--jobs') a.jobs = Number(v()) || 1;
    else if (k === '--out') a.out = path.resolve(v());
    else if (k === '--strict') a.strict = true;
    else if (k === '--update-baseline') a.updateBaseline = true;
    else if (k === '--update-lock') a.updateLock = true;
    else if (k === '--self-test') a.selfTest = true;
    else if (k === '--list') a.list = true;
    else if (k === '--verbose') a.verbose = true;
    else if (k === '--json') a.json = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else { console.error(`Không hiểu tuỳ chọn: ${k}`); process.exit(2); }
  }
  return a;
}

/** Chạy một tập check trên một gốc. Selfcheck → worker pool; diagnostics → luồng chính (I/O CSDL). Hai lane chạy đồng thời. */
async function runChecks(checks, { root, core, mode, args, db }) {
  const self = checks.filter((c) => c.lane === 'selfcheck');
  const diag = checks.filter((c) => c.lane === 'diagnostics');

  const selfP = runPool(self.map((c) => ({ file: c.file, id: c.id, root, core, mode, args: { strict: !!args.strict } })), { size: args.jobs })
    .then((rs) => rs.map((r, i) => ({ check: self[i], ...r })));

  const diagP = (async () => {
    if (!diag.length) return [];
    const ctx = createContext({ root, core, mode, args, db });
    return Promise.all(diag.map(async (check) => {
      // Không có CSDL: bỏ qua check cần CSDL; check 'planned' vẫn chạy để bảng điểm tính độ sẵn sàng.
      if (!db.available && check.enforce !== 'planned') return { check, ok: true, skip: db.reason, ms: 0 };
      const t = Date.now();
      try { return { check, ok: true, result: await check.run(ctx), ms: Date.now() - t }; }
      catch (e) { return { check, ok: false, error: String(e?.message ?? e), ms: Date.now() - t }; }
    }));
  })();

  const [a, b] = await Promise.all([selfP, diagP]);
  return [...a, ...b];
}

/** Gắn trạng thái cho từng check: pass / debt / warn / fail / error / planned / skip. */
function judge(raw, baseline, { useBaseline }) {
  return raw.map(({ check, ok, result, error, skip, ms }) => {
    const meta = { ...check }; delete meta.run;
    const r = { ...meta, file: path.relative(ROOT, check.file).split(path.sep).join('/'), ms, findings: [], examined: 0, notes: [] };
    if (skip) return { ...r, status: 'skip', skip };
    if (!ok) return { ...r, status: 'error', error };
    Object.assign(r, { examined: result.examined ?? 0, findings: result.findings ?? [], metrics: result.metrics, notes: result.notes ?? [], readiness: result.readiness, unitBy: result.unitBy, affected: result.affected });
    for (const f of r.findings) f.module = moduleOf(f.file);
    if (check.enforce === 'planned') return { ...r, status: 'planned' };
    const { fixed } = r.lane === 'selfcheck' && useBaseline ? applyBaseline(r.id, r.findings, baseline) : { fixed: [] };
    if (r.lane !== 'selfcheck' || !useBaseline) for (const f of r.findings) f.known = false;
    r.fixed = fixed;
    if (r.lane === 'diagnostics' && !r.examined && !r.findings.length) r.notes.push('CSDL không có dòng nào để xét — đạt rỗng, chưa chứng minh gì');
    if (!r.findings.length) return { ...r, status: 'pass' };
    if (check.enforce === 'info') return { ...r, status: 'warn' };
    if (r.findings.some((f) => !f.known)) return { ...r, status: 'fail' };
    return { ...r, status: 'debt' };
  });
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

/**
 * Ghi output: latest/ (đè), runs/<runId>/ (giữ 20 lần), history.jsonl (xu hướng).
 * Lần chạy một phần (--only / --lane) chỉ ghi runs/<runId>-mot-phan/, không đụng latest/ và history để xu hướng còn so được.
 */
function persist(outDir, sb, results, partial) {
  const files = {
    'scoreboard.json': sb,
    'selfcheck.json': { contract: 'bizcity_check_result@1', runId: sb.runId, lane: 'selfcheck', results: results.filter((r) => r.lane === 'selfcheck') },
    'diagnostics.json': { contract: 'bizcity_check_result@1', runId: sb.runId, lane: 'diagnostics', results: results.filter((r) => r.lane === 'diagnostics') },
    'SCOREBOARD.md': renderMarkdown(sb),
    'scoreboard.html': renderHtml(sb),
    'evidence.txt': renderEvidence(sb),
  };
  for (const [name, data] of Object.entries(files)) {
    if (!partial) write(path.join(outDir, 'latest', name), data);
    write(path.join(outDir, 'runs', partial ? `${sb.runId}-mot-phan` : sb.runId, name), data);
  }
  if (partial) return path.join(outDir, 'runs', `${sb.runId}-mot-phan`);
  fs.appendFileSync(path.join(outDir, 'history.jsonl'), JSON.stringify({ runId: sb.runId, at: sb.at, mode: sb.mode, verdict: sb.verdict, scores: Object.fromEntries(Object.entries(sb.scores).map(([k, v]) => [k, v.score])), counts: sb.counts }) + '\n');
  const runs = fs.readdirSync(path.join(outDir, 'runs')).sort();
  for (const old of runs.slice(0, Math.max(0, runs.length - 20))) fs.rmSync(path.join(outDir, 'runs', old), { recursive: true, force: true });
  return path.join(outDir, 'latest');
}

/**
 * Báo cáo cổng cài đặt (CONFORMANCE §3): <module>/.bizcity/check-report.json gắn sourceHash.
 * Core (Phase 4) từ chối cài khi băm lệch — sửa một dòng code sau khi kiểm là phải kiểm lại.
 */
function writeModuleReport(root, sb, results) {
  const repo = createRepo(root, { exclude: [] });
  const h = createHash('sha256');
  for (const f of repo.files()) h.update(`${f}\0`).update(repo.hash(f)).update('\0');
  const manifest = repo.exists('bizcity.module.json') ? repo.json('bizcity.module.json') : {};
  write(path.join(root, '.bizcity', 'check-report.json'), {
    contract: 'bizcity_check_report@1',
    module: manifest.id ?? null,
    version: manifest.version ?? null,
    sourceHash: `sha256:${h.digest('hex')}`,
    core: { standard: sb.standard },
    result: sb.verdict,
    checks: results.map((r) => ({ id: r.id, conf: r.conf ?? [], result: r.status === 'planned' ? 'not-run' : ['pass', 'warn'].includes(r.status) ? 'pass' : 'fail', ...(r.findings.length ? { findings: r.findings.length } : {}) })),
    note: 'CONF-RUN, CONF-UPG (chạy trên Core thật) chưa có ở bộ kiểm tĩnh — Phase 4.',
    ranAt: sb.at,
  });
}

async function selfTest(all, args) {
  const fx = path.join(SUITE_DIR, 'fixtures');
  const expect = readJson(path.join(fx, 'expect.json'));
  const schema = readJson(path.join(SUITE_DIR, 'schema/check.schema.json'));
  let bad = 0;
  const say = (ok, msg) => { if (!ok) bad++; console.log(`  ${ok ? '✔' : '✘'} ${msg}`); };

  console.log('── Khuôn check (bizcity_check@1)');
  for (const c of all) {
    const { run, file, ...meta } = c;
    const errs = validate(schema, meta);
    say(!errs.length && typeof run === 'function', `${c.id}${errs.length ? ': ' + errs.map((e) => `${e.path} ${e.message}`).join('; ') : ''}`);
  }
  const ids = all.map((c) => c.id);
  say(new Set(ids).size === ids.length, 'mã check không trùng');

  console.log('── Bộ kiểm JSON Schema');
  for (const t of expect.jsonschema) {
    const n = validate(t.schema, t.data).length;
    say((n === 0) === t.valid, `${t.name}: ${n ? `${n} lỗi` : 'hợp lệ'} (mong ${t.valid ? 'hợp lệ' : 'lỗi'})`);
  }

  for (const target of expect.targets) {
    console.log(`── ${target.mode === 'module' ? 'Module' : 'Repo'} mẫu: ${target.root}`);
    const checks = all.filter((c) => c.lane === 'selfcheck' && target.checks[c.id]);
    const raw = await runChecks(checks, { root: path.join(fx, target.root), core: ROOT, mode: target.mode, args: { ...args, jobs: args.jobs }, db: { available: false } });
    for (const { check, ok, result, error } of raw) {
      const want = target.checks[check.id];
      const n = ok ? result.findings.length : -1;
      const keys = ok ? result.findings.map((f) => f.key ?? f.message) : [];
      const okCount = ok && (want.findings == null || n === want.findings) && (want.min == null || n >= want.min);
      const okKeys = !want.keys || want.keys.every((k) => keys.some((x) => String(x).includes(k)));
      say(okCount && okKeys, `${check.id}: ${ok ? `${n} phát hiện` : `lỗi ${error.split('\n')[0]}`} (mong ${want.findings ?? `≥${want.min}`}${want.keys ? `, có ${want.keys.join(', ')}` : ''})`);
      if (!(okCount && okKeys) && ok) for (const f of result.findings) console.log(`      ${f.file ?? ''}:${f.line ?? ''} ${f.message}`);
    }
  }
  console.log(`\nKẾT QUẢ TỰ KIỂM: ${bad ? `KHÔNG ĐẠT (${bad} sai)` : 'ĐẠT'}`);
  return bad ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return 0; }
  const started = Date.now();
  const all = await discover();

  if (args.list) {
    for (const c of all) console.log(`${c.id.padEnd(12)} ${c.lane.padEnd(11)} ${c.gate.padEnd(11)} ${c.enforce.padEnd(8)} ${c.title}`);
    return 0;
  }
  if (args.selfTest) return selfTest(all, args);

  if (args.updateLock) {
    const repo = createRepo(ROOT);
    const files = Object.fromEntries(repo.list('db/migrations').filter((f) => f.endsWith('.sql')).map((f) => [f, repo.hash(`db/migrations/${f}`)]));
    write(LOCK, { contract: 'bizcity_migration_lock@1', note: 'Băm (LF) các migration đã phát hành. Tệp trong đây không được sửa — R-DB-1. Cập nhật: --update-lock khi phát hành.', updatedAt: new Date().toISOString().slice(0, 10), files });
    console.log(`Đã khoá ${Object.keys(files).length} migration → ${path.relative(ROOT, LOCK)}`);
    return 0;
  }

  const mode = args.module ? 'module' : 'repo';
  const root = args.module ? path.resolve(args.module) : ROOT;
  let checks = all.filter((c) => (c.targets ?? ['repo']).includes(mode) || c.lane === 'diagnostics');
  if (mode === 'module') checks = checks.filter((c) => c.lane === 'selfcheck');
  if (args.lane !== 'all') checks = checks.filter((c) => c.lane === args.lane);
  if (args.only) checks = checks.filter((c) => args.only.some((o) => c.id === o || c.id.startsWith(o)));
  if (!checks.length) { console.error('Không có check nào khớp.'); return 2; }

  const db = checks.some((c) => c.lane === 'diagnostics')
    ? await openDb({ psql: args.psql ?? process.env.BIZCITY_PSQL, url: process.env.DATABASE_URL, root: ROOT })
    : { available: false, reason: 'không chạy lane diagnostics' };

  const baseline = readJson(BASELINE);
  const raw = await runChecks(checks, { root, core: ROOT, mode, args, db });
  await db.close?.();
  const results = judge(raw, baseline, { useBaseline: mode === 'repo' });

  if (args.updateBaseline) {
    if (args.only || args.lane !== 'all') { console.error('--update-baseline cần chạy đủ mọi check (bỏ --only / --lane).'); return 2; }
    const next = buildBaseline(results, baseline);
    const before = Object.values(baseline?.checks ?? {}).reduce((a, c) => a + c.debts.length, 0);
    const after = Object.values(next.checks).reduce((a, c) => a + c.debts.length, 0);
    write(BASELINE, next);
    console.log(`baseline: ${before} → ${after} mục nợ (${path.relative(ROOT, BASELINE)}). Thêm nợ mới phải có người duyệt nhóm Lõi.`);
    return 0;
  }

  const at = new Date();
  const runId = at.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const outDir = mode === 'module' ? path.join(root, '.bizcity') : args.out;
  const previous = readJson(path.join(outDir, 'latest', 'scoreboard.json'));
  const coverage = mode === 'repo' && !args.only ? ruleCoverage(createRepo(ROOT), all) : null;
  const sb = buildScoreboard({
    results, coverage, standard: createRepo(ROOT).json('docs/standard/bizcity-standard.json'), previous,
    run: { runId, at: at.toISOString(), mode, target: path.relative(ROOT, root).split(path.sep).join('/') || '.', strict: !!args.strict, db: db.available ? db.label : null, durationMs: Date.now() - started },
  });

  const partial = !!args.only || args.lane !== 'all';
  const where = persist(outDir, sb, results, partial);
  if (mode === 'module' && !partial) writeModuleReport(root, sb, results);
  if (args.json) process.stdout.write(JSON.stringify(sb, null, 2) + '\n');
  else {
    console.log(renderConsole(sb, results, { verbose: args.verbose }));
    console.log(`Bảng điểm${partial ? ' (chạy một phần, không ghi latest/)' : ''}: ${path.relative(process.cwd(), path.join(where, 'SCOREBOARD.md'))} · ${path.relative(process.cwd(), path.join(where, 'scoreboard.html'))}`);
  }
  return sb.verdict === 'pass' ? 0 : 1;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 2; });
