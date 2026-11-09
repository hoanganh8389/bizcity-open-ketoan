// [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50 (B4, PHASE-030 · 26 §10.1): lệnh `bizcity library` — list / search / new / diff ngoại tuyến trên libraries/*, check bằng đúng bộ kiểm của Core (máy chủ → bản dựng platform → SKIP)
/**
 * Lệnh thư viện dùng chung (bizcity_library@1) cho developer và skill use-bizcity-library.
 *
 *   loadLibraries()                 libraries/<id>/library.json của gốc repo (BIZCITY_ROOT đổi gốc) + lỗi nạp (JSON hỏng, băm lệch)
 *   searchItems(libs, q, o)         mục khớp mã / tên / bí danh
 *   newLibrary(o)                   khung libraries/<id>/ (library.json đã đóng dấu, README.md) — qua lint ngay
 *   diffLibrary(id, o)              so với bản trên git (mặc định origin/main): thay đổi, bản cần lên, bản đã khai, lỗi khuôn
 *   checkInput(id, input, o)        core.library.validate trên máy chủ, hoặc engine trong packages/platform/dist, không có thì SKIP
 *
 * Luật khuôn / băm / đóng dấu lấy từ scripts/thu-vien/thu-vien.mjs (cùng nguồn với SC-LIB-1). CLI không giữ luật riêng.
 * Kết luận check: PASS (0) · FAIL (1, có chặn) · SKIP (2, chưa kiểm được — không bao giờ là PASS) · WARN (3, có cảnh báo).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './sources.mjs';

const LIB_DIR = path.join(ROOT, 'libraries');
const ENGINE = 'packages/platform/dist/core/libraries/index.js';
const BUILD_ENGINE = 'npm run build -w @bizcity/platform';

let toolP;
/** Phần dùng chung (băm, lint, đóng dấu) — đọc từ gốc repo đang dùng. */
const tool = () => (toolP ??= import(pathToFileURL(path.join(ROOT, 'scripts/thu-vien/thu-vien.mjs')).href));

export async function loadLibraries() {
  const { hashItems } = await tool();
  const libs = [];
  const errors = [];
  const dirs = existsSync(LIB_DIR) ? readdirSync(LIB_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const d of dirs) {
    const file = path.join(LIB_DIR, d, 'library.json');
    if (!existsSync(file)) continue;
    try {
      const lib = JSON.parse(readFileSync(file, 'utf8'));
      if (hashItems(lib.items) !== lib.contentHash) errors.push({ id: d, message: 'contentHash lệch nội dung — máy chủ không phục vụ thư viện này' });
      libs.push(lib);
    } catch (e) {
      errors.push({ id: d, message: `JSON hỏng: ${e.message}` });
    }
  }
  return { libs, errors };
}

export const envelopeOf = (lib) => ({
  id: lib.id, kind: lib.kind, title: lib.title, version: lib.version, released: lib.released, items: lib.items?.length ?? 0,
  active: (lib.items ?? []).filter((i) => i.status === 'active').length, verified: (lib.items ?? []).filter((i) => i.verified).length,
  rules: lib.rules?.length ?? 0, optional: lib.optional === true,
});

export function formatList({ libs, errors }) {
  const L = [`${libs.length} thư viện trong libraries/ (bizcity_library@1)`, ''];
  for (const e of libs.map(envelopeOf)) {
    L.push(`  ${e.id.padEnd(26)} ${e.kind.padEnd(20)} ${e.version.padEnd(8)} ${String(e.items).padStart(4)} mục · ${e.verified}/${e.items} đã đối chiếu${e.rules ? ` · ${e.rules} luật` : ''}${e.optional ? ' · tuỳ chọn' : ''}`);
    L.push(`  ${''.padEnd(26)} ${e.title}`);
  }
  for (const e of errors) L.push(`  ✘ ${e.id}: ${e.message}`);
  L.push('', 'Xem mục: npx bizcity library search <từ khoá> [--lib <id>] · kiểm giá trị: npx bizcity library check <id> <giá trị>');
  return L.join('\n');
}

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Mục khớp từ khoá (mã, tên, bí danh; không dấu). Mã khớp đúng xếp trước. */
export function searchItems(libs, q, { lib, limit = 30 } = {}) {
  const k = fold(q).trim();
  const hits = [];
  for (const l of libs) {
    if (lib && l.id !== lib) continue;
    for (const it of l.items ?? []) {
      const keys = [it.code, ...(it.aliases ?? [])].map(fold);
      const exact = keys.includes(k);
      if (!k || exact || keys.some((x) => x.includes(k)) || fold(it.name).includes(k)) hits.push({ library: l.id, version: l.version, exact, item: it });
    }
  }
  hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.library.localeCompare(b.library) || a.item.code.localeCompare(b.item.code));
  return { total: hits.length, hits: hits.slice(0, limit) };
}

