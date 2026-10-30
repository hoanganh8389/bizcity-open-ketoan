# Sổ nhật ký chung (ACC89)

Liệt kê **mọi dòng định khoản** trong kỳ theo ngày và số chứng từ, mỗi dòng kèm tài khoản đối ứng (mẫu S03a).

## Ô lọc

| Ô | Ý nghĩa |
|---|---|
| Từ ngày / Đến ngày | Khoảng ngày ghi sổ |
| Chi nhánh | Một hoặc nhiều chi nhánh (cửa hàng); để trống là tất cả |
| Số tài khoản | Chỉ xem dòng của tài khoản này, lọc theo **đầu số** (chọn `131` ra mọi dòng 131…) |
| TK đối ứng | Chỉ xem dòng có tài khoản đối ứng bắt đầu bằng số này |
| Kiểu báo cáo | Xem bảng dưới |

## Hoá đơn và tiền thu

Tiền khách trả đi kèm hoá đơn bán được ghi thành **bút toán riêng như phiếu thu tiền khách**: Số chứng từ là **số phiếu thu**, Mã lý do là lý do thu (**TTBHK – Thu tiền bán hàng**), Nợ tiền / Có 1311. Phần hàng của hoá đơn mang lý do xuất (**XBA**). Tương tự, tiền trả lại khách của phiếu hàng bán trả lại là bút toán riêng mang số phiếu chi, lý do **CNBL – Trả tiền hàng bán trả lại**.

## Kiểu báo cáo

| Kiểu | Hiện ra |
|---|---|
| Theo chi tiết chứng từ | Từng dòng định khoản. Hoá đơn bán, hàng trả lại, nhập mua, chuyển kho ghi **theo từng mặt hàng**: mỗi dòng hàng một dòng tiền hàng, một dòng thuế, một dòng giá vốn |
| Theo chứng từ + tài khoản đối ứng | Cộng các dòng cùng chứng từ, cùng tài khoản, cùng tài khoản đối ứng (ví dụ cả hoá đơn chỉ còn một dòng 1311 / 51111) |
| Theo chứng từ | Cộng các dòng cùng chứng từ, cùng tài khoản, cùng bên Nợ hoặc Có; cột tài khoản đối ứng nối các tài khoản lại |

Đổi kiểu báo cáo không đổi tổng Nợ / Có.

## Cột

Hiện sẵn: **Ngày chứng từ, Số chứng từ, Tài khoản, Tài khoản đối ứng, Ghi chú, Số tiền Nợ, Số tiền Có, Chi nhánh, Mã lý do**.

Bật thêm ở nút **Cột**: Ngày ghi sổ, Số bút toán, Loại phiếu, Số hoá đơn, Mã / Tên đối tượng, Mã / Tên hàng.

- Dòng **Tổng cộng** tính trên toàn bộ kết quả lọc; tổng Nợ luôn bằng tổng Có.
- Bấm một dòng để mở bút toán, từ đó mở tiếp chứng từ gốc.

Muốn xem riêng một tài khoản kèm số đầu kỳ, cuối kỳ, dùng **Sổ cái (ACC88)** hoặc **Sổ chi tiết tài khoản (ACC12)**.

## Sổ chi tiết định khoản theo mã hàng

Mỗi dòng định khoản có **Mã hàng / Tên hàng**, **Mã đối tượng** và **Số hoá đơn**, nên sổ này xem được định khoản đến từng mã hàng.

- **Loại chứng từ**: lọc một loại, vd *Nhập mua* để xem định khoản của phiếu nhập mua theo từng mã (Nợ 1561 / Có 3312, thuế 1331…).
- **Mã hàng**: chỉ các dòng định khoản của mã đó (nhập mua, giá vốn…).
- Menu **Mua hàng → Báo cáo mua hàng → Sổ chi tiết định khoản theo mã hàng** mở sẵn sổ này với loại *Nhập mua*, tài khoản 156 (mỗi mã một dòng; xoá ô Số tài khoản để xem cả vế 3312, 1331).
- Dòng thuế, công nợ, tiền không gắn mã hàng thì cột mã hàng để trống.
