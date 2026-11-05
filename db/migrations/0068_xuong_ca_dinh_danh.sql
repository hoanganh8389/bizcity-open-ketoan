-- [2026-11-05 12:30 PM Nguyễn Văn Thủy] PHASE-026 — S026-19 (docs/core/06-xuong-ca-dinh-danh.md): gộp mã nhiều lần, tra mã qua chuỗi gộp, item_id trên bảng cấu hình và dòng hoá đơn, bảng cấu hình theo mã hiện hành (đóng góp)
-- [2026-11-05 01:35 PM Nguyễn Văn Thủy] PHASE-026 — đổi số 0070 → 0068 theo W-13 trước khi gộp vào main, không đổi nội dung (đóng góp)
-- =============================================================================
-- 0068 Xương cá.
--   - items.merged_into_item_id + merged_at: A gộp vào B, sau đó B gộp vào C. Mỗi mặt hàng gộp tối đa một lần, không viết lại;
--     đích cuối tính bằng cách đi theo chuỗi (bizcity_item_root / bizcity_item_walk). Sổ cũ không đụng (R-ITEM-0, R-ITEM-5).
--   - bizcity_item_at: tra cả bí danh và đi theo chuỗi gộp tại ngày.
--   - item_id trên bảng còn khoá theo mã. Bảng CẤU HÌNH mô tả hiện tại nên cột sku luôn là mã hiện hành, đổi mã tự cập nhật;
--     bảng LỊCH SỬ (sổ, kho, dòng hoá đơn) giữ ảnh chụp.
--   - Mã của hàng còn sống / đã gộp không dùng lại cho hàng khác (bizcity_item_code_taken); mã của hàng đã xoá vẫn tạo lại được (T026-G7).
--   - Danh mục không sinh bút toán: gộp bị chặn khi mặt hàng nguồn còn tồn; chuyển tồn là chứng từ riêng.
-- =============================================================================

-- ── Gộp mã ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE items ADD COLUMN merged_into_item_id text REFERENCES items(item_id), ADD COLUMN merged_at date;
ALTER TABLE items ADD CONSTRAINT items_merged_pair CHECK ((merged_into_item_id IS NULL) = (merged_at IS NULL));
CREATE INDEX items_merged_into ON items (tenant_id, merged_into_item_id) WHERE merged_into_item_id IS NOT NULL;
COMMENT ON COLUMN items.merged_into_item_id IS 'Mặt hàng này đã gộp vào mặt hàng nào (0068). Đặt một lần, không đổi; gộp nhiều lần tạo thành chuỗi A → B → C.';
COMMENT ON COLUMN items.merged_at IS 'Ngày gộp có hiệu lực. Chứng từ trước ngày này vẫn thuộc mặt hàng cũ.';

CREATE OR REPLACE FUNCTION bizcity_items_merge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cur text;
  v_tenant bigint;
  n int := 0;
BEGIN
  IF NEW.merged_into_item_id IS NOT DISTINCT FROM OLD.merged_into_item_id AND NEW.merged_at IS NOT DISTINCT FROM OLD.merged_at THEN
    RETURN NEW;
  END IF;
  IF OLD.merged_into_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Mặt hàng % đã gộp, không đổi lại được (R-ITEM-5).', OLD.item_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.merged_into_item_id = NEW.item_id THEN
    RAISE EXCEPTION 'Mặt hàng % không gộp vào chính nó.', NEW.item_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT tenant_id INTO v_tenant FROM items WHERE item_id = NEW.merged_into_item_id;
  IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Mặt hàng đích % không thuộc cùng đơn vị.', NEW.merged_into_item_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  v_cur := NEW.merged_into_item_id;
  LOOP
    SELECT merged_into_item_id INTO v_cur FROM items WHERE item_id = v_cur;
    EXIT WHEN v_cur IS NULL;
    n := n + 1;
    IF v_cur = NEW.item_id OR n > 1000 THEN
      RAISE EXCEPTION 'Gộp mã tạo vòng tại mặt hàng %.', NEW.item_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_items_merge_guard() IS 'Bất biến gộp mã: đặt một lần, không tự trỏ, cùng đơn vị, không vòng (0068).';
CREATE TRIGGER items_merge_guard BEFORE UPDATE OF merged_into_item_id, merged_at ON items FOR EACH ROW EXECUTE FUNCTION bizcity_items_merge_guard();

-- Đích cuối tại một ngày; p_day NULL = đích cuối hiện tại, không xét ngày.
CREATE OR REPLACE FUNCTION bizcity_item_walk(p_item text, p_day date DEFAULT NULL) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_cur text := p_item;
  v_next text;
  v_at date;
  n int := 0;
