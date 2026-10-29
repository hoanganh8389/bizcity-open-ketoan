# Công nợ theo mặt hàng (ACC68)

Xem khách đang nợ **tiền của những mặt hàng nào**: phần còn nợ của từng đối tượng được chia về các mặt hàng đã bán chịu. Với tài khoản phải trả (331…), là phần còn phải trả nhà cung cấp theo mặt hàng đã mua chịu.

## Cách tính

1. **Mỗi khoản bán chịu** (phần chưa thu của phiếu bán) được chia về các mặt hàng của phiếu theo tỷ trọng **tiền hàng gồm thuế** của từng dòng.
   Ví dụ phiếu bán A 216.000 đ và B 54.000 đ, khách trả 70.000 đ: còn nợ 200.000 đ, chia A 160.000 đ, B 40.000 đ.
2. **Khoản thu nợ** trừ vào **khoản nợ cũ nhất trước** (nhập trước – trả trước, giống báo cáo tuổi nợ). Trong một khoản nợ, tiền thu trừ về từng mặt hàng theo phần còn nợ của mặt hàng đó.
3. Thu **thừa** (chưa có khoản nợ nào để trừ) ghi vào dòng **(Khách trả trước, trả thừa)**, số âm. Lần bán chịu sau được trừ ngay vào số này.
4. Khoản nợ không gắn được với dòng hàng (số dư đầu kỳ, phiếu kế toán ghi nợ…) ghi vào dòng **(Không theo mặt hàng)**.
5. Hàng mua chịu (tài khoản đầu 3) chia theo giá trị nhập của từng dòng hàng.

Chỉ tính bút toán đang có hiệu lực: chứng từ đã sửa thì tính theo bản đúng hiện tại.

## Cột

- **Còn nợ đầu kỳ**: phần còn nợ của mặt hàng trước ngày đầu kỳ.
- **Bán chịu** (Mua chịu): phần chưa thu của các phiếu bán trong kỳ.
- **Đã thu** (Đã trả): tiền thu nợ trong kỳ đã trừ vào mặt hàng đó.
- **Còn nợ cuối kỳ** = đầu kỳ + bán chịu − đã thu.

Tổng cột **Còn nợ cuối kỳ** bằng số dư của tài khoản trên Sổ chi tiết công nợ.

## Cách xem

- **Theo đối tượng, chi tiết mặt hàng**: mỗi khách một dòng cộng in đậm, dưới là từng mặt hàng.
- **Cộng theo mặt hàng**: cộng mọi khách, xếp mặt hàng còn nợ nhiều nhất lên đầu.
- Chọn một **đối tượng** để xem riêng khách đó. Bấm một dòng để mở Sổ chi tiết công nợ.
