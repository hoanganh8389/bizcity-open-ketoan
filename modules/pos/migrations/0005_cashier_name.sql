-- Module pos (phiếu NT-BH-008): tên thu ngân lúc lập đơn / phiếu trả — màn quản trị bán lẻ lọc / hiện theo thu ngân.
-- Ảnh chụp tên hiển thị của phiên (ctx.actor.name); định danh người dùng vẫn ở created_by. Đơn cũ để trống.
ALTER TABLE orders ADD COLUMN cashier_name text;
ALTER TABLE returns ADD COLUMN cashier_name text;
COMMENT ON COLUMN orders.cashier_name IS 'Tên thu ngân lúc lập đơn (ảnh chụp tên hiển thị; định danh ở created_by). NULL với đơn trước migration 0005.';
COMMENT ON COLUMN returns.cashier_name IS 'Tên thu ngân lúc lập phiếu trả (ảnh chụp tên hiển thị; định danh ở created_by). NULL với phiếu trước migration 0005.';
