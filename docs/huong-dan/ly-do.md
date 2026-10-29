# Lý do – tài khoản (ACC18)

Lý do quyết định bản chất nghiệp vụ và là **nguồn ưu tiên cao nhất** khi chọn tài khoản.

## Màn hình

Lưới gồm: Lý do, Mã lý do, Tài khoản ngầm định, Mã VAT ra, Mã VAT vào, Tài khoản VAT nhập khẩu, Tài khoản thuế nhập khẩu, Mã khoản mục, Tài khoản nợ VAT nhập khẩu, Tài khoản doanh thu, Tài khoản chi phí, Mã lưu chuyển tiền tệ, Thuộc module. Nút "Cột" bật thêm các cột Mặc định cho, Ghi sổ, Ngừng dùng.

Thanh nút: Thêm · Sửa (hoặc bấm đúp dòng) · Xoá · Nạp · Xuất · **Tìm file excel để nhập** · **Tạo mẫu nhập liệu**. Nạp tệp Excel cập nhật theo Mã lý do, ô trống giữ nguyên. Thêm lý do mới qua Excel thì tệp phải có cột Lý do và Thuộc module (ghi đúng tên module như trên lưới).

Chỉ xoá được lý do chưa dùng trên chứng từ nào. Lý do đã dùng thì bỏ tích "Đang dùng".

**Mã khoản mục** của lý do được ghi vào mọi dòng bút toán của chứng từ mang lý do đó.

## Thứ tự tra tài khoản

| Tài khoản cần | Lấy từ (theo thứ tự) |
|---|---|
| Đối ứng (công nợ, tiền) | Lý do → tài khoản ngầm định "receivable" |
| Doanh thu | Lý do → nhóm hạch toán của mặt hàng |
| Hàng bán trả lại | Lý do → nhóm hạch toán (TK hàng bán trả lại) |
| Giá vốn | Lý do → nhóm hạch toán; hàng tặng + tuỳ chọn → chi phí khuyến mãi |
| Kho | Nhóm hạch toán |
| Thuế | Loại thuế → ngầm định "tax_output" |
| Tiền | Hình thức thanh toán |

## Lý do mặc định

Chứng từ không ghi lý do thì dùng lý do được đặt **mặc định cho** loại chứng từ đó (ví dụ XBA cho hoá đơn bán, NTH1 cho hàng bán trả lại). Mỗi loại chứng từ nên có đúng một lý do mặc định.

## Tuỳ chọn

- **Giá vốn hàng tặng ghi vào chi phí khuyến mãi**: dòng hàng tặng (0 đồng) thì giá vốn ghi Nợ tài khoản chi phí khuyến mãi thay vì giá vốn.

