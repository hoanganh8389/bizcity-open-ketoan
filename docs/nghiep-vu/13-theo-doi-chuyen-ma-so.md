# 13. Theo dõi chuyển mã hàng sang mã số cha – con

Bảng theo dõi chung cho cả team. Phương án và lý do: tài liệu 12. Mỗi đợt xong thì cập nhật file này cùng commit.

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Đích cuối: mã chỉ có chữ số. Mọi thứ bám `item_id`, mã chỉ là tên gọi |
| 2 | Mã cha là mã thường, nhập và bán bình thường. Chỉ đánh dấu không bán khi sản phẩm không có bản chung |
| 3 | Mã con = mã cha + 2 số ở cuối, không mang nghĩa. Họ mã chỉ có một cấp |
| 4 | Màu, size ghi vào tên sản phẩm con. Có ô ghi chú. Không làm ô Màu, ô Size |
| 5 | Ô Biến thể quyết định xử lý, phần mềm không đọc nghĩa từ mã, tên hay ghi chú |
| 6 | Khuyến mại mặc định sang thuế. Chỉ loại khi: Biến thể Nội bộ, quà của sản phẩm dưới 24 tháng, hoặc chương trình cố ý chọn loại |
| 7 | Nội bộ và thuế dùng chung một danh mục, nội bộ là nguồn. Phần đồng bộ làm sau |
| 8 | `B`, `C`, `D` chưa xử lý trong đợt đầu, khi nào đụng đến mới làm |

## Tiến độ

| GĐ | Việc | Trạng thái |
|---|---|---|
| 0 | Chốt phương án (tài liệu 12) | Xong |
| 1 | Ô Biến thể, Loại hàng; tự điền từ đuôi cũ; Thêm sản phẩm con; cảnh báo NCC dùng lại mã | Xong trên nhánh `feat/ma-so-cha-con`, chờ họp chốt mới vào `main`, `test` |
| 2 | Đối chiếu luật đọc ô với luật đọc chữ trên đơn thật | Chưa làm |
| 3 | Phần mềm chuyển sang đọc ô, mở mã số cho các biến thể còn lại | Chưa làm |
| 4 | Website bán hàng theo `item_id`, biết đổi mã | Chưa làm |
| 5 | Mã mới sinh ra toàn số | Chưa làm |
| 6 | Đổi mã cũ theo từng đợt; tìm được theo mã cũ | Chưa làm |
| 7 | Mã cũ chỉ còn để tra cứu | Chưa làm |
| Sau | Đồng bộ danh mục sang thuế, tự chuyển phiếu mua và chuyển kho, lựa chọn "Loại khỏi thuế" ở chương trình | Chưa làm |

## Luật đang áp dụng (09/11/2026)

- Mọi biến thể là sản phẩm con mã số; tên tuỳ ý, phần mềm chỉ đọc ô Biến thể.
- Đổi mã có đuôi sang mã số được; biến thể và `item_id` đi theo mặt hàng.
- Không gộp hàng Nội bộ với hàng có sang thuế.
- **Ô Gửi lên thuế là căn cứ duy nhất cho mọi việc tách khỏi thuế.** Mọi mặt hàng (cả mã cha) có ô này, mặc định bật. Tắt thì không lên hoá đơn thuế: dòng 0đ tách sang bill Z, dòng có thu tiền ở lại bill chính nhưng bị loại khỏi hoá đơn. Biến thể Nội bộ luôn tắt, khoá ở CSDL. Phần mềm không cần biết biến thể là gì để quyết định thuế.
- Mã cha không có Biến thể, vẫn có ô Gửi lên thuế.
- Quầy bán, hoá đơn, chính sách trên WordPress đọc ô qua `TGS_Item_Variant` (tài liệu 14).

## Việc của từng bên

| Bên | Việc |
|---|---|
| Team công nghệ | Các giai đoạn trên |
| Người vận hành | Rà mã lạ sau GĐ 1, chọn nhóm hàng và shop thử ở GĐ 4 |
| Kế toán | Kiểm tra số đối chiếu trước khi đổi mã, xác nhận bảng đổi tài khoản khi làm phần sang thuế |

## Nhật ký

| Ngày | Nội dung |
|---|---|
| 07/11/2026 | Chốt phương án, mở GĐ 1 |
| 07/11/2026 | GĐ 1 làm xong trên nhánh. Chạy thử trên dữ liệu máy phát triển: 2.526 mã tận cùng `Z` đều mang Biến thể Nội bộ, không lệch mã nào so với cách quầy bán nhận `Z` |
