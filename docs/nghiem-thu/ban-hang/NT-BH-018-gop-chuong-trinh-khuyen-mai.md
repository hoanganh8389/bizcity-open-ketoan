# NT-BH-018 · Một màn *Chương trình khuyến mại*: gộp Chương trình bán (BH12) vào Khuyến mại (BH18)
<!-- [2026-11-14 11:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu gộp BH12 + BH18 thành một màn (anh Hoàng đồng ý 14/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, nhóm menu `ban-hang` → Chính sách bán) |
| Màn hình | BH18 *Chương trình khuyến mại* (`/app/pos/khuyen-mai`); BH12 *Chương trình bán* (`/ban-hang/chuong-trinh`) thôi là màn riêng |
| Bộ phận yêu cầu | Kế toán bán hàng, kinh doanh / marketing |
| Ngày tạo | 14/11/2026 |
| Trạng thái | Nháp — anh Hoàng chốt 14/11: "chỉ nên có 1 màn" |

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
| Q1 | Màn BH12 do anh Thủy làm (`apps/web/src/features/sale-programs`) | Chuyển phần giao diện sang module `pos` (chỉ dùng `@bizcity/ui-kit`), tệp cũ thành chuyển hướng — **cần anh Thủy đồng ý**; API / dữ liệu `sale-programs` của anh Thủy giữ nguyên |
| Q2 | Mã màn | Giữ **BH18**; BH12 thôi dùng làm mã màn |

## 7. Kết quả chạy
Chưa chạy.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 14/11/2026 | Tạo phiếu |
