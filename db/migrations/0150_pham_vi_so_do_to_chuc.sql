-- [2026-11-17 04:40 PM khanhtd] NT-HT-003 — GĐ5 (§15): gán vai trò tại nút sơ đồ tổ chức (vùng) — scope_type org_unit, quyền đổi ngay khi cửa hàng chuyển vùng, chặn xoá / ngừng nút còn lần gán
-- =============================================================================
-- 0150 Phạm vi theo vùng (nút sơ đồ tổ chức, NT-HT-001) cho lần gán vai trò.
--   - user_role_assignments.scope_type thêm 'org_unit' (scope_id = org_units.id): vai trò có hiệu lực ở mọi chi nhánh thuộc nút đó
--     và cây con (branches.org_unit_id, org_units.path). Khai triển nút → chi nhánh ở tầng nạp của bộ tính quyền (Core), tính tại thời
--     điểm yêu cầu.
--   - Cửa hàng chuyển vùng (branches.org_unit_id) hoặc nút đổi chỗ trong cây (org_units.parent_id / path) → tăng tenants.authz_version:
--     đệm quyền cũ hết hiệu lực từ yêu cầu kế tiếp.
--   - Xoá nút, hoặc ngừng dùng nút, còn lần gán vai trò đang hiệu lực → chặn (ECP-13: không phá lịch sử đang được tham chiếu).
-- =============================================================================

ALTER TABLE user_role_assignments DROP CONSTRAINT user_role_assignments_scope_type_check;
ALTER TABLE user_role_assignments ADD CONSTRAINT user_role_assignments_scope_type_check
  CHECK (scope_type IN ('tenant', 'branch', 'warehouse', 'org_unit'));

COMMENT ON COLUMN user_role_assignments.scope_type IS 'tenant: cả đơn vị; branch / warehouse: tại một chi nhánh / kho; org_unit: tại một nút sơ đồ tổ chức (vùng) và cây con (0150). Phạm vi theo chi nhánh chỉ áp khi bật bizcity.authz.branch_scope.';
COMMENT ON COLUMN user_role_assignments.scope_id IS 'branches.id / warehouses.id / org_units.id khi scope_type khác tenant; NULL khi tenant.';

-- Quyền theo vùng đổi ngay khi cửa hàng chuyển vùng hoặc nút đổi chỗ trong cây.
CREATE TRIGGER branches_org_unit_authz_version AFTER UPDATE OF org_unit_id ON branches
  FOR EACH ROW WHEN (OLD.org_unit_id IS DISTINCT FROM NEW.org_unit_id) EXECUTE FUNCTION bizcity_bump_authz_version();
CREATE TRIGGER org_units_path_authz_version AFTER UPDATE OF parent_id, path ON org_units
  FOR EACH ROW WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id OR OLD.path IS DISTINCT FROM NEW.path) EXECUTE FUNCTION bizcity_bump_authz_version();
COMMENT ON TRIGGER branches_org_unit_authz_version ON branches IS 'Cửa hàng chuyển nút sơ đồ tổ chức → tăng authz_version (lần gán theo vùng đổi phạm vi, 0150).';
COMMENT ON TRIGGER org_units_path_authz_version ON org_units IS 'Nút đổi chỗ trong cây → tăng authz_version (lần gán theo vùng đổi phạm vi, 0150).';

CREATE OR REPLACE FUNCTION bizcity_org_units_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  nguoi text;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.is_active AND NOT NEW.is_active) THEN
    RETURN NEW;
  END IF;
  SELECT string_agg(DISTINCT u.email, ', ') INTO nguoi
    FROM user_role_assignments a JOIN users u ON u.id = a.user_id AND u.tenant_id = a.tenant_id
   WHERE a.tenant_id = OLD.tenant_id AND a.scope_type = 'org_unit' AND a.scope_id = OLD.id AND a.revoked_at IS NULL
     AND (a.valid_to IS NULL OR a.valid_to >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  IF nguoi IS NOT NULL THEN
    RAISE EXCEPTION 'Nút sơ đồ tổ chức % đang có lần gán vai trò theo vùng còn hiệu lực (%): thu hồi lần gán ở HT12 trước khi xoá / ngừng dùng nút', OLD.code, nguoi;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
COMMENT ON FUNCTION bizcity_org_units_assignment_guard() IS 'Chặn xoá / ngừng dùng nút sơ đồ tổ chức còn lần gán vai trò theo vùng đang hiệu lực (ECP-13, 0150).';
CREATE TRIGGER org_units_assignment_guard BEFORE DELETE OR UPDATE OF is_active ON org_units
  FOR EACH ROW EXECUTE FUNCTION bizcity_org_units_assignment_guard();
COMMENT ON TRIGGER org_units_assignment_guard ON org_units IS 'Xoá / ngừng nút còn lần gán theo vùng → báo lỗi kèm email người được gán (0150).';
