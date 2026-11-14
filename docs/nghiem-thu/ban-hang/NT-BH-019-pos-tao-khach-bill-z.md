# NT-BH-019 · Máy bán POS: tạo khách mới tại quầy, bán hàng 0đ không gửi thuế (bill Z) qua kế toán
<!-- [2026-11-15 09:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: hai phần máy bán React còn chạy dữ liệu giả ở bản hybrid (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`) |
| Màn hình | Máy bán POS React (vỏ WP `/pos/`): ô Khách hàng → *Thêm khách*; giỏ có hàng 0đ không gửi thuế (quà mã Z) |
| Bộ phận yêu cầu | Thu ngân, kế toán bán hàng |
| Ngày tạo | 15/11/2026 |
| Trạng thái | Nháp — chờ anh Hoàng duyệt hướng (Cần chốt Q1–Q3) |

## 1. Mục đích quản trị
Máy bán React ở cửa hàng đã đi kế toán thật cho bán, trả, ca, danh mục, khuyến mại. Còn hai việc vẫn chạy dữ liệu giả (dải vàng báo "Còn dùng dữ liệu giả"), dùng tới là **không ghi sổ**:
1. **Tạo khách mới** tại quầy (khách chưa có SĐT trong danh mục).
2. **Bill Z**: hàng 0đ không gửi thuế (quà mã Z, sữa < 24 tháng — chốt 10/11: không lên thuế). Module pos hiện **từ chối** cả đơn có dòng như vậy ("chưa nhận hàng 0đ không gửi thuế (bill Z) ở đợt này"), thu ngân phải bán đường cũ.

## 2. Khai báo trước
- Mặt hàng có cờ *gửi thuế* đúng (mã Z = không gửi thuế).
- Khách: mã = SĐT (10 số, bắt đầu 0) như hiện nay.

## 3. Các bước thao tác
1. Ô Khách hàng gõ SĐT chưa có → **Thêm khách** → tên, SĐT (ngày sinh, hạng nếu có) → Lưu → khách vào đơn.
2. Quét hàng mã Z (hoặc được tặng theo chương trình) → giỏ hiện dòng 0đ → thanh toán như thường.
3. Đơn đã xong có dòng 0đ còn ở bill chính → *Chuyển sang bill Z*.

## 4. Số liệu đầu vào
Cửa hàng `CN01`; mặt hàng `100021001` 325.000 (gửi thuế 8 %); quà `QZ01` mã Z, 0đ, không gửi thuế; khách mới `0901234567` "Chị Lan".

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Tạo khách | khách `0901234567` có ở danh mục đối tượng (DM12) bên kế toán ngay khi lưu; đơn mang khách đó; SĐT đã có → báo trùng, gợi ý khách cũ |
| 2 | Bán có quà mã Z | đơn được nhận; chứng từ bán chỉ mang dòng gửi thuế; dòng 0đ mã Z đi **bill Z** riêng (không thuế, không hoá đơn điện tử), vẫn trừ tồn |
| 3 | Website | bản sao về shop: phiếu bán + phiếu `zsale` / `zexport` như POS cũ |
| 4 | Chuyển sang bill Z | dòng 0đ của đơn đã hoàn tất chuyển sang bill Z; dòng có tiền → chặn |
| 5 | Trả hàng có quà Z | trả cả quà theo bill Z |
| 6 | Dải vàng | dùng hai việc trên không còn hiện "Còn dùng dữ liệu giả" |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | SĐT sai khuôn / thiếu tên | chặn, chỉ rõ ô |
| 2 | Dòng mã Z có tiền | chặn (hàng không gửi thuế không bán có tiền ở máy bán) |
| 3 | Mất mạng khi tạo khách | đơn vẫn bán được với khách lẻ, nhắc tạo lại |

## Cần chốt (mặc định tạm — làm theo mặc định nếu không ai sửa)

| # | Câu hỏi | Mặc định tạm |
|---|---|---|
| Q1 | Tạo khách đi đường nào | Module pos gọi Core tạo đối tượng (hành động `core.partner.upsert` qua cổng của module); nếu cổng chưa cho module gọi → **đề xuất Core** (bậc 4), không tự vá |
| Q2 | Bill Z nộp sổ thế nào | Dòng mã Z **không** vào chứng từ bán (không doanh thu, không thuế); nộp phiếu **xuất kho quà** riêng (lý do xuất quà theo tài khoản quà của loại chương trình — chốt 10/11) để trừ tồn, giá vốn |
| Q3 | Thứ tự | Tạo khách trước (nhỏ), bill Z sau |

## 7. Kết quả chạy
Chưa chạy.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 15/11/2026 | Tạo phiếu (nháp) |
