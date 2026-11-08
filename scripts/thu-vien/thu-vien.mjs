// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032): phần dùng chung của thư viện bizcity_library@1 — băm nội dung, kiểm khuôn payload (tập con JSON Schema), kiểm cả thư viện (SC-LIB-1), đóng dấu phiên bản cho script sinh
// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a: kiểm basis[].key trỏ mã / bí danh có thật trong vn.can-cu-phap-ly (basisKeysOf)
/**
 * Chạy bằng node trần (không cần npm install, không build): SC-LIB-1 (tests/conformance/checks/library/) và các
 * libraries/<id>/build.mjs import tệp này. Bộ nạp / bộ kiểm lúc chạy của máy chủ ở packages/platform/src/core/libraries/
 * (TypeScript) — cùng thuật toán băm và tập con JSON Schema; test apps/api/test/thu-vien.test.ts so hai bên.
 *
 *   canonical(v)          JSON chuẩn hoá: khoá đối tượng sắp xếp, mảng giữ thứ tự
 *   hashItems(items)      'sha256:<hex>' của canonical(items)
 *   checkSchema(s, v)     lỗi của v theo tập con JSON Schema (§4.2 hợp đồng): [{ path, message }]
 *   lintLibrary(lib, o)   mọi lỗi khuôn của một thư viện: [{ key, message, code? }]
 *   stamp(lib, prev, o)   gán contentHash; nội dung đổi so với prev → lên phiên bản và thêm dòng changelog
 */
import crypto from 'node:crypto';

export const CONTRACT = 'bizcity_library@1';
export const ID_RE = /^(core|vn|authz|nghiep-vu|bao-cao|nhap|mau)\.[a-z0-9][a-z0-9-]{1,48}$/;
export const KINDS = ['param', 'calendar', 'code-list', 'permission-template', 'business-map', 'rule-set', 'report-list', 'import-template', 'master-sample'];
export const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HASH_RE = /^sha256:[0-9a-f]{64}$/;
export const OPS = ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing', 'matches'];
/** Tiền tố mã đã dùng ở bizcity_findings@1 — mã luật của thư viện không được lấy. */
export const RESERVED_PREFIXES = ['LIB', 'IN', 'ACC', 'PART', 'ITEM', 'ENTRY'];
/** Từ khoá JSON Schema bộ kiểm hiểu (hợp đồng §4.2). Ngoài tập này → báo, không âm thầm bỏ qua. */
export const SCHEMA_KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum', 'const', 'items', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'description', 'title']);

export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export const hashItems = (items) => `sha256:${crypto.createHash('sha256').update(canonical(items)).digest('hex')}`;

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeOk = (want, v) => {
  const t = typeOf(v);
  return (Array.isArray(want) ? want : [want]).some((w) => w === t || (w === 'number' && t === 'integer'));
};

/** Từ khoá lạ trong lược đồ (đệ quy). */
export function unknownKeywords(schema, path = '$') {
  const out = [];
  if (!schema || typeof schema !== 'object') return out;
  for (const k of Object.keys(schema)) if (!SCHEMA_KEYWORDS.has(k)) out.push(`${path}: từ khoá "${k}" ngoài tập con hỗ trợ`);
  for (const [k, s] of Object.entries(schema.properties ?? {})) out.push(...unknownKeywords(s, `${path}.properties.${k}`));
  if (schema.items) out.push(...unknownKeywords(schema.items, `${path}.items`));
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') out.push(...unknownKeywords(schema.additionalProperties, `${path}.additionalProperties`));
  return out;
}

