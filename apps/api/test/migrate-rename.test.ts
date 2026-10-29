/**
 * Migration đổi tên để sửa trùng số (R-DB-3): bản cài đã áp tên cũ thì chỉ ghi nhận tên mới, không chạy lại.
 * 0028_thue_kkkn.sql → 0031_thue_kkkn.sql (apps/api/src/db/migrate.ts RENAMED).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, pool } from '../src/db/client.js';
import { pendingMigrations, runMigrations } from '../src/db/migrate.js';

afterAll(async () => {
  await closeDb();
});

const names = async () => new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

describe('Migration đổi tên', () => {
  it('đã áp tên cũ → ghi nhận tên mới, không chạy lại, không còn "chưa áp"', async () => {
    await runMigrations(() => {}); // CSDL test mới nhất
    // Giả lập bản cài cũ: có tên cũ, chưa có tên mới.
    await pool.query("INSERT INTO schema_migrations (name) VALUES ('0028_thue_kkkn.sql') ON CONFLICT DO NOTHING");
    await pool.query("DELETE FROM schema_migrations WHERE name = '0031_thue_kkkn.sql'");

    expect(await pendingMigrations()).not.toContain('0031_thue_kkkn.sql');
    const log: string[] = [];
    const applied = await runMigrations((m) => log.push(m));
    expect(applied).not.toContain('0031_thue_kkkn.sql'); // không chạy lại
    expect(log.some((m) => m.includes('0028_thue_kkkn.sql → 0031_thue_kkkn.sql'))).toBe(true);
    expect((await names()).has('0031_thue_kkkn.sql')).toBe(true);
  });

  it('bản cài mới (chưa có tên cũ) → chạy tên mới như migration thường', async () => {
    await pool.query("DELETE FROM schema_migrations WHERE name IN ('0028_thue_kkkn.sql', '0031_thue_kkkn.sql')");
    expect(await pendingMigrations()).toContain('0031_thue_kkkn.sql');
    const applied = await runMigrations(() => {});
    expect(applied).toEqual(['0031_thue_kkkn.sql']); // tệp chỉ thêm mã thuế ON CONFLICT DO NOTHING — chạy lại an toàn
    expect((await names()).has('0031_thue_kkkn.sql')).toBe(true);
  });
});
