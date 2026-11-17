# Tài khoản kết chuyển (ACC41A)
<!-- [2026-11-17 11:05 AM kiennt] ACC41A — hướng dẫn màn Tài khoản kết chuyển (đóng góp) -->

Danh sách các bước kết chuyển cuối kỳ: doanh thu, chi phí sang **911 Xác định kết quả kinh doanh**, rồi lãi / lỗ từ 911 sang **4212 Lợi nhuận chưa phân phối**. Màn **Kết chuyển lãi/lỗ (ACC6)** chạy đúng theo danh sách này.

## Các cột

| Cột | Nghĩa |
|---|---|
| **Thứ tự** | Chạy từ nhỏ đến lớn; bước sau thấy kết quả của bước trước (vd giảm trừ doanh thu về 511 trước, rồi 511 mới sang 911). Bước 911 → 421 luôn sau cùng. |
| **Tên kết chuyển** | Diễn giải của bước, ghi lên dòng bút toán kết chuyển. |
| **Kết chuyển từ TK** | Đầu số tài khoản đi, gồm mọi tài khoản con (vd `642` gồm 6421, 6422…). Chỉ được doanh thu, chi phí (loại 5–8), 154, 911. |
| **Kết chuyển đến TK** | Tài khoản nhận, phải là tài khoản chi tiết. Chỉ được 154, 155, 5xx, 632x, 911, 421x. |
| **Bên kết chuyển** | **Nợ**: chuyển số phát sinh Nợ (chi phí, giảm trừ doanh thu) · **Có**: chuyển số phát sinh Có (doanh thu, thu nhập) · **Hai bên**: dư bên nào chuyển bên đó (911, thu nhập / chi phí khác). |
| **Kết chuyển số dư cuối** | Tích: cộng cả số dư đầu kỳ của tài khoản đi. Chỉ dùng cho bước 911 → 421. Không tích: chỉ chuyển số phát sinh trong kỳ. |
| **Trạng thái** | Đang sử dụng / Ngừng sử dụng. Bước ngừng sử dụng không chạy khi kết chuyển. |

## Thêm, sửa

- **Thêm**: mở form *Thông tin bút toán kết chuyển*, nhập Thứ tự, Diễn giải, Tài khoản đi, Tài khoản đến, Kiểu kết chuyển (số dư cuối / số phát sinh), Loại kết chuyển, Áp dụng → **Ghi**.
- **Sửa**: bấm đúp một dòng.
- **Thôi dùng một bước**: sửa, bỏ tích **Áp dụng**.
- Cần quyền **Sửa thứ tự / quy tắc kết chuyển** của màn Kết chuyển lãi/lỗ.

Đơn vị chưa khai riêng thì dùng **bộ mặc định**. Lần sửa đầu tiên lưu thành bộ riêng của đơn vị. Mỗi lần lưu khác bộ đang dùng thêm một **phiên bản** (nút **Lịch sử phiên bản**: ai sửa, lúc nào, lý do). Các kỳ đã kết chuyển theo bộ cũ được đánh dấu **Cần kết chuyển lại** ở ACC6.

## Phần mềm kiểm gì

Danh sách sai thì màn báo đỏ và ACC6 không kết chuyển được:
- tài khoản đi / đến ngoài các đầu số cho phép;
- một bước đổ số vào tài khoản mà bước trước đã kết chuyển đi (số sẽ treo lại) — đặt bước đó chạy trước;
- không có, hoặc có hơn một, bước 911 → 421 đang áp dụng.

Cảnh báo vàng (vẫn kết chuyển được): doanh thu chọn bên Nợ, chi phí chọn bên Có, tích "số dư cuối" ở bước không phải 911.
