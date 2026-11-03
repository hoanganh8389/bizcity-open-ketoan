-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b (S024-9, R-ITEM-0 / 1, R-CONT-0 / 1): item_id trên dòng sổ, dòng kho, giá vốn tháng, đơn vị quy đổi, bảng giá — liên kết kế toán theo định danh, mã chỉ là ảnh chụp
-- =============================================================================
-- 0066 item_id vào bảng sổ / kho (bước B2b, phần 1).
--   ledger_lines.item_id · inventory_movements.item_id · inventory_costs.item_id · product_units.item_id · product_prices.item_id
--   - cột mã (product_sku / sku) GIỮ LẠI = ảnh chụp mã tại ngày hạch toán; liên kết kế toán đi theo item_id (R-ITEM-1).
--   - điền ngược theo mã CÓ HIỆU LỰC TẠI NGÀY của từng dòng (ngày hạch toán / ngày chứng từ / tháng); không có mã hiệu lực đúng ngày
--     thì lấy mã gần nhất. Mã có trong sổ / kho mà KHÔNG có trong danh mục mặt hàng → tạo "mặt hàng mồ côi" (status retired,
--     attributes.orphan) để chuỗi không đứt (R-CONT-0); khi danh mục thêm lại mã đó, mặt hàng mồ côi được nhận lại (0065).
--     Sau điền, còn dòng có mã mà không có item_id → DỪNG migration (lỗi logic, không đoán).
--   - giữ khớp về sau: dòng mới tự gắn item_id theo mã tại ngày (trigger BEFORE INSERT); mặt hàng tạo SAU chứng từ (ensureProducts
--     chạy sau khi ghi sổ) thì bizcity_item_fill_refs điền item_id cho các dòng của mã đó.
--   - dòng sổ cái vẫn CHỈ THÊM: ngoại lệ duy nhất mới là điền item_id từ rỗng → có giá trị, một lần, không đổi gì khác; đã có thì
--     không đổi (guard_ledger_line_mutation).
--   PHẦN CHƯA LÀM (phần 2): products thành khung nhìn — chặn bởi việc các đường ghi products dùng INSERT … ON CONFLICT (khung nhìn
--   ghép không nhận ON CONFLICT); cần chuyển mọi đường ghi sang items trước (S024-11). Xem PHASE-024 · 70 §3.2.
-- =============================================================================

ALTER TABLE ledger_lines        ADD COLUMN item_id text;
ALTER TABLE inventory_movements ADD COLUMN item_id text;
ALTER TABLE inventory_costs     ADD COLUMN item_id text;
ALTER TABLE product_units       ADD COLUMN item_id text;
ALTER TABLE product_prices      ADD COLUMN item_id text;

