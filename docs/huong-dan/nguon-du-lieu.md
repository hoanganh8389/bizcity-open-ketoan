# Nguồn dữ liệu màn hình (API03)

Các màn nhập phiếu (bán hàng, trả lại, mua hàng, trả NCC, chuyển kho) được làm **trước** API thật. Mỗi loại phiếu chọn một nguồn:

| Nguồn | Nghĩa |
|---|---|
| **Dữ liệu giả** (mặc định) | Phiếu lưu ở trình duyệt máy này, nạp sẵn vài phiếu mẫu (tệp `mau-*.json`). Không vào sổ kế toán, người khác không thấy. Màn hiện dải "DỮ LIỆU GIẢ" |
| **API thật** | Màn gọi `/api/v1/trade-documents` (hợp đồng: Hướng dẫn API → 13. Phiếu nhập tay). Chưa có endpoint thì màn báo lỗi — bật lại "Dữ liệu giả" |

- Lựa chọn **nhớ theo máy** (mỗi người tự chọn, không ảnh hưởng người khác).
- Cột "Dữ liệu giả trên máy này": số phiếu đã thêm / sửa thử; **Trả mẫu ban đầu** xoá phần đã thử, về đúng dữ liệu mẫu.
- Cột "Endpoint cần có": danh sách endpoint bạn phụ trách API cần viết cho loại phiếu đó.

Cách làm của bạn phụ trách API: viết endpoint → thử ở **Thử API** → bật "API thật" ở đây → mở màn phiếu chạy cùng giao diện. Không phải sửa màn hình.
