// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Đọc thô các tệp migration SQL (không chạy CSDL): bảng, cột, chú thích, RLS.
 * Đủ cho kiểm tĩnh CONF-MIG; kiểm chính xác trên pg_catalog là phần CONF-MIG chạy thật (Phase 4).
 */

const ident = (s) => s.replace(/^public\./, '').replace(/"/g, '').toLowerCase();
const NOT_COLUMN = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;

export function parseMigrations(repo, dir = 'db/migrations') {
  const files = repo.list(dir).filter((f) => f.endsWith('.sql')).map((f) => `${dir}/${f}`);
  const tables = new Map();      // name → { name, file, line, columns: Map(col → type) }
  const tableComments = new Set();
  const columnComments = new Set(); // "table.column"
  const rls = new Set();
  const policies = new Map();    // table → số chính sách

  for (const file of files) {
    const text = repo.read(file) ?? '';
    const lineAt = (idx) => text.slice(0, idx).split('\n').length;

    for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/gi)) {
      const name = ident(m[1]);
      const body = sliceParens(text, m.index + m[0].length - 1);
      const columns = new Map();
      for (const part of splitTopLevel(body)) {
        const p = part.trim();
        if (!p || NOT_COLUMN.test(p)) continue;
        const cm = /^("?[\w]+"?)\s+(.+)$/s.exec(p);
        if (cm) columns.set(ident(cm[1]), cm[2].replace(/\s+/g, ' ').trim());
      }
      if (!tables.has(name)) tables.set(name, { name, file, line: lineAt(m.index), columns });
      else for (const [c, t] of columns) tables.get(name).columns.set(c, t);
    }
    for (const m of text.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([\w."]+)\s+([^;]+);/gi)) {
      const t = tables.get(ident(m[1]));
      if (t) for (const a of m[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)\s+([^,]+)/gi)) t.columns.set(ident(a[1]), a[2].trim());
      if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(m[2])) rls.add(ident(m[1]));
    }
    for (const m of text.matchAll(/COMMENT\s+ON\s+TABLE\s+([\w."]+)\s+IS/gi)) tableComments.add(ident(m[1]));
    for (const m of text.matchAll(/COMMENT\s+ON\s+COLUMN\s+([\w."]+)\s+IS/gi)) {
      // [schema.]bảng.cột — giữ schema khác public (mod_<key>.bảng) để khớp tên bảng ở CREATE TABLE.
      const parts = ident(m[1]).split('.');
      const col = parts.pop();
      columnComments.add(`${parts.join('.')}.${col}`);
    }
    for (const m of text.matchAll(/CREATE\s+POLICY\s+\S+\s+ON\s+([\w."]+)/gi)) policies.set(ident(m[1]), (policies.get(ident(m[1])) ?? 0) + 1);
  }
  return { files, tables, tableComments, columnComments, rls, policies };
}

/** Bảng tạo trong các migration nền của lõi (tên tệp có `_goc_`). */
export function baselineTables(parsed) {
  return new Set([...parsed.tables.values()].filter((t) => /_goc_/.test(t.file)).map((t) => t.name));
}

function sliceParens(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'") { i = text.indexOf("'", i + 1); if (i < 0) break; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

function splitTopLevel(body) {
  const out = []; let depth = 0; let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'") { const j = body.indexOf("'", i + 1); cur += body.slice(i, j + 1); i = j < 0 ? body.length : j; continue; }
    if (c === '-' && body[i + 1] === '-') { const j = body.indexOf('\n', i); i = j < 0 ? body.length : j; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
