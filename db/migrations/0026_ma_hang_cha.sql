-- 0026 Mã hàng cha (họ mã 1 cấp): mã con trỏ về mã cha — hàng kẹp quà / khuyến mại / chia giá / mã Z, B… của cùng sản phẩm, hoặc mã đặt
--      tên khác nhưng bản chất là sản phẩm ấy (chỉ định tay ở form mặt hàng). Phân tích đặt hàng cộng dồn cả họ vào mã cha; danh mục
--      mặt hàng xếp mã con dưới mã cha. Chỉ 1 cấp: mã cha không có mã cha.
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_sku text;
COMMENT ON COLUMN products.parent_sku IS 'Mã hàng cha (họ mã 1 cấp). Tự quét theo mã: mã 9 số + đuôi (trừ T có tem) mà mã gốc có trong danh mục; sửa tay được ở form mặt hàng.';
CREATE INDEX IF NOT EXISTS products_parent_idx ON products (tenant_id, parent_sku) WHERE parent_sku IS NOT NULL;

-- Điền sẵn theo mã (như công cụ "Quét cha – con theo mã"): đuôi T (có tem, đặt riêng với NCC) không gộp.
UPDATE products c SET parent_sku = left(c.sku, 9)
 WHERE c.parent_sku IS NULL AND c.sku ~ '^[0-9]{9}[A-Z]{1,3}$' AND substring(c.sku FROM 10) <> 'T'
   AND EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = c.tenant_id AND p.sku = left(c.sku, 9) AND p.parent_sku IS NULL);
