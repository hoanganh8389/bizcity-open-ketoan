// [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — test `bizcity module accounting-check`: module sạch, module sai kế toán, chú thích, cổng sản xuất, ke-toan, chứng từ mẫu; chạy: node --test packages/cli/test/module-accounting.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../lib/module-accounting.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../bin/bizcity.mjs');
const FIX = path.join(HERE, 'fixtures/root');

// Gốc repo giả: bản dựng giả của contracts (có APPROVABLE_DOC_TYPES) + thư mục modules/ do từng test viết.
const root = mkdtempSync(path.join(tmpdir(), 'bizcity-mod-'));
cpSync(FIX, root, { recursive: true });
process.on('exit', () => rmSync(root, { recursive: true, force: true }));

function writeModule(key, files, manifest = {}) {
  const dir = path.join(root, 'modules', key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'api', 'actions'), { recursive: true });
  writeFileSync(path.join(dir, 'bizcity.module.json'), JSON.stringify({ contract: 'bizcity_module@1', key, id: `bizcity.${key}`, ledger: { submits: [{ docType: 'sale' }] }, ...manifest }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, BIZCITY_ROOT: root, BIZCITY_SERVER: '', BIZCITY_API_KEY: '', ...env } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const statusOf = (r) => Object.fromEntries(JSON.parse(r.stdout).rows.map((x) => [x.id, x.status]));

const GOOD = `import { defineAction, sql, z } from '@bizcity/module-sdk';
export default defineAction({
  id: 'hoa-hong.record.create', input: z.object({ title: z.string(), cost: z.number() }),
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    await sql\`INSERT INTO mod_hoa_hong.records (tenant_id, title) VALUES (\${ctx.tenant.id}, \${input.title})\`.execute(tx);
    const rows = await sql\`SELECT sum(debit) FROM bizcity_read.ledger_lines WHERE tenant_id = \${ctx.tenant.id}\`.execute(tx);
    return { id: '1', rows };
  }),
});
`;
const SUBMIT = (extra = '') => `export default defineAction({ id: 'x', handler: async (ctx) => {
  await ctx.ledger.submit({ docType: 'sale', docKey: 'hoa-hong:CN01:HD1', version: 1, lines: [], ${extra} });
} });
`;

test('stripComments: bỏ chú thích dòng, khối và SQL, giữ chuỗi và số dòng', () => {
  const src = "const a = 'x // không phải chú thích';\n// ledger_lines\n/* debitAccount: '6421'\n */\nconst b = 2;";
  const out = stripComments(src);
  assert.match(out, /không phải chú thích/);
  assert.doesNotMatch(out, /ledger_lines|6421/);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.doesNotMatch(stripComments('SELECT 1 -- ledger_lines\n', { sql: true }), /ledger_lines/);
});

test('module sạch (đọc qua bizcity_read, ghi bảng riêng, trường cost của zod) → PASS, mã 0', async () => {
  writeModule('hoa-hong', { 'api/actions/record-create.ts': GOOD });
  const r = await cli(['module', 'accounting-check', 'hoa-hong', '--json']);
  assert.equal(r.code, 0, r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'PASS');
  assert.deepEqual(statusOf(r), { 'AC-1': 'PASS', 'AC-2': 'PASS', 'AC-3': 'N/A', 'AC-4': 'N/A', 'AC-5': 'N/A', 'AC-6': 'N/A' });
});

test('chú thích nhắc ledger_lines, số tài khoản, giá vốn → không báo nhầm', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': `// KHÔNG ghi ledger_lines, không debitAccount: '6421'\n/* unitCost: 5 */\n${GOOD}` });
  const r = await cli(['module', 'accounting-check', 'hoa-hong', '--static']);
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /KẾT LUẬN: PASS/);
});

