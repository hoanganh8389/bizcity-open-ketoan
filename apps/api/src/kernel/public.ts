// @bizcity-layer K kernel/public
// [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng.
/**
 * CỔNG CÔNG KHAI CỦA KERNEL (PHASE-010, PHASES 2.3; ADR-0008: một gói packages/kernel).
 *
 * Mọi chỗ NGOÀI Kernel — Platform, phân hệ, add-in, phần lắp ráp (app.ts, phan-he/) — chỉ import Kernel qua tệp này
 * (SC-KERNEL-6, block). Bên trong Kernel import nhau tự do. Khi tách gói (PHASE-010 W2), tệp này thành `@bizcity/kernel`
 * và nơi gọi chỉ đổi đường dẫn import.
 *
 * Thêm một mục vào đây là mở rộng bề mặt công khai của Kernel: cần người duyệt nhóm Lõi (RULE-KERNEL), và mục đó phải là
 * thao tác có kiểm bất biến (ghi qua cửa nạp / eventStore), không phải lối tắt vào bảng sổ.
 */

// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
// ── Truy vết ở cổng (S4, ADR-0010 §3, mức K1 — chỉ thêm quan sát, KHÔNG đổi hành vi ghi sổ) ───────────────────────────────
// Mọi lối vào Kernel từ bên ngoài đi qua tệp này (SC-KERNEL-6), nên bọc ở đây là đủ: mỗi lời gọi ghi / đọc sổ của module,
// phân hệ, add-in, MCP thành span `kernel <thao tác>` (bizcity.layer = K, bizcity.doc_type, bizcity.outcome). Lời gọi nội bộ giữa
// các phần của Kernel không qua cổng nên không sinh span thừa. Kernel không import @opentelemetry/* (R-KER-8, R-OBS-7): hàm bọc
// ở Platform (core/tracing.ts, chiều K → P được phép). Module mới không phải sửa Kernel để có trace.
import { traceKernelApi, traceKernelFn } from '../core/tracing.js';
import { postDocumentIn as postDocumentInRaw, documentService as documentServiceRaw } from '../modules/documents/document.service.js';
import { eventStore as eventStoreRaw } from '../modules/documents/event-store.js';
import { voucherService as voucherServiceRaw } from '../modules/vouchers/voucher.service.js';
import { documentNumbers as documentNumbersRaw } from '../modules/documents/numbering.js';
import { ledgerQuery as ledgerQueryRaw } from '../modules/ledger/ledger-query.js';
import { allocate as allocateRaw } from '../modules/debts/debt.service.js';

// ── Nạp chứng từ, ghi sổ (một cửa — bizcity_ledger_intake@1, R-LEDGER-4) ─────────────────────────────────────────────────
export const postDocumentIn = traceKernelFn('postDocumentIn', postDocumentInRaw);
export const documentService = traceKernelApi('documentService', documentServiceRaw);
export const eventStore = traceKernelApi('eventStore', eventStoreRaw);
export const voucherService = traceKernelApi('voucherService', voucherServiceRaw);
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.numbering (PHASES 2.7): bộ đếm số chứng từ một chỗ; Platform nhận qua registerDocumentNumberer ở app.ts
export const documentNumbers = traceKernelApi('documentNumbers', documentNumbersRaw);
export type { DraftLine } from '../modules/ledger/ledger.types.js';

// ── Đọc sổ (ledger.query, PHASES 3.7): ngoài Kernel không đọc bảng ledger_* (SC-KERNEL-7) ─────────────────────────────────
// [2026-10-31 08:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): mở ledgerQuery + otherSide ra cổng công khai
// Truy vấn có sẵn theo mã; SQL viết tay của báo cáo đọc khung nhìn bizcity_read.* (migration 0043), dùng otherSide() lấy TK đối ứng.
export const ledgerQuery = traceKernelApi('ledgerQuery', ledgerQueryRaw);
export { otherSide } from '../modules/ledger/ledger-query.js';
export type { LedgerQuery, LedgerQueryRow, LedgerQueryGroup } from '../modules/ledger/ledger-query.js';
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — documentChecks về Kernel kỳ kế toán (kiểm trước khoá kỳ); báo cáo ke-toan đọc qua cổng
export { documentChecks } from '../modules/periods/document-checks.js';

// ── Sổ phụ, danh mục của Kernel ───────────────────────────────────────────────────────────────────────────────────────────
export const allocateDebt = traceKernelFn('allocateDebt', allocateRaw);
export { accountRepository } from '../modules/accounts/account.repository.js';
export { usedDimensionCodes } from '../modules/default-data/default-data.service.js';
export { readPostingModes } from '../core/posting-modes.js';
export { seed } from '../db/seed.js';

// ── Đăng ký vào Platform (lắp ráp ở app.ts) ──────────────────────────────────────────────────────────────────────────────
export { LEDGER_DIAGNOSTICS } from '../modules/ledger/ledger.diagnostics.js';
export { collectLedgerMetrics } from '../modules/ledger/ledger.metrics.js';
// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — bộ thu số đo ghi sổ (posting_log) và đơn vị theo dải cho app.ts đăng ký
export { collectPostingMetrics, collectTenantMetrics } from '../modules/documents/posting.metrics.js';

// ── Route HTTP của Kernel (lắp ráp ở phan-he/) ───────────────────────────────────────────────────────────────────────────
export { accountRoutes } from '../modules/accounts/account.routes.js';
export { closingRoutes } from '../modules/closing/closing.routes.js';
export { debtRoutes } from '../modules/debts/debt.routes.js';
export { defaultDataRoutes } from '../modules/default-data/default-data.routes.js';
export { documentRoutes } from '../modules/documents/document.routes.js';
export { inventoryRoutes } from '../modules/inventory/inventory.routes.js';
export { ledgerRoutes } from '../modules/ledger/ledger.routes.js';
export { periodRoutes } from '../modules/periods/period.routes.js';
export { postingConfigRoutes } from '../modules/posting-config/posting-config.routes.js';
export { taxCodeRoutes } from '../modules/tax-codes/tax-code.routes.js';
export { taxInfoRoutes } from '../modules/tax-info/tax-info.routes.js';
export { voucherRoutes } from '../modules/vouchers/voucher.routes.js';
