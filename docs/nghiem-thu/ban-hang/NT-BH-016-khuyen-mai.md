# NT-BH-016 · Khuyến mại bán hàng: khai báo, thử tính, ngừng — một màn cho 6 loại khuyến mại
<!-- [2026-11-14 12:40 AM Võ Hoàng] NGHIEM-THU — tạo phiếu đợt 4a Bán hàng: màn Khuyến mại (chữ chốt docs/nghiep-vu/22) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, nhóm menu `ban-hang` → Chính sách bán) |
| Màn hình | BH18 *Khuyến mại* (`/app/pos/khuyen-mai`) |
| Bộ phận yêu cầu | Kế toán bán hàng, bộ phận kinh doanh / marketing |
| Ngày tạo | 14/11/2026 |
| Trạng thái | Nháp — theo thứ tự đợt anh Hoàng đã duyệt 13/11 (đợt 4: chính sách bán) |

Chữ chốt thiết kế: [nghiep-vu/22](../../nghiep-vu/22-khuyen-mai-han-muc-no.md).

## 1. Mục đích quản trị
Khuyến mại hiện tính đúng ở máy bán (đợt khuyến mại 1–2, NT-BH-012), nhưng **chỉ khai được bằng API** — người kinh doanh không tự làm được. Đợt này cho một màn: xem mọi khuyến mại đang chạy / sắp chạy / đã hết, khai báo mới theo 6 loại bằng form dễ hiểu, **thử tính** trên một giỏ hàng trước khi phát hành, ngừng sớm. Phát hành xong máy bán áp ngay, không phải cài lại máy.

## 2. Khai báo trước
- Mặt hàng có mã, chi nhánh (cửa hàng), mã giảm giá (nếu dùng) do kinh doanh đặt.
- Người khai có quyền ghi cấu hình (`settings:write`) — kế toán trưởng / quản trị.

## 3. Các bước thao tác
1. **Bán hàng → Chính sách bán → Khuyến mại.** Danh sách: mã, loại, cửa hàng áp, từ ngày – đến ngày, trạng thái (*đang chạy / sắp chạy / đã hết / đã ngừng*), số chứng từ đã áp.
2. **Thêm** → chọn loại → điền form → **Thử tính** với giỏ hàng mẫu → **Phát hành**.
3. Chọn một khuyến mại → **Sửa** (phát hành bản mới từ ngày chọn; bản cũ tự đóng hôm trước) hoặc **Ngừng** (bản mới kết thúc hôm nay).

## 4. Số liệu đầu vào
Mặt hàng `A` 100.000, `B` 200.000, `C` 50.000, `D` 30.000; cửa hàng `CN01`, `CN02`.

## 5. Kết quả mong đợi

