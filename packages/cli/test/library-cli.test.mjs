// [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50: test lệnh `bizcity library` — thư viện thật của repo, máy chủ giả, gốc tạm (new / diff trên git tạm), skill use-bizcity-library
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpOf, classifyChanges } from '../lib/library.mjs';
import { lintLibrary, serialize, stamp } from '../../../scripts/thu-vien/thu-vien.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const CLI = path.join(REPO, 'packages/cli/bin/bizcity.mjs');
const tmp = mkdtempSync(path.join(tmpdir(), 'bizcity-lib-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, BIZCITY_SERVER: '', BIZCITY_API_KEY: '', ...env } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

/** Gốc repo tạm: chỉ có phần dùng chung của thư viện (không có bản dựng platform). */
function fakeRoot(name) {
  const root = path.join(tmp, name);
  mkdirSync(path.join(root, 'scripts/thu-vien'), { recursive: true });
  mkdirSync(path.join(root, 'libraries'), { recursive: true });
  cpSync(path.join(REPO, 'scripts/thu-vien/thu-vien.mjs'), path.join(root, 'scripts/thu-vien/thu-vien.mjs'));
  return root;
}

async function fakeServer(reply) {
  const seen = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-api-key'], body: body ? JSON.parse(body) : null });
      const [status, json] = reply(req.url);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}

const result = (findings, extra = {}) => ({ ok: !findings.some((f) => f.level === 'block'), library: { id: 'vn.tham-so-phap-ly', version: '1.0.0', hash: 'sha256:x' }, at: '2026-11-08', findings, ...extra });
const finding = (code, level) => ({ code, level, path: 'input', message: `${code} giả`, suggestions: [{ value: 'LUONG_TOI_THIEU_VUNG_I', label: 'Lương tối thiểu vùng I', why: 'gần đúng', confidence: 'vua' }] });

// ── list / search trên thư viện thật của repo (ngoại tuyến) ──
test('library list (repo thật): liệt kê mọi thư viện, --json có phong bì, không có lỗi nạp', async () => {
  const r = await cli(['library', 'list', '--json'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.errors, []);
  const ids = j.libraries.map((l) => l.id);
  for (const id of ['vn.tham-so-phap-ly', 'vn.ngay-nghi-le', 'vn.can-cu-phap-ly']) assert.ok(ids.includes(id), id);
  assert.ok(j.libraries.every((l) => l.version && l.items >= 0 && l.verified <= l.items));
});

test('library search: không dấu, mã khớp đúng xếp trước, giá trị tại ngày; không có thì exit 1 và dặn không đoán', async () => {
  const r = await cli(['library', 'search', 'luong toi thieu', '--lib', 'vn.tham-so-phap-ly', '--at', '2026-11-08'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /LUONG_TOI_THIEU_VUNG_I/);
  assert.match(r.stdout, /giá trị tại 2026-11-08/);
  const j = JSON.parse((await cli(['library', 'search', 'TT99', '--json'], { BIZCITY_ROOT: REPO })).stdout);
  assert.ok(j.total >= 1 && j.hits[0].exact, 'TT99 (mã hoặc bí danh) khớp đúng ở đầu');
  const none = await cli(['library', 'search', 'khong-co-ma-nay-xyz'], { BIZCITY_ROOT: REPO });
  assert.equal(none.code, 1);
  assert.match(none.stdout, /đừng đoán/);
  assert.equal((await cli(['library', 'search', 'x', '--at', '08/11/2026'], { BIZCITY_ROOT: REPO })).code, 2);
});

// ── check qua máy chủ ──
test('library check qua máy chủ: gọi core.library.validate đúng đường, khoá, source, at; PASS 0 · WARN 3 · FAIL 1', async () => {
  let next = [200, { ok: true, data: { results: [result([])] } }];
  const srv = await fakeServer(() => next);
  try {
    const env = { BIZCITY_ROOT: REPO, BIZCITY_SERVER: srv.url, BIZCITY_API_KEY: 'k-test' };
    let r = await cli(['library', 'check', 'vn.tham-so-phap-ly', 'LUONG_TOI_THIEU_VUNG_I', '--at', '2026-11-08'], env);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /KẾT LUẬN: PASS/);
    assert.deepEqual(srv.seen[0], { url: '/api/v1/libraries/vn.tham-so-phap-ly/validate', key: 'k-test', body: { input: 'LUONG_TOI_THIEU_VUNG_I', at: '2026-11-08', source: 'cli' } });

    next = [200, { ok: true, data: { results: [result([finding('LIB-DEPRECATED-001', 'warn')])] } }];
    r = await cli(['library', 'check', 'vn.tham-so-phap-ly', '["A","B"]', '--source', 'modules/luong'], env);
    assert.equal(r.code, 3);
    assert.deepEqual(srv.seen[1].body, { inputs: ['A', 'B'], source: 'modules/luong' });
    assert.match(r.stdout, /gợi ý: "LUONG_TOI_THIEU_VUNG_I"/);

    next = [200, { ok: true, data: { results: [result([finding('LIB-UNKNOWN-001', 'block')])] } }];
    r = await cli(['library', 'check', 'vn.tham-so-phap-ly', 'KHONG-CO', '--json'], env);
    assert.equal(r.code, 1);
    assert.equal(JSON.parse(r.stdout).verdict, 'FAIL');

    next = [404, { ok: false, error: { code: 'NOT_FOUND', message: 'không có thư viện vn.khong-co' } }];
    r = await cli(['library', 'check', 'vn.khong-co', 'X'], env);
    assert.equal(r.code, 1, 'thư viện không có / đơn vị tắt là FAIL có lý do, không phải SKIP');
    assert.match(r.stdout, /NOT_FOUND/);

    next = [401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'khoá sai' } }];
    r = await cli(['library', 'check', 'vn.tham-so-phap-ly', 'X'], env);
    assert.equal(r.code, 2, 'khoá sai = chưa kiểm được = SKIP');
  } finally { await srv.close(); }
});

test('library check không máy chủ, không bản dựng platform → SKIP (exit 2) kèm lệnh dựng; không bao giờ PASS', async () => {
  const root = fakeRoot('no-engine');
  const r = await cli(['library', 'check', 'vn.ngay-nghi-le', '2026-02-16'], { BIZCITY_ROOT: root });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /npm run build -w @bizcity\/platform/);
  assert.match(r.stdout, /SKIP không phải PASS/);
});

