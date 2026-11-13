-- [2026-11-13 Nguyễn Văn Thủy] Mỗi chi nhánh / cửa hàng một phòng ban riêng, ánh xạ rõ ràng (đóng góp)
--
-- Sơ đồ phòng ban có nhánh cửa hàng rõ ràng: Cửa hàng (CN-CH) → từng shop (BH + số mã shop, như sổ cũ: BH00001 Shop Vĩnh Hưng…);
-- chi nhánh cấp trên → dưới Giám đốc chi nhánh (CN). Chi nhánh gắn đúng phòng ban của mình (branches.department_code):
-- mọi chứng từ ghi cho chi nhánh tự mang phòng ban đó — sau này chi nhánh ngừng, sổ vẫn còn phòng ban.
-- Phòng ban shop cũ (BH00001…, ngừng ở 0123) dùng lại đúng mã → dòng sổ cũ khớp.
-- Chi nhánh mới: tự sinh phòng ban (trigger). Mã: BH + phần số đầu mã chi nhánh; mã không bắt đầu bằng số / số đã có
-- chi nhánh khác dùng → BH- + mã chi nhánh. Chỉ áp cho đơn vị đã dùng danh mục phòng ban.

CREATE OR REPLACE FUNCTION bizcity_branch_department_code(p_tenant bigint, p_branch_id bigint, p_code text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN substring(p_code from '^[0-9]+') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM branches o WHERE o.tenant_id = p_tenant AND o.id IS DISTINCT FROM p_branch_id
                       AND o.department_code = 'BH' || substring(p_code from '^[0-9]+'))
     AND NOT EXISTS (SELECT 1 FROM branches o WHERE o.tenant_id = p_tenant AND o.id IS DISTINCT FROM p_branch_id AND o.code < p_code
                       AND substring(o.code from '^[0-9]+') = substring(p_code from '^[0-9]+'))
    THEN 'BH' || substring(p_code from '^[0-9]+')
    ELSE 'BH-' || p_code END
$$;
COMMENT ON FUNCTION bizcity_branch_department_code(bigint, bigint, text) IS 'Mã phòng ban riêng của chi nhánh: BH + số đầu mã (trùng thì BH- + mã) (0129).';

-- Tạo / bật phòng ban riêng của một chi nhánh, đặt đúng chỗ trên sơ đồ; trả mã.
CREATE OR REPLACE FUNCTION bizcity_ensure_branch_department(p_tenant bigint, p_branch_id bigint, p_code text, p_name text, p_level text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_code text := bizcity_branch_department_code(p_tenant, p_branch_id, p_code);
  v_parent text := CASE WHEN p_level = 'shop' THEN 'CN-CH' ELSE 'CN' END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dimensions WHERE tenant_id = p_tenant AND kind = 'department' AND code = v_parent) THEN v_parent := NULL; END IF;
  INSERT INTO dimensions (tenant_id, kind, code, name, parent_code)
  VALUES (p_tenant, 'department', v_code, CASE WHEN p_level = 'shop' THEN 'Shop ' ELSE '' END || p_name, v_parent)
  ON CONFLICT (tenant_id, kind, code) DO UPDATE SET is_active = true, parent_code = COALESCE(EXCLUDED.parent_code, dimensions.parent_code);
  RETURN v_code;
END $$;
COMMENT ON FUNCTION bizcity_ensure_branch_department(bigint, bigint, text, text, text) IS 'Phòng ban riêng của chi nhánh: tạo hoặc bật lại, đặt dưới Cửa hàng / Giám đốc chi nhánh (0129).';

-- Chi nhánh mới chưa chọn phòng ban (hoặc để mặc định Cửa hàng chung) → tự sinh phòng ban riêng.
CREATE OR REPLACE FUNCTION bizcity_branch_own_department() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.department_code IS NULL OR NEW.department_code IN ('CN-CH', 'CN'))
     AND EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = NEW.tenant_id AND d.kind = 'department') THEN
    NEW.department_code := bizcity_ensure_branch_department(NEW.tenant_id, NEW.id, NEW.code, NEW.name, COALESCE(NEW.level, ''));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER branches_own_department BEFORE INSERT ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_branch_own_department();
COMMENT ON FUNCTION bizcity_branch_own_department() IS 'Chi nhánh mới tự có phòng ban riêng trên sơ đồ phòng ban (0129).';

-- Chi nhánh hiện có: gắn lại phòng ban riêng (đang gắn chung Cửa hàng / Bán hàng / trống)
DO $$
DECLARE b record;
BEGIN
  FOR b IN SELECT br.id, br.tenant_id, br.code, br.name, br.level FROM branches br
            WHERE (br.department_code IS NULL OR br.department_code IN ('CN-CH', 'CN', 'BH'))
              AND EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = br.tenant_id AND d.kind = 'department')
            ORDER BY br.tenant_id, br.code LOOP
    UPDATE branches SET department_code = bizcity_ensure_branch_department(b.tenant_id, b.id, b.code, b.name, COALESCE(b.level, '')) WHERE id = b.id;
  END LOOP;
END $$;
