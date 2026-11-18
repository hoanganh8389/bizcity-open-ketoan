-- [2026-11-17 Nguyễn Văn Thủy] Giá vốn tính theo CHI NHÁNH trên cây cơ cấu tổ chức (đóng góp)
--
-- Chi nhánh cấp 2 (Chi nhánh Hà Nội, Bắc Giang, Hải Phòng…) là nơi mua hàng đại diện rồi phát xuống shop các tỉnh; cấp tỉnh
-- (CN có MST) chỉ là trung gian lấy MST. Giá vốn bình quân gia quyền tháng tính riêng từng chi nhánh (công thức giá vốn nội bộ).
--
-- org_units.is_cost_center   nút là "điểm tính giá vốn" (mặc định: mọi nút cấp 2). Đổi được sau mà không sửa mã.
-- accounting_units.org_unit_id  đơn vị hạch toán sinh tự động cho mỗi điểm tính giá vốn (mã, tên theo nút).
-- branches.accounting_unit_id   TỰ SUY: shop thuộc nút nào thì lấy điểm tính giá vốn gần nhất phía trên. Engine giá vốn, lãi gộp,
--                               chuyển kho (cùng / khác đơn vị) đã gom theo cột này nên không phải sửa từng nơi.
-- Shop chưa gắn vào cây thì giữ đơn vị hạch toán khai tay như cũ.

ALTER TABLE org_units ADD COLUMN IF NOT EXISTS is_cost_center boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN org_units.is_cost_center IS 'Điểm tính giá vốn (0149): shop bên dưới gom chung một giá vốn bình quân tháng. Mặc định nút cấp 2.';
ALTER TABLE accounting_units ADD COLUMN IF NOT EXISTS org_unit_id bigint;
COMMENT ON COLUMN accounting_units.org_unit_id IS 'Nút cơ cấu sinh ra đơn vị này (điểm tính giá vốn, 0149); trống = khai tay.';

UPDATE org_units SET is_cost_center = true WHERE level = 2 AND NOT is_cost_center;

-- Điểm tính giá vốn gần nhất phía trên (kể cả chính nút).
CREATE OR REPLACE FUNCTION bizcity_cost_center_of(p_org bigint) RETURNS bigint LANGUAGE sql STABLE AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, is_cost_center, 0 AS d FROM org_units WHERE id = p_org
    UNION ALL
    SELECT o.id, o.parent_id, o.is_cost_center, up.d + 1 FROM org_units o JOIN up ON o.id = up.parent_id WHERE up.d < 30
  )
  SELECT id FROM up WHERE is_cost_center ORDER BY d LIMIT 1
$$;

-- Đơn vị hạch toán của một điểm tính giá vốn (tạo nếu chưa có).
CREATE OR REPLACE FUNCTION bizcity_cost_unit_for(p_tenant bigint, p_org bigint) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c bigint; u bigint; o record;
BEGIN
  c := bizcity_cost_center_of(p_org);
  IF c IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO u FROM accounting_units WHERE tenant_id = p_tenant AND org_unit_id = c;
  IF u IS NULL THEN
    SELECT code, name INTO o FROM org_units WHERE id = c;
    INSERT INTO accounting_units (tenant_id, code, name, org_unit_id) VALUES (p_tenant, o.code, o.name, c)
      ON CONFLICT (tenant_id, code) DO UPDATE SET org_unit_id = EXCLUDED.org_unit_id, name = EXCLUDED.name
      RETURNING id INTO u;
  END IF;
  RETURN u;
END $$;

-- Gắn lại đơn vị hạch toán cho mọi shop của một đơn vị theo cây (chỉ dòng đổi).
CREATE OR REPLACE FUNCTION bizcity_sync_cost_units(p_tenant bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE accounting_units a SET name = o.name FROM org_units o WHERE a.tenant_id = p_tenant AND o.id = a.org_unit_id AND a.name IS DISTINCT FROM o.name;
  WITH x AS (
    SELECT b.id, bizcity_cost_unit_for(b.tenant_id, b.org_unit_id) AS u FROM branches b
     WHERE b.tenant_id = p_tenant AND b.org_unit_id IS NOT NULL AND bizcity_cost_center_of(b.org_unit_id) IS NOT NULL
  )
  UPDATE branches b SET accounting_unit_id = x.u FROM x WHERE b.id = x.id AND b.accounting_unit_id IS DISTINCT FROM x.u;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Shop thêm / đổi nút trên cây: tự lấy đơn vị hạch toán theo điểm tính giá vốn.
CREATE OR REPLACE FUNCTION bizcity_branch_cost_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u bigint;
BEGIN
  IF NEW.org_unit_id IS NOT NULL THEN
    u := bizcity_cost_unit_for(NEW.tenant_id, NEW.org_unit_id);
    IF u IS NOT NULL THEN NEW.accounting_unit_id := u; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS branches_cost_unit ON branches;
CREATE TRIGGER branches_cost_unit BEFORE INSERT OR UPDATE OF org_unit_id, accounting_unit_id ON branches
  FOR EACH ROW EXECUTE FUNCTION bizcity_branch_cost_unit();

-- Cây đổi (dời nút, đổi điểm tính giá vốn, đổi tên): gắn lại cả đơn vị.
CREATE OR REPLACE FUNCTION bizcity_org_cost_units() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM bizcity_sync_cost_units(NEW.tenant_id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS org_units_cost_units ON org_units;
CREATE TRIGGER org_units_cost_units AFTER INSERT OR UPDATE OF parent_id, is_cost_center, name ON org_units
  FOR EACH ROW EXECUTE FUNCTION bizcity_org_cost_units();

SELECT bizcity_sync_cost_units(id) FROM tenants;
