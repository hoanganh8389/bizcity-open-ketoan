-- [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức linh hoạt: nút có hoạt động, chỉ để thống kê, xoá trắng cơ cấu (đóng góp)
--
-- Cây: Công ty (cấp 0) → Chi nhánh cấp 1, 2, 3… → Cửa hàng; cấp nào dùng do đơn vị quyết. Mỗi nút có thể có kho, bộ phận, MST
-- (MST cha tự áp xuống con khi con để trống — đã có ở bizcity_effective_tax_id / tax_id_versions, 0121).
--   org_units.branch_id   ĐIỂM HOẠT ĐỘNG của nút (có kho, ghi chứng từ): một chi nhánh trong branches. Sổ, kho vẫn ghi theo
--                         branches như cũ; nút không có điểm hoạt động = chỉ để gom.
--   stats_only            Chỉ để thống kê: không hiện ở ô tìm / chọn chi nhánh khi lập chứng từ (org_units và branches).
--   bizcity_co_cau_wipe() Xoá trắng cơ cấu: xoá mọi nút, bộ phận chưa dùng, cửa hàng / kho chưa phát sinh chứng từ; cửa hàng / kho
--                         đã có chứng từ giữ lại, gỡ khỏi cây ("Chưa xếp vào cơ cấu"). Lần gán vai trò theo nút bị thu hồi.

ALTER TABLE org_units ADD COLUMN IF NOT EXISTS stats_only boolean NOT NULL DEFAULT false;
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS branch_id bigint REFERENCES branches(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_units_branch_uq ON org_units (tenant_id, branch_id) WHERE branch_id IS NOT NULL;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS stats_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN org_units.branch_id IS 'Điểm hoạt động của nút (chi nhánh có kho, ghi chứng từ); NULL = nút chỉ để gom (0171).';
COMMENT ON COLUMN org_units.stats_only IS 'Chỉ để thống kê: không hiện khi tìm / chọn chi nhánh lập chứng từ (0171).';
COMMENT ON COLUMN branches.stats_only IS 'Chỉ để thống kê: không hiện khi tìm / chọn chi nhánh lập chứng từ (0171).';

CREATE OR REPLACE FUNCTION bizcity_co_cau_wipe(p_tenant bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_used bigint[] := '{}';
  v_codes text[] := '{}';
  v_ids bigint[];
  v_rev int := 0; v_wh int := 0; v_br int := 0; v_dep int := 0; v_org int := 0; v_kept int := 0; n int;
BEGIN
  -- 1. Cửa hàng đã phát sinh: có dòng ở bảng trỏ khoá ngoại vào branches (sổ, chứng từ kế toán, kho, hoá đơn, tài sản…)
  FOR r IN SELECT c.conrelid::regclass::text AS t, a.attname AS col
             FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.confrelid = 'branches'::regclass AND c.contype = 'f'
              AND c.conrelid::regclass::text NOT IN ('warehouses', 'branches', 'org_units')
  LOOP
    EXECUTE format('SELECT array_agg(DISTINCT %I) FROM %s WHERE %I IN (SELECT id FROM branches WHERE tenant_id = $1)', r.col, r.t, r.col) INTO v_ids USING p_tenant;
    v_used := v_used || COALESCE(v_ids, '{}');
  END LOOP;
  --    … hoặc có chứng từ nghiệp vụ ghi theo mã (phiếu mua, chuyển kho, đề nghị thanh toán, đơn bán, phiếu trả…)
  FOR r IN SELECT table_schema AS s, table_name AS t, column_name AS col FROM information_schema.columns
            WHERE column_name IN ('branch_code', 'from_branch_code', 'to_branch_code')
              AND table_name IN ('purchase_documents', 'stock_transfer_docs', 'payment_requests', 'supplier_invoices', 'orders', 'returns', 'docs')
  LOOP
    EXECUTE format('SELECT array_agg(DISTINCT %I) FROM %I.%I WHERE tenant_id = $1', r.col, r.s, r.t) INTO v_codes USING p_tenant;
    IF v_codes IS NOT NULL THEN
      v_used := v_used || COALESCE((SELECT array_agg(id) FROM branches WHERE tenant_id = p_tenant AND code = ANY(v_codes)), '{}');
    END IF;
  END LOOP;

  -- 2. Thu hồi lần gán vai trò theo nút / theo cửa hàng, kho sẽ bị xoá
  UPDATE user_role_assignments SET revoked_at = now()
   WHERE tenant_id = p_tenant AND revoked_at IS NULL AND (
     scope_type = 'org_unit'
     OR (scope_type = 'branch' AND scope_id IN (SELECT id FROM branches WHERE tenant_id = p_tenant AND NOT id = ANY(v_used)))
     OR (scope_type = 'warehouse' AND scope_id IN (SELECT w.id FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.tenant_id = p_tenant AND NOT b.id = ANY(v_used))));
  GET DIAGNOSTICS v_rev = ROW_COUNT;

  -- 3. Gỡ nút khỏi cửa hàng, rồi xoá nút (lá trước)
  UPDATE org_units SET purchase_branch_id = NULL, branch_id = NULL WHERE tenant_id = p_tenant;
  UPDATE branches SET org_unit_id = NULL WHERE tenant_id = p_tenant AND org_unit_id IS NOT NULL;
  DELETE FROM org_link_versions WHERE tenant_id = p_tenant;
  DELETE FROM tax_id_versions WHERE tenant_id = p_tenant AND scope = 'org_unit';
  LOOP
    DELETE FROM org_units o WHERE o.tenant_id = p_tenant AND NOT EXISTS (SELECT 1 FROM org_units c WHERE c.parent_id = o.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
    v_org := v_org + n;
  END LOOP;

  -- 4. Xoá kho và cửa hàng chưa phát sinh
  DELETE FROM warehouses w USING branches b WHERE w.branch_id = b.id AND b.tenant_id = p_tenant AND NOT b.id = ANY(v_used);
  GET DIAGNOSTICS v_wh = ROW_COUNT;
  UPDATE branches SET parent_id = NULL WHERE tenant_id = p_tenant AND parent_id IS NOT NULL;
  DELETE FROM tax_id_versions WHERE tenant_id = p_tenant AND scope = 'warehouse' AND ref_id NOT IN (SELECT id FROM warehouses WHERE tenant_id = p_tenant);
  DELETE FROM tax_id_versions WHERE tenant_id = p_tenant AND scope = 'branch' AND NOT ref_id = ANY(v_used);
  DELETE FROM branches WHERE tenant_id = p_tenant AND NOT id = ANY(v_used);
  GET DIAGNOSTICS v_br = ROW_COUNT;
  SELECT count(*) INTO v_kept FROM branches WHERE tenant_id = p_tenant;

  -- 5. Bộ phận chưa dùng ở sổ và không còn cửa hàng nào mang
  LOOP
    DELETE FROM dimensions d WHERE d.tenant_id = p_tenant AND d.kind = 'department'
       AND NOT EXISTS (SELECT 1 FROM ledger_lines l WHERE l.tenant_id = p_tenant AND l.department_uid = d.uid)
       AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.department_code = d.code)
       AND NOT EXISTS (SELECT 1 FROM dimensions c WHERE c.tenant_id = p_tenant AND c.kind = 'department' AND c.parent_code = d.code);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
    v_dep := v_dep + n;
  END LOOP;

  PERFORM bizcity_sync_cost_units(p_tenant); -- đơn vị giá vốn theo cơ cấu (0151) khớp lại cây mới
  RETURN jsonb_build_object('orgUnits', v_org, 'branchesDeleted', v_br, 'branchesKept', v_kept, 'warehousesDeleted', v_wh,
    'departmentsDeleted', v_dep, 'assignmentsRevoked', v_rev);
END $$;
COMMENT ON FUNCTION bizcity_co_cau_wipe(bigint) IS 'Xoá trắng cơ cấu tổ chức của đơn vị: xoá nút, bộ phận / cửa hàng / kho chưa phát sinh; nơi đã có chứng từ giữ lại, gỡ khỏi cây (0171).';
