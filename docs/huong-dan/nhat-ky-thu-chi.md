# Sổ nhật ký thu tiền (ACC72) và Sổ nhật ký chi tiền (ACC73)

Mẫu sổ S03a1 / S03a2: liệt kê các khoản **thu** (hoặc **chi**) tiền trong kỳ, mỗi khoản một dòng, số tiền chia vào các **cột tài khoản đối ứng** do bạn chọn. Không có số dư đầu kỳ, cuối kỳ (muốn xem số tồn dùng Sổ quỹ ACC55).

## Ô lọc

| Ô | Ý nghĩa |
|---|---|
| Tài khoản tiền | Mặc định `111` (tiền mặt). Nhập `112` cho tiền gửi ngân hàng, hoặc tài khoản chi tiết |
| Cột tài khoản đối ứng | Tối đa 5 đầu số, cách nhau dấu phẩy. Mặc định sổ thu: `511, 3331, 131, 112, 1388`; sổ chi: `331, 1331, 642, 641, 112` |

## Cách đọc

- **Ghi Nợ TK 111** (sổ thu) / **Ghi Có TK 111** (sổ chi): tổng tiền của dòng.
- Số tiền nằm ở cột có tài khoản đối ứng khớp đầu số; khớp nhiều cột thì vào cột đầu tiên.
- Tài khoản đối ứng không có cột nào thì vào **Số tiền TK khác**, kèm **Số hiệu TK khác**.
- Dòng **Cộng** ở cuối là tổng từng cột.
- Bấm một dòng để mở bút toán và chứng từ gốc.

Sổ đọc được nhiều năm liền nhau (ví dụ từ tháng 12 năm trước tới tháng 1 năm nay).