const valueNow = (it, at) => (it.effective ?? []).find((e) => e.from <= at && (e.to === null || e.to >= at));

export function formatSearch(r, q, at = new Date().toISOString().slice(0, 10)) {
  if (!r.total) return `Không có mục nào khớp "${q}". Mã chưa có trong thư viện: đừng đoán — gửi đề xuất ở HT14 → Chi tiết → Đề xuất, hoặc mở PR sửa nguồn thư viện.`;
  const L = [`${r.total} mục khớp "${q}"${r.total > r.hits.length ? ` (hiện ${r.hits.length})` : ''}`, ''];
  for (const h of r.hits) {
    const it = h.item;
    const v = valueNow(it, at);
    const flags = [it.status !== 'active' ? it.status + (it.replacedBy ? ` → ${it.replacedBy}` : '') : null, it.verified ? null : 'chưa đối chiếu'].filter(Boolean);
    L.push(`  ${h.library} · ${it.code}${it.aliases?.length ? ` (${it.aliases.join(', ')})` : ''} — ${it.name}${flags.length ? `  [${flags.join('; ')}]` : ''}`);
    if (v) L.push(`      giá trị tại ${at}: ${JSON.stringify(v.value)} (từ ${v.from})`);
  }
  return L.join('\n');
}

const README_TPL = (o) => `# Thư viện \`${o.id}\` — ${o.title}

Khuôn: [\`bizcity_library@1\`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: \`${o.kind}\` · Người duyệt nội dung: ${o.owner}.

## Dùng làm gì

<!-- Mỗi mục là gì, mã đặt thế nào, màn / module nào dùng. -->

\`\`\`http
GET  /api/v1/libraries/${o.id}/items
POST /api/v1/libraries/${o.id}/validate  { "input": "<mã>" }
\`\`\`

## Trạng thái

**Chưa duyệt.** Mọi mục \`verified: false\` cho tới khi người duyệt đối chiếu với nguồn.

## Cập nhật

1. Sửa nguồn (tệp trong \`sources/\` hoặc \`build.mjs\`), không sửa tay \`library.json\` khi đã có \`generatedBy\`.
2. Mục đã phát hành không xoá: đặt \`deprecated\` / \`removed\` + \`replacedBy\` (ECP-13).
3. \`npx bizcity library diff ${o.id}\` — xem bản cần lên; \`node tests/conformance/selfcheck.mjs --only SC-LIB\` phải ĐẠT.

## Căn cứ

<!-- basis[].key trỏ mã / bí danh trong vn.can-cu-phap-ly. -->
`;

/**
 * Khung thư viện mới. Không ghi đè thư mục đã có. Trả { files, problems } — problems là lỗi lint của bản vừa sinh (phải rỗng).
 * @param {{id: string, kind: string, title: string, description?: string, owner?: string, source: string, sourceKind?: string, date?: string}} o
 */
