# Phiếu trả hàng máy POS (BH14)
<!-- [2026-11-12 11:10 PM Võ Hoàng] POS-ADMIN — hướng dẫn màn BH14 (đóng góp) -->

Xem phiếu trả hàng và đổi hàng tại quầy, mỗi phiếu nối về **đơn gốc**.

## Mở màn
Menu trái → **Phần riêng** → **Bán lẻ máy POS**. Cần quyền *Xem quản trị bán lẻ máy POS* (`pos:report`) — mặc định có ở chủ đơn vị, kế toán trưởng, kế toán, người xem; thu ngân không có quyền này nên không thấy màn. <!-- [2026-11-15 12:30 PM Võ Hoàng] NGHIEM-THU — pos:report mặc định cho vai trò kế toán (anh Hoàng đồng ý 15/11) (đóng góp) -->

## Bảng tham số (bên trái)
- **Kỳ**: chọn nhanh (hôm nay, tháng này…) hoặc gõ từ ngày – đến ngày.
- **Chi nhánh**: tích một hay nhiều cửa hàng; để trống = mọi cửa hàng.
- Bấm **Tìm kiếm** để áp. **Lưu bộ tham số** để lần sau chọn lại một lần bấm.

- Ô riêng: **Mã phiếu / đơn gốc** (TH…, HD…, hoặc dạng shop `08022.B00269`, `08022BT12346`).

## Đọc màn
- **Loại**: Trả hàng (hoàn tiền) hay Đổi hàng (tiền hàng trả đối trừ vào đơn mới).
- **Hoàn bằng**: tiền mặt / chuyển khoản; **Người duyệt** chỉ có khi trả quá hạn (hạn đặt ở *Cài đặt bán hàng*).
- Bấm một phiếu: nửa dưới hiện dòng hàng đã trả và tiền hoàn từng dòng.

## Số phiếu hoàn
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: phiếu hoàn theo dạng shop (đóng góp) -->
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): mặc định dạng shop, website tự báo số cuối (đóng góp) -->
Mặc định mọi cửa hàng: phiếu hoàn = mã shop + `.B` + 5 số, nối tiếp số hoàn cuối mà POS website tự báo khi mở máy bán (vd số cuối `268` → phiếu đầu `08022.B00269`), liên tục, không đặt lại. Shop mới (website chưa có số): phiếu đầu `….B00001`. Cửa hàng có mã chi nhánh không dựng được mã 12 ký tự (vd `CN-NA`): `TH` + năm tháng + 6 số như cũ. Đơn gốc mã cũ `HD…` vẫn trả được.

Hàng quà nguyên vẹn khách trả về kho bán (luật kho: kho KKM không nhận hàng khách trả), hàng lỗi vào kho KTL.
