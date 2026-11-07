# NT-MH-002 · Sản phẩm con và ô Biến thể (giai đoạn 1)
<!-- [2026-11-07 06:10 PM Nguyễn Văn Thủy] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | Danh mục hàng, mua hàng |
| Màn hình | DM10, MH26, MH22 |
| Bộ phận yêu cầu | Quản trị hệ thống |
| Ngày tạo | 07/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Mục đích quản trị

Mã hàng rồi sẽ chỉ còn chữ số. Nghĩa của đuôi mã chuyển sang ô Biến thể. Giai đoạn này chỉ ghi nhận và thêm sản phẩm con cho màu, size. Thuế, tồn, giá vốn, cách quầy bán xử lý không đổi.

## 2. Khai báo trước

Danh mục mặt hàng có sẵn. Không cần khai thêm.

## 3. Các bước thao tác

1. Vào DM10, xem cột Biến thể, Loại hàng; lọc theo biến thể.
2. Mở mã thường, bấm **Thêm sản phẩm con**, gõ tên có màu, size, bấm tạo.
3. Thử đổi mã có đuôi `Z` sang mã số, thử gộp hàng Nội bộ vào hàng thường.
4. Vào MH26 xem bảng Biến thể.
5. Vào MH22, nhận hoá đơn có mã NCC đã học nhưng tên khác hẳn.

## 4. Số liệu đầu vào

Mã cha `170521001`, đơn vị Hộp và Thùng (24 Hộp), thuế R08, V08, có dấu dưới 24 tháng.

## 5. Kết quả mong đợi

| Tình huống | Mong đợi |
|---|---|
| Mã `110051001Z`, `Q05940063Z`, `VQMM0006Z` | Biến thể Nội bộ |
| Mã `110051001K`, `M`, `T`, `Q` | Chia giá, Khuyến mại, Theo chương trình, Kẹp quà |
| Mã `110051001B` | Đuôi khác |
| `ComboBimboDK`, `TS302B` | Thường, vì không đọc nghĩa từ chữ cuối của mã ngoài quy tắc |
| Thêm con thứ nhất, thứ hai | `17052100101`, `17052100102`, `item_id` riêng, trỏ đúng cha |
| Mã con | Có đủ đơn vị tính, thuế và dấu dưới 24 tháng của cha |
| Mã cha sau khi thêm con | Vẫn bán được, trừ khi tích chỉ để gom |
| Xoá mã con rồi thêm mới | Không cấp lại số đã dùng |
| Con thứ 100 | Dùng 3 số |

**Bút toán:** không phát sinh. Danh mục không sinh bút toán.

**Báo cáo phải thấy:** MH26 có dòng `##`, mặc định cộng về mã cha.

## 6. Trường hợp lệch chuẩn

| Tình huống | Mong đợi |
|---|---|
| Tên trùng, khác hoa thường và khoảng trắng | Từ chối |
| Tên trống, mã cha không có | Từ chối |
| Thêm con cho mã con | Từ chối, họ mã một cấp |
| Mã cha còn chữ | Từ chối, đổi sang số trước |
| Chọn Nội bộ, Kẹp quà, Chia giá, Khuyến mại, Theo chương trình cho mã số | Từ chối |
| Đổi `Z` sang mã mất `Z`, đổi `M`, `Q`, `T`, `K` sang số | Từ chối |
| Đổi `Z` sang mã khác vẫn có `Z` | Được, giữ `item_id` |
| Đổi mã thường sang mã có `Z` | Ô đi theo thành Nội bộ |
| Gộp hàng Nội bộ với hàng thường, cả hai chiều | Từ chối |
| Gửi ô Biến thể khi lưu mặt hàng | Không đổi |
| NCC đổi cách ghi tên, giữ mã | Vẫn tự nhận |
| NCC dùng lại mã cho hàng khác hẳn | Không tự nhận, đưa về gợi ý |

## 7. Kết quả chạy

Tệp test: `apps/api/test/san-pham-con.test.ts`. Nhánh: `feat/ma-so-cha-con`.

Chạy thử migration trên dữ liệu máy phát triển, có hoàn tác:

| Kiểm tra | Kết quả |
|---|---|
| Mã tận cùng `Z` / mang Nội bộ / lệch | 2.526 / 2.526 / 0 |
| Mã bị đổi `updated_at` | 0 |
| Thời gian chạy trên 42.016 dòng | Khoảng 9 giây |

Chưa kiểm tra trên dữ liệu production và trên quầy bán thật.
