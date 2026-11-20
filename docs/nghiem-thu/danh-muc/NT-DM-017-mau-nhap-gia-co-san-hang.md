# NT-DM-017 · Bảng giá (DM14): tệp mẫu nhập giá có sẵn danh sách mặt hàng
<!-- [2026-11-20 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: tệp mẫu nhập giá liệt kê sẵn sản phẩm để điền luôn (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM14 Bảng giá — lưới giá → **Nhập Excel** → **Tải tệp mẫu** |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 20/11/2026 |
| Trạng thái | Đã chốt (kiennt, 20/11/2026) |

## 1. Yêu cầu

| Trước | Sau |
|---|---|
| Tệp mẫu chỉ có dòng tiêu đề và một dòng ví dụ (`110011001 · Lon · 25000`) — người dùng phải tự gõ mã hàng, ĐVT | Tệp mẫu liệt kê **sẵn mọi mặt hàng / ĐVT của bảng giá đang chọn**: Mã hàng · Tên hàng · ĐVT · Đơn giá. Ô Đơn giá đã có giá thì điền sẵn giá đang có, chưa có giá thì để trống — người dùng điền vào rồi nhập luôn |

- Danh sách giống lưới giá (mỗi mặt hàng × mỗi ĐVT đã khai một dòng), lấy lúc bấm Tải tệp mẫu.
- Sheet **Hướng dẫn** giữ nguyên, câu cuối đổi thành: sheet đầu đã có sẵn dữ liệu — điền / sửa rồi nhập lại; dòng không cần có thể xoá.
- Nhập lại: như cũ (NT-DM-008) — ô giá trống giữ nguyên, dòng không đổi giá không ghi.

## 2. Phạm vi

- `apps/web/src/lib/nhapExcel.ts`: thêm tuỳ chọn `mau` (dòng dữ liệu điền sẵn) cho loại nhập — loại không khai thì tệp mẫu như cũ.
- `apps/web/src/components/NhapExcelWizard.tsx` (trình nhập chung của Nguyễn Văn Thủy — chỉ hàm tải tệp mẫu và câu chú thích cạnh nút; đóng góp): dùng `mau` nếu loại nhập có.
- `apps/web/src/lib/nhapExcelDanhMuc.ts`: loại nhập giá bán (`nhapGiaBan`) khai `mau` = các dòng của lưới giá.
- `docs/huong-dan/bang-gia.md`.
- Không đổi API, CSDL; các màn nhập khác không đổi.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | DM14 → chọn bảng giá → lưới giá → Nhập Excel → Tải tệp mẫu | Tệp có đủ dòng như lưới giá (số dòng = "Tất cả" của lưới); cột Đơn giá điền giá đang có, ô chưa giá trống |
| 2 | Điền giá vài ô trống, không sửa gì khác, nhập lại tệp | Kiểm tra: các ô vừa điền "Thêm mới", dòng khác không ghi; không dòng lỗi |
| 3 | Mở trình nhập ở màn khác (vd DM12) → Tải tệp mẫu | Như cũ: tiêu đề + dòng ví dụ |
