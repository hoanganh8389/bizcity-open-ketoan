# NT-BH-012 · Khuyến mại mở rộng: bậc, theo tổng đơn, mã giảm giá, combo, món rẻ nhất; áp riêng; trần NĐ81; trả hạn mức khi khách trả hàng
<!-- [2026-11-13 09:40 AM Võ Hoàng] NGHIEM-THU — tạo phiếu: đợt 2 khuyến mại do Core tính (S031-15 phần khuyến mại; đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — chính sách bán (Core, sổ đăng ký chính sách) + máy bán POS |
| Màn hình | Đợt này: API (`POST /api/v1/policies` phát hành, `POST /api/v1/policies/evaluate` tính). Màn khai báo: đợt giao diện sau |
| Bộ phận yêu cầu | Bộ phận kinh doanh (khai chương trình), bộ phận bán lẻ, phòng kế toán |
| Ngày tạo | 13/11/2026 |
| Trạng thái | Nháp — mặc định tạm, phòng kế toán / kinh doanh sửa sau |

## 1. Mục đích quản trị
Đưa nốt các loại khuyến mại plugin website đang chạy về **một luật tính ở Core** (NT-BH-003 mới có tặng hàng / giảm giá trên một mặt hàng): máy bán, cửa nạp và báo cáo cùng một kết quả; mỗi dòng giảm / quà mang chương trình + bản để kế toán định khoản và đối soát.

## 2. Khai báo trước
Mỗi chương trình là một bản chính sách phát hành ở sổ đăng ký (nội dung lưu trong bản, sửa = bản mới). Năm loại:

| Loại | Khuôn | Nội dung khai |
|---|---|---|
| Giảm theo bậc (mua nhiều giảm nhiều) | `sale.promo.tiered@1` | nhóm mã hàng; tính bậc theo **số lượng** hoặc **tiền**; mỗi bậc: từ mức, giảm % / giảm tiền mỗi đơn vị / giá chương trình |
| Giảm theo tổng đơn (gồm mã giảm giá) | `sale.promo.order_discount@1` | phạm vi mã hàng (trống = cả đơn); mỗi bậc: từ tổng đơn, giảm % hoặc số tiền, trần tiền giảm |
| Quà theo tổng đơn | `sale.promo.order_gift@1` | phạm vi mã hàng (trống = cả đơn); mỗi bậc: từ tổng đơn, danh sách quà |
| Combo | `sale.promo.combo@1` | các món + số lượng của một bộ; giá bộ / giảm % / giảm tiền mỗi bộ; trần số bộ |
| Mua bất kỳ tặng món rẻ nhất | `sale.promo.cheapest_free@1` | nhóm mã hàng; mua đủ N món thì món rẻ nhất (hoặc K món rẻ nhất) 0đ; lặp lại |

Điều kiện chung (tuỳ chọn, mọi loại): thời gian chương trình; **thứ trong tuần**, **khung giờ**; **tổng đơn tối thiểu**; **mã giảm giá** (khách đọc đúng một mã trong danh sách); **tháng sinh nhật khách**; **hạng thành viên**; kênh / chi nhánh (phạm vi của bản). **Ưu tiên** (số lớn tính trước) và **áp riêng** (dòng đã được chương trình áp riêng giảm / dùng thì chương trình sau không áp lên dòng đó). **Trần NĐ81**: tổng tiền giảm của một dòng không quá 50 % giá dòng (đặt mức khác hoặc miễn từng chương trình — người khai chịu trách nhiệm).

## 3. Các bước thao tác
1. Bộ phận kinh doanh phát hành 5 chương trình theo §4 (đợt này qua API; màn khai báo làm ở đợt giao diện).
2. Thu ngân bán giỏ hàng §4 ở CN01, khách đọc mã `KM50K`, đơn vào thứ Sáu 19:00: máy hỏi Core, giỏ hiện tiền giảm từng dòng, dòng quà, chương trình bị bỏ qua kèm lý do.
3. Thu tiền → phiếu bán mang chương trình + bản ở từng dòng.
4. Khách trả 1 hộp quà và 1 hộp hàng được giảm: hạn mức chương trình BH12 (nếu có) trả lại đúng số trả.

## 4. Số liệu đầu vào
- Giá: A 100.000, B 200.000, C 50.000, D 30.000 (gồm thuế).
- Chương trình: (1) bậc A theo số lượng: từ 3 giảm 10 %, từ 5 giảm 20 %; (2) giảm tổng đơn: từ 500.000 giảm 5 %, trần 50.000, mã `KM50K`; (3) quà tổng đơn: từ 1.000.000 tặng 1 QUA01; (4) combo B + 2 C giá 260.000 / bộ; (5) mua 3 món bất kỳ trong nhóm {C, D} tặng món rẻ nhất.
- Giỏ: 5 A, 1 B, 2 C, 1 D.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Bậc | 5 A đạt bậc 20 % → giảm 100.000 trên dòng A; 3 A → 10 % (30.000); 2 A → không giảm |
| 2 | Combo | B + 2 C = 300.000 → giá bộ 260.000 → giảm 40.000 chia trên dòng B và C theo tỉ lệ tiền |
| 3 | Món rẻ nhất | nhóm {C, D}: 2 C + 1 D = 3 món → D (30.000) 0đ → giảm 30.000 trên dòng D |
| 4 | Giảm tổng đơn có mã | có mã `KM50K`, tổng đơn đủ → 5 % trần 50.000, chia trên các dòng theo tỉ lệ tiền; thiếu mã → bỏ qua "cần mã giảm giá" |
| 5 | Quà tổng đơn | tổng đơn ≥ 1.000.000 → tặng 1 QUA01 (dòng quà); dưới mức → bỏ qua kèm lý do |
| 6 | Thứ / giờ / tối thiểu / sinh nhật / hạng | ngoài điều kiện → bỏ qua, lý do nói rõ điều kiện nào |
| 7 | Ưu tiên + áp riêng | chương trình áp riêng ưu tiên cao áp trên dòng A → chương trình khác không giảm thêm dòng A |
| 8 | Trần NĐ81 | tổng giảm một dòng vượt 50 % → kẹp còn 50 %, ghi rõ chương trình bị kẹp; chương trình miễn trần thì không kẹp |
| 9 | Kiểm phát hành | bậc không tăng dần, giảm % > 100, combo không món, bậc trùng mức → từ chối phát hành, nêu ô sai |
| 10 | Trả hàng | phiếu trả ghi sổ → lượt dùng hạn mức của dòng trả (theo đơn gốc) giảm đúng số trả; huỷ phiếu trả → dùng lại như trước |
| 11 | Cửa nạp | phiếu bán mang đúng kết quả → không lệch quà (IN-POL-004 tính lại theo cùng luật; điều kiện cửa nạp không biết — giờ, mã, khách — coi như đạt, không báo oan) |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Một dòng được nhiều chương trình giảm | Cộng dồn (trừ áp riêng), kẹp trần NĐ81; phiếu bán ghi chương trình giảm nhiều nhất ở dòng, máy giữ đủ danh sách ở đơn |
| 2 | Mã giảm giá dùng một lần / theo khách | **Đợt sau** — cần bảng phát hành mã + lượt dùng (migration). Đợt này: mã dùng chung, nhiều lần |
| 3 | Chương trình nội tuyến có hạn mức cửa hàng | **Đợt sau** — hạn mức đang là của BH12; đợt này chương trình nội tuyến không giới hạn số lượng |

**Ngoài đợt này:** màn khai báo (đợt giao diện); mã giảm giá phát hành theo lô / dùng một lần; hạn mức cho chương trình nội tuyến; cột tặng một lần / trần quà / kênh ở BH12 (chờ dòng giữ chỗ PHASE-026); `sale.price_list@1`, `sale.credit_limit@1` (S030-16); công cụ chuyển CTKM cũ từ plugin website.

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 13/11/2026 | Tạo phiếu |