BEGIN
  IF p_item IS NULL THEN
    RETURN NULL;
  END IF;
  LOOP
    SELECT merged_into_item_id, merged_at INTO v_next, v_at FROM items WHERE item_id = v_cur;
    IF v_next IS NULL OR (p_day IS NOT NULL AND p_day < v_at) OR n > 1000 THEN
      RETURN v_cur;
    END IF;
    v_cur := v_next;
    n := n + 1;
  END LOOP;
END $$;
COMMENT ON FUNCTION bizcity_item_walk(text, date) IS 'Đi theo chuỗi gộp tới mặt hàng có hiệu lực tại ngày; không có ngày thì tới đích cuối (0068).';

CREATE OR REPLACE FUNCTION bizcity_item_root(p_item text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT bizcity_item_walk(p_item, NULL)
$$;
COMMENT ON FUNCTION bizcity_item_root(text) IS 'Mặt hàng đích cuối của chuỗi gộp (0068).';

-- Mọi mặt hàng cùng chuỗi gộp với p_item: đích cuối và mọi mặt hàng đã gộp vào nó. Báo cáo "gộp" dùng hàm này.
CREATE OR REPLACE FUNCTION bizcity_item_family(p_item text) RETURNS SETOF text LANGUAGE sql STABLE AS $$
  WITH RECURSIVE f(item_id) AS (
    SELECT bizcity_item_root(p_item)
    UNION
    SELECT i.item_id FROM items i JOIN f ON i.merged_into_item_id = f.item_id
  )
  SELECT item_id FROM f WHERE item_id IS NOT NULL
$$;
COMMENT ON FUNCTION bizcity_item_family(text) IS 'Đích cuối và mọi mặt hàng đã gộp vào nó, gồm cả gộp nhiều lần (0068).';

-- ── Tra mã tại ngày: sku có hiệu lực → bí danh có hiệu lực → mã gần nhất; rồi đi theo chuỗi gộp tại ngày đó ──────────────────
CREATE OR REPLACE FUNCTION bizcity_item_at(p_tenant bigint, p_sku text, p_day date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT bizcity_item_walk((
    SELECT item_id FROM (
      SELECT c.item_id,
             CASE WHEN c.valid_from <= p_day AND (c.valid_to IS NULL OR p_day < c.valid_to)
                  THEN CASE c.kind WHEN 'sku' THEN 0 ELSE 1 END
                  ELSE CASE c.kind WHEN 'sku' THEN 2 ELSE 3 END END AS rank,
             c.valid_from
        FROM item_codes c
       WHERE c.tenant_id = p_tenant AND c.kind IN ('sku', 'alias') AND c.code = p_sku
    ) x ORDER BY rank, valid_from DESC LIMIT 1
  ), p_day)
$$;
COMMENT ON FUNCTION bizcity_item_at(bigint, text, date) IS 'item_id của mã tại ngày: sku có hiệu lực, rồi bí danh có hiệu lực, rồi mã gần nhất; sau đó đi theo chuỗi gộp tại ngày đó (0068).';

-- Mã này đang thuộc mặt hàng nào mà KHÔNG được dùng cho hàng mới: bí danh còn mở, hoặc sku đã đóng của mặt hàng còn sống.
CREATE OR REPLACE FUNCTION bizcity_item_code_taken(p_tenant bigint, p_code text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT bizcity_item_root(c.item_id)
    FROM item_codes c
    JOIN items i ON i.item_id = c.item_id
   WHERE c.tenant_id = p_tenant AND c.code = p_code
     AND ((c.kind = 'alias' AND c.valid_to IS NULL)
       OR (c.kind = 'sku' AND c.valid_to IS NOT NULL AND i.status <> 'retired'))
     AND NOT EXISTS (SELECT 1 FROM item_codes o WHERE o.tenant_id = p_tenant AND o.kind = 'sku' AND o.code = p_code AND o.valid_to IS NULL)
   ORDER BY c.valid_from DESC LIMIT 1
$$;
COMMENT ON FUNCTION bizcity_item_code_taken(bigint, text) IS 'Mặt hàng hiện giữ mã cũ / bí danh này; NULL = mã mới, hoặc đang là sku mở, hoặc của hàng đã xoá (0068, Q5).';

-- ── item_id trên bảng còn khoá theo mã ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE supplier_products      ADD COLUMN item_id text;
ALTER TABLE supplier_item_aliases  ADD COLUMN item_id text;
ALTER TABLE supplier_invoice_lines ADD COLUMN item_id text;
ALTER TABLE stock_levels           ADD COLUMN item_id text;
ALTER TABLE stock_sku_settings     ADD COLUMN item_id text;
ALTER TABLE tax_invoice_lines      ADD COLUMN item_id text;
COMMENT ON COLUMN supplier_products.item_id IS 'Định danh mặt hàng (0068); sku = mã hiện hành, tự theo khi đổi mã.';
COMMENT ON COLUMN supplier_item_aliases.item_id IS 'Định danh mặt hàng (0068); sku = mã hiện hành, tự theo khi đổi mã.';
COMMENT ON COLUMN supplier_invoice_lines.item_id IS 'Định danh mặt hàng (0068); sku = ảnh chụp mã trên dòng hoá đơn.';
COMMENT ON COLUMN stock_levels.item_id IS 'Định danh mặt hàng (0068); sku = mã hiện hành, tự theo khi đổi mã.';
COMMENT ON COLUMN stock_sku_settings.item_id IS 'Định danh mặt hàng (0068); sku = mã hiện hành, tự theo khi đổi mã.';
COMMENT ON COLUMN tax_invoice_lines.item_id IS 'Định danh mặt hàng (0068); sku = ảnh chụp mã trên dòng hoá đơn thuế.';

UPDATE supplier_products      SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE sku <> '';
UPDATE supplier_item_aliases  SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE sku <> '';
UPDATE supplier_invoice_lines SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE sku IS NOT NULL AND sku <> '';
UPDATE stock_levels           SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE sku <> '';
UPDATE stock_sku_settings     SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE sku <> '';

ALTER TABLE supplier_products      ADD CONSTRAINT supplier_products_item_fk      FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);
ALTER TABLE supplier_item_aliases  ADD CONSTRAINT supplier_item_aliases_item_fk  FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);
ALTER TABLE supplier_invoice_lines ADD CONSTRAINT supplier_invoice_lines_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);
ALTER TABLE stock_levels           ADD CONSTRAINT stock_levels_item_fk           FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);
ALTER TABLE stock_sku_settings     ADD CONSTRAINT stock_sku_settings_item_fk     FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);

