<!-- [2026-11-16 kiennt] màn Danh mục: sơ đồ theo nhóm chức năng, thanh nút chung, cột mặc định gọn (đóng góp) -->
# Đợt 15 — Danh mục gọn: sơ đồ theo nhóm, thanh nút chung, cột mặc định

## Đổi gì

**Trang Quy trình của Danh mục** (`/nhom/danh-muc`) vẽ theo **nhóm chức năng của menu**, không theo từng màn:

Tổ chức → Đối tượng → Tài khoản, ngân hàng → (song song) Chi phí · Mặt hàng · Tài sản · Thuế suất.

- Mỗi thẻ liệt kê các màn của nhóm, bấm thẳng vào màn. Danh sách màn lấy từ menu (`menu-gon.ts`), đã lọc theo quyền; màn "đang phát triển" không hiện.
- Menu Danh mục: **Biểu thuế** tách khỏi "Tài khoản, ngân hàng" thành nhóm **Thuế suất** riêng.

**Thanh nút của các màn danh mục** (`CatalogToolbar` có `phai` hoặc `left`):

- Phần chọn kiểu xem (Danh sách / Cây cha – con, ô tìm của cây tài khoản…) bên trái; nút chức năng lề phải, cao 28px.
- Thứ tự: Thêm · Nạp · Xuất · **In** (in màn đang xem — nút In ở tiêu đề trang ẩn) · nút riêng của màn.
- **Không còn nút Sửa**: bấm đúp dòng mở hộp thoại chi tiết ở chế độ xem, bấm Sửa trong đó (Ctrl+E vẫn vào thẳng sửa).
- Không hiện dòng "Đã nạp lúc …".
- **Bỏ thanh lọc trên** (tìm nhanh, nhóm, trạng thái, Tất cả / Thêm hôm nay, thẻ Đang dùng / Chưa dùng): lọc bằng ô lọc từng cột. Giữ ô tìm ở màn dạng cây (Hệ thống tài khoản, Nhóm hàng, Cơ cấu tổ chức) và ô "Hiện cả mục đã ẩn" (mục ẩn không nạp vào bảng).

Áp cho: Khách hàng, Nhà cung cấp, Nhóm KH/NCC, Nhân viên, Mặt hàng, Loại kho, Đơn vị tính, Bảng giá, Hệ thống tài khoản, Tài khoản ngân hàng, Hình thức thanh toán, Biểu thuế, Khoản mục, Mục thu/chi, Hợp đồng, Vụ việc, Công trình/dự án, Loại TSCĐ, Loại CCDC, Nguồn vốn, Mục đích sử dụng.

**Cột mặc định** (cột khác bật ở nút Cột; "Trả về mặc định" nay ở đầu danh sách cột, danh sách cột hiện tên cột thay cho chú thích):

| Màn | Cột mặc định |
|---|---|
| DM12 Khách hàng | Mã, Tên, Thuộc đơn vị cha, Nhóm KH, Tên công ty, Người tạo |
| DM13 Nhà cung cấp | Mã, Tên, Thuộc đơn vị cha, Nhóm NCC, MST, Giới hạn nợ, Người tạo |
| DM04 Nhân viên | Mã, Tên, Chức vụ, Email, Chi nhánh làm việc (Điện thoại + Di động gộp một cột Di động, ẩn) |
| DM15 Đơn vị tính | Đơn vị tính, Số mặt hàng dùng, Đang dùng, Người sửa, Ngày sửa, Ghi chú |

**Form**

- Khách hàng / NCC: ô **Thuộc đơn vị cha** chỉ chọn đối tượng cùng nhóm ở ô Thuộc nhóm (chưa chọn nhóm thì khoá; đổi nhóm thì bỏ cha). Mobile + Telephone gộp một ô **Di động** (ghi cả hai trường). Bỏ nút "+ Thêm đơn vị con" trên thanh nút (thêm trong hồ sơ đơn vị cha).
- Nhân viên: Điện thoại + Di động gộp một ô Di động.
- Loại kho (DM18): bỏ hai thẻ, màn chỉ còn danh sách; **Nghiệp vụ dùng loại kho** chuyển vào ngăn Hướng dẫn (vẫn sửa được). Hộp thoại mở ở chế độ xem. **TK kho** phải là tài khoản cấp cuối — tài khoản tổng hợp báo đỏ, khoá Ghi.
- Bảng giá: nút in bảng giá đổi tên "In bảng giá" (khỏi trùng nút In màn).

## Component

- `CatalogToolbar`: thêm `left`, `phai`.
- `HelpDrawer` / `PageHeader`: thêm `extra` / `helpExtra` (phần riêng của màn trong ngăn Hướng dẫn).
- `PartnerPicker`: thêm `groupCode`.
- `SoDo.nhom` (`layout/so-do-nhom.ts`) + `NhomFlow` (`SoDoNhom.tsx`): sơ đồ theo nhóm chức năng.

## Quay lại thế nào

Màn bỏ `phai` / `left` là về thanh nút cũ (có Sửa, nút lề trái). Không đổi API, không migration.
