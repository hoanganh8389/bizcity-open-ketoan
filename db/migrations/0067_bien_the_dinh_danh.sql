-- [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3 (R-ITEM-3, D026-2): họ mặt hàng theo định danh — items.parent_item_id điền và giữ khớp từ products.parent_sku; đổi mã cha không đứt họ; chặn vòng
-- =============================================================================
-- 0067 Biến thể theo định danh (bước S026-3 của PHASE-026).
--   Định danh ba tầng (ADR-0022 D026-2): sản phẩm cha (items.parent_item_id) → mặt hàng = đơn vị tồn kho (items.item_id) → mã
--   (item_codes). Thuật ngữ của chủ dự án: "item_id (cha)" = parent_item_id; "sku_id / variant_id" = item_id; "mã code" = item_codes.code.
--   - Họ mã hôm nay là products.parent_sku (0026: mã 9 số + đuôi, sửa tay được) — một CHUỖI, đổi mã cha là đứt. Từ 0067 họ đi theo
--     ĐỊNH DANH: parent_item_id trỏ item_id của mã cha (mã đang mở, hoặc mã gần nhất — bizcity_item_at); đổi mã cha / mã con không
--     đổi parent_item_id. products.parent_sku giữ làm ảnh chụp cho các màn đang đọc nó (MH26, phân tích đặt hàng).
--   - Giữ khớp: trigger trên products (đổi parent_sku → đổi parent_item_id; thêm mặt hàng cha SAU con → nhận các con đang chờ).
--   - Bất biến: cha cùng đơn vị, không tự trỏ mình, không vòng (đi lên tối đa 20 cấp).
--   - Luật biến thể kinh tế khác = định danh mới (R-ITEM-3) thể hiện ở Gate A: ITEM-HINT-003 khi đổi đơn vị tính gốc của mặt hàng đã
--     có nhập xuất (item.hints.ts) — không chặn (R-GATE-9), bắt ghi lý do.
-- =============================================================================

-- ── Bất biến họ mặt hàng ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cur text;
  v_tenant bigint;
  n int := 0;
BEGIN
  IF NEW.parent_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_item_id = NEW.item_id THEN
    RAISE EXCEPTION 'Mặt hàng % không thể là cha của chính nó (R-ITEM-3).', NEW.item_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT tenant_id INTO v_tenant FROM items WHERE item_id = NEW.parent_item_id;
  IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Mặt hàng cha % không thuộc cùng đơn vị (R-ITEM-3).', NEW.parent_item_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  v_cur := NEW.parent_item_id;
  LOOP
    SELECT parent_item_id INTO v_cur FROM items WHERE item_id = v_cur;
    EXIT WHEN v_cur IS NULL;
    n := n + 1;
    IF v_cur = NEW.item_id OR n > 20 THEN
      RAISE EXCEPTION 'Họ mặt hàng tạo vòng: % đã là tổ tiên của mặt hàng cha (R-ITEM-3).', NEW.item_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_items_parent_guard() IS 'Họ mặt hàng (R-ITEM-3, 0067): cha cùng đơn vị, không tự trỏ mình, không vòng.';
CREATE TRIGGER items_parent_guard BEFORE INSERT OR UPDATE OF parent_item_id ON items FOR EACH ROW EXECUTE FUNCTION bizcity_items_parent_guard();

-- ── Điền họ theo định danh từ parent_sku (dùng cho điền ban đầu và chạy lại) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_link_parents(p_tenant bigint DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_parent text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.tenant_id, p.sku, p.parent_sku, bizcity_item_at(p.tenant_id, p.sku, CURRENT_DATE) AS item_id
      FROM products p
     WHERE (p_tenant IS NULL OR p.tenant_id = p_tenant) AND p.parent_sku IS NOT NULL AND p.parent_sku <> '' AND p.parent_sku <> p.sku
  LOOP
    v_parent := bizcity_item_at(r.tenant_id, r.parent_sku, CURRENT_DATE);
    CONTINUE WHEN r.item_id IS NULL OR v_parent IS NULL OR v_parent = r.item_id;
    UPDATE items SET parent_item_id = v_parent WHERE item_id = r.item_id AND parent_item_id IS DISTINCT FROM v_parent;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;
COMMENT ON FUNCTION bizcity_items_link_parents(bigint) IS 'Điền items.parent_item_id theo products.parent_sku (mã cha → định danh của mã cha). Chạy lại an toàn; trả số mặt hàng đã gắn / sửa họ.';

-- ── Giữ khớp theo định danh ──────────────────────────────────────────────────────────────────────────────────────────────
-- Hai trigger (tên xếp SAU products_items_sync để mặt hàng mới đã có định danh). Đường THÊM đi nhẹ: phần lớn mặt hàng không có
-- mã cha và chưa có con chờ → chỉ một lần dò chỉ mục products_parent_idx, không tra định danh, không UPDATE (đo: 20.000 mặt hàng thêm
-- trong một giao dịch, trigger kiểu cũ làm chậm ≈ 70 %).
CREATE OR REPLACE FUNCTION bizcity_items_link_parent_of(p_tenant bigint, p_sku text, p_parent_sku text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_parent text;
BEGIN
  v_id := bizcity_item_at(p_tenant, p_sku, CURRENT_DATE);
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  v_parent := CASE WHEN p_parent_sku IS NULL OR p_parent_sku = '' OR p_parent_sku = p_sku THEN NULL
                   ELSE bizcity_item_at(p_tenant, p_parent_sku, CURRENT_DATE) END;
  -- Mã cha chưa có trong danh mục: để trống, gắn khi mặt hàng cha được thêm (bizcity_items_adopt_children).
  UPDATE items SET parent_item_id = v_parent WHERE item_id = v_id AND parent_item_id IS DISTINCT FROM v_parent;
END $$;
COMMENT ON FUNCTION bizcity_items_link_parent_of(bigint, text, text) IS 'Đặt items.parent_item_id của mặt hàng theo mã cha (định danh của mã cha); mã cha chưa có thì để trống.';

CREATE OR REPLACE FUNCTION bizcity_items_sync_parent_ins() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
BEGIN
  IF NEW.parent_sku IS NOT NULL AND NEW.parent_sku <> '' AND NEW.parent_sku <> NEW.sku THEN
    PERFORM bizcity_items_link_parent_of(NEW.tenant_id, NEW.sku, NEW.parent_sku);
  END IF;
  -- Mặt hàng cha thêm SAU các mặt hàng con đã khai parent_sku = mã này: nhận các con đang chờ (dò chỉ mục trước, thường không có).
  IF EXISTS (SELECT 1 FROM products c WHERE c.tenant_id = NEW.tenant_id AND c.parent_sku = NEW.sku AND c.sku <> NEW.sku) THEN
    v_id := bizcity_item_at(NEW.tenant_id, NEW.sku, CURRENT_DATE);
    IF v_id IS NOT NULL THEN
      UPDATE items i SET parent_item_id = v_id
        FROM products c
       WHERE c.tenant_id = NEW.tenant_id AND c.parent_sku = NEW.sku AND c.sku <> NEW.sku
         AND i.item_id = bizcity_item_at(c.tenant_id, c.sku, CURRENT_DATE) AND i.parent_item_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_items_sync_parent_ins() IS 'Thêm mặt hàng: gắn cha theo parent_sku; mặt hàng cha thêm sau con thì nhận các con đang chờ (0067). Đường nhẹ: một lần dò chỉ mục khi không có họ.';
CREATE TRIGGER products_items_sync_parent_ins AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION bizcity_items_sync_parent_ins();

CREATE OR REPLACE FUNCTION bizcity_items_sync_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM bizcity_items_link_parent_of(NEW.tenant_id, NEW.sku, NEW.parent_sku);
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_items_sync_parent() IS 'Đổi parent_sku → đổi items.parent_item_id theo định danh; đổi mã cha / con không đứt họ (0067).';
CREATE TRIGGER products_items_sync_parent AFTER UPDATE OF parent_sku ON products FOR EACH ROW WHEN (NEW.parent_sku IS DISTINCT FROM OLD.parent_sku) EXECUTE FUNCTION bizcity_items_sync_parent();

CREATE INDEX IF NOT EXISTS items_parent ON items (tenant_id, parent_item_id) WHERE parent_item_id IS NOT NULL;

SELECT bizcity_items_link_parents();

COMMENT ON COLUMN items.parent_item_id IS 'Sản phẩm cha (họ mặt hàng, R-ITEM-3 / D026-2): biến thể là mặt hàng riêng (tồn, giá vốn riêng) trỏ về cha. Điền từ products.parent_sku theo định danh (0067); đổi mã không đứt họ.';
