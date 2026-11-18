# NT-DM-008 · Bảng giá (DM14): nhập giá bán từ Excel bằng trình nhập chung
<!-- [2026-11-18 03:20 PM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: nhập Excel giá ở lưới giá DM14 không giống các màn khác (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM14 Bảng giá — lưới giá của một bảng giá (phần dưới) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Đã chốt (kiennt, 18/11/2026) |

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
| Ngày chạy | |
| Bản code (commit) | |
| Test | Trên màn hình (khứ hồi); 4 lệnh kiểm |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt; người dùng chọn gộp chung nhánh / PR với NT-DM-007 |
