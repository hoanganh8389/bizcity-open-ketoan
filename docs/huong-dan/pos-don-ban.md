# Đơn bán máy POS (BH13)
<!-- [2026-11-12 11:10 PM Võ Hoàng] POS-ADMIN — hướng dẫn màn BH13 (đóng góp) -->

Xem mọi đơn bán tại quầy của các cửa hàng để đối chiếu với chứng từ đã vào sổ. Đơn được lập ở **máy bán**, màn này chỉ xem.

## Mở màn
Menu trái → **Phần riêng** → **Bán lẻ máy POS**. Cần quyền *Xem quản trị bán lẻ máy POS* (`pos:report`) — mặc định có ở chủ đơn vị, kế toán trưởng, kế toán, người xem; thu ngân không có quyền này nên không thấy màn. <!-- [2026-11-15 12:30 PM Võ Hoàng] NGHIEM-THU — pos:report mặc định cho vai trò kế toán (anh Hoàng đồng ý 15/11) (đóng góp) -->

## Bảng tham số (bên trái)
- **Kỳ**: chọn nhanh (hôm nay, tháng này…) hoặc gõ từ ngày – đến ngày.
- **Chi nhánh**: tích một hay nhiều cửa hàng; để trống = mọi cửa hàng.
- Bấm **Tìm kiếm** để áp. **Lưu bộ tham số** để lần sau chọn lại một lần bấm.

- Ô riêng: **Mã phiếu / khách** (mã HD… hoặc mã dạng shop `08022BT12346`, số điện thoại, tên khách) và **Thu ngân**.

## Đọc màn
- **Thẻ chỉ số** tính trên cả kết quả lọc: Số đơn, Doanh thu, Đã hoàn (tiền trả lại khách của các đơn này), Thuần = Doanh thu − Đã hoàn.
- **Bấm một lần** vào đơn: nửa dưới hiện dòng hàng (mã, tên, ĐVT, số lượng, đơn giá, thành tiền, thuế).
- Cột **Chứng từ sổ**: trạng thái chứng từ bán lúc máy gửi (Đã ghi sổ / Chờ duyệt…). Chứng từ chờ duyệt xử lý ở màn Chứng từ kế toán.
- Lọc / sắp xếp / ẩn cột ngay trên tiêu đề cột; **Xuất Excel** theo định dạng chuẩn.

## Số bill
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: số bill theo dạng shop (đóng góp) -->
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): mặc định dạng shop, bỏ bật / tắt, website tự báo số cuối (đóng góp) -->
- **Mặc định mọi cửa hàng**: số bill = mã shop + `BT` + 5 số (vd `08022BT12346`), chạy liên tục qua ngày / tháng (quá 99999 sang `BU00001`…). Không có công tắc bật / tắt.
- **Số bắt đầu do website tự báo**: khi mở máy bán, trang POS website báo số cuối đã phát của shop (bán và hoàn) — số bill đầu trên máy bán nối tiếp ngay sau. Shop mới (website chưa có số): bill đầu `…BT10000`. Không phải điền tay ở đâu.
- Bill Z = số bill + `Z`. Đơn huỷ giữ số, trạng thái *Đã huỷ*.
- Cửa hàng có mã chi nhánh không dựng được mã 12 ký tự (có ký tự không phải chữ / số hoặc dài quá 5 ký tự, vd `CN-NA`): giữ `HD` + năm tháng + 6 số như cũ.
- Đơn mã `HD…` đã phát hành trước đây vẫn tra cứu, trả hàng được.
- Máy bán xin trước dải số để bán khi mất mạng nên có thể **hở số**. Xem số hở ở **Tổng quan bán lẻ (BH16) → Số bill bị thiếu**: chọn cửa hàng × ngày, mỗi dải số thiếu kèm lý do (*máy … xin lúc … chưa dùng*; dải đã quá hạn ghi thêm *dải hết hạn*).
