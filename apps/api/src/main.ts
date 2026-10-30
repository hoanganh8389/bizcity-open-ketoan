// @bizcity-layer P apps/api
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
/**
 * Điểm khởi động API. Cấu trúc DB do job db-migrate lo (AUTO_MIGRATE=0, Docker): ở đây chỉ kiểm còn migration chưa áp
 * thì dừng, báo rõ. Chạy dev (AUTO_MIGRATE=1, mặc định): tự áp như cũ.
 */
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/client.js';
import { pendingMigrations, runMigrations } from './db/migrate.js';
import { startEventRuntime } from './core/events.js';

async function start(): Promise<void> {
  if (env.AUTO_MIGRATE === '1') {
    await runMigrations((m) => console.log(m));
  } else {
    const pending = await pendingMigrations();
    if (pending.length) throw new Error(`Cơ sở dữ liệu chưa nâng cấp (${pending.length} migration chưa áp, mới nhất ${pending[pending.length - 1]}): chạy job db-migrate trước (docker compose up db-migrate).`);
  }
  const app = await buildApp();
  // Dispatcher sự kiện + đồng hồ (bizcity_event@1): chạy nhiều bản API cùng lúc vẫn đúng nhờ SKIP LOCKED + khoá chống trùng.
  const stopEvents = startEventRuntime(app.log);

  const shutdown = async (signal: string) => {
    app.log.info(`Nhận ${signal}, đang dừng…`);
    await stopEvents();
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
}

start().catch((err) => {
  console.error('Khởi động thất bại:', err);
  process.exit(1);
});
