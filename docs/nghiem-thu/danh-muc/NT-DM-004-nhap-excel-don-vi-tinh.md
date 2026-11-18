# NT-DM-004 · Nhập Excel danh mục đơn vị tính (DM15)
<!-- [2026-11-18 09:18 AM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: DM15 nhập được từ Excel như các danh mục khác (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM15 Danh mục đơn vị tính; trang Nhập Excel chung (Hệ thống) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Đã chốt (kiennt, 18/11/2026) |

## 1. Mục đích quản trị
Khi dựng đơn vị mới, lấy danh mục đơn vị tính từ một máy chủ đã có dữ liệu: **Xuất** ở máy cũ → **Nhập Excel** ở máy mới, như ACC1, DM12, DM13, DM16, DM11, DM10. Hiện DM15 chỉ xuất được, phải gõ tay từng ĐVT.

## 2. Khai báo trước
Không cần. Đơn vị tính không phụ thuộc danh mục nào.

## 3. Cách làm

| Mục | Nội dung |
|---|---|
| Nút | DM15 thêm nút **Nhập Excel** trên thanh công cụ (cạnh Xuất), như DM10 / DM11. Trang Nhập Excel chung có thêm loại "Đơn vị tính" |
| Cột | **Đơn vị tính** (bắt buộc — khoá dòng), **Đang dùng** (Có / Không), **Ghi chú**. Tệp mẫu có 3 cột này. Các cột khác của tệp Xuất (Số mặt hàng dùng, Người sửa, Ngày sửa, Nguồn…) bỏ qua |
| Khoá | Tên ĐVT, **không phân biệt hoa thường** và bỏ khoảng trắng thừa ("hộp" = "Hộp"). Đã có → cập nhật; chưa có → thêm mới (nguồn "Thêm tay") |
| Cập nhật | Chỉ đổi Ghi chú và Đang dùng. **Không đổi tên** qua Excel (tên là khoá; đổi tên làm ở form) |
| Ô trống | Đang dùng trống: mới = Có, đã có = giữ nguyên. Ghi chú trống: mới = trống, đã có = giữ nguyên |
| Kiểm tra | Như form: tên tối đa 32 ký tự, chỉ gồm chữ, số, khoảng trắng và `_ - . / ( ) + ×`; trùng tên trong tệp; Đang dùng ghi Có / Không (nhận cả x, 1, 0, Đang dùng, Ngừng dùng) |
| Chế độ | Thêm mới / Cập nhật / Cả hai như các loại nhập khác |
| API | Dùng sẵn `GET/POST/PATCH /api/v1/unit-names` — không sửa API, không migration, không đụng lõi |

Tệp: `apps/web/src/lib/nhapExcel.ts` (loại nhập `don-vi-tinh`), `apps/web/src/features/catalog/UnitNamesPage.tsx` (nút), `docs/huong-dan/danh-muc-dvt.md` (mục Nhập Excel).

## 4. Số liệu đầu vào
Tệp Xuất của DM15 có: Lon, Thùng, Hộp (ghi chú "Hộp giấy"), Gói, Chai (Đang dùng = Không).

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Nhập lại nguyên tệp vừa xuất | 0 lỗi, 0 thêm mới, mọi dòng "cập nhật" nhưng không đổi gì; xuất lại giống hệt |
| Tệp có thêm dòng "Lốc_4", ghi chú "lốc 4 hộp 110ml" | Thêm mới Lốc_4, Đang dùng = Có, đúng ghi chú |
| Sửa ghi chú Lon, đổi Chai thành Đang dùng = Có | Chỉ hai ô đó đổi |
| Nạp tệp xuất của máy khác vào DM15 trống | Đủ các ĐVT, đúng Đang dùng, ghi chú |
| Khai mặt hàng (DM10) sau khi nhập | ĐVT vừa nhập có trong gợi ý; ĐVT Đang dùng = Không thì không gợi ý |

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Ô Đơn vị tính trống | Dòng không hợp lệ: thiếu tên |
| 2 | Tên 40 ký tự / có ký tự "@" | Dòng không hợp lệ, nêu lý do như form |
| 3 | Hai dòng "Hộp" và "hộp" | Dòng sau báo trùng với dòng trước |
| 4 | Đang dùng = "abc" | Dòng không hợp lệ: ghi Có / Không |
| 5 | Chế độ Thêm mới, tệp có "Lon" đã có | Dòng Lon báo đã có — chọn Cập nhật |
| 6 | Tên đã nằm trong thùng rác | Báo như form (đang trong thùng rác — khôi phục) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | Trên màn hình (khứ hồi xuất → nhập); 4 lệnh kiểm |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt: khoá theo tên ĐVT, không đổi tên qua Excel |
