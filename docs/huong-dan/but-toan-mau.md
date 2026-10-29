# Bút toán mẫu (BT01) và bút toán lặp (BT02)

Dùng cho các phiếu lặp đi lặp lại: tiền thuê nhà, phân bổ chi phí trả trước, trích khấu hao thủ công, lương, phí ngân hàng…

## Bút toán mẫu (BT01)

1. Bấm **Thêm mẫu**, chọn loại phiếu (phiếu kế toán, thu, chi, báo có, báo nợ) → **Tiếp tục**.
2. Hộp soạn giống hộp lập phiếu, thêm ô **Mã mẫu**, **Tên mẫu**; không có ngày phiếu.
3. Nhập diễn giải, đối tượng, tài khoản tiền, các dòng TK Nợ / Có, chiều phân tích, thuế như phiếu thường.
   - **Số tiền** để trống được: khi lập phiếu từ mẫu thì nhập.
   - **Chi nhánh** để "(Chọn khi lập phiếu)" nếu mẫu dùng cho nhiều chi nhánh.
   - Diễn giải (chung và từng dòng) dùng được `{ky}`, `{thang}`, `{nam}`: khi ghi phiếu, phần mềm thay theo ngày phiếu. Ví dụ "Chi tiền thuê nhà tháng {ky}" → "Chi tiền thuê nhà tháng 10/2026".
4. Bấm **Ghi mẫu**. Mẫu không ghi sổ.

Không đổi được loại phiếu của mẫu đã lưu. Mẫu không dùng nữa thì bỏ chọn **Đang dùng**.

### Lập phiếu từ mẫu

Ở màn phiếu (thu, chi, báo có, báo nợ, phiếu kế toán), ô **Lập từ mẫu…** cạnh nút lập phiếu liệt kê các mẫu đang dùng của loại phiếu đó. Chọn mẫu → hộp lập phiếu điền sẵn; sửa ngày, số tiền rồi **Ghi sổ** như thường.

## Bút toán lặp (BT02)

### Khai lịch lặp

Bấm **Thêm lịch lặp**:

| Ô | Ghi chú |
|---|---|
| Bút toán mẫu | Mẫu phải nhập đủ số tiền mọi dòng và có chi nhánh (trên mẫu hoặc trên lịch) mới sinh tự động được |
| Chu kỳ | Hằng tháng, hằng quý (3 tháng một lần tính từ tháng bắt đầu), hằng năm |
| Ngày trong tháng | Tháng ngắn hơn lấy ngày cuối tháng; chọn 31 để luôn là cuối tháng |
| Từ tháng, đến tháng | Đến tháng để trống = không giới hạn |
| Chi nhánh | Trống = theo mẫu |

### Sinh phiếu

Phần **Kỳ đến hạn chưa sinh phiếu** liệt kê các kỳ có ngày phiếu đến ngày chọn (mặc định cuối tháng này) mà chưa sinh. Đánh dấu các kỳ cần sinh → **Sinh phiếu đã chọn**.

- Mỗi kỳ sinh đúng một phiếu nhập tay đã ghi sổ (số phiếu tự cấp). Bấm lại kỳ đã sinh sẽ báo "đã sinh phiếu", không sinh trùng.
- Kỳ lỗi (mẫu thiếu số tiền, ngừng dùng, kỳ đã khoá sổ…) không chặn các kỳ khác; thông báo ghi rõ lỗi từng kỳ.
- Phiếu sinh ra sửa, huỷ như phiếu thường. Huỷ phiếu lặp không làm kỳ đó hiện lại; cần lập lại thì dùng **Lập từ mẫu**.

Lịch đã sinh phiếu không xoá được (bỏ chọn **Đang chạy** để ngừng), và không sửa được theo cách làm mất kỳ đã sinh.
