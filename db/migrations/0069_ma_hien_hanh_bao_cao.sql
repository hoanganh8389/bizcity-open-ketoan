-- [2026-11-05 01:40 PM Nguyễn Văn Thủy] PHASE-026 — S026-21 (docs/core/06-xuong-ca-dinh-danh.md): đích gộp lưu sẵn trên items, khung nhìn sổ kho theo mã hiện hành để báo cáo gom một dòng qua đổi mã và gộp mã (đóng góp)
-- [2026-11-05 01:35 PM Nguyễn Văn Thủy] PHASE-026 — đổi số 0071 → 0069 theo W-13 trước khi gộp vào main, không đổi nội dung (đóng góp)
-- =============================================================================
-- 0069 Mã hiện hành cho báo cáo.
--   - items.root_item_id: đích cuối của chuỗi gộp, lưu sẵn để nối theo tập (hàng triệu dòng) không phải đi chuỗi từng dòng.
--     Nguồn sự thật vẫn là merged_into_item_id; cột này do trigger giữ khớp.
--   - inventory_movements_cur: sổ kho với sku = mã hiện hành của đích gộp, snapshot_sku = mã lúc ghi. Chỉ đọc.
-- =============================================================================

ALTER TABLE items ADD COLUMN root_item_id text;
UPDATE items SET root_item_id = bizcity_item_root(item_id);
ALTER TABLE items ALTER COLUMN root_item_id SET NOT NULL;
CREATE INDEX items_root ON items (tenant_id, root_item_id);
COMMENT ON COLUMN items.root_item_id IS 'Đích cuối của chuỗi gộp, chưa gộp thì là chính nó. Do trigger giữ khớp theo merged_into_item_id (0069).';

CREATE OR REPLACE FUNCTION bizcity_items_root_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.root_item_id := NEW.item_id;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_items_root_default() IS 'Mặt hàng mới: đích gộp là chính nó (0069).';
CREATE TRIGGER items_root_default BEFORE INSERT ON items FOR EACH ROW EXECUTE FUNCTION bizcity_items_root_default();

CREATE OR REPLACE FUNCTION bizcity_items_root_follow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_root text;
BEGIN
  SELECT root_item_id INTO v_root FROM items WHERE item_id = NEW.merged_into_item_id;
  UPDATE items SET root_item_id = v_root WHERE tenant_id = NEW.tenant_id AND root_item_id = OLD.root_item_id;
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_items_root_follow() IS 'Gộp mặt hàng: nó và mọi mặt hàng đã gộp vào nó chuyển sang đích mới (0069).';
CREATE TRIGGER items_root_follow AFTER UPDATE OF merged_into_item_id ON items FOR EACH ROW
  WHEN (OLD.merged_into_item_id IS NULL AND NEW.merged_into_item_id IS NOT NULL) EXECUTE FUNCTION bizcity_items_root_follow();

-- Đích cuối và mọi mặt hàng đã gộp vào nó: dùng cột lưu sẵn.
CREATE OR REPLACE FUNCTION bizcity_item_family(p_item text) RETURNS SETOF text LANGUAGE sql STABLE AS $$
  SELECT i.item_id FROM items i
    JOIN items r ON r.tenant_id = i.tenant_id AND r.root_item_id = i.root_item_id
   WHERE r.item_id = p_item
$$;

-- Mã hiện hành của mã lúc ghi trên dòng (báo cáo bán hàng: sales_lines không có item_id).
CREATE OR REPLACE FUNCTION bizcity_item_current_sku(p_tenant bigint, p_sku text, p_day date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT c.code FROM items i
      JOIN item_codes c ON c.item_id = i.root_item_id AND c.kind = 'sku' AND c.valid_to IS NULL
     WHERE i.item_id = bizcity_item_at(p_tenant, p_sku, p_day)
     LIMIT 1), p_sku)
$$;
COMMENT ON FUNCTION bizcity_item_current_sku(bigint, text, date) IS 'Mã hiện hành của đích gộp cho một mã tại ngày; không có thì trả lại mã đó (0069).';

-- security_invoker: giữ cô lập đơn vị (RLS) của bảng gốc.
CREATE VIEW inventory_movements_cur WITH (security_invoker = true) AS
  SELECT m.id, m.tenant_id, m.event_id, m.branch_id, m.doc_type, m.doc_date, m.line_no, m.kind,
         COALESCE(c.code, m.sku) AS sku, m.sku AS snapshot_sku, m.name, m.unit, m.warehouse_code, m.qty, m.amount,
         m.counter_branch_id, m.reason_code, m.is_gift, m.priced_at_sale, m.exclude_cost, m.item_id, i.root_item_id
    FROM inventory_movements m
    LEFT JOIN items i ON i.item_id = m.item_id
    LEFT JOIN item_codes c ON c.item_id = i.root_item_id AND c.kind = 'sku' AND c.valid_to IS NULL;
COMMENT ON VIEW inventory_movements_cur IS 'Sổ kho theo mã hiện hành của đích gộp (0069): báo cáo gom một dòng qua đổi mã, gộp mã. snapshot_sku là mã lúc ghi.';
COMMENT ON COLUMN inventory_movements_cur.sku IS 'Mã hiện hành của đích gộp; không có thì là mã lúc ghi.';
COMMENT ON COLUMN inventory_movements_cur.snapshot_sku IS 'Mã trên dòng lúc ghi (ảnh chụp).';
COMMENT ON COLUMN inventory_movements_cur.root_item_id IS 'Đích cuối của chuỗi gộp.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON inventory_movements_cur TO ketoan_app;
  END IF;
END $$;
