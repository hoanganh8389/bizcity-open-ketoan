# Hàng tồn kho và giá vốn

Căn cứ: **Chuẩn mực kế toán số 02 — Hàng tồn kho** (Quyết định 149/2001/QĐ-BTC), **Thông tư 99/2025/TT-BTC** (hướng dẫn tài khoản 156, 157, 632, 136, 336). Ngày rà soát: **13/10/2026**. Khấu hao tài sản cố định, phân bổ công cụ dụng cụ: xem hướng dẫn màn Tài sản (Thông tư 45/2013/TT-BTC).

## Giá gốc hàng nhập kho

Giá gốc gồm giá mua, chi phí thu mua và chi phí liên quan trực tiếp, **trừ** các khoản thuế được hoàn lại (thuế GTGT đầu vào được khấu trừ) và chiết khấu thương mại, giảm giá hàng mua.

Phần mềm: phiếu nhập mua ghi Nợ 156 theo **tiền hàng chưa thuế**, thuế GTGT ghi riêng Nợ 1331.

## Phương pháp tính giá xuất kho

Chuẩn mực 02 cho phép: giá đích danh, **bình quân gia quyền**, nhập trước xuất trước. Chế độ kế toán hiện hành không dùng phương pháp nhập sau xuất trước.

Phần mềm dùng **bình quân gia quyền cả tháng**:

```
Đơn giá xuất = (Giá trị tồn đầu tháng + Giá trị nhập trong tháng) / (Số lượng tồn đầu + Số lượng nhập)
```

- Tính riêng cho từng mặt hàng, từng **đơn vị hạch toán** (các chi nhánh cùng đơn vị dùng chung một đơn giá), từng bộ sổ.
- Tồn đầu tháng = tồn cuối tháng trước.
- Phương pháp đã chọn phải dùng **nhất quán** cả năm tài chính; muốn đổi phải thuyết minh trên báo cáo tài chính (nguyên tắc nhất quán, Chuẩn mực 01).

## Các trường hợp đặc biệt

| Nghiệp vụ | Phần mềm ghi | Căn cứ |
|---|---|---|
| Trả hàng cho nhà cung cấp | Giảm kho theo giá trị tính từ tồn đầu tháng, chênh lệch với tiền trả lại xử lý theo quy tắc trong màn Tính giá vốn | Chuẩn mực 02 (giá gốc); Thông tư 99 tài khoản 156, 331 |
| Chuyển kho cùng đơn vị hạch toán | Không đổi giá vốn; hàng trên đường ghi 1579 | Thông tư 99 tài khoản 157 |
| Chuyển kho khác đơn vị hạch toán | Phải thu / phải trả nội bộ 13681 / 33681 | Thông tư 99 tài khoản 136, 336 |
| Bán nội bộ cho chi nhánh khác | Doanh thu nội bộ, giá vốn bằng giá bán, không đưa vào công thức bình quân | Thông tư 99 tài khoản 511, 632, 136 |
| Kiểm kê thừa / thiếu | Chờ xử lý 3381 / 1381 | Thông tư 99 tài khoản 138, 338 |
| Hàng khách trả lại | Nhập lại kho theo giá vốn của tháng | Thông tư 99 tài khoản 5213, 632 |

## Dự phòng giảm giá hàng tồn kho

Chuẩn mực 02 yêu cầu ghi giảm khi giá trị thuần có thể thực hiện được thấp hơn giá gốc (tài khoản 2294). Phần mềm **chưa tự tính**; kế toán lập phiếu kế toán khi có quyết định trích lập.
