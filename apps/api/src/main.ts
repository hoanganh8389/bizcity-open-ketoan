// @bizcity-layer P apps/api
/**
 * Điểm khởi động API. Cấu trúc DB do job db-migrate lo (AUTO_MIGRATE=0, Docker): ở đây chỉ kiểm còn migration chưa áp
 * thì dừng, báo rõ. Chạy dev (AUTO_MIGRATE=1, mặc định): tự áp như cũ.
 */
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/client.js';
import { pendingMigrations, runMigrations } from './db/migrate.js';

async function start(): Promise<void> {
  if (env.AUTO_MIGRATE === '1') {
    await runMigrations((m) => console.log(m));
  } else {
    const pending = await pendingMigrations();
    if (pending.length) throw new Error(`Cơ sở dữ liệu chưa nâng cấp (${pending.length} migration chưa áp, mới nhất ${pending[pending.length - 1]}): chạy job db-migrate trước (docker compose up db-migrate).`);
  }
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Nhận ${signal}, đang dừng…`);
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
