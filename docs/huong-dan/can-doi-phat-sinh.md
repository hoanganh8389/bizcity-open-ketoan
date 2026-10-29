# Bảng cân đối số phát sinh (ACC10)

Số dư đầu kỳ, phát sinh trong kỳ và số dư cuối kỳ của từng tài khoản.

## Lọc

| Ô | Ghi chú |
|---|---|
| Từ ngày – Đến ngày | Khoảng bất kỳ, không bắt buộc trọn tháng |
| Chi nhánh | Trống = toàn công ty |
| Nhánh tài khoản | Chỉ xem một nhánh, ví dụ `13` (các tài khoản phải thu), `511` |
| Chỉ tài khoản chi tiết | Bỏ các dòng tài khoản tổng hợp |

## Cách tính

- Số dư cuối = Dư Nợ đầu + Phát sinh Nợ − Dư Có đầu − Phát sinh Có; dương là dư Nợ, âm là dư Có.
- **Tài khoản theo dõi đối tượng hoặc lưỡng tính** (131, 331…): tính số dư **từng đối tượng** rồi cộng; dư Nợ và dư Có hiện riêng, không bù trừ giữa các khách.
- Tài khoản tổng hợp (in đậm) = tổng các tài khoản con.
- Dòng **Tổng cộng** = tổng các tài khoản cấp 1. Tổng Nợ luôn bằng tổng Có; nếu lệch là có lỗi cần báo.

## Thao tác

- Bấm một tài khoản → mở **Sổ chi tiết tài khoản** cùng khoảng ngày.
- **Xuất Excel** tải tệp CSV mở thẳng bằng Excel.