export async function newLibrary(o) {
  const { ID_RE, KINDS, lintLibrary, serialize, stamp } = await tool();
  if (!ID_RE.test(o.id ?? '')) throw new Error(`id "${o.id}" sai khuôn <miền>.<tên> — miền: core | vn | authz | nghiep-vu | bao-cao | nhap | mau`);
  if (!KINDS.includes(o.kind)) throw new Error(`--kind phải là một trong: ${KINDS.join(', ')}`);
  if (!o.title?.trim()) throw new Error('cần --title "Tên thư viện"');
  if (!o.source?.trim()) throw new Error('cần --source "Tên nguồn" — mỗi thư viện khai nguồn (D-LIB-9); không có nguồn thì chưa lập thư viện');
  if (!['law', 'internal', 'reference'].includes(o.sourceKind ?? 'internal')) throw new Error('--source-kind phải là law | internal | reference');
  const dir = path.join(LIB_DIR, o.id);
  if (existsSync(dir)) throw new Error(`libraries/${o.id} đã có — sửa thư viện đó, không tạo trùng`);
  const date = o.date ?? new Date().toISOString().slice(0, 10);
  const owner = o.owner?.trim() || 'kế toán trưởng';
  const lib = stamp({
    contract: 'bizcity_library@1', id: o.id, kind: o.kind, title: o.title.trim(), description: o.description?.trim() || o.title.trim(),
    version: '1.0.0', owner, sources: [{ title: o.source.trim(), kind: o.sourceKind ?? 'internal', date }],
    itemSchema: { type: 'object', additionalProperties: true, properties: {} },
    selector: { value: 'code', label: '{code} · {name}', search: ['code', 'name'] },
    items: [],
  }, null, { date, notes: 'khởi tạo bằng npx bizcity library new' });
  const problems = lintLibrary(lib, { dir: o.id, hasReadme: true });
  if (problems.length) throw new Error(`khung sinh ra chưa qua lint: ${problems.map((p) => p.message).join('; ')}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'library.json'), serialize(lib));
  writeFileSync(path.join(dir, 'README.md'), README_TPL({ ...o, owner }));
  return { files: [`libraries/${o.id}/library.json`, `libraries/${o.id}/README.md`], library: envelopeOf(lib) };
}

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Thay đổi giữa hai bản và bậc tối thiểu phải lên (26 §10.1): major bỏ / đổi nghĩa, minor thêm, patch chỉ đổi chữ. */
export function classifyChanges(prev, cur) {
  const changes = [];
  const add = (bump, what) => changes.push({ bump, what });
  if (!prev) return { changes: [{ bump: 'minor', what: 'thư viện mới' }], needed: 'minor', isNew: true };
  if (!same(prev.itemSchema, cur.itemSchema)) add('major', 'itemSchema đổi — khuôn payload đổi nghĩa');
  if (prev.kind !== cur.kind) add('major', `kind đổi ${prev.kind} → ${cur.kind}`);
  const before = new Map((prev.items ?? []).map((i) => [i.code, i]));
  const after = new Map((cur.items ?? []).map((i) => [i.code, i]));
  for (const [code, p] of before) {
    const c = after.get(code);
    if (!c) { add('major', `${code}: mất khỏi items[] (không được xoá mục — ECP-13)`); continue; }
    if (p.status !== c.status) add(c.status === 'removed' ? 'major' : 'minor', `${code}: trạng thái ${p.status} → ${c.status}${c.replacedBy ? ` (thay bằng ${c.replacedBy})` : ''}`);
    if (!same(p.payload, c.payload)) add('major', `${code}: payload đổi`);
    const lost = (p.aliases ?? []).filter((a) => !(c.aliases ?? []).includes(a));
    if (lost.length) add('major', `${code}: bỏ bí danh ${lost.join(', ')} — ô nhập đang dùng bí danh sẽ thành mã lạ`);
    if ((c.aliases ?? []).some((a) => !(p.aliases ?? []).includes(a))) add('minor', `${code}: thêm bí danh`);
    const pe = p.effective ?? [];
    const ce = c.effective ?? [];
    pe.forEach((e, i) => {
      const m = ce.find((x) => x.from === e.from);
      if (!m) add('major', `${code}: bỏ khoảng hiệu lực từ ${e.from}`);
      else if (!same(m.value, e.value)) add('major', `${code}: giá trị từ ${e.from} đổi ${JSON.stringify(e.value)} → ${JSON.stringify(m.value)}`);
      else if (m.to !== e.to) add(e.to === null ? 'minor' : 'major', `${code}: khoảng từ ${e.from} đổi ngày kết thúc ${e.to ?? '—'} → ${m.to ?? '—'}`);
      else if (!same(m.basis, e.basis) || m.note !== e.note) add('patch', `${code}: căn cứ / ghi chú khoảng từ ${e.from}`);
      void i;
    });
    for (const e of ce) if (!pe.some((x) => x.from === e.from)) add('minor', `${code}: thêm giá trị từ ${e.from}`);
    if (p.name !== c.name || !same(p.hints, c.hints) || !same(p.basis, c.basis) || p.verified !== c.verified || p.group !== c.group || p.confidence !== c.confidence) {
      add('patch', `${code}: đổi chữ / gợi ý / căn cứ / đối chiếu`);
    }
  }
  for (const code of after.keys()) if (!before.has(code)) add('minor', `${code}: mục mới`);
  const pr = new Map((prev.rules ?? []).map((r) => [r.code, r]));
  const cr = new Map((cur.rules ?? []).map((r) => [r.code, r]));
  const LV = { info: 0, warn: 1, block: 2 };
  for (const [code, p] of pr) {
    const c = cr.get(code);
    if (!c) add('major', `luật ${code}: bỏ`);
    else if (!same(p.when, c.when) || LV[c.level] > LV[p.level]) add('major', `luật ${code}: đổi điều kiện / nâng mức`);
    else if (c.level !== p.level) add('minor', `luật ${code}: hạ mức ${p.level} → ${c.level}`);
    else if (!same(p, c)) add('patch', `luật ${code}: đổi chữ / gợi ý`);
  }
  for (const code of cr.keys()) if (!pr.has(code)) add('minor', `luật ${code}: mới`);
  for (const k of ['title', 'description', 'owner', 'sources', 'selector']) if (!same(prev[k], cur[k])) add('patch', `phong bì: ${k}`);
  const needed = changes.reduce((m, c) => (RANK[c.bump] > RANK[m] ? c.bump : m), 'none');
  return { changes, needed, isNew: false };
}

export function bumpOf(from, to) {
  if (!from) return 'minor';
  const [a, b] = [from, to].map((v) => v.split('.').map(Number));
  if (b[0] !== a[0]) return b[0] > a[0] ? 'major' : 'lùi';
  if (b[1] !== a[1]) return b[1] > a[1] ? 'minor' : 'lùi';
  if (b[2] !== a[2]) return b[2] > a[2] ? 'patch' : 'lùi';
  return 'none';
}

/** library.json ở một bản git, hoặc null (thư viện mới / không phải repo git). */
function atRef(ref, id) {
  try {
    return JSON.parse(execFileSync('git', ['-C', ROOT, 'show', `${ref}:libraries/${id}/library.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null;
  }
}

