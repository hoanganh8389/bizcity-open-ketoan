# ADR-0021 · Accounting Continuity — tính liên tục, truy xuất được và kiểm chứng được của dữ liệu kế toán xuyên vòng đời
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — ADR-0021: trụ cột Accounting Continuity (chủ dự án: "Open Kế Toán… phải trở thành một framework bảo đảm Accounting Continuity") -->

- Trạng thái: **Chấp nhận** <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] ADR-0021 — chấp nhận --> — chủ dự án (Johnny Chu) duyệt 2026-11-05: *"đồng ý với toàn bộ đề xuất của bro"* — D025-1..8 ([PHASE-025](../phases/PHASE-025-ACCOUNTING-CONTINUITY/README.md)).
- Nguồn: chủ dự án 2026-11-03 — *"Mã code, mã tài khoản liền mạch từ mua ⇒ kho ⇒ bán ⇒ giá vốn ⇒ lãi lỗ… Mã hàng hóa có versioning, item_id giữ nguyên… Core kế toán cần đóng vai trò định hướng… versioning về mã code, giữ sự chuẩn hóa item_id là một trụ cột lớn của core kế toán"*; *"Conformance Checklist không chỉ nằm ở từng sự kiện kinh tế mà phải kiểm chuẩn được toàn bộ vòng đời của đối tượng kế toán, từ phát sinh ban đầu đến khi tất toán, đóng kỳ và kết chuyển"*; *"lineage mới giải thích được giá vốn ấy được hình thành từ những phiếu nhập nào"*.
- Ngày: 2026-11-03 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (trụ cột + luật); thi hành K2–K3 theo PHASE-025.
- Luật mới: [R-CONT](../rules/RULE-CONTINUITY.md). Nền: [ADR-0017](ADR-0017-dinh-danh-hang-hoa-bat-bien.md) (item_id bất biến, mã có phiên bản), [ADR-0018](ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (danh mục có phiên bản), [ADR-0009](ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) (chính sách có phiên bản), [ADR-0019](ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md) (hai cổng), [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) (tôn chỉ, thư viện mã).

## Vấn đề

Mỗi chứng từ đúng chưa đủ. Kiểm từng giao dịch riêng lẻ vẫn để lọt:

- phiếu mua đúng, phiếu nhập đúng, phiếu bán đúng — nhưng **không nối được** với nhau để biết giá vốn hình thành từ đâu;
- mã hàng đổi giữa kỳ làm **đứt lịch sử** tồn kho / báo cáo lãi lỗ theo mã;
- trả hàng hợp lệ nhưng **hoàn sai giá vốn** của lần bán gốc;
- tổng Nợ = tổng Có nhưng **sổ chi tiết tồn kho ≠ số dư tài khoản hàng tồn kho**;
- từng chứng từ hợp lệ nhưng **cuối kỳ không đủ điều kiện khoá sổ**.

Bút toán Nợ 632 / Có 156 chỉ cho biết **giá trị** đã hạch toán; **lineage** mới giải thích giá vốn đó hình thành từ những phiếu nhập nào.

## Phản biện (trước khi chốt)

1. **Tính giá mặc định bình quân gia quyền tháng; xuất lô là việc của kho** <!-- [2026-11-03 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ duyệt D025-2 (mặc định FIFO) + hướng D025-6 (khoá kỳ) --> <!-- [2026-11-03 09:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — chủ chốt lại D025-2: tính giá mặc định bình quân gia quyền tháng; FIFO / FEFO theo lô là quy tắc xuất kho, tách khỏi giá vốn (thay quyết định 07:30 PM) -->: hai câu hỏi khác nhau, hai chính sách khác nhau. **Phương pháp tính giá** (hàng xuất mang đơn giá nào): mọi đơn vị mặc định **bình quân gia quyền theo tháng**; nhập trước – xuất trước (FIFO), bình quân liên hoàn, thực tế đích danh là lựa chọn của đơn vị. **Quy tắc xuất lô** (lấy lô nào ra trước): hàng có hạn dùng xuất theo FEFO (lô hết hạn trước), còn lại FIFO theo lô — là vận hành kho, gợi ý / chặn chọn lô, **không đổi giá vốn**. Bán lẻ hàng có date cần quy tắc xuất lô, không cần đổi phương pháp tính giá. Kernel hôm nay tính giá vốn **bình quân gia quyền theo tháng** cho từng nhóm tính giá (`costing.service.ts`); chế độ kế toán cho phép nhập trước – xuất trước, bình quân gia quyền, thực tế đích danh, và đơn vị phải **áp dụng nhất quán**. Vậy phương pháp tính giá là **chính sách có phiên bản** (ADR-0009), đổi từ đầu năm tài chính; mô hình dữ liệu phải chung cho mọi phương pháp: **lớp giá vốn** (`valuation_layer`) + **phân bổ** (`cost_allocation`). Với FIFO mỗi phiếu nhập là một lớp; với bình quân, lớp là "bể bình quân của kỳ" và lineage vẫn chỉ ra các phiếu nhập góp vào bể đó.
2. **Giá vốn vẫn tính sau ghi sổ** (R-POST-7). FIFO bị ảnh hưởng bởi phiếu nhập ghi lùi ngày: phân bổ phải **có phiên bản, chỉ thêm** (bản phân bổ mới thay thế bản cũ, không ghi đè), chốt khi khoá kỳ. Không tính giá vốn đồng bộ trên đường ghi sổ.
3. **`account_id` không phải khoá thay thế.** ADR-0018 đã chốt: tài khoản định danh bằng **số hiệu trong một phiên bản hệ thống tài khoản**. "Liên kết sổ cái với số hiệu có hiệu lực" = (`chart_version`, `account_code`) + bảng ánh xạ khi đổi chế độ; không thêm id nhân tạo.
4. **Mã kiểm của checklist phải vào thư viện mã** (R-GATE-10): `MD-001`, `FIFO-002`… trong bản mẫu trở thành mã của **Gate C — kiểm chuẩn vòng đời** (`CT-*`) trong `bizcity_findings@1`, có vì sao / cách sửa / căn cứ; không phải nhãn riêng của màn.
5. **"PASS do engine tính, không người dùng tự đánh dấu"** — đồng ý và nâng thành luật (R-CONT-7). Người dùng không tích ô "đạt"; họ sửa dữ liệu, engine chạy lại.
6. **Phụ thuộc thứ tự**: lineage theo `item_id` cần bảng `items` (PHASE-024 B2). Không chờ: đợt đầu dựng lineage **chỉ đọc** trên dữ liệu đang có (`inventory_movements` đã trỏ `event_id` + `line_no`; `inventory_costs` là bể bình quân tháng), khoá tạm theo mã hàng — người dùng thấy giá trị ngay, chuyển sang `item_id` khi B2 xong.

## Quyết định

1. **Accounting Continuity là trụ cột của Core**, ngang Sổ cái bất biến: [CANON §0.1](../00-CANON.md) liệt kê ba trụ cột — (I) sổ cái chỉ thêm, (II) định danh bất biến + mã có phiên bản, (III) liên tục kế toán. Phục vụ tôn chỉ ADR-0020: người dùng nhìn thấy cả vòng đời và chỗ đứt.
2. **Mười một định danh nối vòng đời** (bảng ở [PHASE-025 · 10](../phases/PHASE-025-ACCOUNTING-CONTINUITY/10-MO-HINH-DU-LIEU.md)): đối tượng `item_id`; tồn kho `variant_id`, `valuation_pool_id`; nghiệp vụ `economic_event_id`, `document_line_id`; giá vốn `valuation_layer_id`, `cost_allocation_id`; kế toán (`chart_version`, `account_code`), `journal_entry_id`; phiên bản `item_version_id`, `policy_version_id`. Mọi dòng kho, dòng giá vốn, dòng sổ mang đủ khoá để đi ngược về nghiệp vụ gốc.
3. **Lineage là sổ thứ hai**: lớp giá vốn và phân bổ **chỉ thêm**, có phiên bản, có cùng độ bền như sổ cái; tổng phân bổ của một dòng xuất = giá vốn đã ghi sổ của dòng đó.
4. **Gate C — kiểm chuẩn vòng đời**: ngoài Gate A (danh mục) và Gate B (trước khi ghi sổ), Core kiểm **chuỗi** sau khi ghi sổ và trước khi khoá kỳ: mua ↔ nhập ↔ lớp ↔ phân bổ ↔ xuất ↔ bút toán; trả / huỷ ↔ nghiệp vụ gốc; sổ chi tiết ↔ sổ cái; điều kiện khoá kỳ. Mã `CT-*` trong thư viện mã; kết quả do engine tính; khoá kỳ đòi các mã chặn = 0.
5. **Sự kiện vận hành ≠ sự kiện kế toán**: dòng thời gian của một mặt hàng ghi rõ sự kiện nào **đổi kế toán** (có bút toán / đổi giá trị tồn) và sự kiện nào chỉ **vận hành** (đặt hàng, đổi mã hiển thị, chuyển kho cùng nhóm tính giá). Người dùng nhìn là biết cái gì làm thay đổi sổ.
6. **Đổi mã, đổi ánh xạ tài khoản, đổi chế độ không viết lại dữ liệu**: mã hàng có phiên bản trên `item_id` (ADR-0017); tài khoản qua phiên bản hệ thống tài khoản + bảng ánh xạ (ADR-0018); phương pháp tính giá và luật định khoản qua `policy_version_id` (ADR-0009). Báo cáo nhiều kỳ đọc qua phiên bản, không sửa dòng cũ.

## Hệ quả

- PHASE-025 mở: mô hình dữ liệu, Gate C, màn **Hành trình mặt hàng** (lineage), checklist theo sự kiện, độ sẵn sàng khoá kỳ, bản mẫu.
- `bizcity_findings@1` thêm cổng **C** và họ mã `CT-*`.
- Kernel thêm `valuation_layers`, `cost_allocations` (chỉ thêm), engine tính giá dùng chung cho bình quân / FIFO / đích danh.
- Khoá kỳ đọc Gate C qua cơ chế khoá kỳ hiện có: mã toàn vẹn chuỗi chặn trừ khi chấp nhận có lý do, mã khác mặc định cảnh báo (R-CONT-6, [PHASE-025 · 20 §6](../phases/PHASE-025-ACCOUNTING-CONTINUITY/20-KIEM-CHUAN-VONG-DOI.md)).

## Phương án đã cân nhắc

- **Chỉ kiểm từng chứng từ** (như hiện nay): không phát hiện được đứt chuỗi, lệch sổ chi tiết – sổ cái — bị loại.
- **Cứng hoá FIFO**: trái nguyên tắc nhất quán phương pháp của từng đơn vị, phá dữ liệu bình quân đang chạy — bị loại; chọn mô hình lớp chung.
- **Lưu lineage trong JSON của chứng từ**: không truy vấn được ngược (từ lớp → mọi lần xuất), không ràng buộc được — bị loại; chọn bảng có khoá.
