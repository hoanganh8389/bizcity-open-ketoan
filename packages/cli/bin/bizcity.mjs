#!/usr/bin/env node
// @bizcity-layer P cli
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W3 (PHASES 4.1): lệnh `bizcity` — module new / check, doctor, ledger verify, migrate; điều phối công cụ sẵn có, không thêm logic thứ hai
/**
 * bizcity — một cửa lệnh cho developer (PHASES 4.1, G3-02). Chạy ở gốc repo: `npx bizcity <lệnh>`.
 *
 *   module new <key> [--label "Tên"] [--code HD] [--owner @tai-khoan]
 *                         sinh modules/<key>/ từ templates/starter-module (module mẫu hợp lệ `mau-module`: thay mã, schema, nhãn, mã màn, người phụ trách)
 *   module check <key>    selfcheck --module (luật manifest, lớp, bảo mật) + typecheck (api, web) + test hợp đồng module trên CSDL test
 *   module list           module SDK trong modules/
 *   migrate               migration Core rồi migration từng module SDK (CSDL theo DATABASE_URL)
 *   ledger verify         lane diagnostics (SQL đọc sổ) ở mức strict — sổ có toàn vẹn không
 *   doctor                Node, gói đã dựng, CSDL kết nối được, migration còn chờ, module SDK đã chạy migration chưa
 *
 * Mỗi lệnh gọi lại công cụ sẵn có (selfcheck.mjs, vitest, lệnh `module` của API, db:migrate) — CLI không giữ luật riêng.
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

const HELP = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith(' *   ')).map((l) => l.slice(3)).join('\n');
const [cmd, sub, ...rest] = process.argv.slice(2);
if (cmd === 'module' && sub === 'new') moduleNew(rest);
else if (cmd === 'module' && sub === 'check') moduleCheck(rest);
else if (cmd === 'module' && sub === 'list') out(sdkModules().join('\n') || '(chưa có module SDK nào trong modules/)');
else if (cmd === 'migrate') migrate();
else if (cmd === 'ledger' && sub === 'verify') ledgerVerify();
else if (cmd === 'doctor') await doctor();
else { out(`bizcity — lệnh cho developer Bizcity Core\n\n${HELP}`); process.exit(cmd ? 1 : 0); }
