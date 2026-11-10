# Chương trình bán (BH12)

<!-- [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức thay mã phụ (đóng góp) -->

Quà tặng, giảm giá, xả hàng cận date **trên chính mặt hàng** — không tạo mã tặng / mã giảm giá riêng nữa. Bản chất hàng vẫn là một: tồn kho một mã, chương trình chỉ quyết **được tặng / được giảm bao nhiêu, ở cửa hàng nào, đến ngày nào**.

## 1. Thêm chương trình

| Ô | Ý nghĩa |
|---|---|
| Mã chương trình | Dòng bán gắn mã này. Không đổi được sau khi lưu. |
| Loại chương trình | KM của NCC, KM của công ty, Xả hàng cận date… Định khoản quà / giảm giá theo loại (khai ở **Thiết kế hạch toán**). |
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

## 3. Báo cáo quản lý

Thẻ **Báo cáo quản lý** tính từ các dòng đã bán theo chương trình:

- **Hạn mức / Đã dùng / Còn lại** từng cửa hàng, thanh tiến độ.
- **Tốc độ**: dùng so với thời gian đã trôi. Trên 100 = dùng nhanh hơn kế hoạch (sắp hết sớm, cân nhắc chuyển hạn mức); dưới 100 = dùng chậm (còn tồn quà / hàng cận date).
- **Trong kỳ**: số lượng, giá trị, số phiếu trong khoảng ngày lọc — dùng để đối soát với nhà cung cấp.

## 4. Mã tặng / mã giảm giá cũ

Mã cũ vẫn giữ để xem lịch sử, không tạo mới. Tồn của mã cũ chuyển về mã chính bằng phiếu đổi mã.