/**
 * So thư viện đang sửa với bản ở `base` (mặc định origin/main). Kết luận PASS khi bản đã khai ≥ bản cần lên và lint sạch.
 * @param {string} id
 * @param {{base?: string}} o
 */
export async function diffLibrary(id, { base = 'origin/main' } = {}) {
  const { basisKeysOf, lintLibrary } = await tool();
  const file = path.join(LIB_DIR, id, 'library.json');
  if (!existsSync(file)) throw new Error(`không có libraries/${id}/library.json`);
  const cur = JSON.parse(readFileSync(file, 'utf8'));
  const prev = atRef(base, id);
  const { libs } = await loadLibraries();
  const basis = libs.find((l) => l.id === 'vn.can-cu-phap-ly');
  const prefixes = new Map(libs.filter((l) => l.codePrefix).map((l) => [l.codePrefix, l.id]));
  const problems = lintLibrary(cur, {
    dir: id, hasReadme: existsSync(path.join(LIB_DIR, id, 'README.md')), previous: prev, libraryIds: new Set(libs.map((l) => l.id)), prefixes,
    basisKeys: basis ? basisKeysOf(basis) : undefined,
  });
  const { changes, needed, isNew } = classifyChanges(prev, cur);
  const declared = isNew ? 'minor' : bumpOf(prev.version, cur.version);
  const short = declared === 'lùi' || RANK[declared] < RANK[needed];
  const verdict = problems.length || short ? 'FAIL' : 'PASS';
  return { id, base, from: prev?.version ?? null, to: cur.version, isNew, changes, needed, declared, short, problems, verdict };
}

export function formatDiff(r) {
  const L = [`libraries/${r.id}: ${r.isNew ? `thư viện mới (chưa có trên ${r.base})` : `${r.from} (${r.base}) → ${r.to}`}`, ''];
  if (!r.changes.length) L.push('  không có thay đổi');
  for (const c of r.changes) L.push(`  [${c.bump.padEnd(5)}] ${c.what}`);
  L.push('', `  bản cần lên tối thiểu: ${r.needed} · bản đã khai: ${r.declared}${r.short ? '  ✘ chưa đủ — lên phiên bản (D-LIB-3), chạy lại script sinh hoặc stamp()' : ''}`);
  if (r.problems.length) {
    L.push('', `  ${r.problems.length} lỗi khuôn (cùng luật SC-LIB-1):`);
    for (const p of r.problems.slice(0, 40)) L.push(`    ✘ ${p.message}`);
  }
  L.push('', `KẾT LUẬN: ${r.verdict}`);
  return L.join('\n');
}

