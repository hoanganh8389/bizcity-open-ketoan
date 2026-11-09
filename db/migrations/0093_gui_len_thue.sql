-- [2026-11-09 07:30 PM Nguyễn Văn Thủy] PHASE-026 — ô "Gửi lên thuế" trên mặt hàng (cả mã cha); Biến thể không sang thuế thì tự tắt, khoá ở CSDL (đóng góp)
-- =============================================================================
-- 0093 Gửi lên thuế.
--   products.send_to_tax: mặt hàng có được đưa lên hoá đơn / dữ liệu thuế không. Mặc định bật.
--   Biến thể có tax_flow = 'never' (Nội bộ) thì luôn tắt: trigger ép về false khi thêm, khi đổi biến thể, khi bật lại.
--   Các biến thể khác và mã cha: người dùng tắt được; tắt thì không lên hoá đơn thuế.
--   Hệ thống bán hàng kéo cột này qua /api/v1/catalog/feed/products (sendToTax).
--   Không đổi định khoản, không chạm sổ. Không tự cập nhật products.updated_at.
-- =============================================================================

ALTER TABLE products ADD COLUMN send_to_tax boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN products.send_to_tax IS 'Gửi lên thuế: false = không lên hoá đơn / dữ liệu thuế. Biến thể tax_flow never (Nội bộ) luôn false (0093).';
CREATE INDEX products_no_tax ON products (tenant_id) WHERE NOT send_to_tax;

-- Biến thể không bao giờ sang thuế thì ô Gửi lên thuế luôn tắt.
CREATE OR REPLACE FUNCTION bizcity_products_send_to_tax_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 'internal' nhận thẳng: đơn vị chưa nạp danh mục biến thể (nạp khi đọc lần đầu) vẫn đúng.
  IF NEW.send_to_tax AND (NEW.variant_code = 'internal' OR EXISTS (
       SELECT 1 FROM item_variant_kinds k
        WHERE k.tenant_id = NEW.tenant_id AND k.code = NEW.variant_code AND k.tax_flow = 'never')) THEN
    NEW.send_to_tax := false;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_send_to_tax_guard() IS 'Biến thể không sang thuế (Nội bộ) thì send_to_tax luôn false (0093).';

-- Trigger BEFORE chạy theo thứ tự tên: products_variant_fill (điền biến thể theo đuôi khi thêm) chạy trước products_zz_send_to_tax.
CREATE TRIGGER products_zz_send_to_tax BEFORE INSERT OR UPDATE OF variant_code, send_to_tax ON products
  FOR EACH ROW EXECUTE FUNCTION bizcity_products_send_to_tax_guard();

-- Dữ liệu đang có: hàng Nội bộ tắt gửi thuế.
UPDATE products p SET send_to_tax = false
 WHERE p.send_to_tax AND (p.variant_code = 'internal' OR EXISTS (
       SELECT 1 FROM item_variant_kinds k WHERE k.tenant_id = p.tenant_id AND k.code = p.variant_code AND k.tax_flow = 'never'));
