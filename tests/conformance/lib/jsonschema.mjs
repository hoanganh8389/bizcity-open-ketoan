/**
 * Bộ kiểm JSON Schema 2020-12 rút gọn, không phụ thuộc gói ngoài (bộ kiểm phải chạy được khi chưa `npm install`).
 * Hỗ trợ đúng tập từ khoá các tệp docs/contracts/*.schema.json đang dùng; từ khoá lạ bị `lintSchema` báo,
 * để không ai viết schema mà bộ kiểm im lặng bỏ qua.
 */

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'format']);
const KEYWORDS = new Set([
  '$ref', '$defs', 'type', 'enum', 'const',
  'properties', 'required', 'additionalProperties', 'patternProperties', 'propertyNames', 'minProperties', 'maxProperties',
  'items', 'minItems', 'maxItems', 'uniqueItems', 'contains',
  'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
]);
const SUBSCHEMA_MAPS = ['properties', 'patternProperties', '$defs'];
const SUBSCHEMA_ONE = ['additionalProperties', 'propertyNames', 'items', 'contains', 'not', 'if', 'then', 'else'];
const SUBSCHEMA_LIST = ['allOf', 'anyOf', 'oneOf'];

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeMatches = (want, v) => {
  const t = typeOf(v);
  return want === t || (want === 'number' && t === 'integer');
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ptr = (p) => p || '/';

function resolveRef(root, ref) {
  if (!ref.startsWith('#')) throw new Error(`$ref ngoài tệp chưa hỗ trợ: ${ref}`);
  let node = root;
  for (const part of ref.slice(1).split('/').filter(Boolean)) {
    node = node?.[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
  }
  if (node === undefined) throw new Error(`$ref không tới được: ${ref}`);
  return node;
}

/** validate(schema, data) → [] khi hợp lệ, hoặc danh sách { path, keyword, message }. */
export function validate(schema, data) {
  const errors = [];
  check(schema, data, '', schema, errors);
  return errors;
}

function check(s, v, at, root, errors) {
  if (s === true) return;
  if (s === false) { errors.push({ path: ptr(at), keyword: 'false', message: 'không cho phép giá trị ở đây' }); return; }
  const err = (keyword, message) => errors.push({ path: ptr(at), keyword, message });

  if (s.$ref) check(resolveRef(root, s.$ref), v, at, root, errors);

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(t, v))) { err('type', `phải là ${types.join(' | ')}, đang là ${typeOf(v)}`); return; }
  }
  if (s.enum && !s.enum.some((e) => eq(e, v))) err('enum', `phải thuộc ${JSON.stringify(s.enum)}`);
  if ('const' in s && !eq(s.const, v)) err('const', `phải bằng ${JSON.stringify(s.const)}`);

  if (typeof v === 'string') {
    const len = [...v].length;
    if (s.minLength !== undefined && len < s.minLength) err('minLength', `ít nhất ${s.minLength} ký tự`);
    if (s.maxLength !== undefined && len > s.maxLength) err('maxLength', `tối đa ${s.maxLength} ký tự`);
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) err('pattern', `không khớp mẫu ${s.pattern}`);
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) err('minimum', `≥ ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) err('maximum', `≤ ${s.maximum}`);
    if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) err('exclusiveMinimum', `> ${s.exclusiveMinimum}`);
    if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) err('exclusiveMaximum', `< ${s.exclusiveMaximum}`);
    if (s.multipleOf !== undefined && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) err('multipleOf', `bội số của ${s.multipleOf}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) err('minItems', `ít nhất ${s.minItems} phần tử`);
    if (s.maxItems !== undefined && v.length > s.maxItems) err('maxItems', `tối đa ${s.maxItems} phần tử`);
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) err('uniqueItems', 'có phần tử trùng');
    if (s.items !== undefined) v.forEach((x, i) => check(s.items, x, `${at}/${i}`, root, errors));
    if (s.contains !== undefined && !v.some((x) => sub$ok(s.contains, x, root))) err('contains', 'không phần tử nào khớp');
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (s.required) for (const k of s.required) if (!(k in v)) errors.push({ path: ptr(`${at}/${k}`), keyword: 'required', message: 'thiếu trường bắt buộc' });
    if (s.minProperties !== undefined && keys.length < s.minProperties) err('minProperties', `ít nhất ${s.minProperties} khoá`);
    if (s.maxProperties !== undefined && keys.length > s.maxProperties) err('maxProperties', `tối đa ${s.maxProperties} khoá`);
    for (const k of keys) {
      let known = false;
      if (s.properties && k in s.properties) { known = true; check(s.properties[k], v[k], `${at}/${k}`, root, errors); }
      if (s.patternProperties) for (const [p, ps] of Object.entries(s.patternProperties)) {
        if (new RegExp(p, 'u').test(k)) { known = true; check(ps, v[k], `${at}/${k}`, root, errors); }
      }
      if (!known && s.additionalProperties !== undefined) {
        if (s.additionalProperties === false) errors.push({ path: ptr(`${at}/${k}`), keyword: 'additionalProperties', message: 'trường không được khai trong schema' });
        else check(s.additionalProperties, v[k], `${at}/${k}`, root, errors);
      }
      if (s.propertyNames) check(s.propertyNames, k, `${at}/${k}`, root, errors);
    }
  }

  if (s.allOf) for (const sub of s.allOf) check(sub, v, at, root, errors);
  if (s.anyOf && !s.anyOf.some((sub) => sub$ok(sub, v, root))) err('anyOf', 'không khớp nhánh nào');
  if (s.oneOf) {
    const results = s.oneOf.map((sub) => sub$errors(sub, v, root));
    const hits = results.filter((r) => r.length === 0).length;
    if (hits !== 1) {
      // Báo lỗi của nhánh gần đúng nhất để người đọc biết sửa gì, thay vì "không khớp oneOf" trống trơn.
      const best = results.reduce((a, b) => (b.length < a.length ? b : a));
      err('oneOf', hits === 0 ? `không khớp nhánh nào (nhánh gần nhất lỗi: ${best.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')})` : `khớp ${hits} nhánh, phải đúng 1`);
    }
  }
  if (s.not && sub$ok(s.not, v, root)) err('not', 'khớp điều kiện bị cấm');
  if (s.if !== undefined) {
    if (sub$ok(s.if, v, root)) { if (s.then !== undefined) check(s.then, v, at, root, errors); }
    else if (s.else !== undefined) check(s.else, v, at, root, errors);
  }

  function sub$errors(sub, val, r) { const e = []; check(sub, val, at, r, e); return e; }
  function sub$ok(sub, val, r) { return sub$errors(sub, val, r).length === 0; }
}

