# 01. Giao diện Xanh và thêm nhanh ngay trên chứng từ

<!-- [2026-11-11 Nguyễn Văn Thủy] đợt 1 cập nhật trải nghiệm (đóng góp) -->

Ngày: 11/11/2026. Áp cho mọi người dùng; ai quen giao diện trước đó vào **avatar góc phải → Dùng giao diện cổ điển** (nhớ theo máy, bấm lại để về Xanh).

## 1. Người dùng thấy gì

| Chỗ | Trước | Bây giờ |
|---|---|---|
| Khung trang | Thanh trên xanh nhạt, menu trái nền sáng | Thanh trên **trắng**, menu trái **nền tối**, mục đang chọn nền xanh lá; một màu chính, tiêu đề bảng xanh xám, dòng đang chọn xanh nhạt |
| Đầu menu trái | — | Nút **Thêm nhanh**: bảng các chứng từ / danh mục hay lập (Tiền, Mua hàng, Bán hàng, Kho, Tổng hợp, Danh mục); bấm là mở màn với form thêm mới bật sẵn |
| Menu trái | — | Mục **Hay dùng**: màn đã ghim + màn mở nhiều; nút **Hay dùng trang này** ghim màn đang xem |
| Ô chọn khách hàng / NCC trên chứng từ | Danh sách mã — tên | **Bảng** Mã · Tên · Mã số thuế · Địa chỉ · Điện thoại; nút **+** trong ô và dòng **+ Thêm khách hàng "…" (F9)** ở chân: thêm ngay, ghi xong mã mới tự điền vào phiếu |
| Ô chọn mặt hàng trên chứng từ | Mã — tên | **Bảng** Mã · Tên · ĐVT · **Tồn** (của chi nhánh đang làm việc); **+ / F9** thêm mặt hàng ngay trên dòng phiếu |
| Ô kho trên phiếu | Chỉ chọn | Thêm nút **+**: thêm kho cho đúng chi nhánh của phiếu, ghi xong tự chọn |
| Danh sách chứng từ | Phiếu chưa duyệt chữ mờ | Phiếu chưa duyệt / chuyển kho chờ nhận **chữ cam**; phiếu huỷ chữ mờ |
| Nút Thêm ở danh sách | Nút trắng | Nút chính **màu xanh** |
| Bảng lọc bên trái | Từ ngày, Đến ngày | Thêm ô **Kỳ**: Hôm nay, Hôm qua, Tuần này, Đầu tháng đến nay, Cả tháng này, Tháng trước, Đầu quý đến nay, Cả quý này, Quý trước, Đầu năm đến nay, Cả năm nay, Năm trước |
| Danh sách trống | Một dòng chữ | Hình nhỏ + câu + nút **+ Thêm …** |
| Danh mục Đối tượng | — | **Thẻ chỉ số**: Nợ phải thu quá hạn, Tổng nợ phải thu, Nợ phải trả quá hạn, Tổng nợ phải trả (bấm để xem chi tiết; giờ tính số ở góc thẻ; nút ⌃ thu gọn) |
| Danh mục Mặt hàng | — | Thẻ: Mã còn hàng · Mã hết hàng · **Mã âm kho** |
| Form chứng từ (phiếu thu, chi, báo có, báo nợ, phiếu bán, trả lại, chuyển kho, phiếu kế toán) | Hộp thoại giữa màn | Gần **toàn màn**, **tổng tiền chữ lớn** góc trên phải, chân: Thoát · Ghi và thêm mới · **Ghi**; dòng phím tắt; **Ctrl + S = Ghi** |
| Phiếu nhập mua (khung Mua hàng) | Tổng ở bảng bên phải | Thêm **Phải trả NCC** chữ lớn ở đầu phiếu |
| Phiếu bán hàng / trả lại | Mục thu tiền ở cuối | Đầu phiếu: **Chưa thu tiền (ghi công nợ) / Thu tiền ngay** + hình thức; chọn Thu ngay là một khoản thu đủ tổng phiếu, tự theo tổng khi sửa dòng |
| Trang Quy trình của nhóm (Tiền, Mua hàng, Kho…) | Chỉ sơ đồ | Thêm cột **Báo cáo** hay dùng của nhóm + Tất cả báo cáo |

