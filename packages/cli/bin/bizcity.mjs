#!/usr/bin/env node
// @bizcity-layer P cli
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W3 (PHASES 4.1): lệnh `bizcity` — module new / check, doctor, ledger verify, migrate; điều phối công cụ sẵn có, không thêm logic thứ hai
/**
 * bizcity — một cửa lệnh cho developer (PHASES 4.1, G3-02). Chạy ở gốc repo: `npx bizcity <lệnh>`.
 *
 *   module new <key> [--label "Tên"] [--code HD] [--owner @tai-khoan]
 *                         sinh modules/<key>/ từ templates/starter-module (module mẫu hợp lệ `mau-module`: thay mã, schema, nhãn, mã màn, người phụ trách)
 *   module check <key>    selfcheck --module (luật manifest, lớp, bảo mật) + typecheck (api, web) + test hợp đồng module trên CSDL test
 *   module accounting-check <key> [--static] [--json]
 *                         kiểm kế toán của module: không đụng bảng sổ, không viết số tài khoản, docType / docKey đúng hợp đồng, chứng từ mẫu examples/*.json qua event check
 *   module list           module SDK trong modules/
 *   migrate               migration Core rồi migration từng module SDK (CSDL theo DATABASE_URL)
 *   ledger verify         lane diagnostics (SQL đọc sổ) ở mức strict — sổ có toàn vẹn không
 *   evidence verify --dir <DATA_DIR/bang-chung/<đơn vị>> [--json]
 *                         kiểm bản niêm phong bằng chứng không cần CSDL: băm tệp, băm từng dòng, manifest nối ngày (ADR-0030)
 *   doctor                Node, gói đã dựng, CSDL kết nối được, migration còn chờ, module SDK đã chạy migration chưa
 *   event check <tệp.json|-> [--submit] [--json]
 *                         kiểm một chứng từ trước khi vào sổ: khuôn + tổng tiền (offline) → tiền kiểm L1–L4 → định khoản thử L5 (dryRun) → nộp
 *                         máy chủ: BIZCITY_SERVER (vd http://localhost:8088) + BIZCITY_API_KEY (khoá HT02), hoặc --server / --key
 *   flow check --sku <mã hàng> --period YYYY-MM [--to YYYY-MM] [--branch CN01] [--json]
 *                         một mặt hàng có liền mạch mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ không (đọc báo cáo của đơn vị)
 *   explain <MÃ> [--role dev|chief_accountant|auditor|tax_inspector] [--json]
 *                         giải thích một mã (IN-*, ACC-*, PART-*, mã lỗi API, F22-*, DG-*): vì sao, ai sửa, sửa ở đâu, kiểm lại
 *   library list [--json]       thư viện dùng chung (libraries/*, bizcity_library@1): loại, phiên bản, số mục, đã đối chiếu
 *   library search <từ khoá> [--lib <id>] [--at YYYY-MM-DD] [--json]
 *                         tìm mục theo mã / tên / bí danh (không dấu) — lấy mã đúng thay vì đoán
 *   library check <id> <giá trị | {json} | @tệp.json> [--at YYYY-MM-DD] [--source <nguồn>] [--json]
 *                         kiểm ô nhập bằng bộ kiểm của Core: máy chủ (BIZCITY_SERVER + BIZCITY_API_KEY) → bản dựng platform → SKIP; PASS 0 · FAIL 1 · SKIP 2 · WARN 3
 *   library new <id> --kind <loại> --title "Tên" --source "Nguồn" [--source-kind law|internal|reference] [--owner "Người duyệt"]
 *                         khung libraries/<id>/ (library.json đã đóng dấu + README.md), qua SC-LIB-1 ngay
 *   library diff <id> [--base origin/main] [--json]
 *                         thay đổi so với main, bản cần lên (major / minor / patch) so với bản đã khai, lỗi khuôn SC-LIB-1
 *   skills install [--to <thư mục dự án>]
 *                         chép skill kế toán (skills/*) vào <dự án>/.claude/skills + .agents/skills, ghi .bizcity/ketoan.json
 *
 * Mỗi lệnh gọi lại công cụ sẵn có (selfcheck.mjs, vitest, lệnh `module` của API, db:migrate) — CLI không giữ luật riêng.
 * [2026-11-03 02:30 PM Johnny Chu - Chu Hoàng Anh] G3-01 — event check / explain / skills install: nạp đúng hàm và danh mục của repo (packages/cli/lib)
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const MODULES = path.join(ROOT, 'modules');
const TEMPLATE = path.join(ROOT, 'templates', 'starter-module');
const KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;
const isWin = process.platform === 'win32';

const out = (s = '') => process.stdout.write(`${s}\n`);
const fail = (s) => { process.stderr.write(`✘ ${s}\n`); process.exit(1); };
const run = (label, cmd, args, opts = {}) => {
  out(`\n── ${label}\n$ ${[cmd, ...args].join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, stdio: 'inherit', shell: isWin, env: { ...process.env, ...opts.env } });
  return r.status === 0;
};
const flag = (args, name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const sdkModules = () => (existsSync(MODULES) ? readdirSync(MODULES).filter((d) => existsSync(path.join(MODULES, d, 'bizcity.module.json'))) : []);
const coreKeys = () => {
  const keys = new Set();
  for (const base of ['apps/api/src/phan-he', 'apps/api/src/addins']) {
    const dir = path.join(ROOT, base);
    if (existsSync(dir)) for (const d of readdirSync(dir)) if (existsSync(path.join(dir, d, 'bizcity.module.json'))) keys.add(d);
  }
  return keys;
};

function moduleNew(args) {
  const key = args[0];
  if (!key || !KEY_RE.test(key)) fail(`mã module "${key ?? ''}" sai khuôn ^[a-z][a-z0-9-]{1,31}$ (vd hop-dong)`);
  if (coreKeys().has(key)) fail(`"${key}" trùng mã phân hệ / add-in của Core`);
  const dest = path.join(MODULES, key);
  if (existsSync(dest)) fail(`modules/${key} đã có`);
  const label = flag(args, '--label', key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
  const code = flag(args, '--code', key.split('-').map((w) => w[0]).join('').toUpperCase().slice(0, 4));
  const owner = flag(args, '--owner', '@hoanganh8389');
  // Template là module mẫu hợp lệ (bộ kiểm kiểm được chính nó): thay các chuỗi mẫu, thứ tự dài trước.
  const vars = [['mod_mau_module', `mod_${key.replace(/-/g, '_')}`], ['mau-module', key], ['Module mẫu', label], ['MM01', `${code}01`], ['@hoanganh8389', owner]];
  const subst = (s) => vars.reduce((acc, [k, v]) => acc.split(k).join(v), s);
  cpSync(TEMPLATE, dest, { recursive: true });
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      writeFileSync(p, subst(readFileSync(p, 'utf8')));
      if (subst(e) !== e) renameSync(p, path.join(d, subst(e)));
    }
  };
  walk(dest);
  out(`✔ modules/${key} (${label}) từ templates/starter-module`);
  out('Tiếp theo:');
  out(`  npm install                      # liên kết gói @bizcity-module/${key}`);
  out(`  npx bizcity module check ${key}   # phải ĐẠT trước khi viết thêm`);
  out(`  đọc modules/${key}/AGENTS.md`);
}

function moduleCheck(args) {
  const key = args[0];
  if (!key || !existsSync(path.join(MODULES, key, 'bizcity.module.json'))) fail(`không có modules/${key ?? '<key>'}/bizcity.module.json`);
  const dir = path.join('modules', key);
  const steps = [
    ['Luật module (selfcheck --module)', 'node', ['tests/conformance/selfcheck.mjs', '--module', dir, '--strict']],
    // [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — module check gồm kiểm kế toán tĩnh (selfcheck --module không thấy module tự ghi sổ / điền tài khoản / tính giá vốn)
    ['Kế toán của module (accounting-check --static)', 'node', ['packages/cli/bin/bizcity.mjs', 'module', 'accounting-check', key, '--static']],
    ['Kiểu — phần máy chủ', 'npx', ['tsc', '-p', path.join(dir, 'tsconfig.json'), '--noEmit']],
    ['Kiểu — phần giao diện', 'npx', ['tsc', '-p', path.join(dir, 'web', 'tsconfig.json'), '--noEmit']],
    ['Test hợp đồng module (CSDL test)', 'npx', ['vitest', 'run', 'test/sdk-modules.contract.test.ts'], { cwd: path.join(ROOT, 'apps', 'api'), env: { BIZCITY_CHECK_MODULE: key } }],
  ];
  const results = steps.map(([label, cmd, a, o]) => [label, existsSync(path.join(ROOT, dir, 'web', 'tsconfig.json')) || !label.includes('giao diện') ? run(label, cmd, a, o) : true]);
  out('\n── Kết quả');
  for (const [label, ok] of results) out(`  ${ok ? '✔' : '✘'} ${label}`);
  const ok = results.every(([, r]) => r);
  out(`\nmodule check ${key}: ${ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
  process.exit(ok ? 0 : 1);
}

// [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — module accounting-check: quét tĩnh + chứng từ mẫu qua event check
async function moduleAccounting(args) {
  const key = args.find((a, i) => !a.startsWith('--') && !['--server', '--key'].includes(args[i - 1]));
  if (!key || !KEY_RE.test(key)) usage('cần mã module: npx bizcity module accounting-check <key> [--static] [--json]');
  const { checkModuleAccounting, formatModuleAccounting } = await import('../lib/module-accounting.mjs');
  let r;
  try {
    r = await checkModuleAccounting(key, { ...serverOf(args), staticOnly: args.includes('--static') });
  } catch (err) {
    process.stderr.write(`✘ ${err.message}\n`);
    process.exitCode = 2;
    return;
  }
  out(args.includes('--json') ? JSON.stringify(r, null, 2) : formatModuleAccounting(r));
  process.exitCode = r.verdict === 'PASS' ? 0 : r.verdict === 'FAIL' ? 1 : args.includes('--static') ? 0 : 2;
}

function migrate() {
  if (!run('Migration Core', 'npm', ['run', 'db:migrate'])) process.exit(1);
  for (const key of sdkModules()) if (!run(`Migration module ${key}`, 'npm', ['run', 'module:dev', '-w', '@ketoan/api', '--', 'migrate', key])) process.exit(1);
  out('\n✔ migrate xong');
}

function ledgerVerify() {
  process.exit(run('Toàn vẹn sổ (lane diagnostics)', 'node', ['tests/conformance/selfcheck.mjs', '--lane', 'diagnostics', '--strict']) ? 0 : 1);
}

async function doctor() {
  const rows = [];
  const add = (ok, what, hint = '') => rows.push([ok, what, hint]);
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20, `Node ${process.versions.node}`, 'cần Node ≥ 20');
  add(existsSync(path.join(ROOT, 'node_modules')), 'đã npm install', 'chạy npm install');
  for (const p of ['packages/contracts', 'packages/platform', 'packages/kernel', 'packages/module-sdk']) add(existsSync(path.join(ROOT, p, 'dist')), `${p} đã dựng`, 'chạy npm run build');
  const url = process.env.DATABASE_URL ?? 'postgres://ketoan:ketoan@localhost:5434/ketoan';
  try {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    add(true, `CSDL kết nối được (${new URL(url).pathname.slice(1)})`);
    const applied = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const pending = readdirSync(path.join(ROOT, 'db', 'migrations')).filter((f) => f.endsWith('.sql') && !applied.has(f));
    add(!pending.length, pending.length ? `${pending.length} migration Core chưa chạy (${pending.slice(0, 3).join(', ')}…)` : 'migration Core đủ', 'npx bizcity migrate');
    for (const key of sdkModules()) {
      const files = existsSync(path.join(MODULES, key, 'migrations')) ? readdirSync(path.join(MODULES, key, 'migrations')).filter((f) => f.endsWith('.sql')) : [];
      const miss = files.filter((f) => !applied.has(`${key}/${f}`));
      add(!miss.length, `module ${key}: ${miss.length ? `${miss.length} migration chưa chạy` : 'migration đủ'}`, 'npx bizcity migrate');
    }
    await c.end();
  } catch (err) {
    add(false, `CSDL không kết nối được: ${String(err?.message ?? err)}`, 'kiểm DATABASE_URL, docker compose up -d db');
  }
  out('bizcity doctor');
  for (const [ok, what, hint] of rows) out(`  ${ok ? '✔' : '✘'} ${what}${ok || !hint ? '' : ` — ${hint}`}`);
  process.exit(rows.every(([ok]) => ok) ? 0 : 1);
}

// [2026-11-03 02:30 PM Johnny Chu - Chu Hoàng Anh] G3-01 — ba lệnh cho skill kế toán; mã thoát 0 PASS · 1 FAIL · 2 SKIP / lỗi dùng lệnh
const usage = (s) => { process.stderr.write(`✘ ${s}\n`); process.exit(2); };
const serverOf = (args) => ({ server: flag(args, '--server', process.env.BIZCITY_SERVER), key: flag(args, '--key', process.env.BIZCITY_API_KEY) });

async function eventCheck(args) {
  const file = args.find((a, i) => !a.startsWith('--') && !['--server', '--key'].includes(args[i - 1]));
  if (!file) usage('cần tệp chứng từ: npx bizcity event check <tệp.json> (hoặc - để đọc stdin)');
  let doc;
  try {
    doc = JSON.parse(file === '-' ? readFileSync(0, 'utf8') : readFileSync(path.resolve(file), 'utf8'));
  } catch (err) {
    process.stderr.write(`✘ không đọc được ${file}: ${err.message}\n`);
    process.exit(2);
  }
  if (doc && typeof doc === 'object' && 'document' in doc && !('docType' in doc)) doc = doc.document;
  const { checkEvent, formatCheck } = await import('../lib/event-check.mjs');
  const r = await checkEvent(doc, { ...serverOf(args), submit: args.includes('--submit') });
  out(args.includes('--json') ? JSON.stringify(r, null, 2) : formatCheck(r));
  // process.exitCode thay process.exit: trên Windows, thoát cứng khi kết nối fetch còn mở làm Node sập (0xC0000409)
  process.exitCode = r.verdict === 'PASS' ? 0 : r.verdict === 'FAIL' ? 1 : 2;
}

async function explain(args) {
  const code = args.find((a, i) => !a.startsWith('--') && !['--role', '--server', '--key'].includes(args[i - 1]));
  if (!code) usage('cần mã: npx bizcity explain IN-SUM-001');
  const { explainCode, formatExplain, viewsOf } = await import('../lib/explain.mjs');
  const r = await explainCode(code, serverOf(args));
  out(args.includes('--json') ? JSON.stringify({ ...r, views: viewsOf(r) }, null, 2) : formatExplain(r, { role: flag(args, '--role') }));
  process.exitCode = r.known ? 0 : 1;
}

// [2026-11-03 04:15 PM Johnny Chu - Chu Hoàng Anh] G3-01 — flow check: luồng một mặt hàng trong một kỳ (chuẩn C1, C2, C5)
async function flowCheck(args) {
  const sku = flag(args, '--sku');
  const period = flag(args, '--period');
  if (!sku || !/^\d{4}-\d{2}$/.test(period ?? '')) usage('cần --sku <mã hàng> --period YYYY-MM, vd: npx bizcity flow check --sku SUA400 --period 2026-11');
  const { checkFlow, formatFlow, checkLifecycle, formatLifecycle, periodsBetween } = await import('../lib/flow-check.mjs');
  // [2026-11-03 05:45 PM Johnny Chu - Chu Hoàng Anh] G3-01 — --to: kiểm vòng đời nhiều kỳ, tồn chuyển kỳ liền mạch
  const to = flag(args, '--to');
  if (to) {
    if (!periodsBetween(period, to)) usage('--to YYYY-MM phải không trước --period, tối đa 24 kỳ');
    const r = await checkLifecycle({ sku, from: period, to, branch: flag(args, '--branch'), ...serverOf(args) });
    out(args.includes('--json') ? JSON.stringify(r, null, 2) : formatLifecycle(r));
    process.exitCode = r.verdict === 'PASS' ? 0 : r.verdict === 'FAIL' ? 1 : 2;
    return;
  }
  const r = await checkFlow({ sku, period, branch: flag(args, '--branch'), ...serverOf(args) });
  out(args.includes('--json') ? JSON.stringify(r, null, 2) : formatFlow(r));
  process.exitCode = r.verdict === 'PASS' ? 0 : r.verdict === 'FAIL' ? 1 : 2;
}

async function skillsInstall(args) {
  const { installSkills } = await import('../lib/skills-install.mjs');
  try {
    const r = installSkills(flag(args, '--to', ROOT));
    out(`Đã cài ${r.names.length} skill: ${r.names.join(', ')}`);
    for (const w of r.written) out(`  + ${w}`);
  } catch (err) {
    fail(err.message);
  }
}

// [2026-11-06 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b: evidence verify (ngoại tuyến, cho kiểm toán viên)
async function evidenceVerify(args) {
  const dir = flag(args, '--dir');
  if (!dir) usage('evidence verify --dir <DATA_DIR/bang-chung/<đơn vị>>');
  if (!existsSync(dir)) fail(`Không có thư mục ${dir}`);
  const { verifyDir, formatReport } = await import('../lib/evidence-seal.mjs');
  const r = verifyDir(path.resolve(dir));
  out(args.includes('--json') ? JSON.stringify(r, null, 2) : formatReport(r));
  process.exitCode = r.findings.length ? 1 : 0;
}

// [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50: library list / search / check / new / diff (packages/cli/lib/library.mjs)
async function library(sub, args) {
  const L = await import('../lib/library.mjs');
  const json = args.includes('--json');
  const VALUE_FLAGS = ['--lib', '--at', '--source', '--server', '--key', '--kind', '--title', '--source-kind', '--owner', '--description', '--base'];
  const pos = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
  const at = flag(args, '--at');
  if (at && !/^\d{4}-\d{2}-\d{2}$/.test(at)) usage('--at phải là YYYY-MM-DD');
  if (sub === 'list') {
    const r = await L.loadLibraries();
    out(json ? JSON.stringify({ libraries: r.libs.map(L.envelopeOf), errors: r.errors }, null, 2) : L.formatList(r));
    process.exitCode = r.errors.length ? 1 : 0;
  } else if (sub === 'search') {
    if (!pos[0]) usage('cần từ khoá: npx bizcity library search "nghỉ lễ" [--lib vn.ngay-nghi-le]');
    const r = L.searchItems((await L.loadLibraries()).libs, pos[0], { lib: flag(args, '--lib') });
    out(json ? JSON.stringify(r, null, 2) : L.formatSearch(r, pos[0], at));
    process.exitCode = r.total ? 0 : 1;
  } else if (sub === 'check') {
    if (!pos[0] || pos[1] === undefined) usage('cần thư viện và giá trị: npx bizcity library check vn.ngay-nghi-le 2026-02-16');
    let payload;
    try { payload = L.parseInput(pos[1]); } catch (err) { usage(`không đọc được giá trị: ${err.message}`); }
    const r = await L.checkInput(pos[0], payload, { ...serverOf(args), at, source: flag(args, '--source', 'cli') });
    out(json ? JSON.stringify(r, null, 2) : L.formatCheck(r, pos[0]));
    process.exitCode = L.EXIT[r.verdict];
  } else if (sub === 'new') {
    try {
      const r = await L.newLibrary({ id: pos[0], kind: flag(args, '--kind'), title: flag(args, '--title'), description: flag(args, '--description'),
        source: flag(args, '--source'), sourceKind: flag(args, '--source-kind'), owner: flag(args, '--owner') });
      out(`Đã tạo thư viện ${r.library.id} (${r.library.kind}, ${r.library.version}):`);
      for (const f of r.files) out(`  + ${f}`);
      out('Tiếp: thêm mục (nên viết build.mjs + sources/ và khai generatedBy), sửa README, rồi npx bizcity library diff ' + r.library.id);
    } catch (err) {
      usage(err.message);
    }
  } else if (sub === 'diff') {
    if (!pos[0]) usage('cần thư viện: npx bizcity library diff vn.tham-so-phap-ly [--base origin/main]');
    let r;
    try { r = await L.diffLibrary(pos[0], { base: flag(args, '--base', 'origin/main') }); } catch (err) { fail(err.message); }
    out(json ? JSON.stringify(r, null, 2) : L.formatDiff(r));
    process.exitCode = r.verdict === 'PASS' ? 0 : 1;
  } else usage('library list | search | check | new | diff — xem npx bizcity');
}

const HELP = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith(' *   ')).map((l) => l.slice(3)).join('\n');
const [cmd, sub, ...rest] = process.argv.slice(2);
if (cmd === 'module' && sub === 'new') moduleNew(rest);
else if (cmd === 'module' && sub === 'check') moduleCheck(rest);
else if (cmd === 'module' && sub === 'accounting-check') await moduleAccounting(rest);
else if (cmd === 'module' && sub === 'list') out(sdkModules().join('\n') || '(chưa có module SDK nào trong modules/)');
else if (cmd === 'migrate') migrate();
else if (cmd === 'ledger' && sub === 'verify') ledgerVerify();
else if (cmd === 'evidence' && sub === 'verify') await evidenceVerify(rest);
else if (cmd === 'doctor') await doctor();
else if (cmd === 'event' && sub === 'check') await eventCheck(rest);
else if (cmd === 'flow' && sub === 'check') await flowCheck(rest);
else if (cmd === 'explain') await explain([sub, ...rest].filter((x) => x !== undefined));
else if (cmd === 'library') await library(sub, rest);
else if (cmd === 'skills' && sub === 'install') await skillsInstall(rest);
else { out(`bizcity — lệnh cho developer Bizcity Core\n\n${HELP}`); process.exit(cmd ? 1 : 0); }
