// @bizcity-layer P module-sdk
/**
 * Đọc cấu trúc cơ sở dữ liệu thật (catalog của PostgreSQL) và ghép với danh mục giải thích.
 * Chỉ đọc, không có dữ liệu nghiệp vụ: chỉ tên bảng, cột, chú thích, ràng buộc, trigger và số dòng ước lượng.
 */
import { sql } from 'kysely';
import { db } from '../../db/client.js';
import { COLUMN_NOTES, SCHEMA_GROUPS, SCHEMA_TABLES, TRIGGER_NOTES } from './schema-catalog.js';

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  identity: boolean;
  comment: string | null;
  /** Giải thích chung khi cột chưa có COMMENT riêng. */
  hint: string | null;
  references: { table: string; column: string } | null;
}

export interface SchemaTable {
  name: string;
  group: string;
  label: string;
  term: string | null;
  purpose: string | null;
  module: string | null;
  comment: string | null;
  rowEstimate: number;
  columns: SchemaColumn[];
  primaryKey: string[];
  foreignKeys: { name: string; columns: string[]; refTable: string; refColumns: string[]; def: string }[];
  referencedBy: { name: string; table: string; columns: string[] }[];
  constraints: { name: string; kind: 'unique' | 'check'; def: string }[];
  indexes: { name: string; unique: boolean; def: string }[];
  triggers: { name: string; func: string; def: string; note: string | null }[];
}

export async function readSchema() {
  const [tables, columns, constraints, indexes, triggers] = await Promise.all([
    sql<{ name: string; comment: string | null; rows: string }>`
      SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment,
             COALESCE(s.n_live_tup, 0)::text AS rows
        FROM pg_class c LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v')
       ORDER BY c.relname`.execute(db),
    sql<{ tbl: string; name: string; type: string; nullable: boolean; def: string | null; identity: boolean; comment: string | null }>`
      SELECT c.relname AS tbl, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
             NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS def,
             a.attidentity <> '' AS identity, col_description(c.oid, a.attnum) AS comment
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v')
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY c.relname, a.attnum`.execute(db),
    sql<{ name: string; tbl: string; type: string; def: string; ref_table: string | null; cols: string[]; ref_cols: string[] }>`
      SELECT con.conname AS name, c.relname AS tbl, con.contype::text AS type, pg_get_constraintdef(con.oid) AS def,
             rc.relname AS ref_table,
             ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n, o)
                     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
             ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(n, o)
                     JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.o) AS ref_cols
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        LEFT JOIN pg_class rc ON rc.oid = con.confrelid
       WHERE con.connamespace = 'public'::regnamespace AND con.contype IN ('p', 'f', 'u', 'c')
       ORDER BY c.relname, con.conname`.execute(db),
    sql<{ name: string; tbl: string; def: string; uniq: boolean; is_constraint: boolean }>`
      SELECT i.relname AS name, t.relname AS tbl, pg_get_indexdef(i.oid) AS def, ix.indisunique AS uniq,
             EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.oid) AS is_constraint
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
       WHERE t.relnamespace = 'public'::regnamespace
       ORDER BY t.relname, i.relname`.execute(db),
    sql<{ name: string; tbl: string; def: string; func: string }>`
      SELECT tg.tgname AS name, c.relname AS tbl, pg_get_triggerdef(tg.oid) AS def, p.proname AS func
        FROM pg_trigger tg
        JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_proc p ON p.oid = tg.tgfoid
       WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal
       ORDER BY c.relname, tg.tgname`.execute(db),
  ]);

  const byName = new Map<string, SchemaTable>();
  for (const t of tables.rows) {
    const info = SCHEMA_TABLES[t.name];
    byName.set(t.name, {
      name: t.name,
      group: info?.group ?? 'other',
      label: info?.label ?? t.name,
      term: info?.term ?? null,
      purpose: info?.purpose ?? null,
      module: info?.module ?? null,
      comment: t.comment,
      rowEstimate: Number(t.rows),
      columns: [],
      primaryKey: [],
      foreignKeys: [],
      referencedBy: [],
      constraints: [],
      indexes: [],
      triggers: [],
    });
  }

  for (const c of columns.rows) {
    byName.get(c.tbl)?.columns.push({ name: c.name, type: c.type, nullable: c.nullable, default: c.def, identity: c.identity, comment: c.comment, hint: c.comment ? null : COLUMN_NOTES[c.name] ?? null, references: null });
  }

  for (const k of constraints.rows) {
    const t = byName.get(k.tbl);
    if (!t) continue;
    if (k.type === 'p') t.primaryKey = k.cols;
    else if (k.type === 'u') t.constraints.push({ name: k.name, kind: 'unique', def: k.def });
    else if (k.type === 'c') t.constraints.push({ name: k.name, kind: 'check', def: k.def });
    else if (k.type === 'f' && k.ref_table) {
      t.foreignKeys.push({ name: k.name, columns: k.cols, refTable: k.ref_table, refColumns: k.ref_cols, def: k.def });
      byName.get(k.ref_table)?.referencedBy.push({ name: k.name, table: k.tbl, columns: k.cols });
      // Khoá ngoại một cột (hoặc cột cuối của khoá ghép kèm tenant_id): đánh dấu ngay trên cột để giao diện nối link.
      const own = k.cols.filter((c) => c !== 'tenant_id');
      const ref = k.ref_cols.filter((c, i) => k.cols[i] !== 'tenant_id');
      if (own.length === 1 && ref.length === 1) {
        const col = t.columns.find((c) => c.name === own[0]);
        if (col) col.references = { table: k.ref_table, column: ref[0]! };
      }
    }
  }

  for (const i of indexes.rows) {
    if (i.is_constraint) continue; // đã hiện ở khoá chính / ràng buộc
    byName.get(i.tbl)?.indexes.push({ name: i.name, unique: i.uniq, def: i.def });
  }

  for (const g of triggers.rows) {
    byName.get(g.tbl)?.triggers.push({ name: g.name, func: g.func, def: g.def, note: TRIGGER_NOTES[g.func] ?? null });
  }

  // Xếp theo thứ tự khai báo trong danh mục (thứ tự nghiệp vụ), bảng chưa khai báo xuống cuối.
  const order = Object.keys(SCHEMA_TABLES);
  const rank = (n: string) => (order.indexOf(n) + 1 || order.length + 1);
  const list = [...byName.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  return { groups: SCHEMA_GROUPS, tables: list };
}
