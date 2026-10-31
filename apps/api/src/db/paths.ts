// @bizcity-layer P data
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — thư mục gói định khoản db/packs (PACKS_DIR).
/**
 * Thư mục CƠ SỞ DỮ LIỆU của dự án: <gốc repo>/db (người phụ trách DB quản lý — xem db/README.md).
 *   db/migrations/NNNN_ten.sql   khai báo bảng (chạy bằng job db-migrate / npm run db:migrate)
 *   db/seeds/                    dữ liệu gốc (tài khoản, danh mục chuẩn…)
 *   db/packs/                    gói định khoản (bizcity_posting_template@1); gói nền vn-tt99-nen cài khi khởi tạo đơn vị
 * Chạy từ src (tsx) hay dist (node, trong Docker là /app/apps/api/dist/db) thì <gốc>/db đều cách 4 cấp.
 * Đổi chỗ: biến DB_DIR (hoặc riêng SEEDS_DIR).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_DIR = process.env.DB_DIR ?? path.resolve(here, '../../../../db');
export const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations');
export const SEEDS_DIR = process.env.SEEDS_DIR ?? path.join(DB_DIR, 'seeds');
export const PACKS_DIR = process.env.PACKS_DIR ?? path.join(DB_DIR, 'packs');
