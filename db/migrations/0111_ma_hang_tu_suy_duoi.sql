-- [2026-11-12 Nguyễn Văn Thủy] mã hàng tự suy theo đuôi: bỏ ô Biến thể / Gửi lên thuế trên giao diện, hệ thống tự điền theo mã (đóng góp)
-- =============================================================================
-- 0111 Mã hàng tự suy theo đuôi.
--   Mã hàng theo quy tắc mã hàng (đuôi K, M, Q, T, B, Z…). Người dùng không chọn biến thể, không tích gửi lên thuế:
--   products.variant_code và products.send_to_tax luôn suy từ mã, mỗi lần thêm hoặc đổi mã.
--     · Mã tận cùng Z  → Nội bộ, KHÔNG gửi lên thuế.
--     · Mã khác        → gửi lên thuế; biến thể theo đuôi (bizcity_variant_from_sku).
--   Dữ liệu đang có đã khớp đúng quy tắc này; lệnh UPDATE cuối chỉ để chắc chắn. Không đổi định khoản, không chạm sổ.
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_products_variant_fill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.variant_code := bizcity_variant_from_sku(NEW.sku);
  NEW.send_to_tax := upper(NEW.sku) !~ 'Z$';
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_variant_fill() IS 'Biến thể và gửi lên thuế luôn suy từ mã hàng: đuôi Z = Nội bộ, không gửi thuế (0092, luôn suy từ 0111).';

DROP TRIGGER IF EXISTS products_variant_fill ON products;
CREATE TRIGGER products_variant_fill BEFORE INSERT OR UPDATE OF sku, variant_code, send_to_tax ON products
  FOR EACH ROW EXECUTE FUNCTION bizcity_products_variant_fill();

UPDATE products SET variant_code = bizcity_variant_from_sku(sku), send_to_tax = (upper(sku) !~ 'Z$')
 WHERE variant_code <> bizcity_variant_from_sku(sku) OR send_to_tax <> (upper(sku) !~ 'Z$');

COMMENT ON COLUMN products.variant_code IS 'Biến thể suy từ đuôi mã (trigger products_variant_fill); không sửa tay (0092, 0111).';
COMMENT ON COLUMN products.send_to_tax IS 'Gửi lên thuế: mã tận cùng Z thì không, còn lại có; suy từ mã, không sửa tay (0093, 0111).';
