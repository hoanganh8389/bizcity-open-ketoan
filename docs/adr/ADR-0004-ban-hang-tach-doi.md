# ADR-0004 · Bán hàng tách đôi: dòng bán thuộc Kernel, báo cáo bán hàng là module
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

- Trạng thái: Chấp nhận
- Ngày: 2026-10-29 · Người quyết: chủ dự án
- Luật / hợp đồng liên quan: R-LEDGER-7, R-LEDGER-11, R-BOUND-3, `bizcity_ledger_intake@1`

## Bối cảnh

Dòng bán sinh ra **trong cùng giao dịch** ghi sổ chứng từ `sale` / `sale_return`, gồm `sales_lines` và các bảng dẫn xuất khác. Báo cáo bán hàng (tổng hợp, chi tiết, lãi gộp) chỉ đọc dữ liệu đó. [REUSE-MAP §6](../standard/REUSE-MAP.md) còn để ngỏ câu hỏi: `sales` thuộc Kernel hay là module.

## Quyết định

- **Dòng bán là bảng tra cứu (projection) của Kernel.** Nó sinh trong giao dịch ghi sổ (R-LEDGER-11), và chỉ Kernel được ghi.
- **Báo cáo bán hàng là module.** Module đọc dòng bán qua view `bizcity_read.sales_lines` (R-BOUND-3), không join thẳng vào bảng nhân.
- CRM, POS và các module khác đọc dòng bán qua cùng view đó. Chúng không phải phụ thuộc vào module báo cáo.

## Hệ quả

- **Được:** Kernel giữ đúng một cửa ghi. Báo cáo có thể thay hoặc bỏ mà không đụng tới sổ.
- **Việc phải làm:**
  - định nghĩa view `bizcity_read.sales_lines` (PHASES 2.5);
  - chuyển phần bán hàng của `modules/reports` sang `modules/ban-hang` (PHASES 3).
- **Cách đo trên bảng điểm:** SC-MOD-2 (module báo cáo không ghi bảng nhân) và SC-MOD-1 (không import Kernel).

## Phương án đã cân nhắc

- *Toàn bộ bán hàng là module.* Dòng bán phải sinh trong giao dịch sổ, nên module sẽ phải ghi bên trong giao dịch của Kernel. Như vậy phá R-LEDGER-4. Loại.
- *Toàn bộ bán hàng là Kernel.* Kernel phình thêm phần báo cáo, và cộng đồng không thay được màn báo cáo. Loại.
