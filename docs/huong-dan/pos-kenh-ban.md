# Kênh bán hàng
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: hướng dẫn màn Kênh bán hàng và báo cáo bán theo kênh (đóng góp) -->

Danh mục **kênh bán** (nguồn bán): Gần shop, Zalo, Facebook, TMĐT-Shopee… Máy bán và phiếu bán BH10 chọn kênh từ danh mục này; báo cáo **Bán hàng theo kênh** cộng doanh thu theo kênh. Kênh là thông tin nội bộ của bán hàng, **không lên sổ** (sổ cái, BH02 không lọc theo kênh).

## Mở màn
Menu **Bán lẻ máy POS** → **Kênh bán hàng** (`/app/pos/kenh-ban`). Xem danh mục cần quyền đọc danh mục (`catalog:read`).

| Nút | Quyền | Mặc định có |
|---|---|---|
| Thêm | `pos:kenh-ban-lap` | chủ đơn vị, kế toán trưởng, kế toán |
| Sửa, Dùng lại | `pos:kenh-ban-sua` | chủ đơn vị, kế toán trưởng, kế toán |
| Ngừng dùng | `pos:kenh-ban-xoa` | chủ đơn vị, kế toán trưởng |
| Thẻ Bán hàng theo kênh | `pos:report` | chủ đơn vị, kế toán trưởng, kế toán, người xem |

## Danh mục kênh
- Lần đầu mở màn đã có sẵn **14 kênh của POS cũ**, đúng thứ tự: Gần shop, Giới thiệu, Hotline, Zalo, Website, Khác, Facebook CT, Facebook CN, IG-Tik Tok CT, IG-Tik Tok CN, Livestream CT, Livestream CN, TMĐT-Shopee, TMĐT-Lazada. Gần shop, Giới thiệu, Hotline, Khác là **offline**; còn lại **online** — sửa được.
- **Thêm**: mã kênh (chữ in hoa không dấu, số, gạch dưới — vd `TMDT_TIKTOK`; **không đổi** sau khi tạo), tên (không trùng), loại online / offline, thứ tự (trống = cuối danh sách).
- **Sửa**: đổi tên, loại, thứ tự. Đơn cũ giữ tên kênh lúc bán.
- **Ngừng dùng**: máy bán và BH10 không chọn được nữa; đơn / phiếu cũ vẫn hiện kênh. Không có nút Xoá — kênh đã dùng chỉ ngừng dùng. Bấm **Dùng lại** để mở lại.
- Cột **Đã có đơn**: kênh đã có đơn máy bán.

## Máy bán
- Ô **Nguồn bán** trên máy bán lấy các kênh **đang dùng** theo thứ tự của danh mục; kênh đầu là kênh hiện sẵn. Thêm / ngừng kênh xong, thu ngân **khởi động lại máy bán** (tải lại trang) để thấy danh sách mới.
- Máy gửi kênh không có hoặc đã ngừng → đơn bị từ chối, máy báo "Không có kênh bán …" / "Kênh bán … đã ngừng dùng" (mã `POS_SALE_SOURCE`).
- Đơn không mang kênh (máy cũ, đơn cũ) tính là **Gần shop**. Máy bán đời cũ gửi tên kênh ("Zalo") vẫn được nhận theo tên.
- Đơn bán lúc mất mạng gửi bù mà kênh đã ngừng: vẫn nhận (hàng đã bán).
- Bản sao đơn về website ghi **tên kênh** vào ô nguồn bán như POS cũ.

## Phiếu bán BH10
Phiếu bán nhập tay mang kênh (ô `saleChannel` của API phiếu bán: mã hoặc tên kênh đang dùng); danh sách BH10 lọc được theo kênh (`saleChannel=<mã kênh>`). Xem [Phiếu bán nhập tay](phieu-ban-nhap-tay.md).

## Bán hàng theo kênh
Thẻ thứ hai của màn. Chọn **Từ ngày – Đến ngày**, **Cửa hàng** (trống = mọi cửa hàng được xem), bấm **Xem**.

| Cột | Nghĩa |
|---|---|
| Kênh, Loại, Cửa hàng | mỗi dòng một kênh × cửa hàng |
| Số đơn | đơn máy bán đã hoàn tất + phiếu bán BH10 đã duyệt (cột ẩn *Đơn máy bán*, *Phiếu BH10* tách riêng) |
| Doanh thu | tiền khách phải trả sau khuyến mại, gồm thuế |
| Khuyến mại | tiền giảm theo chương trình + voucher (tham khảo, đã trừ trong doanh thu) |
| Trả hàng | phiếu trả theo ngày trả, tính vào kênh của đơn / phiếu gốc |
| Thực thu | Doanh thu − Trả hàng |

- Thẻ chỉ số trên cùng: thực thu tất cả, **online**, **offline**, trả hàng.
- **Xuất Excel** ở góc bảng.
- Bạn chưa có quyền xem phiếu bán (`phieu-ban:read`) hoặc module Phiếu bán nhập tay chưa bật: báo cáo chỉ gồm đơn máy bán, màn ghi rõ dòng nhắc.
- BH13 (Đơn bán máy POS) lọc theo kênh ở ô **Kênh bán**, cột **Kênh** hiện tên kênh lúc bán.

## Chưa làm (để sau)
Chương trình khuyến mại theo kênh; giá bán theo kênh (cần bảng giá lõi).
