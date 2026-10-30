# Sổ chi tiết tài khoản (ACC12)

Số dư đầu kỳ, từng dòng phát sinh kèm **tài khoản đối ứng**, số dư luỹ kế sau mỗi dòng, và số dư cuối kỳ của một tài khoản (gồm cả các tài khoản con).

## Lọc

Tài khoản (gõ số rồi Enter), khoảng ngày, chi nhánh, **mã đối tượng** (để xem công nợ một khách).

## Cột

| Cột | Ý nghĩa |
|---|---|
| Số chứng từ, Số HĐ | Chứng từ gốc và số hoá đơn |
| Diễn giải | Diễn giải dòng (hoặc của bút toán), kèm tên đối tượng |
| TK đối ứng | Tài khoản bên kia của cùng cặp Nợ/Có |
| Nợ, Có | Phát sinh |
| Dư Nợ, Dư Có | Số dư luỹ kế sau dòng |

## Ghi chú

- **Tài khoản doanh thu, chi phí (loại 5–8) và 911** không hiện dòng **Số dư cuối kỳ** (sau khi kết chuyển lãi lỗ, các tài khoản này không có số dư cuối kỳ). Dòng Số dư đầu kỳ, cột Dư Nợ / Dư Có và dòng cộng *Phát sinh trong kỳ* vẫn hiện như các tài khoản khác. Muốn biết tài khoản còn số chưa kết chuyển thì xem Bảng cân đối phát sinh hoặc bảng kiểm khoá kỳ (ACC2).

- Mặc định **ẩn** bút toán gốc đã bị sửa và bút toán ghi số âm của nó (chúng triệt tiêu nhau, số dư không đổi). Sổ chỉ hiện bản mới nhất của chứng từ.
- Bấm một dòng để xem bút toán; từ đó mở được chứng từ gốc.

## Kiểu báo cáo và các cột thêm

- **Kiểu báo cáo**: theo chi tiết chứng từ (mặc định) · theo chứng từ và tài khoản đối ứng · theo chứng từ (mỗi chứng từ một dòng). Số dư luỹ kế được tính lại trên dòng đã gom.
- **TK đối ứng**, **Loại chứng từ**: lọc như ở Sổ cái (ACC88).
- Tích **Khoản mục, bộ phận** để hiện thêm hai cột khoản mục và bộ phận ghi trên từng dòng.


## Chi tiết theo mã hàng (TK 156, 152, 153…)

- Sổ các tài khoản hàng hoá (15*) hiện sẵn cột **Mã hàng** và **Tên hàng** trên từng dòng; tài khoản khác bật hai cột này ở nút **Cột**.
- Ô **Mã hàng** ở bảng lọc: chỉ xem dòng sổ của một mã. **Số dư đầu kỳ, phát sinh và số dư cuối kỳ đều tính riêng cho mã đó**, vd sổ 1561 của mã 110061004 để đối chiếu với tồn kho theo mặt hàng.
- Dòng không gắn mã hàng (thuế, tiền, công nợ…) để trống cột mã hàng và không hiện khi lọc theo mã.
