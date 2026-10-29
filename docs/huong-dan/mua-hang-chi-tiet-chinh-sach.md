# Báo cáo chi tiết chính sách mua hàng (MH14)

Màn **Chính sách mua hàng (MH04)** mỗi chính sách một dòng, dùng để khai báo / sửa. Màn này **trải mỗi chính sách ra từng dòng ưu đãi** để thống kê và xuất Excel. Chỉ xem: khai báo, sửa chính sách làm ở MH04 hoặc Hồ sơ nhà cung cấp (MH01).

## Mỗi dòng là gì

| Loại chính sách | Mỗi dòng là |
|---|---|
| Chiết khấu theo mã hàng (bảng nhiều mã) | một mã hàng (ĐVT, mua từ SL bao nhiêu) → CK % hoặc giảm tiền / ĐVT |
| Chiết khấu theo bậc số lượng | một bậc: mua từ X → CK Y% |
| Thưởng doanh số / chỉ tiêu / giai đoạn | một bậc / một giai đoạn → mức thưởng |
| Hạn mức công nợ | dòng tổng + từng chi nhánh được phân bổ |
| Chỉ tiêu cung ứng | từng chi nhánh được giao |
| Khuyến mại mua X tặng Y, CK trên đơn, CKTT, hạn thanh toán, hợp đồng, lô / hạn dùng, ngân sách quà… | một dòng: điều kiện + được hưởng |

Cột **Dòng** cho biết dòng thứ mấy của chính sách (vd 2/3 = dòng 2 trong 3 dòng của cùng chính sách).

## Các cột

- **Nhà cung cấp** (mã bấm được → hồ sơ NCC; trống = áp mọi NCC) · **Loại chính sách**
- **Điều kiện** · **Được hưởng** · **Mức** (số) + **Đơn vị mức** (%, đ, đ / ĐVT, ngày, SL tặng…) — lọc, cộng, so sánh được trên Excel
- Mã hàng, tên hàng, ĐVT · chi nhánh · nhãn · mã chính sách · ghi chú
- Hiệu lực từ / đến · **Trạng thái** · người tạo, ngày giờ tạo

## Lọc, nhóm, xuất

- Ô trên cùng: lọc theo **nhà cung cấp**, **loại chính sách**, **trạng thái** (mặc định **Đang áp**; chọn *Mọi trạng thái* để xem cả chính sách đã tắt / hết hạn — các dòng đó hiện chữ mờ).
- Trạng thái: **Đang áp** · **Hết hiệu lực** (quá ngày đến) · **Chưa tới hiệu lực** · **Tắt**.
- Lọc từng cột ở hàng dưới tiêu đề; kéo một cột vào ô nhóm để nhóm theo NCC / loại.
- **Xuất Excel** ra đúng các dòng đang lọc; nút **Cột** để ẩn / hiện, đổi thứ tự cột.

## Mở chính sách

**Bấm đúp một dòng** mở chính sách đó (xem; bấm **Sửa** để sửa). Lưu xong bảng cập nhật ngay.
