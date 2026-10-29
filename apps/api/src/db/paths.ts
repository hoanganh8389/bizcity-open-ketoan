/**
 * Thư mục CƠ SỞ DỮ LIỆU của dự án: <gốc repo>/db (người phụ trách DB quản lý — xem db/README.md).
 *   db/migrations/NNNN_ten.sql   khai báo bảng (chạy bằng job db-migrate / npm run db:migrate)
 *   db/seeds/                    dữ liệu gốc (tài khoản, loại thuế, danh mục chuẩn…)
 * Chạy từ src (tsx) hay dist (node, trong Docker là /app/apps/api/dist/db) thì <gốc>/db đều cách 4 cấp.
 * Đổi chỗ: biến DB_DIR (hoặc riêng SEEDS_DIR).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_DIR = process.env.DB_DIR ?? path.resolve(here, '../../../../db');
export const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations');
export const SEEDS_DIR = process.env.SEEDS_DIR ?? path.join(DB_DIR, 'seeds');
