# NT-DM-004 · Nhập Excel danh mục đơn vị tính (DM15)
<!-- [2026-11-18 09:18 AM kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: DM15 nhập được từ Excel như các danh mục khác (đóng góp) -->
<!-- [2026-11-18 09:45 AM kiennt] NGHIEM-THU — ô trống cột Đang dùng theo tệp Xuất (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM15 Danh mục đơn vị tính; trang Nhập Excel chung (Hệ thống) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Chờ nghiệm thu |

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
| Ô trống | **Đang dùng**: tệp Xuất ghi `x` = đang dùng, ô trống = ngừng dùng → cột Đang dùng có ô nào được điền thì ô trống = **Không** (nạp tệp xuất của máy khác giữ đúng trạng thái). Cả cột trống / không có cột: mới = Có, đã có = giữ nguyên. **Ghi chú** trống: mới = trống, đã có = giữ nguyên |
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
| Nạp tệp xuất của máy khác vào DM15 trống | Đủ các ĐVT, đúng Đang dùng (ĐVT ngừng dùng — ô trống — vẫn là ngừng dùng), ghi chú |
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
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `feat/nt-dm-004-nhap-excel-dvt` (trên main fb188a8c) |
| Test trên màn hình | 11/11 ĐẠT — DB tạm (bản sao, API riêng), web dev nhánh này: thêm tay 5 ĐVT; có nút Nhập Excel; Xuất; nhập lại nguyên tệp (0 lỗi, xuất lại không đổi); sửa tệp + thêm Lốc_4 (đổi đúng 2 ô + 1 dòng); "  hộp  " cập nhật Hộp, ô trống giữ nguyên; 5 dòng sai báo đúng; Chỉ thêm mới báo "đã có"; tên trong Thùng rác báo đúng; ô trống cột Đang dùng = Không (Chai về ngừng dùng); xoá hết rồi nạp tệp xuất (5 thêm mới, xuất lại khớp tệp gốc) |
| selfcheck | Không có lỗi mới so với main (SC-UI-1: nút ẩn khi không có quyền, không khoá) |
| kiem-chuan | ĐẠT |
| typecheck | ĐẠT |
| npm test | 2270 đạt / 5 lỗi — không do phiếu này (chỉ sửa web): db-rules, mat-khau-mac-dinh, nt-bh-005 lỗi sẵn trên main; nt-bh-003, nt-bh-012 đạt khi chạy riêng (lỗi theo thứ tự chạy cả bộ) |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo và chốt: khoá theo tên ĐVT, không đổi tên qua Excel |
| 18/11/2026 | Sửa quy tắc ô trống cột Đang dùng theo tệp Xuất (x / trống) — người dùng chọn khi test (tệp xuất ghi ô trống cho ngừng dùng) |
| 18/11/2026 | Code xong, test trên màn hình 11/11, chuyển Chờ nghiệm thu |
