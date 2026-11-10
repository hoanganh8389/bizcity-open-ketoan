-- [2026-11-10 05:40 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán gắn định danh mặt hàng (item_id), như mọi bảng có mã hàng (0068, 0070) (đóng góp)
-- =============================================================================
-- 0097 Chương trình bán: item_id cho mặt hàng chính, hàng tặng, dòng lượt dùng.
--   Đổi mã hàng không làm chương trình / báo cáo đứt khỏi mặt hàng: liên kết theo định danh, mã chỉ là ảnh chụp lúc ghi.
-- =============================================================================

ALTER TABLE sale_programs ADD COLUMN item_id text;
ALTER TABLE sale_programs ADD COLUMN gift_item_id text;
ALTER TABLE sale_program_usage ADD COLUMN item_id text;

COMMENT ON COLUMN sale_programs.item_id IS 'Định danh của mặt hàng chính (tự gắn theo sku, 0097).';
COMMENT ON COLUMN sale_programs.gift_item_id IS 'Định danh của hàng tặng (tự gắn theo gift_sku, 0097).';
COMMENT ON COLUMN sale_program_usage.item_id IS 'Định danh của mặt hàng đã tặng / bán giảm giá (tự gắn theo sku lúc ghi, 0097).';

ALTER TABLE sale_programs ADD CONSTRAINT sale_programs_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);
ALTER TABLE sale_programs ADD CONSTRAINT sale_programs_gift_item_fk FOREIGN KEY (tenant_id, gift_item_id) REFERENCES items (tenant_id, item_id);
ALTER TABLE sale_program_usage ADD CONSTRAINT sale_program_usage_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);

-- Mặt hàng chính + hàng tặng.
CREATE FUNCTION bizcity_sale_program_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.sku IS DISTINCT FROM OLD.sku THEN
    NEW.item_id := bizcity_item_at(NEW.tenant_id, NEW.sku, CURRENT_DATE);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.gift_sku IS DISTINCT FROM OLD.gift_sku THEN
    NEW.gift_item_id := CASE WHEN NEW.gift_sku IS NULL OR NEW.gift_sku = '' THEN NULL ELSE bizcity_item_at(NEW.tenant_id, NEW.gift_sku, CURRENT_DATE) END;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_sale_program_item_id() IS 'Gắn item_id / gift_item_id cho chương trình bán theo mã (0097).';
CREATE TRIGGER sale_programs_item_id BEFORE INSERT OR UPDATE OF sku, gift_sku ON sale_programs FOR EACH ROW EXECUTE FUNCTION bizcity_sale_program_item_id();
-- Dòng lượt dùng: như bảng cấu hình còn dùng sku (0068).
CREATE TRIGGER sale_program_usage_item_id BEFORE INSERT OR UPDATE OF sku ON sale_program_usage FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();

UPDATE sale_programs SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE),
       gift_item_id = CASE WHEN gift_sku IS NULL OR gift_sku = '' THEN NULL ELSE bizcity_item_at(tenant_id, gift_sku, CURRENT_DATE) END;
UPDATE sale_program_usage SET item_id = bizcity_item_at(tenant_id, sku, doc_date);
