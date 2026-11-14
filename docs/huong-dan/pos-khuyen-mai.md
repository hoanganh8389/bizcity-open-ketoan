# Khuyến mại (BH18)
<!-- [2026-11-14 01:40 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: hướng dẫn màn Khuyến mại (đóng góp) -->

Khai báo khuyến mại cho máy bán POS (và phiếu bán): mua nhiều giảm nhiều, giảm theo tổng đơn / mã giảm giá, quà theo tổng đơn, combo, mua bất kỳ tặng món rẻ nhất, mua X tặng Y. Phát hành xong máy bán áp từ ngày áp dụng, không phải cài lại máy.

Mở: **Bán hàng → Chính sách bán → Khuyến mại**. Ai cũng xem và thử tính được; thêm / sửa / ngừng cần quyền ghi cấu hình (kế toán trưởng, quản trị).

Chương trình có **hạn mức theo cửa hàng** (quà của nhà cung cấp, giảm giá có số suất) khai ở *Chương trình bán (BH12)*, không ở đây.

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
5. Ô sai hiện ngay dưới hộp; sửa xong bấm **Phát hành**.

## Sửa, ngừng

- **Sửa** (hoặc bấm đúp một dòng): mở nội dung đang có, đổi rồi Phát hành từ ngày chọn (mặc định ngày mai).
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