/** Kiểm v theo tập con JSON Schema. Trả [{ path, message }] — rỗng là hợp lệ. */
export function checkSchema(schema, v, path = '') {
  const errs = [];
  const err = (message) => errs.push({ path: path || '$', message });
  if (!schema || typeof schema !== 'object') return errs;
  if (schema.const !== undefined && canonical(schema.const) !== canonical(v)) err(`phải bằng ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => canonical(e) === canonical(v))) err(`phải là một trong ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (schema.type && !typeOk(schema.type, v)) { err(`phải là ${[].concat(schema.type).join(' | ')}, nhận ${typeOf(v)}`); return errs; }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) err(`phải ≥ ${schema.minimum}`);
    if (schema.maximum !== undefined && v > schema.maximum) err(`phải ≤ ${schema.maximum}`);
  }
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && v.length < schema.minLength) err(`dài ít nhất ${schema.minLength} ký tự`);
    if (schema.maxLength !== undefined && v.length > schema.maxLength) err(`dài nhiều nhất ${schema.maxLength} ký tự`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) err(`không khớp mẫu ${schema.pattern}`);
    if (schema.format === 'date' && !(DATE_RE.test(v) && !Number.isNaN(Date.parse(v)))) err('phải là ngày YYYY-MM-DD');
  }
  if (Array.isArray(v) && schema.items) v.forEach((x, i) => errs.push(...checkSchema(schema.items, x, `${path}[${i}]`)));
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of schema.required ?? []) if (v[k] === undefined) errs.push({ path: path ? `${path}.${k}` : k, message: 'bắt buộc' });
    const props = schema.properties ?? {};
    for (const [k, x] of Object.entries(v)) {
      const sub = path ? `${path}.${k}` : k;
      if (props[k]) errs.push(...checkSchema(props[k], x, sub));
      else if (schema.additionalProperties === false) errs.push({ path: sub, message: 'trường không có trong itemSchema' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errs.push(...checkSchema(schema.additionalProperties, x, sub));
    }
  }
  return errs;
}

/** Khuôn giá trị theo payload.valueType (hợp đồng §4.2) khi itemSchema không khai properties.value. */
export const VALUE_SCHEMAS = {
  number: { type: 'number' }, integer: { type: 'integer' }, money: { type: 'number', minimum: 0 }, amount: { type: 'number', minimum: 0 },
  percent: { type: 'number', minimum: 0 }, boolean: { type: 'boolean' }, string: { type: 'string' }, date: { type: 'string', format: 'date' },
};
export const valueSchemaOf = (lib, item) => lib.itemSchema?.properties?.value ?? VALUE_SCHEMAS[item.payload?.valueType] ?? null;

function lintCondition(c, add, where) {
  if (!c || typeof c !== 'object') { add(`${where}: điều kiện rỗng`); return; }
  if (c.all || c.any) { const arr = c.all ?? c.any; if (!Array.isArray(arr) || !arr.length) add(`${where}: all / any phải là mảng không rỗng`); else arr.forEach((x, i) => lintCondition(x, add, `${where}.${c.all ? 'all' : 'any'}[${i}]`)); return; }
  if (c.not) { lintCondition(c.not, add, `${where}.not`); return; }
  if (typeof c.field !== 'string' || !/^(input|item)(\.[A-Za-z0-9_]+)+$/.test(c.field)) add(`${where}: field phải là input.<đường> hoặc item.<đường>`);
  if (!OPS.includes(c.op)) add(`${where}: op "${c.op}" không được phép (chỉ ${OPS.join(', ')})`);
  if (c.op === 'matches' && (typeof c.value !== 'string' || c.value.length > 200)) add(`${where}: matches cần biểu thức ≤ 200 ký tự`);
  if ((c.op === 'in' || c.op === 'nin') && !Array.isArray(c.value)) add(`${where}: ${c.op} cần mảng giá trị`);
}

/**
 * Mọi lỗi khuôn của một thư viện (SC-LIB-1 mục 1–6 của hợp đồng §11).
 * o: { dir (tên thư mục), hasReadme, previous (bản trên origin/main, nếu có), libraryIds (Set id mọi thư viện), prefixes (Map codePrefix → id), envelopeSchema,
 *      basisKeys (Set mã + bí danh của vn.can-cu-phap-ly — có thì kiểm basis[].key, S030-49a) }
 */
