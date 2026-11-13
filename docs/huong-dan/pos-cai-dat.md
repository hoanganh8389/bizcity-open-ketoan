# Cài đặt bán hàng (BH17)
<!-- [2026-11-12 11:10 PM Võ Hoàng] POS-ADMIN — hướng dẫn màn BH17 (đóng góp) -->
<!-- [2026-11-13 10:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: BH17 gom 4 khối cài đặt bán hàng (đóng góp) -->

Một chỗ cho mọi cài đặt bán lẻ. Mở: **Bán hàng → Cài đặt → Cài đặt bán hàng**. Sửa được khi có quyền ghi cấu hình (kế toán trưởng / quản trị); người khác chỉ xem.

## ① Máy bán tại quầy

| Ô | Ý nghĩa |
|---|---|
| Hạn trả hàng không cần duyệt | Số ngày (0–60) tính từ ngày bán. Quá hạn thì máy bán đòi người duyệt. Mặc định 3 |
| Bắt buộc mở ca trước khi bán | Chưa bật: máy bán vẫn nhận đơn khi chưa mở ca |
| Ca bán | Một ca chung cho cả chi nhánh (đợt này chỉ áp dụng cách này) |
| Ngưỡng chênh lệch két | Sổ ca bán tô đỏ ca có chênh lệch từ ngưỡng này; 0 = mọi chênh lệch |

## ② Ghi sổ chứng từ bán

Phiếu bán hàng và phiếu trả hàng: **Ghi ngay** (lên sổ khi máy bán gửi — bán lẻ mặc định, như POS cũ) hoặc **Chờ duyệt** (nằm ở Trạm chứng từ ACC14 chờ kế toán duyệt). Đổi ở đây không làm đổi chế độ của loại chứng từ khác.

## ③ Chênh lệch két khi chốt ca

- **Lập phiếu kế toán khi chốt ca lệch két** (mặc định bật): ca có tiền thiếu / thừa thì phần mềm lập một phiếu kế toán, đối tượng là chi nhánh.
- Hai dòng **Thiếu tiền** (mặc định Nợ 1381 / Có 1111) và **Thừa tiền** (Nợ 1111 / Có 3381): sửa tài khoản tại chỗ. Bên cạnh hiện *Đã có lý do* hoặc *Chưa có lý do — bấm Ghi để tạo*.
- Phiếu lập xong ghi sổ ngay hay chờ duyệt theo chế độ của loại "phiếu kế toán" (dùng chung cho mọi phiếu kế toán phân hệ lập, vd kiểm kê kho) — đổi ở ACC14.
- Tắt: chỉ lưu biên bản ca, kế toán xử lý tay.

## ④ Tài khoản hạch toán bán hàng

Danh sách loại chứng từ nhóm *Bán hàng* của Tài khoản ngầm định (ACC41) với TK Nợ / TK Có đang dùng. Chỉ xem; bấm **Sửa ở ACC41** để đổi.

Bấm **Ghi**: giá trị mới có hiệu lực từ hôm nay; lịch sử ai đổi, lúc nào lưu ở *Thiết lập → Cấu hình hệ thống*. **Bỏ sửa** để trả lại giá trị đang áp.