test('module sai kế toán: UPDATE ledger_lines + số tài khoản viết cứng + tự điền giá vốn → FAIL kèm vị trí, sửa, luật', async () => {
  writeModule('hoa-hong', {
    'api/actions/chot.ts': `export default defineAction({ id: 'c', handler: async (ctx, input) => {
  await ctx.ledger.submit({ docType: 'manual_journal', docKey: 'hoa-hong:1', lines: [{ debitAccount: '6421', creditAccount: '3388', amount: 5, unitCost: 12345 }] });
  await sql\`UPDATE ledger_lines SET debit = debit + 1 WHERE account_code = 'x'\`.execute(tx);
} });` });
  const r = await cli(['module', 'accounting-check', 'hoa-hong']);
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stdout, /FAIL  AC-1 .*ledger_lines/);
  assert.match(r.stdout, /api\/actions\/chot\.ts:3/);
  assert.match(r.stdout, /FAIL  AC-2 .*6421, 3388/);
  assert.match(r.stdout, /WARN  AC-3 /);
  assert.match(r.stdout, /sửa: Module không thấy và không ghi bảng sổ/);
  assert.match(r.stdout, /luật: ADR-0015/);
});

test('ghi vào khung nhìn bizcity_read (INSERT) vẫn là lỗi; đọc thì không', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': 'await sql`INSERT INTO bizcity_read.ledger_lines (id) VALUES (1)`.execute(tx);' });
  const r = await cli(['module', 'accounting-check', 'hoa-hong', '--json']);
  assert.equal(statusOf(r)['AC-1'], 'FAIL');
});

test('migration của module tham chiếu bảng sổ Core → AC-1 FAIL', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': GOOD, 'migrations/0001_x.sql': '-- ledger_lines trong chú thích thì bỏ qua\nALTER TABLE public.ledger_lines ADD COLUMN x int;' });
  const r = await cli(['module', 'accounting-check', 'hoa-hong', '--json']);
  assert.equal(statusOf(r)['AC-1'], 'FAIL');
  assert.match(JSON.parse(r.stdout).rows[0].hits[0], /migrations\/0001_x\.sql:2/);
});

test('module ke-toan được tự chọn tài khoản: AC-2 N/A', async () => {
  writeModule('ke-toan', { 'api/actions/a.ts': "const l = { debitAccount: '6421', creditAccount: '1111' };" });
  const r = await cli(['module', 'accounting-check', 'ke-toan', '--json']);
  assert.equal(statusOf(r)['AC-2'], 'N/A');
});

test('docType của cổng sản xuất → FAIL AC-4 có nói "không phải lỗi của bạn" và chỉ skill mở cổng', async () => {
  writeModule('san-xuat', { 'api/actions/a.ts': SUBMIT().replace("'sale'", "'production_issue'").replace('hoa-hong:', 'san-xuat:') });
  const r = await cli(['module', 'accounting-check', 'san-xuat']);
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stdout, /FAIL  AC-4 .*production_issue.*Kernel chưa mở/);
  assert.match(r.stdout, /Không lách bằng stock_adjustment/);
  assert.match(r.stdout, /contribute-production-module/);
});

test('docType ngoài hợp đồng → FAIL AC-4 liệt kê các loại hợp lệ; loại khai ở manifest thì cho qua', async () => {
  const code = SUBMIT().replace("'sale'", "'hoa_don_tay'");
  writeModule('hoa-hong', { 'api/actions/a.ts': code });
  let r = await cli(['module', 'accounting-check', 'hoa-hong']);
  assert.match(r.stdout, /FAIL  AC-4 .*hoa_don_tay/);
  assert.match(r.stdout, /Dùng một trong: sale, sale_return/);
  writeModule('hoa-hong', { 'api/actions/a.ts': code }, { docTypes: ['hoa_don_tay'] });
  r = await cli(['module', 'accounting-check', 'hoa-hong', '--json']);
  assert.equal(statusOf(r)['AC-4'], 'PASS');
});

test('docType hợp lệ nhưng chưa khai ở ledger.submits → FAIL AC-4 chỉ cách khai; khai rồi thì PASS', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': SUBMIT() }, { ledger: { submits: [] } });
  let r = await cli(['module', 'accounting-check', 'hoa-hong']);
  assert.match(r.stdout, /FAIL  AC-4 .*chưa khai ở manifest ledger.submits: sale/);
  assert.match(r.stdout, /luật: STD-MOD-2/);
  writeModule('hoa-hong', { 'api/actions/a.ts': SUBMIT() });
  r = await cli(['module', 'accounting-check', 'hoa-hong', '--json']);
  assert.equal(statusOf(r)['AC-4'], 'PASS');
});

