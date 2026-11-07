// [2026-11-06 03:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-41: T030-EVT-5 — migration 0077 trên CSDL tạm có sẵn bút toán rỗng event_id (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/25-BUT-TOAN-LUON-CO-CHUNG-TU.md §2 D030-15a/b)
/**
 * T030-EVT-5 — Migration 0077 an toàn cho bản cài có dữ liệu. Dựng một CSDL TẠM (không đụng CSDL dùng chung), áp 0001..0076, rồi:
 *   - có bút toán rỗng event_id → migration DỪNG bằng câu tiếng Việt nêu số dòng và số bút toán đầu, cột vẫn nullable, sổ không bị sửa;
 *   - không còn dòng rỗng → áp được: cột NOT NULL, ràng buộc tạm đã bỏ, INSERT rỗng bị từ chối.
 * CSDL tạm luôn bị xoá ở cuối.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { env } from '../src/config/env.js';

const MIGRATIONS = path.resolve(__dirname, '../../../db/migrations');
const NAME = `ketoan_evt5_${Date.now()}${Math.floor(Math.random() * 1000)}`;
const withDb = (url: string, dbName: string) => { const u = new URL(url); u.pathname = `/${dbName}`; return u.toString(); };
let admin: pg.Client;
let tmp: pg.Client;
const file0077 = () => readdirSync(MIGRATIONS).find((f) => /^0077_.+\.sql$/.test(f))!;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: withDb(env.DATABASE_URL, 'postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${NAME}`);
  tmp = new pg.Client({ connectionString: withDb(env.DATABASE_URL, NAME) });
  await tmp.connect();
  // Như bộ chạy migration (packages/platform/src/db/migrate.ts): một số migration đọc / ghi schema_migrations.
  await tmp.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort().filter((f) => f < '0077');
  for (const f of files) {
    try {
      await tmp.query('BEGIN');
      await tmp.query(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
      await tmp.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await tmp.query('COMMIT');
    } catch (err) {
      await tmp.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${f} lỗi trên CSDL tạm: ${(err as Error).message}`);
    }
  }
}, 180_000);

afterAll(async () => {
  await tmp?.end().catch(() => undefined);
  await admin?.query(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`).catch(() => undefined);
  await admin?.end().catch(() => undefined);
});

const insertEntry = (no: string) => tmp.query(
  `INSERT INTO ledger_entries (id, tenant_id, branch_id, period_id, entry_no, doc_type, doc_no, doc_date, posting_date, created_by)
   VALUES (nextval(pg_get_serial_sequence('ledger_entries', 'id')), 1, 1, 1, $1, 'manual', 'X', '2026-10-01', '2026-10-01', 'test')`, [no]);

describe('T030-EVT-5 — migration 0077 trên CSDL có sẵn dòng rỗng', () => {
  it('có bút toán rỗng event_id: migration dừng bằng câu tiếng Việt, cột vẫn nullable, sổ không bị sửa', async () => {
    expect((await tmp.query("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'ledger_entries' AND column_name = 'event_id'")).rows[0].is_nullable).toBe('YES');
    await tmp.query('BEGIN');
    await tmp.query('SET LOCAL session_replication_role = replica'); // dựng dữ liệu cũ bỏ qua trigger sổ và khoá ngoại
    await insertEntry('E5-0001');
    await insertEntry('E5-0002');
    await tmp.query('COMMIT');

    await tmp.query('BEGIN');
    await expect(tmp.query(readFileSync(path.join(MIGRATIONS, file0077()), 'utf8')))
      .rejects.toThrow(/Migration 0077 dừng: có ít nhất 2 bút toán không có chứng từ gốc.*bút toán đầu: E5-0001.*KHÔNG tự sửa/s);
    await tmp.query('ROLLBACK');

    const r = await tmp.query("SELECT is_nullable, (SELECT count(*) FROM ledger_entries WHERE event_id IS NULL)::int AS n FROM information_schema.columns WHERE table_name = 'ledger_entries' AND column_name = 'event_id'");
    expect(r.rows[0]).toMatchObject({ is_nullable: 'YES', n: 2 });
    expect((await tmp.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'ledger_entries_event_id_required'")).rows[0].n).toBe(0);
  }, 60_000);

  it('hết dòng rỗng: áp được, cột NOT NULL, ràng buộc tạm đã bỏ, INSERT rỗng bị từ chối', async () => {
    await tmp.query('BEGIN');
    await tmp.query('SET LOCAL session_replication_role = replica');
    await tmp.query('DELETE FROM ledger_entries');
    await tmp.query('COMMIT');

    await tmp.query('BEGIN');
    await tmp.query(readFileSync(path.join(MIGRATIONS, file0077()), 'utf8'));
    await tmp.query('COMMIT');

    expect((await tmp.query("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'ledger_entries' AND column_name = 'event_id'")).rows[0].is_nullable).toBe('NO');
    expect((await tmp.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'ledger_entries_event_id_required'")).rows[0].n).toBe(0);
    await tmp.query('BEGIN');
    await tmp.query('SET LOCAL session_replication_role = replica');
    await expect(insertEntry('E5-0003')).rejects.toThrow(/event_id/);
    await tmp.query('ROLLBACK');
  }, 60_000);
});