-- ── Mã → item_id tại một ngày ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_item_at(p_tenant bigint, p_sku text, p_day date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT item_id FROM (
    SELECT c.item_id, 0 AS rank, c.valid_from FROM item_codes c
     WHERE c.tenant_id = p_tenant AND c.kind = 'sku' AND c.code = p_sku AND c.valid_from <= p_day AND (c.valid_to IS NULL OR p_day < c.valid_to)
    UNION ALL
    SELECT c.item_id, 1 AS rank, c.valid_from FROM item_codes c
     WHERE c.tenant_id = p_tenant AND c.kind = 'sku' AND c.code = p_sku
  ) x ORDER BY rank, valid_from DESC LIMIT 1
$$;
COMMENT ON FUNCTION bizcity_item_at(bigint, text, date) IS 'item_id của mã hàng (sku) có hiệu lực tại ngày; không có mã hiệu lực đúng ngày thì lấy mã gần nhất; không có mã → NULL.';

-- ── Mặt hàng mồ côi: mã có trong sổ / kho / đơn vị / giá nhưng không có trong danh mục ─────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_adopt_orphans(p_tenant bigint DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_id text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT s.tenant_id, s.sku FROM (
      SELECT tenant_id, product_sku AS sku FROM ledger_lines WHERE product_sku IS NOT NULL AND product_sku <> ''
      UNION SELECT tenant_id, sku FROM inventory_movements WHERE sku <> ''
      UNION SELECT tenant_id, sku FROM inventory_costs WHERE sku <> ''
      UNION SELECT tenant_id, sku FROM product_units WHERE sku <> ''
      UNION SELECT tenant_id, sku FROM product_prices WHERE sku <> ''
    ) s
    WHERE (p_tenant IS NULL OR s.tenant_id = p_tenant)
      AND NOT EXISTS (SELECT 1 FROM item_codes c WHERE c.tenant_id = s.tenant_id AND c.kind = 'sku' AND c.code = s.sku)
  LOOP
    v_id := bizcity_ulid();
    INSERT INTO items (item_id, tenant_id, name, status, attributes, created_by, retired_at)
    VALUES (v_id, r.tenant_id,
            COALESCE((SELECT m.name FROM inventory_movements m WHERE m.tenant_id = r.tenant_id AND m.sku = r.sku AND m.name <> '' LIMIT 1), r.sku),
            'retired', jsonb_build_object('orphan', true), 'system:migration-0066', now());
    INSERT INTO item_codes (tenant_id, item_id, kind, code, created_by, note)
    VALUES (r.tenant_id, v_id, 'sku', r.sku, 'system:migration-0066', 'mã có trong sổ / kho nhưng không có trong danh mục mặt hàng (mặt hàng mồ côi)');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
COMMENT ON FUNCTION bizcity_items_adopt_orphans(bigint) IS 'Tạo mặt hàng mồ côi (retired, attributes.orphan) cho mã có trong sổ / kho / đơn vị / giá mà chưa có trong danh mục — để mọi dòng có item_id (R-CONT-0).';

-- ── Điền item_id cho dòng của một mã chưa có item_id (mặt hàng tạo sau chứng từ) — thay thân hàm rỗng của 0065 ──────────────
CREATE OR REPLACE FUNCTION bizcity_item_fill_refs(p_tenant bigint, p_sku text, p_item text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ledger_lines        SET item_id = p_item WHERE tenant_id = p_tenant AND product_sku = p_sku AND item_id IS NULL;
  UPDATE inventory_movements SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE inventory_costs     SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE product_units       SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
  UPDATE product_prices      SET item_id = p_item WHERE tenant_id = p_tenant AND sku = p_sku AND item_id IS NULL;
END $$;

-- ── Dòng sổ cái: chỉ thêm; ngoại lệ mới duy nhất = điền item_id từ rỗng, một lần ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_ledger_line_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 0066 (B2b): gắn định danh mặt hàng cho dòng đã ghi — chỉ từ NULL → có giá trị, mọi cột khác giữ nguyên.
  IF TG_OP = 'UPDATE' AND OLD.item_id IS NULL AND NEW.item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND current_setting('ketoan.cost_overwrite', true) = 'on'
     AND OLD.cost_fill IS NOT NULL AND NEW.cost_fill IS NOT DISTINCT FROM OLD.cost_fill
     AND NEW.entry_id = OLD.entry_id AND NEW.tenant_id = OLD.tenant_id AND NEW.branch_id = OLD.branch_id
     AND NEW.posting_date = OLD.posting_date AND NEW.line_no = OLD.line_no AND NEW.pair_no = OLD.pair_no
     AND NEW.account_code = OLD.account_code AND NEW.part = OLD.part
     AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.product_sku IS NOT DISTINCT FROM OLD.product_sku
     AND NEW.item_id IS NOT DISTINCT FROM OLD.item_id
     AND NEW.debit >= 0 AND NEW.credit >= 0
     AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e.id = OLD.entry_id AND e.status = 'posted' AND NOT e.is_reversal)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- ── Điền ngược ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT bizcity_items_backfill();          -- mặt hàng thêm vào danh mục từ sau 0065 (an toàn khi chạy lại)
SELECT bizcity_items_adopt_orphans();

-- Kiểm cân Nợ / Có khi SỬA dòng sổ là ràng buộc hoãn (0006): mỗi dòng điền ngược để lại một sự kiện chờ tới cuối giao dịch — chậm
-- trên sổ lớn và chặn mọi ALTER TABLE ledger_lines phía sau. Điền ngược chỉ đổi item_id (guard ở trên chỉ cho đúng việc đó), số
-- tiền không đổi → tắt riêng kiểm cân khi sửa trong lúc điền, bật lại ngay sau.
ALTER TABLE ledger_lines DISABLE TRIGGER ledger_lines_balanced_update;

-- theo mã có hiệu lực tại ngày của dòng
UPDATE ledger_lines l SET item_id = c.item_id FROM item_codes c
 WHERE l.item_id IS NULL AND l.product_sku IS NOT NULL AND l.product_sku <> ''
   AND c.tenant_id = l.tenant_id AND c.kind = 'sku' AND c.code = l.product_sku
   AND c.valid_from <= l.posting_date AND (c.valid_to IS NULL OR l.posting_date < c.valid_to);
UPDATE inventory_movements m SET item_id = c.item_id FROM item_codes c
 WHERE m.item_id IS NULL AND m.sku <> ''
   AND c.tenant_id = m.tenant_id AND c.kind = 'sku' AND c.code = m.sku
   AND c.valid_from <= m.doc_date AND (c.valid_to IS NULL OR m.doc_date < c.valid_to);
UPDATE inventory_costs k SET item_id = c.item_id FROM item_codes c
 WHERE k.item_id IS NULL AND k.sku <> ''
   AND c.tenant_id = k.tenant_id AND c.kind = 'sku' AND c.code = k.sku
   AND c.valid_from <= make_date(k.year, k.month, 1) AND (c.valid_to IS NULL OR make_date(k.year, k.month, 1) < c.valid_to);
-- còn lại (mã không hiệu lực đúng ngày, bảng không có ngày): mã gần nhất
UPDATE ledger_lines        SET item_id = bizcity_item_at(tenant_id, product_sku, posting_date) WHERE item_id IS NULL AND product_sku IS NOT NULL AND product_sku <> '';
UPDATE inventory_movements SET item_id = bizcity_item_at(tenant_id, sku, doc_date) WHERE item_id IS NULL AND sku <> '';
UPDATE inventory_costs     SET item_id = bizcity_item_at(tenant_id, sku, make_date(year, month, 1)) WHERE item_id IS NULL AND sku <> '';
UPDATE product_units       SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE item_id IS NULL AND sku <> '';
UPDATE product_prices      SET item_id = bizcity_item_at(tenant_id, sku, CURRENT_DATE) WHERE item_id IS NULL AND sku <> '';

ALTER TABLE ledger_lines ENABLE TRIGGER ledger_lines_balanced_update;
SET CONSTRAINTS ALL IMMEDIATE;            -- chạy ngay mọi kiểm hoãn còn chờ (nếu có) trước các ALTER TABLE phía sau

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT (SELECT count(*) FROM ledger_lines WHERE item_id IS NULL AND product_sku IS NOT NULL AND product_sku <> '')
       + (SELECT count(*) FROM inventory_movements WHERE item_id IS NULL AND sku <> '')
       + (SELECT count(*) FROM inventory_costs WHERE item_id IS NULL AND sku <> '')
       + (SELECT count(*) FROM product_units WHERE item_id IS NULL AND sku <> '')
       + (SELECT count(*) FROM product_prices WHERE item_id IS NULL AND sku <> '') INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION '0066: còn % dòng có mã hàng mà không gắn được item_id — dừng migration, không đoán (PHASE-024 · 70 §3.2).', n;
  END IF;
END $$;

-- ── Giữ khớp về sau: dòng mới tự gắn item_id theo mã tại ngày ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_set_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'ledger_lines' THEN
    IF NEW.product_sku IS NOT NULL AND NEW.product_sku <> '' THEN NEW.item_id := bizcity_item_at(NEW.tenant_id, NEW.product_sku, NEW.posting_date); END IF;
  ELSIF TG_TABLE_NAME = 'inventory_movements' THEN
    IF NEW.sku <> '' THEN NEW.item_id := bizcity_item_at(NEW.tenant_id, NEW.sku, NEW.doc_date); END IF;
  ELSIF TG_TABLE_NAME = 'inventory_costs' THEN
    IF NEW.sku <> '' THEN NEW.item_id := bizcity_item_at(NEW.tenant_id, NEW.sku, make_date(NEW.year, NEW.month, 1)); END IF;
  ELSE
    IF NEW.sku <> '' THEN NEW.item_id := bizcity_item_at(NEW.tenant_id, NEW.sku, CURRENT_DATE); END IF;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_set_item_id() IS 'Gắn item_id cho dòng mới theo mã có hiệu lực tại ngày của dòng (0066). Mã chưa có trong danh mục → NULL, điền khi mặt hàng được tạo (bizcity_item_fill_refs).';
CREATE TRIGGER ledger_lines_item_id        BEFORE INSERT ON ledger_lines        FOR EACH ROW EXECUTE FUNCTION bizcity_set_item_id();
CREATE TRIGGER inventory_movements_item_id BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION bizcity_set_item_id();
CREATE TRIGGER inventory_costs_item_id     BEFORE INSERT ON inventory_costs     FOR EACH ROW EXECUTE FUNCTION bizcity_set_item_id();
CREATE TRIGGER product_units_item_id       BEFORE INSERT ON product_units       FOR EACH ROW EXECUTE FUNCTION bizcity_set_item_id();
CREATE TRIGGER product_prices_item_id      BEFORE INSERT ON product_prices      FOR EACH ROW EXECUTE FUNCTION bizcity_set_item_id();

-- ── Khoá ngoại (cùng đơn vị) và chỉ mục ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE ledger_lines        ADD CONSTRAINT ledger_lines_item_fk        FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id) NOT VALID;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id) NOT VALID;
ALTER TABLE inventory_costs     ADD CONSTRAINT inventory_costs_item_fk     FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id) NOT VALID;
ALTER TABLE product_units       ADD CONSTRAINT product_units_item_fk       FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id) NOT VALID;
ALTER TABLE product_prices      ADD CONSTRAINT product_prices_item_fk      FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id) NOT VALID;
ALTER TABLE ledger_lines        VALIDATE CONSTRAINT ledger_lines_item_fk;
ALTER TABLE inventory_movements VALIDATE CONSTRAINT inventory_movements_item_fk;
ALTER TABLE inventory_costs     VALIDATE CONSTRAINT inventory_costs_item_fk;
ALTER TABLE product_units       VALIDATE CONSTRAINT product_units_item_fk;
ALTER TABLE product_prices      VALIDATE CONSTRAINT product_prices_item_fk;

CREATE INDEX ledger_lines_item        ON ledger_lines (tenant_id, item_id, posting_date) WHERE item_id IS NOT NULL;
CREATE INDEX inventory_movements_item ON inventory_movements (tenant_id, item_id, doc_date) WHERE item_id IS NOT NULL;
CREATE INDEX inventory_costs_item     ON inventory_costs (tenant_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX inventory_costs_sku      ON inventory_costs (tenant_id, sku);

COMMENT ON COLUMN ledger_lines.item_id IS 'Định danh mặt hàng (0066, R-ITEM-1): liên kết kế toán theo item_id; product_sku là ảnh chụp mã tại ngày. Đã gắn thì không đổi (sổ chỉ thêm).';
COMMENT ON COLUMN inventory_movements.item_id IS 'Định danh mặt hàng của dòng kho (0066); sku là ảnh chụp mã tại ngày chứng từ.';
COMMENT ON COLUMN inventory_costs.item_id IS 'Định danh mặt hàng của dòng giá vốn tháng (0066).';
COMMENT ON COLUMN product_units.item_id IS 'Định danh mặt hàng của đơn vị quy đổi (0066).';
COMMENT ON COLUMN product_prices.item_id IS 'Định danh mặt hàng của giá bán (0066).';
