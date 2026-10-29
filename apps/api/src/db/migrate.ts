/**
 * Chạy migration: áp lần lượt các file db/migrations/NNNN_ten.sql chưa chạy.
 *
 * - Mỗi file chạy trong một giao dịch; lỗi thì dừng, không ghi nhận.
 * - Đã chạy thì ghi vào bảng schema_migrations, lần sau bỏ qua.
 * - Không sửa file đã chạy ở môi trường thật; muốn đổi thì thêm file mới.
 *
 * Dùng: npm run db:migrate · Docker: job db-migrate (dist/db/setup.js) · API tự chạy khi AUTO_MIGRATE=1 (dev).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';
import { MIGRATIONS_DIR } from './paths.js';

/**
 * Các file GỐC: cấu trúc nền (23/10/2026) gộp từ 67 migration lịch sử, chia theo mảng (nền tảng, danh mục, cấu hình định
 * khoản, kỳ, chứng từ, sổ cái, bán hàng, thuế, tài sản). Cơ sở dữ liệu đang chạy đã áp đủ migration cũ (có LAST_OLD trong
 * schema_migrations) thì KHÔNG chạy các file gốc, chỉ ghi nhận là đã có. Đang dở giữa chừng (có migration cũ nhưng chưa
 * tới LAST_OLD) thì dừng: phải cập nhật bằng bản phần mềm trước rồi mới lên bản này.
 */
const BASELINE = [
  '0001_goc_nen_tang.sql', '0002_goc_danh_muc.sql', '0003_goc_cau_hinh_dinh_khoan.sql', '0004_goc_ky_ke_toan.sql', '0005_goc_chung_tu.sql',
  '0006_goc_so_cai.sql', '0007_goc_kho_ban_hang.sql', '0008_goc_thue.sql', '0009_goc_tai_san.sql',
];
const LAST_OLD = '0067_danh_muc_hang_chuan.sql';

/** Ghi nhận các file gốc cho cơ sở dữ liệu đang chạy (đã đủ migration cũ). Trả true nếu vừa ghi nhận. */
async function adoptBaseline(client: { query: typeof pool.query }, done: Set<string>): Promise<boolean> {
  if (done.size === 0 || BASELINE.every((f) => done.has(f))) return false;
  if (!done.has(LAST_OLD)) {
    throw new Error(`Cơ sở dữ liệu đang ở bản cũ chưa đủ migration (thiếu ${LAST_OLD}): cập nhật bằng bản phần mềm trước ngày 23/10/2026 rồi mới lên bản này.`);
  }
  for (const f of BASELINE) {
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
    done.add(f);
  }
  return true;
}

export async function runMigrations(log: (msg: string) => void = console.log): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Khoá để hai tiến trình khởi động cùng lúc không chạy migration hai lần.
    await client.query('SELECT pg_advisory_lock(727001)');

    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    if (await adoptBaseline(client as unknown as { query: typeof pool.query }, done)) log(`→ Cơ sở dữ liệu đã đủ cấu trúc (tới ${LAST_OLD}): ghi nhận ${BASELINE.length} file gốc, không chạy lại`);
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      log(`→ Áp migration ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} lỗi: ${(err as Error).message}`);
      }
    }
    await client.query('SELECT pg_advisory_unlock(727001)');
    return applied;
  } finally {
    client.release();
  }
}

/** Các file migration CHƯA áp (API dùng khi khởi động: thiếu thì không chạy, báo chạy job db-migrate). */
export async function pendingMigrations(): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const has = await pool.query<{ ok: boolean }>("SELECT to_regclass('schema_migrations') IS NOT NULL AS ok");
  if (!has.rows[0]?.ok) return files;
  const done = new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  // Cơ sở dữ liệu đã đủ migration cũ coi như đã có file nền (job db-migrate sẽ ghi nhận).
  if (done.has(LAST_OLD)) BASELINE.forEach((f) => done.add(f));
  return files.filter((f) => !done.has(f));
}

// Chạy trực tiếp bằng dòng lệnh.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then((list) => {
      console.log(list.length ? `Đã áp ${list.length} migration.` : 'Cơ sở dữ liệu đã mới nhất.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
