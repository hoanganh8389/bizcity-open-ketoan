# Số dư tài khoản (ACC15)

Nhập **số dư đầu kỳ** của các tài khoản khi bắt đầu dùng phần mềm (hoặc khi đưa thêm một chi nhánh vào). Chỉ cần nhập **một lần**: từ đó về sau số dư tự tính theo chứng từ, không phải chuyển số dư sang kỳ sau.

## Cách nhập

1. Bấm **Nhập số dư đầu kỳ**, chọn chi nhánh.
2. **Ngày chốt số dư**: ngày cuối của kỳ trước kỳ bắt đầu dùng phần mềm. Ví dụ bắt đầu từ 01/10/2026 thì chọn 30/09/2026.
3. Mỗi dòng nhập **tài khoản** và **Dư Nợ** hoặc **Dư Có** (mỗi dòng chỉ một bên).
4. Tài khoản theo dõi đối tượng (131, 331, 141…): nhập **mỗi đối tượng một dòng**, kèm mã đối tượng. Ô mã đối tượng hiện chữ "Bắt buộc".
5. Bấm **Ghi sổ**.

## Dán từ Excel

Có sẵn bảng số dư trong Excel thì bấm **Dán từ Excel**, chép vùng dữ liệu 4 cột theo đúng thứ tự rồi dán vào:

| Tài khoản | Mã đối tượng | Dư Nợ | Dư Có |
|---|---|---|---|
| 1111 | | 25.000.000 | |
| 1311 | KH001 | 3.200.000 | |
| 33111 | NCC05 | | 12.000.000 |

Dòng tiêu đề và dòng không bắt đầu bằng số tài khoản được bỏ qua.

## Tổng Nợ phải bằng tổng Có

Chân bảng hiện tổng hai bên và phần lệch.

- Nhập số dư **toàn công ty** trong một phiếu: hai tổng phải bằng nhau, lệch là nhập thiếu hoặc sai.
- Nhập **riêng từng chi nhánh** (số dư một chi nhánh thường không tự cân): nhập **Tài khoản cân đối** (ví dụ tài khoản trung gian 999). Phần lệch của mỗi chi nhánh ghi vào đó; nhập đủ mọi chi nhánh thì tài khoản này tự về 0. Còn số dư trên tài khoản cân đối nghĩa là còn nhập thiếu.

## Quy tắc

- Chỉ nhập **tài khoản chi tiết**; tài khoản tổng hợp tự cộng từ tài khoản con.
- **Tài khoản hàng tồn kho (156x)** không nhập ở đây: tồn đầu kỳ theo từng mặt hàng do hệ thống bán hàng gửi sang thành phiếu điều chỉnh tăng lý do **TDK** (Nợ 156x / Có 999), định khoản ở **Định khoản tự động (ACC14)**, để sổ kho và sổ cái khớp nhau.
- Mã đối tượng phải có trong **Danh mục → Đối tượng**.

## Kiểm tra sau khi nhập

Mở **Bảng cân đối số phát sinh (ACC10)** từ ngày đầu kỳ: cột **Số dư đầu kỳ** phải khớp bảng số dư của bạn. Công nợ từng đối tượng xem ở **Sổ tổng hợp công nợ (ACC38)**.

Nhập sai thì mở phiếu, sửa rồi **Ghi lại**, hoặc **Huỷ phiếu** và nhập lại.
