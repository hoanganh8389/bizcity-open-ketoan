# NT-BH-019 · Máy bán POS: tạo khách mới tại quầy, bán hàng 0đ không gửi thuế (bill Z) qua kế toán
<!-- [2026-11-15 09:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: hai phần máy bán React còn chạy dữ liệu giả ở bản hybrid (đóng góp) -->
<!-- [2026-11-15 10:45 AM Võ Hoàng] NGHIEM-THU — chốt Q1–Q3; Q1, Q2 ghi cách làm theo năng lực Core đang có; chia hai bước (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`) |
| Màn hình | Máy bán POS React (vỏ WP `/pos/`): ô Khách hàng → *Thêm khách*; giỏ có hàng 0đ không gửi thuế (quà mã Z) |
| Bộ phận yêu cầu | Thu ngân, kế toán bán hàng |
| Ngày tạo | 15/11/2026 |
| Trạng thái | Đã chốt (15/11/2026) — bước 1: nhận bill Z khi bán, khách mới đi kèm đơn; bước 2: chuyển sang bill Z, trả hàng có quà Z |

## 1. Mục đích quản trị
Máy bán React ở cửa hàng đã đi kế toán thật cho bán, trả, ca, danh mục, khuyến mại. Còn hai việc vẫn chạy dữ liệu giả (dải vàng báo "Còn dùng dữ liệu giả"), dùng tới là **không ghi sổ**:
1. **Tạo khách mới** tại quầy (khách chưa có SĐT trong danh mục).
2. **Bill Z**: hàng 0đ không gửi thuế (quà mã Z, sữa < 24 tháng — chốt 10/11: không lên thuế). Module pos hiện **từ chối** cả đơn có dòng như vậy ("chưa nhận hàng 0đ không gửi thuế (bill Z) ở đợt này"), thu ngân phải bán đường cũ.

## 2. Khai báo trước
- Mặt hàng có cờ *gửi thuế* đúng (mã Z = không gửi thuế).
- Khách: mã = SĐT (10 số, bắt đầu 0) như hiện nay.

## 3. Các bước thao tác
1. Ô Khách hàng gõ SĐT chưa có → **Thêm khách** → tên, SĐT (ngày sinh, hạng nếu có) → Lưu → khách vào đơn.
2. Quét hàng mã Z (hoặc được tặng theo chương trình) → giỏ hiện dòng 0đ → thanh toán như thường.
3. Đơn đã xong có dòng 0đ còn ở bill chính → *Chuyển sang bill Z*.

## 4. Số liệu đầu vào
Cửa hàng `CN01`; mặt hàng `100021001` 325.000 (gửi thuế 8 %); quà `QZ01` mã Z, 0đ, không gửi thuế; khách mới `0901234567` "Chị Lan".

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Tạo khách | đơn bán cho khách mới `0901234567` được nhận → khách có ở danh mục đối tượng (DM12) theo đối tượng của chứng từ bán; tìm lại ở máy bán thấy kèm số đơn; SĐT đã có → máy bán hiện khách cũ, không tạo trùng |
| 2 | Bán có hàng 0đ không gửi thuế | đơn được nhận; dòng 0đ mã không gửi thuế nằm trên chứng từ bán dạng **dòng quà** (0đ, không doanh thu, không thuế), đơn trả máy mang `sendTax = false` → máy bán in **bill Z** riêng, không lên hoá đơn điện tử; vẫn trừ tồn, giá vốn tháng ghi theo luật hàng khuyến mãi |
| 3 | Website | bản sao về shop: phiếu bán + phiếu `zsale` / `zexport` như POS cũ |
| 4 | Chuyển sang bill Z | dòng 0đ của đơn đã hoàn tất chuyển sang bill Z; dòng có tiền → chặn |
| 5 | Trả hàng có quà Z | trả cả quà theo bill Z |
| 6 | Dải vàng | dùng hai việc trên không còn hiện "Còn dùng dữ liệu giả" |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | SĐT sai khuôn / thiếu tên | chặn, chỉ rõ ô |
| 2 | Dòng mã không gửi thuế có tiền | nhận như dòng bán, không tách bill Z, không lên hoá đơn (`sendTax = false`) — giữ như POS đang chạy (D-MP-12); không chặn vì chỉ bất biến lõi mới chặn (R-GATE-9) |
| 3 | Mất mạng khi tạo khách | đơn vẫn bán được với khách lẻ, nhắc tạo lại |

## Đã chốt (15/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Tạo khách đi đường nào | **Khách mới đi kèm đơn**: chứng từ bán mang `partner` (mã = SĐT, tên, SĐT), cửa nạp Core tự thêm đối tượng theo mã (`document.service` → `partnerRepository.upsert`). Không tạo khách rời khi chưa bán. Không sửa Core: `ctx.actions.call` của module chỉ gọi action đọc nên module không gọi được `core.partner.upsert`, và cũng không cần |
| Q2 | Bill Z nộp sổ thế nào | Không doanh thu, không thuế, không hoá đơn điện tử; vẫn trừ tồn và có giá vốn. Cách nộp: dòng 0đ mã không gửi thuế đi **chung chứng từ bán dạng dòng quà** (`isGift`), như quà mã Z theo chương trình đã làm ở NT-BH-003; tài khoản giá vốn hàng khuyến mãi do kế toán đặt (lý do / chính sách hạch toán, chốt 10/11). **Không** nộp phiếu điều chỉnh giảm kho riêng: luật định khoản loại `stock_adjustment` ghi đối ứng "hàng thiếu chờ xử lý" khi lý do chỉ khai tài khoản chi phí (lý do quà `XTA*`) → sai bản chất. Bill Z là phiếu in của máy bán (tách theo `sendTax`), như POS đang chạy |
| Q3 | Thứ tự | Bước 1: nhận bill Z khi bán + khách mới đi kèm đơn (kiểm 1, 2, 3, 6). Bước 2: chuyển sang bill Z, trả hàng có quà Z (kiểm 4, 5) |

## 7. Kết quả chạy
Chưa chạy.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 15/11/2026 | Tạo phiếu (nháp) |
| 15/11/2026 | Chốt Q1–Q3; sửa kết quả 1, 2 và lệch chuẩn 2 theo cách làm đã chốt |
