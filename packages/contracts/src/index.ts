// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * @ketoan/contracts — điểm vào duy nhất.
 *
 * Mọi thứ hai phía (API, giao diện, hệ thống gửi chứng từ) phải hiểu giống nhau
 * thì khai báo ở đây: hằng số nghiệp vụ, khuôn chứng từ, khuôn phản hồi API.
 */
export * from './enums.js';
export * from './api.js';
export * from './errors.js';
export * from './documents.js';
export * from './vouchers.js';
export * from './money.js';
// [2026-10-31 08:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): xuất kiểu câu hỏi đọc sổ.
export * from './ledger-query.js';
export * from './invoices.js';
export * from './connections.js';
export * from './module.js';
export * from './dvt.js';
export * from './print-templates.js';
