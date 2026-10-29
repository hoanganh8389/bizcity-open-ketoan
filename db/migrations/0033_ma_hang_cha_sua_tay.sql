-- =============================================================================
-- 0033 products.parent_manual: mã hàng cha do người dùng sửa tay (khác mã cha tự quét theo mã) thì đặt true để lần quét lại
--      (catalog.service.ts) không đè. Code đã dùng cột này (db/types.ts, catalog.service.ts) nhưng chưa có migration tạo —
--      thêm / sửa mặt hàng báo lỗi "column parent_manual does not exist". Phát hiện bởi bộ kiểm SC-DATA-7 (types.ts ↔ migration).
-- =============================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN products.parent_manual IS 'Mã hàng cha do người dùng sửa tay (true): quét lại mã cha theo mã hàng không đè giá trị này.';
