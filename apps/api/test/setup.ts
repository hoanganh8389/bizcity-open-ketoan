/**
 * Chạy trước mọi tệp test (vitest setupFiles). Sau khi tệp xong: sổ của các đơn vị tệp đó tạo phải giữ bất biến
 * (PHASES 2.2, R-QG-5) — test nào làm lệch sổ thì cả tệp đỏ, kể cả khi từng phép thử đều xanh.
 */
import { afterAll } from 'vitest';
import { assertLedgerInvariants } from './helpers.js';

afterAll(async () => {
  await assertLedgerInvariants();
});
