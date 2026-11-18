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
- **Hoàn bằng**: tiền mặt / chuyển khoản; **Người duyệt** chỉ có khi trả quá hạn (hạn đặt ở *Cài đặt bán hàng*) — là người đã duyệt yêu cầu trả quá hạn (từ NT-BH-030, không còn gõ tay).
- **Chi nhánh** là cửa hàng nhận trả; **Cửa hàng bán** là cửa hàng của đơn gốc. Hai cột khác nhau khi khách trả ở cửa hàng khác **cùng mã số thuế chi nhánh** (NT-BH-030): phiếu trả, hàng nhập kho, tiền chi két và giảm doanh thu ghi ở cửa hàng nhận.
- Bấm một phiếu: nửa dưới hiện dòng hàng đã trả và tiền hoàn từng dòng.

## Số phiếu hoàn
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: phiếu hoàn theo dạng shop (đóng góp) -->
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): mặc định dạng shop, website tự báo số cuối (đóng góp) -->
Mặc định mọi cửa hàng: phiếu hoàn = mã shop + `.B` + 5 số, nối tiếp số hoàn cuối mà POS website tự báo khi mở máy bán (vd số cuối `268` → phiếu đầu `08022.B00269`), liên tục, không đặt lại. Shop mới (website chưa có số): phiếu đầu `….B00001`. Cửa hàng có mã chi nhánh không dựng được mã 12 ký tự (vd `CN-NA`): `TH` + năm tháng + 6 số như cũ. Đơn gốc mã cũ `HD…` vẫn trả được.

Hàng quà nguyên vẹn khách trả về kho bán (luật kho: kho KKM không nhận hàng khách trả), hàng lỗi vào kho KTL.

## Trả ở cửa hàng khác, trả quá hạn (NT-BH-030)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: trả khác shop cùng MST, thẻ Yêu cầu trả quá hạn (đóng góp) -->
- **Trả ở cửa hàng khác:** máy bán tra được đơn (mã phiếu, SĐT khách) của các cửa hàng **cùng MST chi nhánh** (MST khai ở Danh mục chi nhánh DM02). Khác MST, hoặc một trong hai cửa hàng chưa khai MST → máy bán báo *khác mã số thuế* / *chưa khai MST* và không nhận trả. Hàng lỗi vào kho KTL của cửa hàng nhận.
- **Trả quá hạn:** máy bán không lập phiếu ngay mà **gửi yêu cầu trả quá hạn** (đủ dòng hàng, số lượng, tình trạng, lý do). Thẻ **Yêu cầu trả quá hạn** của màn này liệt kê yêu cầu (chờ duyệt lên đầu; lọc theo trạng thái, ngày gửi, cửa hàng). Bấm một yêu cầu: nửa dưới hiện dòng xin trả và nhật ký (ai gửi, ai duyệt / từ chối, lúc nào, lý do, phiếu trả đã lập).
- Người có quyền **Duyệt trả quá hạn** (`pos:return-approve`; mặc định kế toán trưởng, chủ đơn vị) bấm **Duyệt** (ghi chú tuỳ chọn) hoặc **Từ chối** (bắt buộc ghi lý do). Người gửi không tự duyệt / từ chối được yêu cầu của mình.
- Duyệt xong, máy bán hoàn tất phiếu trả **đúng các dòng đã duyệt** (khác số lượng / tình trạng thì bị chặn, gửi yêu cầu mới). Bị từ chối: máy bán thấy *bị từ chối* kèm lý do, không lập được phiếu. Mỗi yêu cầu chỉ dùng cho một phiếu trả.
