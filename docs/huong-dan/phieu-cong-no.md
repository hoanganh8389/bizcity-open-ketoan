# Phiếu công nợ: ghi tăng / giảm (CN02, CN03), đặt cọc (CN04), chứng từ nguồn (CN06)

Các phiếu này là phiếu nhập tay lập nhanh (định khoản như mọi chứng từ khác, qua **Định khoản tự động (ACC14)**), mỗi phiếu sinh một khoản công nợ có hạn thanh toán (xem [Khoản công nợ và đối trừ](khoan-cong-no.md)).

| Màn | Loại phiếu | Bút toán |
|---|---|---|
| CN02 | Ghi tăng công nợ phải thu | Nợ TK phải thu / Có TK đối ứng (thu nhập, doanh thu…) |
| CN02 | Ghi giảm công nợ phải thu | Nợ TK đối ứng (chiết khấu, xoá nợ…) / Có TK phải thu |
| CN03 | Ghi tăng công nợ phải trả | Nợ TK đối ứng (chi phí, tài sản, trả trước…) / Có TK phải trả |
| CN03 | Ghi giảm công nợ phải trả | Nợ TK phải trả / Có TK đối ứng |
| CN04 | Khách đặt cọc, trả trước | Nợ TK tiền / Có TK phải thu — phiếu thu (111) hoặc báo có (112) |
| CN04 | Đặt cọc, trả trước cho nhà cung cấp | Nợ TK phải trả (hoặc ký quỹ) / Có TK tiền — phiếu chi (111) hoặc báo nợ (112) |

## Lập phiếu

Bấm **Lập phiếu**, chọn loại, ngày, chi nhánh, **đối tượng** (bắt buộc), tài khoản công nợ (điền sẵn 1311 / 33111, đổi được), tài khoản đối ứng, số tiền.

- **Hạn thanh toán**: để trống thì = ngày phiếu + hạn thanh toán của đối tượng.
- **Thuế GTGT** (chỉ phiếu ghi tăng): chọn loại thuế, tiền thuế, số / ký hiệu / ngày hoá đơn. Khoản công nợ gồm cả thuế; hoá đơn lên bảng kê thuế.
- **Chứng từ nguồn**: gõ tay số đơn hàng, hợp đồng…, hoặc bấm **Chọn…** để lấy từ danh sách chứng từ nguồn (đối tượng, số tiền, hạn thanh toán được điền sẵn).

Danh sách hiện mỗi phiếu **đã đối trừ** và **còn lại** bao nhiêu. Tài khoản công nợ phải là tài khoản **theo dõi đối tượng** thì phiếu mới hiện ở danh sách và theo dõi được số còn lại.

Sửa / huỷ: bấm dòng để mở phiếu.

## Đặt cọc trừ vào hoá đơn

Ví dụ đặt cọc 3 triệu cho nhà cung cấp, sau đó nhận hoá đơn 11 triệu:

1. CN04: lập phiếu **Đặt cọc, trả trước cho nhà cung cấp** 3 triệu → khoản ghi Nợ 331 còn 3 triệu.
2. CN03: lập phiếu **Ghi tăng công nợ phải trả** 11 triệu (hoặc phiếu nhập mua gửi sang) → khoản ghi Có 331 còn 11 triệu.
3. CN01: bấm khoản đặt cọc → ghép với hoá đơn (hoặc bấm **Tự đối trừ**). Hoá đơn còn 8 triệu, tiền cọc còn 0.

## Chứng từ nguồn (CN06)

Đơn đặt hàng, báo giá, phiếu nhập / xuất, phiếu trả hàng do hệ thống mua hàng, bán hàng gửi sang qua API. Chỉ để tham chiếu, **không ghi sổ**.

- Trạng thái: **Chưa dùng** → **Đã lập phiếu** (khi lập phiếu công nợ từ chứng từ này; cột Phiếu đã lập mở được phiếu) → hoặc **Đã đóng** (không dùng nữa).
- Bên gửi gửi lại cùng mã thì nội dung được cập nhật; chứng từ đã lập phiếu vẫn giữ "đã lập phiếu".