CREATE INDEX supplier_products_item      ON supplier_products (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX supplier_item_aliases_item  ON supplier_item_aliases (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX supplier_invoice_lines_item ON supplier_invoice_lines (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX stock_levels_item           ON stock_levels (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX stock_sku_settings_item     ON stock_sku_settings (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX tax_invoice_lines_item      ON tax_invoice_lines (item_id) WHERE item_id IS NOT NULL;

-- Thêm dòng, hoặc đổi sku của dòng: item_id theo mã.
CREATE OR REPLACE FUNCTION bizcity_config_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;
  IF NEW.sku IS NULL OR NEW.sku = '' THEN
    NEW.item_id := NULL;
  ELSE
    NEW.item_id := bizcity_item_at(NEW.tenant_id, NEW.sku, CURRENT_DATE);
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_config_item_id() IS 'Gắn item_id cho bảng còn dùng sku khi thêm dòng hoặc đổi sku (0068).';
CREATE TRIGGER supplier_products_item_id      BEFORE INSERT OR UPDATE OF sku ON supplier_products      FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();
CREATE TRIGGER supplier_item_aliases_item_id  BEFORE INSERT OR UPDATE OF sku ON supplier_item_aliases  FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();
CREATE TRIGGER supplier_invoice_lines_item_id BEFORE INSERT OR UPDATE OF sku ON supplier_invoice_lines FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();
CREATE TRIGGER stock_levels_item_id           BEFORE INSERT OR UPDATE OF sku ON stock_levels           FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();
CREATE TRIGGER stock_sku_settings_item_id     BEFORE INSERT OR UPDATE OF sku ON stock_sku_settings     FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();

-- Dòng hoá đơn thuế không có tenant_id: lấy đơn vị từ phiếu đầu.
CREATE OR REPLACE FUNCTION bizcity_tax_line_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant bigint;
BEGIN
  IF NEW.item_id IS NULL AND NEW.sku <> '' THEN
    SELECT tenant_id INTO v_tenant FROM tax_invoices WHERE id = NEW.tax_invoice_id;
    NEW.item_id := bizcity_item_at(v_tenant, NEW.sku, CURRENT_DATE);
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_tax_line_item_id() IS 'Gắn item_id cho dòng hoá đơn thuế theo mã (0068).';
CREATE TRIGGER tax_invoice_lines_item_id BEFORE INSERT ON tax_invoice_lines FOR EACH ROW EXECUTE FUNCTION bizcity_tax_line_item_id();
UPDATE tax_invoice_lines l SET item_id = bizcity_item_at(t.tenant_id, l.sku, CURRENT_DATE)
  FROM tax_invoices t WHERE t.id = l.tax_invoice_id AND l.sku <> '';

-- Mặt hàng tạo sau chứng từ: điền cả các bảng mới.
CREATE OR REPLACE FUNCTION bizcity_item_fill_refs(p_tenant bigint, p_sku text, p_item text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ledger_lines           SET item_id = p_item WHERE tenant_id = p_tenant AND product_sku = p_sku AND item_id IS NULL;
  UPDATE inventory_movements    SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE inventory_costs        SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE product_units          SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE product_prices         SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE supplier_products      SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE supplier_item_aliases  SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE supplier_invoice_lines SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE stock_levels           SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE stock_sku_settings     SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
END $$;

-- ── Đổi mã: bảng cấu hình theo mã hiện hành ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_item_rename_refs(p_tenant bigint, p_old text, p_new text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE product_units         SET sku = p_new WHERE tenant_id = p_tenant AND sku = p_old;
  UPDATE product_prices        SET sku = p_new, updated_at = now() WHERE tenant_id = p_tenant AND sku = p_old;
  UPDATE supplier_products     SET sku = p_new WHERE tenant_id = p_tenant AND sku = p_old;
  UPDATE supplier_item_aliases SET sku = p_new WHERE tenant_id = p_tenant AND sku = p_old;
  UPDATE stock_levels          SET sku = p_new WHERE tenant_id = p_tenant AND sku = p_old;
  UPDATE stock_sku_settings    SET sku = p_new WHERE tenant_id = p_tenant AND sku = p_old;
  UPDATE products              SET parent_sku = p_new WHERE tenant_id = p_tenant AND parent_sku = p_old AND sku <> p_new;
  -- Chính sách mua: mã nằm trong JSON (scope, rule). Chỉ thay đúng giá trị chuỗi trùng khớp cả mã.
  UPDATE purchase_policies
     SET scope = replace(scope::text, to_jsonb(p_old)::text, to_jsonb(p_new)::text)::jsonb,
         rule  = replace(rule::text,  to_jsonb(p_old)::text, to_jsonb(p_new)::text)::jsonb
   WHERE tenant_id = p_tenant AND (scope::text LIKE '%' || to_jsonb(p_old)::text || '%' OR rule::text LIKE '%' || to_jsonb(p_old)::text || '%');
END $$;
COMMENT ON FUNCTION bizcity_item_rename_refs(bigint, text, text) IS 'Bảng cấu hình mô tả hiện tại: đổi mã thì đổi theo. Bảng lịch sử giữ ảnh chụp (0068).';

-- Đường tạo mặt hàng: từ chối mã của hàng còn sống / đã gộp (Q5). Người thao tác và ghi chú lấy từ phiên (bizcity.actor, bizcity.note).
CREATE OR REPLACE FUNCTION bizcity_items_actor() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('bizcity.actor', true), ''), 'system:products-sync')
$$;
COMMENT ON FUNCTION bizcity_items_actor() IS 'Người thao tác do action đặt trong giao dịch; không có thì là hệ thống (0068).';

CREATE OR REPLACE FUNCTION bizcity_items_from_product(p products) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_taken text;
  v_status text := CASE WHEN p.is_draft THEN 'draft' WHEN NOT p.is_active THEN 'retired' ELSE 'active' END;
  v_attrs jsonb := jsonb_strip_nulls(jsonb_build_object('brand', p.brand_code, 'industry', p.industry_code, 'group', p.group_code, 'type', p.type_code, 'parentSku', p.parent_sku));
BEGIN
  -- Mã đang mở mà không có dòng products (mặt hàng mồ côi: mã có trong sổ / kho, 0066) → NHẬN LẠI mặt hàng đó, không tạo mới.
  SELECT c.item_id INTO v_id FROM item_codes c WHERE c.tenant_id = p.tenant_id AND c.kind = 'sku' AND c.code = p.sku AND c.valid_to IS NULL;
  IF v_id IS NOT NULL THEN
    UPDATE items SET name = p.name, unit_base = p.unit, status = v_status, draft_codes = p.draft_codes,
           attributes = (attributes - 'orphan' - 'brand' - 'industry' - 'group' - 'type' - 'parentSku') || v_attrs,
           source_system = p.source_system, retired_at = CASE WHEN p.is_active THEN NULL ELSE COALESCE(retired_at, now()) END
     WHERE item_id = v_id;
  ELSE
    v_taken := bizcity_item_code_taken(p.tenant_id, p.sku);
    IF v_taken IS NOT NULL THEN
      RAISE EXCEPTION 'Mã % đã đổi hoặc đã gộp sang mặt hàng khác (%), không dùng lại cho hàng mới.', p.sku, v_taken USING ERRCODE = 'unique_violation';
    END IF;
    v_id := bizcity_ulid(COALESCE(p.created_at, now()));
    INSERT INTO items (item_id, tenant_id, name, unit_base, status, draft_codes, attributes, source_system, created_at, created_by, retired_at)
    VALUES (v_id, p.tenant_id, p.name, p.unit, v_status, p.draft_codes, v_attrs, p.source_system, COALESCE(p.created_at, now()), 'system:products-sync',
            CASE WHEN NOT p.is_active THEN now() END);
    -- Mã từng dùng cho mặt hàng đã xoá: mã mới bắt đầu từ ngày mã cũ đóng (không chồng hiệu lực, R-ITEM-0).
    INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by)
    VALUES (p.tenant_id, v_id, 'sku', p.sku,
            COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = p.tenant_id AND kind = 'sku' AND code = p.sku), DATE '1970-01-01'), 'system:products-sync');
  END IF;
  IF p.barcode <> '' AND NOT EXISTS (SELECT 1 FROM item_codes WHERE item_id = v_id AND kind = 'barcode' AND code = p.barcode AND valid_to IS NULL) THEN
    BEGIN
      INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by)
      VALUES (p.tenant_id, v_id, 'barcode', p.barcode,
              COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = p.tenant_id AND kind = 'barcode' AND code = p.barcode), DATE '1970-01-01'), 'system:products-sync');
    EXCEPTION WHEN exclusion_violation THEN
      -- Dữ liệu cũ hay có hai mặt hàng cùng mã vạch: không làm hỏng việc ghi mặt hàng, ghi nhận để kế toán xử lý (DG-ITEM-1).
      UPDATE items SET attributes = attributes || jsonb_build_object('barcodeConflict', p.barcode) WHERE item_id = v_id;
    END;
  END IF;
  PERFORM bizcity_item_classify(p.tenant_id, v_id, p);
  PERFORM bizcity_item_fill_refs(p.tenant_id, p.sku, v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION bizcity_items_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_day date := CURRENT_DATE;
  v_old_from date;
  v_from date;
  v_note text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM bizcity_items_from_product(NEW);
    RETURN NEW;
  END IF;

  SELECT c.item_id, c.valid_from INTO v_id, v_old_from FROM item_codes c
   WHERE c.tenant_id = OLD.tenant_id AND c.kind = 'sku' AND c.code = OLD.sku AND c.valid_to IS NULL;

  IF TG_OP = 'DELETE' THEN
    IF v_id IS NOT NULL THEN
      UPDATE items SET status = 'retired', retired_at = COALESCE(retired_at, now()) WHERE item_id = v_id;
      UPDATE item_codes SET valid_to = GREATEST(v_day, valid_from + 1) WHERE item_id = v_id AND valid_to IS NULL;
    END IF;
    RETURN OLD;
  END IF;

  IF v_id IS NULL THEN            -- mặt hàng chưa có định danh (dòng có trước migration, điền sót): tạo mới
    PERFORM bizcity_items_from_product(NEW);
    RETURN NEW;
  END IF;

  IF NEW.sku IS DISTINCT FROM OLD.sku THEN        -- đổi mã = đóng mã cũ + thêm mã mới, item_id giữ nguyên (R-ITEM-0)
    IF bizcity_item_code_taken(NEW.tenant_id, NEW.sku) IS NOT NULL THEN
      RAISE EXCEPTION 'Mã % đã thuộc về mặt hàng khác, không dùng lại được.', NEW.sku USING ERRCODE = 'unique_violation';
    END IF;
    v_from := GREATEST(v_day, v_old_from + 1);
    -- mã mới từng dùng cho mặt hàng đã xoá: bắt đầu sau ngày mã đó đóng
    v_from := GREATEST(v_from, COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = NEW.tenant_id AND kind = 'sku' AND code = NEW.sku), v_from));
    UPDATE item_codes SET valid_to = v_from WHERE item_id = v_id AND kind = 'sku' AND valid_to IS NULL;
    v_note := 'đổi mã từ ' || OLD.sku;
    IF COALESCE(current_setting('bizcity.note', true), '') <> '' THEN
      v_note := v_note || ': ' || current_setting('bizcity.note', true);
    END IF;
    INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by, note)
    VALUES (NEW.tenant_id, v_id, 'sku', NEW.sku, v_from, bizcity_items_actor(), v_note);
    PERFORM bizcity_item_fill_refs(NEW.tenant_id, NEW.sku, v_id);
    PERFORM bizcity_item_rename_refs(NEW.tenant_id, OLD.sku, NEW.sku);
  END IF;

  IF NEW.barcode IS DISTINCT FROM OLD.barcode THEN
    UPDATE item_codes SET valid_to = GREATEST(v_day, valid_from + 1) WHERE item_id = v_id AND kind = 'barcode' AND valid_to IS NULL;
    IF NEW.barcode <> '' THEN
      BEGIN
        INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by)
        VALUES (NEW.tenant_id, v_id, 'barcode', NEW.barcode, GREATEST(v_day, COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = NEW.tenant_id AND kind = 'barcode' AND code = NEW.barcode), v_day)), bizcity_items_actor());
      EXCEPTION WHEN exclusion_violation THEN
        UPDATE items SET attributes = attributes || jsonb_build_object('barcodeConflict', NEW.barcode) WHERE item_id = v_id;
      END;
    END IF;
  END IF;

  IF (NEW.name, NEW.unit, NEW.is_active, NEW.is_draft, NEW.draft_codes, NEW.brand_code, NEW.industry_code, NEW.group_code, NEW.type_code, NEW.parent_sku, NEW.source_system)
     IS DISTINCT FROM (OLD.name, OLD.unit, OLD.is_active, OLD.is_draft, OLD.draft_codes, OLD.brand_code, OLD.industry_code, OLD.group_code, OLD.type_code, OLD.parent_sku, OLD.source_system) THEN
    UPDATE items SET name = NEW.name, unit_base = NEW.unit,
           status = CASE WHEN NEW.is_draft THEN 'draft' WHEN NOT NEW.is_active THEN 'retired' ELSE 'active' END,
           draft_codes = NEW.draft_codes,
           attributes = (attributes - 'brand' - 'industry' - 'group' - 'type' - 'parentSku')
                        || jsonb_strip_nulls(jsonb_build_object('brand', NEW.brand_code, 'industry', NEW.industry_code, 'group', NEW.group_code, 'type', NEW.type_code, 'parentSku', NEW.parent_sku)),
           source_system = NEW.source_system,
           retired_at = CASE WHEN NEW.is_active THEN NULL ELSE COALESCE(retired_at, now()) END
     WHERE item_id = v_id;
  END IF;

  IF (NEW.posting_group_code, NEW.tax_out_code, NEW.tax_in_code, NEW.excise_rate, NEW.track_identifier)
     IS DISTINCT FROM (OLD.posting_group_code, OLD.tax_out_code, OLD.tax_in_code, OLD.excise_rate, OLD.track_identifier) THEN
    PERFORM bizcity_item_classify(NEW.tenant_id, v_id, NEW);   -- trong ngày: sửa bản đang mở; khác ngày: bản mới từ hôm nay
  END IF;
  RETURN NEW;
