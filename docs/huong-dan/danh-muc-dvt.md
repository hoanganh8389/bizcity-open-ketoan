# Danh mục đơn vị tính (DM15)

Danh sách **tên đơn vị tính** dùng chung: Hộp, Lon, Lốc, Lốc_4, Thùng, Kg… Đây **chỉ là tên** — không có tỉ lệ quy đổi.

## Danh mục này để làm gì

- Khai ĐVT ở mặt hàng thì ô ĐVT **gợi ý chọn** từ danh mục này, nên mọi mặt hàng viết tên giống nhau. Gõ "hộp" sẽ được lưu thành "Hộp".
- Tỉ lệ quy đổi khai ở **từng mặt hàng** (Danh mục mặt hàng → thẻ ĐVT). Ví dụ Sữa TH 110ml có Hộp 1 · Lốc 4 · Thùng 48.
- Mọi số lượng cuối cùng đều quy về **ĐVT nhỏ nhất** (tỉ lệ 1). Tồn kho chỉ tính theo ĐVT này. ĐVT khác chỉ là trung gian khi đặt hàng, nhập hàng, bán hàng.

## Danh sách tự cập nhật

| Nguồn | Nghĩa |
|---|---|
| Khởi tạo | Có sẵn khi tạo đơn vị: Cái, Hộp, Lon, Chai, Gói, Thùng, Lốc, Lốc_4, Lốc_6, Kg, Lít… |
| Tự thêm khi khai mặt hàng | Ai khai một ĐVT mới ở mặt hàng thì tên đó **tự vào danh mục**. Áp dụng cho mọi cách khai: form, nhập Excel, đồng bộ, dữ liệu mẫu. |
| Thêm tay | Thêm ở màn này (nút **Thêm**). |

## Thêm, sửa, xoá

- **Thêm**: nhập tên 1–32 ký tự, gồm chữ, số, khoảng trắng và `_ - . / ( ) + ×`. Tên đã có thì báo trùng (không phân biệt hoa thường). Khoảng trắng thừa được bỏ.
- **Sửa**: bấm đúp một dòng để mở ở chế độ xem, bấm **Sửa** mới sửa được.
  - Tên **chưa có mặt hàng dùng**: đổi tên được.
  - Tên **đang có mặt hàng dùng**: không đổi tên được, vì các phiếu đã ghi theo tên này. Muốn đổi thì thêm tên mới rồi khai lại ở mặt hàng.
- **Ẩn**: bỏ tích **Đang dùng** thì tên không hiện trong gợi ý nữa. Mặt hàng đang dùng tên này vẫn giữ nguyên.
- **Xoá**: chỉ xoá được tên chưa mặt hàng nào dùng. Cột **Số mặt hàng dùng** cho biết tên đang được dùng ở bao nhiêu mặt hàng.

Lọc ở cột **Số mặt hàng dùng**. Nút **Xuất** để xuất danh sách ra Excel.

## Nhập từ Excel
<!-- [2026-11-18 09:40 AM kiennt] NT-DM-004 — mục Nhập Excel cho DM15 (đóng góp) -->

Nút **Nhập Excel** nạp danh sách ĐVT từ tệp. Tệp **Xuất** của màn này dùng được ngay để nhập, kể cả tệp xuất ở một máy chủ khác: xuất ở máy cũ rồi nhập ở máy mới.

| Cột | Cách điền |
|---|---|
| Đơn vị tính (*) | Tên ĐVT. Tên **đã có** (không phân biệt hoa thường) thì dòng đó là cập nhật; **chưa có** thì thêm mới. Không đổi tên qua Excel, đổi tên ở form. |
| Đang dùng | Có / Không (tệp Xuất ghi **x** là đang dùng, **ô trống** là ngừng dùng). Cột có ô nào được điền thì ô trống hiểu là Không, nên tệp xuất nạp sang máy khác giữ đúng trạng thái. Cả cột trống hoặc không có cột: tên mới là Có, tên đã có giữ nguyên. |
| Ghi chú | Ô trống: tên đã có giữ nguyên ghi chú cũ. |

Các cột khác của tệp xuất (Số mặt hàng dùng, Người sửa, Ngày sửa…) được bỏ qua. Bước **Kiểm tra dữ liệu** báo các dòng không hợp lệ: thiếu tên, tên quá 32 ký tự hoặc có ký tự lạ, trùng tên trong tệp, tên đang nằm trong Thùng rác. Dòng lỗi không được ghi.
