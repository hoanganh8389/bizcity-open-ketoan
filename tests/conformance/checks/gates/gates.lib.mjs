// [2026-11-11 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b (S034-6, D034-11): dò mã kiểm, test, bộ kiểm CI, trigger TỪ REPO — dùng chung cho scripts/cong-kiem.mjs (sinh) và SC-GATE-1 (kiểm)
/**
 * Hàm thuần trên bộ đọc repo `r` = { read(rel), exists(rel), files({ under, ext }) }.
 *   discoverCodes(r)  mã chẩn đoán (`code: 'X'` trong *.diagnostics.ts + platform/system/diagnostics.ts) và mã cổng A / B / L
 *                     (khoá 'ACC-…-001' / 'PART-…' / 'ITEM-…' / 'IN-…' / 'LIB-…' trong packages/contracts/src; mã luật thư viện rules[].code ở libraries/<id>/library.json)
 *   testsIndex(r, codes) mã → tệp apps/api/test/*.test.ts có chuỗi mã
 *   discoverCi(r)     SC-* / DG-* (id, tiêu đề, mức chặn, lane) + có ca tự kiểm trong fixtures/expect.json
 *   discoverTriggers(r) CREATE TRIGGER trong db/migrations (tên, bảng, migration đầu tiên) — LEDGER_TRIGGERS kiểm mọi trigger khai ở đây
 *   pillarsOf(map, code) trụ cột của mã theo map[] (dòng đầu khớp; `*` khớp mọi chuỗi)
 */
const DIAG_RE = /code: '([A-Z][A-Z0-9_]+)'/g;
const FIND_RE = /^\s*'((?:ACC|PART|ITEM|IN|LIB)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}[a-z]?)'\s*:/gm;
const CI_RE = /id:\s*'((?:SC|DG)-[A-Z]+-\d+)'[\s\S]*?title:\s*(['"`])((?:(?!\2)[\s\S])*)\2[\s\S]*?enforce:\s*'(\w+)'/g;
const TRG_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)[\s\S]*?\bON\s+(?:(\w+)\.)?(\w+)/gi;
const NOT_SRC = /(^|\/)(test|tests|dist|node_modules|fixtures)\//;

export function discoverCodes(r) {
  const diag = new Set();
  const files = r.files({ under: ['packages', 'apps/api/src'], ext: ['.ts'] }).filter((f) => !NOT_SRC.test(f) && (/\.diagnostics\.ts$/.test(f) || f === 'packages/platform/src/system/diagnostics.ts'));
  for (const f of files) for (const m of (r.read(f) ?? '').matchAll(DIAG_RE)) diag.add(m[1]);
  const finding = new Set();
  for (const f of r.files({ under: ['packages/contracts/src'], ext: ['.ts'] })) for (const m of (r.read(f) ?? '').matchAll(FIND_RE)) finding.add(m[1]);
  // [2026-11-11 03:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b-3: mã luật riêng của thư viện (libraries/<id>/library.json → rules[].code), cổng L nạp lúc chạy
  for (const f of r.files({ under: ['libraries'], ext: ['library.json'] })) {
    try { for (const rule of JSON.parse(r.read(f) ?? '{}').rules ?? []) if (rule?.code) finding.add(rule.code); } catch { /* tệp hỏng: SC-LIB-1 báo */ }
  }
  return { diag: [...diag].sort(), finding: [...finding].sort() };
}

export function testsIndex(r, codes) {
  const tests = r.files({ under: ['apps/api/test'], ext: ['.test.ts'] }).sort();
  const text = new Map(tests.map((f) => [f, r.read(f) ?? '']));
  const out = {};
  for (const c of codes) {
    const re = new RegExp(`(^|[^A-Z0-9_-])${escapeRe(c)}($|[^A-Z0-9_-])`);
    const hit = tests.filter((f) => re.test(text.get(f)));
    if (hit.length) out[c] = hit;
  }
  return out;
}

export function discoverCi(r) {
  let selftest = new Set();
  try { selftest = new Set((JSON.parse(r.read('tests/conformance/fixtures/expect.json') ?? '{}').targets ?? []).flatMap((t) => Object.keys(t.checks ?? {}))); } catch { /* không có tệp */ }
  const out = new Map();
  const files = [...r.files({ under: ['tests/conformance/checks'], ext: ['.check.mjs'] }), ...r.files({ under: ['tests/conformance/diagnostics'], ext: ['.diag.mjs'] })].sort();
  for (const f of files) {
    for (const m of (r.read(f) ?? '').matchAll(CI_RE)) {
      if (out.has(m[1])) continue;
      out.set(m[1], { id: m[1], title: m[3].replace(/\s+/g, ' ').trim(), enforce: m[4], lane: m[1].startsWith('DG-') ? 'diagnostics' : 'selfcheck', file: f, selftest: selftest.has(m[1]) });
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

// [2026-11-18 Nguyễn Văn Thủy] đọc migration theo thứ tự: DROP TABLE / DROP TRIGGER ở migration sau gỡ trigger khỏi danh sách
// (bảng đã gom về lõi thì không còn trigger để LEDGER_TRIGGERS đòi); tạo lại thì giữ migration đầu tiên như cũ (đóng góp)
const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:\w+\.)?\w+(?:\s*,\s*(?:\w+\.)?\w+)*)/gi;
const DROP_TRG_RE = /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:(\w+)\.)?(\w+)/gi;
const tableName = (schema, table) => (!schema || schema === 'public' ? table : `${schema}.${table}`);
export function discoverTriggers(r) {
  const out = new Map();
  const first = new Map();
  for (const f of r.files({ under: ['db/migrations'], ext: ['.sql'] }).sort()) {
    const sqlText = (r.read(f) ?? '').replace(/--[^\n]*/g, '');
    const events = [
      ...[...sqlText.matchAll(TRG_RE)].map((m) => ({ at: m.index, kind: 'create', name: m[1], table: tableName(m[2], m[3]) })),
      ...[...sqlText.matchAll(DROP_TRG_RE)].map((m) => ({ at: m.index, kind: 'drop-trigger', name: m[1], table: tableName(m[2], m[3]) })),
      ...[...sqlText.matchAll(DROP_TABLE_RE)].flatMap((m) => m[1].split(',').map((t) => ({ at: m.index, kind: 'drop-table', table: t.trim().replace(/^public\./, '') }))),
    ].sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (e.kind === 'create') {
        if (out.has(e.name)) continue;
        if (!first.has(e.name)) first.set(e.name, f.replace(/^db\/migrations\//, ''));
        out.set(e.name, { name: e.name, table: e.table, migration: first.get(e.name) });
      } else if (e.kind === 'drop-trigger') {
        if (out.get(e.name)?.table === e.table) out.delete(e.name);
      } else {
        for (const [n, t] of out) if (t.table === e.table) out.delete(n);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const reCache = new Map();
const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\-]/g, (ch) => `\\${ch}`);
const globRe = (g) => { if (!reCache.has(g)) reCache.set(g, new RegExp(`^${g.split('*').map(escapeRe).join('.*')}$`)); return reCache.get(g); };
export function pillarsOf(map, code) {
  for (const row of map ?? []) for (const g of [].concat(row.match)) if (globRe(g).test(code)) return row.pillars;
  return null;
}

/** Phần sinh của cong-kiem.json. */
export function generate(r) {
  const { diag, finding } = discoverCodes(r);
  return { codes: { diag, finding }, tests: testsIndex(r, [...diag, ...finding]), ci: discoverCi(r), triggers: discoverTriggers(r) };
}
