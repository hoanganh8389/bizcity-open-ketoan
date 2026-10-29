# Sổ tổng hợp công nợ phát sinh (ACC38)

Số dư và phát sinh công nợ của **từng đối tượng**: mỗi khách hàng / nhà cung cấp một dòng.

## Ô lọc (bảng bên trái)

| Ô | Ý nghĩa |
|---|---|
| Từ ngày – Đến ngày | Kỳ xem phát sinh; số dư đầu tính tới trước "Từ ngày" |
| Số tài khoản | `131` phải thu khách hàng (mặc định), `331` phải trả người bán… gồm cả tài khoản con |
| Kiểu báo cáo | Xem chi tiết từng CN (mỗi đối tượng, chi nhánh một dòng) · Xem tổng các CN · hai kiểu "(Bỏ tổng hợp)" bỏ dòng cộng theo tài khoản |
| Nhóm KH, KH/NCC | Chỉ xem một nhóm, một đối tượng |
| Tất cả TK công nợ | Xem mọi tài khoản có theo dõi đối tượng cùng lúc; mỗi tài khoản có một dòng cộng in đậm |
| Hiển thị cả đối tượng chỉ có phát sinh trong kỳ | Mặc định tích. Bỏ tích thì ẩn đối tượng đầu kỳ và cuối kỳ đều bằng 0 |
| Chi nhánh | Tích các chi nhánh cần xem |

Cột: Mã khách hàng, Tên khách hàng, Nợ đầu kỳ, Có đầu kỳ, Ps Nợ, Ps Có, Nợ cuối kỳ, Có cuối kỳ, Chi nhánh, Tài khoản.

## Cách đọc

- **Dư Nợ** tài khoản 131: khách còn nợ mình. **Dư Có** tài khoản 131: khách trả thừa / trả trước.
- Mỗi đối tượng bù trừ Nợ − Có thành một bên; dư Nợ và dư Có **giữa các đối tượng không bù trừ cho nhau**: dòng tổng cộng có thể có cả hai bên, và khớp với dòng tài khoản đó trên Bảng cân đối số phát sinh (ACC10).
- Bấm vào một dòng để mở **Sổ chi tiết công nợ (ACC40)** của riêng đối tượng đó, xem từng chứng từ.
