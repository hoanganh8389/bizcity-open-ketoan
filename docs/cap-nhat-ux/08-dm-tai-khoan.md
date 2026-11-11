# 08. Hệ thống tài khoản (ACC1) theo chuẩn danh mục phổ biến

<!-- [2026-11-11 Nguyễn Văn Thủy] màn tài khoản làm lại theo bố cục danh mục tài khoản phổ biến, bỏ cột / ô tích không có tác dụng (đóng góp) -->

Màn cũ có ~20 cột ô tích (TK FC, Acc VAT, Nợ, Vay, Luôn tăng, Sổ cái, Chi phí…) và hai kiểu xem; phần lớn ô tích không có code nào dùng. Làm lại theo chuẩn (khảo sát màn Hệ thống tài khoản, tệp Excel xuất, form, menu chức năng), giữ dữ liệu cũ.

## 1. Người dùng thấy gì

| Phần | Bây giờ |
|---|---|
| Tên màn / menu | **Hệ thống tài khoản** (ACC1) |
| Danh sách | Cây, 6 cột: Số tài khoản (⊞ / ⊟ mở thu con) · Tên tài khoản · Tính chất (Dư Nợ / Dư Có / Lưỡng tính) · Tên tiếng Anh · **Diễn giải** (mới) · Trạng thái. Tổng hợp in đậm, ngừng dùng hiện mờ. Nút Cột bật thêm TK tổng hợp, Cấp, các ô theo dõi chi tiết |
| Thanh nút | Thêm · Sửa · Xoá · Nạp · Xuất · **Nhân bản** · **Ngừng sử dụng / Dùng lại** · **Nhập Excel**; Mở rộng / Thu gọn cả cây; ô tìm số / tên; lọc trạng thái (bỏ lọc Cấp, Sổ cái, kiểu Dạng bảng) |
| Form | Số TK*, Tên TK*, TK tổng hợp, Tính chất*, Diễn giải · Theo dõi chi tiết theo (10 ô: Đối tượng, Nhân viên, Khoản mục CP, Bộ phận, Hợp đồng, Vụ việc, Dự án, Nguồn vốn, Mục thu/chi, Mặt hàng) · Tên tiếng Anh. Nút Huỷ · Ghi và thêm · Ghi. Trùng số / sai tiền tố tài khoản tổng hợp báo đỏ ngay tại ô |
| Xuất Excel | `Danh_sach_he_thong_tai_khoan.xlsx`: tiêu đề "DANH SÁCH HỆ THỐNG TÀI KHOẢN" (gộp ô), dòng trống, tiêu đề cột nền xám, STT · Số TK · Tên · Tính chất · Tên tiếng Anh · Diễn giải · Trạng thái; tổng hợp in đậm |
| Nhập Excel | Loại **Hệ thống tài khoản** (TI14 / nút ở màn): cùng bộ cột với tệp xuất → sửa rồi nhập lại. Thêm mới không ghi TK tổng hợp thì tự lấy tài khoản dài nhất là phần đầu số; tài khoản con thừa hưởng các ô theo dõi của tài khoản tổng hợp; ghi tài khoản tổng hợp trước con |

**Đối tượng** gộp hai cờ cũ "theo dõi đối tượng" và "ghi nhận công nợ" (mọi chỗ trong lõi đều đọc `track_partner OR is_debt`): ghi form đặt cả hai bằng nhau, tác dụng như cũ.

## 2. Bỏ khỏi màn (dữ liệu giữ nguyên)

TK ngoại tệ, thuế GTGT, vay, luôn tăng (tài sản), sổ cái, giá thành, công nợ nội bộ — không có code ghi sổ / báo cáo nào đọc. Chưa làm: chọn loại đối tượng (KH / NCC / NV) và mức "chỉ cảnh báo / bắt buộc nhập" cho từng ô theo dõi (ERP hiện luôn bắt buộc), tên tiếng Trung / Hàn, chuyển tài khoản hạch toán (gộp số liệu TK này sang TK khác).

## 3. Kỹ thuật

- Migration `0101_tai_khoan_dien_giai.sql`: `accounts.description text NOT NULL DEFAULT ''`. API tài khoản nhận / trả `description` (kernel `accounts`), test `apps/api/test/accounts.test.ts`.
- `features/catalog/AccountsPage.tsx` viết lại; xuất bằng `exceljs`; loại nhập `TAI_KHOAN` trong `lib/nhapExcel.ts`.
