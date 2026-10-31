// [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh.
/**
 * db/types.ts (kiểu Kysely) khớp migration: code biên dịch được nhờ types.ts, nhưng CSDL chỉ có những gì migration tạo.
 * Khai cột trong types.ts mà quên migration → typecheck xanh, chạy thật lỗi "column … does not exist" (0029, 0030 đã gặp).
 */
const TYPES = 'apps/api/src/db/types.ts';
/** Bảng do code tạo, không qua migration: schema_migrations (runner migrate.ts tự tạo trước khi áp tệp đầu tiên). */
const RUNNER_TABLES = new Set(['schema_migrations']);

function parseTypes(text) {
  const interfaces = new Map();
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const open = /^export interface (\w+)\s*\{/.exec(line);
    if (open) { cur = { name: open[1], fields: [] }; interfaces.set(cur.name, cur); continue; }
    if (!cur) continue;
    if (/^\}/.test(line)) { cur = null; continue; }
    const f = /^\s+([a-z_][a-z0-9_]*)\??:\s*(\w+)?/.exec(line);
    if (f) cur.fields.push({ name: f[1], type: f[2] });
  }
  const db = interfaces.get('Database') ?? interfaces.get('DB');
  const tables = new Map();
  for (const f of db?.fields ?? []) {
    const it = interfaces.get(f.type);
    if (it) tables.set(f.name, it.fields.map((x) => x.name));
  }
  return tables;
}

export default {
  id: 'SC-DATA-7',
  title: 'db/types.ts khớp migration: mọi bảng / cột kiểu Kysely khai đều có migration tạo',
  gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-DB-5', 'R-DB-1'], conf: ['CONF-MIG-1'], tier: 0, enforce: 'ratchet', weight: 5, targets: ['repo'],
  run(ctx) {
    const text = ctx.repo.read(TYPES);
    if (text == null) return { examined: 0, findings: [], notes: [`không có ${TYPES}`] };
    const declared = parseTypes(text);
    const m = ctx.migrations();
    const views = new Set();
    for (const f of m.files) for (const v of (ctx.repo.read(f) ?? '').matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?/gi)) views.add(v[1].toLowerCase());
    const findings = []; let units = 0;
    for (const [table, cols] of declared) {
      units += 1 + cols.length;
      if (views.has(table) || RUNNER_TABLES.has(table)) continue;
      const t = m.tables.get(table);
      if (!t) { findings.push(ctx.finding(TYPES, null, `types.ts khai bảng ${table} nhưng không migration nào tạo`, `table:${table}`)); continue; }
      for (const c of cols) if (!t.columns.has(c)) findings.push(ctx.finding(TYPES, null, `types.ts khai cột ${table}.${c} nhưng không migration nào tạo (CREATE TABLE / ALTER TABLE … ADD COLUMN)`, `column:${table}.${c}`));
    }
    return { examined: units, unitBy: 'key', findings, metrics: { tables: declared.size } };
  },
};
