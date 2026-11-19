# Báo cáo khách hàng
<!-- [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: hướng dẫn màn Báo cáo khách hàng (đóng góp) -->

Mỗi **khách × kỳ × cửa hàng**: số đơn, tiền hàng, giảm giá, thực trả, trả hàng, voucher đã dùng, điểm tích / đổi, quà đã nhận (số lượng, giá trị theo giá bán), cửa hàng đã mua. Bấm một khách để xem **từng lần mua**. Gồm **đơn máy bán** và **phiếu bán BH10** đã duyệt. Báo cáo nội bộ, không lên sổ. Phiếu NT-BH-034 §2 B (ERP Report e, Report g).

## Mở màn
Menu **Bán lẻ máy POS** → **Báo cáo khách hàng** (`/app/pos/bao-cao-khach`, mã BH23). Quyền xem `pos:report` (mặc định: chủ đơn vị, kế toán trưởng, kế toán, người xem). Không có quyền → máy chủ trả 403.

Người được gán vai trò theo **chi nhánh** chỉ thấy số của chi nhánh trong phạm vi của mình (chọn chi nhánh ngoài phạm vi thì bỏ qua).

## Bảng tham số
| Ô | Ý nghĩa |
|---|---|
| Kỳ | Từ ngày – đến ngày (ngày bán của đơn, ngày phiếu BH10; trả hàng theo ngày trả) |
| Chi nhánh | Chọn nhiều cửa hàng; trống = mọi cửa hàng (trong phạm vi) |
| Kênh | Mã kênh bán, cách nhau dấu phẩy (vd `ZALO,GAN_SHOP`); trống = mọi kênh. Trả hàng theo kênh của đơn gốc |
| Kỳ (gộp) | **Cả khoảng ngày** (một dòng mỗi khách × cửa hàng) hoặc **Theo tháng** |

## Cột
| Cột | Cách tính |
|---|---|
| Số đơn | Đơn máy bán hoàn tất + phiếu bán BH10 đã duyệt |
| Tiền hàng | Đơn giá × số lượng của dòng hàng, gồm thuế (không gồm quà) |
| Giảm giá | Tiền hàng − thành tiền dòng hàng: khuyến mại, voucher TGS, giảm khác |
| Thực trả | Tiền khách phải trả (gồm thuế). Voucher hãng là hình thức thanh toán — không giảm thực trả |
| Trả hàng | Tiền trả lại khách (phiếu trả máy bán, phiếu trả BH11 đã duyệt) theo ngày trả |
| Thực thu | Thực trả − Trả hàng |
| Voucher (mã), Tiền voucher | Mã voucher đã dùng và tiền thực trừ — theo module **Voucher** |
| Điểm tích, Điểm đổi | Theo sổ điểm module **Điểm thành viên** (đơn máy bán) |
| Quà (SL), Giá trị quà | Dòng quà / dòng 0đ; giá trị = giá bán hiện hành của cửa hàng × số lượng (Report g). Giá vốn quà xem ở báo cáo kho |
| Cửa hàng đã mua | Mọi cửa hàng khách đã mua trong kỳ |

Khách không chọn (khách lẻ) gộp một dòng **Khách lẻ** mỗi cửa hàng.

## Từng lần mua
Bấm một dòng: bảng dưới liệt kê từng đơn / phiếu của khách trong kỳ — ngày, số đơn, nguồn (Máy bán / Phiếu BH10), mặt hàng, ĐVT, số lượng, đơn giá, giảm, thành tiền, khuyến mại, quà, voucher, điểm. Lần trả hàng hiện một dòng âm kèm số đơn gốc.

## Xuất Excel
Nút xuất trên mỗi bảng (bảng khách và bảng từng lần mua).

## Khi thiếu số
- Module **Phiếu bán nhập tay** chưa bật hoặc người xem thiếu quyền `phieu-ban:read` → chỉ có đơn máy bán; màn ghi rõ dưới bảng.
- Module **Voucher** / **Điểm thành viên** chưa đọc được → voucher, điểm lấy theo bản chụp đơn lúc bán; màn ghi rõ.

## API
- `GET /api/v1/m/pos/reports/customers?from&to&branchCodes&channels&groupBy` (`pos.report.customers`)
- `GET /api/v1/m/pos/reports/customer-detail?customer&from&to&branchCodes&channels` (`pos.report.customer-detail`; `customer` trống = khách lẻ)
- Số liệu module khác qua action đọc: `phieu-ban.customer.docs`, `voucher.usage.list`, `loyalty.order.points`.
