// @bizcity-layer P+A data
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — readWithTimeout: giao dịch chỉ đọc có statement_timeout cho bộ thu số đo (trần thời gian ở CSDL, không hẹn giờ — SC-EVT-1)
/**
 * Kết nối PostgreSQL dùng chung cho toàn ứng dụng.
 *
 * - `db`   : đối tượng Kysely để viết truy vấn có kiểm tra kiểu.
 * - `Db`   : kiểu của db HOẶC một giao dịch (Transaction) — các repository nhận
 *            tham số kiểu này để chạy được cả trong và ngoài giao dịch.
 */
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import { env } from '../config/env.js';
import type { Database } from './types.js';
import { observeDbQuery } from '../core/metrics.js';
import { currentRequest } from '../core/request-context.js';

// numeric (1700) và int8 (20): giữ dạng chuỗi để không mất chính xác; date (1082): giữ chuỗi YYYY-MM-DD.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

/**
 * Cô lập đơn vị ở tầng CSDL (RLS, migration 0041, PHASE-007): mỗi lần mượn kết nối, đặt bizcity.tenant_id = đơn vị của yêu cầu
 * đang chạy (core/request-context.ts), hoặc rỗng khi không có (migration, seed, dispatcher, đăng nhập). Ghi nhớ giá trị theo kết
 * nối nên chỉ tốn thêm một câu khi đơn vị đổi. Đặt ngoài giao dịch (set_config(..., false)) nên giữ qua BEGIN / ROLLBACK.
 */
const tenantOf = new WeakMap<pg.PoolClient, string>();
const tenantPool = {
  async connect(): Promise<pg.PoolClient> {
    const client = await pool.connect();
    const want = currentRequest()?.tenantId ?? '';
    const fresh = !tenantOf.has(client);
    if (fresh || tenantOf.get(client) !== want) {
      try {
        // DB_SET_ROLE (test / CI): chuyển sang vai trò không superuser một lần mỗi kết nối — superuser luôn vượt RLS.
        // set_config('role', …) tương đương SET ROLE nhưng nhận tham số (không ghép chuỗi vào SQL — R-SEC).
        if (fresh && env.DB_SET_ROLE) await client.query(`SELECT set_config('role', $1, false)`, [env.DB_SET_ROLE]);
        await client.query(`SELECT set_config('bizcity.tenant_id', $1, false)`, [want]);
      } catch (err) {
        client.release(err as Error);
        throw err;
      }
      tenantOf.set(client, want);
    }
    return client;
  },
  end: () => pool.end(),
};

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: tenantPool }),
  // Số đo thời gian / lỗi truy vấn cho Prometheus (bizcity_db_query_duration_seconds) — chỉ loại câu, không nội dung SQL.
  log: (e) => observeDbQuery(e.query.sql, e.queryDurationMillis, e.level === 'error'),
});

export type Db = Kysely<Database> | Transaction<Database>;

/**
 * Giao dịch CHỈ ĐỌC có trần thời gian ở CSDL (statement_timeout cục bộ của giao dịch): câu quá giờ bị PostgreSQL huỷ, kết nối
 * trả về pool. Bộ thu số đo dùng để một câu đếm chậm không treo lượt đọc /metrics, không giữ kết nối của đường ghi sổ.
 */
export async function readWithTimeout<T>(ms: number, fn: (tx: Transaction<Database>) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(trx);
    await sql`SELECT set_config('statement_timeout', ${String(ms)}, true)`.execute(trx);
    return fn(trx);
  });
}

/** Đổi giá trị numeric (chuỗi) sang number. Dùng ở tầng repository. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export async function closeDb(): Promise<void> {
  await db.destroy();
}
