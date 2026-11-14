# Chương trình có hạn mức (thẻ của BH18 — trước là màn Chương trình bán BH12)

<!-- [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức thay mã phụ (đóng góp) -->
<!-- [2026-11-15 10:40 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: BH12 gộp vào BH18 Chương trình khuyến mại — đổi chỗ mở, tên thẻ (đóng góp) -->

> Từ 15/11/2026 mở ở **Bán hàng → Chính sách bán → Chương trình khuyến mại (BH18)**, thẻ **Có hạn mức** / **Báo cáo hạn mức**; thêm mới: **+ Thêm** → *Tặng hàng có hạn mức cửa hàng* hoặc *Giảm giá có hạn mức cửa hàng*. Dữ liệu, cách tính, tự trừ / trả hạn mức không đổi.

Quà tặng, giảm giá, xả hàng cận date **trên chính mặt hàng** — không tạo mã tặng / mã giảm giá riêng nữa. Bản chất hàng vẫn là một: tồn kho một mã, chương trình chỉ quyết **được tặng / được giảm bao nhiêu, ở cửa hàng nào, đến ngày nào**.

## 1. Thêm chương trình

| Ô | Ý nghĩa |
|---|---|
| Mã chương trình | Dòng bán gắn mã này. Không đổi được sau khi lưu. |
| Loại chương trình | KM của NCC, KM của công ty, Xả hàng cận date… |
| Mặt hàng chính | Hàng được áp chương trình. |
| Tặng hàng | Mua *x* tặng *y*. Hàng tặng để trống = tặng chính mặt hàng chính. |
| Giảm giá | Chọn **một** cách: giảm %, giảm số tiền / đơn vị, hoặc giá bán chương trình. |
| Từ ngày – Đến ngày | Gồm cả ngày cuối. Bỏ tích *Đang áp dụng* để ngừng sớm. |
| Hạn mức theo cửa hàng | Số quà được tặng / số được bán giá giảm ở mỗi cửa hàng. *Đặt mọi cửa hàng* rồi **Áp** để điền nhanh. |

## 2. Khi bán

- Cửa hàng chỉ được áp chương trình khi **còn hạn** và **còn hạn mức**. Mỗi dòng bán theo chương trình trừ hạn mức ngay lúc lưu; hai máy cùng bán món cuối thì một máy bị từ chối.
- Hết hạn mức hoặc hết hạn: bán giá thường.
- Huỷ phiếu: hạn mức được trả lại.
- Hạn mức **không hạ được dưới số đã dùng**; cửa hàng đã dùng thì không bỏ khỏi chương trình được.
- <!-- [2026-11-12 10:25 PM Võ Hoàng] POS-KM — NT-BH-003 (đóng góp) --> **Máy bán POS** tự hiện quà / tiền giảm theo chương trình (phần mềm kế toán tính, cùng một cách tính cho mọi nơi). Dòng quà là dòng 0đ ghi tên chương trình; hàng tặng không gửi thuế thì không lên hoá đơn điện tử.
- Phiếu bán **đã ghi sổ** có dòng theo chương trình thì hạn mức **tự trừ**; huỷ phiếu thì **tự trả**. Phiếu đã bán thật mà vượt hạn mức (hai máy cùng bán món cuối) vẫn ghi đủ — xem phần vượt ở *Báo cáo hạn mức*.

## 2b. Thử tính

Nút **Thử tính** (màn BH18, không chọn dòng khuyến mại nào — tính cả khuyến mại lẫn chương trình có hạn mức): chọn cửa hàng, ngày bán, nhập vài mặt hàng (số lượng theo đơn vị nhỏ nhất, đơn giá gồm thuế) rồi bấm **Thử tính** — thấy đúng kết quả máy bán sẽ nhận: quà tặng, tiền giảm, chương trình nào không áp và vì sao (hết hạn mức, cửa hàng chưa được giao, chưa đủ số lượng…). Không ghi gì vào sổ, không trừ hạn mức.

Cột **Bản** ở danh sách: bản hiện hành của chương trình. Mỗi lần sửa nội dung (không tính hạn mức) là một bản mới; phiếu bán cũ vẫn trỏ bản cũ.

## 3. Báo cáo hạn mức

Thẻ **Báo cáo hạn mức** tính từ các dòng đã bán theo chương trình:

- **Hạn mức / Đã dùng / Còn lại** từng cửa hàng, thanh tiến độ.
- **Tốc độ**: dùng so với thời gian đã trôi. Trên 100 = dùng nhanh hơn kế hoạch (sắp hết sớm, cân nhắc chuyển hạn mức); dưới 100 = dùng chậm (còn tồn quà / hàng cận date).
- **Trong kỳ**: số lượng, giá trị, số phiếu trong khoảng ngày lọc — dùng để đối soát với nhà cung cấp.

## 4. Mã tặng / mã giảm giá cũ

Mã cũ vẫn giữ để xem lịch sử, không tạo mới. Tồn của mã cũ chuyển về mã chính bằng phiếu đổi mã.
