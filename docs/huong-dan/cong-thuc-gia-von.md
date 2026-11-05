# Công thức giá vốn (ACC49A)

Màn này chỉ để xem. Phần mềm tính giá vốn theo đúng công thức đang hiện, không chỉnh công thức trên màn hình.

## Hai dữ liệu, hai công thức

| | Nội bộ | Thuế |
|---|---|---|
| Chứng từ | Mọi chứng từ | Chứng từ có số hoá đơn |
| Hàng trả nhà cung cấp | Mọi lý do: thành tiền − thuế | XTR1, XTR9 theo tồn đầu; lý do khác: thành tiền − thuế |

Mỗi bản cài chạy một công thức, chọn bằng biến môi trường `BOOK_MODE` (`internal` hoặc `tax`). Khung có viền đậm là bản cài đang chạy.

Cùng một phiếu có thể có giá vốn khác nhau ở hai bản. Điều này là đúng, vì hai bên giữ dữ liệu và công thức khác nhau.

## Định giá theo tồn đầu (bản thuế)

| Trường hợp | Giá trị trừ khỏi công thức |
|---|---|
| Tiền trả bằng 0 | 0 |
| Đơn giá trả ≤ đơn giá tồn đầu | Số lượng trả × đơn giá tồn đầu |
| Tiền trả ≤ giá trị tồn đầu | Tiền trả |
| Số lượng trả ≤ số lượng tồn đầu | Giá trị tồn đầu |
| Còn lại | Giá trị tồn đầu + (số lượng trả − số lượng tồn đầu) × đơn giá trả |

## Tính thử

Nhập tồn đầu và phiếu trả để so kết quả của hai công thức. Ví dụ tồn đầu 10 hộp, giá trị 1.000.000đ, trả 5 hộp với 400.000đ:

- Nội bộ: trừ 400.000đ, còn 120.000đ/hộp.
- Thuế: trừ 500.000đ, còn 100.000đ/hộp.

## Khi màn báo chi nhánh chưa gán đơn vị hạch toán

Giá vốn tính riêng theo đơn vị hạch toán. Chi nhánh chưa gán đơn vị thì dùng chung một đơn giá, nên phải gán đủ trước khi dùng số giá vốn.

Xem thêm: [Tính giá vốn](tinh-gia-von.md).
