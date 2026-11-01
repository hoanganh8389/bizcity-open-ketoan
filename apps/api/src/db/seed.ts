// @bizcity-layer K kernel/seeds
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — chuyển tiếp: seed nay ở packages/kernel/src/db/seed.ts; tệp này giữ lệnh npm run db:seed
export * from '@bizcity/kernel/db/seed';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from '@bizcity/kernel/db/seed';
import { closeDb } from '@bizcity/platform/db/client';
import { runMigrations } from '@bizcity/platform/db/migrate';

// Chạy trực tiếp bằng dòng lệnh (npm run db:seed): migration rồi dữ liệu gốc.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => seed())
    .then(() => closeDb())
    .catch(async (err) => {
      console.error('Seed lỗi:', err);
      await closeDb();
      process.exit(1);
    });
}
