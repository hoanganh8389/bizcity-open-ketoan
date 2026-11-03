// [2026-11-03 07:32 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — test mô hình ước tính tiết kiệm và script đo bằng chứng: số trong README phải tái tạo được; chạy: node --test packages/cli/test/saving-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, estimate, sensitivity } from '../../../scripts/uoc-tinh-tiet-kiem.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '../../../scripts');
const tmp = mkdtempSync(path.join(tmpdir(), 'bizcity-saving-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const run = (file, args = []) => new Promise((resolve) => execFile(process.execPath, [path.join(SCRIPTS, file), ...args], (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

test('mặc định tái tạo đúng bảng giả định của dự án: 455 / 170 / 285 giờ, 7,1 tuần, 88.932.000 đồng', () => {
  const e = estimate();
  assert.deepEqual([e.hours.build, e.hours.core, e.hours.avoided], [455, 170, 285]);
  assert.deepEqual(e.groups.map((g) => g.avoided), [25, 105, 45, 60, -5, 55]);
  assert.equal(Math.round(e.hours.weeks * 10) / 10, 7.1);
  assert.equal(e.value.hoursVnd, 85500000);
  assert.deepEqual([e.tokens.build.total, e.tokens.core.total], [42e6, 13.2e6]);
  assert.deepEqual([Math.round(e.tokens.vndBuild), Math.round(e.tokens.vndCore)], [5005000, 1573000]);
  assert.equal(Math.round(e.value.tokensVnd), 3432000);
  assert.equal(Math.round(e.value.totalVnd), 88932000);
  assert.equal(Math.round(e.value.tokenShare * 1000) / 10, 3.9, 'token chỉ chiếm khoảng 3,9% giá trị: phần lớn là công phát triển');
});

test('nhóm "Kết nối" mất thêm 5 giờ khi dùng Core: mô hình không giấu', () => {
  const k = estimate().groups.find((g) => g.name.startsWith('Kết nối'));
  assert.equal(k.avoided, -5);
});

test('--realize co giãn cả giờ lẫn token; chi phí developer thấp hơn thì giá trị thấp hơn', () => {
  const half = estimate({ realize: 0.5 });
  assert.equal(half.hours.realized, 142.5);
  assert.equal(Math.round(half.value.totalVnd), 44466000);
  assert.ok(estimate({ rate: 150000 }).value.totalVnd < estimate().value.totalVnd);
  assert.equal(estimate({ realize: 0 }).value.totalVnd, 0);
});

test('lưới nhạy 3 × 3: ô (100%, 300.000) là mặc định, ô (30%, 150.000) nhỏ nhất', () => {
  const g = sensitivity();
  assert.equal(g.length, 3);
  assert.equal(Math.round(g[0].byRate[1].totalVnd), 88932000);
  const all = g.flatMap((r) => r.byRate.map((c) => c.totalVnd));
  assert.equal(Math.min(...all), g[2].byRate[0].totalVnd);
});

test('DEFAULTS không bị estimate() sửa (thuần)', () => {
  const before = JSON.stringify(DEFAULTS);
  estimate({ realize: 0.3, rate: 1 });
  assert.equal(JSON.stringify(DEFAULTS), before);
});

test('CLI mặc định in đúng các con số của README và ghi rõ "không phải số đo"', async () => {
  const r = await run('uoc-tinh-tiet-kiem.mjs');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /không phải số đo/);
  assert.match(r.stdout, /Tổng\s+455\s+170\s+285/);
  assert.match(r.stdout, /285,0 giờ thực tế = 7,1 tuần công/);
  assert.match(r.stdout, /88\.932\.000 đồng/);
});

test('CLI --input thay bằng số đo thật; --realize ngoài 0..1 hoặc số âm → mã 2', async () => {
  const f = path.join(tmp, 'do-that.json');
  writeFileSync(f, JSON.stringify({ groups: [{ name: 'Ghi nhận', build: 100, core: 40 }], tokens: { build: { in: 10e6, out: 2e6 }, core: { in: 4e6, out: 1e6 } } }));
  const r = await run('uoc-tinh-tiet-kiem.mjs', ['--input', f, '--json']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.hours.avoided, 60);
  assert.equal(j.value.hoursVnd, 18000000);
  assert.equal((await run('uoc-tinh-tiet-kiem.mjs', ['--realize', '1.5'])).code, 2);
  assert.equal((await run('uoc-tinh-tiet-kiem.mjs', ['--rate', '-1'])).code, 2);
  assert.equal((await run('uoc-tinh-tiet-kiem.mjs', ['--input', path.join(tmp, 'khong-co.json')])).code, 2);
});

test('script đo bằng chứng: số đếm lấy từ mã nguồn, token là khoảng ước lượng (min < max)', async () => {
  const r = await run('do-bang-chung-core.mjs', ['--json']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.A.docTypes, 10);
  assert.ok(j.A.f22Cases >= 93 && j.A.skills >= 7 && j.A.postingRuleFiles >= 6);
  assert.ok(j.A.sourceLines > 10000 && j.A.apiRoutes > 100 && j.A.testCasesApi > 500);
  assert.equal(j.B.minimalReadingSet.rows.length, 4);
  for (const row of [...j.B.minimalReadingSet.rows, j.B.minimalReadingSet.total]) assert.ok(row.tokensMin < row.tokensMax && row.chars > 0);
  assert.equal(j.B.legalSourcesInRepo, undefined, 'không so với toàn văn thông tư: repo không chứa');
});

// ── README không được nói quá số đo ──
const README = readFileSync(path.resolve(HERE, '../../../README.md'), 'utf8');
const num = (s) => Number(s.replace(/\./g, ''));

test('README: các số "đã đo" không lớn hơn số script đo được (mục tối thiểu ghi dấu +)', async () => {
  const j = JSON.parse((await run('do-bang-chung-core.mjs', ['--json'])).stdout);
  const pick = (re) => { const m = re.exec(README); assert.ok(m, `README thiếu dòng khớp ${re}`); return m.slice(1).map(num); };
  const [docTypes, rules] = pick(/Loại chứng từ nhận vào · tệp luật định khoản \| (\d+) · (\d+) \|/);
  const [routes, migrations] = pick(/Route API · migration CSDL \| ([\d.]+)\+ · (\d+) \|/);
  const [cases] = pick(/Ca test API \(\d+ tệp\) \| ([\d.]+)\+ \|/);
  const [intake, diag, f22] = pick(/Mã phát hiện ở cửa nạp · kiểm tự chẩn đoán · ca lỗi F22[^|]*\| (\d+) · (\d+) · (\d+) \|/);
  const [skills] = pick(/Skill cho AI \| (\d+) \|/);
  assert.ok(docTypes <= j.A.docTypes && rules <= j.A.postingRuleFiles && routes <= j.A.apiRoutes && migrations <= j.A.migrations);
  assert.ok(cases <= j.A.testCasesApi && intake <= j.A.intakeFindingCodes && diag <= j.A.diagnosticChecks && f22 <= j.A.f22Cases && skills <= j.A.skills);
});

test('README: bảng giả định và tổng tiền khớp mô hình; ghi rõ GIẢ ĐỊNH, chưa đo dự án thật, token ~3,9%', () => {
  const e = estimate();
  assert.ok(README.includes(`| **Tổng** | **${e.hours.build}** | **${e.hours.core}** | **${e.hours.avoided}**`), 'bảng giờ trong README phải khớp mô hình');
  assert.match(README, /\*\*85,5 triệu đồng\*\*/);
  assert.match(README, /Tổng \*\*~88,9 triệu đồng\*\*/);
  assert.match(README, /token chỉ ~3,9%/);
  assert.match(README, /GIẢ ĐỊNH/);
  assert.match(README, /chưa đo dự án thật nào/);
  assert.match(README, /từ \*\*13,9\*\* đến \*\*145,9 triệu đồng\*\*/);
  const lo = Math.min(...sensitivity().flatMap((r) => r.byRate.map((c) => c.totalVnd))) / 1e6;
  const hi = Math.max(...sensitivity().flatMap((r) => r.byRate.map((c) => c.totalVnd))) / 1e6;
  assert.deepEqual([Math.round(lo * 10) / 10, Math.round(hi * 10) / 10], [13.9, 145.9]);
});

test('README: không đưa mật khẩu của hệ thống quản trị vào repo công khai', () => {
  const section = README.slice(README.indexOf('## Dùng open-ketoan tiết kiệm được gì?'), README.indexOf('## Công nghệ và cách triển khai'));
  assert.match(section, /quantri\.bizcity\.vn/);
  assert.match(section, /Tài khoản không công bố trong repo/);
  assert.doesNotMatch(section, /Admin@123|password|mật khẩu:/i);
});
