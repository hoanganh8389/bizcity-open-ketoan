-- [2026-11-12 Nguyễn Văn Thủy] mã cha tự suy theo mã hàng, bỏ khai báo cha – con trên giao diện (đóng góp)
-- =============================================================================
-- 0112 Mã cha tự suy theo mã.
--   Không còn khai báo / quét cha – con: products.parent_sku luôn suy từ mã mỗi lần thêm hoặc đổi mã.
--     · Mã = 9 chữ số + 1–3 chữ cái cuối → mã cha = 9 chữ số đầu (mã cha chưa có thì con chờ, có sau tự gắn — 0067).
--     · Mã khác → không có mã cha.
--   Sửa tay parent_sku bị bỏ qua. items.parent_item_id vẫn đồng bộ qua trigger 0067. Không chạm sổ.
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_parent_from_sku(p_sku text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN upper(p_sku) ~ '^[0-9]{9}[A-Z]{1,3}$' THEN left(p_sku, 9) ELSE NULL END
$$;
COMMENT ON FUNCTION bizcity_parent_from_sku(text) IS 'Mã cha suy từ mã hàng: 9 chữ số + chữ cuối → 9 chữ số đầu; còn lại NULL (0112).';

CREATE OR REPLACE FUNCTION bizcity_products_parent_fill() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_p text := bizcity_parent_from_sku(NEW.sku);
BEGIN
  -- Mã cha cùng định danh với chính mặt hàng (mã cũ đã đổi sang mã có đuôi): không có cha.
  IF v_p IS NOT NULL AND bizcity_item_at(NEW.tenant_id, v_p, CURRENT_DATE) IS NOT DISTINCT FROM bizcity_item_at(NEW.tenant_id, NEW.sku, CURRENT_DATE)
     AND bizcity_item_at(NEW.tenant_id, v_p, CURRENT_DATE) IS NOT NULL THEN
    v_p := NULL;
  END IF;
  NEW.parent_sku := v_p;
  NEW.parent_manual := false;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_parent_fill() IS 'parent_sku luôn suy theo mã (0112).';

CREATE TRIGGER products_parent_fill BEFORE INSERT OR UPDATE OF sku, parent_sku, parent_manual ON products
  FOR EACH ROW EXECUTE FUNCTION bizcity_products_parent_fill();

-- Kích trigger cho các dòng lệch (trigger tự tính parent_sku, kể cả ca trùng định danh).
UPDATE products SET parent_manual = false
 WHERE parent_sku IS DISTINCT FROM bizcity_parent_from_sku(sku) OR parent_manual;

COMMENT ON COLUMN products.parent_sku IS 'Mã cha suy từ mã (trigger products_parent_fill, 0112): 9 chữ số + chữ cuối → 9 chữ số đầu. Không sửa tay.';
