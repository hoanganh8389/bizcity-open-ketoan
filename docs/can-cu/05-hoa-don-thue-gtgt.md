# Hoá đơn và thuế GTGT

Căn cứ: **Luật Thuế GTGT 48/2024/QH15** (sửa đổi bởi Luật 149/2025/QH15), **Nghị định 181/2025/NĐ-CP**, **Nghị quyết 204/2025/QH15** và **Nghị định 174/2025/NĐ-CP** (giảm thuế), **Nghị định 123/2020/NĐ-CP** (sửa đổi bởi Nghị định 70/2025/NĐ-CP), **Thông tư 32/2025/TT-BTC**. Ngày rà soát: **13/10/2026**.

## Phần mềm làm gì với hoá đơn

Phần mềm kế toán **không phát hành hoá đơn**. Hoá đơn do hệ thống bán hàng lập và gửi cơ quan thuế; phần mềm nhận dữ liệu hoá đơn kèm chứng từ để:

- ghi sổ doanh thu, thuế GTGT đầu ra (33311), thuế đầu vào (1331);
- lập **bảng kê hoá đơn bán ra, mua vào** theo từng loại thuế suất;
- hoá đơn điều chỉnh giảm, hàng bán trả lại ghi **số âm** trên bảng kê.

## Loại thuế suất trong phần mềm

| Mã | Ý nghĩa |
|---|---|
| KCT | Không chịu thuế GTGT |
| R00 | Thuế suất 0% (bán ra) |
| R05 / V05 | Thuế suất 5% |
| R08 / V08 | Thuế suất 8% (giảm từ 10%) |
| R10 / V10 | Thuế suất 10% |

Chữ R là bán ra, V là mua vào. Kế toán khai thêm mã ở màn **Loại thuế** khi cần.

## Giảm thuế GTGT xuống 8%

- **Nghị quyết 204/2025/QH15**: giảm 2% thuế suất cho nhóm hàng hoá, dịch vụ đang chịu 10%, **từ 01/7/2025 đến hết 31/12/2026**.
- Danh mục hàng **không** được giảm và cách ghi hoá đơn: **Nghị định 174/2025/NĐ-CP** (các phụ lục loại trừ).
- Việc cần làm: trước 01/01/2027 rà lại mặt hàng đang dùng R08 / V08; nếu không có văn bản gia hạn thì chuyển về R10 / V10.

## Khấu trừ thuế GTGT đầu vào

Điều kiện chính (Luật Thuế GTGT 48/2024 và Nghị định 181/2025):

- Có hoá đơn GTGT hợp pháp.
- Có chứng từ **thanh toán không dùng tiền mặt** đối với hàng hoá, dịch vụ mua vào **từ 5 triệu đồng trở lên** (giá đã có thuế), trừ một số trường hợp luật quy định.

Phần mềm ghi thuế đầu vào vào 1331 theo loại thuế của dòng hàng. Việc có đủ điều kiện khấu trừ hay không do kế toán xét trên hồ sơ — phần mềm chưa kiểm tra hình thức thanh toán của từng hoá đơn mua vào.

## Sai sót hoá đơn

Nghị định 70/2025 và Thông tư 32/2025 quy định lại cách xử lý: hoá đơn **điều chỉnh** hoặc **thay thế**, theo thoả thuận với người mua. Hoá đơn điều chỉnh giảm và hoá đơn thay thế (huỷ hoá đơn gốc) đều thể hiện trên bảng kê bằng số âm của phần bị giảm / bị thay.
