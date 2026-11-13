-- [2026-11-13 Nguyễn Văn Thủy] Quay về dữ liệu gốc cho Nhóm hàng + Mặt hàng (đóng góp)
--
-- Làm sạch hẳn (xoá vĩnh viễn) danh mục nhóm hàng / mặt hàng rồi nạp bộ mẫu nhỏ theo quy định mã hàng
-- (mã 9 ký tự = ngành 2 + nhãn 3 + nhóm 1 + số thứ tự 3). GIỮ LẠI mọi mặt hàng đã phát sinh (sổ cái, phiếu kho,
-- chứng từ mua, hoá đơn, lô) cùng nhóm hàng của chúng — sổ không gãy.
--
-- Chỉ chạy qua hàm bizcity_reset_catalog_sample(đơn vị): nút "Quay về dữ liệu gốc" (Hệ thống → Dữ liệu gốc) gọi
-- trong phiên của đơn vị đó; migration này gọi một lần cho mọi đơn vị (trừ CSDL kiểm thử) để bản cập nhật vừa lên
-- là có dữ liệu sạch cho việc thử và viết tài liệu.

-- Chỉ mục cho các khoá ngoại trỏ về items còn thiếu (xoá / gộp mặt hàng không phải quét cả bảng)
CREATE INDEX IF NOT EXISTS product_units_item_idx ON product_units (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS product_prices_item_idx ON product_prices (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS items_parent_item_idx ON items (parent_item_id);
CREATE INDEX IF NOT EXISTS items_merged_into_idx ON items (merged_into_item_id);
CREATE INDEX IF NOT EXISTS sale_programs_item_idx ON sale_programs (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS sale_programs_gift_item_idx ON sale_programs (tenant_id, gift_item_id);
CREATE INDEX IF NOT EXISTS sale_program_usage_item_idx ON sale_program_usage (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS item_lots_item_idx ON item_lots (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS inventory_lot_moves_item_idx ON inventory_lot_moves (tenant_id, item_id);

CREATE OR REPLACE FUNCTION bizcity_reset_catalog_sample(p_tenant bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cur text := nullif(current_setting('bizcity.tenant_id', true), '');
  n_prod int; n_item int; n_grp int; n_add_g int := 0; n_add_p int := 0; n_keep int;
  g_root text; g_brand text; g_leaf text; next_code bigint;
  r record;
BEGIN
  IF v_cur IS NOT NULL AND v_cur::bigint <> p_tenant THEN
    RAISE EXCEPTION 'Chỉ làm sạch được dữ liệu của đơn vị đang đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DROP TABLE IF EXISTS _keep_sku, _keep_item, _keep_grp;
  -- 1. Mã hàng đã phát sinh → giữ (kèm mã cha)
  CREATE TEMP TABLE _keep_sku (sku text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _keep_sku
    SELECT product_sku FROM ledger_lines WHERE tenant_id = p_tenant AND coalesce(product_sku, '') <> ''
    UNION SELECT sku FROM inventory_movements WHERE tenant_id = p_tenant AND coalesce(sku, '') <> ''
    UNION SELECT sku FROM inventory_costs WHERE tenant_id = p_tenant AND coalesce(sku, '') <> ''
    UNION SELECT sku FROM inventory_lot_moves WHERE tenant_id = p_tenant AND coalesce(sku, '') <> ''
    UNION SELECT sku FROM item_lots WHERE tenant_id = p_tenant AND coalesce(sku, '') <> ''
    UNION SELECT sku FROM supplier_invoice_lines WHERE tenant_id = p_tenant AND coalesce(sku, '') <> ''
    UNION SELECT l.sku FROM tax_invoice_lines l JOIN tax_invoices v ON v.id = l.tax_invoice_id WHERE v.tenant_id = p_tenant AND coalesce(l.sku, '') <> ''
    UNION SELECT sku FROM sale_program_usage WHERE tenant_id = p_tenant AND coalesce(sku, '') <> ''
    UNION SELECT s #>> '{}' FROM purchase_documents d, jsonb_path_query(d.data, '$.lines[*].sku') s
           WHERE d.tenant_id = p_tenant AND coalesce(s #>> '{}', '') <> ''
    ON CONFLICT DO NOTHING;
  INSERT INTO _keep_sku SELECT DISTINCT p.parent_sku FROM products p JOIN _keep_sku k ON k.sku = p.sku
   WHERE p.tenant_id = p_tenant AND coalesce(p.parent_sku, '') <> '' ON CONFLICT DO NOTHING;

  CREATE TEMP TABLE _keep_item (item_id text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _keep_item
    SELECT p.item_id FROM products p JOIN _keep_sku k ON k.sku = p.sku WHERE p.tenant_id = p_tenant AND p.item_id IS NOT NULL
    UNION SELECT item_id FROM ledger_lines WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    UNION SELECT item_id FROM inventory_movements WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    UNION SELECT item_id FROM inventory_costs WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    UNION SELECT item_id FROM inventory_lot_moves WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    UNION SELECT item_id FROM item_lots WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    UNION SELECT item_id FROM supplier_invoice_lines WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    UNION SELECT item_id FROM sale_program_usage WHERE tenant_id = p_tenant AND item_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  -- mặt hàng cha / gốc / gộp vào của các mặt hàng giữ lại
  LOOP
    INSERT INTO _keep_item
      SELECT x FROM (SELECT unnest(ARRAY[i.parent_item_id, i.root_item_id, i.merged_into_item_id]) x
                       FROM items i JOIN _keep_item k ON k.item_id = i.item_id) y
       WHERE x IS NOT NULL ON CONFLICT DO NOTHING;
    EXIT WHEN NOT FOUND;
  END LOOP;
  -- mặt hàng có item_id do mã con / gộp trỏ tới cũng phải giữ dòng products của nó
  INSERT INTO _keep_sku SELECT p.sku FROM products p JOIN _keep_item k ON k.item_id = p.item_id WHERE p.tenant_id = p_tenant ON CONFLICT DO NOTHING;

  -- 2. Xoá vĩnh viễn phần còn lại (bảng định danh có chốt chặn xoá → tạm tắt trong giao dịch này, khoá bảng tới khi xong)
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  ALTER TABLE items DISABLE TRIGGER items_guard;
  ALTER TABLE item_codes DISABLE TRIGGER item_codes_guard;
  ALTER TABLE item_classification DISABLE TRIGGER item_classification_guard;
  ALTER TABLE products DISABLE TRIGGER products_items_sync;

  DELETE FROM product_units WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  DELETE FROM product_prices WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  DELETE FROM supplier_products WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  DELETE FROM supplier_item_aliases WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  DELETE FROM stock_sku_settings WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  DELETE FROM stock_levels WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  DELETE FROM sale_programs WHERE tenant_id = p_tenant
     AND ((coalesce(sku, '') <> '' AND sku NOT IN (SELECT sku FROM _keep_sku))
       OR (coalesce(gift_sku, '') <> '' AND gift_sku NOT IN (SELECT sku FROM _keep_sku)));
  DELETE FROM products WHERE tenant_id = p_tenant AND sku NOT IN (SELECT sku FROM _keep_sku);
  GET DIAGNOSTICS n_prod = ROW_COUNT;
  DELETE FROM item_codes WHERE tenant_id = p_tenant AND item_id NOT IN (SELECT item_id FROM _keep_item);
  DELETE FROM item_classification WHERE tenant_id = p_tenant AND item_id NOT IN (SELECT item_id FROM _keep_item);
  UPDATE items SET parent_item_id = NULL WHERE tenant_id = p_tenant AND parent_item_id IS NOT NULL AND parent_item_id NOT IN (SELECT item_id FROM _keep_item);
  DELETE FROM items WHERE tenant_id = p_tenant AND item_id NOT IN (SELECT item_id FROM _keep_item);
  GET DIAGNOSTICS n_item = ROW_COUNT;

  SET CONSTRAINTS ALL IMMEDIATE;   -- khoá ngoại products → items kiểm ngay, không để treo tới cuối giao dịch
  SET CONSTRAINTS ALL DEFERRED;
  ALTER TABLE items ENABLE TRIGGER items_guard;
  ALTER TABLE item_codes ENABLE TRIGGER item_codes_guard;
  ALTER TABLE item_classification ENABLE TRIGGER item_classification_guard;
  ALTER TABLE products ENABLE TRIGGER products_items_sync;

  -- Nhóm hàng: giữ nhóm của mặt hàng còn lại + mọi nhóm cha
  CREATE TEMP TABLE _keep_grp (code text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _keep_grp SELECT DISTINCT group_code FROM products WHERE tenant_id = p_tenant AND coalesce(group_code, '') <> '' ON CONFLICT DO NOTHING;
  LOOP
    INSERT INTO _keep_grp SELECT g.parent_code FROM item_classes g JOIN _keep_grp k ON k.code = g.code
     WHERE g.tenant_id = p_tenant AND g.kind = 'group' AND g.parent_code IS NOT NULL ON CONFLICT DO NOTHING;
    EXIT WHEN NOT FOUND;
  END LOOP;
  DELETE FROM item_class_history WHERE tenant_id = p_tenant AND kind = 'group' AND code NOT IN (SELECT code FROM _keep_grp);
  DELETE FROM item_classes WHERE tenant_id = p_tenant AND kind = 'group' AND code NOT IN (SELECT code FROM _keep_grp);
  GET DIAGNOSTICS n_grp = ROW_COUNT;

  -- 3. Bộ mẫu: 2 cây nhóm (ngành → nhãn → nhóm) và 8 mặt hàng đại diện
  PERFORM set_config('ketoan.actor_name', 'Dữ liệu gốc', true);
  SELECT coalesce(max(code::bigint), 0) INTO next_code FROM item_classes WHERE tenant_id = p_tenant AND kind = 'group' AND code ~ '^[0-9]{1,15}$';

  FOR r IN SELECT * FROM (VALUES
      -- ngành (mã ngắn, tên), nhãn (mã ngắn, tên), nhóm (mã ngắn, tên), mã hàng, tên hàng, ĐVT, thuế
      ('11', 'Sữa bột', '005', 'Vinamilk', '3', 'Sữa công thức trẻ em', '110053001', 'Vinamilk Optimum Gold 1 400g', 'Lon', 'R08'),
      ('11', 'Sữa bột', '005', 'Vinamilk', '3', 'Sữa công thức trẻ em', '110053002', 'Vinamilk Optimum Gold 2 800g', 'Lon', 'R08'),
      ('11', 'Sữa bột', '005', 'Vinamilk', '3', 'Sữa công thức trẻ em', '110053003', 'Vinamilk Dielac Grow Plus 1+ 850g', 'Lon', 'R08'),
      ('11', 'Sữa bột', '005', 'Vinamilk', '4', 'Sữa người lớn', '110054001', 'Vinamilk Sure Prevent Gold 900g', 'Lon', 'R08'),
      ('11', 'Sữa bột', '005', 'Vinamilk', '4', 'Sữa người lớn', '110054002', 'Vinamilk CanxiPro 400g', 'Lon', 'R08'),
      ('19', 'Bỉm tã', '042', 'Merries', '2', 'Bỉm tã dán trẻ em', '190422001', 'Bỉm Merries dán size S 82 miếng', 'Bịch', 'R08'),
      ('19', 'Bỉm tã', '042', 'Merries', '2', 'Bỉm tã dán trẻ em', '190422002', 'Bỉm Merries dán size M 64 miếng', 'Bịch', 'R08'),
      ('19', 'Bỉm tã', '042', 'Merries', '3', 'Bỉm tã quần trẻ em', '190423001', 'Bỉm Merries quần size L 44 miếng', 'Bịch', 'R08')
    ) AS t(c1, n1, c2, n2, c3, n3, sku, pname, unit, tax)
  LOOP
    -- ngành
    SELECT code INTO g_root FROM item_classes WHERE tenant_id = p_tenant AND kind = 'group' AND parent_code IS NULL AND sku_code = r.c1 ORDER BY code LIMIT 1;
    IF g_root IS NULL THEN
      next_code := next_code + 1; g_root := next_code::text;
      INSERT INTO item_classes (tenant_id, kind, code, name, full_name, sku_code, parent_code, created_by, updated_by)
      VALUES (p_tenant, 'group', g_root, r.n1, r.n1, r.c1, NULL, 'Dữ liệu gốc', 'Dữ liệu gốc');
      n_add_g := n_add_g + 1;
    END IF;
    -- nhãn
    SELECT code INTO g_brand FROM item_classes WHERE tenant_id = p_tenant AND kind = 'group' AND parent_code = g_root AND sku_code = r.c2 ORDER BY code LIMIT 1;
    IF g_brand IS NULL THEN
      next_code := next_code + 1; g_brand := next_code::text;
      INSERT INTO item_classes (tenant_id, kind, code, name, full_name, sku_code, parent_code, created_by, updated_by)
      VALUES (p_tenant, 'group', g_brand, r.n1 || ' ' || r.n2, r.n1 || ' ' || r.n2, r.c2, g_root, 'Dữ liệu gốc', 'Dữ liệu gốc');
      n_add_g := n_add_g + 1;
    END IF;
    -- nhóm
    SELECT code INTO g_leaf FROM item_classes WHERE tenant_id = p_tenant AND kind = 'group' AND parent_code = g_brand AND sku_code = r.c3 ORDER BY code LIMIT 1;
    IF g_leaf IS NULL THEN
      next_code := next_code + 1; g_leaf := next_code::text;
      INSERT INTO item_classes (tenant_id, kind, code, name, full_name, sku_code, parent_code, created_by, updated_by)
      VALUES (p_tenant, 'group', g_leaf, r.n2 || ' ' || lower(r.n3), r.n1 || ' ' || r.n2 || ' ' || r.n3, r.c3, g_brand, 'Dữ liệu gốc', 'Dữ liệu gốc');
      n_add_g := n_add_g + 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = p_tenant AND sku = r.sku) THEN
      INSERT INTO products (tenant_id, sku, name, unit, group_code, tax_out_code, tax_in_code, source_system)
      VALUES (p_tenant, r.sku, r.pname, r.unit, g_leaf,
              (SELECT code FROM tax_codes WHERE tenant_id = p_tenant AND code = r.tax),
              (SELECT code FROM tax_codes WHERE tenant_id = p_tenant AND code = 'V' || substr(r.tax, 2)),
              'du-lieu-goc');
      n_add_p := n_add_p + 1;
    END IF;
  END LOOP;

  INSERT INTO item_class_history (tenant_id, kind, code, by_user, action, changes)
    SELECT p_tenant, 'group', code, 'Dữ liệu gốc', 'them', 'Nạp từ dữ liệu gốc'
      FROM item_classes g WHERE g.tenant_id = p_tenant AND g.kind = 'group' AND g.created_by = 'Dữ liệu gốc'
       AND NOT EXISTS (SELECT 1 FROM item_class_history h WHERE h.tenant_id = p_tenant AND h.kind = 'group' AND h.code = g.code);

  SELECT count(*) INTO n_keep FROM _keep_sku;
  DROP TABLE _keep_sku, _keep_item, _keep_grp;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RETURN jsonb_build_object('removed_products', n_prod, 'removed_items', n_item, 'removed_groups', n_grp,
                            'kept_products', n_keep, 'added_groups', n_add_g, 'added_products', n_add_p);
END $$;

COMMENT ON FUNCTION bizcity_reset_catalog_sample(bigint) IS
  'Quay về dữ liệu gốc cho nhóm hàng + mặt hàng (0124): xoá vĩnh viễn phần chưa phát sinh, giữ mã đã vào sổ, nạp bộ mẫu nhỏ.';
REVOKE ALL ON FUNCTION bizcity_reset_catalog_sample(bigint) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT EXECUTE ON FUNCTION bizcity_reset_catalog_sample(bigint) TO ketoan_app;
  END IF;
END $$;

-- Chạy một lần cho mọi đơn vị (CSDL kiểm thử tự động giữ nguyên để các bài kiểm thử có dữ liệu riêng)
DO $$
DECLARE t record;
BEGIN
  IF current_database() LIKE '%\_test' THEN RETURN; END IF;
  FOR t IN SELECT id FROM tenants ORDER BY id LOOP
    PERFORM bizcity_reset_catalog_sample(t.id);
  END LOOP;
END $$;
