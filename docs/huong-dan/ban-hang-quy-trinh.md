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

<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035: kênh + voucher BH10, quà trả về kho KKM, mặt hàng dịch vụ không ghi kho (đóng góp) -->
## Ghi nhớ (NT-BH-035)

- **Phiếu bán BH10**: chọn **Kênh bán** (danh mục Kênh bán hàng; trống = Gần shop). Ô **Mã voucher**: bấm *Kiểm voucher* để xem số được giảm trước khi ghi (mã sai / hết hạn / đã dùng báo ngay); voucher thật sự trừ lúc **Duyệt**.
- **Quà khách trả lại** (nguyên vẹn) — ở máy bán và phiếu trả BH11 — tự nhập về **kho quà (KKM)** của cửa hàng nhận trả (kho khai ở BH17). Cửa hàng chưa khai kho quà: về kho bán như cũ. Quà lỗi / hết hạn vẫn vào kho hàng trả lại (KTL).
- **Mặt hàng dịch vụ** (phân loại *Dịch vụ*, vd phí ship): có doanh thu, thuế như thường nhưng **không** ghi thẻ kho, không tồn, không giá vốn; không bị chặn bán quá tồn. BH17 nhắc nếu mã phí ship chưa phân loại là dịch vụ (màn khai loại mặt hàng chưa có — nhờ quản trị đặt loại *Dịch vụ* cho mã đó).


<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: bố cục phiếu bán / trả bán cùng mẫu phiếu mua (đóng góp) -->
## Bố cục phiếu bán BH10 / trả bán BH11 (NT-BH-036)

Hộp phiếu bán và phiếu trả bán dùng cùng mẫu với phiếu *Nhập mua*:

- **Tiêu đề**: tên phiếu + số phiếu, nhãn *Nháp* / *Đã duyệt*; bên phải tổng tiền chữ lớn (*Phải thu khách*, BH11: *Phải trả khách*), **một** nút *? Hướng dẫn*, thu nhỏ xuống thanh dưới, đóng.
- **Đầu phiếu** (khung viền): Số phiếu, Ngày, Chi nhánh lập chứng từ, Kho, Khách hàng, Kênh bán (BH10) / Phiếu gốc (BH11), Thu tiền (chưa thu / thu ngay), Ghi chú. Nút *Thu gọn đầu phiếu* thu lại thành một dòng tóm tắt (bấm để mở).
- **Thẻ**: *Hàng hoá (n)* — nút *+ Thêm dòng* và bảng hàng; *Thu tiền* (BH11: *Trả tiền khách*) — các khoản theo hình thức; *Hoá đơn* — số, ký hiệu, ngày hoá đơn.
- **Cột phải "Trợ lý bán hàng"** (nút *Thu gọn ›*): *Kiểm tra* — các lý do chưa ghi được và các bước; *Khuyến mại & voucher* (BH10) — *Áp khuyến mại*, mã giảm giá, mã voucher + *Kiểm voucher*; *Tổng tiền* — tiền hàng, chiết khấu, trước thuế, thuế GTGT, phải thu / phải trả, giảm voucher (nếu đã kiểm), đã thu, còn công nợ.
- **Chân**: bên trái dòng *Chưa ghi được: …*; bên phải *In* (phiếu đã ghi), *Ghi*, *Thoát*. Duyệt / bỏ duyệt vẫn ở thanh nút của danh sách.
- Phiếu đã ghi mở ở chế độ **xem** (nhãn *Đang xem*): bấm *Sửa*, F2, Enter hoặc bấm đúp thân phiếu để sửa; nút *Sửa* ở danh sách mở thẳng chế độ sửa. Phiếu đã duyệt chỉ xem. Phím tắt: F9 thêm nhanh (ở ô chọn), Ctrl + S ghi, Esc thoát.
