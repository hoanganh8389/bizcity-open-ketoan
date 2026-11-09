// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — xuất bizcity_catalog_hint@1 (khung Vì sao form danh mục)
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — xuất bizcity_findings@1 (thư viện phát hiện hai cổng)
/**
 * @ketoan/contracts — điểm vào duy nhất.
 *
 * Mọi thứ hai phía (API, giao diện, hệ thống gửi chứng từ) phải hiểu giống nhau
 * thì khai báo ở đây: hằng số nghiệp vụ, khuôn chứng từ, khuôn phản hồi API.
 */
export * from './enums.js';
export * from './api.js';
export * from './errors.js';
// [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: danh mục phát hiện tiền kiểm IN-*
export * from './intake-findings.js';
export * from './documents.js';
export * from './vouchers.js';
export * from './money.js';
// [2026-10-31 08:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): xuất kiểu câu hỏi đọc sổ.
export * from './ledger-query.js';
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.* (PHASES 2.7): docRef, liên kết, phiên bản, đính kèm.
export * from './doc-refs.js';
export * from './invoices.js';
export * from './connections.js';
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — phương án khắc phục có cấu trúc (bizcity_remedy@1)
export * from './remedy.js';
export * from './module.js';
export * from './dvt.js';
export * from './print-templates.js';
// [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W1: mã tra cứu: đọc requestId / traceId, nội dung Chép / Báo lỗi chỉ gồm mã.
export * from './ma-tra-cuu.js';
export * from './costing-formula.js';
// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn Bàn điều tra, bộ lọc trên địa chỉ, Kịch bản → màn.
export * from './ban-dieu-tra.js';
export * from './catalog-hint.js';
export * from './findings.js';
export * from './legal-basis.js';
export * from './lineage.js';
export * from './item-master.js'; // [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a: bizcity_item_master@1 (định danh, mã có phiên bản, kết quả tra mã) // [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: bizcity_lineage@1 // [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: căn cứ của mã (R-GATE-11)
export * from './entity-codes.js'; // [2026-11-08 01:49 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-4: entity_codes / resolveEntity (đối tượng, chi nhánh, kho)
