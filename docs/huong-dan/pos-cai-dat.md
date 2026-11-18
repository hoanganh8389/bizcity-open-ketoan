# Cài đặt bán hàng (BH17)
<!-- [2026-11-12 11:10 PM Võ Hoàng] POS-ADMIN — hướng dẫn màn BH17 (đóng góp) -->
<!-- [2026-11-13 10:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: BH17 gom 4 khối cài đặt bán hàng (đóng góp) -->

Một chỗ cho mọi cài đặt bán lẻ. Mở: **Bán hàng → Cài đặt → Cài đặt bán hàng**. Sửa được khi có quyền ghi cấu hình (kế toán trưởng / quản trị); người khác chỉ xem.

## ① Máy bán tại quầy

| Ô | Ý nghĩa |
|---|---|
| Hạn trả hàng không cần duyệt | Số ngày (0–60) tính từ ngày bán, áp cho cả công ty. Mặc định 3. Quá hạn thì máy bán **gửi yêu cầu trả quá hạn**, người có quyền *Duyệt trả quá hạn* (mặc định kế toán trưởng, chủ đơn vị) duyệt / từ chối ở BH14 thẻ *Yêu cầu trả quá hạn* (NT-BH-030) |
| Hạn trả riêng của cửa hàng <!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q3 (đóng góp) --> | Bảng từng cửa hàng: gõ số ngày riêng (0–60), để trống = theo hạn công ty (khoá `bizcity.pos.return_days_by_shop`, dạng `CN02=7`). Hạn tính theo **cửa hàng nhận trả** — khách mua ở CN01 mang trả ở CN02 thì lấy hạn của CN02 |
| Bắt buộc mở ca trước khi bán | Chưa bật: máy bán vẫn nhận đơn khi chưa mở ca |
| Ca bán | Một ca chung cho cả chi nhánh (đợt này chỉ áp dụng cách này) |
| Ngưỡng chênh lệch két | Sổ ca bán tô đỏ ca có chênh lệch từ ngưỡng này; 0 = mọi chênh lệch |
| Kho nhận hàng khách trả bị lỗi / hết hạn | Kho loại KTL của từng cửa hàng (NT-BH-024) |
| Kho quà (hàng khuyến mại cùng mã hàng bán) <!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028 (đóng góp) --> | Chọn kho loại **KKM** "Kho hàng khuyến mại" của từng cửa hàng (khoá `bizcity.pos.gift_warehouses`, dạng `CN01=KHO01-KM`). Dòng quà của máy bán và phiếu bán BH10 trừ tồn ở kho này, hàng bán trừ kho bán; tồn hai kho không cộng chung — hết quà ở kho KM thì máy bán báo *Hết quà* (không tặng), kho bán hết thì không bán được dù kho KM còn. Chưa chọn: quà trừ kho bán như cũ. Thuế, bill Z, giá vốn không đổi (vẫn theo mã). Chưa có kho KKM: khai ở Danh mục kho (DM18), loại *Kho hàng khuyến mại* |

**Số bill máy bán không cần cài đặt** <!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): bỏ mục "Số bill theo dạng shop" (đóng góp) -->: mọi cửa hàng mặc định dùng dạng shop — phiếu bán `{mã shop}BT{5 số}`, phiếu hoàn `{mã shop}.B{5 số}`, bill Z = mã bill + `Z`. Số bắt đầu do POS website tự báo số cuối của shop khi mở máy bán (shop mới: bán từ `10000`, hoàn từ `00001`); phần mềm chỉ nâng số lên, không bao giờ cho số chạy lùi. Cửa hàng có mã chi nhánh không dựng được mã 12 ký tự (vd `CN-NA` — có ký tự không phải chữ / số hoặc dài hơn 5 ký tự) giữ `HD` / `TH` + năm tháng như cũ.

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
