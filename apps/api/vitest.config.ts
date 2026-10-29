import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Kiểm thử chạy trên PostgreSQL thật (DATABASE_URL), mỗi lần tạo một đơn vị riêng nên không đụng dữ liệu khác.
    env: { NODE_ENV: 'test' },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