const ENGINE_BUILT = existsSync(path.join(REPO, 'packages/platform/dist/core/libraries/index.js'));
test('library check bằng bản dựng engine của platform (repo thật): ngày lễ PASS, mã lạ FAIL', ENGINE_BUILT ? {} : { skip: 'chưa dựng platform (npm run build -w @bizcity/platform) — chạy trong CI' }, async () => {
  let r = await cli(['library', 'check', 'vn.ngay-nghi-le', '2026-02-16', '--json'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).via, 'engine');
  r = await cli(['library', 'check', 'vn.ngay-nghi-le', 'KHONG-CO'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /LIB-/);
  r = await cli(['library', 'check', 'vn.khong-co', 'X'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 1);
});

// ── new ──
test('library new: khung qua lint ngay (đóng dấu, README, nguồn); thiếu nguồn / sai loại / đã có → exit 2, không ghi', async () => {
  const root = fakeRoot('new');
  const args = ['library', 'new', 'nghiep-vu.loai-hop-dong', '--kind', 'code-list', '--title', 'Loại hợp đồng', '--source', 'Quy chế nội bộ'];
  const r = await cli(args, { BIZCITY_ROOT: root });
  assert.equal(r.code, 0, r.stderr);
  const dir = path.join(root, 'libraries/nghiep-vu.loai-hop-dong');
  const lib = JSON.parse(readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.deepEqual(lintLibrary(lib, { dir: 'nghiep-vu.loai-hop-dong', hasReadme: existsSync(path.join(dir, 'README.md')) }), []);
  assert.equal(lib.version, '1.0.0');
  assert.equal(lib.sources[0].kind, 'internal');
  assert.match(readFileSync(path.join(dir, 'README.md'), 'utf8'), /## Cập nhật/);

  assert.equal((await cli(args, { BIZCITY_ROOT: root })).code, 2, 'đã có thì không ghi đè');
  const noSource = await cli(['library', 'new', 'nghiep-vu.khac', '--kind', 'code-list', '--title', 'Khác'], { BIZCITY_ROOT: root });
  assert.equal(noSource.code, 2);
  assert.match(noSource.stderr, /D-LIB-9/);
  assert.equal((await cli(['library', 'new', 'nghiep-vu.khac', '--kind', 'bang-tu-che', '--title', 'Khác', '--source', 'x'], { BIZCITY_ROOT: root })).code, 2);
  assert.equal((await cli(['library', 'new', 'TuDo', '--kind', 'code-list', '--title', 'x', '--source', 'x'], { BIZCITY_ROOT: root })).code, 2);
  assert.ok(!existsSync(path.join(root, 'libraries/nghiep-vu.khac')));
});

// ── diff ──
const base = () => stamp({
  contract: 'bizcity_library@1', id: 'nghiep-vu.muc-thu', kind: 'param', title: 'Mức thu', description: 'Mức thu mẫu', version: '1.0.0', owner: 'kế toán trưởng',
  sources: [{ title: 'Nội bộ', kind: 'internal' }], itemSchema: { type: 'object' }, selector: { value: 'code', label: '{name}', search: ['code'] },
  items: [{ code: 'MUC_A', name: 'Mức A', status: 'active', verified: false, effective: [{ from: '2026-01-01', to: null, value: 100 }] }],
}, null, { date: '2026-11-01', notes: 'đầu' });

test('classifyChanges: thêm mục / thêm khoảng = minor; đổi giá trị đã phát hành, bỏ bí danh, mất mục = major; đổi chữ = patch', () => {
  const a = base();
  const withItem = { ...a, items: [...a.items, { code: 'MUC_B', name: 'Mức B', status: 'active', verified: false, since: '1.1.0' }] };
  assert.equal(classifyChanges(a, withItem).needed, 'minor');
  const newRange = { ...a, items: [{ ...a.items[0], effective: [{ from: '2026-01-01', to: '2026-12-31', value: 100 }, { from: '2027-01-01', to: null, value: 120 }] }] };
  assert.equal(classifyChanges(a, newRange).needed, 'minor', 'đóng khoảng mở + thêm khoảng mới là minor');
  const changed = { ...a, items: [{ ...a.items[0], effective: [{ from: '2026-01-01', to: null, value: 110 }] }] };
  assert.equal(classifyChanges(a, changed).needed, 'major');
  assert.equal(classifyChanges(a, { ...a, items: [] }).needed, 'major');
  const aliased = { ...a, items: [{ ...a.items[0], aliases: ['A'] }] };
  assert.equal(classifyChanges(aliased, a).needed, 'major');
  assert.equal(classifyChanges(a, { ...a, items: [{ ...a.items[0], name: 'Mức A (sửa chữ)' }] }).needed, 'patch');
  assert.equal(classifyChanges(a, a).needed, 'none');
  assert.equal(bumpOf('1.2.3', '2.0.0'), 'major');
  assert.equal(bumpOf('1.2.3', '1.2.4'), 'patch');
  assert.equal(bumpOf('1.2.3', '1.1.0'), 'lùi');
});

test('library diff trên git tạm: thêm mục chưa lên bản → FAIL; stamp minor → PASS; đổi giá trị đã phát hành mà chỉ lên minor → FAIL', async () => {
  const root = fakeRoot('diff');
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  const dir = path.join(root, 'libraries/nghiep-vu.muc-thu');
  mkdirSync(dir, { recursive: true });
  const v1 = base();
  writeFileSync(path.join(dir, 'library.json'), serialize(v1));
  writeFileSync(path.join(dir, 'README.md'), '# Mức thu\n');
  git('add', '.'); git('commit', '-qm', 'v1');
  const env = { BIZCITY_ROOT: root };

  // thêm mục nhưng giữ nguyên version + băm cũ → lỗi khuôn và thiếu bản
  const added = { ...v1, items: [...v1.items, { code: 'MUC_B', name: 'Mức B', status: 'active', verified: false, since: '1.1.0' }] };
  writeFileSync(path.join(dir, 'library.json'), serialize(added));
  let r = await cli(['library', 'diff', 'nghiep-vu.muc-thu', '--base', 'HEAD', '--json'], env);
  assert.equal(r.code, 1);
  let j = JSON.parse(r.stdout);
  assert.equal(j.needed, 'minor');
  assert.ok(j.short && j.problems.some((p) => p.key === 'hash'));

  writeFileSync(path.join(dir, 'library.json'), serialize(stamp(added, v1, { bump: 'minor', date: '2026-11-08', notes: 'thêm MUC_B' })));
  r = await cli(['library', 'diff', 'nghiep-vu.muc-thu', '--base', 'HEAD'], env);
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /MUC_B: mục mới/);
  assert.match(r.stdout, /KẾT LUẬN: PASS/);

  const changed = { ...v1, items: [{ ...v1.items[0], effective: [{ from: '2026-01-01', to: null, value: 999 }] }] };
  writeFileSync(path.join(dir, 'library.json'), serialize(stamp(changed, v1, { bump: 'minor', date: '2026-11-08', notes: 'đổi giá' })));
  r = await cli(['library', 'diff', 'nghiep-vu.muc-thu', '--base', 'HEAD', '--json'], env);
  assert.equal(r.code, 1);
  j = JSON.parse(r.stdout);
  assert.equal(j.needed, 'major');
  assert.equal(j.declared, 'minor');

  assert.equal((await cli(['library', 'diff', 'nghiep-vu.khong-co', '--base', 'HEAD'], env)).code, 1);
});

// ── skill ──
test('skill use-bizcity-library: frontmatter đúng, chỉ gọi lệnh library có thật, nói rõ SKIP không phải PASS', () => {
  const text = readFileSync(path.join(REPO, 'skills/use-bizcity-library/SKILL.md'), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
  assert.match(fm, /^name: use-bizcity-library$/m);
  assert.match(fm, /^description: .{80,}/m);
  const help = readFileSync(CLI, 'utf8');
  for (const m of text.matchAll(/npx bizcity library ([a-z]+)/g)) assert.ok(help.includes(`sub === '${m[1]}'`), `lệnh library ${m[1]} không có trong CLI`);
  assert.match(text, /SKIP không phải PASS/);
  assert.match(text, /selfcheck\.mjs --only SC-LIB/);
  assert.match(readFileSync(path.join(REPO, 'skills/README.md'), 'utf8'), /use-bizcity-library/);
});
