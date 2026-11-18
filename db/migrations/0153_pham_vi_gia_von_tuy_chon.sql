-- [2026-11-17 Nguyễn Văn Thủy] Phạm vi tính giá vốn chọn tuỳ ý trên cây cơ cấu: nút bất kỳ (miền, chi nhánh, tỉnh) hoặc một shop riêng (đóng góp)
--
-- Mỗi shop trong một tháng chỉ có MỘT giá vốn (để ghi phiếu giá vốn) → các phạm vi là một phân hoạch:
--   - Chọn nút X: X là điểm tính giá vốn, mọi điểm tính giá vốn / shop tính riêng NẰM DƯỚI X bỏ → shop dưới X chung một giá.
--   - Chọn shop: shop tính riêng (branches.own_cost_center), đơn vị hạch toán mã = mã shop (accounting_units.branch_id).
-- bizcity_set_cost_scope(tenant, 'node' | 'shop', mã) đặt phạm vi rồi gắn lại đơn vị hạch toán, trả mã đơn vị.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS own_cost_center boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN branches.own_cost_center IS 'Shop tính giá vốn riêng (0151), không gom theo nút cơ cấu phía trên.';
ALTER TABLE accounting_units ADD COLUMN IF NOT EXISTS branch_id bigint;
COMMENT ON COLUMN accounting_units.branch_id IS 'Shop tính giá vốn riêng sinh ra đơn vị này (0151).';

-- Đơn vị hạch toán của shop tính riêng (tạo nếu chưa có).
CREATE OR REPLACE FUNCTION bizcity_shop_unit(p_tenant bigint, p_branch bigint, p_code text, p_name text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE u bigint;
BEGIN
  SELECT id INTO u FROM accounting_units WHERE tenant_id = p_tenant AND branch_id = p_branch;
  IF u IS NULL THEN
    INSERT INTO accounting_units (tenant_id, code, name, branch_id) VALUES (p_tenant, p_code, p_name, p_branch)
      ON CONFLICT (tenant_id, code) DO UPDATE SET branch_id = EXCLUDED.branch_id, org_unit_id = NULL, name = EXCLUDED.name
      RETURNING id INTO u;
  END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION bizcity_branch_cost_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u bigint;
BEGIN
  IF NEW.own_cost_center THEN
    NEW.accounting_unit_id := bizcity_shop_unit(NEW.tenant_id, NEW.id, NEW.code, NEW.name);
  ELSIF NEW.org_unit_id IS NOT NULL THEN
    u := bizcity_cost_unit_for(NEW.tenant_id, NEW.org_unit_id);
    IF u IS NOT NULL THEN NEW.accounting_unit_id := u; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS branches_cost_unit ON branches;
CREATE TRIGGER branches_cost_unit BEFORE INSERT OR UPDATE OF org_unit_id, accounting_unit_id, own_cost_center ON branches
  FOR EACH ROW EXECUTE FUNCTION bizcity_branch_cost_unit();

CREATE OR REPLACE FUNCTION bizcity_sync_cost_units(p_tenant bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE accounting_units a SET name = o.name FROM org_units o WHERE a.tenant_id = p_tenant AND o.id = a.org_unit_id AND a.name IS DISTINCT FROM o.name;
  WITH x AS (
    SELECT b.id, CASE WHEN b.own_cost_center THEN bizcity_shop_unit(b.tenant_id, b.id, b.code, b.name)
                      ELSE bizcity_cost_unit_for(b.tenant_id, b.org_unit_id) END AS u
      FROM branches b
     WHERE b.tenant_id = p_tenant AND (b.own_cost_center OR (b.org_unit_id IS NOT NULL AND bizcity_cost_center_of(b.org_unit_id) IS NOT NULL))
  )
  UPDATE branches b SET accounting_unit_id = x.u FROM x WHERE b.id = x.id AND b.accounting_unit_id IS DISTINCT FROM x.u;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Đặt phạm vi tính giá vốn: 'node' (mã nút cơ cấu) hoặc 'shop' (mã chi nhánh / shop). Trả mã đơn vị hạch toán của phạm vi.
CREATE OR REPLACE FUNCTION bizcity_set_cost_scope(p_tenant bigint, p_kind text, p_code text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x bigint; b record; v_code text;
BEGIN
  IF p_kind = 'node' THEN
    SELECT o.id INTO x FROM org_units o WHERE o.tenant_id = p_tenant AND o.code = p_code;
    IF x IS NULL THEN RAISE EXCEPTION 'Không có nút cơ cấu %', p_code USING ERRCODE = 'no_data_found'; END IF;
    WITH RECURSIVE sub AS (SELECT id FROM org_units WHERE id = x UNION ALL SELECT o.id FROM org_units o JOIN sub ON o.parent_id = sub.id)
    UPDATE org_units SET is_cost_center = (id = x) WHERE id IN (SELECT id FROM sub) AND is_cost_center IS DISTINCT FROM (id = x);
    WITH RECURSIVE sub AS (SELECT id FROM org_units WHERE id = x UNION ALL SELECT o.id FROM org_units o JOIN sub ON o.parent_id = sub.id)
    UPDATE branches SET own_cost_center = false WHERE tenant_id = p_tenant AND own_cost_center AND org_unit_id IN (SELECT id FROM sub);
    PERFORM bizcity_sync_cost_units(p_tenant);
    SELECT a.code INTO v_code FROM accounting_units a WHERE a.tenant_id = p_tenant AND a.org_unit_id = x;
  ELSIF p_kind = 'shop' THEN
    SELECT br.id, br.code, br.name INTO b FROM branches br WHERE br.tenant_id = p_tenant AND br.code = p_code;
    IF b.id IS NULL THEN RAISE EXCEPTION 'Không có shop %', p_code USING ERRCODE = 'no_data_found'; END IF;
    UPDATE branches SET own_cost_center = true WHERE id = b.id AND NOT own_cost_center;
    PERFORM bizcity_sync_cost_units(p_tenant);
    SELECT a.code INTO v_code FROM accounting_units a WHERE a.tenant_id = p_tenant AND a.branch_id = b.id;
  ELSE
    RAISE EXCEPTION 'Phạm vi % không hợp lệ', p_kind;
  END IF;
  RETURN v_code;
END $$;
