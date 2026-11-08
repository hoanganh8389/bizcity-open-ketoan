// [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3: đặt PURCHASE_SEED_PASSWORD cho test (mã không còn mặc định)
// [2026-11-02 04:00 PM Johnny Chu - Chu Hoàng Anh] FIX — test chạy trên CSDL riêng (mặc định ketoan_test), từ chối CSDL không phải CSDL test
import { defineConfig } from 'vitest/config';

/**
 * CSDL của test. Bộ test tạo hàng trăm đơn vị và CỐ Ý để lại sổ lỗi (diagnostics.test.ts dựng EVENT_POSTED_VERSION để kiểm khoá kỳ
 * bị chặn) — sổ chỉ ghi thêm nên không xoá được. Chạy nhầm vào CSDL của bản cài (`ketoan`) thì bản cài mang 300+ đơn vị rác và cảnh
 * báo LedgerIntegrityError bật mãi (gặp thật 2026-11-01, RULE-REVIEW §6 W-12). Vì vậy:
 *   - không đặt DATABASE_URL → dùng ketoan_test trên cùng máy chủ với mặc định của API (global-setup tạo nếu chưa có);
 *   - tên CSDL phải chứa "test", không thì dừng trước khi chạy tệp nào.
 */
const DEFAULT_TEST_DB = 'postgres://ketoan:ketoan@localhost:5434/ketoan_test';
const databaseUrl = process.env.DATABASE_URL || DEFAULT_TEST_DB;
const dbName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/^[A-Za-z0-9_]*test[A-Za-z0-9_]*$/i.test(dbName)) {
  throw new Error(
    `Test không chạy trên CSDL "${dbName}": bộ test tạo đơn vị rác và cố ý để lại sổ lỗi. ` +
    'Dùng CSDL riêng có chữ "test" trong tên, vd DATABASE_URL=postgres://ketoan:ketoan@localhost:5434/ketoan_test (bỏ trống DATABASE_URL là dùng sẵn tên này).',
  );
}
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  // Gói workspace (@bizcity/platform…) nạp thẳng mã nguồn qua điều kiện 'development' của exports — không cần build trước khi chạy test.
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    // Kiểm thử chạy trên PostgreSQL thật (CSDL test ở trên), mỗi lần tạo một đơn vị riêng nên các tệp không đụng dữ liệu của nhau.
    // PURCHASE_SEED_PASSWORD: mật khẩu công cụ dữ liệu mẫu chỉ cho test (mã không có giá trị mặc định — SC-SEC-5).
    env: { NODE_ENV: 'test', DATABASE_URL: databaseUrl, PURCHASE_SEED_PASSWORD: 'Thuy!@#' },
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Sau mỗi tệp: kiểm bất biến sổ của các đơn vị tệp đó tạo (PHASES 2.2).
    setupFiles: ['./test/setup.ts'],
  },
});
