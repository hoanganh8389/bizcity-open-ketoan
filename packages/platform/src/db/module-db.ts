// @bizcity-layer P data
// [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.10 (ADR-0011 D4): CSDL theo module — schema mod_<key>, vai trò mod_<key>_owner (chạy migration) / mod_<key>_rw (đọc ghi lúc chạy), trình chạy migration module bằng SET LOCAL ROLE, kiểm RLS sau migration
/**
 * CSDL THEO MODULE (ADR-0011 D4; PHASES 3.10). Chặn bằng QUYỀN PostgreSQL, không bằng phân tích SQL.
 *
 *   ensureModuleDb()       (vai trò sở hữu, trong giao dịch cài) tạo nếu chưa có:
 *                            mod_<key>_owner  NOLOGIN, sở hữu schema mod_<key>; USAGE bizcity_read; KHÔNG quyền trên bảng public
 *                            mod_<key>_rw     NOLOGIN, USAGE schema mod_<key> + SELECT/INSERT/UPDATE/DELETE bảng của schema
 *                                             (default privileges của owner), SELECT khung nhìn bizcity_read khai trong manifest
 *                            ketoan_app được SET ROLE sang mod_<key>_rw nhưng KHÔNG thừa hưởng quyền (INHERIT FALSE)
 *   runModuleMigrations()  mỗi tệp một giao dịch: SET LOCAL ROLE mod_<key>_owner + search_path mod_<key> → chạy SQL → về vai trò
 *                          sở hữu → kiểm danh mục (mọi bảng mod_<key> có tenant_id, RLS bật + FORCE, có chính sách) → ghi
 *                          schema_migrations (name `<key>/<tệp>`, module = key). Lỗi / thiếu RLS → ROLLBACK cả tệp.
 *   moduleRoles()          tên schema / vai trò; runtime dùng ở ctx.data.module (core/actions.ts).
 *
 * Module đi kèm (phân hệ trong apps/api/src/phan-he) chưa có schema riêng — dùng bảng public qua migration Core, có waiver
 * STD-MOD-2 (A-17); module local (modules/<key>, PR-5) dùng đường này.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { env } from '../config/env.js';
import { sql } from 'kysely';
import type { Db } from './client.js';
import { Errors } from '../core/errors.js';

const KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;

// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G3/G6): chạy fn bằng vai trò mod_<key>_rw trong giao dịch đang mở — dùng chung cho action (ctx.data.module), subscriber, hook
/** Chạy `fn` bằng vai trò mod_<key>_rw (bảng của module + khung nhìn đọc khai trong manifest), xong trả vai trò cũ. Chưa cài CSDL module → NOT_READY. */
export async function asModuleRole<T>(trx: Db, key: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  const { rw } = moduleRoles(key);
  const has = await sql<{ ok: boolean }>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${rw}) AS ok`.execute(trx);
  if (!has.rows[0]?.ok) throw Errors.notReady(`Module ${key} chưa có CSDL riêng (vai trò ${rw}): chạy "module migrate" khi cài module`);
  const prev = (await sql<{ u: string }>`SELECT current_user AS u`.execute(trx)).rows[0]!.u;
  await sql`SET LOCAL ROLE ${sql.id(rw)}`.execute(trx);
  try {
    return await fn(trx);
  } finally {
    await sql`SET LOCAL ROLE ${sql.id(prev)}`.execute(trx).catch(() => {});
  }
}

export function moduleRoles(key: string): { schema: string; owner: string; rw: string } {
  if (!KEY_RE.test(key)) throw new Error(`Khoá module "${key}" sai khuôn`);
  const k = key.replace(/-/g, '_');
  return { schema: `mod_${k}`, owner: `mod_${k}_owner`, rw: `mod_${k}_rw` };
}

type Q = Pick<pg.ClientBase, 'query'>;

/**
 * DDL với tên vai trò / schema / khung nhìn (không truyền được bằng tham số): mẫu là HẰNG SỐ trong mã, tên đi qua
 * format('%I' / '%L') của PostgreSQL — máy chủ tự trích dẫn (như db/setup.ts), không ghép chuỗi ở Node (R-SEC-3).
 */
async function ddl(c: Q, template: string, ...names: string[]): Promise<void> {
  const q = await c.query<{ q: string }>('SELECT format($1, VARIADIC $2::text[]) AS q', [template, names]);
  await c.query(q.rows[0]!.q);
}

/** Tạo vai trò + schema + quyền cho module (idempotent). Chạy bằng vai trò sở hữu (cần CREATEROLE). */
export async function ensureModuleDb(c: Q, key: string, reads: string[] = []): Promise<void> {
  const r = moduleRoles(key);
  for (const role of [r.owner, r.rw]) {
    await ddl(c, 'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %L) THEN CREATE ROLE %I NOLOGIN; END IF; END $$', role, role);
  }
  // Vai trò đang chạy trình cài được SET ROLE sang owner (siêu người dùng thì vốn được).
  await ddl(c, 'GRANT %I TO CURRENT_USER WITH INHERIT FALSE, SET TRUE', r.owner);
  await ddl(c, 'CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', r.schema, r.owner);
  await ddl(c, 'REVOKE ALL ON SCHEMA %I FROM PUBLIC', r.schema);
  await ddl(c, 'GRANT USAGE ON SCHEMA %I TO %I', r.schema, r.rw);
  await ddl(c, 'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r.owner, r.schema, r.rw);
  await ddl(c, 'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I', r.owner, r.schema, r.rw);
  const hasRead = (await c.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'bizcity_read'`)).rowCount;
  if (hasRead) {
    await ddl(c, 'GRANT USAGE ON SCHEMA bizcity_read TO %I, %I', r.owner, r.rw);
    for (const v of reads) {
      const [, name] = /^bizcity_read\.([a-z_]+)$/.exec(v) ?? [];
      if (name) await ddl(c, 'GRANT SELECT ON bizcity_read.%I TO %I', name, r.rw);
    }
  }
  const app = (await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app'`)).rowCount;
  if (app) await ddl(c, 'GRANT %I TO ketoan_app WITH INHERIT FALSE, SET TRUE', r.rw);
}

