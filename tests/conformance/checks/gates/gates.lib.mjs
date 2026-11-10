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

export function discoverTriggers(r) {
  const out = new Map();
  for (const f of r.files({ under: ['db/migrations'], ext: ['.sql'] }).sort()) {
    for (const m of (r.read(f) ?? '').matchAll(TRG_RE)) {
      if (out.has(m[1])) continue;
      out.set(m[1], { name: m[1], table: !m[2] || m[2] === 'public' ? m[3] : `${m[2]}.${m[3]}`, migration: f.replace(/^db\/migrations\//, '') });
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
