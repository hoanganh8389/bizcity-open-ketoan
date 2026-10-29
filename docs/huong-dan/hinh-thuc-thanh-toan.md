# Hình thức thanh toán (DM05)

Mỗi khoản thanh toán trên chứng từ mang mã hình thức (`methodCode`); phần mềm ghi **Nợ tài khoản tiền của hình thức / Có tài khoản công nợ**.

Lưới: Mã, Tên, HTTT qua ngân hàng, Ghi chú, Tỉ lệ chiết khấu, Thứ tự, Tài khoản tiền, Tài khoản ngân hàng, Đối tượng nhận hộ, Ghi công nợ. Danh sách xếp theo cột Thứ tự. Chỉ xoá được hình thức chưa dùng trên chứng từ.

| Ô | Ghi chú |
|---|---|
| Mã | Phải trùng mã hệ thống bán hàng gửi (TM, QR, POS, CK…) |
| Tài khoản ngân hàng | Chuyển khoản, QR, quẹt thẻ: chọn tài khoản ngân hàng nhận tiền (danh mục DM09). Tài khoản tiền tự lấy theo tài khoản ngân hàng, và tự đổi theo khi sửa tài khoản ngân hàng |
| Đối tượng nhận hộ | QR, quẹt thẻ vào tài khoản công ty (mã QR, POS, đuôi -CT): khách trả vào tài khoản của công ty, cửa hàng không cầm tiền. Chọn đối tượng công ty (NC600000) và tài khoản tiền 13681: bút toán thu ghi **Nợ 13681 chi tiết công ty / Có 1311 chi tiết khách**. Có đối tượng nhận hộ thì tài khoản tiền không tự đổi theo tài khoản ngân hàng. Mã đuôi -CN (tài khoản ngân hàng của chi nhánh) để trống ô này |
| Ghi qua tiền đang chuyển | Hiện khi đã chọn ngân hàng. Tích thì lúc bán ghi **Nợ 11319 / Có 1311** (tiền đang về); khi ngân hàng báo có, lập phiếu báo có **Nợ 112 / Có 11319**. Số dư 11319 là tiền khách đã quét nhưng chưa về tài khoản. Dữ liệu gốc bật sẵn cho các mã đuôi -CN |
| Voucher | Tài khoản 3387: Nợ 3387 / Có 1311 lúc bán; cuối tháng lập phiếu kế toán Nợ 64184 (voucher khách) hoặc 3341 (voucher nhân viên, trừ lương) / Có 3387 |
| Tài khoản tiền | 1111 tiền mặt; khi đã chọn tài khoản ngân hàng (và không có đối tượng nhận hộ) thì ô này khoá |
| Ghi công nợ | Đánh dấu cho hình thức "khách nợ": không sinh bút toán thu tiền, số tiền để lại trên tài khoản công nợ |

## Ngân hàng (DM09)

Lưới: Mã ngân hàng, Tên ngân hàng, Địa chỉ, Điện thoại, Chủ TK, Số TK, Người liên lạc, Ghi chú, TK kế toán. Chỉ xoá được tài khoản ngân hàng chưa gắn hình thức thanh toán nào.

Khai từng tài khoản ngân hàng của đơn vị: ngân hàng, chi nhánh ngân hàng, số tài khoản, chủ tài khoản, chi nhánh thường dùng, và **tài khoản kế toán 112 chi tiết** gắn kèm.

- Mỗi tài khoản kế toán chỉ gắn **một** tài khoản ngân hàng đang dùng, nên sổ tiền gửi của tài khoản kế toán đó chính là sổ của tài khoản ngân hàng.
- Thêm tài khoản ngân hàng mới: tạo tài khoản 112 chi tiết ở **DM Tài khoản (ACC1)** trước, rồi khai ở đây, rồi gắn vào hình thức thanh toán.
- Phiếu báo nợ, báo có: ô tài khoản tiền hiện tên ngân hàng và số tài khoản.
- **Tiền gửi ngân hàng (ACC56)**: chọn ô "Tài khoản ngân hàng" để xem sổ của một tài khoản.
- Không xoá: bỏ "Đang dùng" để ngừng.
