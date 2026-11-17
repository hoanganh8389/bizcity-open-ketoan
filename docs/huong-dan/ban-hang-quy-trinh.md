# Quy trình bán hàng
<!-- [2026-11-13 03:50 PM Võ Hoàng] UX-14 — hướng dẫn Luồng chi tiết phân hệ Bán hàng (phiếu NT-BH-013) (đóng góp) -->

Trang chủ phân hệ **Bán hàng** → nút **Luồng chi tiết**. Cả luồng bán hàng trên một sơ đồ: khai báo gì trước, phần mềm tự làm gì ở từng bước, việc nào đang tồn đọng. Mọi ô đều bấm được; ô mờ ghi "đang phát triển" là việc chưa có màn.

## Việc cần làm

Phần mềm rà sổ mỗi lần mở trang. Bấm một việc là mở đúng màn.

| Việc | Mở ra |
|---|---|
| Chứng từ bán / trả **lỗi định khoản** | Trạm chứng từ ACC14, thẻ Lỗi — sửa danh mục rồi *Ghi sổ lại* |
| Chứng từ bán / trả **chờ định khoản** | ACC14, thẻ Chờ (chỉ có khi đơn vị để chế độ *chờ duyệt*; bán lẻ mặc định ghi sổ ngay) |
| Chương trình bán **sắp hết / đã hết hạn mức** ở một cửa hàng (≥ 90 %) | Chương trình bán BH12 |
| Khách **nợ quá hạn** | Tuổi nợ quá hạn ACC67B |
| Đơn máy POS **chờ tiền QR** | Đơn bán máy POS BH13 |
| Ca bán **còn mở từ hôm trước** | Sổ ca bán BH15 |

Không còn việc nào thì trang báo **"Không có việc tồn đọng"**.

## Sơ đồ

Đọc **trái sang phải** (theo thời gian) và **trên xuống dưới** (khai báo → làm → phát sinh).

| Bước | Phần mềm làm sẵn | Khai báo (tầng trên) | Phát sinh (tầng dưới) |
|---|---|---|---|
| 1. Giá & chính sách (BH12) | giá theo bảng giá cửa hàng → chi nhánh → công ty; khuyến mại do phần mềm kế toán tính; hạn mức từng cửa hàng tự trừ / trả | Bảng giá, Khách hàng, Khuyến mại (BH18) | Sổ chính sách (HT15) |
| 2. Bán hàng (BH10) | mỗi đơn máy bán một chứng từ, ghi sổ ngay; gửi lại không trùng; hàng thiếu thuế bị chặn ở quầy | Mặt hàng, Cài đặt bán hàng (BH17: máy bán, ghi sổ, chênh lệch két, tài khoản) | Đơn bán máy POS (BH13), Xuất điều chỉnh (BH06) |
| 3. Hoá đơn điện tử | phát hành ngầm sau bill; người mua lưu ở đơn; quà dưới 24 tháng không lên hoá đơn | — | Bảng kê bán ra |
| 4. Thu tiền (BH03) | mỗi hình thức một phiếu thu; QR chờ tiền về; chốt ca lệch két tự lập phiếu kế toán thiếu / thừa | Hình thức thanh toán (DM05) | Sổ ca bán (BH15), Thu tiền bán hàng (BH05) |
| 5. Trả / đổi hàng (BH11) | nối đơn gốc; quá hạn cần người duyệt; trả kèm quà; trả hạn mức chương trình | — | Phiếu trả máy POS (BH14) |
| 6. Công nợ phải thu (ACC39) | hạn thu theo điều khoản khách; nhắc đến hạn, quá hạn | Hạn mức nợ khách (đang phát triển) | Tuổi nợ quá hạn, Đối chiếu công nợ |
| 7. Đối chiếu & báo cáo (BH02) | doanh số, trả lại, thuần; đơn POS khớp chứng từ; lãi gộp sau giá vốn cuối tháng | Tài khoản ngầm định (ACC41), Định khoản bán hàng (khối ④ của BH17) | Tổng quan bán lẻ (BH16), Lãi gộp (BH04), Sổ nhật ký bán hàng |

Đơn vị không dùng máy bán POS: các ô máy POS không hiện.