/** Ô nhập từ dòng lệnh: chuỗi thường là mã; bắt đầu bằng { hoặc [ là JSON; @tệp đọc JSON trong tệp. Mảng → nhiều ô. */
export function parseInput(raw) {
  if (raw === undefined) throw new Error('cần giá trị cần kiểm');
  let v = raw;
  if (raw.startsWith('@')) v = JSON.parse(readFileSync(path.resolve(raw.slice(1)), 'utf8'));
  else if (/^\s*[[{]/.test(raw)) v = JSON.parse(raw);
  return Array.isArray(v) ? { inputs: v } : { input: v };
}

const verdictOf = (results) => {
  const f = results.flatMap((r) => r.findings ?? []);
  return f.some((x) => x.level === 'block') ? 'FAIL' : f.some((x) => x.level === 'warn') ? 'WARN' : 'PASS';
};

/**
 * Kiểm một / nhiều ô theo thư viện. Thứ tự: máy chủ (core.library.validate, có cấu hình đơn vị) → bản dựng engine của platform → SKIP.
 * @param {string} id
 * @param {{input?: unknown, inputs?: unknown[]}} payload
 * @param {{server?: string, key?: string, at?: string, source?: string, fetchImpl?: typeof fetch}} o
 */
export async function checkInput(id, payload, { server, key, at, source = 'cli', fetchImpl = globalThis.fetch } = {}) {
  if (server && key) {
    let res;
    try {
      res = await fetchImpl(`${server.replace(/\/$/, '')}/api/v1/libraries/${encodeURIComponent(id)}/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': key }, body: JSON.stringify({ ...payload, ...(at ? { at } : {}), source }),
      });
    } catch (e) {
      return { verdict: 'SKIP', via: 'server', reason: `không gọi được ${server}: ${e.message}`, results: [] };
    }
    const json = await res.json().catch(() => null);
    if (!json?.ok) {
      const e = json?.error ?? { code: `HTTP_${res.status}`, message: 'phản hồi không đúng khuôn { ok, data | error }' };
      // 404 = thư viện không có / đơn vị đã tắt; 400 = ô nhập sai khuôn — đều là FAIL có lý do, không phải SKIP.
      if (res.status === 401 || res.status === 403) return { verdict: 'SKIP', via: 'server', reason: `${e.code}: ${e.message} — kiểm lại BIZCITY_API_KEY`, results: [] };
      return { verdict: 'FAIL', via: 'server', reason: `${e.code}: ${e.message}`, results: [] };
    }
    const results = json.data.results;
    return { verdict: verdictOf(results), via: 'server', results };
  }
  const file = path.join(ROOT, ENGINE);
  if (!existsSync(file)) {
    return { verdict: 'SKIP', via: null, reason: `không có máy chủ (BIZCITY_SERVER + BIZCITY_API_KEY) và chưa dựng ${ENGINE} — chạy ${BUILD_ENGINE}, hoặc trỏ máy chủ`, results: [] };
  }
  const { validateInLibrary } = await import(pathToFileURL(file).href);
  const list = payload.inputs ?? [payload.input];
  const results = [];
  for (const x of list) {
    const r = validateInLibrary(id, x, { at });
    if (!r) return { verdict: 'FAIL', via: 'engine', reason: `không có thư viện ${id} (hoặc băm lệch nên không nạp) — xem npx bizcity library list`, results: [] };
    results.push(r);
  }
  return { verdict: verdictOf(results), via: 'engine', note: 'bộ kiểm bản dựng: không có cấu hình riêng của đơn vị (ghi đè, hạ mức) — cần thì kiểm qua máy chủ', results };
}

export function formatCheck(r, id) {
  const L = [`library check ${id}${r.via ? ` — qua ${r.via === 'server' ? 'máy chủ (core.library.validate)' : 'bản dựng engine của platform'}` : ''}`, ''];
  if (r.reason) L.push(`  ${r.reason}`);
  if (r.note) L.push(`  (${r.note})`);
  r.results.forEach((x, i) => {
    const head = `${r.results.length > 1 ? `#${i + 1} ` : ''}${x.library.id}@${x.library.version} tại ${x.at}`;
    L.push(`  ${head}${x.resolved ? ` · mã chuẩn ${x.resolved}` : ''}${x.value !== undefined ? ` · giá trị ${JSON.stringify(x.value)}${x.valueSource === 'tenant' ? ' (đơn vị ghi đè)' : ''}` : ''}`);
    if (!x.findings.length) L.push('    ✔ không có phát hiện');
    for (const f of x.findings) {
      L.push(`    ${f.level === 'block' ? '✘' : f.level === 'warn' ? '!' : 'i'} ${f.code} [${f.level}] ${f.path}: ${f.message}`);
      for (const s of f.suggestions ?? []) L.push(`        gợi ý: ${JSON.stringify(s.value)} — ${s.label} (${s.why}; tin cậy ${s.confidence})`);
    }
  });
  L.push('', `KẾT LUẬN: ${r.verdict}${r.verdict === 'SKIP' ? ' — chưa kiểm được; SKIP không phải PASS' : ''}`);
  L.push('Nghĩa một mã: npx bizcity explain <MÃ>');
  return L.join('\n');
}

export const EXIT = { PASS: 0, FAIL: 1, SKIP: 2, WARN: 3 };
