# IN-INV-001 · Hoá đơn mua vào thiếu ký hiệu, tên hoặc mã số thuế người bán
<!-- [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25: trang bài học IN-INV-001 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** taxIssues (ACC78), INVOICE_FIELDS

## Vì sao kế toán cần

Bảng kê mua vào và tờ khai phải khớp dữ liệu cơ quan thuế. Hoá đơn thiếu ký hiệu hoặc mã số thuế người bán thì không đối chiếu được, thuế đầu vào có thể bị loại.

## Ví dụ sai

Phiếu mua có số hoá đơn 0000123 nhưng không có ký hiệu và nhà cung cấp chưa có mã số thuế.

## Ví dụ đúng

Phiếu mua có số, ký hiệu hoá đơn; nhà cung cấp có tên và mã số thuế đủ 10 hoặc 13 chữ số.

## Sửa ở đâu

Bổ sung ở hệ thống nguồn, hoặc kế toán bổ sung ở Bổ sung thông tin thuế (ACC78) từ hoá đơn gốc.