END $$;

-- ── Gộp mã ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Kiểm trước khi gộp: chỉ đọc. Trả { blocks: [mã lỗi…], stock: [{branchId, warehouseCode, qty}], ledgerLines, movements, children, configConflicts }.
CREATE OR REPLACE FUNCTION bizcity_item_merge_check(p_tenant bigint, p_from text, p_to text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  f items%ROWTYPE;
  t items%ROWTYPE;
  blocks text[] := '{}';
  v_stock jsonb;
BEGIN
  SELECT * INTO f FROM items WHERE tenant_id = p_tenant AND item_id = p_from;
  SELECT * INTO t FROM items WHERE tenant_id = p_tenant AND item_id = p_to;
  IF f.item_id IS NULL THEN blocks := blocks || 'FROM_NOT_FOUND'::text; END IF;
  IF t.item_id IS NULL THEN blocks := blocks || 'TO_NOT_FOUND'::text; END IF;
  IF p_from = p_to THEN blocks := blocks || 'SAME_ITEM'::text; END IF;
  IF f.merged_into_item_id IS NOT NULL THEN blocks := blocks || 'FROM_ALREADY_MERGED'::text; END IF;
  IF t.merged_into_item_id IS NOT NULL THEN blocks := blocks || 'TO_ALREADY_MERGED'::text; END IF;
  IF t.status = 'retired' THEN blocks := blocks || 'TO_RETIRED'::text; END IF;
  IF f.unit_base <> '' AND t.unit_base <> '' AND lower(f.unit_base) <> lower(t.unit_base) THEN blocks := blocks || 'UNIT_MISMATCH'::text; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('branchId', s.branch_id::text, 'warehouseCode', s.warehouse_code, 'qty', s.q)), '[]'::jsonb) INTO v_stock
    FROM (SELECT branch_id, warehouse_code, sum(qty) AS q FROM inventory_movements
           WHERE tenant_id = p_tenant AND item_id = p_from GROUP BY 1, 2 HAVING sum(qty) <> 0) s;
  IF jsonb_array_length(v_stock) > 0 THEN blocks := blocks || 'FROM_HAS_STOCK'::text; END IF;
  RETURN jsonb_build_object(
    'blocks', to_jsonb(blocks),
    'stock', v_stock,
    'ledgerLines', (SELECT count(*) FROM ledger_lines WHERE tenant_id = p_tenant AND item_id = p_from),
    'movements', (SELECT count(*) FROM inventory_movements WHERE tenant_id = p_tenant AND item_id = p_from),
    'children', (SELECT count(*) FROM items WHERE tenant_id = p_tenant AND parent_item_id = p_from),
    'unitConflicts', (SELECT count(*) FROM product_units a JOIN product_units b ON b.tenant_id = a.tenant_id AND b.item_id = p_to AND lower(b.unit) = lower(a.unit)
                       WHERE a.tenant_id = p_tenant AND a.item_id = p_from AND a.ratio <> b.ratio));
