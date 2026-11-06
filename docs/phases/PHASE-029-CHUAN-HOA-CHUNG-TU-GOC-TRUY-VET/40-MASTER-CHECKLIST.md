# PHASE-029 · 40 — Master checklist
<!-- [2026-11-05 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — master checklist S029-1..8, log -->

> Ký hiệu: ☐ chưa làm · 🟡 có mã/tài liệu, chưa đủ tín hiệu · ✅ đủ tín hiệu · ⛔ chờ.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| S029-1 | Đánh giá hiện trạng + chữ chốt thiết kế ([00](00-MASTER-PLAN.md), [audit](../../audits/DANH-GIA-TRACE-CHUNG-TU-GOC-2026-11-05.md)), hợp đồng `bizcity_document@1` §7.2 | W0 | P0 | ✅ 2026-11-05 |
| S029-2 | Cổng `GET /api/v1/documents/history` (id · docKey · entryId), `integrity` | W1 | P0 | ✅ 2026-11-05 (#92) <!-- [2026-11-05 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1 xong --> |
| S029-3 | Ba mã chẩn đoán mới `ENTRY_NO_VERSION`, `ENTRY_VERSION_UNKNOWN`, `EVENT_ENTRIES_STALE` (dùng lại `LEDGER_ORPHAN` có sẵn) + lane `DG-DOC-1..3` | W1 | P0 | ✅ 2026-11-05 (#92) |
| S029-4 | Phép kiểm tĩnh `SC-DOC-7` + ca tự kiểm | W1 | P0 | ✅ 2026-11-05 (#92) |
| S029-5 | `ctx.ledger.submit` tự `saveVersion` + liên kết `ledger`; `payloadVersion` ở `GET /documents/:id` | W2a | P0 | ⛔ chờ nhả `actions.ts`, `kernel/src/index.ts`, `document.service.ts` |
| S029-6 | Migration người sửa / lý do cho phiên bản sự việc; `IN-DOC-REASON` (warn) | W2b | P1 | ⛔ chủ ký K3 |
| S029-7 | `module check` bắt module nộp sổ không qua W2a; `DG-DOC-*` lane SQL | W3 | P1 | ☐ |
| S029-8 | Nâng chẩn đoán lên `error` khi bản đo trên bản cài thật = 0 | W3 | P2 | ⛔ cần số đo |
| S029-9 | <!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — mở rộng Enterprise Continuity (ADR-0028): S029-9..28 --> ADR-0028, R-ECP (ECP-01..13), trang nền móng 17 trụ cột, danh sách dữ liệu gốc, đánh giá [20](20-DANH-GIA-NEN-MONG.md), lộ trình [30](30-LO-TRINH-NEN-MONG.md); CANON / CONG-BO; sửa `bizcity_master_data@1` §2, `bizcity_data@1` STD-DATA-6, R-MD-2 (mã ≠ định danh) | E0 | P0 | 🟡 2026-11-05 PR tài liệu |
| S029-10 | <!-- [2026-11-06 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-10 thu về đợt 1; phần còn lại sang S029-32 --> Cấu hình đợt 1 theo mô hình `options` (chữ chốt [30 §5](30-LO-TRINH-NEN-MONG.md)): `setting_values` chỉ thêm, phạm vi user → branch → accounting_unit → tenant, ngày hiệu lực, `getSetting` / `setSetting`, mirror khoá cũ, `config_version`, `valueType`, API `/settings/values` | E2 | P0 | ☐ giữ chỗ ở CLAIMS.md |
| S029-32 | Cấu hình đợt 2: route ghi riêng → `setSetting`; `valueType` cho module; chặn đọc thô `tenants.settings`; xuất / nhập; đệm theo `config_version`; khoá `idempotency_days`, `event_retention_days`; tiền tệ; thuế suất theo ngày | E2 | P1 | ⛔ sau S029-10 |
| S029-11 | Chứng từ `documents` + `document_meta` (mô hình `posts` / `postmeta`), `ctx.documents.transition`, quan hệ có đóng hiệu lực | E4 | P1 | ☐ |
| S029-12 | Xoá an toàn ở CSDL: thu hồi `DELETE`, hàm xoá đọc `md_references`, bỏ `CASCADE`, ngừng dùng cho bảng thiếu cột | E3b | P0 | ⛔ chủ ký K3; sau S026-11 |
| S029-13 | <!-- [2026-11-06 09:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-13 đợt 1: chữ chốt 30 §6, giữ chỗ --> Sổ đăng ký đối chiếu đợt 1 (chữ chốt [30 §6](30-LO-TRINH-NEN-MONG.md)): `VAT_INPUT_INVOICE_MATCH`, `LEDGER_ROUNDING`, `ITEM_CODE_CASE_DUP`, `UNIT_BASE_INVALID` + lane + mục sổ đăng ký ở DIAGNOSTICS.md; projection khai đối chiếu ở đợt 2 (S029-21) | E6 | P1 | 🟡 2026-11-06 mã + lane + sổ đăng ký + test 5 ca (nhánh `feat/phase-029-e6-doi-chieu`), chờ merge |
| S029-14 | Kiểm đường ghi ngoài action mang tenant / actor / nguồn / correlation (ECP-02) | E9 | P2 | ☐ |
| S029-15 | Ánh xạ định danh ngoài, con trỏ đồng bộ, nhật ký từng lần kéo, đối chiếu theo cửa sổ | E7 | P1 | ☐ |
| S029-16 | Sổ KPI có phiên bản; dòng báo cáo tài chính thành định nghĩa có phiên bản | E8 | P2 | ☐ |
| S029-17 | Trigger kỳ khoá trên `ledger_entries` | E5 | P0 | ⛔ chủ ký K3 |
| S029-18 | Bảng điểm 17 trụ cột theo bằng chứng (`signal`, `foundation`), HT10 theo bốn nhóm | E1 | P0 | ⛔ sau S026-15 |
| S029-19 | Thuộc tính có hiệu lực (tên, MST, địa chỉ) cho đối tượng / chi nhánh / kho; ảnh chụp tên đối tượng trên dòng sổ; báo cáo theo ngày; test `T029-ECP-P001` | E3 | P0 | ⛔ sau S026-4 |
| S029-20 | Gộp đối tượng theo khuôn 0068 | E3 | P1 | ⛔ sau S026-4 |
| S029-21 | SDK: module đăng ký chẩn đoán / luật kiểm; manifest `objects` / `fields` / `rules` / `diagnostics` | E9 | P1 | ☐ |
| S029-22 | Khoá checksum migration 0034 → hiện tại; `migrate.ts` ghi checksum | E9 | P1 | ☐ |
| S029-23 | Người / nhân viên tách người dùng | E9 | P2 | ⛔ phối hợp PHASE-028 |
| S029-24 | Mã hoá bí mật kết nối khi lưu; phân loại dữ liệu nhạy cảm | E7 | P1 | ☐ |
| S029-25 | Bật SoD ở luồng duyệt; duyệt phiếu Kernel kiểm người lập ≠ người duyệt; sửa `bizcity_document@1` §5.1 | E4 | P1 | ☐ |
| S029-26 | Quan hệ người dùng ↔ nhân viên trong báo cáo bán hàng / KPI | E8 | P2 | ⛔ sau S029-23 |
| S029-27 | Báo cáo tài chính, cân đối phát sinh, tuổi nợ đi thẳng tới bút toán | E6 | P2 | ☐ |
| S029-29 | <!-- [2026-11-05 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-29..31: sáu năng lực lõi, SC-CORE-1, ma trận kiểm chuẩn --> Phép kiểm SC-CORE-1 trên `docs/standard/nen-mong.json`: sáu lõi có capability `available`, mã + hợp đồng tồn tại, trụ cột thuộc đúng một lõi, tín hiệu `co` có thật, "đạt" chỉ khi không còn `chua`; ca tự kiểm | E1 | P0 | ✅ 2026-11-06 (#95) |
| S029-30 | Màn HT10 theo bản mẫu [ma trận nền móng](mockups/ma-tran-nen-mong.html): năm thẻ (sáu lõi · 17 trụ cột · ECP · tín hiệu · tinh gọn), API chỉ đọc `nen-mong.json` (`GET /api/v1/system/foundations`, đề xuất); thẻ Nền móng trong màn HT10 — không thêm mục menu (thẻ `?xem=nen-mong`) <!-- [2026-11-05 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-30 không chờ S026-15: đọc nen-mong.json, không đụng tru-cot.json --> | E1 | P1 | ✅ 2026-11-06 (#95) |
| S029-31 | Bản mẫu ma trận kiểm chuẩn + `nen-mong.json` (`bizcity_foundations@1` 0.1.0-draft); sáu lõi + LEAN-1..7 vào ADR-0028 / CANON §0.7–§0.8 | E0 | P0 | 🟡 2026-11-05 PR tài liệu |
| S029-28 | Khớp danh mục sự kiện với hợp đồng (`module.enabled` / `disabled`, sự kiện chưa phát); hạn idempotency vào registry | E9 | P2 | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-05 | Claude Code | Mở phase từ đánh giá truy vết; chủ duyệt Q-TR-1..4; chữ chốt W1; giữ chỗ W1. W2a chờ nhả tệp dùng chung. |
| 2026-11-05 | Claude Code | Chủ dự án yêu cầu mở rộng thành Enterprise Continuity: ADR-0028, R-ECP (ECP-01..13), bốn nhóm nền móng 17 trụ cột, rà codebase, lộ trình E1–E9, S029-9..28. |
| 2026-11-05 | Claude Code | W1 merge (#92): S029-2..4 xong, bỏ dòng giữ chỗ W1. Giữ chỗ E1 (S029-29 SC-CORE-1, S029-30 thẻ Nền móng). |
| 2026-11-06 | Claude Code | Chữ chốt E2 đợt 1 (`bizcity_settings@1` 1.1.0-draft §2, 30 §5); giữ chỗ E2; tách đợt 2 thành S029-32. |
| 2026-11-06 | Claude Code | E6 đợt 1 code: `VAT_INPUT_INVOICE_MATCH`, `LEDGER_ROUNDING` (ledger), `ITEM_CODE_CASE_DUP`, `UNIT_BASE_INVALID` (inventory) + lane DG-REC-1 / -2, DG-MD-1 / -2; DIAGNOSTICS.md §2a sổ đăng ký đối chiếu. Phát hiện: cửa nạp nhận số lẻ xu vào sổ — nay LEDGER_ROUNDING báo. |