/** Kiểm chính schema: từ khoá lạ, $ref gãy, mẫu regex sai. Trả danh sách chuỗi lỗi. */
export function lintSchema(schema) {
  const problems = [];
  const walk = (s, at) => {
    if (typeof s === 'boolean') return;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { problems.push(`${ptr(at)}: schema con phải là object hoặc boolean`); return; }
    for (const k of Object.keys(s)) {
      if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) problems.push(`${ptr(at)}: từ khoá "${k}" bộ kiểm không hỗ trợ`);
    }
    if (s.$ref) { try { resolveRef(schema, s.$ref); } catch (e) { problems.push(`${ptr(at)}: ${e.message}`); } }
    if (s.pattern) { try { new RegExp(s.pattern, 'u'); } catch (e) { problems.push(`${ptr(at)}: pattern sai — ${e.message}`); } }
    for (const k of SUBSCHEMA_MAPS) if (s[k]) for (const [n, sub] of Object.entries(s[k])) {
      if (k === 'patternProperties') { try { new RegExp(n, 'u'); } catch (e) { problems.push(`${ptr(at)}/${k}: khoá regex sai ${n}`); } }
      walk(sub, `${at}/${k}/${n}`);
    }
    for (const k of SUBSCHEMA_ONE) if (s[k] !== undefined) walk(s[k], `${at}/${k}`);
    for (const k of SUBSCHEMA_LIST) if (s[k]) s[k].forEach((sub, i) => walk(sub, `${at}/${k}/${i}`));
  };
  walk(schema, '');
  return problems;
}
