# Sổ quỹ tiền mặt (ACC55) và Tiền gửi ngân hàng (ACC56)

Theo dõi tiền thu vào, chi ra và số tồn của tiền mặt (tài khoản 111) và tiền gửi ngân hàng (tài khoản 112).

## Lọc (bảng bên trái)

Sửa ô lọc rồi bấm **Tìm kiếm**. Nút **Xuất** ra Excel, **In** in trang.

| Ô | Ghi chú |
|---|---|
| Từ ngày, Đến ngày | |
| Số tài khoản | Mặc định `111` (tiền gửi: `112`), gồm mọi tài khoản con; nhập tài khoản chi tiết để xem riêng một quỹ |
| TK Đối ứng | Chỉ xem khoản thu / chi với một tài khoản (ví dụ `131` để xem tiền thu nợ khách) |
| Loại CT | Tất cả, Phiếu trả tiền NCC, Phiếu thu tiền khách hàng, Phiếu thu, Phiếu chi, Phiếu báo nợ, Phiếu báo có |
| Ngân hàng | Chỉ ở Tiền gửi ngân hàng: chọn một tài khoản ngân hàng (danh mục DM09) |
| Hiển thị chi tiết từng loại thu chi | Chia số tiền vào các cột Thu ngân hàng … Chi khác (xem dưới) |
| Chi nhánh | Tích các cửa hàng cần xem; ô "Chọn" tích / bỏ tất cả |

## Cách đọc

| Cột | Ý nghĩa |
|---|---|
| Ngày CT, Số chứng từ | |
| Mã KH, Tên KH | Khách hàng, nhà cung cấp, nhân viên gắn với khoản tiền |
| Ghi chú | Ghi chú của dòng đối ứng; trống thì lấy diễn giải của chứng từ |
| Số tiền thu, Số tiền chi, **Dư cuối** | Dư cuối = số tiền còn lại sau từng dòng |
| Tài khoản đối ứng | Tiền thu từ đâu / chi cho việc gì |
| Loại chứng từ, Mã chi nhánh, Số hóa đơn, Tài khoản | Tài khoản là tài khoản tiền chi tiết của dòng (1111, 1121…) |

- Dòng **Dư đầu kỳ** là tiền tồn trước "Từ ngày" (cộng mọi quỹ, mọi chi nhánh đang chọn); dòng **Phát sinh trong kỳ** cộng thu, chi; dòng **Dư cuối kỳ** là số tồn cuối.
- Trong cùng một ngày, **các dòng thu đứng trước, các dòng chi đứng sau**.
- Bấm một dòng để mở bút toán và chứng từ gốc. Kéo tiêu đề cột lên dải phía trên để nhóm theo cột đó.

## Chi tiết từng loại thu chi

Tích **Hiển thị chi tiết từng loại thu chi** rồi Tìm kiếm: số tiền mỗi dòng nằm thêm ở một cột theo tài khoản đối ứng.

| Cột thu | Tài khoản đối ứng | Cột chi | Tài khoản đối ứng |
|---|---|---|---|
| Thu ngân hàng | 112 | Chi NH | 112 |
| Thu bán hàng | 511 | Chi MH | 15x |
| Thu công nợ | 131, 331 | Chi CN | 131, 331 |
| Thu CN khác | 136, 336 | Chi CN khác | 136, 336, 113 |
| Thu khác | còn lại | Chi khác | còn lại |

Tiền bán hàng thu ở cửa hàng ghi Nợ tiền / Có 1311 (theo lý do TTBHK), nên nằm ở cột **Thu công nợ**.

## Nguồn số liệu

- Tiền bán hàng thu ở cửa hàng: ghi tự động theo chứng từ bán hàng.
- Các khoản khác: **Phiếu thu**, **Phiếu chi**, **Phiếu báo có**, **Phiếu báo nợ** kế toán lập.

## Đối chiếu

Cuối ngày, số **Dư cuối kỳ** phải bằng tiền mặt kiểm đếm thực tế. Lệch thì kiểm tra: khoản nộp tiền về ngân hàng đã lập phiếu chưa, có chứng từ bán hàng nào đang lỗi chưa ghi sổ không (Định khoản tự động ACC14, lọc trạng thái "Lỗi").

Xem các khoản thu (hoặc chi) chia theo nhiều tài khoản đối ứng cùng lúc: **Sổ nhật ký thu tiền (ACC72)** / **Sổ nhật ký chi tiền (ACC73)**.