export interface TableProblem { table: string; problem: string }

/** Bảng trong mod_<key> thiếu tenant_id / RLS / FORCE / chính sách (D4: thiếu → không cho bật). */
export async function moduleTableProblems(c: Q, key: string): Promise<TableProblem[]> {
  const { schema } = moduleRoles(key);
  const rows = (await c.query<{ table: string; tenant: boolean; rls: boolean; force: boolean; policies: number }>(`
    SELECT c.relname AS "table",
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS tenant,
           c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')`, [schema])).rows;
  const out: TableProblem[] = [];
  for (const t of rows) {
    if (!t.tenant) out.push({ table: t.table, problem: 'thiếu cột tenant_id' });
    if (!t.rls) out.push({ table: t.table, problem: 'chưa ENABLE ROW LEVEL SECURITY' });
    if (!t.force) out.push({ table: t.table, problem: 'chưa FORCE ROW LEVEL SECURITY' });
    if (!t.policies) out.push({ table: t.table, problem: 'chưa có chính sách (CREATE POLICY … bizcity_tenant_visible(tenant_id))' });
  }
  return out;
}

/**
 * Chạy migration chưa áp của một module (thư mục `dir`, tệp NNNN_*.sql). Kết nối RIÊNG bằng DATABASE_URL (vai trò sở hữu),
 * như runMigrations của Core. Trả tên tệp đã áp.
 */
export async function runModuleMigrations(key: string, dir: string, opts: { reads?: string[]; log?: (m: string) => void } = {}): Promise<string[]> {
  const r = moduleRoles(key);
  const log = opts.log ?? (() => {});
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727002)');
    await client.query('BEGIN');
    await ensureModuleDb(client, key, opts.reads);
    await client.query('COMMIT');
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations WHERE module = $1', [key])).rows.map((x) => x.name));
    const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
    for (const file of files) {
      const name = `${key}/${file}`;
      if (done.has(name)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      log(`→ Module ${key}: áp ${file} bằng vai trò ${r.owner}`);
      await client.query('BEGIN');
      try {
        await ddl(client, 'SET LOCAL ROLE %I', r.owner);
        await ddl(client, 'SET LOCAL search_path TO %I, public', r.schema);
        await client.query(sql);
        await client.query('SET LOCAL ROLE NONE');
        const problems = await moduleTableProblems(client, key);
        if (problems.length) throw new Error(`bảng của module chưa đủ cô lập đơn vị: ${problems.map((p) => `${p.table} ${p.problem}`).join('; ')}`);
        await client.query('INSERT INTO schema_migrations (name, module) VALUES ($1, $2)', [name, key]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration module ${key}/${file} lỗi: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727002)').catch(() => {});
    await client.end();
  }
}
