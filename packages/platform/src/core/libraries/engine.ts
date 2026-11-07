// @bizcity-layer P bizcity.config
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-3 / D-LIB-4 / D-LIB-7): bộ kiểm thuần của bizcity_library@1 — băm nội dung, tập con JSON Schema, đọc giá trị tại ngày, bảy kiểm chuẩn LIB-* có gợi ý, luật khai báo, dòng ô chọn
/**
 * Thuần: không đọc tệp, không CSDL. Cùng thuật toán băm và tập con JSON Schema với scripts/thu-vien/thu-vien.mjs (bộ kiểm SC-LIB-1
 * chạy không cần build); test apps/api/test/thu-vien.test.ts so hai bên.
 *
 *   validateAgainstLibrary(lib, input, { at, lookup })   kết quả §6.3 hợp đồng: findings[] + suggestions[], Core chỉ gợi ý (ADR-0020)
 *   selectorRows(lib, { q, at, group, status, limit })    dòng ô chọn §9
 */
import crypto from 'node:crypto';
import type {
  Condition, JsonSchema, Library, LibraryFinding, LibraryInput, LibraryItem, LibraryRule, SelectorRow, Suggestion, ValidateResult,
} from './types.js';

export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export const hashItems = (items: unknown): string => `sha256:${crypto.createHash('sha256').update(canonical(items)).digest('hex')}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/** Lỗi của v theo tập con JSON Schema: [{ path, message }]. */
export function checkSchema(schema: JsonSchema | undefined, v: unknown, path = ''): { path: string; message: string }[] {
  const errs: { path: string; message: string }[] = [];
  const err = (message: string) => errs.push({ path: path || '$', message });
  if (!schema) return errs;
  if (schema.const !== undefined && canonical(schema.const) !== canonical(v)) err(`phải bằng ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => canonical(e) === canonical(v))) err(`phải là một trong ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (schema.type) {
    const want = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(v);
    if (!want.some((w) => w === t || (w === 'number' && t === 'integer'))) { err(`phải là ${want.join(' | ')}, nhận ${t}`); return errs; }
  }
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
    const o = v as Record<string, unknown>;
    for (const k of schema.required ?? []) if (o[k] === undefined) errs.push({ path: path ? `${path}.${k}` : k, message: 'bắt buộc' });
    const props = schema.properties ?? {};
    for (const [k, x] of Object.entries(o)) {
      const sub = path ? `${path}.${k}` : k;
      if (props[k]) errs.push(...checkSchema(props[k], x, sub));
      else if (schema.additionalProperties === false) errs.push({ path: sub, message: 'trường không có trong itemSchema' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errs.push(...checkSchema(schema.additionalProperties, x, sub));
    }
  }
  return errs;
}

/** Khuôn giá trị theo payload.valueType khi itemSchema không khai properties.value (hợp đồng §4.2). */
const VALUE_SCHEMAS: Record<string, JsonSchema> = {
  number: { type: 'number' }, integer: { type: 'integer' }, money: { type: 'number', minimum: 0 }, amount: { type: 'number', minimum: 0 },
  percent: { type: 'number', minimum: 0 }, boolean: { type: 'boolean' }, string: { type: 'string' }, date: { type: 'string', format: 'date' },
};
export const valueSchemaOf = (lib: Library, item: LibraryItem): JsonSchema | undefined =>
  lib.itemSchema.properties?.value ?? VALUE_SCHEMAS[String(item.payload?.valueType ?? '')];

/** Khoảng hiệu lực tại ngày (from ≤ at ≤ to). */
export function effectiveAt(item: LibraryItem, at: string) {
  return item.effective?.find((e) => e.from <= at && (e.to === null || at <= e.to));
}

/** Đọc trường theo đường `a.b.c`. */
export function pick(o: unknown, dotted: string): unknown {
  let cur: unknown = o;
  for (const k of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Bỏ dấu, chữ thường — tìm không phân biệt dấu. */
export const fold = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  // Một hàng trước + hàng hiện tại (Levenshtein).
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length] ?? 99;
}

const searchTexts = (lib: Library, item: LibraryItem): string[] =>
  lib.selector.search.flatMap((f) => { const v = pick(item, f); return Array.isArray(v) ? v.map(fold) : [fold(v)]; }).filter(Boolean);

/** Độ khớp 0..1 của câu tìm với một mục (0 = không khớp). */
function score(lib: Library, item: LibraryItem, q: string): number {
  const fq = fold(q).trim();
  if (!fq) return 0.5;
  let best = 0;
  for (const t of searchTexts(lib, item)) {
    if (t === fq) return 1;
    if (t.startsWith(fq)) best = Math.max(best, 0.9);
    else if (t.includes(fq)) best = Math.max(best, 0.7);
    else if (fq.includes(t) && t.length >= 3) best = Math.max(best, 0.5);
    else if (editDistance(t, fq) <= 2) best = Math.max(best, 0.6);
  }
  return best;
}

/** Nhãn ô chọn theo mẫu `{code} · {name}`. */
export const renderLabel = (template: string, item: LibraryItem): string => template.replace(/\{([A-Za-z0-9_.]+)\}/g, (_, k: string) => String(pick(item, k) ?? ''));

const fmt = (v: unknown): string => (typeof v === 'number' ? v.toLocaleString('vi-VN') : JSON.stringify(v));
const rangeText = (e: { from: string; to: string | null }) => `${e.from} → ${e.to ?? 'nay'}`;
const basisText = (b?: { ref: string; verified: boolean }[]) => (b?.length ? b.map((x) => `${x.ref}${x.verified ? '' : ' (chưa duyệt)'}`).join('; ') : 'theo thư viện');

/** Mục gần câu tìm nhất (chỉ active), tối đa n. */
export function nearest(lib: Library, q: string, n = 5): LibraryItem[] {
  return lib.items.filter((i) => i.status === 'active').map((i) => ({ i, s: score(lib, i, q) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i.code.localeCompare(b.i.code)).slice(0, n).map((x) => x.i);
}

function evalCondition(c: Condition, ctx: { input: unknown; item: unknown }): boolean {
  if ('all' in c) return c.all.every((x) => evalCondition(x, ctx));
  if ('any' in c) return c.any.some((x) => evalCondition(x, ctx));
  if ('not' in c) return !evalCondition(c.not, ctx);
  const v = pick(ctx, c.field);
  const w = c.value;
  switch (c.op) {
    case 'eq': return canonical(v) === canonical(w);
    case 'ne': return canonical(v) !== canonical(w);
    case 'in': return Array.isArray(w) && w.some((x) => canonical(x) === canonical(v));
    case 'nin': return Array.isArray(w) && !w.some((x) => canonical(x) === canonical(v));
    case 'gt': return typeof v === 'number' && typeof w === 'number' && v > w;
    case 'gte': return typeof v === 'number' && typeof w === 'number' && v >= w;
    case 'lt': return typeof v === 'number' && typeof w === 'number' && v < w;
    case 'lte': return typeof v === 'number' && typeof w === 'number' && v <= w;
    case 'exists': return v !== undefined && v !== null && v !== '';
    case 'missing': return v === undefined || v === null || v === '';
    case 'matches': return typeof v === 'string' && typeof w === 'string' && w.length <= 200 && new RegExp(w, 'u').test(v);
    default: return false;
  }
}

function itemSuggestion(lib: Library, item: LibraryItem, why: string, confidence: Suggestion['confidence']): Suggestion {
  return { value: pick(item, lib.selector.value), label: renderLabel(lib.selector.label, item), why, confidence };
}

function ruleSuggestions(rule: LibraryRule, lib: Library, item: LibraryItem, at: string, lookup?: (id: string) => Library | undefined): Suggestion[] {
  const s = rule.suggest;
  if (!s) return [];
  if ('value' in s) return [{ value: s.value, label: fmt(s.value), why: rule.fix ?? rule.title, confidence: 'vua' }];
  if ('field' in s) { const v = pick({ item }, s.field); return v === undefined ? [] : [{ value: v, label: fmt(v), why: rule.fix ?? rule.title, confidence: 'vua' }]; }
  const other = lookup?.(s.fromLibrary);
  if (!other) return [];
  return other.items
    .filter((i) => i.status === 'active' && Object.entries(s.filter ?? {}).every(([k, v]) => canonical(pick(i, k)) === canonical(v)))
    .filter((i) => !i.effective?.length || effectiveAt(i, at))
    .slice(0, 5).map((i) => itemSuggestion(other, i, `từ thư viện ${other.id}`, 'vua'));
}

/** Bảy kiểm chuẩn + luật khai báo của thư viện (hợp đồng §6). Không ghi gì; Core chỉ gợi ý. */
export function validateAgainstLibrary(lib: Library, raw: LibraryInput, opts: { at?: string; lookup?: (id: string) => Library | undefined } = {}): ValidateResult {
  const at = opts.at ?? new Date().toISOString().slice(0, 10);
  const input: Record<string, unknown> = typeof raw === 'string' ? { code: raw } : { ...raw };
  const findings: LibraryFinding[] = [];
  const extra: { resolved?: string; value?: unknown } = {};
  const out = (): ValidateResult => ({ ok: !findings.some((f) => f.level === 'block'), library: { id: lib.id, version: lib.version, hash: lib.contentHash }, at, findings, ...extra });
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!code) {
    findings.push({ code: 'LIB-SCHEMA-001', level: 'block', path: 'code', message: 'thiếu mã', suggestions: [] });
    return out();
  }
  // 1. mã (cả bí danh, không phân biệt hoa thường)
  const fc = fold(code);
  const item = lib.items.find((i) => i.code === code)
    ?? lib.items.find((i) => fold(i.code) === fc || (i.aliases ?? []).some((a) => fold(a) === fc));
  if (!item) {
    findings.push({
      code: 'LIB-UNKNOWN-001', level: 'block', path: 'code', got: code, message: `"${code}" không có trong ${lib.id}`,
      suggestions: nearest(lib, code).map((i) => itemSuggestion(lib, i, 'gần nhất theo mã / tên', 'thap')),
    });
    return out();
  }
  if (item.code !== code) extra.resolved = item.code;
  // 2. trạng thái
  const replaced = item.replacedBy ? lib.items.find((i) => i.code === item.replacedBy) : undefined;
  const replacedSuggestion = replaced ? [itemSuggestion(lib, replaced, 'mã thay thế (replacedBy)', 'cao' as const)] : [];
  if (item.status === 'deprecated') findings.push({ code: 'LIB-DEPRECATED-001', level: 'warn', path: 'code', got: item.code, message: `${item.code} đã ngừng dùng`, suggestions: replacedSuggestion });
  if (item.status === 'removed') findings.push({ code: 'LIB-REMOVED-001', level: 'block', path: 'code', got: item.code, message: `${item.code} đã bỏ`, suggestions: replacedSuggestion });
  // 3. hiệu lực + giá trị
  if (item.effective?.length) {
    const e = effectiveAt(item, at);
    if (!e) {
      const near = [...item.effective].sort((a, b) => Math.abs(Date.parse(a.from) - Date.parse(at)) - Math.abs(Date.parse(b.from) - Date.parse(at)))[0];
      findings.push({
        code: 'LIB-EFFECTIVE-001', level: 'block', path: 'at', got: at, message: `${item.code} không có giá trị tại ${at}`,
        suggestions: near ? [{ value: near.value, label: `${fmt(near.value)} (${rangeText(near)})`, why: basisText(near.basis), confidence: 'thap' }] : [],
      });
    } else {
      extra.value = e.value;
      if (input.value !== undefined) {
        const vs = valueSchemaOf(lib, item);
        const bad = vs ? checkSchema(vs, input.value, 'value') : [];
        for (const x of bad) findings.push({ code: 'LIB-SCHEMA-001', level: 'block', path: x.path, got: input.value, message: x.message, suggestions: [{ value: e.value, label: fmt(e.value), why: basisText(e.basis), confidence: 'vua' }] });
        if (!bad.length && canonical(input.value) !== canonical(e.value)) {
          findings.push({
            code: 'LIB-VALUE-001', level: 'warn', path: 'value', got: input.value, expected: e.value, message: `giá trị khác thư viện tại ngày ${at}`,
            suggestions: [{ value: e.value, label: `${fmt(e.value)} (${rangeText(e)})`, why: basisText(e.basis), confidence: e.basis?.every((b) => b.verified) && item.verified ? 'cao' : 'vua' }],
          });
        }
      }
    }
  }
  // 4. khuôn dữ liệu kèm theo
  if (input.fields !== undefined) {
    for (const x of checkSchema(lib.itemSchema, input.fields, 'fields')) findings.push({ code: 'LIB-SCHEMA-001', level: 'block', path: x.path, message: x.message, suggestions: [] });
  }
  // 5. chưa duyệt
  if (!item.verified) findings.push({ code: 'LIB-UNVERIFIED-001', level: 'info', path: 'code', got: item.code, message: `${item.code} chưa được ${lib.owner} duyệt`, suggestions: [] });
  // 6. luật khai báo
  for (const r of lib.rules ?? []) {
    if (evalCondition(r.when, { input, item })) findings.push({ code: r.code, level: r.level, path: 'code', message: r.title, suggestions: ruleSuggestions(r, lib, item, at, opts.lookup) });
  }
  return out();
}

/** Dòng ô chọn (hợp đồng §9): mặc định chỉ active; lọc theo chữ, nhóm, ngày. */
export function selectorRows(lib: Library, opts: { q?: string; at?: string; group?: string; status?: 'active' | 'deprecated' | 'removed' | 'all'; limit?: number } = {}): { rows: SelectorRow[]; total: number } {
  const at = opts.at ?? new Date().toISOString().slice(0, 10);
  const status = opts.status ?? 'active';
  const groupField = lib.selector.group;
  let list = lib.items.filter((i) => (status === 'all' ? i.status !== 'removed' : i.status === status));
  if (opts.group && groupField) list = list.filter((i) => String(pick(i, groupField) ?? '') === opts.group);
  if (lib.kind === 'param') list = list.filter((i) => !i.effective?.length || effectiveAt(i, at));
  let scored = list.map((i) => ({ i, s: opts.q ? score(lib, i, opts.q) : 1 })).filter((x) => x.s > 0);
  const sortKeys = lib.selector.sort ?? [lib.selector.value];
  scored = scored.sort((a, b) => b.s - a.s || sortKeys.map((k) => String(pick(a.i, k) ?? '').localeCompare(String(pick(b.i, k) ?? ''))).find((x) => x !== 0) || 0);
  const total = scored.length;
  const rows = scored.slice(0, Math.min(opts.limit ?? 50, 500)).map(({ i }): SelectorRow => {
    const e = effectiveAt(i, at);
    const hint = i.hints?.find((h) => h.kind === 'how' || h.kind === 'why')?.text;
    return {
      value: pick(i, lib.selector.value), label: renderLabel(lib.selector.label, i), deprecated: i.status !== 'active', verified: i.verified, item: i,
      ...(groupField && pick(i, groupField) !== undefined ? { group: String(pick(i, groupField)) } : {}),
      ...(hint ? { hint } : {}),
      ...(lib.selector.showValueAt && e ? { valueAt: e.value } : {}),
    };
  });
  return { rows, total };
}
