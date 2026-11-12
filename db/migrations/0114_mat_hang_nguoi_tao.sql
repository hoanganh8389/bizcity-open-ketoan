-- [2026-11-12 Nguyễn Văn Thủy] mặt hàng: người tạo (truy vết), danh sách lọc mặt hàng thêm hôm nay (đóng góp)
-- =============================================================================
-- 0114 products.created_by: người tạo mặt hàng. Form / nhập Excel ghi tên người thao tác; đường khác (đồng bộ, tự thêm từ
-- chứng từ) không gửi thì trigger ghi "Hệ thống (<nguồn>)". Mặt hàng có từ trước: để trống. Không chạm sổ.
-- =============================================================================
ALTER TABLE products ADD COLUMN created_by text NOT NULL DEFAULT '';
COMMENT ON COLUMN products.created_by IS 'Người tạo mặt hàng (0114); đường tự động ghi "Hệ thống (<nguồn>)".';

CREATE OR REPLACE FUNCTION bizcity_products_created_by() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_by = '' THEN NEW.created_by := 'Hệ thống (' || COALESCE(NULLIF(NEW.source_system, ''), 'khác') || ')'; END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_created_by() IS 'Mặt hàng thêm không ghi người tạo → "Hệ thống (<nguồn>)" (0114).';
CREATE TRIGGER products_created_by BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION bizcity_products_created_by();
CREATE INDEX products_created_at ON products (tenant_id, created_at DESC);
