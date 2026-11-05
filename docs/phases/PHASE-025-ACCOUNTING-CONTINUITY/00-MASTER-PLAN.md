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

> **Chủ duyệt 2026-11-05** (Johnny Chu – Chu Hoàng Anh: *"đồng ý với toàn bộ đề xuất của bro"*): D025-1, D025-3..8 duyệt như bảng dưới; D025-2 / 2b / 2c và hướng D025-6 đã chốt trước đó. [ADR-0021](../../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) chuyển **Chấp nhận**. <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ duyệt D025-* -->

| Mã | Quyết định | Lý do |
|---|---|---|
| D025-1 | Accounting Continuity là **trụ cột III** của Core, ghi vào CANON §0.1 | yêu cầu chủ dự án; ngang tầm sổ cái |
| D025-2 | **Tính giá mặc định bình quân gia quyền tháng, không cứng hoá** <!-- [2026-11-03 09:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ chốt lại D025-2: tính giá mặc định bình quân gia quyền tháng; FIFO / FEFO theo lô là quy tắc xuất kho, tách khỏi giá vốn (thay quyết định 07:30 PM) -->: phương pháp tính giá là chính sách có phiên bản (bình quân tháng / bình quân liên hoàn / FIFO / đích danh); **mọi đơn vị mặc định bình quân gia quyền tháng** (đúng cách Kernel tính hôm nay, `costing.service.ts`); muốn đổi thì tạo phiên bản chính sách từ đầu năm tài chính; mô hình lớp + phân bổ chung cho mọi phương pháp. Thay bản 07:30 PM (đơn vị mới mặc định FIFO) | nhất quán phương pháp của đơn vị; dữ liệu đang chạy giữ nguyên; FIFO là lựa chọn, làm sau `item_id` (B2b) và giá vốn sau ghi sổ (B5) |
| D025-2b | **Quy tắc xuất lô tách khỏi tính giá** <!-- [2026-11-03 09:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ chốt lại D025-2: tính giá mặc định bình quân gia quyền tháng; FIFO / FEFO theo lô là quy tắc xuất kho, tách khỏi giá vốn (thay quyết định 07:30 PM) -->: hàng có hạn dùng xuất theo **FEFO** (lô hết hạn trước), hàng không hạn theo **FIFO theo lô**; quy tắc của kho, gợi ý / chặn chọn lô khi xuất, **không đổi giá vốn**. Tồn lô hôm nay đã chia FEFO ([08-mua-hang](../../nghiep-vu/08-mua-hang.md)) | "hàng hóa bán lẻ vẫn chủ yếu có date" là chuyện lô xuất trước, không phải đơn giá xuất |
| D025-2c | **Không có "hợp đồng chốt" giá vốn; kế toán bấm tính lại; cửa sổ ngắn là số quản trị** <!-- [2026-11-03 10:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ dự án: bỏ Finality contract, tính lại thủ công, cửa sổ 7 / 30 ngày do kế toán trưởng cấu hình là góc nhìn quản trị --> : không thêm trạng thái "đã chốt" nhiều bậc cho giá vốn. Dòng giá vốn là bút toán có phiên bản; tính lại = phiên bản mới, không ghi đè im lặng. Tính lại do kế toán bấm (mặc định thủ công, không tự chạy). Kế toán trưởng có thể xem đơn giá theo cửa sổ 7 / 30 ngày cạnh đơn giá tháng để **quản trị**; sổ, báo cáo thuế và BCTC vẫn dùng một phương pháp nhất quán cả năm (D025-2). Màn hiện nhãn "quản trị" / "sổ chính thức" trên từng cột | cửa sổ ngắn không thay phương pháp ghi sổ; CEO không nhầm số quản trị với số trên báo cáo |
| D025-3 | Lớp và phân bổ **chỉ thêm**, có phiên bản (`superseded_by`); tính lại trước khoá kỳ, chốt khi khoá | phiếu nhập ghi lùi ngày làm đổi FIFO; không ghi đè |
| D025-4 | Bình quân: lớp = **bể kỳ** của nhóm tính giá; lineage của bể liệt kê các phiếu nhập góp vào bể (đóng góp SL, GT) | người dùng vẫn thấy "giá vốn hình thành từ phiếu nào" khi chưa dùng FIFO |
| D025-5 | **Gate C** = kiểm chuẩn vòng đời; mã `CT-*` vào `bizcity_findings@1` (cổng C), có căn cứ | R-GATE-10 / 11: một ngôn ngữ |
| D025-6 | Khoá kỳ đọc Gate C: **mở rộng cơ chế khoá kỳ đang chạy** (R-DIAG-4 + danh sách điều kiện), không dựng cơ chế thứ hai. Mã toàn vẹn chuỗi (`CT-LIN-*`, `CT-REC-*`) chặn trừ khi người có quyền ghi lý do chấp nhận có bằng chứng; các mã còn lại mặc định **cảnh báo** (R-GATE-9), đơn vị tự nâng lên chặn khi sẵn sàng. Chi tiết: [20 §6](20-KIEM-CHUAN-VONG-DOI.md) <!-- [2026-11-03 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ duyệt D025-2 (mặc định FIFO) + hướng D025-6 (khoá kỳ) --> | "mỗi chứng từ hợp lệ nhưng cuối kỳ không đủ điều kiện khoá" — nhưng không làm kỳ kẹt cứng |
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
