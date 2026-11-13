-- Module pos (NT-BH-009, NT-BH-010): phiên bản của đơn — tăng mỗi lần đơn đổi sau khi lập (xác nhận tiền QR, lưu người mua hoá đơn
-- điện tử, huỷ). Sự kiện pos.order.* mang số này để bản sao sổ ở website ghi đè đúng thứ tự (bản cũ đến sau thì bỏ qua).
ALTER TABLE orders ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1);
COMMENT ON COLUMN orders.version IS 'Phiên bản đơn: 1 lúc lập, +1 mỗi lần đổi (xác nhận QR, người mua hoá đơn, huỷ). Sự kiện pos.order.* mang số này cho bản sao website.';
