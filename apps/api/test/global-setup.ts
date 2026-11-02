// [2026-11-02 04:00 PM Johnny Chu - Chu Hoàng Anh] FIX — test chạy trên CSDL riêng: tạo CSDL test nếu chưa có (vitest globalSetup)
/**
 * Chạy một lần trước cả bộ test (vitest globalSetup). vitest.config.ts đã chặn CSDL không phải CSDL test; ở đây chỉ tạo CSDL đó trên
 * cùng máy chủ PostgreSQL nếu chưa có (vd lần đầu `docker compose up -d db && npm test`). Migration do setupTenant() áp như cũ.
 * Không có quyền CREATE DATABASE (CI dùng sẵn POSTGRES_DB) thì bỏ qua — lỗi kết nối thật sẽ hiện ở tệp test đầu tiên.
 */
import pg from 'pg';

export default async function setup(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL!);
  const name = decodeURIComponent(url.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!found.rowCount) {
      // Tên đã qua khuôn ở vitest.config.ts (chữ, số, _); đặt trong ngoặc kép cho chắc.
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`Đã tạo CSDL test ${name}`);
    }
  } catch (e) {
    console.warn(`Không kiểm / tạo được CSDL test ${name}: ${(e as Error).message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}
