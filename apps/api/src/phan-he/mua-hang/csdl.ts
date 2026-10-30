// @bizcity-layer D modules/mua-hang
/**
 * Cấu trúc CSDL của phân hệ Mua hàng — đọc THẲNG từ PostgreSQL (information_schema / pg_catalog) nên trang "Cơ sở dữ liệu
 * mua hàng" (MH13) luôn khớp CSDL thật: bảng, cột, kiểu, bắt buộc, mặc định, chú thích (COMMENT ON), chỉ mục, trigger, số dòng
 * của đơn vị đang đăng nhập. Danh sách bảng chia 3 lớp: riêng của phân hệ · danh mục dùng chung · sổ lõi được ghi khi duyệt.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { COLUMN_NOTES, SCHEMA_TABLES, TRIGGER_NOTES } from '../../modules/system/schema-catalog.js';

export const DB_LAYERS: { layer: 'module' | 'catalog' | 'core'; label: string; tables: string[] }[] = [
  { layer: 'module', label: 'Bảng riêng của phân hệ Mua hàng', tables: ['purchase_documents', 'purchase_policies', 'supplier_products', 'supplier_invoices', 'supplier_invoice_lines', 'supplier_item_aliases', 'purchase_attachments', 'stock_levels', 'stock_sku_settings', 'stock_max_requests', 'order_formulas', 'transfer_requests'] },
  { layer: 'catalog', label: 'Danh mục dùng chung (đọc khi lập phiếu)', tables: ['partners', 'partner_groups', 'products', 'product_units', 'unit_names', 'branches', 'warehouses', 'tax_codes'] },
  { layer: 'core', label: 'Sổ lõi kế toán (ghi khi duyệt phiếu)', tables: ['accounting_events', 'ledger_entries', 'ledger_lines', 'debt_items', 'debt_allocations', 'inventory_movements', 'inventory_costs', 'document_sequences'] },
];

export interface DbColumn { name: string; type: string; nullable: boolean; default: string | null; comment: string | null }
export interface DbTable { name: string; layer: string; label: string; purpose: string; comment: string | null; rows: number; columns: DbColumn[]; indexes: { name: string; def: string }[]; triggers: { name: string; timing: string; events: string; fn: string; note: string }[] }

export async function purchaseSchema(trx: Db, tenantId: string): Promise<{ layers: typeof DB_LAYERS; tables: DbTable[]; migrations: string[] }> {
  const names = DB_LAYERS.flatMap((l) => l.tables);
  const [tables, cols, idx, trg, mig] = await Promise.all([
    sql<{ name: string; comment: string | null }>`SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY(${names})`.execute(trx),
    sql<{ table: string; name: string; type: string; nullable: string; def: string | null; comment: string | null; pos: number }>`
      SELECT c.table_name AS table, c.column_name AS name,
             CASE WHEN c.data_type = 'ARRAY' THEN replace(c.udt_name, '_', '') || '[]' WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
                  WHEN c.character_maximum_length IS NOT NULL THEN c.data_type || '(' || c.character_maximum_length || ')'
                  WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')' ELSE c.data_type END AS type,
             c.is_nullable AS nullable, c.column_default AS def, col_description(('public.' || c.table_name)::regclass, c.ordinal_position) AS comment, c.ordinal_position AS pos
      FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = ANY(${names}) ORDER BY c.table_name, c.ordinal_position`.execute(trx),
    sql<{ table: string; name: string; def: string }>`SELECT tablename AS table, indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY(${names}) ORDER BY tablename, indexname`.execute(trx),
    sql<{ table: string; name: string; timing: string; events: string; fn: string }>`
      SELECT event_object_table AS table, trigger_name AS name, action_timing AS timing, string_agg(event_manipulation, ' / ' ORDER BY event_manipulation) AS events,
             max(action_statement) AS fn
      FROM information_schema.triggers WHERE trigger_schema = 'public' AND event_object_table = ANY(${names})
      GROUP BY event_object_table, trigger_name, action_timing ORDER BY 1, 2`.execute(trx),
    sql<{ name: string }>`SELECT name FROM schema_migrations ORDER BY name`.execute(trx).catch(() => ({ rows: [] as { name: string }[] })),
  ]);
  const found = new Set(tables.rows.map((t) => t.name));
  // Số dòng của đơn vị đang đăng nhập (bảng có tenant_id); bảng không có tenant_id thì ước lượng toàn CSDL.
  const counts = new Map<string, number>();
  for (const name of names.filter((n) => found.has(n))) {
    const hasTenant = cols.rows.some((c) => c.table === name && c.name === 'tenant_id');
    const r = hasTenant
      ? await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(name)} WHERE tenant_id = ${tenantId}`.execute(trx)
      : await sql<{ n: string }>`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = ${name}`.execute(trx);
    counts.set(name, Number(r.rows[0]?.n ?? 0));
  }
  const out: DbTable[] = DB_LAYERS.flatMap((l) => l.tables.filter((n) => found.has(n)).map((name) => {
    const meta = SCHEMA_TABLES[name];
    return {
      name, layer: l.layer, label: meta?.label ?? name, purpose: meta?.purpose ?? '', comment: tables.rows.find((t) => t.name === name)?.comment ?? null, rows: counts.get(name) ?? 0,
      columns: cols.rows.filter((c) => c.table === name).map((c) => ({ name: c.name, type: c.type, nullable: c.nullable === 'YES', default: c.def, comment: c.comment ?? COLUMN_NOTES[c.name] ?? null })),
      indexes: idx.rows.filter((i) => i.table === name).map((i) => ({ name: i.name, def: i.def })),
      triggers: trg.rows.filter((t) => t.table === name).map((t) => { const fn = /FUNCTION\s+([\w.]+)/i.exec(t.fn)?.[1]?.replace(/^public\./, '') ?? t.fn; return { name: t.name, timing: t.timing, events: t.events, fn, note: TRIGGER_NOTES[fn] ?? '' }; }),
    };
  }));
  return { layers: DB_LAYERS, tables: out, migrations: mig.rows.map((m) => m.name) };
}
