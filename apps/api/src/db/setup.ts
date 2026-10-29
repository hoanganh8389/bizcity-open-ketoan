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

async function main(): Promise<void> {
  const applied = await runMigrations((m) => console.log(m));
  console.log(applied.length ? `Đã áp ${applied.length} migration.` : 'Cơ sở dữ liệu đã mới nhất.');
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