export function lintLibrary(lib, o = {}) {
  const out = [];
  const add = (message, key = message) => out.push({ key, message });
  if (!lib || typeof lib !== 'object') { add('library.json không phải đối tượng JSON', 'shape'); return out; }
  // 1. phong bì
  if (o.envelopeSchema) for (const e of checkSchema(o.envelopeSchema, lib)) if (!e.path.startsWith('items[')) add(`phong bì: ${e.path} ${e.message}`, `envelope:${e.path}`);
  if (lib.contract !== CONTRACT) add(`contract phải là ${CONTRACT}`, 'contract');
  if (!ID_RE.test(lib.id ?? '')) add(`id "${lib.id}" sai khuôn <miền>.<tên>`, 'id');
  if (o.dir && lib.id !== o.dir) add(`id "${lib.id}" khác tên thư mục libraries/${o.dir}`, 'id-dir');
  if (o.hasReadme === false) add('thiếu README.md (hướng dẫn bắt buộc, D-LIB-6)', 'readme');
  if (!Array.isArray(lib.sources) || !lib.sources.length) add('sources[] rỗng — mỗi thư viện khai nguồn (D-LIB-9)', 'sources');
  if (!SEMVER_RE.test(lib.version ?? '')) add(`version "${lib.version}" không phải semver`, 'version');
  const items = Array.isArray(lib.items) ? lib.items : [];
  if (!Array.isArray(lib.items)) add('items phải là mảng', 'items');
  // 2. mã
  const codes = new Map();
  for (const it of items) {
    if (codes.has(it.code)) add(`mã ${it.code} trùng`, `dup:${it.code}`);
    codes.set(it.code, it);
  }
  for (const it of items) {
    if (it.replacedBy !== undefined && !codes.has(it.replacedBy)) add(`${it.code}: replacedBy ${it.replacedBy} không có trong thư viện`, `replaced:${it.code}`);
    // vòng replacedBy
    const seen = new Set([it.code]);
    for (let cur = codes.get(it.replacedBy); cur; cur = codes.get(cur.replacedBy)) {
      if (seen.has(cur.code)) { add(`${it.code}: replacedBy tạo vòng`, `cycle:${it.code}`); break; }
      seen.add(cur.code);
    }
  }
  if (o.previous && Array.isArray(o.previous.items)) {
    for (const p of o.previous.items) if (!codes.has(p.code)) add(`mã ${p.code} có trên main nhưng mất khỏi items[] — không xoá mục, đổi status deprecated / removed (ECP-13)`, `lost:${p.code}`);
  }
  // 3. payload, effective
  for (const k of unknownKeywords(lib.itemSchema ?? {})) add(`itemSchema ${k}`, `schema-kw:${k}`);
  for (const it of items) {
    if (it.payload !== undefined) for (const e of checkSchema(lib.itemSchema, it.payload)) add(`${it.code}: payload.${e.path} ${e.message}`, `payload:${it.code}:${e.path}`);
    const eff = it.effective ?? [];
    const vs = valueSchemaOf(lib, it);
    eff.forEach((e, i) => {
      if (!DATE_RE.test(e.from ?? '')) add(`${it.code}: effective[${i}].from sai ngày`, `eff-date:${it.code}:${i}`);
      if (e.to !== null && !DATE_RE.test(e.to ?? '')) add(`${it.code}: effective[${i}].to phải là ngày hoặc null`, `eff-date:${it.code}:${i}`);
      if (e.to && e.from > e.to) add(`${it.code}: effective[${i}] from > to`, `eff-order:${it.code}:${i}`);
      if (i > 0) {
        const prev = eff[i - 1];
        if (prev.from > e.from) add(`${it.code}: effective[] phải sắp theo from`, `eff-sort:${it.code}`);
        if (prev.to === null || prev.to >= e.from) add(`${it.code}: effective[${i - 1}] và [${i}] chồng nhau`, `eff-overlap:${it.code}:${i}`);
      }
      if (vs) for (const x of checkSchema(vs, e.value)) add(`${it.code}: effective[${i}].value ${x.message}`, `eff-value:${it.code}:${i}`);
    });
  }
  // 4. băm, changelog
  const hash = hashItems(items);
  if (lib.contentHash !== hash) add(`contentHash lệch nội dung (đúng: ${hash}) — chạy script sinh hoặc stamp, và lên phiên bản`, 'hash');
  const top = lib.changelog?.[0];
  if (!top || top.version !== lib.version || top.hash !== lib.contentHash) add('changelog[0] phải có version = version và hash = contentHash của bản hiện hành', 'changelog');
  if (o.previous && o.previous.version === lib.version && o.previous.contentHash !== lib.contentHash) add(`nội dung đổi mà version vẫn ${lib.version} — lên phiên bản (D-LIB-3)`, 'bump');
  for (const c of lib.changelog ?? []) {
    const old = o.previous?.changelog?.find((p) => p.version === c.version);
    if (old && old.hash !== c.hash) add(`changelog ${c.version} đổi băm so với main — phiên bản đã phát hành không dùng lại`, `reuse:${c.version}`);
  }
  // 5. luật
  const rules = lib.rules ?? [];
  if (rules.length && !lib.codePrefix) add('có rules[] thì phải khai codePrefix', 'prefix');
  if (lib.codePrefix) {
    if (RESERVED_PREFIXES.includes(lib.codePrefix)) add(`codePrefix ${lib.codePrefix} đã dùng ở bizcity_findings@1`, 'prefix-reserved');
    const other = o.prefixes?.get(lib.codePrefix);
    if (other && other !== lib.id) add(`codePrefix ${lib.codePrefix} trùng thư viện ${other}`, 'prefix-dup');
  }
  const ruleCodes = new Set();
  for (const r of rules) {
    const re = new RegExp(`^${lib.codePrefix ?? '[A-Z]{2,8}'}-[A-Z]{2,12}-\\d{3}$`);
    if (!re.test(r.code ?? '')) add(`luật ${r.code}: mã phải là ${lib.codePrefix ?? '<codePrefix>'}-<NHÓM>-<NNN>`, `rule-code:${r.code}`);
    if (ruleCodes.has(r.code)) add(`luật ${r.code} trùng`, `rule-dup:${r.code}`);
    ruleCodes.add(r.code);
    if (!r.title || !r.why) add(`luật ${r.code}: thiếu title / why`, `rule-text:${r.code}`);
    if ((r.level === 'block' || r.level === 'warn') && !r.fix) add(`luật ${r.code}: mức ${r.level} phải có fix (R-GATE-2)`, `rule-fix:${r.code}`);
    lintCondition(r.when, (m) => add(`luật ${r.code}: ${m}`, `rule-when:${r.code}:${m.split(':')[0]}`), 'when');
    if (r.suggest?.fromLibrary && o.libraryIds && !o.libraryIds.has(r.suggest.fromLibrary)) add(`luật ${r.code}: suggest.fromLibrary ${r.suggest.fromLibrary} không tồn tại`, `rule-lib:${r.code}`);
  }
  // 7. căn cứ trỏ bằng mã (S030-49a): basis[].key phải là mã / bí danh của vn.can-cu-phap-ly
  if (o.basisKeys) {
    const check = (list, where) => {
      for (const b of list ?? []) if (b.key !== undefined && !o.basisKeys.has(b.key)) add(`${where}: căn cứ key "${b.key}" không có trong vn.can-cu-phap-ly (mã hoặc bí danh)`, `basis-key:${where}:${b.key}`);
    };
    for (const it of items) {
      check(it.basis, it.code);
      (it.effective ?? []).forEach((e, i) => check(e.basis, `${it.code}.effective[${i}]`));
    }
    for (const r of rules) check(r.basis, r.code);
  }
  return out;
}

