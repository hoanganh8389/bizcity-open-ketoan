# IN-VAT-001 · Thuế suất giảm dùng ngoài khoảng ngày được giảm
<!-- [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25: trang bài học IN-VAT-001 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** NQ 204/2025/QH15, rulepack vat-vn

## Vì sao kế toán cần

Thuế suất giảm chỉ áp cho hàng bán ra trong khoảng thời gian theo nghị quyết. Ngoài khoảng đó mà vẫn dùng thì thuế đầu ra kê khai thiếu.

## Ví dụ sai

Dòng bán ngày 2027-01-05 dùng loại thuế 8% trong khi thời gian giảm đã hết.

## Ví dụ đúng

Dòng bán ngày 2027-01-05 dùng loại thuế 10%; trong khoảng được giảm thì dùng 8%.

## Sửa ở đâu

Sửa loại thuế ở hệ thống nguồn rồi gửi lại. Kế toán kiểm loại thuế mặc định của mặt hàng (Danh mục mặt hàng). Khoảng ngày lấy từ rulepack vat-vn, xem ở Kiểm chuẩn.
