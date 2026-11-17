# Chương trình khuyến mại (BH18)
<!-- [2026-11-14 01:40 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: hướng dẫn màn Khuyến mại (đóng góp) -->
<!-- [2026-11-15 10:40 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: một màn Chương trình khuyến mại — gộp Chương trình bán BH12 (đóng góp) -->
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: nháp → duyệt → phát hành, cảnh báo trùng, hạn mức lượt, báo cáo khuyến mại, chuyển chương trình cũ (đóng góp) -->

Khai báo khuyến mại cho máy bán POS (và phiếu bán): mua nhiều giảm nhiều, giảm theo tổng đơn / mã giảm giá, quà theo tổng đơn, combo, mua bất kỳ tặng món rẻ nhất, mua X tặng Y. Phát hành xong máy bán áp từ ngày áp dụng, không phải cài lại máy.

Mở: **Bán hàng → Chính sách bán → Chương trình khuyến mại**. Ai cũng xem và thử tính được; thêm / sửa / ngừng khuyến mại cần quyền ghi cấu hình (kế toán trưởng, quản trị), chương trình có hạn mức cần quyền ghi danh mục.

Từ 15/11/2026 đây là **màn duy nhất** khai ưu đãi bán hàng — màn *Chương trình bán (BH12)* đã gộp vào đây (đường cũ tự chuyển sang thẻ *Có hạn mức*). Ba thẻ:

| Thẻ | Nội dung |
|---|---|
| **Khuyến mại** | 6 loại khuyến mại theo đơn / nhóm hàng (bên dưới) |
| **Có hạn mức** | Tặng hàng / giảm giá (kể cả cận date) trên **một mặt hàng**, mỗi cửa hàng một số suất — quà của nhà cung cấp, hàng xả. Bấm một dòng để xem, **Sửa** hạn mức. Chi tiết: [Chương trình có hạn mức](bh-chuong-trinh.md) |
| **Báo cáo hạn mức** | Hạn mức / đã dùng / còn lại từng cửa hàng, tốc độ dùng, số dùng trong kỳ |
| **Nháp / chờ duyệt** | Khuyến mại mới / bản sửa chưa phát hành: gửi duyệt, duyệt, từ chối, nhật ký (từ 18/11/2026, bên dưới) |
| **Báo cáo khuyến mại** | Khuyến mại đã dùng theo chương trình × cửa hàng × kỳ (bên dưới) |

**+ Thêm** có 8 loại: 6 loại khuyến mại và *Tặng hàng có hạn mức cửa hàng*, *Giảm giá có hạn mức cửa hàng*. **Thử tính** (không chọn dòng nào) tính một giỏ hàng với **mọi** chương trình đang chạy, cả hai kiểu — đúng kết quả máy bán và phiếu bán nhập tay nhận.

## Danh sách

| Cột | Ý nghĩa |
|---|---|
| Mã | Mã khuyến mại (vd `KM-TET-2026`) — trùng mã là sửa khuyến mại đó |
| Loại, Cửa hàng | Loại khuyến mại; cửa hàng áp (trống = mọi cửa hàng) |
| Từ ngày, Đến ngày | Thời gian chiến dịch |
| Trạng thái | *Sắp chạy*, *Đang chạy*, *Đã hết*, *Đã ngừng* |
| Bản, Chứng từ đã áp | Số lần sửa; số chứng từ bán đã dùng khuyến mại |
| Tên / ghi chú | Ghi ở lần phát hành đầu |

## Thêm

1. **+ Thêm** → chọn loại.
2. Điền **Mã**, **Áp dụng từ ngày**, tên / ghi chú, cửa hàng, thời gian chiến dịch.
3. Điền phần riêng của loại:

   | Loại | Điền |
   |---|---|
   | Giảm theo bậc | nhóm mã hàng; tính bậc theo số lượng hoặc tiền; mỗi bậc: từ … giảm % / giá chương trình / giảm tiền mỗi cái |
   | Giảm theo tổng đơn / mã giảm giá | (tuỳ chọn) chỉ tính các mã; mỗi bậc: đơn từ … giảm % hoặc tiền, giảm tối đa … |
   | Quà theo tổng đơn | mỗi bậc: đơn từ … tặng `QUA01:1, QUA02:2` |
   | Combo | các món (mã, số lượng); giá cả bộ / giảm % / giảm tiền mỗi bộ; tối đa bao nhiêu bộ |
   | Mua bất kỳ tặng món rẻ nhất | nhóm mã; mua N món tặng M món rẻ nhất; lặp lại |
   | Mua X tặng Y | mua mã, số lượng → tặng mã, số lượng; lặp lại; trần quà mỗi phiếu |

4. **Điều kiện và cách cộng** (trừ Mua X tặng Y):
   - thứ trong tuần, khung giờ, đơn tối thiểu;
   - mã giảm giá khách đọc, chỉ khách có sinh nhật trong tháng, hạng thành viên;
   - **Ưu tiên**: số lớn tính trước;
   - **Áp riêng**: dòng đã được khuyến mại này giảm thì khuyến mại tính sau không áp lên dòng đó;
   - **Trần khuyến mại** theo NĐ81: mặc định 50 % tiền dòng. Miễn trần thì tích ô và ghi lý do.
5. (Tuỳ chọn) **Hạn mức lượt theo cửa hàng**: mỗi cửa hàng tối đa bao nhiêu đơn được áp, hoặc riêng từng cửa hàng `CN01=2, CN02=5`.
6. Ô sai hiện ngay dưới hộp; sửa xong bấm **Lưu nháp** hoặc **Lưu và gửi duyệt**. Máy bán **chưa** áp cho tới khi được duyệt.

## Sửa, ngừng

- **Sửa** (hoặc bấm đúp một dòng): mở nội dung đang có, đổi rồi lưu thành bản nháp từ ngày chọn (mặc định ngày mai) — được duyệt mới phát hành.
  - Từ ngày đó áp nội dung mới; bản cũ kết thúc hôm trước.
  - Chứng từ đã bán giữ đúng bản đã áp.
- **Ngừng**: chọn *Ngừng từ ngày* (hôm nay = ngừng ngay). Từ ngày đó máy bán không giảm nữa.
- Khuyến mại không xoá được: mọi bản đã phát hành giữ lại để tra chứng từ cũ.

## Thử tính

Chọn một khuyến mại (hoặc không chọn = mọi khuyến mại đang hiệu lực) → **Thử tính**.
1. Nhập ngày bán, cửa hàng, giờ, mã giảm giá khách đọc, giỏ hàng (mã, số lượng, đơn giá gồm thuế).
2. Bấm **Tính**.

Kết quả:
- **Áp được**: giảm bao nhiêu ở dòng nào, tặng gì;
- **Không áp**: kèm lý do (thiếu mã giảm giá, ngoài khung giờ, chưa đủ tổng đơn, bị khuyến mại áp riêng giữ dòng…);
- dòng bị **kẹp theo trần** NĐ81.

Chỉ thử được khuyến mại **đã phát hành**. Muốn thử trước khi chạy thật: phát hành với ngày áp dụng ở tương lai, thử tính ở ngày đó, rồi sửa nếu cần.

## Duyệt (từ 18/11/2026, phiếu NT-BH-025)

Thêm / sửa khuyến mại 6 loại ở màn này lưu thành **bản nháp**, chưa áp ở máy bán / phiếu bán. Thẻ **Nháp / chờ duyệt**:

| Nút | Ai | Làm gì |
|---|---|---|
| **Sửa nháp**, **Gửi duyệt** | người có quyền ghi cấu hình | sửa nội dung, gửi người duyệt |
| **Duyệt** | quyền **Duyệt khuyến mại** (`pos:promo-approve`, mặc định chủ đơn vị + kế toán trưởng; gán thêm ở Phân quyền) | xem cảnh báo trùng → *Duyệt và phát hành*: phát hành vào sổ chính sách, máy bán áp từ ngày áp dụng |
| **Từ chối** | như Duyệt | ghi lý do; người lập sửa rồi gửi lại |
| **Nhật ký** | mọi người xem | lập, sửa, gửi duyệt, duyệt, phát hành, từ chối, ngừng — ai, lúc nào |

- **Người lập không tự duyệt / từ chối** (máy chủ chặn).
- Duyệt xong mà phát hành lỗi (mạng, sai nội dung): dòng ở trạng thái *Đã duyệt, chưa phát hành* → bấm **Phát hành lại**.
- Giới hạn: người có quyền ghi chính sách của Core vẫn gọi thẳng API chính sách được — màn này không đi đường đó.

## Cảnh báo trùng

Khi lưu nháp và khi duyệt, màn liệt kê các khuyến mại **đang áp / chờ duyệt** cùng mã hàng, cùng cửa hàng, trùng thời gian, ví dụ *Giảm 10 % SUA330 (KM10-SUA330; CN01; 20/11 – 30/11)*. Chỉ là cảnh báo: vẫn lưu / duyệt được; lúc bán, luật **Ưu tiên** và **Áp riêng** quyết định.

## Hạn mức lượt theo cửa hàng

Khai ở nháp (ô *Hạn mức lượt theo cửa hàng*), có hiệu lực khi duyệt. Một lượt = một đơn máy bán hoặc một phiếu bán BH10 đã duyệt áp chương trình đó ở cửa hàng.
- Hết lượt: máy bán **báo trước khi thanh toán** và máy chủ không nhận đơn còn áp chương trình (`POS_PROMO_QUOTA`) — bỏ khuyến mại đó khỏi đơn; phiếu bán BH10 không duyệt được (`PHIEU_BAN_PROMO_QUOTA`).
- **Trả cả đơn** (máy bán), huỷ đơn chờ thanh toán, bỏ duyệt phiếu bán → trả lại lượt. Trả một phần không trả lượt; phiếu trả BH11 chưa trả lượt.
- Hai máy cùng bán lượt cuối: một đơn được, đơn kia bị từ chối. Đơn bán lúc mất mạng gửi bù khi đã hết lượt: vẫn nhận (hàng đã giao), đánh dấu *Vượt khi mất mạng* ở báo cáo.

## Báo cáo khuyến mại

Thẻ **Báo cáo khuyến mại** (quyền xem quản trị bán lẻ): chọn kỳ, cửa hàng, mã → **Xem**. Mỗi dòng một chương trình × cửa hàng: số đơn áp, tiền giảm, số quà, đơn đã trả lượt, lượt đang dùng / hạn mức / còn. Bấm một dòng để xem danh sách đơn máy bán / phiếu bán đã áp. Nút xuất Excel ở góc bảng. Số liệu tính từ ngày cài bản này.

## Chuyển chương trình cũ của website

Quản trị website chạy một lần: `wp tgs-pos promo-migrate --dry-run` (xem trước) rồi `wp tgs-pos promo-migrate`. Chương trình còn hiệu lực của plugin bán hàng cũ thành **bản nháp** ở thẻ *Nháp / chờ duyệt* (nguồn *Chuyển từ website*); loại không chuyển được được liệt kê ở cuối lệnh. Người có quyền duyệt rồi mới áp. Chạy lại không tạo trùng.
