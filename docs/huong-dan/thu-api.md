# Phân hệ API — Thử API, Hướng dẫn API

Dành cho người viết / tích hợp API.

## Thử API (API01)

Gọi thử mọi endpoint ngay trên giao diện, không cần Postman.

1. Bên trái: danh sách endpoint (đọc từ tài liệu máy chủ tự sinh, nhóm theo chủ đề). Gõ ô tìm để lọc theo đường dẫn / mô tả.
2. Chọn endpoint: điền **tham số** (đường dẫn, truy vấn) và **thân JSON** (khung mẫu dựng sẵn theo khuôn — sửa giá trị).
3. Xác thực: **Phiên đăng nhập của tôi** (quyền của tài khoản đang dùng) hoặc **Khoá API** (dán khoá `kt_…` — thử đúng như hệ thống ngoài gọi vào; tạo khoá ở **Khoá API**).
4. **Gửi** → xem mã trạng thái (2xx xanh, lỗi đỏ), thời gian, JSON trả về. **Chép lệnh curl** để gửi cho người khác chạy lại.
5. "Gửi gần đây": 20 lần gửi gần nhất (theo máy).

> POST / PUT / DELETE **ghi thật** vào dữ liệu đơn vị đang đăng nhập — thử trên bản test.

Endpoint mới viết (có schema) tự hiện trong danh sách. Tài liệu kỹ thuật đầy đủ (OpenAPI): `/api/docs`.

## Hướng dẫn API (API02)

Đọc các tài liệu `docs/api` ngay trong phần mềm: quy ước chung (xác thực, khoá chống trùng, phiên bản, lỗi), khuôn JSON từng loại chứng từ (bán, trả lại, mua, trả NCC, chuyển kho, điều chỉnh kho, thu chi…), và **13. Phiếu nhập tay** — hợp đồng API cho các màn nhập phiếu đang chạy dữ liệu giả.

## Nguồn dữ liệu màn hình (API03)

Xem [Nguồn dữ liệu màn hình](nguon-du-lieu.md).
