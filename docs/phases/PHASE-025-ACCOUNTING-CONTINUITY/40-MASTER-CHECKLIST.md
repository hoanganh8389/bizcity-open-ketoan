# PHASE-025 · 40 — Checklist
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — việc con S025-*, ca bằng chứng T025-* -->

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S025-1 | ADR-0021, RULE-CONTINUITY (R-CONT-0..9), CANON §0.1 ba trụ cột | W0 | P0 | — | 🟡 2026-11-03: tài liệu xong, chờ chủ duyệt D025-* |
| S025-2 | Tài liệu phase 00 / 10 / 20 / 30, bản mẫu `mockups/continuity.html` | W0 | P0 | — | 🟡 2026-11-03 |
| S025-3 | Hợp đồng đọc `bizcity_lineage@1` (nút, cạnh, effect, mã `CT-*` trên nút) | W1 | P0 | có | ☐ |
| S025-4 | API lineage chỉ đọc trên dữ liệu có sẵn (`inventory_movements`, `inventory_costs`, chứng từ `cogs`, link trả hàng); màn Hành trình mặt hàng bản đầu — ca T025-1 | W1 | P0 | có | ☐ |
| S025-5 | Bảng `valuation_layers`, `valuation_layer_sources`, `cost_allocations` (chỉ thêm, RLS, trigger) | W2 | P0 | có | ☐ (sau PHASE-024 B2b) |
| S025-6 | Engine bình quân ghi lớp bể + phân bổ; tổng phân bổ = giá vốn ghi sổ — ca T025-2 | W2 | P0 | có | ☐ |
| S025-7 | `costing_method` trong `posting_policy_versions`; FIFO, bình quân liên hoàn, đích danh; phân bổ lại khi có phiếu ghi lùi — ca T025-3 | W3 | P1 | có | ☐ |
| S025-8 | `document_line_id` ổn định giữa phiên bản chứng từ (`event_id`, `line_key`); `original_line_id` trên dòng trả / huỷ | W2 | P0 | có | ☐ |
| S025-9 | Cổng C trong `bizcity_findings@1`; mã `CT-MD/INV/COST/REV/ACC/REC/PER/LIN-*` có vì sao, cách sửa, căn cứ | W4 | P0 | có | ☐ |
| S025-10 | Engine Gate C: theo sự kiện sau ghi sổ, theo kỳ (đêm / trước khoá); `continuity_checks` chỉ thêm — ca T025-4 | W4 | P0 | có | ☐ |
| S025-11 | Khoá kỳ đòi Gate C không còn mã chặn (R-CONT-6) — ca T025-5 | W4 | P0 | có | ☐ |
| S025-12 | SC-CONT-1: không có API / action ghi trạng thái "đạt" của mã `CT-*` (R-CONT-7) | W4 | P1 | có | ☐ |
| S025-13 | Màn Dòng sự kiện của kỳ + checklist một sự kiện | W5 | P1 | có | ☐ |
| S025-14 | Màn Sẵn sàng khoá kỳ (6 điều kiện, thanh tiến độ, nút khoá kỳ có điều kiện) — ca T025-6 | W5 | P0 | có | ☐ |
| S025-15 | Bàn đánh giá: % giá vốn giải thích được, số sự kiện đạt; số đo `bizcity_continuity_*` | W5 | P1 | có | ☐ |
| S025-17 | Mặc định FIFO cho đơn vị mới: `costing_method` = `fifo` khi tạo đơn vị / chưa khai; đơn vị cũ ngầm hiểu `weighted_period`; đổi phương pháp = phiên bản chính sách từ đầu năm tài chính; lớp `opening` từ tồn đầu (đơn giá bình quân) khi chuyển sang FIFO — ca T025-3, T025-7 | W3 | P1 | có | ☐ <!-- [2026-11-03 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ duyệt D025-2 (mặc định FIFO) + hướng D025-6 (khoá kỳ) --> |
| S025-18 | Khoá kỳ đọc Gate C ([20 §6](20-KIEM-CHUAN-VONG-DOI.md)): `CT-*` vào `runDiagnostics` + `close-checks`; phân mức toàn vẹn (chặn trừ khi chấp nhận) / mặc định cảnh báo; thứ tự điều kiện; ảnh chụp + chốt phân bổ khi khoá; giai đoạn bóng — ca T025-5, T025-6 | W4 | P0 | có | ☐ |
| S025-16 | Hướng dẫn: "Hành trình mặt hàng", "Sẵn sàng khoá kỳ"; bài học từng mã `CT-*` | W5 | P1 | — | ☐ |

## Ca bằng chứng

| Mã | Ca |
|---|---|
| T025-1 | Một mặt hàng: mua → nhập → bán → giá vốn → trả; lineage đi được xuôi và ngược, đúng số |
| T025-2 | Bình quân: Σ phân bổ kỳ = phát sinh Nợ giá vốn; giá vốn trước / sau W2 không đổi trên dữ liệu thật |
| T025-3 | FIFO: nhập 100 × 100k, nhập 80 × 120k, xuất 120 → L001 100 + L002 20 = 12.400.000; phiếu nhập ghi lùi ngày → phân bổ mới thay bản cũ, bản cũ còn |
| T025-4 | Đổi mã giữa kỳ: chuỗi không đứt, báo cáo theo mã đọc đúng phiên bản |
| T025-5 | Trả hàng hoàn sai giá vốn → `CT-REV-001` → khoá kỳ bị chặn; sửa → mở được |
| T025-7 | Chuyển đơn vị từ bình quân sang FIFO từ đầu năm: lớp `opening` từ tồn đầu, kỳ cũ giữ nguyên bình quân, kỳ mới phân bổ theo lớp |
| T025-6 | Tồn chi tiết ≠ số dư 156 → `CT-REC-001`, thanh "Sẵn sàng khoá kỳ" 5/6, nút khoá kỳ ghi rõ còn thiếu |

## Log

| Khi | Ai | Việc |
|---|---|---|
| 2026-11-03 18:10 | Claude Code | Mở phase theo chỉ đạo chủ dự án (Accounting Continuity); ADR-0021 đề xuất, R-CONT, tài liệu, bản mẫu. Phản biện: không cứng hoá FIFO (Kernel đang bình quân tháng), `account_id` = phiên bản + số hiệu (ADR-0018), mã kiểm vào thư viện mã (cổng C). |
| 2026-11-03 19:30 | Claude Code | Chủ duyệt D025-2 (mặc định FIFO cho đơn vị mới, đơn vị cũ giữ bình quân); D025-6 hướng: mở rộng cơ chế khoá kỳ hiện có (R-DIAG-4), toàn vẹn chuỗi chặn trừ khi chấp nhận có lý do, mã khác mặc định cảnh báo (R-GATE-9). Sửa R-CONT-6 cho khớp. |
