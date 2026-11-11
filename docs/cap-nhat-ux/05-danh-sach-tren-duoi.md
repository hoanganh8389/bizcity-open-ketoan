# 05. Danh sách chứng từ trên – dưới

<!-- [2026-11-11 Nguyễn Văn Thủy] đợt 4: danh sách phiếu tiền / phiếu kế toán dạng trên – dưới (đóng góp) -->

Ngày: 11/11/2026. Áp cho Phiếu thu, Phiếu chi, Phiếu báo có, Phiếu báo nợ, Phiếu kế toán (MH11 Tổng hợp mua hàng đã có kiểu này từ trước).

- **Bấm một lần** vào phiếu: phiếu được chọn, nửa dưới hiện **Chi tiết · số phiếu** — các dòng hạch toán (Diễn giải, TK Nợ, TK Có, Số tiền, Đối tượng, Khoản mục, Bộ phận, Thuế, Số HĐ) và dòng Cộng.
- **Bấm đúp**: mở phiếu (như trước bấm một lần). Nút Sửa trên thanh công cụ vẫn mở phiếu đang tích.
- Thu gọn phần chi tiết bằng mũi tên ở đầu khung (nhớ theo máy).

Kỹ thuật: `VoucherListPage` thêm `chiTiet` (bật ở `CashVouchersPage`); phần dưới `components/voucher/ChiTietChungTu.tsx` đọc `GET /api/v1/documents/:id`.

Còn làm: phiếu bán hàng / trả lại, phiếu chuyển kho (chi tiết dòng hàng).
