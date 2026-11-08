// [2026-11-08 11:33 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — ca đổi tên của gói K3 (0080 → 0081, 0081 → 0082)
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

describe('Migration đổi tên — gói K3 (0080 trùng số với W2a)', () => {
  const PAIRS: [string, string][] = [
    ['0081_nguoi_tao_su_viec_bat_buoc.sql', '0080_nguoi_tao_su_viec_bat_buoc.sql'],
    ['0082_khoa_ky_o_csdl.sql', '0081_khoa_ky_o_csdl.sql'],
  ];
  it('bản cài đã áp tên cũ (0080 / 0081) → chỉ ghi nhận tên mới, không chạy lại (CREATE FUNCTION / TRIGGER sẽ lỗi nếu chạy lại)', async () => {
    await runMigrations(() => {});
    for (const [now, was] of PAIRS) {
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [was]);
      await pool.query('DELETE FROM schema_migrations WHERE name = $1', [now]);
    }
    for (const [now] of PAIRS) expect(await pendingMigrations()).not.toContain(now);
    const log: string[] = [];
    const applied = await runMigrations((m) => log.push(m));
    for (const [now, was] of PAIRS) {
      expect(applied).not.toContain(now);
      expect(log.some((m) => m.includes(`${was} → ${now}`))).toBe(true);
      expect((await names()).has(now)).toBe(true);
    }
  });

  it('thư mục migration không còn số trùng: đúng một 0080, một 0081, một 0082', async () => {
    const { readdirSync } = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../../../db/migrations');
    const count = (n: string) => readdirSync(dir).filter((f) => f.startsWith(`${n}_`)).length;
    expect([count('0080'), count('0081'), count('0082')]).toEqual([1, 1, 1]);
  });
});
