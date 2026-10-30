// @bizcity-layer K kernel/public
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

// ── Nạp chứng từ, ghi sổ (một cửa — bizcity_ledger_intake@1, R-LEDGER-4) ─────────────────────────────────────────────────
export { postDocumentIn, documentService } from '../modules/documents/document.service.js';
export { eventStore } from '../modules/documents/event-store.js';
export { voucherService } from '../modules/vouchers/voucher.service.js';
export type { DraftLine } from '../modules/ledger/ledger.types.js';

// ── Sổ phụ, danh mục của Kernel ───────────────────────────────────────────────────────────────────────────────────────────
export { allocate as allocateDebt } from '../modules/debts/debt.service.js';
export { accountRepository } from '../modules/accounts/account.repository.js';
export { usedDimensionCodes } from '../modules/default-data/default-data.service.js';
export { readPostingModes } from '../core/posting-modes.js';
export { seed } from '../db/seed.js';

// ── Đăng ký vào Platform (lắp ráp ở app.ts) ──────────────────────────────────────────────────────────────────────────────
export { LEDGER_DIAGNOSTICS } from '../modules/ledger/ledger.diagnostics.js';
export { collectLedgerMetrics } from '../modules/ledger/ledger.metrics.js';

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
