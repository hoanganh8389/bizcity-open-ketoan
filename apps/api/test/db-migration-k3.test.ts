// [2026-11-07 03:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1 (PHASE-030 D030-16): T029-K3-2 — migration 0080, 0081 trên CSDL tạm có sẵn dữ liệu cũ (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/35-GOI-K3.md)
/**
 * T029-K3-2 — Migration 0080 / 0081 an toàn cho bản cài có dữ liệu. Dựng một CSDL TẠM, áp 0001..0079, rồi:
 *   - có sự việc người tạo là chuỗi trắng → 0080 DỪNG bằng câu tiếng Việt, cả migration lùi (dòng rỗng chưa bị điền), cột vẫn nullable;
 *   - chỉ còn dòng rỗng (sự việc hệ thống) → 0080 áp được: điền system:<doc_type>, NOT NULL, chèn rỗng / trắng bị từ chối;
 *   - 0081 áp được trên CSDL đã có dữ liệu (phép chặn chèn vào kỳ khoá kiểm ở khoa-ky-csdl.test.ts với bút toán thật).
 * CSDL tạm luôn bị xoá ở cuối.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { env } from '../src/config/env.js';

const MIGRATIONS = path.resolve(__dirname, '../../../db/migrations');
const NAME = `ketoan_k3_${Date.now()}${Math.floor(Math.random() * 1000)}`;
const withDb = (url: string, dbName: string) => { const u = new URL(url); u.pathname = `/${dbName}`; return u.toString(); };
let admin: pg.Client;
let tmp: pg.Client;
const file = (n: string) => readdirSync(MIGRATIONS).find((f) => f.startsWith(`${n}_`) && f.endsWith('.sql'))!;
const sqlOf = (n: string) => readFileSync(path.join(MIGRATIONS, file(n)), 'utf8');

async function apply(n: string) {
  await tmp.query('BEGIN');
  try {
    await tmp.query(sqlOf(n));
    await tmp.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file(n)]);
    await tmp.query('COMMIT');
  } catch (err) {
    await tmp.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: withDb(env.DATABASE_URL, 'postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${NAME}`);
  tmp = new pg.Client({ connectionString: withDb(env.DATABASE_URL, NAME) });
  await tmp.connect();
  await tmp.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const f of readdirSync(MIGRATIONS).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort().filter((x) => x < '0080')) {
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

/** Dựng sự việc cũ (bỏ qua trigger và khoá ngoại như dữ liệu có từ trước). */
const oldEvent = (key: string, docType: string, createdBy: string | null) => tmp.query(
  `INSERT INTO accounting_events (id, tenant_id, doc_key, doc_type, branch_id, doc_no, doc_date, payload, created_by)
   VALUES (nextval(pg_get_serial_sequence('accounting_events', 'id')), 1, $1, $2, 1, $1, '2026-10-01', '{}'::jsonb, $3)`, [key, docType, createdBy]);
const createdBy = async (key: string) => (await tmp.query('SELECT created_by FROM accounting_events WHERE doc_key = $1', [key])).rows[0]?.created_by;
const nullable = async () => (await tmp.query("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'accounting_events' AND column_name = 'created_by'")).rows[0].is_nullable;

describe('T029-K3-2 — migration 0080 / 0081 trên CSDL có sẵn dữ liệu cũ', () => {
  it('0080: còn sự việc người tạo là chuỗi trắng → dừng bằng câu tiếng Việt, lùi cả migration', async () => {
    await tmp.query('BEGIN');
    await tmp.query('SET LOCAL session_replication_role = replica');
    await oldEvent('K3-KH-1', 'depreciation', null);
    await oldEvent('K3-GV-1', 'cogs', null);
    await oldEvent('K3-LA-1', 'sale', '   ');
    await tmp.query('COMMIT');
    await expect(apply('0080')).rejects.toThrow(/Migration 0080 dừng: có ít nhất 1 sự việc có người tạo là chuỗi trắng.*K3-LA-1.*KHÔNG tự sửa/);
    expect(await nullable()).toBe('YES');
    expect(await createdBy('K3-KH-1')).toBeNull(); // bước điền cũng lùi theo
  });

  it('0080: chỉ còn sự việc hệ thống rỗng → điền system:<doc_type>, NOT NULL, chèn rỗng / trắng bị từ chối', async () => {
    await tmp.query('BEGIN');
    await tmp.query('SET LOCAL session_replication_role = replica');
    await tmp.query("UPDATE accounting_events SET created_by = 'user:1' WHERE doc_key = 'K3-LA-1'"); // người xem đã ghi đúng người tạo
    await tmp.query('COMMIT');
    await apply('0080');
    expect(await nullable()).toBe('NO');
    expect(await createdBy('K3-KH-1')).toBe('system:depreciation');
    expect(await createdBy('K3-GV-1')).toBe('system:cogs');
    expect(await createdBy('K3-LA-1')).toBe('user:1');
    await expect(oldEvent('K3-MOI-1', 'sale', null)).rejects.toThrow(/created_by|null/i);
    await expect(oldEvent('K3-MOI-2', 'sale', '  ')).rejects.toThrow(/accounting_events_created_by_present/);
    const c = await tmp.query("SELECT col_description('accounting_events'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'accounting_events'::regclass AND attname = 'created_by')) AS d");
    expect(c.rows[0].d).toMatch(/system:<doc_type>/);
  });

  it('0081: áp được trên CSDL có dữ liệu, có trigger chặn chèn vào kỳ khoá (phép chặn kiểm ở khoa-ky-csdl.test.ts)', async () => {
    await apply('0081');
    const t = await tmp.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'ledger_entries'::regclass AND tgname = 'ledger_entries_period_lock'");
    expect(t.rows).toHaveLength(1);
  });
});
