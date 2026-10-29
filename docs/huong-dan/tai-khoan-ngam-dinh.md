# Tài khoản ngầm định (ACC41)

Form gồm mười một tài khoản, sửa xong bấm **Ghi**:

| Ô | Thường đặt |
|---|---|
| TK tiền mặt mặc định | 1111 |
| TK thuế đầu ra ngầm định | 33311 |
| TK thuế đầu vào ngầm định | 1331 |
| TK hàng gửi đi bán | 1579 |
| TK phải thu nội bộ hàng | 13681 |
| TK phải trả nội bộ hàng | 33681 |
| TK phải thu nội bộ tiền | 13681 |
| TK phải trả nội bộ tiền | 33681 |
| TK ghi nhận giá vốn nội bộ khi chuyển kho | 6326 |
| TK Nợ mặc định ghi nhận hoa hồng | 6418 |
| TK Có mặc định ghi nhận hoa hồng | 33881 |

Chuyển kho sang đơn vị hạch toán khác dùng **phải thu nội bộ hàng**. Nếu ô này để trống thì dùng phải thu nội bộ tiền.

## Bộ định khoản

Phần dưới form gồm các tài khoản dùng khi lý do, hình thức thanh toán hoặc loại thuế không chỉ định: phải thu khách hàng (1311), phải trả nhà cung cấp (3312), chi phí hàng khuyến mãi (64184), tiền đang chuyển (11319), hàng thừa (3381), hàng thiếu chờ xử lý (1381).

Nếu bộ định khoản cần một tài khoản ngầm định còn trống, chứng từ báo lỗi "Chưa đặt …". Đặt xong thì chạy **Định khoản tự động (ACC14)** cho khoảng ngày của chứng từ đó.