/** Mã + bí danh của thư viện căn cứ (S030-49a) — tập khoá hợp lệ cho basis[].key. */
export const basisKeysOf = (lib) => new Set((lib?.items ?? []).flatMap((i) => [i.code, ...(i.aliases ?? [])]));

/**
 * Đóng dấu cho script sinh: tính contentHash; so với bản trước (prev — library.json đang có):
 *   nội dung không đổi → giữ version / changelog cũ;
 *   đổi → lên bump ('minor' mặc định) và thêm changelog { version, date, hash, notes }.
 */
export function stamp(lib, prev, { bump = 'minor', date, notes } = {}) {
  let version = lib.version ?? '1.0.0';
  if (prev?.version) {
    const [ma, mi, pa] = prev.version.split('.').map(Number);
    version = bump === 'major' ? `${ma + 1}.0.0` : bump === 'patch' ? `${ma}.${mi}.${pa + 1}` : `${ma}.${mi + 1}.0`;
  }
  // Mục không khai `since`: giữ since của bản trước, mục mới lấy phiên bản sắp phát hành.
  const prevSince = new Map((prev?.items ?? []).map((i) => [i.code, i.since]));
  const items = lib.items.map((i) => (i.since ? i : { code: i.code, name: i.name, ...i, since: prevSince.get(i.code) ?? version }));
  const hash = hashItems(items);
  if (prev && prev.contentHash === hash) return { ...lib, items, version: prev.version, released: prev.released, contentHash: hash, changelog: prev.changelog };
  const released = date ?? new Date().toISOString().slice(0, 10);
  return { ...lib, items, version, released, contentHash: hash, changelog: [{ version, date: released, hash, notes: notes ?? 'sinh lại từ nguồn' }, ...(prev?.changelog ?? [])] };
}

/** Thứ tự khoá cố định khi ghi library.json (dễ đọc diff). */
export function serialize(lib) {
  const order = ['contract', 'id', 'kind', 'title', 'description', 'version', 'released', 'contentHash', 'owner', 'sources', 'generatedBy', 'codePrefix', 'itemSchema', 'selector', 'rules', 'changelog', 'items'];
  const out = {};
  for (const k of order) if (lib[k] !== undefined) out[k] = lib[k];
  for (const k of Object.keys(lib)) if (!(k in out)) out[k] = lib[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}
