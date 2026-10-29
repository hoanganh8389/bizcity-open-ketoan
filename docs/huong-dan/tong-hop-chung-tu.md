# Bảng tổng hợp chứng từ (ACC63)

Cộng mọi định khoản trong kỳ theo từng **cặp tài khoản Nợ / Có**, tách theo chi nhánh, tháng, khoản mục và lý do: mỗi dòng là một cặp, kèm tổng số tiền và số bút toán. Còn gọi là bảng tổng hợp định khoản.

## Dùng để

- Soát nhanh trong kỳ có những kiểu định khoản nào, có cặp tài khoản nào lạ không (ví dụ doanh thu ghi thẳng vào tiền mà không qua công nợ).
- Kiểm tra cấu hình định khoản tự động: lọc **Loại chứng từ** = Hoá đơn bán hàng để xem bán hàng đang lên những tài khoản nào, theo lý do nào.
- **Đối chiếu với số liệu cũ**: một tháng, một chi nhánh → bảng "Nợ tài khoản nào / Có tài khoản nào / bao nhiêu tiền / lý do nào" là cách so nhanh nhất.

## Ô lọc

| Ô | Ý nghĩa |
|---|---|
| Loại chứng từ | Chỉ tính một loại: hoá đơn bán, hàng trả lại, phiếu thu, chi, báo có, báo nợ, phiếu kế toán, kết chuyển |
| Tách theo | Chọn các cột cần tách: **Chi nhánh**, **Tháng**, **Loại chứng từ**, **Khoản mục**, **Lý do**. Mặc định tách theo chi nhánh, tháng, khoản mục, lý do. Bỏ hết để chỉ còn cặp tài khoản |

## Lưu ý

- Chỉ tính bút toán đang hiệu lực; bút toán đã sửa, đã huỷ không tính. Nhóm có tổng bằng 0 không hiện.
- Số dư đầu kỳ không có tài khoản đối ứng nên không nằm trong bảng này.
- Muốn xem từng dòng của một cặp, mở **Bảng kê chi tiết chứng từ (ACC60)** và lọc theo tài khoản.
