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
| Nhóm khách hàng | khách hàng mới (như form "Thuộc nhóm (*)"); đơn vị con lấy nhóm của đơn vị cha | **liên kết** — tra theo tên (nhận cả mã) |
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

### Bổ sung theo bảng theo dõi kiểm thử 20/11 (dòng 42, 47)
<!-- [2026-11-20 kiennt] NT-DM-016 — gộp 2 lỗi kiểm thử cùng màn, cùng tệp (đóng góp) -->
- **Dòng 42 — bỏ cột tô vàng khỏi tệp mẫu khách hàng** (Kiểu, Di động, Email, Người liên hệ của tệp mẫu cũ):
  - **Kiểu**: bỏ khỏi tệp mẫu khách hàng và nhà cung cấp. Dòng mới nhận kiểu theo màn đang nhập (DM12 → Khách hàng, nhà cung cấp → Nhà cung cấp); dòng cập nhật giữ kiểu cũ.
  - **Di động**: đã bỏ ở mục 1 (một cột Điện thoại).
  - **Email**, **Người liên hệ** (tên mới **Người đại diện**): là ô của form khách hàng → giữ theo mục 2 (không bắt buộc). *Chờ người kiểm thử xác nhận.*
- **Dòng 47 — nhập NCC mới cùng các chi nhánh của nó trong một tệp** (như mã hàng cha / con): cột Thuộc đơn vị cha ghi **tên** của dòng phía trên trong tệp mà dòng đó để trống mã (tự cấp) → trước đây báo "Đơn vị cha … chưa có"; nay dòng con nhận mã được cấp của dòng cha khi ghi (mã con = mã cha-001…). Dòng cha lỗi → dòng con báo "Đơn vị cha … ở dòng N không hợp lệ"; cha đặt ở dòng dưới con → vẫn báo chưa có.

## 3. Phạm vi

Tệp: `apps/web/src/features/catalog/PartnersPage.tsx` (nhãn ô, cột lưới), `apps/web/src/lib/nhapExcel.ts` (loại nhập đối tượng), `apps/api/src/modules/partners/partner-import.ts`, `apps/api/src/modules/partners/partner.routes.ts` (chỉ khuôn dòng nhập), `apps/api/test/nt-dm-016-nhap-khach-hang.test.ts`, `apps/api/test/nhap-doi-tuong.test.ts` (ca khách hàng mới thiếu nhóm), `docs/huong-dan/doi-tuong.md`.

## 4. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở Thêm khách hàng | Ô **Điện thoại** thay Di động |
| 2 | Lưới DM12, nút Cột | Một cột Điện thoại |
| 3 | Nhập dòng mới đủ cột, Nhóm / Người quản lý / Chi nhánh ghi **tên** | Thêm mới đúng nhóm, người quản lý, chi nhánh; các ô khác ghi đủ |
| 4 | Nhập dòng có Người quản lý tên không có | Dòng lỗi, không nhập |
| 5 | Nhập dòng mới thiếu Nhóm | Dòng lỗi "phải có Nhóm khách hàng" |
| 6 | Xuất DM12 (bật mọi cột) rồi nhập lại | Không lỗi, không đổi gì |
| 7 | Tải tệp mẫu khách hàng / nhà cung cấp | Không có cột Kiểu, Di động (khách hàng) |
| 8 | Nhà cung cấp: dòng 2 NCC mới (mã trống), dòng 3 chi nhánh — Thuộc đơn vị cha = tên dòng 2 | Cả hai "Thêm mới"; ghi xong mã con = mã cha-001, kiểu Nhà cung cấp |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 20/11/2026 (máy dev, CSDL test) |
| Bản code (commit) | nhánh `feat/nt-dm-016-khach-hang-dien-thoai-nhap-excel` |
| Test | `nt-dm-016-nhap-khach-hang.test.ts` 3/3 (bước 3, 4, 5, 8); bước 1, 2, 6, 7 trên màn hình |

## 6. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 20/11/2026 | Tạo và chốt theo yêu cầu |
| 20/11/2026 | Bổ sung lỗi kiểm thử dòng 42 (bỏ cột Kiểu khỏi tệp mẫu), dòng 47 (NCC cha / con cùng tệp) |
