# NT-BH-018 · Một màn *Chương trình khuyến mại*: gộp Chương trình bán (BH12) vào Khuyến mại (BH18)
<!-- [2026-11-14 11:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu gộp BH12 + BH18 thành một màn (anh Hoàng đồng ý 14/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, nhóm menu `ban-hang` → Chính sách bán) |
| Màn hình | BH18 *Chương trình khuyến mại* (`/app/pos/khuyen-mai`); BH12 *Chương trình bán* (`/ban-hang/chuong-trinh`) thôi là màn riêng |
| Bộ phận yêu cầu | Kế toán bán hàng, kinh doanh / marketing |
| Ngày tạo | 14/11/2026 |
| Trạng thái | Đã làm 15/11 — Q1 chốt: anh Thủy bàn giao phần BH12, anh Hoàng quản lý (15/11) |

## 1. Mục đích quản trị
Hiện có hai màn khai ưu đãi bán hàng: **BH12** (tặng hàng / giảm giá theo một mặt hàng, có **hạn mức từng cửa hàng**) và **BH18** (6 loại khuyến mại theo đơn / nhóm hàng). Cả hai đều do Core tính chung một chỗ (`POST /api/v1/policies/evaluate`) và máy bán, phiếu bán nhập tay áp như nhau — chỉ khác chỗ khai. Người dùng phải biết loại nào khai ở màn nào. Đợt này gộp thành **một màn**: một danh sách, một nút Thêm với đủ loại, một chỗ thử tính.

## 2. Khai báo trước
- Như BH12 và BH18 hiện nay (mặt hàng, cửa hàng, loại chương trình, quyền `settings:write`). **Không đổi API, không đổi dữ liệu**: chương trình có hạn mức vẫn lưu ở `/api/v1/sale-programs`, khuyến mại vẫn ở sổ đăng ký chính sách.

## 3. Các bước thao tác
1. **Bán hàng → Chính sách bán → Chương trình khuyến mại** (một mục menu thay cho *Chương trình bán* + *Khuyến mại*).
2. Thẻ **Khuyến mại** (6 loại như BH18) — thẻ **Có hạn mức** (danh sách, sửa, hạn mức từng cửa hàng như BH12) — thẻ **Báo cáo hạn mức** (như BH12) — thẻ **Thử tính** (một giỏ, ra kết quả của mọi chương trình đang chạy, cả hai loại).
3. **Thêm** → chọn một trong 8 loại: 6 loại khuyến mại + *Tặng hàng có hạn mức* + *Giảm giá có hạn mức*.

## 4. Số liệu đầu vào
Chương trình có hạn mức `KM-T11-LY` (mua 2 `SUA330` tặng 1 `LY01`, `CN01` 10 suất); khuyến mại theo bậc `KM-BAC` (từ 3 `SUA330` −10 %).

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Menu | một mục *Chương trình khuyến mại* (BH18) ở Chính sách bán và Phần riêng; không còn mục *Chương trình bán*; Luồng chi tiết / Quy trình bán hàng trỏ màn mới |
| 2 | Đường cũ | mở `/ban-hang/chuong-trinh` → chuyển sang màn mới, thẻ *Có hạn mức* |
| 3 | Thêm | 8 loại; chọn *Tặng hàng có hạn mức* → form như BH12 (mặt hàng chính, mua / tặng, hàng tặng, thời gian, hạn mức từng cửa hàng) |
| 4 | Thẻ Có hạn mức | lọc trạng thái, tìm, cột hạn mức / đã dùng / còn lại / bản — đủ như BH12; sửa hạn mức không hạ dưới số đã dùng |
| 5 | Báo cáo hạn mức | như thẻ Báo cáo của BH12 (tiến độ, tốc độ, trong kỳ) |
| 6 | Thử tính | giỏ 3 `SUA330` ở `CN01` → thấy cả `KM-T11-LY` (tặng 1 `LY01`) và `KM-BAC` (giảm 10 %) |
| 7 | Không đổi số liệu | chương trình đã khai trước khi gộp vẫn hiện đủ, máy bán áp như cũ |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Người không có quyền ghi | xem được, nút Thêm / Sửa / Ngừng mờ kèm lý do |
| 2 | Chương trình có hạn mức đã có chứng từ dùng | không đổi mã, không hạ hạn mức dưới số đã dùng (như BH12) |

## Cần chốt (mặc định tạm — làm theo mặc định nếu không ai sửa)

| # | Câu hỏi | Mặc định tạm |
|---|---|---|
| Q1 | Màn BH12 do anh Thủy làm (`apps/web/src/features/sale-programs`) | **Chốt 15/11:** anh Thủy bàn giao, anh Hoàng quản lý — giao diện chuyển sang module `pos`, tệp cũ thành chuyển hướng; API / dữ liệu `sale-programs` giữ nguyên |
| Q2 | Mã màn | Giữ **BH18**; BH12 thôi dùng làm mã màn |

## 7. Kết quả chạy
<!-- [2026-11-15 11:00 AM Võ Hoàng] NGHIEM-THU — kết quả NT-BH-018 (đóng góp) -->
Docker demo (15/11), kịch bản trình duyệt + test hàm thuần `modules/pos/test/han-muc.test.ts` (4/4), `module check pos` ĐẠT.

| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1 | một mục menu | Chính sách bán / Phần riêng chỉ còn *Chương trình khuyến mại* (BH18); bỏ mục *Chương trình bán*; ô *Giá & chính sách* ở Luồng chi tiết mở BH18, bỏ ô *Khuyến mại* trùng | — | |
| §5 dòng 2 | đường cũ chuyển | `/ban-hang/chuong-trinh` → `/app/pos/khuyen-mai?the=han-muc`, thẻ *Có hạn mức* mở sẵn | — | thẻ làm việc cũ mang tên đường dẫn còn lại một lần (đường chuyển hướng không có tên màn) |
| §5 dòng 3 | Thêm 8 loại | hộp Thêm có 8 nút; *Tặng hàng / Giảm giá có hạn mức* mở form như BH12 | — | |
| §5 dòng 4 | thẻ Có hạn mức | danh sách `KM-THU-HM` (lọc trạng thái, tìm, hạn mức / đã dùng / còn lại / bản); sửa hạn mức CN03 5 → 8, lưu, đọc lại `CN03=8`; không hạ dưới số đã dùng (kiểm ở màn + API) | — | |
| §5 dòng 5 | báo cáo | thẻ *Báo cáo hạn mức* hiện `KM-THU-HM` theo cửa hàng, ô tổng | — | |
| §5 dòng 6 | thử tính chung | 3 lon `100021001` ở CN03 → `KM-THU-BAC` (giảm bậc), `KM-THU-QUA` (mua X tặng Y), `KM-THU-HM` (có hạn mức) cùng áp | — | |
| §5 dòng 7 | không đổi số liệu | API `/api/v1/sale-programs` không đổi; chương trình tạo bằng API cũ hiện đủ | — | |
| Quyền xem | kế toán thấy menu | BH18 xem theo `catalog:read` (như API chính sách của Core) — trước theo `pos:report` của module pos nên vai trò kế toán / viewer không thấy mục (anh Hoàng báo 15/11) | đã sửa | các màn quản trị máy bán BH13–BH17 vẫn theo `pos:report` |
| §6 dòng 1 | không quyền | Thêm / Sửa mờ kèm lý do theo quyền (`settings:write` khuyến mại, `catalog:write` có hạn mức) | — | |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 14/11/2026 | Tạo phiếu |
| 15/11/2026 | Chốt Q1, làm, ghi kết quả |