test('docKey không mang tiền tố module, hoặc dùng Date.now → FAIL AC-5', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': SUBMIT().replace('hoa-hong:CN01:HD1', 'HD1') });
  let r = await cli(['module', 'accounting-check', 'hoa-hong']);
  assert.match(r.stdout, /FAIL  AC-5 .*không mang tiền tố "hoa-hong:"/);
  writeModule('hoa-hong', { 'api/actions/a.ts': 'await ctx.ledger.submit({ docType: "sale", docKey: `hoa-hong:${Date.now()}`, lines: [] });' });
  r = await cli(['module', 'accounting-check', 'hoa-hong']);
  assert.match(r.stdout, /FAIL  AC-5 .*không ổn định/);
});

test('docKey dựng từ biến (${prefix}:…) hoặc đúng tiền tố → PASS', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': 'await ctx.ledger.submit({ docType: "sale", docKey: `${p}:CN01`, lines: [] }); await ctx.ledger.submit({ docType: "sale", docKey: `hoa-hong:${id}`, lines: [] });' });
  const r = await cli(['module', 'accounting-check', 'hoa-hong', '--json']);
  assert.equal(statusOf(r)['AC-5'], 'PASS');
});

test('module có gửi sổ nhưng chưa có examples/ → WARN AC-6, kết luận SKIP (mã 2); --static thì bỏ AC-6, mã 0', async () => {
  writeModule('hoa-hong', { 'api/actions/a.ts': SUBMIT() });
  let r = await cli(['module', 'accounting-check', 'hoa-hong']);
  assert.equal(r.code, 2, r.stdout);
  assert.match(r.stdout, /WARN  AC-6 .*chưa có modules\/hoa-hong\/examples/);
  r = await cli(['module', 'accounting-check', 'hoa-hong', '--static']);
  assert.equal(r.code, 0, r.stdout);
});

const SALE = (key) => ({
  docType: 'sale', docKey: key, version: 1, branchCode: 'CN01', docNo: 'HH1', docDate: '2026-11-03',
  lines: [{ lineKey: 'l1', sku: 'SUA400', qty: 1, amountBeforeTax: 100, taxCode: 'R08', taxAmount: 8 }], totals: { beforeTax: 100, tax: 8, total: 108 },
});

test('chứng từ mẫu + máy chủ giả: preflight → dryRun → PASS, in bút toán Kernel dựng; docKey sai tiền tố → FAIL', async () => {
  const seen = [];
  const srv = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      seen.push(req.url);
      const send = (j) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (req.url === '/api/v1/intake/preflight') return send({ ok: true, data: { findings: [], score: 100, guard: 'g' } });
      if (req.url === '/api/v1/documents/submit?dryRun=1') return send({ ok: true, data: { status: 'posted', entries: [{ entryNo: '1', accountCode: '1111', accountName: 'Tiền mặt', debit: 108, credit: 0 }, { entryNo: '1', accountCode: '5111', accountName: 'DT', debit: 0, credit: 100 }] } });
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const dir = writeModule('hoa-hong', { 'api/actions/a.ts': SUBMIT(), 'examples/ban-hang.json': JSON.stringify(SALE('hoa-hong:CN01:HD1')), 'examples/sai.json': JSON.stringify(SALE('HD2')) });
    assert.ok(dir);
    const r = await cli(['module', 'accounting-check', 'hoa-hong', '--json'], { BIZCITY_SERVER: `http://127.0.0.1:${srv.address().port}`, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 1, r.stdout);
    const st = statusOf(r);
    assert.equal(st['AC-6 ban-hang.json'], 'PASS');
    assert.equal(st['AC-6 sai.json'], 'FAIL');
    const ok = JSON.parse(r.stdout).rows.find((x) => x.id === 'AC-6 ban-hang.json');
    assert.equal(ok.entries.length, 2);
    assert.match(JSON.parse(r.stdout).rows.find((x) => x.id === 'AC-6 sai.json').detail, /không mang tiền tố "hoa-hong:"/);
    assert.ok(seen.includes('/api/v1/documents/submit?dryRun=1'));
  } finally { await new Promise((r) => srv.close(r)); }
});

test('mã module sai khuôn hoặc không có manifest → mã 2', async () => {
  assert.equal((await cli(['module', 'accounting-check', 'Sai Khuon'])).code, 2);
  assert.equal((await cli(['module', 'accounting-check', 'khong-co'])).code, 2);
});