END $$;
COMMENT ON FUNCTION bizcity_item_merge_check(bigint, text, text) IS 'Xem trước gộp mã, chỉ đọc: lỗi chặn, tồn, số dòng lịch sử (không dòng nào bị sửa), số con, xung đột quy đổi (0068).';

-- Gộp p_from vào p_to. Sổ cũ không đụng. Trả { fromSku, toSku, droppedConfig }.
CREATE OR REPLACE FUNCTION bizcity_item_merge(p_tenant bigint, p_from text, p_to text, p_actor text, p_note text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_day date := CURRENT_DATE;
  v_check jsonb;
  v_from_sku text;
  v_to_sku text;
  r item_codes%ROWTYPE;
  d date;
  n int;
  v_dropped int := 0;
BEGIN
  PERFORM 1 FROM items WHERE tenant_id = p_tenant AND item_id IN (p_from, p_to) ORDER BY item_id FOR UPDATE;
  v_check := bizcity_item_merge_check(p_tenant, p_from, p_to);
  IF jsonb_array_length(v_check -> 'blocks') > 0 THEN
    RAISE EXCEPTION 'Không gộp được mặt hàng: %', v_check -> 'blocks' USING ERRCODE = 'check_violation';
  END IF;
  SELECT code INTO v_from_sku FROM item_codes WHERE item_id = p_from AND kind = 'sku' AND valid_to IS NULL;
  SELECT code INTO v_to_sku FROM item_codes WHERE item_id = p_to AND kind = 'sku' AND valid_to IS NULL;
  IF v_to_sku IS NULL THEN
    RAISE EXCEPTION 'Mặt hàng đích % không có mã đang dùng.', p_to USING ERRCODE = 'check_violation';
  END IF;

  -- Mã đang mở của nguồn: đóng; sku và bí danh thành bí danh của đích; mã vạch, mã ngoài chuyển sang đích giữ nguyên loại.
  FOR r IN SELECT * FROM item_codes WHERE item_id = p_from AND valid_to IS NULL ORDER BY id LOOP
    d := GREATEST(v_day, r.valid_from + 1);
    UPDATE item_codes SET valid_to = d WHERE id = r.id;
    IF r.kind IN ('sku', 'alias') THEN
      INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by, note)
      VALUES (p_tenant, p_to, 'alias', r.code, d, p_actor, 'gộp từ ' || p_from || ': ' || p_note);
    ELSIF NOT EXISTS (SELECT 1 FROM item_codes o WHERE o.item_id = p_to AND o.kind = r.kind AND o.code = r.code AND o.valid_to IS NULL) THEN
      INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by, note)
      VALUES (p_tenant, p_to, r.kind, r.code, d, p_actor, 'gộp từ ' || p_from || ': ' || p_note);
    END IF;
  END LOOP;

  -- Cha – con: đích đang là con của nguồn thì bỏ quan hệ; con của nguồn chuyển sang đích.
  UPDATE products SET parent_sku = NULL WHERE tenant_id = p_tenant AND sku = v_to_sku AND parent_sku = v_from_sku;
  UPDATE items SET parent_item_id = NULL WHERE item_id = p_to AND parent_item_id = p_from;
  IF v_from_sku IS NOT NULL THEN
    UPDATE products SET parent_sku = v_to_sku WHERE tenant_id = p_tenant AND parent_sku = v_from_sku AND sku <> v_to_sku;
  END IF;
  UPDATE items SET parent_item_id = p_to WHERE tenant_id = p_tenant AND parent_item_id = p_from AND item_id <> p_to;

  -- Cấu hình: chuyển sang đích; trùng khoá thì giữ của đích, bỏ của nguồn.
  IF v_from_sku IS NOT NULL THEN
    DELETE FROM product_units a WHERE a.tenant_id = p_tenant AND a.sku = v_from_sku
       AND EXISTS (SELECT 1 FROM product_units b WHERE b.tenant_id = p_tenant AND b.sku = v_to_sku AND b.unit = a.unit);
    GET DIAGNOSTICS n = ROW_COUNT; v_dropped := v_dropped + n;
    UPDATE product_units SET sku = v_to_sku, item_id = p_to, is_default = false WHERE tenant_id = p_tenant AND sku = v_from_sku;

    DELETE FROM product_prices a WHERE a.tenant_id = p_tenant AND a.sku = v_from_sku
       AND EXISTS (SELECT 1 FROM product_prices b WHERE b.tenant_id = p_tenant AND b.sku = v_to_sku AND b.price_list_code = a.price_list_code AND b.unit = a.unit);
    GET DIAGNOSTICS n = ROW_COUNT; v_dropped := v_dropped + n;
    UPDATE product_prices SET sku = v_to_sku, item_id = p_to, updated_at = now() WHERE tenant_id = p_tenant AND sku = v_from_sku;

    DELETE FROM supplier_products a WHERE a.tenant_id = p_tenant AND a.sku = v_from_sku
       AND EXISTS (SELECT 1 FROM supplier_products b WHERE b.tenant_id = p_tenant AND b.sku = v_to_sku
                    AND COALESCE(b.partner_code, '') = COALESCE(a.partner_code, '') AND b.unit = a.unit AND COALESCE(b.valid_from, DATE '1900-01-01') = COALESCE(a.valid_from, DATE '1900-01-01'));
    GET DIAGNOSTICS n = ROW_COUNT; v_dropped := v_dropped + n;
    UPDATE supplier_products SET sku = v_to_sku WHERE tenant_id = p_tenant AND sku = v_from_sku;

    UPDATE supplier_item_aliases SET sku = v_to_sku WHERE tenant_id = p_tenant AND sku = v_from_sku;

    DELETE FROM stock_levels a WHERE a.tenant_id = p_tenant AND a.sku = v_from_sku
       AND EXISTS (SELECT 1 FROM stock_levels b WHERE b.tenant_id = p_tenant AND b.sku = v_to_sku AND b.branch_code = a.branch_code AND b.warehouse_code = a.warehouse_code);
    GET DIAGNOSTICS n = ROW_COUNT; v_dropped := v_dropped + n;
    UPDATE stock_levels SET sku = v_to_sku WHERE tenant_id = p_tenant AND sku = v_from_sku;

    DELETE FROM stock_sku_settings a WHERE a.tenant_id = p_tenant AND a.sku = v_from_sku
       AND EXISTS (SELECT 1 FROM stock_sku_settings b WHERE b.tenant_id = p_tenant AND b.sku = v_to_sku);
    GET DIAGNOSTICS n = ROW_COUNT; v_dropped := v_dropped + n;
    UPDATE stock_sku_settings SET sku = v_to_sku WHERE tenant_id = p_tenant AND sku = v_from_sku;

    UPDATE purchase_policies
       SET scope = replace(scope::text, to_jsonb(v_from_sku)::text, to_jsonb(v_to_sku)::text)::jsonb,
           rule  = replace(rule::text,  to_jsonb(v_from_sku)::text, to_jsonb(v_to_sku)::text)::jsonb
     WHERE tenant_id = p_tenant AND (scope::text LIKE '%' || to_jsonb(v_from_sku)::text || '%' OR rule::text LIKE '%' || to_jsonb(v_from_sku)::text || '%');

    -- Mã đã đóng nên trigger xoá dòng products không đụng định danh.
    DELETE FROM products WHERE tenant_id = p_tenant AND sku = v_from_sku;
  END IF;

  UPDATE items SET status = 'retired', retired_at = COALESCE(retired_at, now()), merged_into_item_id = p_to, merged_at = v_day WHERE item_id = p_from;
  UPDATE products SET updated_at = now() WHERE tenant_id = p_tenant AND sku = v_to_sku;
  RETURN jsonb_build_object('fromSku', v_from_sku, 'toSku', v_to_sku, 'droppedConfig', v_dropped, 'mergedAt', v_day);
END $$;
COMMENT ON FUNCTION bizcity_item_merge(bigint, text, text, text, text) IS 'Gộp mặt hàng: đóng mã nguồn, mở bí danh ở đích, chuyển con và cấu hình, đánh dấu chuỗi gộp. Không đụng sổ, không sinh bút toán (0068).';

-- ── Nguồn đổi danh mục cho hệ ngoài: dòng xoá vì đổi mã / gộp mã trỏ tới mặt hàng thay thế ─────────────────────────────────
ALTER TABLE catalog_tombstones ADD COLUMN replaced_by_item_id text;
COMMENT ON COLUMN catalog_tombstones.replaced_by_item_id IS 'Mã bị bỏ vì đổi mã / gộp mã: định danh mặt hàng thay thế, để hệ ngoài chuyển bản ghi (0068).';
