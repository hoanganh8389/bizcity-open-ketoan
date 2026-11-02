# IN-ITEM-009 — Mặt hàng còn nháp, chưa kích hoạt
<!-- [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: bài học mã IN-ITEM-009 (R-INTAKE-11) -->

**Lớp:** L3 danh mục · **Mức:** chặn · **Cổng:** B (trạm tiền kiểm) · **Luật:** [R-GATE-6](../../rules/RULE-GATE.md), [ADR-0019](../../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md)

## Chuyện gì xảy ra

Chứng từ có dòng hàng dùng một mặt hàng đang ở trạng thái **Nháp**. Mặt hàng thành nháp khi khai báo ở danh mục còn thiếu thứ bắt buộc (Gate A): chưa có đơn vị tính gốc (`ITEM-BLOCK-001`), hoặc chưa có nhóm hạch toán mà đơn vị không có nhóm mặc định (`ITEM-BLOCK-002`).

## Vì sao không ghi sổ

Ghi sổ với mặt hàng thiếu đơn vị tính thì sổ kho không quy đổi được số lượng; thiếu nhóm hạch toán thì không biết ghi vào tài khoản kho / giá vốn / doanh thu nào. Phần mềm giữ chứng từ ở **Trạm kiểm tra đầu vào** thay vì ghi sai.

## Sửa thế nào

1. Mở mặt hàng ở **Danh mục → Mặt hàng** (lọc "Nháp"), bổ sung phần còn thiếu theo khung **Vì sao** trong form. Lưu xong, mặt hàng **tự kích hoạt**.
2. Các chứng từ đang chờ ở Trạm kiểm tra vì mặt hàng này được **kiểm lại tự động**; mục nào hết lỗi chặn thì nộp lại (hoặc để hệ thống nguồn gửi lại).

## Ví dụ

```json
{ "docType": "sale", "lines": [{ "lineKey": "1", "sku": "SUA01", "unit": "thùng", "qty": 1, "amountBeforeTax": 600000, "taxCode": "R08", "taxAmount": 48000 }] }
```

`SUA01` đã có ở danh mục nhưng chưa có đơn vị tính gốc → nháp → chứng từ này bị giữ với IN-ITEM-009.