Phím tắt: **F9** thêm nhanh (khi con trỏ ở ô chọn), **Ctrl + S** ghi, **Esc** thoát, **Ctrl + B** đóng / mở menu trái, **Ctrl + K** tìm màn.

## 2. Thay đổi kỹ thuật

| Phần | Tệp | Ghi chú |
|---|---|---|
| Bộ màu, bố cục | `apps/web/src/styles/giao-dien-xanh.css` | Mọi luật dưới `html.gd-xanh`; không sửa `theme.css` |
| Chọn giao diện | `lib/giaoDien.ts`, `layout/UserMenu.tsx`, `main.tsx` | `localStorage['ketoan.giao-dien']`, mặc định Xanh |
| Thêm nhanh, Hay dùng | `layout/ThemNhanh.tsx`, `lib/themNhanh.ts` | `THEM_NHANH` (mục ẩn theo quyền), `useThemTuDiaChi`, `themMoi(path)` |
| Ô chọn | `components/pickers.tsx` | `CodePicker`: `onAdd`, `addLabel`, `columns`, `nameWidth`, `PickOption.cells`; `PartnerPicker addKind`, `ItemPicker canAdd` |
| Form ghi xong báo mã | `PartnerEditor` / `ProductEditor` / `WarehouseForm`: `onSaved(code)`, `initial` | Chữ gõ là MST (10 / 13 số) → điền ô MST, còn lại → tên |
| Ô kho | `components/phieu-hang/ChonKho.tsx` | Nút + (quyền `catalog:write`) |
| Màu trạng thái | `lib/trangThai.ts` `dongChungTu()` | `ct-cho` (cam), `muted` (huỷ) |
| Kỳ có sẵn | `lib/format.ts` `PERIOD_PRESETS`, `presetOf`; `components/ReportPanel.tsx` `SideKy` | Dùng ở danh sách chứng từ, ACC14, sổ nhật ký, sổ chi tiết TK, khoá sổ |
| Thẻ chỉ số | `components/KpiCards.tsx`, `components/KpiDanhMuc.tsx` | Nguồn: `/api/v1/alerts`, bảng cân đối TK 131 / 331, `/api/v1/inventory/stock-counts` |
| Trạng thái trống | `components/ui.tsx` `Empty({ actions })` | |
| Khung chứng từ | `components/ui.tsx` `Modal voucher`, `components/voucher/VoucherModal.tsx` `total` | Ctrl + S bấm nút chính của hộp trên cùng |
| Thu tiền ngay | `components/phieu-hang/PhieuHangForm.tsx` | |
| Báo cáo ở trang Quy trình | `features/launcher/LauncherPage.tsx` | 7 báo cáo đầu của nhóm |

API mới / đổi:
- `GET /api/v1/inventory/items` nhận thêm `branchCode`, trả thêm `stock` (tồn hiện tại, ĐVT nhỏ nhất; không gửi chi nhánh = mọi chi nhánh).
- `GET /api/v1/inventory/stock-counts?branchCode=` → `{ inStock, out, negative, branchCode, at }`.

Không đổi định khoản, không đổi CSDL.

## 3. Kiểm tra đã làm

- Chụp màn tự động (playwright) các màn: Tổng quan, Đối tượng, Mặt hàng, MH11, Phiếu thu, Phiếu bán hàng, Phiếu nhập mua, trang Quy trình Tiền / Mua hàng / Danh mục.
- Luồng thật: phiếu nhập mua → gõ tên NCC chưa có → F9 → chọn nhóm → Ghi → ô NCC tự điền mã mới (NC…) và tên.
- `tsc` sạch cả `apps/web` và `apps/api`; `scripts/kiem-chuan.sh` ĐẠT; test `costing` (thêm ca ô chọn có Tồn, đếm còn / hết / âm kho) và `nhom-hang` qua.
