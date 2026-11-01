// @bizcity-layer P+A data
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — chuyển tiếp: mã đã dời sang packages/platform/src/db/migrate.ts (@bizcity/platform/db/migrate); tệp này giữ đường import cũ cho phân hệ / nhánh đang mở
/** Tệp chuyển tiếp (PHASE-010 D010-7 chặng 2). Mã mới import thẳng '@bizcity/platform/db/migrate'. Gỡ khi mọi nơi đã đổi import. */
export * from '@bizcity/platform/db/migrate';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '@bizcity/platform/db/migrate';
import { pool } from '@bizcity/platform/db/client';

// Chạy trực tiếp bằng dòng lệnh (npm run db:migrate).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then((list) => {
      console.log(list.length ? `Đã áp ${list.length} migration.` : 'Cơ sở dữ liệu đã mới nhất.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
