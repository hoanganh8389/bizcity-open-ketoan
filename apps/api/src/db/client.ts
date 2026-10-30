// @bizcity-layer P+A data
/**
 * Kết nối PostgreSQL dùng chung cho toàn ứng dụng.
 *
 * - `db`   : đối tượng Kysely để viết truy vấn có kiểm tra kiểu.
 * - `Db`   : kiểu của db HOẶC một giao dịch (Transaction) — các repository nhận
 *            tham số kiểu này để chạy được cả trong và ngoài giao dịch.
 */
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import { env } from '../config/env.js';
import type { Database } from './types.js';
import { observeDbQuery } from '../core/metrics.js';

// numeric (1700) và int8 (20): giữ dạng chuỗi để không mất chính xác; date (1082): giữ chuỗi YYYY-MM-DD.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
  // Số đo thời gian / lỗi truy vấn cho Prometheus (bizcity_db_query_duration_seconds) — chỉ loại câu, không nội dung SQL.
  log: (e) => observeDbQuery(e.query.sql, e.queryDurationMillis, e.level === 'error'),
});

export type Db = Kysely<Database> | Transaction<Database>;

/** Đổi giá trị numeric (chuỗi) sang number. Dùng ở tầng repository. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export async function closeDb(): Promise<void> {
  await db.destroy();
}
