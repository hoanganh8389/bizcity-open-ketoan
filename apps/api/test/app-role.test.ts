/**
 * Vai trò CSDL của API — ketoan_app (migration 0032, R-SEC-6, R-KER-3): đọc / ghi dữ liệu được, nhưng KHÔNG tắt được trigger
 * bảo vệ sổ, không đổi session_replication_role, không TRUNCATE. Kiểm bằng SET ROLE trong giao dịch rồi huỷ (không đổi gì).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, pool } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

let roleExists = false;
beforeAll(async () => {
  await runMigrations(() => {});
  roleExists = (await pool.query("SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app'")).rowCount === 1;
});
afterAll(async () => {
  await closeDb();
});

/** Chạy câu lệnh dưới vai trò ketoan_app trong giao dịch rồi ROLLBACK; trả lỗi (nếu có). */
async function asApp(sqlText: string): Promise<Error | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE ketoan_app');
    await c.query(sqlText);
    return null;
  } catch (e) {
    return e as Error;
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}

describe('Vai trò ketoan_app', () => {
  it('có vai trò, không superuser, không BYPASSRLS (vai trò chạy test được tạo vai trò)', async () => {
    expect(roleExists).toBe(true);
    const r = (await pool.query("SELECT rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = 'ketoan_app'")).rows[0];
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false });
  });

  it('đọc, thêm, sửa được bảng nghiệp vụ; dùng được dãy số', async () => {
    const p = (priv: string, table: string) => pool.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2, $3) AS ok', ['ketoan_app', table, priv]).then((x) => x.rows[0]!.ok);
    for (const t of ['public.ledger_entries', 'public.ledger_lines', 'public.accounting_events', 'public.partners', 'public.schema_migrations', 'public.supplier_invoices']) {
      expect(await p('SELECT', t), `SELECT ${t}`).toBe(true);
      expect(await p('INSERT', t), `INSERT ${t}`).toBe(true);
    }
    expect(await asApp('SELECT count(*) FROM ledger_lines')).toBeNull();
    expect(await asApp("SELECT nextval('ledger_entries_id_seq')")).toBeNull();
  });

  it('KHÔNG tắt được trigger bảo vệ sổ, không đổi session_replication_role, không TRUNCATE', async () => {
    expect((await asApp('ALTER TABLE ledger_lines DISABLE TRIGGER ledger_lines_no_update'))?.message).toMatch(/must be owner|phải là chủ/i);
    expect((await asApp('SET session_replication_role = replica'))?.message).toMatch(/permission denied|không có quyền/i);
    expect((await asApp('TRUNCATE ledger_lines'))?.message).toMatch(/permission denied|không có quyền/i);
    expect((await asApp('DROP TABLE ledger_links'))?.message).toMatch(/must be owner|phải là chủ/i);
  });

  it('bảng tạo sau (bởi vai trò chạy migration) tự cấp quyền cho ketoan_app', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('CREATE TABLE test_default_priv_tmp (id bigserial PRIMARY KEY, v text)');
      const ok = (await c.query<{ ok: boolean }>("SELECT has_table_privilege('ketoan_app', 'test_default_priv_tmp', 'INSERT') AS ok")).rows[0]!.ok;
      expect(ok).toBe(true);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
