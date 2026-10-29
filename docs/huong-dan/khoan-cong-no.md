# Khoản công nợ và đối trừ (CN01)

Công nợ theo **từng chứng từ**: mỗi phiếu bán nợ, phiếu mua nợ, phiếu thu, phiếu chi, phiếu ghi tăng / giảm, đặt cọc… ghi vào tài khoản công nợ của một đối tượng là **một khoản**, có hạn thanh toán, đã đối trừ, còn lại.

## Khoản sinh ra thế nào

- Phần mềm tự sinh và tự cập nhật theo sổ mỗi lần chứng từ được ghi sổ, sửa, huỷ. Không nhập tay.
- **Ghi Nợ** = tăng phải thu hoặc giảm phải trả (hoá đơn bán nợ, trả tiền nhà cung cấp, đặt cọc cho nhà cung cấp).
- **Ghi Có** = giảm phải thu hoặc tăng phải trả (khách trả tiền, khách đặt cọc, hoá đơn mua nợ).
- Phiếu bán lẻ thu đủ ngay **không** sinh khoản (nợ và thu nằm trong cùng một bút toán).
- Số tiền lấy theo bút toán trên sổ kế toán.
- **Hạn thanh toán** = hạn ghi trên phiếu; không ghi thì = ngày chứng từ + hạn thanh toán của đối tượng (danh mục Đối tượng).

Tổng **còn lại** của các khoản bên Nợ trừ bên Có của một đối tượng trên một tài khoản luôn bằng số dư tài khoản đó.

## Xem danh sách

Lọc theo đối tượng, tài khoản, bên (Nợ / Có), trạng thái (còn mở / đã đối trừ hết / tất cả), hạn thanh toán đến ngày, số chứng từ. Dòng trên bảng hiện tổng còn lại hai bên và phần đã quá hạn. Cột **Quá hạn (ngày)** tính đến hôm nay.

## Đối trừ

Đối trừ là ghép một khoản ghi Nợ với một khoản ghi Có **cùng đối tượng, cùng tài khoản**: tiền khách trả trừ vào hoá đơn nào, tiền cọc trừ vào hoá đơn nào.

Có ba cách:

1. **Ngay trên phiếu thu / chi**: đánh dấu **Thanh toán cho khoản công nợ**, bảng các khoản còn mở của đối tượng hiện ra, nhập số trả cho từng khoản. Phần không chọn nằm lại là khoản trả trước.
2. **Bấm một khoản ở CN01**: hộp đối trừ liệt kê các khoản bên đối ứng còn mở. Nhập số tiền từng dòng, hoặc bấm **Gợi ý theo hạn cũ trước**, rồi **Ghi đối trừ**. Một khoản ghép được với nhiều khoản.
3. **Tự đối trừ (cũ trước)** ở góc trên: ghép hàng loạt cho đối tượng / tài khoản đang lọc (không chọn đối tượng = mọi đối tượng), khoản cũ nhất ghép trước.

Gỡ đối trừ: mở hộp đối trừ của khoản, phần **Đã đối trừ**, bấm **Gỡ**.

Bù trừ **khác tài khoản** (phải thu 131 với phải trả 331 của cùng một đối tượng) không làm ở đây mà dùng **Cấn trừ công nợ (BT03)**; phiếu cấn trừ sinh ra hai khoản, mỗi khoản tự ghép trong tài khoản của nó.

## Khi chứng từ bị sửa, huỷ

- Huỷ chứng từ: khoản bị xoá, các đối trừ của nó được gỡ; khoản đối ứng trở lại "còn mở".
- Sửa làm số tiền nhỏ hơn phần đã đối trừ, hoặc đổi bên: đối trừ của khoản đó được gỡ, cần ghép lại.

Đối trừ không tạo bút toán, không đổi số dư; chỉ cho biết khoản nào đã được trả bằng phiếu nào.
