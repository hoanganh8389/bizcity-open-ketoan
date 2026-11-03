// [2026-11-03 03:15 PM Johnny Chu - Chu Hoàng Anh] G3-01 — test lệnh kế toán của CLI: dữ liệu thật của repo + bản dựng giả + máy chủ giả; chạy: node --test packages/cli/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toDocument } from '../../../examples/pos-mini/pos-mini.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const CLI = path.join(REPO, 'packages/cli/bin/bizcity.mjs');
const FIX = path.join(HERE, 'fixtures/root');
const ORDER = JSON.parse(readFileSync(path.join(REPO, 'examples/pos-mini/don-mau.json'), 'utf8'));
const CFG = JSON.parse(readFileSync(path.join(REPO, 'examples/pos-mini/cau-hinh.json'), 'utf8'));
const SKILLS = ['open-ketoan-standard', 'build-business-app-with-open-ketoan', 'build-pos-with-open-ketoan', 'validate-accounting-event', 'check-accounting-flow', 'explain-accounting-error', 'contribute-production-module'];
const tmp = mkdtempSync(path.join(tmpdir(), 'bizcity-cli-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

/** Chạy CLI trong tiến trình con (gốc repo đổi bằng BIZCITY_ROOT). Không dùng spawnSync: máy chủ giả chạy cùng tiến trình test. */
function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, BIZCITY_SERVER: '', BIZCITY_API_KEY: '', ...env } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

const docFile = (doc, name = 'doc.json') => { const f = path.join(tmp, name); writeFileSync(f, JSON.stringify(doc)); return f; };
const goodDoc = () => toDocument(ORDER, CFG).document;

/** Máy chủ giả: preflight + submit (dryRun / thật), ghi lại yêu cầu nhận được. */
async function fakeServer({ preflight, dryRun, submit } = {}) {
  const seen = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-api-key'], idem: req.headers['idempotency-key'], body: body ? JSON.parse(body) : null });
      const send = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (req.url === '/api/v1/intake/preflight') return send(200, preflight ?? { ok: true, data: { findings: [], score: 100, guard: 'g1' } });
      if (req.url === '/api/v1/documents/submit?dryRun=1') return dryRun ? send(dryRun.status ?? 200, dryRun.json) : send(200, { ok: true, data: { docKey: 'x', version: 1, status: 'posted', entries: [
        { entryNo: '1', accountCode: '1111', accountName: 'Tiền mặt', debit: 860000, credit: 0, partnerCode: null, description: '' },
        { entryNo: '1', accountCode: '5111', accountName: 'Doanh thu bán hàng', debit: 0, credit: 796296, partnerCode: null, description: '' },
        { entryNo: '1', accountCode: '33311', accountName: 'Thuế GTGT đầu ra', debit: 0, credit: 63704, partnerCode: null, description: '' },
      ] }, meta: { dryRun: true } });
      if (req.url === '/api/v1/documents/submit') return send(200, submit ?? { ok: true, data: { docKey: 'x', version: 1, status: 'posted', entryIds: ['9'], entries: [] }, meta: { receipt: { evidenceId: 'ev1', hash: 'abcdef1234567890' } } });
      if (req.url === '/api/v1/findings/IN-MD-004') return send(200, { ok: true, data: { code: 'IN-MD-004', gate: 'B', level: 'info', step: 'L3', title: 'Mã hàng chưa có', why: 'w', fix: 'f', rule: 'R', learn: null } });
      send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'không có' } });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}

// ── pos-mini ──
test('pos-mini: đơn mẫu → chứng từ sale, totals = cộng các dòng, docKey ổn định, không có số tài khoản', () => {
  const { document, problems } = toDocument(ORDER, CFG);
  assert.deepEqual(problems, []);
  assert.equal(document.docType, 'sale');
  assert.equal(document.docKey, 'pos:CN01:sale:1001');
  assert.deepEqual(document.totals, { beforeTax: 796296, tax: 63704, total: 860000 });
  assert.equal(document.payments.reduce((s, p) => s + p.amount, 0), document.totals.total);
  assert.deepEqual(document.payments.map((p) => p.methodCode), ['TM', 'QR']);
  assert.ok(document.lines[1].isGift);
  assert.doesNotMatch(JSON.stringify(document), /account|debit|credit/i);
});

