# Chi nhánh (DM02)

Cửa hàng, kho, văn phòng. Mọi bút toán gắn một chi nhánh; mọi báo cáo lọc được theo chi nhánh.

Lưới: Mã chi nhánh, Mô tả (tên gọi), Ghi chú, Tên công ty, Số ĐKKD/MST, Địa chỉ, Điện thoại, Theo dõi, Đơn vị hạch toán, Bộ phận. Thanh nút Thêm · Sửa (bấm đúp) · Xoá · Nạp · Xuất.

Form: **Thông tin cơ bản** (Mã chi nhánh*, Mô tả*, Ghi chú, Số ĐKKD/MST, Theo dõi) · **Thông tin in report** (Tên công ty, Địa chỉ, Điện thoại, Fax) · **Hạch toán** (Đơn vị hạch toán, Bộ phận, Mã tham chiếu).

| Ô | Ghi chú |
|---|---|
| Mã chi nhánh | **Phải trùng** mã hệ thống bán hàng gửi trong chứng từ (`branchCode`). Không trùng → chứng từ bị từ chối "Chi nhánh … chưa khai báo" |
| Đơn vị hạch toán | Nhóm các chi nhánh hạch toán chung (ví dụ theo tỉnh); dùng cho giá vốn và đối chiếu nội bộ |
| Bộ phận | Bộ phận của chi nhánh (danh mục Bộ phận), quy ước BH + mã cửa hàng (cửa hàng 26001 → BH26001). Bút toán tự động của chi nhánh (doanh thu, giá vốn, trả lại…) mang bộ phận này để xem lãi lỗ từng cửa hàng. Chưa gắn thì cột hiện chữ đỏ "chưa gắn"; quay về dữ liệu gốc của danh mục bộ phận tự gắn theo quy ước |
| Mã tham chiếu ở hệ thống nguồn | Ví dụ mã site bán hàng, để tra ngược |

Chỉ xoá được chi nhánh chưa có chứng từ; chi nhánh đã dùng thì bỏ tích "Theo dõi" để ngừng.
