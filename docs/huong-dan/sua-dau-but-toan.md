# Sửa đầu bút toán (SC02)
<!-- [2026-11-09 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-16 (D004-14, D004-16): hướng dẫn màn theo dõi sửa đầu bút toán (Kế toán › Định khoản). -->

Màn này cho thấy **mọi lần đổi thông tin đầu của bút toán đã ghi**: số chứng từ, số hoá đơn, lý do, đối tượng, diễn giải, dấu vân tay, phiên bản sự việc, tên đối tượng. Dữ liệu lấy từ nhật ký do CSDL tự ghi (trigger 0089), nên **cả lần sửa bằng SQL ngoài ứng dụng cũng có ở đây**.

Ai thấy: người có quyền **xem sổ** (`ledger:read`). Ai xác nhận: **kế toán trưởng** (`periods:lock`). Chỉ thấy dữ liệu của đơn vị mình.

## Đọc màn

| Cột | Ý nghĩa |
|---|---|
| Giờ | lúc sửa |
| Bút toán | số bút toán, mở chứng từ gốc |
| Cột, Trước → sau | cột nào đổi và giá trị cũ / mới |
| Nguồn | **Ứng dụng**: đi đường E2 của ứng dụng (đã khai báo). **Ngoài ứng dụng**: `UPDATE` thẳng trong CSDL, không qua ứng dụng |
| Người / vai trò | vai trò CSDL đã sửa, kèm tên đăng nhập, ứng dụng, máy |
| Trạng thái | lần sửa ngoài ứng dụng: **Chưa xác nhận** hoặc **Đã xác nhận** (người, giờ, lý do) |

Cột dấu vân tay (`content_hash`) đổi theo mọi lần cập nhật đầu nên **ẩn mặc định**; bấm **Hiện cột kỹ thuật** để xem.

Bộ lọc (kỳ, nguồn, cột, bút toán, trạng thái) nằm trên địa chỉ: tải lại trang hay gửi link cho người khác vẫn đúng chỗ.

## Khi có lần sửa ngoài ứng dụng

1. Bấm dòng để xem chi tiết: giao dịch (`txid`), vai trò, máy; có hay không có nhật ký của ứng dụng cùng giao dịch.
2. Hỏi người đã sửa vì sao. Sửa sai thì **định khoản lại chứng từ** để bút toán về đúng nội dung (không sửa tay thêm lần nữa).
3. Kế toán trưởng bấm **Xác nhận đã xem**, ghi lý do (ít nhất 10 ký tự). Xác nhận là một bản ghi mới, không xoá dấu vết cũ.

Còn lần sửa ngoài ứng dụng **chưa xác nhận** trong kỳ thì chẩn đoán `LEDGER_HEADER_EDIT_UNATTRIBUTED` báo lỗi và **khoá kỳ bị chặn**, như các lỗi toàn vẹn khác; kế toán trưởng ghi lý do thì vẫn khoá được.

Lần sửa qua ứng dụng không cần xác nhận.