| # | Loại | Khai | Thử tính | Kết quả |
|---|---|---|---|---|
| 1 | Giảm theo bậc | nhóm `A`; từ 3 cái −10 %, từ 5 cái −20 % | 5 `A` | giảm 100.000 |
| 2 | Giảm theo tổng đơn / mã giảm giá | đơn ≥ 500.000 −5 %, tối đa 50.000; mã `KM50K` | giỏ 830.000 có mã | giảm 41.500 chia theo tỉ lệ dòng; thiếu mã → "không áp: thiếu mã giảm giá" |
| 3 | Quà theo tổng đơn | đơn ≥ 1.000.000 tặng 1 `QUA01` | giỏ 1.030.000 | thêm 1 dòng quà `QUA01` 0đ |
| 4 | Combo | 1 `B` + 2 `C` giá bộ 260.000 | `B` + 2 `C` | giảm 40.000 (`B` 26.667, `C` 13.333) |
| 5 | Mua bất kỳ tặng món rẻ nhất | nhóm `C`, `D`: mua 3 tặng 1, lặp | 2 `C` + 1 `D` | `D` 0đ (giảm 30.000) |
| 6 | Mua X tặng Y | mua 2 `A` tặng 1 `C` | 4 `A` | tặng 2 `C` |
| 7 | Điều kiện chung | thứ trong tuần, khung giờ, tháng sinh nhật, hạng thành viên, áp riêng (không cộng dồn), thứ tự ưu tiên, trần NĐ81 (mặc định 50 %) | — | form có các ô; thử tính chọn được ngày giờ / khách |
| 8 | Phát hành | — | — | máy bán áp ngay từ ngày hiệu lực; danh sách hiện "đang chạy" / "sắp chạy" |
| 9 | Sửa | đổi bậc từ ngày mai | — | bản mới từ mai, bản cũ đến hôm nay; chứng từ cũ giữ bản cũ |
| 10 | Ngừng | — | — | bản mới kết thúc hôm nay; từ mai máy bán không áp; danh sách "đã ngừng" |
| 11 | Menu, Luồng chi tiết | — | — | mục *Khuyến mại* hết mờ, mở BH18 |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Form sai (đến ngày trước từ ngày, giờ kết thúc trước giờ bắt đầu, bậc không tăng, combo thiếu món) | Core từ chối, màn hiện đúng ô sai |
| 2 | Ngày hiệu lực lùi về trước hôm nay | Bắt buộc ghi lý do (chứng từ đã bán không đổi) |
| 3 | Mã khuyến mại trùng mã đang có | Là "sửa" mã đó (bản mới), không tạo trùng |
| 4 | Người không có quyền ghi cấu hình | Chỉ xem, thử tính được; không phát hành |
| 5 | Khuyến mại gắn chương trình bán BH12 (quà / giảm có hạn mức) | Không hiện ở đây — khai ở BH12 |

## Cần chốt (mặc định tạm)

| # | Câu hỏi | Mặc định tạm |
|---|---|---|
| Q1 | Tên khuyến mại hiển thị | Core chưa lưu tên: dùng **mã** gợi nhớ (vd `KM-TET-2026`) + ghi chú ở lý do phát hành. Đề xuất Core thêm `title` (chữ chốt §4) |
| Q2 | Ai được phát hành | Quyền ghi cấu hình (kế toán trưởng / quản trị), như phát hành chính sách hiện nay |
| Q3 | Hạn mức nợ khách | **Đợt 4b**, cần Core thêm khuôn luật `sale.credit_limit@1` (đề xuất ở chữ chốt §5) |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1–6 (6 loại) | số theo §5 | đúng — test `nt-bh-016`: form của màn → phát hành → Core tính: bậc 100.000; tổng đơn có mã 41.500 chia 25.000 / 10.000 / 5.000 / 1.500, thiếu mã → "cần mã giảm giá"; quà 1 QUA01; combo 26.667 / 13.333; món rẻ nhất 30.000; mua 4 A tặng 2 C | — | |
| §5 dòng 7 (điều kiện chung) | đi vào params, áp đúng | đúng — thứ 7 / CN, khung giờ, ưu tiên, áp riêng, trần 30 %; khứ hồi params → form → params không đổi | — | |
| §5 dòng 9–10 (sửa, ngừng) | bản mới từ ngày chọn; ngừng từ ngày | đúng — 30/06 giảm 10 %, 01/07 giảm 20 %; ngừng từ 10/07: 09/07 còn áp, 10/07 không áp; sổ đăng ký 3 bản | — | |
| §5 dòng 8, 11 + chạy thật | phát hành, menu | Docker demo qua giao diện: Bán hàng → Khuyến mại → Thêm "Giảm theo bậc" → Phát hành → Thử tính 3 × 100.000 giảm 10 % = 30.000 → Ngừng; không lỗi trình duyệt; mục Khuyến mại hết mờ | — | đã sửa bố cục hộp form (trước dồn một cột) |
| §6 dòng 1 (form sai) | chặn | màn báo đúng ô (thiếu nhóm mã, bậc không tăng, mã sai khuôn) trước khi gửi; Core kiểm lại khi phát hành | — | |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 14/11/2026 | Tạo phiếu |
| 14/11/2026 | Ghi kết quả chạy (test tích hợp 3/3, thuần 6/6, chạy thật Docker) |
