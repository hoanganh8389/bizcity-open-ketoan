# Báo cáo kết quả hoạt động kinh doanh (ACC9)

Mẫu **B02-DN theo Thông tư 99/2025/TT-BTC**: doanh thu, giá vốn, chi phí và lợi nhuận trong khoảng ngày đã chọn, kèm cột **cùng kỳ năm trước** (cùng khoảng ngày lùi 12 tháng).

## Số lấy từ đâu

| Mã số | Chỉ tiêu | Tài khoản | Cách lấy |
|---|---|---|---|
| 01 | Doanh thu bán hàng và cung cấp dịch vụ | 511 | Có − Nợ |
| 02 | Các khoản giảm trừ doanh thu | 521 | Nợ − Có |
| 11 | Giá vốn hàng bán | 632 | Nợ − Có |
| 21 | Lãi/lỗ của hoạt động bán, thanh lý bất động sản đầu tư (mới ở Thông tư 99) | chưa có nghiệp vụ, luôn 0 | |
| 22 | Doanh thu hoạt động tài chính | 515 | Có − Nợ |
| 23 | Chi phí tài chính (24: trong đó chi phí đi vay 6351) | 635 | Nợ − Có |
| 25, 26 | Chi phí bán hàng, quản lý doanh nghiệp | 641, 642 | Nợ − Có |
| 31, 32 | Thu nhập khác, chi phí khác | 711, 811 | Có − Nợ, Nợ − Có |
| 51, 52 | Thuế TNDN hiện hành, hoãn lại | 8211, 8212 | Nợ − Có |

Các dòng in đậm (10, 20, 30, 40, 50, 60) là dòng tính từ các dòng trên, công thức ghi ngay trong tên chỉ tiêu. Theo Thông tư 99: **30 = 20 + 21 + 22 − (23 + 25 + 26)**.

So với mẫu cũ (Thông tư 200): doanh thu tài chính đổi mã 21 → 22, chi phí tài chính 22 → 23, chi phí lãi vay (23) đổi thành **chi phí đi vay** mã 24.

## Cách dùng

- Chọn khoảng ngày, chi nhánh (hoặc tất cả).
- Bấm một chỉ tiêu lấy số để mở **Sổ chi tiết** của nhóm tài khoản tạo nên số đó.
- **Xuất Excel** để lấy tệp.

## Lưu ý

- Báo cáo **không tính bút toán kết chuyển**, nên số không đổi dù kỳ đó đã kết chuyển hay chưa.
- Dòng **Giá vốn hàng bán** chỉ có số khi chứng từ bán hàng đã có giá vốn. Chưa có giá vốn thì lợi nhuận gộp đang bằng doanh thu thuần.
- Doanh thu thuần (mã 10) khớp với **Tổng hợp bán hàng (BH02)** cùng kỳ, cộng thêm các bút toán doanh thu kế toán tự lập (nếu có).

## Căn cứ pháp lý

Thông tư 99/2025/TT-BTC, Phụ lục IV — mẫu B02-DN. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hệ thống tài khoản và báo cáo tài chính*.
