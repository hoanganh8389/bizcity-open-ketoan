/**
 * JOB CƠ SỞ DỮ LIỆU (Docker: service db-migrate; dòng lệnh: node dist/db/setup.js): áp migration chưa chạy rồi seed
 * dữ liệu gốc (an toàn khi chạy lại), xong thì thoát. Các container API chỉ khởi động sau khi job này xong
 * (depends_on: service_completed_successfully) — chỉ một nơi đụng tới cấu trúc DB.
 */
import { pool } from './client.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';
import { db } from './client.js';
import { freezeApproved } from '../phan-he/mua-hang/analysis.js';

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
    console.log('Vai trò ketoan_app chưa có (vai trò chạy migration không tạo được vai trò) — API vẫn dùng vai trò sở hữu');
    return;
  }
  const q = await pool.query<{ q: string }>("SELECT format('ALTER ROLE ketoan_app WITH LOGIN PASSWORD %L', $1::text) AS q", [password]);
  await pool.query(q.rows[0]!.q);
  console.log('Vai trò ketoan_app: đã bật đăng nhập (API dùng khi DB_APP_USER=ketoan_app)');
}

async function main(): Promise<void> {
  const applied = await runMigrations((m) => console.log(m));
  console.log(applied.length ? `Đã áp ${applied.length} migration.` : 'Cơ sở dữ liệu đã mới nhất.');
  await enableAppRole();
  await seed();
  // Phiếu mua hàng đã duyệt từ trước: chốt chiết khấu tự áp từ chính sách vào phiếu (một lần, chạy lại bỏ qua).
  const fz = await freezeApproved(db);
  if (fz.frozen || fz.skipped.length) console.log(`Mua hàng: chốt chiết khấu ${fz.frozen} phiếu đã duyệt${fz.skipped.length ? `; lệch tổng, bỏ qua: ${fz.skipped.join(', ')}` : ''}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Job cơ sở dữ liệu lỗi:', err instanceof Error ? err.message : err);
  process.exit(1);
});
