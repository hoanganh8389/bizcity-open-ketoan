# ADR-0023 · Chứng từ sản xuất (MRP): giữ chỗ cổng, Nhóm Lõi không làm, cộng đồng phát triển
<!-- [2026-11-03 10:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — ADR-0023: cổng chứng từ sản xuất giữ chỗ (chủ dự án 2026-11-03: "chứng từ sản xuất cho MRP để sẵn cổng, nhưng ko dev, việc đó đưa vào skills để dev, cộng đồng phát triển tiếp") -->

- Trạng thái: **Chấp nhận** — chủ dự án quyết 2026-11-03.
- Nguồn: chủ dự án 2026-11-03 — *"chứng từ sản xuất cho MRP để sẵn cổng, nhưng ko dev, việc đó đưa vào skills để dev, cộng đồng phát triển tiếp"*.
- Ngày: 2026-11-03 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (không đổi Kernel).
- Liên quan: năng lực `ledger.doctype.production` (`planned`, giai đoạn 6, [bizcity-standard.json](../standard/bizcity-standard.json)); [PHASE-027](../phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/README.md).

## Vấn đề

App sản xuất (MRP, xây dựng theo công trình) cần ghi xuất nguyên vật liệu → chi phí sản xuất dở dang → nhập thành phẩm, rồi tính giá thành. Hợp đồng nạp `bizcity_ledger_intake@1` hôm nay có 10 loại chứng từ, **không** có loại nào cho sản xuất, và gói định khoản nền không có lý do xuất nguyên vật liệu hay nhập thành phẩm. Không có cổng thì dev (và AI) sẽ lách bằng loại có sẵn: điều chỉnh kho ghi vào thừa / thiếu chờ xử lý, thành phẩm nhập giá 0. Sổ vẫn cân, nhưng giá thành và giá vốn sai.

## Quyết định

1. **Giữ chỗ ba tên loại chứng từ**: `production_issue` (xuất nguyên vật liệu cho sản xuất), `production_receipt` (nhập thành phẩm), `production_cost_close` (kết chuyển, tính giá thành kỳ). Tên được giữ để không ai dùng vào việc khác; Kernel **chưa** nhận các loại này.
2. **Nhóm Lõi không làm** phần sản xuất ở giai đoạn này.
3. **Cộng đồng phát triển** theo một quy trình có sẵn: ADR mở cổng → hợp đồng (thêm loại vào `bizcity_ledger_intake`) → luật định khoản và giá thành trong Kernel, có test → ca F22 + phép kiểm chuẩn. Quy trình này đóng gói thành một skill cho AI (`contribute-production-module`, đi cùng PR CK-1 của PHASE-027).
4. **Công cụ kiểm báo đúng tình trạng**: gặp một trong ba loại trên, lệnh kiểm trả **SKIP "cổng chưa mở"** kèm đường dẫn tới quy trình mở cổng, không trả FAIL như lỗi của dev.
5. **Cấm lách**: không dùng `stock_adjustment` hay `manual_journal` để giả xuất nguyên vật liệu / nhập thành phẩm; không nhập thành phẩm giá 0.

## Hệ quả

- App sản xuất hôm nay chỉ ghi được phần mua nguyên vật liệu và bán thành phẩm; phần sản xuất ở giữa nằm ngoài sổ cho tới khi cổng mở.
- Bảng tiết kiệm của PHASE-027 xếp MRP ở mức lợi thấp, nói rõ vì sao.

## Kiểm bằng

Công cụ kiểm của PHASE-027 (CK-1): ca test "gặp loại sản xuất → SKIP cổng chưa mở"; `module accounting-check` báo loại sản xuất bằng thông điệp cổng, không bằng lỗi hợp đồng.
