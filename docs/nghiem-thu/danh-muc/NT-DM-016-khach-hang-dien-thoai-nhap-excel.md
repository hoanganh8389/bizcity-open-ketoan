# NT-DM-016 · Khách hàng (DM12): "Di động" → "Điện thoại"; nhập Excel đủ cột của form, cột liên kết tra theo tên
<!-- [2026-11-20 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM12 Khách hàng — form Thêm / Sửa, lưới danh sách; Nhập Excel loại `khach-hang` (dùng chung khung với `nha-cung-cap`) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 20/11/2026 |
| Trạng thái | Đã chốt (kiennt, 20/11/2026) |

## 1. Đổi tên "Di động" → "Điện thoại"

| Chỗ | Trước | Sau |
|---|---|---|
| Form khách hàng (khối Thông tin cá nhân) | Di động | **Điện thoại** — vẫn ghi vào cả hai trường điện thoại / di động như hiện nay (máy bán hàng dùng chung) |
| Lưới DM12 | hai cột ẩn "Điện thoại", "Di động" (cùng một số) | một cột **Điện thoại** |
| Nhà cung cấp (DM13) | Điện thoại · Di động người liên hệ | Không đổi |

## 2. Nhập Excel khách hàng: gần đủ các ô của form

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| Mã khách hàng | — | Trống khi thêm mới: tự cấp theo nhóm (như cũ) |
| Tên khách hàng | dòng mới | |
| Nhóm khách hàng | dòng mới (như form "Thuộc nhóm (*)") | **liên kết** — tra theo tên (nhận cả mã) |
| Mã số thuế · Địa chỉ NR · **Điện thoại** · Email | — | Điện thoại ghi cả hai trường như form |
| Ngày sinh · Giới tính (Nam / Nữ) · Loại khách hàng (cá nhân / doanh nghiệp) · Khách hàng tiềm năng (Có / Không) | — | |
| Tên công ty · Tên viết tắt · Alias · Địa chỉ Cty · Fax · Website · Người đại diện · Chức vụ | — | |
| Số tài khoản NH · Chủ tài khoản · Mở tại ngân hàng | — | |
| Giới hạn nợ · Giới hạn ngày nợ · Giới hạn số phiếu nợ | — | số |
| Người quản lý | — | **liên kết** nhân viên — tra theo tên (nhận cả mã) |
| Chi nhánh quản lý | — | **liên kết** chi nhánh — tra theo tên (nhận cả mã) |
| Đơn vị cha | — | **liên kết** đối tượng — tra theo tên (nhận cả mã) |
| Theo dõi · Ghi chú | — | |

- **Cột liên kết**: so tên đúng chữ (không phân biệt hoa thường, bỏ dấu cách thừa), hoặc đúng mã. **Không khớp** hoặc **trùng nhiều mục** → dòng **lỗi, không nhập**, báo rõ ("Người quản lý "…" không có trong danh mục nhân viên" / "có 2 nhân viên tên …, ghi mã").
- Dòng cập nhật: ô trống giữ nguyên (như cũ). Cột Ngày tạo, Người tạo, Số đơn vị con: chỉ xem, bỏ qua.
- Tệp nhà cung cấp nhận cùng các cột (ô nào form NCC không có thì bỏ qua); cột "Di động" của NCC giữ nghĩa *di động người liên hệ*.

## 3. Phạm vi

Tệp: `apps/web/src/features/catalog/PartnersPage.tsx` (nhãn ô, cột lưới), `apps/web/src/lib/nhapExcel.ts` (loại nhập đối tượng), `apps/api/src/modules/partners/partner-import.ts`, `apps/api/src/modules/partners/partner.routes.ts` (chỉ khuôn dòng nhập), `apps/api/test/nt-dm-016-nhap-khach-hang.test.ts` (đề xuất — tạo khi code), `docs/huong-dan/doi-tuong.md`.

## 4. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở Thêm khách hàng | Ô **Điện thoại** thay Di động |
| 2 | Lưới DM12, nút Cột | Một cột Điện thoại |
| 3 | Nhập dòng mới đủ cột, Nhóm / Người quản lý / Chi nhánh ghi **tên** | Thêm mới đúng nhóm, người quản lý, chi nhánh; các ô khác ghi đủ |
| 4 | Nhập dòng có Người quản lý tên không có | Dòng lỗi, không nhập |
| 5 | Nhập dòng mới thiếu Nhóm | Dòng lỗi "phải có Nhóm khách hàng" |
| 6 | Xuất DM12 (bật mọi cột) rồi nhập lại | Không lỗi, không đổi gì |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | 4 lệnh kiểm |

## 6. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 20/11/2026 | Tạo và chốt theo yêu cầu |
