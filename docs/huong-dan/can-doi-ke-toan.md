# Báo cáo tình hình tài chính (ACC8)

Mẫu **B01-DN theo Thông tư 99/2025/TT-BTC** (trước đây gọi là Bảng cân đối kế toán): **tài sản** và **nguồn vốn** của đơn vị tại ngày cuối kỳ, so với đầu kỳ. Tổng cộng tài sản là mã **280**, tổng cộng nguồn vốn mã **440**.

- **Số cuối kỳ**: số dư tới hết "Đến ngày".
- **Số đầu kỳ**: số dư ngay trước "Từ ngày".

## Cách lấy số

Mỗi chỉ tiêu lấy số dư của một nhóm tài khoản. Rê chuột vào dòng để xem lấy từ tài khoản nào; bấm vào dòng để mở sổ chi tiết.

| Loại chỉ tiêu | Ví dụ | Cách lấy |
|---|---|---|
| Tài sản | Tiền (111, 112, 113), hàng tồn kho (15x) | Dư Nợ |
| Nguồn vốn | Vay (341), vốn góp (4111) | Dư Có |
| Điều chỉnh giảm | Hao mòn (214), dự phòng (229) | Ghi âm |
| Công nợ lưỡng tính | 131, 331, 333, 138, 338… | Tính **từng đối tượng**: ai dư Nợ lên phần tài sản, ai dư Có lên phần nguồn vốn, không bù trừ nhau |

Ví dụ tài khoản 131: khách còn nợ lên "Phải thu ngắn hạn của khách hàng" (mã 131), khách trả trước lên "Người mua trả tiền trước" (mã 312).

## Hai thông báo cần chú ý

- **Còn lãi / lỗ chưa kết chuyển** (nền xanh): kỳ đang xem chưa kết chuyển lãi lỗ. Phần mềm tạm cộng số này vào chỉ tiêu 420b để bảng vẫn cân. Chạy **Kết chuyển lãi/lỗ (ACC6)** thì số chuyển hẳn về tài khoản 4212 và thông báo mất.
- **Bảng chưa cân** (nền đỏ): tổng tài sản khác tổng nguồn vốn. Thông báo liệt kê tài khoản có số dư nhưng chưa thuộc chỉ tiêu nào. Nguyên nhân thường gặp: nhập số dư đầu kỳ chưa đủ (còn số trên tài khoản cân đối), hoặc dùng tài khoản ngoài hệ thống chuẩn.

## Lưu ý

- **Ngắn hạn / dài hạn**:
  - Phải thu, phải trả, vay mặc định là ngắn hạn. Phần còn trên 12 tháng khai ở màn **Phân loại dài hạn (B01D)**; báo cáo đúng ngày đó sẽ chuyển số sang chỉ tiêu dài hạn.
  - Chi phí chờ phân bổ: 2421x lên mã 161, 2422x lên mã 271, rồi tách lại theo lịch phân bổ của thẻ công cụ dụng cụ / chi phí trả trước.
  - Vay dài hạn 34112 lên thẳng mã 339.
  - Chỉ tách khi xem cả đơn vị (không lọc chi nhánh). Dòng "Đã tách ngắn hạn / dài hạn…" phía trên bảng liệt kê từng khoản đã chuyển.
- Mẫu đã gồm các chỉ tiêu mới của Thông tư 99: tài sản sinh học (150, 230), phải trả cổ tức, lợi nhuận (313), quỹ bình ổn giá (324), trái phiếu chuyển đổi (340)… và bỏ mục "Nguồn kinh phí và quỹ khác".

## Những mã số đổi so với mẫu cũ (Thông tư 200)

| Chỉ tiêu | Mẫu cũ | Thông tư 99 |
|---|---|---|
| Tài sản ngắn hạn khác (chi phí chờ phân bổ, thuế GTGT được khấu trừ…) | 150–155 | 160–165 |
| Phải thu ngắn hạn khác | 136 | 135 |
| Dự phòng phải thu ngắn hạn khó đòi | 137 | 136 |
| Tài sản thiếu chờ xử lý | 139 | 137 |
| Dự phòng giảm giá hàng tồn kho | 149 | 142 |
| Bất động sản đầu tư | 230 | 240 |
| Tài sản dở dang dài hạn | 240 | 250 |
| Đầu tư tài chính dài hạn | 250 | 260 |
| Tài sản dài hạn khác | 260 | 270 |
| Tổng cộng tài sản | 270 | 280 |
| Doanh thu chờ phân bổ ngắn hạn (trước: doanh thu chưa thực hiện) | 318 | 319 |
| Lợi nhuận sau thuế chưa phân phối | 421 (421a, 421b) | 420 (420a, 420b) |
- Đánh dấu **Ẩn chỉ tiêu không có số** để bảng gọn; bỏ đánh dấu để xem đủ mẫu.
- Nút **In** in theo khổ ngang, có ô chữ ký Người lập biểu, Kế toán trưởng, Giám đốc.

## Căn cứ pháp lý

Thông tư 99/2025/TT-BTC, Phụ lục IV — mẫu B01-DN. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hệ thống tài khoản và báo cáo tài chính*.