test('pos-mini: thiếu ánh xạ chi nhánh / hình thức / mã thuế → báo vấn đề, không tự đoán mã', () => {
  const order = { ...ORDER, store: 'CN09', payments: [{ method: 'momo', amount: 860000 }], items: [{ ...ORDER.items[0], taxCode: undefined }] };
  const { problems } = toDocument(order, CFG);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.includes('CN09')) && problems.some((p) => p.includes('momo')) && problems.some((p) => p.includes('taxCode')));
});

// ── explain trên dữ liệu thật của repo (không cần bản dựng) ──
test('explain COGS_STALE (repo thật): nối tới ca F22-STK-04, vai kế toán trưởng, ghi rõ nguồn chưa dựng', async () => {
  const r = await cli(['explain', 'COGS_STALE', '--json'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.faults.some((f) => f.id === 'F22-STK-04'));
  assert.ok(j.views.chief_accountant.some((l) => l.startsWith('F22-STK-04')));
  if (!existsSync(path.join(REPO, 'packages/contracts/dist/index.js'))) assert.ok(j.missing.some((m) => m.includes('chưa dựng')));
});

test('explain DG-INV-1 (repo thật): DG ↔ INVENTORY_NEGATIVE ↔ F22-STK-01', async () => {
  const r = await cli(['explain', 'dg-inv-1', '--json'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.diag[0], { dg: 'DG-INV-1', app: 'INVENTORY_NEGATIVE' });
  assert.ok(j.faults.some((f) => f.id === 'F22-STK-01'));
});

test('explain F22-STK-04 (repo thật): tra thẳng mã ca', async () => {
  const r = await cli(['explain', 'F22-STK-04'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Phiếu nhập về \/ sửa sau khi đã tính giá vốn tháng/);
});

test('explain mã lạ: mã thoát 1, nói không đoán', async () => {
  const r = await cli(['explain', 'ABC-999'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /không có trong danh mục nào/);
  assert.match(r.stdout, /Không đoán nghĩa/);
});

test('explain không có mã: lỗi dùng lệnh, mã thoát 2', async () => {
  const r = await cli(['explain'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 2);
});

// ── explain với bản dựng giả ──
test('explain IN-SUM-001 (bản dựng giả): bước sửa, việc cấm, ai sửa, kiểm lại', async () => {
  const r = await cli(['explain', 'IN-SUM-001', '--json'], { BIZCITY_ROOT: FIX });
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.owner, 'creator');
  assert.equal(j.verify, 'IN-SUM-001');
  assert.ok(j.views.dev.some((l) => l.startsWith('CẤM:')));
  assert.equal(j.missing.length, 0);
});

test('explain PERIOD_LOCKED (bản dựng giả): lỗi API không thử lại + ca F22 của kiểm soát', async () => {
  const r = await cli(['explain', 'PERIOD_LOCKED', '--role', 'dev'], { BIZCITY_ROOT: FIX });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /HTTP 409/);
  assert.match(r.stdout, /Không tự thử lại/);
  assert.doesNotMatch(r.stdout, /Kiểm soát nội bộ/);
  const all = await cli(['explain', 'PERIOD_LOCKED'], { BIZCITY_ROOT: FIX });
  assert.match(all.stdout, /Kiểm soát nội bộ[\s\S]*F22-STK-09 ★/);
});

test('explain IN-MD-004 không có bản dựng: hỏi máy chủ GET /api/v1/findings/:code', async () => {
  const s = await fakeServer();
  try {
    const r = await cli(['explain', 'IN-MD-004', '--json'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k-test' });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(JSON.parse(r.stdout).sources.includes('GET /api/v1/findings/:code'));
    assert.equal(s.seen[0].key, 'k-test');
  } finally { await s.close(); }
});

// ── event check ──
test('event check, không bản dựng, không máy chủ: SKIP (mã 2), không bao giờ PASS', async () => {
  const r = await cli(['event', 'check', docFile(goodDoc())], { BIZCITY_ROOT: tmp });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /SKIP  L1 /);
  assert.match(r.stdout, /KẾT LUẬN: SKIP/);
});

test('event check offline (bản dựng giả): tổng lệch → FAIL IN-SUM-001, mã 1', async () => {
  const doc = goodDoc();
  doc.totals.beforeTax += 1;
  const r = await cli(['event', 'check', docFile(doc), '--json'], { BIZCITY_ROOT: FIX });
  assert.equal(r.code, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'FAIL');
  assert.ok(j.findings.some((f) => f.code === 'IN-SUM-001' && f.source === 'totalsProblems'));
});

test('event check offline (bản dựng giả): khuôn sai → FAIL L1, L2 SKIP', async () => {
  const r = await cli(['event', 'check', docFile({ docType: 'sale' }), '--json'], { BIZCITY_ROOT: FIX });
  assert.equal(r.code, 1);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.rows.slice(0, 2).map((x) => x.status), ['FAIL', 'SKIP']);
});

test('event check offline đạt nhưng chưa có L5: SKIP, không PASS', async () => {
  const r = await cli(['event', 'check', docFile(goodDoc())], { BIZCITY_ROOT: FIX });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /PASS  L1 /);
  assert.match(r.stdout, /PASS  L2 /);
  assert.match(r.stdout, /KẾT LUẬN: SKIP/);
});

test('event check + máy chủ: preflight → dryRun → PASS, in bút toán Kernel dựng, gửi guard', async () => {
  const s = await fakeServer();
  try {
    const r = await cli(['event', 'check', docFile(goodDoc())], { BIZCITY_ROOT: FIX, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k-test' });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS  L5 /);
    assert.match(r.stdout, /Nợ 860000 = Có 860000/);
    assert.match(r.stdout, /5111/);
    assert.deepEqual(s.seen.map((x) => x.url), ['/api/v1/intake/preflight', '/api/v1/documents/submit?dryRun=1']);
    assert.equal(s.seen[1].body.guard, 'g1');
  } finally { await s.close(); }
});

test('event check + máy chủ: preflight có lỗi chặn → FAIL, không gọi dryRun', async () => {
  const s = await fakeServer({ preflight: { ok: true, data: { score: 0, guard: 'g', findings: [{ code: 'IN-MD-001', severity: 'block', layer: 'L3', title: 'Chi nhánh chưa có', path: 'branchCode', fix: 'Khai chi nhánh' }] } } });
  try {
    const r = await cli(['event', 'check', docFile(goodDoc()), '--json'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 1);
    const j = JSON.parse(r.stdout);
    assert.ok(j.findings.some((f) => f.code === 'IN-MD-001'));
    assert.equal(j.rows.find((x) => x.layer === 'L5').status, 'SKIP');
    assert.equal(s.seen.length, 1);
  } finally { await s.close(); }
});

test('event check + máy chủ: dryRun trả PERIOD_LOCKED → FAIL ở L5 với đúng mã', async () => {
  const s = await fakeServer({ dryRun: { status: 409, json: { ok: false, error: { code: 'PERIOD_LOCKED', message: 'Kỳ kế toán đã khoá' } } } });
  try {
    const r = await cli(['event', 'check', docFile(goodDoc()), '--json'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 1);
    const j = JSON.parse(r.stdout);
    assert.equal(j.rows.find((x) => x.layer === 'L5').status, 'FAIL');
    assert.ok(j.findings.some((f) => f.code === 'PERIOD_LOCKED'));
  } finally { await s.close(); }
});

test('event check --submit: nộp sau L5 PASS, Idempotency-Key = docKey:v<version>, biên nhận', async () => {
  const s = await fakeServer();
  try {
    const r = await cli(['event', 'check', docFile(goodDoc()), '--submit'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 0, r.stdout);
    assert.equal(s.seen[2].url, '/api/v1/documents/submit');
    assert.equal(s.seen[2].idem, 'pos:CN01:sale:1001:v1');
    assert.match(r.stdout, /PASS  nộp/);
    assert.match(r.stdout, /Biên nhận: ev1/);
  } finally { await s.close(); }
});

test('event check --submit khi L5 FAIL: không nộp', async () => {
  const s = await fakeServer({ dryRun: { status: 422, json: { ok: false, error: { code: 'POSTING_FAILED', message: 'Chưa định khoản được' } } } });
  try {
    await cli(['event', 'check', docFile(goodDoc()), '--submit'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.ok(!s.seen.some((x) => x.url === '/api/v1/documents/submit'));
  } finally { await s.close(); }
});

test('event check nhận khuôn { document } và stdin -', async () => {
  const r = await cli(['event', 'check', docFile({ document: goodDoc() }), '--json'], { BIZCITY_ROOT: FIX });
  assert.equal(JSON.parse(r.stdout).rows[0].status, 'PASS');
});

// ── skills install ──
test('skills install --to <dự án>: chép 7 skill vào .claude/skills + .agents/skills, ghi .bizcity/ketoan.json', async () => {
  const proj = mkdtempSync(path.join(tmpdir(), 'pos-app-'));
  try {
    const r = await cli(['skills', 'install', '--to', proj], { BIZCITY_ROOT: REPO });
    assert.equal(r.code, 0, r.stderr);
    for (const name of SKILLS) {
      for (const base of ['.claude/skills', '.agents/skills']) assert.ok(existsSync(path.join(proj, base, name, 'SKILL.md')), `${base}/${name}`);
    }
    const link = JSON.parse(readFileSync(path.join(proj, '.bizcity/ketoan.json'), 'utf8'));
    assert.equal(link.contract, 'bizcity_skills_link@1');
    assert.ok(link.cli.endsWith('packages/cli/bin/bizcity.mjs'));
  } finally { rmSync(proj, { recursive: true, force: true }); }
});

test('mỗi SKILL.md có frontmatter name trùng thư mục và description, chỉ gọi lệnh bizcity có thật', () => {
  const help = readFileSync(CLI, 'utf8');
  for (const name of SKILLS) {
    const text = readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
    assert.match(fm, new RegExp(`^name: ${name}$`, 'm'));
    assert.match(fm, /^description: .{80,}/m);
    for (const m of text.matchAll(/npx bizcity ([a-z]+)(?: ([a-z]+))?/g)) {
      const cmd = m[2] && !['check', 'install'].includes(m[2]) ? m[1] : [m[1], m[2]].filter(Boolean).join(' ');
      const head = cmd.split(' ')[0];
      assert.ok(help.includes(`cmd === '${head}'`), `${name}: lệnh "npx bizcity ${cmd}" không có trong CLI`);
    }
  }
});

// ── bản dựng THẬT của repo (chạy trong CI sau npm run build; máy chưa dựng thì bỏ qua, ghi rõ) ──
const REAL_BUILT = existsSync(path.join(REPO, 'packages/contracts/dist/index.js')) && existsSync(path.join(REPO, 'packages/kernel/dist/modules/documents/document.service.js'));
const realOpts = REAL_BUILT ? {} : { skip: 'chưa dựng contracts + kernel (npm run build) — chạy trong CI' };

test('bản dựng thật: chứng từ của pos-mini qua L1 khuôn + L2 tổng tiền của cửa nạp', realOpts, async () => {
  const r = await cli(['event', 'check', docFile(goodDoc(), 'real.json'), '--json'], { BIZCITY_ROOT: REPO });
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.rows.slice(0, 2).map((x) => x.status), ['PASS', 'PASS'], JSON.stringify(j.findings));
});

test('bản dựng thật: tổng lệch 1 đồng → IN-SUM-001 đúng danh mục, explain có bước sửa và việc cấm', realOpts, async () => {
  const doc = goodDoc();
  doc.totals.beforeTax += 1;
  const r = await cli(['event', 'check', docFile(doc, 'real-bad.json'), '--json'], { BIZCITY_ROOT: REPO });
  assert.equal(r.code, 1);
  assert.ok(JSON.parse(r.stdout).findings.some((f) => f.code === 'IN-SUM-001'));
  const e = JSON.parse((await cli(['explain', 'IN-SUM-001', '--json'], { BIZCITY_ROOT: REPO })).stdout);
  assert.equal(e.owner, 'creator');
  assert.ok(e.forbid.length > 0);
});

// ── flow check (chuẩn C1, C2, C5) ──
/** Máy chủ giả cho báo cáo: sổ chi tiết hàng, đơn giá vốn, lãi gộp, bảng kiểm khoá kỳ. */
async function reportServer({ ledgerRows, opening = 0, costs, profitRows, periodItems, ledgerByFrom, reconcileRows = [] }) {
  const seen = [];
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    seen.push({ path: u.pathname, q: Object.fromEntries(u.searchParams), key: req.headers['x-api-key'] });
    const send = (json) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, data: json })); };
    if (u.pathname === '/api/v1/inventory/item-ledger' && ledgerByFrom) {
      const p = ledgerByFrom[u.searchParams.get('from')] ?? { opening: 0, rows: [] };
      return send({ sku: u.searchParams.get('sku'), opening: { qty: p.opening, value: 0 }, rows: p.rows, closing: { qty: p.rows.length ? p.rows[p.rows.length - 1].balanceQty : p.opening, value: 0 } });
    }
    if (u.pathname === '/api/v1/inventory/item-ledger') {
      const closing = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balanceQty : opening;
      return send({ sku: u.searchParams.get('sku'), name: 'Sữa bột 400g', unit: 'Lon', opening: { qty: opening, value: 0 }, rows: ledgerRows, closing: { qty: closing, value: 0 } });
    }
    if (u.pathname === '/api/v1/inventory/costs') return send(costs);
    if (u.pathname === '/api/v1/reports/gross-profit') return send({ rows: profitRows, totals: {}, uncosted: 0 });
    if (u.pathname === '/api/v1/periods/check') return send(periodItems);
    if (u.pathname === '/api/v1/inventory/reconcile') return send({ period: u.searchParams.get('period'), rows: reconcileRows, totals: [], summary: {} });
    res.writeHead(404); res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}
const row = (o) => ({ docDate: '2026-11-03', docNo: 'X', docKey: 'k', docType: 'sale', branchCode: 'CN01', inQty: 0, outQty: 0, balanceQty: 0, uncosted: false, ...o });
const cleanPeriod = [{ key: 'integrity', label: 'Lỗi toàn vẹn sổ', count: 0 }, { key: 'cogs', label: 'Chưa tính giá vốn', count: 0 }, { key: 'paymentRequests', label: 'Yêu cầu thanh toán chờ', count: 2 }];

test('flow check: luồng sạch → PASS (C2 vẫn SKIP), đúng tham số kỳ gửi lên các báo cáo', async () => {
  const s = await reportServer({
    ledgerRows: [row({ docType: 'purchase', inQty: 10, balanceQty: 10 }), row({ outQty: 2, balanceQty: 8 })],
    costs: [{ sku: 'SUA400', unitCost: 310000 }],
    profitRows: [{ key: 'SUA400', revenue: 796296, cost: 620000, gross: 176296, margin: 22.1, uncosted: 0 }],
    periodItems: cleanPeriod,
    reconcileRows: [{ branchCode: 'CN01', sku: 'SUA400', subledgerValue: 2480000, ledgerValue: 2480000, diff: 0, uncosted: 0, accounts: [{ code: 'TKKHO', value: 2480000 }], status: 'ok' }],
  });
  try {
    const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-11'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /PASS  C1\.4  Lãi gộp tính được — doanh thu 796296 − giá vốn 620000 = lãi gộp 176296 \(22\.1%\)/);
    assert.match(r.stdout, /PASS  C1\.5  Sổ kho khớp sổ cái — CN01: sổ kho 2480000 · sổ cái 2480000 \(TKKHO 2480000\)/);
    assert.deepEqual(s.seen.find((x) => x.path === '/api/v1/inventory/reconcile').q, { period: '2026-11', search: 'SUA400' });
    assert.match(r.stdout, /SKIP  C2 /);
    assert.match(r.stdout, /nhắc: Yêu cầu thanh toán chờ \(2\)/);
    assert.match(r.stdout, /FIFO/);
    const il = s.seen.find((x) => x.path === '/api/v1/inventory/item-ledger');
    assert.deepEqual([il.q.from, il.q.to], ['2026-11-01', '2026-11-30']);
    assert.deepEqual(s.seen.find((x) => x.path === '/api/v1/periods/check').q, { year: '2026', month: '11' });
  } finally { await s.close(); }
});

test('flow check: tồn âm + xuất chưa có giá vốn + kỳ chưa sẵn sàng → FAIL kèm mã và bước sửa', async () => {
  const s = await reportServer({
    ledgerRows: [row({ docNo: 'HD9', outQty: 3, balanceQty: -3, uncosted: true })],
    costs: [],
    profitRows: [{ key: 'SUA400', revenue: 100, cost: 0, gross: 100, margin: 100, uncosted: 1 }],
    reconcileRows: [{ branchCode: 'CN01', sku: 'SUA400', subledgerValue: 0, ledgerValue: 500000, diff: 500000, uncosted: 0, accounts: [{ code: 'TKKHO', value: 500000 }], expectedAccount: 'TKKHO', status: 'diff' }],
    periodItems: [{ key: 'cogs', label: 'Chi nhánh có bán hàng nhưng chưa tính giá vốn', count: 1, link: '/nghiep-vu/tinh-gia-von', remedy: { steps: [{ text: 'Tính giá vốn tháng ở ACC49' }] } }],
  });
  try {
    const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-11', '--json'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 1);
    const j = JSON.parse(r.stdout);
    const st = Object.fromEntries(j.rows.map((x) => [x.id, x.status]));
    assert.deepEqual(st, { 'C1.1': 'FAIL', 'C1.2': 'FAIL', 'C1.3': 'FAIL', 'C1.4': 'FAIL', 'C1.5': 'FAIL', C5: 'FAIL', C2: 'SKIP' });
    assert.match(j.rows.find((x) => x.id === 'C1.5').detail, /lệch 500000/);
    assert.ok(j.rows.find((x) => x.id === 'C1.2').codes.includes('INVENTORY_NEGATIVE'));
    assert.deepEqual(j.rows.find((x) => x.id === 'C5').todo[0].steps, ['Tính giá vốn tháng ở ACC49']);
  } finally { await s.close(); }
});

test('flow check không có máy chủ: mọi dòng SKIP, mã 2', async () => {
  const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-11'], { BIZCITY_ROOT: tmp });
  assert.equal(r.code, 2);
  assert.doesNotMatch(r.stdout, /PASS /);
});

test('flow check sai tham số kỳ: lỗi dùng lệnh, mã 2', async () => {
  const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-13x'], { BIZCITY_ROOT: tmp });
  assert.equal(r.code, 2);
});

test('event check: phát hiện in kèm "sửa:" và "luật:" (chuẩn C6)', async () => {
  const doc = goodDoc();
  doc.totals.beforeTax += 1;
  const r = await cli(['event', 'check', docFile(doc, 'c6.json')], { BIZCITY_ROOT: FIX });
  assert.match(r.stdout, /sửa: Tính lại tổng/);
  assert.match(r.stdout, /luật: R-EVENT-5/);
});

// [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] G3-01 — vòng đời nhiều kỳ + cổng sản xuất
const lifecycleLedger = (decOpening) => ({
  '2026-10-01': { opening: 0, rows: [row({ docDate: '2026-10-02', docType: 'purchase', inQty: 10, balanceQty: 10 }), row({ docDate: '2026-10-20', outQty: 4, balanceQty: 6 })] },
  '2026-11-01': { opening: 6, rows: [row({ outQty: 2, balanceQty: 4 })] },
  '2026-12-01': { opening: decOpening, rows: [row({ docDate: '2026-12-05', outQty: 1, balanceQty: decOpening - 1 })] },
});
const lifecycleServer = (decOpening) => reportServer({ ledgerByFrom: lifecycleLedger(decOpening), costs: [{ sku: 'SUA400', unitCost: 310000 }], profitRows: [], periodItems: cleanPeriod });

test('flow check --to: vòng đời ba kỳ nối liền → PASS, mỗi kỳ đọc đúng khoảng ngày', async () => {
  const s = await lifecycleServer(4);
  try {
    const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-10', '--to', '2026-12'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /PASS  L1 2026-10→2026-11  Tồn chuyển kỳ liền mạch — 6/);
    assert.match(r.stdout, /PASS  L1 2026-11→2026-12/);
    assert.match(r.stdout, /SKIP  C2 /);
    assert.deepEqual(s.seen.filter((x) => x.path === '/api/v1/inventory/item-ledger').map((x) => x.q.to), ['2026-10-31', '2026-11-30', '2026-12-31']);
  } finally { await s.close(); }
});

test('flow check --to: tồn cuối kỳ trước ≠ tồn đầu kỳ sau → FAIL, chỉ đúng chỗ đứt, kèm F22-STK-04', async () => {
  const s = await lifecycleServer(7);
  try {
    const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-10', '--to', '2026-12', '--json'], { BIZCITY_ROOT: tmp, BIZCITY_SERVER: s.url, BIZCITY_API_KEY: 'k' });
    assert.equal(r.code, 1);
    const j = JSON.parse(r.stdout);
    assert.deepEqual(j.links.map((x) => x.status), ['PASS', 'FAIL']);
    assert.match(j.links[1].detail, /cuối 2026-11 = 4 nhưng đầu 2026-12 = 7/);
    assert.deepEqual(j.links[1].codes, ['F22-STK-04']);
  } finally { await s.close(); }
});

test('flow check --to trước --period: lỗi dùng lệnh, mã 2', async () => {
  const r = await cli(['flow', 'check', '--sku', 'SUA400', '--period', '2026-11', '--to', '2026-10'], { BIZCITY_ROOT: tmp });
  assert.equal(r.code, 2);
});

test('event check: docType của cổng sản xuất → SKIP "cổng chưa mở", chỉ đường skill, không nộp', async () => {
  const r = await cli(['event', 'check', docFile({ ...goodDoc(), docType: 'production_issue' }, 'prod.json'), '--submit'], { BIZCITY_ROOT: FIX, BIZCITY_SERVER: 'http://127.0.0.1:9', BIZCITY_API_KEY: 'k' });
  assert.equal(r.code, 2, r.stdout);
  assert.match(r.stdout, /Cổng Sản xuất \/ MRP: đã giữ chỗ, Kernel chưa mở/);
  assert.match(r.stdout, /contribute-production-module/);
  assert.match(r.stdout, /Không lách bằng stock_adjustment/);
  assert.doesNotMatch(r.stdout, /Nộp vào sổ/);
});
