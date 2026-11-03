# PHASE-025 · 00 — Kế hoạch: trụ cột Accounting Continuity
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — kế hoạch tổng: ba trụ cột Core, quyết định D025-1..8, đợt W0–W5 -->

## 1. Ba trụ cột của Core (CANON §0.1)

| Trụ cột | Bảo đảm | Quyết định / luật |
|---|---|---|
| I · Sổ cái bất biến | sổ chỉ thêm; sửa = đảo + ghi mới; Nợ = Có | R-LEDGER, CANON §1 |
| II · Định danh bất biến, mã có phiên bản | `item_id` không đổi; mã hàng / tài khoản / chính sách có phiên bản + ngày hiệu lực | ADR-0017, ADR-0018, ADR-0009, R-ITEM |
| III · Liên tục kế toán | mọi con số đi ngược được về nghiệp vụ gốc; lineage giá vốn; kiểm chuẩn vòng đời; khoá kỳ đòi chuỗi lành | **ADR-0021, R-CONT** |

Cả ba phục vụ tôn chỉ (ADR-0020): người dùng quyết định; Core làm vấn đề nhìn thấy được và chỉ đúng chỗ sửa, bằng một ngôn ngữ là thư viện mã.

## 2. Hiện trạng (đối chiếu code 2026-11-03)

| Đã có | Ở đâu | Dùng cho Continuity |
|---|---|---|
| Sự việc kế toán có phiên bản | `accounting_events` (`doc_key`, `version`), lịch sử phiên bản | `economic_event_id` |
| Dòng kho trỏ sự việc + số dòng | `inventory_movements` (`event_id`, `line_no`, `sku`, `qty`, `amount`, `kind`, `branch_id`, `warehouse_code`) | `document_line_id` (tạm: `event_id` + `line_no`) |
| Giá vốn bình quân tháng theo nhóm tính giá | `inventory_costs`, `costing.service.ts` (nhóm = đơn vị hạch toán của chi nhánh) | lớp "bể bình quân kỳ" |
| Chứng từ giá vốn ghi sổ | chứng từ `cogs`, R-POST-7 | `journal_entry_id` |
| Chính sách kế toán có phiên bản | `posting_policy_versions`, `policy_version` trên dòng sổ | `policy_version_id` |
| Liên kết trả hàng → bút toán gốc | `linkReturnToOriginal` (link `return`) | khởi đầu R-CONT-4 |
| Đối chiếu tồn – sổ | tự chẩn đoán `STOCK_LEDGER_MATCH` (dự kiến S024-13) | R-CONT-5 |

| Còn thiếu | Bù bằng |
|---|---|
| `item_id`, phiên bản mã | PHASE-024 B2 (`items`, `item_codes`) |
| Lớp giá vốn, phân bổ từng dòng xuất | `valuation_layers`, `cost_allocations` (S025-5, S025-6) |
| FIFO / đích danh | engine tính giá chung (S025-7) |
| Kiểm chuỗi sau ghi sổ, trước khoá kỳ | Gate C, mã `CT-*` (S025-9..12) |
| Màn truy vết | Hành trình mặt hàng, Sẵn sàng khoá kỳ (S025-13..15) |

## 3. Quyết định chờ chủ duyệt

| Mã | Quyết định | Lý do |
|---|---|---|
| D025-1 | Accounting Continuity là **trụ cột III** của Core, ghi vào CANON §0.1 | yêu cầu chủ dự án; ngang tầm sổ cái |
| D025-2 | **Không cứng hoá FIFO**: phương pháp tính giá là chính sách có phiên bản (FIFO / bình quân kỳ / bình quân liên hoàn / đích danh); mô hình lớp + phân bổ chung | nguyên tắc nhất quán phương pháp của đơn vị; dữ liệu bình quân đang chạy giữ nguyên |
| D025-3 | Lớp và phân bổ **chỉ thêm**, có phiên bản (`superseded_by`); tính lại trước khoá kỳ, chốt khi khoá | phiếu nhập ghi lùi ngày làm đổi FIFO; không ghi đè |
| D025-4 | Bình quân: lớp = **bể kỳ** của nhóm tính giá; lineage của bể liệt kê các phiếu nhập góp vào bể (đóng góp SL, GT) | người dùng vẫn thấy "giá vốn hình thành từ phiếu nào" khi chưa dùng FIFO |
| D025-5 | **Gate C** = kiểm chuẩn vòng đời; mã `CT-*` vào `bizcity_findings@1` (cổng C), có căn cứ | R-GATE-10 / 11: một ngôn ngữ |
| D025-6 | Khoá kỳ đòi Gate C không còn mã chặn của kỳ (R-CONT-6) | "mỗi chứng từ hợp lệ nhưng cuối kỳ không đủ điều kiện khoá" |
| D025-7 | Dòng thời gian ghi **effect** của từng sự kiện: `accounting` / `operational` (R-CONT-8); hợp đồng đọc `bizcity_lineage@1` | người dùng thấy cái gì đổi sổ |
| D025-8 | W1 dựng lineage **chỉ đọc** trên dữ liệu đang có (khoá theo mã hàng), chuyển sang `item_id` khi PHASE-024 B2 xong | giá trị sớm, không chờ |

## 4. Đợt

| Đợt | Việc | Cổng chốt |
|---|---|---|
| W0 | ADR-0021, R-CONT, CANON §0.1, tài liệu phase, bản mẫu | chủ duyệt D025-* |
| W1 | Lineage chỉ đọc: API `GET /api/v1/lineage/items/:sku` (nhập, xuất, bể bình quân, bút toán, trả); màn Hành trình mặt hàng bản đầu; `document_line_id` = `event_id:line_no` | ca T025-1: một mặt hàng mua → bán → giá vốn → trả đi được cả hai chiều |
| W2 | Bảng `valuation_layers`, `cost_allocations` (chỉ thêm, RLS); engine bình quân ghi lớp bể + phân bổ; tổng phân bổ = giá vốn ghi sổ | `CT-COST-003` = 0 trên dữ liệu thật; so giá vốn trước / sau |
| W3 | FIFO và đích danh như chính sách (`posting_policy_versions.costing_method`); phân bổ lại khi có phiếu ghi lùi | ca T025-3: nhập 100k, nhập 120k, xuất → lớp đúng |
| W4 | Gate C: mã `CT-*`, chạy sau commit / đêm / trước khoá kỳ; khoá kỳ đòi chuỗi lành; Bàn đánh giá hiện số | ca T025-4..6 |
| W5 | Màn Sẵn sàng khoá kỳ, checklist sự kiện, số đo; hướng dẫn | nghiệm thu với kế toán |

Thứ tự với PHASE-024: W1 song song B2; W2 sau B2b (`item_id` trên bảng kho); W3 sau W2.
