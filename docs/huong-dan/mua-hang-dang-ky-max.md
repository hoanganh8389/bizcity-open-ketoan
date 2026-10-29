# Phiếu đăng ký tồn max (MH17)

Có 2 loại phiếu:

| Loại | Ai lập | Dùng khi |
|---|---|---|
| **Mã có sẵn** | Shop (hoặc kho chi nhánh cha) | 2 lần / tháng, shop đăng ký lại max cho các mã đang bán |
| **Hàng mới** | Chi nhánh cha | NCC gửi mẫu Excel chào hàng mới. **Mã chưa có** trong hệ thống, cần xem mỗi shop muốn giữ bao nhiêu |

Phiếu đã duyệt thì max được ghi vào **Tồn max (MH16)**. POS cũng gửi phiếu lên được, qua API `POST /api/v1/stock/max-requests`.

## Phiếu shop đăng ký max

1. Bấm **+ Phiếu shop đăng ký max** rồi chọn shop. Phần mềm **điền sẵn mọi mã của shop**, mỗi mã có:
   - Tồn;
   - Bán / ngày;
   - Max hiện tại;
   - **Gợi ý**: bán / ngày × số ngày cần đủ hàng.
2. Sửa cột **Max đề nghị**, hoặc bấm số gợi ý để dùng. Cột *Chênh* cho biết tăng / giảm bao nhiêu và bao nhiêu %. Tích **Chỉ mã đổi max** để chỉ xem những mã có đổi.
3. Chọn một trong ba nút:
   - **Lưu nháp**;
   - **Gửi duyệt**;
   - **Lưu & duyệt**: ghi max ngay.
4. **Duyệt tự động**: ở **Công thức đặt hàng (MH18)**, mục 4, có ô đặt mức lệch cho phép, ví dụ 20%. Nếu mọi dòng của phiếu đều lệch max cũ không quá mức đó thì phiếu gửi lên được **duyệt ngay**; người duyệt ghi là *Tự động*. Mã chưa có max cũ thì luôn phải duyệt tay.

Chỉ những dòng có đổi max mới được ghi vào phiếu.

## Phiếu hàng mới (bảng mặt hàng × shop)

1. Bấm **+ Phiếu hàng mới**. Bảng có các cột:
   - Tên hàng (theo NCC), Mã bên NCC, Mã hàng (để trống nếu chưa có), ĐVT, Quy cách;
   - **mỗi shop một cột max**;
   - Tổng max.
2. Có 2 cách điền:
   - **Thêm dòng** rồi gõ;
   - **Xuất Excel** để có mẫu đủ cột shop, gửi shop / NCC điền, rồi **Nhập Excel** lại.
3. **Gửi duyệt** rồi **Duyệt**. Dòng chưa có mã **chờ gắn mã**, ô *Hàng mới chờ gắn mã* đếm các phiếu này.
4. Hàng về kho: tạo mã ở **Danh mục mặt hàng**. Mở lại phiếu, gõ mã vào cột **Mã hàng**, rồi **Lưu (gắn mã → ghi max)**. Max của từng shop được ghi ngay.

## Danh sách

- Lọc theo **ngày lập** (Từ – Đến). Không phân trang.
- Ô màu trên cùng lọc theo trạng thái: Chờ duyệt, Nháp, Đã duyệt, Hàng mới chờ gắn mã.
- Bấm vào một phiếu để xem, sửa, duyệt hoặc huỷ.
- Phiếu mã có sẵn đã duyệt thì không sửa được nữa, vì max đã ghi. Muốn đổi thì lập phiếu mới hoặc sửa ở MH16.
