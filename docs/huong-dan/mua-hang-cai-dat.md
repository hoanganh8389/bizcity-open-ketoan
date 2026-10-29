# Cài đặt mua hàng (MH12)

| Phần | Cách dùng |
|---|---|
| **① Ngày nghỉ, lễ** | Lọc theo **năm** (mỗi năm một thẻ). Thêm bằng: chọn ngày → **+ Thêm ngày**; **+ Lễ cố định năm …** (01/01, 30/04, 01/05, 02/09); **Dán nhiều ngày…**; **Nhập Excel** (có file mẫu, cột *Ngày*). **Xuất Excel** để lưu / gửi. Hạn trả tính theo "ngày làm việc" bỏ qua các ngày này (thứ 7, chủ nhật luôn bỏ qua) |
| **③ Cảnh báo sắp đến hạn** | Số ngày báo trước hạn ở màn Hạn mức & công nợ đến hạn (MH05) |
| **② Số dư nợ theo nhãn tại chi nhánh** | Nợ của nhãn tại từng chi nhánh lúc bắt đầu dùng phần mềm — để hạn mức nhãn phân bổ chi nhánh tính đúng. Chọn nhãn, chi nhánh từ danh mục → **Thêm / cập nhật**. Nhiều dòng thì **Nhập Excel** (cột *Nhãn, Chi nhánh, Số dư*); có ô **Tìm**, bảng cuộn trong khung |
| **④ Tài khoản hạch toán** | Để trống: phần mềm tự chọn theo hệ thống tài khoản (cột **Đang dùng**). Muốn dùng tài khoản khác (ví dụ quà không hoá đơn ghi 71153) thì nhập vào cột **Tài khoản riêng** |

Bấm **Lưu cài đặt** ở thanh dưới cùng (luôn hiện; ghi "Có thay đổi chưa lưu" khi đã sửa). Thay đổi áp cho các phiếu lập / duyệt sau đó; phiếu đã duyệt giữ nguyên.

## Mức lệch giá cảnh báo

Trong khối **③ Cảnh báo**: "Đơn giá trên phiếu lệch quá **2** % so với giá NCC (hoặc lần nhập trước) thì cảnh báo". Một mức cho cả đơn vị, áp mọi mặt hàng, mọi NCC — không phải khai ở từng dòng giá. Lệch quá gấp đôi mức này thì báo đỏ.

## Phiếu nhập phải lập từ đơn đặt

Cũng trong khối **③**: ô **"Phiếu nhập mua phải lập từ đơn đặt đã duyệt"**.
Phiếu nhập không theo đơn là **nhập ngoài đơn** — luôn phải ghi lý do, được đánh dấu và rà soát riêng (xem hướng dẫn Chứng từ mua hàng).
- **Tắt** (mặc định): nhập ngoài đơn có lý do thì người duyệt phiếu duyệt được (cảnh báo vàng).
- **Bật**: nhập ngoài đơn chỉ được duyệt bằng **Duyệt ngoại lệ** (người có quyền, ghi lý do) — bắt buộc đi đúng quy trình *khai giá NCC → đơn đặt (duyệt) → Lập phiếu nhập từ đơn*, ngoại lệ phải có người chịu trách nhiệm.

Dù bật hay tắt, phiếu nhập theo một đơn **chưa duyệt** luôn bị chặn: duyệt đơn (hoặc duyệt ngoại lệ hạn mức) trước.
