# Cập nhật trải nghiệm (UX)

<!-- [2026-11-11 Nguyễn Văn Thủy] thư mục ghi các đợt cập nhật giao diện, trải nghiệm (đóng góp) -->

Mỗi đợt cập nhật giao diện một tệp: **đổi gì, người dùng thấy gì, dùng component nào, quay lại thế nào**. Chuẩn tham khảo: bố cục và thao tác của phần mềm kế toán phổ biến trên thị trường (MISA AMIS Kế toán), giữ đặc thù của mình (chi nhánh → kho, mã cha – con, lô / HSD, bảng hiện đủ dòng không phân trang, chữ **Ghi** thay "Cất").

| Đợt | Tệp | Tóm tắt |
|---|---|---|
| 1 | [01-giao-dien-xanh.md](01-giao-dien-xanh.md) | Giao diện Xanh, Thêm nhanh, Hay dùng, thêm danh mục ngay trên chứng từ (+ / F9), ô chọn dạng bảng có Tồn, kỳ có sẵn, chữ cam chưa duyệt, thẻ chỉ số, form chứng từ toàn màn, Thu tiền ngay |
| 2 | [03-nhap-excel-dung-chung.md](03-nhap-excel-dung-chung.md) | Trình nhập Excel 4 bước dùng chung (TI14): khách hàng, NCC, mặt hàng, kho; tự ghép cột, ngầm định, kiểm tra trước khi ghi, tệp lỗi |
| 3 | [04-tham-so-bao-cao.md](04-tham-so-bao-cao.md) | Bảng tham số báo cáo thành ngăn kéo bên phải (Chọn tham số), dòng tóm tắt tham số, ghim bên trái tuỳ chọn, số chứng từ là liên kết |

Việc tiếp theo: [02-viec-tiep-theo.md](02-viec-tiep-theo.md).

## Quy ước khi làm màn mới

1. Danh sách: dùng `CatalogToolbar` (danh mục) hoặc `VoucherListPage` (chứng từ); nút **Thêm** là nút chính màu xanh; bảng không phân trang.
2. Màn có nút Thêm thì nhận `?them=1` bằng `useThemTuDiaChi` (lib/themNhanh.ts) và khai một dòng ở `THEM_NHANH` nếu là chứng từ / danh mục hay lập.
3. Ô chọn khách / NCC / mặt hàng trên form chứng từ: bật thêm nhanh (`PartnerPicker addKind`, `ItemPicker canAdd`); ô kho dùng `ChonKho` (tự có nút +).
4. Dòng chứng từ: màu theo trạng thái bằng `dongChungTu(status)` (lib/trangThai.ts).
5. Form chứng từ: `Modal voucher={{ total }}` (hoặc `VoucherModal total`) để có khung toàn màn, tổng tiền góc phải, dòng phím tắt, Ctrl + S.
6. Danh sách trống: `Empty` có `actions` (nút Thêm / Nhập Excel).
7. Bảng lọc bên trái: khoảng ngày dùng `SideKy` (có ô Kỳ chọn nhanh).
