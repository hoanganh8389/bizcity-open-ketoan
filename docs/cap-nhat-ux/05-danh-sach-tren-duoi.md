# 05. Danh sách chứng từ trên – dưới

<!-- [2026-11-11 Nguyễn Văn Thủy] đợt 4: danh sách phiếu tiền / phiếu kế toán dạng trên – dưới (đóng góp) -->

Ngày: 11/11/2026. Áp cho Phiếu thu, Phiếu chi, Phiếu báo có, Phiếu báo nợ, Phiếu kế toán (MH11 Tổng hợp mua hàng đã có kiểu này từ trước).

- **Bấm một lần** vào phiếu: phiếu được chọn, nửa dưới hiện **Chi tiết · số phiếu** — các dòng hạch toán (Diễn giải, TK Nợ, TK Có, Số tiền, Đối tượng, Khoản mục, Bộ phận, Thuế, Số HĐ) và dòng Cộng.
- **Bấm đúp**: mở phiếu (như trước bấm một lần). Nút Sửa trên thanh công cụ vẫn mở phiếu đang tích.
- **Thẻ chỉ số** trên danh sách: tổng tiền các phiếu đang xem (theo kỳ, chi nhánh), số phiếu, tồn quỹ tiền mặt (dư Nợ 111) hoặc số dư tiền gửi (dư Nợ 112) đến hôm nay — bấm thẻ số dư mở sổ quỹ / sổ tiền gửi.
- Thu gọn phần chi tiết bằng mũi tên ở đầu khung (nhớ theo máy).

Kỹ thuật: `VoucherListPage` thêm `chiTiet` và `kpi`; thẻ `KpiTien` ở `components/KpiDanhMuc.tsx`; (bật ở `CashVouchersPage`); phần dưới `components/voucher/ChiTietChungTu.tsx` đọc `GET /api/v1/documents/:id`.

## Phiếu chuyển kho (KHO01)

- Nửa dưới hiện dòng hàng của phiếu đang chọn: Mã, Tên, ĐVT, Số lô, Hạn dùng, SL xuất, SL nhận.
- Cột **Chọn** tích nhiều phiếu; nút **Nhận đủ … phiếu đã tích**: thủ kho nhập xác nhận nhận đủ số lượng các phiếu chờ nhận (ngày nhận hôm nay), phiếu lỗi báo riêng. Nhận thiếu vẫn mở từng phiếu, bấm Nhận hàng.

Còn làm: phiếu bán hàng / trả lại (màn đang chạy dữ liệu mẫu, bán hàng thật đi từ hệ thống bán hàng).
