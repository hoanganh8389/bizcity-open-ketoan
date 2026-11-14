# NT-BH-020 · Tích điểm thành viên ở máy bán: sổ điểm ở phần mềm kế toán
<!-- [2026-11-15 09:35 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: tích điểm / voucher máy bán còn chạy dữ liệu giả (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`) |
| Màn hình | Máy bán POS React: khách → điểm, hạng; đổi điểm lấy quà / voucher; nhập mã voucher |
| Bộ phận yêu cầu | Kế toán, kinh doanh (CRM) |
| Ngày tạo | 15/11/2026 |
| Trạng thái | Nháp — hướng đã chốt ở Q5 (tgs_pos_react docs/TIEN-DO.md): **lưu điểm ở phần mềm kế toán dạng sổ điểm**; chính sách tích điểm + danh mục quà khai ở plugin `tgs_loyalty_points`. Chờ anh Hoàng duyệt Cần chốt Q1–Q4 |

## 1. Mục đích quản trị
Phòng kế toán yêu cầu 4 việc: liên kết quản lý khách (CRM), **hạch toán / định khoản** điểm, quản lý quy đổi điểm ra quà, báo cáo đầy đủ. Hiện máy bán React hiện điểm / voucher bằng dữ liệu giả (không ghi sổ). Đợt này: sổ điểm thật — mỗi lần tích / đổi / hết hạn / điều chỉnh / hoàn là một dòng, lô điểm có hạn, đổi trừ lô cũ trước.

## 2. Khai báo trước
- Chính sách tích điểm (4 loại tích, hạng + hệ số), danh mục quà / voucher theo hạng — ở `tgs_loyalty_points` (đã có bộ tính ở máy bán, đối chiếu khớp engine PHP 14 chính sách × 400 đơn).
- Tài khoản theo dõi nghĩa vụ điểm (nếu hạch toán — Q1).

## 3. Các bước thao tác
1. Bán cho khách thành viên → đơn ghi sổ thì điểm **tự tích** theo chính sách.
2. Khách đổi điểm lấy quà / voucher ở quầy → điểm trừ lô cũ trước; quà ra dòng 0đ (bill Z nếu mã Z — NT-BH-019).
3. Trả hàng → điểm đã tích của phần trả **tự hoàn**.
4. Cuối ngày: lô hết hạn tự ghi dòng hết hạn.

## 5. Kết quả mong đợi (tóm tắt)

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Tích | đơn 325.000 → điểm theo chính sách; số dư khách tăng; một dòng sổ điểm nối đơn |
| 2 | Đổi | đổi 100 điểm lấy voucher 50.000 → trừ lô cũ trước; voucher dùng được một lần ở đơn sau |
| 3 | Trả hàng | hoàn điểm đúng phần trả; điểm âm không được phép |
| 4 | Hết hạn | lô quá hạn tự ghi dòng hết hạn, số dư giảm |
| 5 | Báo cáo | số dư điểm theo khách / cửa hàng / hạng; điểm phát sinh, đã đổi, hết hạn theo kỳ |
| 6 | Dải vàng | máy bán không còn báo "tích điểm, voucher" là dữ liệu giả |

## Cần chốt (mặc định tạm — làm theo mặc định nếu không ai sửa)

| # | Câu hỏi | Mặc định tạm |
|---|---|---|
| Q1 | Điểm có hạch toán không | **Có, khi đổi** (voucher / quà là chiết khấu bán hàng hoặc chi phí theo loại quà — kế toán trưởng đặt định khoản, không viết tài khoản trong code); tích điểm chỉ ghi sổ điểm, chưa ghi nhận nghĩa vụ — cần kế toán xác nhận |
| Q2 | Sổ điểm đặt ở đâu | module mới `loyalty` (đề xuất, chưa có — ADR-0024: đặt ở thư mục modules), máy bán gọi qua API module; không thêm bảng Core |
| Q3 | Điểm cũ ở website | nạp số dư đầu theo khách một lần (lô có hạn theo chính sách) |
| Q4 | Thứ tự | sau NT-BH-019 (quà đổi điểm có thể là mã Z) |

## 7. Kết quả chạy
Chưa chạy.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 15/11/2026 | Tạo phiếu (nháp) |
