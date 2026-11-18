# Phiếu bán hàng, hàng bán trả lại nhập tay (BH10, BH11)
<!-- [2026-11-13 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: hướng dẫn phiếu bán / trả nhập tay vào sổ thật (đóng góp) -->

Dùng cho bán buôn, bán nợ, bán ngoài quầy — những phiếu kế toán tự lập. Bán lẻ tại quầy đi máy bán POS. Từ 13/11/2026 hai màn này **ghi phiếu thật vào sổ kế toán** (trước đây là dữ liệu thử ở trình duyệt).

## Lập phiếu bán

1. **Bán hàng → Phiếu bán hàng → Thêm.**
2. Chọn **Chi nhánh**, **Kho xuất hàng**, **Khách hàng**. Bán nợ (thu chưa đủ) bắt buộc chọn khách.
3. **Số phiếu** để trống: phần mềm cấp theo cửa hàng, dạng `BH2611000001` (BH + năm tháng + 6 số). Mỗi cửa hàng một dãy riêng. Gõ tay số đã có ở cùng cửa hàng → báo trùng.
4. Thêm dòng hàng: chọn mã, số lượng, đơn giá, chiết khấu. Tên, ĐVT, thuế lấy theo danh mục mặt hàng; tiền và thuế phần mềm tính lại khi Ghi.
5. Thu tiền: nhập theo hình thức (tiền mặt, chuyển khoản…); để trống = ghi công nợ.
6. Đã xuất hoá đơn ở phần mềm hoá đơn: ghi **Số hoá đơn**, **Ký hiệu** để phiếu lên bảng kê bán ra.
7. **Ghi** → phiếu nháp, sửa / xoá được.

## Kênh bán của phiếu (NT-BH-031)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kênh bán trên phiếu bán nhập tay (đóng góp) -->
- Phiếu mang **kênh bán** (vd *Livestream CT*) chọn từ danh mục [Kênh bán hàng](pos-kenh-ban.md) của module Máy bán POS: chỉ kênh đang dùng; kênh lạ / đã ngừng → báo lỗi `POS_SALE_SOURCE`. Phiếu đang mang một kênh đã ngừng vẫn sửa / duyệt được với kênh đó.
- Không chọn kênh = tính vào *Gần shop* khi lọc và báo cáo.
- Danh sách phiếu lọc theo kênh (tham số `saleChannel` = mã kênh). Phiếu đã duyệt cộng vào báo cáo **Bán hàng theo kênh**; phiếu trả tính vào kênh của phiếu bán gốc.
- Ô chọn kênh trên khung màn BH10 đang chờ sửa khung giao diện phiếu hàng; hiện kênh gửi qua API phiếu bán (`saleChannel`).

## Khuyến mại trên phiếu bán
<!-- [2026-11-14 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-015 §5 dòng 4: khuyến mại trên phiếu bán nhập tay (đóng góp) -->

1. Nhập xong dòng hàng → khối **Khuyến mại** → **Áp khuyến mại** (có mã giảm giá thì gõ vào ô bên cạnh trước).
2. Phần mềm tính **như máy bán**: mọi chương trình bán (BH12) và khuyến mại (BH18) đang chạy ở cửa hàng tại ngày phiếu. Dòng được giảm điền chiết khấu và ghi *KM <mã>*; quà thêm dòng 0đ.
3. Bảng kết quả: bỏ chọn một chương trình → bỏ phần giảm / quà của chương trình đó. Dòng *Không áp* cho biết lý do (ngoài cửa hàng, chưa đủ số lượng, thiếu mã giảm giá…).
4. Sửa dòng hàng, cửa hàng hoặc ngày sau khi áp → màn nhắc **Áp khuyến mại lại**. **Bỏ khuyến mại** xoá hết phần đã áp.
- Tiền giảm Core tính **gồm thuế**; phiếu ghi chiết khấu **trước thuế** = tiền giảm ÷ (1 + thuế suất), làm tròn đồng — tổng phiếu có thể lệch vài đồng so với máy bán.
- Chiết khấu của dòng mang chương trình không sửa tay được; muốn giảm thêm thì lập dòng riêng hoặc bỏ chương trình.
- Phiếu có quà / giảm theo chương trình có hạn mức (BH12): hạn mức cửa hàng tự trừ khi phiếu vào sổ.
- Cửa hàng đã chọn **kho quà** (loại KKM) ở *Cài đặt bán hàng (BH17)*: dòng quà tự vào kho quà, dòng bán theo kho xuất của phiếu — quà cùng mã hàng bán vẫn tách tồn hai kho. Bật *Chặn bán quá tồn* thì quà kiểm tồn kho quà, hàng bán kiểm tồn kho xuất, không cộng chung. Kho quà khai sai (không phải KKM, khác cửa hàng, ngừng dùng) → báo khi lưu / duyệt. <!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028 (đóng góp) -->

## Duyệt, bỏ duyệt

- **Duyệt**: phiếu vào sổ — ghi ngay, hoặc chờ kế toán duyệt ở Trạm chứng từ ACC14 theo *Cài đặt bán hàng (BH17)*. Phiếu đã duyệt không sửa, không xoá.
- **Bỏ duyệt**: phần mềm đảo bút toán (ghi số âm), phiếu về nháp để sửa; duyệt lại là ghi bút toán mới. Phiếu bán đã có phiếu trả đã duyệt thì phải bỏ duyệt phiếu trả trước.

## Hàng bán trả lại

- Ghi **Phiếu gốc** là số phiếu bán nhập tay (cùng cửa hàng): phiếu trả nối phiếu gốc, phần mềm không cho trả quá số đã bán (đã trừ các lần trả trước).
- Hàng trả từ đơn máy bán POS: trả ở máy bán (BH14), không lập ở đây.

## Lưu ý

- Bán vượt tồn **không bị chặn** (như máy bán); giá vốn tính cuối tháng.
- Tồn kho lấy theo sổ kế toán. Cửa hàng chưa chuyển kho sang phần mềm kế toán thì số tồn có thể khác tồn thực tế.
- Phiếu thử lập trên máy trước đây (dữ liệu giả) không chuyển sang sổ: màn báo một lần, bấm *Đã hiểu* để ẩn.
- Đơn giá điền theo bảng giá của cửa hàng; bán vượt tồn sổ hiện "tồn sổ còn X".
- Chưa có: phát hành hoá đơn điện tử từ phiếu — làm ở đợt sau.

## Phiếu trả BH11 và lượt khuyến mại có hạn mức (NT-BH-030)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q4: BH11 trả cả phiếu bán gốc thì trả lượt khuyến mại (đóng góp) -->
Phiếu trả hàng BH11 nối phiếu bán gốc (ô *Số phiếu bán gốc*) mà **trả hết hàng bán** của phiếu gốc (cộng cả các phiếu trả đã duyệt trước, không kể dòng quà) thì khi duyệt, lượt khuyến mại có hạn mức theo cửa hàng mà phiếu gốc đã dùng được **trả lại** — như máy bán trả cả đơn. Trả một phần thì không trả lượt. Bỏ duyệt phiếu trả đó thì lượt tính lại cho phiếu gốc. Xem lượt ở *Chương trình khuyến mại* (BH18) → *Báo cáo khuyến mại*: đơn đã trả lượt ghi lý do `return`.
