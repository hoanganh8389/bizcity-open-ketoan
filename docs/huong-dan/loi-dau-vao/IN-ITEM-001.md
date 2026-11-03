# IN-ITEM-001 — Mã hàng chưa có trong danh mục (đơn vị đã tắt tự thêm mặt hàng)
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3: bài học mã IN-ITEM-001 (R-INTAKE-11) -->

**Lớp:** L3 danh mục · **Mức:** chặn · **Cổng:** B (trạm tiền kiểm) · **Luật:** D024-3, [R-ITEM-6](../../rules/RULE-ITEM.md), [ADR-0019](../../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md)

## Chuyện gì xảy ra

Chứng từ có dòng hàng mang một mã chưa có trong danh mục mặt hàng, và kế toán trưởng của đơn vị đã **tắt tự thêm mặt hàng từ chứng từ** (màn **Quy định dữ liệu danh mục**, HT09).

Phần mềm đã tạo sẵn một **mặt hàng nháp** từ dòng chứng từ, điền sẵn tên và đơn vị tính. Chứng từ được giữ ở **Trạm kiểm tra đầu vào**.

Khi đơn vị **bật** tự thêm mặt hàng (như trước), mã lạ chỉ là gợi ý `IN-MD-004`: chứng từ vào sổ, mặt hàng được thêm thẳng vào danh mục.

## Vì sao không ghi sổ

Mặt hàng tự thêm từ chứng từ chưa ai kiểm đơn vị tính và nhóm hạch toán. Nếu vào sổ ngay theo nhóm mặc định, kho, giá vốn và doanh thu có thể ghi sai, ví dụ dịch vụ bị tính tồn kho. Đơn vị đã chọn kiểm trước khi ghi.

## Sửa thế nào

1. Mở **Danh mục → Mặt hàng**, lọc "Nháp". Kiểm đơn vị tính và nhóm hạch toán của mặt hàng mới, rồi lưu; mặt hàng tự kích hoạt. Nhiều mặt hàng cùng lúc: nút **Kích hoạt hàng loạt**.
2. Chứng từ ở Trạm kiểm tra được **kiểm lại tự động** khi mặt hàng kích hoạt. Sau đó nộp lại, hoặc để hệ thống nguồn gửi lại.
3. Về lâu dài: hệ thống bán hàng nên đồng bộ danh mục (`PUT /api/v1/products`) **trước** khi gửi chứng từ có mã mới.

Gửi lại khi mặt hàng còn nháp thì gặp [IN-ITEM-009](IN-ITEM-009.md).

## Ví dụ

```json
{ "docType": "sale", "lines": [{ "lineKey": "1", "sku": "BANH-MOI", "name": "Bánh quy bơ 200g", "unit": "Hộp", "qty": 2, "amountBeforeTax": 90000, "taxCode": "R08", "taxAmount": 7200 }] }
```

`BANH-MOI` chưa có ở danh mục. Cửa nạp trả `IN-ITEM-001`, và danh mục có mặt hàng nháp `BANH-MOI` (tên "Bánh quy bơ 200g", ĐVT "Hộp").
