# NT-DM-008 · Bảng giá (DM14): nhập giá bán từ Excel bằng trình nhập chung
<!-- [2026-11-18 03:20 PM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: nhập Excel giá ở lưới giá DM14 không giống các màn khác (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM14 Bảng giá — lưới giá của một bảng giá (phần dưới) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Hiện trạng
Nút **Nhập Excel** ở lưới giá (NT-DM-003) mở một hộp xem trước tự viết: chọn tệp là đọc ngay sheet đầu, không có bước ghép cột, không có tệp mẫu, không tải được tệp lỗi, không chọn sheet — **khác** trình nhập chung 4 bước của mọi màn danh mục (NT-DM-004..007).

## 2. Cách làm

| Mục | Nội dung |
|---|---|
| Nút | **Nhập Excel** ở lưới giá mở **trình nhập chung** (chọn tệp → ghép cột → kiểm tra dữ liệu → kết quả nhập), tiêu đề "Giá bán — *tên bảng giá*" |
| Tệp | Tệp **Xuất Excel** của chính lưới giá dùng thẳng (dòng tiêu đề tự dò, bỏ dòng tên bảng). Tệp mẫu: Mã hàng, Tên hàng, ĐVT, Đơn giá |
| Cột | **Mã hàng** (*), **ĐVT** (*), **Đơn giá**; Tên hàng chỉ để đối chiếu, không ghi. Các cột khác của tệp Xuất (Quy đổi, Bán chính, Hàng chính, Giá công ty…) bỏ qua |
| Khoá dòng | Mã hàng + ĐVT (không phân biệt hoa thường) phải có trong lưới giá (mặt hàng đã khai ĐVT đó) |
| Đơn giá | Số ≥ 0; nhận "580000", "580.000", "580,000" (nhóm 3 số là phân cách hàng nghìn — như NT-DM-003). **Ô trống: giữ nguyên** giá đang có |
| Kết quả | Thêm mới = ô chưa có giá được thêm giá; Cập nhật = ô đổi giá; ô không đổi tính "cập nhật" nhưng không ghi. Dòng lỗi (mã / ĐVT không có trong bảng giá, giá không phải số, trùng dòng trong tệp) bỏ qua, dòng đúng vẫn ghi; tải tệp lỗi |
| Ghi | Qua `PUT /api/v1/catalog/price-lists/:code/prices` như nút Ghi giá (gửi theo lô) — không sửa API, không đụng lõi |
| Bỏ | Hộp xem trước tự viết của lưới giá |

Tệp: `apps/web/src/lib/nhapExcelDanhMuc.ts` (loại nhập giá theo bảng giá), `apps/web/src/features/catalog/PriceRowsPanel.tsx` (nút), `docs/huong-dan/bang-gia.md`.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Xuất Excel lưới giá → Nhập Excel chính tệp đó | 0 lỗi, 0 thêm mới, mọi ô không đổi; xuất lại không đổi ô nào |
| Sửa 1 giá, điền 1 ô còn trống → nhập | Đúng 1 cập nhật, 1 thêm mới; lưới đổi đúng 2 ô |
| Ô giá dạng chữ "580,000" | Hiểu 580.000 |
| Dòng mã / ĐVT không có, giá "abc", trùng dòng | Báo từng dòng, dòng khác vẫn ghi |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `feat/nt-dm-007-nhap-excel-co-cau` |
| Test trên màn hình | **6/6 ĐẠT** — DB tạm, web dev nhánh này, bảng giá công ty: nút Nhập Excel ở lưới giá mở trình nhập chung 4 bước (có Tải tệp mẫu); Xuất Excel lưới giá → nhập lại nguyên tệp: 0 lỗi, 0 thêm mới, xuất lại không đổi; điền giá "580,000" (chữ) và 25.000 cho 2 ô trống, để trống 1 ô: 2 thêm mới, lưới đổi đúng 2 ô, 580,000 hiểu 580.000; đổi 1 giá: 1 cập nhật; dòng sai (mã không có, ĐVT không có, giá "abc", trùng dòng): báo 4 dòng |
| selfcheck | Không có lỗi mới so với main |
| kiem-chuan | ĐẠT |
| typecheck | ĐẠT |
| npm test | 2290 đạt / 6 lỗi — không do phiếu này (chỉ sửa web; mã API giống main): db-rules, mat-khau-mac-dinh, nt-bh-005 lỗi sẵn trên main; nt-bh-003, nt-bh-012, nhom-hang đạt khi chạy riêng (lỗi theo thứ tự chạy cả bộ). preset.test có lần lỗi khi máy quá tải (chạy 42 phút), chạy riêng đạt |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt; người dùng chọn gộp chung nhánh / PR với NT-DM-007 |
| 18/11/2026 | Code xong, test trên màn hình 6/6, chuyển Chờ nghiệm thu |
