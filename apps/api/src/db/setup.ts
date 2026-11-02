// @bizcity-layer A adapters/postgres
/**
 * JOB CƠ SỞ DỮ LIỆU (Docker: service db-migrate; dòng lệnh: node dist/db/setup.js): áp migration chưa chạy rồi seed
 * dữ liệu gốc (an toàn khi chạy lại), xong thì thoát. Các container API chỉ khởi động sau khi job này xong
 * (depends_on: service_completed_successfully) — chỉ một nơi đụng tới cấu trúc DB.
 */
import { pool } from './client.js';
import { runMigrations } from './migrate.js';
import { seed } from '../kernel/public.js';
import { db } from './client.js';
import { freezeApproved } from '../phan-he/mua-hang/analysis.js';
import { syncBundled } from '../core/module-lifecycle.js';

/**
 * Vai trò CSDL của API (R-SEC-6, migration 0032): có DB_APP_PASSWORD thì bật LOGIN + đặt mật khẩu cho ketoan_app để API kết
 * nối bằng vai trò thường thay cho vai trò sở hữu. Mật khẩu đưa qua format('%L') của PostgreSQL, không ghép chuỗi, không in ra log.
 */
async function enableAppRole(): Promise<void> {
  const password = process.env.DB_APP_PASSWORD ?? '';
  if (!password) return;
  if (password.length < 16) throw new Error('DB_APP_PASSWORD phải dài ít nhất 16 ký tự');
  const role = await pool.query<{ ok: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') AS ok");
  if (!role.rows[0]?.ok) {
    // [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — P0-3: API mặc định ketoan_app, thiếu vai trò thì API không đăng nhập được — báo rõ cách sửa
    console.error('Vai trò ketoan_app chưa có (vai trò chạy migration không tạo được vai trò): người quản trị CSDL tạo theo db/migrations/0032_vai_tro_ung_dung.sql — API kết nối bằng ketoan_app sẽ lỗi tới khi có');
    return;
  }
  const q = await pool.query<{ q: string }>("SELECT format('ALTER ROLE ketoan_app WITH LOGIN PASSWORD %L', $1::text) AS q", [password]);
  await pool.query(q.rows[0]!.q);
  console.log('Vai trò ketoan_app: đã bật đăng nhập (API kết nối bằng vai trò này)');
}

// [2026-11-01 01:14 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — vai trò ketoan_monitor cho postgres-exporter (S018-5b): chỉ pg_monitor + CONNECT, tạo khi có PG_EXPORTER_PASSWORD
/**
 * Vai trò của postgres-exporter (bộ giám sát, PHASE-018): có PG_EXPORTER_PASSWORD thì tạo / cập nhật ketoan_monitor — LOGIN,
 * chỉ pg_monitor (đọc thống kê pg_stat_*) + CONNECT; không quyền trên bảng nghiệp vụ, không ghi, không vượt RLS. Không có biến
 * thì bỏ qua (máy thử dùng vai trò sở hữu). Không cần migration: vai trò thuộc hạ tầng giám sát, không thuộc cấu trúc dữ liệu.
 */
async function enableMonitorRole(): Promise<void> {
  const password = process.env.PG_EXPORTER_PASSWORD ?? '';
  if (!password) return;
  if (password.length < 16) throw new Error('PG_EXPORTER_PASSWORD phải dài ít nhất 16 ký tự');
  const me = await pool.query<{ can: boolean; exists: boolean }>(`
    SELECT (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) AS can,
           EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_monitor') AS exists`);
  const { can, exists } = me.rows[0]!;
  if (!exists && !can) {
    console.log('Vai trò ketoan_monitor chưa có và vai trò chạy job không tạo được vai trò — tạo tay theo infrastructure/monitoring/README.md §6');
    return;
  }
  const verb = exists ? 'ALTER' : 'CREATE';
  const q = await pool.query<{ q: string }>(
    `SELECT format('${verb} ROLE ketoan_monitor WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1::text) AS q`,
    [password],
  );
  await pool.query(q.rows[0]!.q);
  await pool.query('GRANT pg_monitor TO ketoan_monitor');
  const g = await pool.query<{ q: string }>("SELECT format('GRANT CONNECT ON DATABASE %I TO ketoan_monitor', current_database()) AS q");
  await pool.query(g.rows[0]!.q);
  console.log(`Vai trò ketoan_monitor: ${exists ? 'đã cập nhật mật khẩu' : 'đã tạo'} (postgres-exporter dùng khi PG_EXPORTER_USER=ketoan_monitor)`);
}

async function main(): Promise<void> {
  const applied = await runMigrations((m) => console.log(m));
  console.log(applied.length ? `Đã áp ${applied.length} migration.` : 'Cơ sở dữ liệu đã mới nhất.');
  await enableAppRole();
  await enableMonitorRole();
  await seed();
  // Phiếu mua hàng đã duyệt từ trước: chốt chiết khấu tự áp từ chính sách vào phiếu (một lần, chạy lại bỏ qua).
  const fz = await freezeApproved(db);
  if (fz.frozen || fz.skipped.length) console.log(`Mua hàng: chốt chiết khấu ${fz.frozen} phiếu đã duyệt${fz.skipped.length ? `; lệch tổng, bỏ qua: ${fz.skipped.join(', ')}` : ''}`);
  // [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D2): đồng bộ registry module đi kèm bản dựng này (cài / nâng cấp / băm lại) — API chỉ nạp module đúng hash
  const changes = await syncBundled('setup');
  console.log(changes.length ? `Registry module: ${changes.map((c) => `${c.action} ${c.key}`).join(', ')}` : 'Registry module: đã khớp bản dựng');
  await pool.end();
}

main().catch((err) => {
  console.error('Job cơ sở dữ liệu lỗi:', err instanceof Error ? err.message : err);
  process.exit(1);
});
