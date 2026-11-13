# Sổ ca bán (BH15)
<!-- [2026-11-12 11:10 PM Võ Hoàng] POS-ADMIN — hướng dẫn màn BH15 (đóng góp) -->
<!-- [2026-11-13 10:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: phiếu kế toán chênh lệch két, Lập lại phiếu (đóng góp) -->

Theo dõi tiền mặt trong két từng ca của các cửa hàng.

## Mở màn
Menu trái → **Phần riêng** → **Bán lẻ máy POS**. Cần quyền *Xem quản trị bán lẻ máy POS* (`pos:report`); thu ngân không có quyền này nên không thấy màn.

## Bảng tham số (bên trái)
- **Kỳ**: chọn nhanh (hôm nay, tháng này…) hoặc gõ từ ngày – đến ngày.
- **Chi nhánh**: tích một hay nhiều cửa hàng; để trống = mọi cửa hàng.
- Bấm **Tìm kiếm** để áp. **Lưu bộ tham số** để lần sau chọn lại một lần bấm.

- Tích **Chỉ ca có chênh lệch** để lọc ca cần xử lý.

## Đọc màn
- **Phải có** = Đầu ca + Tiền mặt bán (đã trừ tiền thối) − Tiền mặt hoàn.
- **Chênh lệch** = Đếm được − Phải có (âm là thiếu). Ca có chênh lệch từ ngưỡng ở *Cài đặt bán hàng* trở lên tô đỏ.
- Ca **Đang mở**: số liệu tính tới lúc xem. **Chốt bất chấp**: chốt khi còn đơn chờ trả tiền, có ghi lý do.
- Ca chốt có chênh lệch thì phần mềm **tự lập phiếu kế toán** (bật / tắt và tài khoản ở *Cài đặt bán hàng* BH17):
  - thiếu tiền: Nợ 1381 / Có 1111; thừa tiền: Nợ 1111 / Có 3381 — đối tượng là chi nhánh;
  - cột **Phiếu kế toán**: *Đã ghi sổ*, *Chờ duyệt* (duyệt ở Trạm chứng từ ACC14), *Lỗi — xem ACC14* (bấm để mở đúng phiếu);
  - *Chưa lập — xem lý do*: lúc chốt chưa khai lý do thiếu / thừa. Khai ở BH17, rồi chọn ca, bấm **Lập lại phiếu kế toán** (cần quyền ghi chứng từ).
- Ca chốt khi đang tắt "lập phiếu" hoặc trước khi có tính năng này: không lập; cần thì chọn ca, bấm **Lập lại phiếu kế toán**.
- Bấm một ca: nửa dưới hiện tiền theo từng hình thức thanh toán.
