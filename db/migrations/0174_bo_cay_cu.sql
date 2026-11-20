-- [2026-11-20 Nguyễn Văn Thủy] BỎ CÂY CŨ org_units: cơ cấu chỉ còn MỘT cây là bảng đơn vị branches (0173) (đóng góp)
--
-- Mọi thứ trước đọc org_units nay đọc thẳng branches (unit_parent_id / unit_path):
--   1 Giá vốn       điểm tính giá vốn = cờ branches.own_cost_center trên đơn vị bất kỳ; đơn vị lấy theo cấp gần nhất (gồm chính nó) có cờ.
--                   accounting_units gắn branch_id (id đơn vị hạch toán giữ nguyên → số giá vốn đã tính không đổi).
--   2 Mua hàng      kho tổng của nhóm = branches.purchase_branch_id (trước ở org_units).
--   3 Phân quyền    gán vai trò tại nút (scope_type org_unit) = tại một ĐƠN VỊ và cây con; scope_id = branches.id.
--   4 MST theo ngày đi theo cây đơn vị: phiên bản MST của nút cũ chuyển sang đơn vị; lịch sử cha theo ngày (link 'unit_parent').
--   5 Xoá org_units, branches.org_unit_id / org_mirror_id, accounting_units.org_unit_id, costing_runs.org_unit_id.
-- Không mất lịch sử: phiên bản MST / cha theo ngày được dịch sang id đơn vị trước khi xoá.


-- ═══ 0. BÙ ĐƠN VỊ CÒN THIẾU (nút cây cũ tạo sau 0173 chưa có đơn vị tương ứng) ═══════════════════════════════════════

INSERT INTO branches (tenant_id, code, name, tax_code, note, is_active, level_label, sort_order, org_mirror_id)
SELECT o.tenant_id,
       CASE WHEN EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = o.tenant_id AND lower(b.code) = lower(o.code)) THEN o.code || '-CC' ELSE o.code END,
       o.name, o.tax_id, o.note, o.is_active,
       CASE WHEN o.kind = 'company' OR o.parent_id IS NULL THEN 'Công ty' WHEN o.level = 1 THEN 'Miền' WHEN o.level = 2 THEN 'Chi nhánh' WHEN o.level = 3 THEN 'Tỉnh' ELSE '' END,
       o.sort_order, o.id
  FROM org_units o
 WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.org_mirror_id = o.id);
UPDATE branches b SET unit_parent_id = p.id
  FROM org_units o JOIN branches p ON p.org_mirror_id = o.parent_id
 WHERE b.org_mirror_id = o.id AND b.unit_parent_id IS NULL;
UPDATE branches b SET unit_parent_id = p.id
  FROM branches p
 WHERE b.org_mirror_id IS NULL AND b.org_unit_id IS NOT NULL AND p.org_mirror_id = b.org_unit_id AND b.unit_parent_id IS NULL;
UPDATE branches SET level_label = 'Cửa hàng' WHERE level_label = '' AND org_mirror_id IS NULL;
SELECT bizcity_unit_paths(id) FROM tenants;


-- ═══ 1. GIÁ VỐN ═══════════════════════════════════════════════════════════════════════════════════════════════════════

UPDATE branches b SET own_cost_center = true FROM org_units o WHERE b.org_mirror_id = o.id AND o.is_cost_center AND NOT b.own_cost_center;
UPDATE accounting_units a SET branch_id = b.id FROM branches b WHERE a.org_unit_id IS NOT NULL AND b.org_mirror_id = a.org_unit_id;
COMMENT ON COLUMN branches.own_cost_center IS 'Đơn vị là điểm tính giá vốn riêng (0151, 0174). Đơn vị không có cờ dùng điểm của cấp gần nhất phía trên.';
COMMENT ON COLUMN accounting_units.branch_id IS 'Đơn vị (branches) là điểm tính giá vốn của đơn vị hạch toán này (0174).';

-- Điểm tính giá vốn của một đơn vị: chính nó hoặc cấp gần nhất phía trên có own_cost_center.
DROP FUNCTION IF EXISTS bizcity_cost_center_of(bigint);
CREATE OR REPLACE FUNCTION bizcity_cost_center_of(p_branch bigint) RETURNS bigint LANGUAGE sql STABLE AS $$
  WITH RECURSIVE up AS (
    SELECT id, unit_parent_id, own_cost_center, 0 AS d FROM branches WHERE id = p_branch
    UNION ALL
    SELECT b.id, b.unit_parent_id, b.own_cost_center, up.d + 1 FROM branches b JOIN up ON b.id = up.unit_parent_id WHERE up.d < 40
  )
  SELECT id FROM up WHERE own_cost_center ORDER BY d LIMIT 1
$$;
COMMENT ON FUNCTION bizcity_cost_center_of(bigint) IS 'Đơn vị là điểm tính giá vốn của một đơn vị: chính nó hoặc cấp gần nhất có cờ (0174).';

-- Đơn vị hạch toán của một đơn vị (tạo khi điểm tính giá vốn chưa có).
DROP FUNCTION IF EXISTS bizcity_cost_unit_for(bigint, bigint);
CREATE OR REPLACE FUNCTION bizcity_cost_unit_of(p_tenant bigint, p_branch bigint) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c bigint; r record;
BEGIN
  c := bizcity_cost_center_of(p_branch);
  IF c IS NULL THEN RETURN NULL; END IF;
  SELECT code, name INTO r FROM branches WHERE id = c;
  RETURN bizcity_shop_unit(p_tenant, c, r.code, r.name);
END $$;
COMMENT ON FUNCTION bizcity_cost_unit_of(bigint, bigint) IS 'Đơn vị hạch toán (accounting_units) theo điểm tính giá vốn gần nhất của đơn vị (0174).';

CREATE OR REPLACE FUNCTION bizcity_shop_unit(p_tenant bigint, p_branch bigint, p_code text, p_name text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE u bigint;
BEGIN
  SELECT id INTO u FROM accounting_units WHERE tenant_id = p_tenant AND branch_id = p_branch;
  IF u IS NULL THEN
    INSERT INTO accounting_units (tenant_id, code, name, branch_id) VALUES (p_tenant, p_code, p_name, p_branch)
      ON CONFLICT (tenant_id, code) DO UPDATE SET branch_id = EXCLUDED.branch_id, name = EXCLUDED.name
      RETURNING id INTO u;
  END IF;
  RETURN u;
END $$;

-- Tính lại đơn vị hạch toán của mọi đơn vị trong tenant.
CREATE OR REPLACE FUNCTION bizcity_sync_cost_units(p_tenant bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE accounting_units a SET name = b.name FROM branches b WHERE a.tenant_id = p_tenant AND b.id = a.branch_id AND a.name IS DISTINCT FROM b.name;
  WITH x AS (SELECT b.id, bizcity_cost_unit_of(b.tenant_id, b.id) AS u FROM branches b WHERE b.tenant_id = p_tenant)
  UPDATE branches b SET accounting_unit_id = x.u FROM x WHERE b.id = x.id AND x.u IS NOT NULL AND b.accounting_unit_id IS DISTINCT FROM x.u;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Đặt điểm tính giá vốn: tại một đơn vị (node: bỏ cờ của các đơn vị con bên trong) hoặc riêng một cửa hàng (shop).
CREATE OR REPLACE FUNCTION bizcity_set_cost_scope(p_tenant bigint, p_kind text, p_code text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x bigint; v_code text;
BEGIN
  IF p_kind NOT IN ('node', 'shop') THEN RAISE EXCEPTION 'Phạm vi % không hợp lệ', p_kind; END IF;
  SELECT id INTO x FROM branches WHERE tenant_id = p_tenant AND code = p_code;
  IF x IS NULL THEN RAISE EXCEPTION 'Không có đơn vị %', p_code USING ERRCODE = 'no_data_found'; END IF;
  IF p_kind = 'node' THEN
    WITH RECURSIVE sub AS (SELECT id FROM branches WHERE id = x UNION ALL SELECT b.id FROM branches b JOIN sub ON b.unit_parent_id = sub.id)
    UPDATE branches SET own_cost_center = (id = x) WHERE id IN (SELECT id FROM sub) AND own_cost_center IS DISTINCT FROM (id = x);
  ELSE
    UPDATE branches SET own_cost_center = true WHERE id = x AND NOT own_cost_center;
  END IF;
  PERFORM bizcity_sync_cost_units(p_tenant);
  SELECT a.code INTO v_code FROM accounting_units a WHERE a.tenant_id = p_tenant AND a.branch_id = x;
  RETURN v_code;
END $$;

-- Trigger branches: đơn vị mới / đổi cha / đổi cờ → tự lấy đơn vị hạch toán.
CREATE OR REPLACE FUNCTION bizcity_branch_cost_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u bigint;
BEGIN
  IF NEW.own_cost_center THEN
    NEW.accounting_unit_id := bizcity_shop_unit(NEW.tenant_id, NEW.id, NEW.code, NEW.name);
  ELSIF NEW.unit_parent_id IS NOT NULL THEN
    u := bizcity_cost_unit_of(NEW.tenant_id, NEW.unit_parent_id);
    IF u IS NOT NULL THEN NEW.accounting_unit_id := u; END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t record;
BEGIN
  -- Trigger cũ theo dõi org_unit_id → theo dõi cha đơn vị.
  FOR t IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'branches'::regclass AND NOT tgisinternal
              AND tgfoid = 'bizcity_branch_cost_unit'::regproc LOOP
    EXECUTE format('DROP TRIGGER %I ON branches', t.tgname);
  END LOOP;
END $$;
CREATE TRIGGER branches_cost_unit BEFORE INSERT OR UPDATE OF unit_parent_id, own_cost_center, accounting_unit_id ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_branch_cost_unit();


-- ═══ 2. KHO TỔNG MUA HÀNG ═════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE branches ADD COLUMN IF NOT EXISTS purchase_branch_id bigint REFERENCES branches(id) ON DELETE SET NULL;
COMMENT ON COLUMN branches.purchase_branch_id IS 'Đơn vị nhóm là đơn vị mua hàng: kho tổng nhận hàng của nhóm (0174, tự tính: chi nhánh mã xx000 nhiều kho nhất trong nhóm).';
UPDATE branches b SET purchase_branch_id = o.purchase_branch_id FROM org_units o WHERE b.org_mirror_id = o.id AND b.purchase_branch_id IS DISTINCT FROM o.purchase_branch_id;


-- ═══ 3. PHÂN QUYỀN THEO ĐƠN VỊ (cây con) ══════════════════════════════════════════════════════════════════════════════

-- Bảng gán vai trò chỉ ghi thêm (ADR-0027): tạm tắt khoá chống sửa trong lúc đổi id nút → id đơn vị (cùng một nơi, không đổi phạm vi).
ALTER TABLE user_role_assignments DISABLE TRIGGER USER;
UPDATE user_role_assignments a SET scope_id = b.id FROM branches b WHERE a.scope_type = 'org_unit' AND b.org_mirror_id = a.scope_id;
ALTER TABLE user_role_assignments ENABLE TRIGGER USER;
COMMENT ON COLUMN user_role_assignments.scope_type IS 'tenant: cả đơn vị; branch / warehouse: tại một đơn vị / kho; org_unit: tại một đơn vị và mọi đơn vị con (0150, 0174).';
COMMENT ON COLUMN user_role_assignments.scope_id IS 'branches.id khi branch hoặc org_unit; warehouses.id khi warehouse; NULL khi tenant (0174).';

-- Đơn vị đổi chỗ trong cây → làm mới phạm vi đã nạp.
DROP TRIGGER IF EXISTS branches_org_unit_authz_version ON branches;
DROP TRIGGER IF EXISTS branches_unit_path_authz_version ON branches;
CREATE TRIGGER branches_unit_path_authz_version AFTER UPDATE OF unit_parent_id, unit_path ON branches
  FOR EACH ROW WHEN (OLD.unit_parent_id IS DISTINCT FROM NEW.unit_parent_id OR OLD.unit_path IS DISTINCT FROM NEW.unit_path) EXECUTE FUNCTION bizcity_bump_authz_version();

-- Chặn xoá / ngừng đơn vị còn lần gán vai trò theo đơn vị đang hiệu lực.
CREATE OR REPLACE FUNCTION bizcity_branches_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nguoi text;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.is_active AND NOT NEW.is_active) THEN RETURN NEW; END IF;
  SELECT string_agg(DISTINCT u.email, ', ') INTO nguoi
    FROM user_role_assignments a JOIN users u ON u.id = a.user_id AND u.tenant_id = a.tenant_id
   WHERE a.tenant_id = OLD.tenant_id AND a.scope_type = 'org_unit' AND a.scope_id = OLD.id AND a.revoked_at IS NULL
     AND (a.valid_to IS NULL OR a.valid_to >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  IF nguoi IS NOT NULL THEN
    RAISE EXCEPTION 'Đơn vị % đang có lần gán vai trò theo đơn vị còn hiệu lực (%): thu hồi lần gán ở HT12 trước khi xoá / ngừng dùng', OLD.code, nguoi;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS branches_assignment_guard ON branches;
CREATE TRIGGER branches_assignment_guard BEFORE DELETE OR UPDATE OF is_active ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_branches_assignment_guard();


-- ═══ 4. MST THEO NGÀY ĐI THEO CÂY ĐƠN VỊ ══════════════════════════════════════════════════════════════════════════════

-- Phiên bản MST của nút cũ → của đơn vị tương ứng (bỏ bản sao đơn vị tạo ở 0173 để giữ đúng lịch sử của nút).
DELETE FROM tax_id_versions v USING branches b, org_units o
 WHERE v.scope = 'branch' AND v.ref_id = b.id AND b.org_mirror_id = o.id
   AND EXISTS (SELECT 1 FROM tax_id_versions x WHERE x.scope = 'org_unit' AND x.ref_id = o.id);
INSERT INTO tax_id_versions (tenant_id, scope, ref_id, tax_id, valid_from, valid_to, changed_by, changed_at)
SELECT v.tenant_id, 'branch', b.id, v.tax_id, v.valid_from, v.valid_to, v.changed_by, v.changed_at
  FROM tax_id_versions v JOIN branches b ON b.org_mirror_id = v.ref_id
 WHERE v.scope = 'org_unit';
DELETE FROM tax_id_versions WHERE scope = 'org_unit';

-- Lịch sử cha theo ngày: nút cha cũ (org_parent) và nút gắn cửa hàng (branch_org) → cha đơn vị (unit_parent).
ALTER TABLE org_link_versions DROP CONSTRAINT IF EXISTS org_link_versions_scope_check;
ALTER TABLE org_link_versions ADD CONSTRAINT org_link_versions_scope_check CHECK (scope IN ('unit_parent', 'branch_parent', 'org_parent', 'branch_org'));
INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, valid_to, changed_by, changed_at)
SELECT v.tenant_id, 'unit_parent', b.id, p.id, v.valid_from, v.valid_to, v.changed_by, v.changed_at
  FROM org_link_versions v JOIN branches b ON b.org_mirror_id = v.ref_id LEFT JOIN branches p ON p.org_mirror_id = v.parent_id
 WHERE v.scope = 'org_parent';
INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, valid_to, changed_by, changed_at)
SELECT v.tenant_id, 'unit_parent', v.ref_id, p.id, v.valid_from, v.valid_to, v.changed_by, v.changed_at
  FROM org_link_versions v JOIN branches b ON b.id = v.ref_id AND b.org_mirror_id IS NULL LEFT JOIN branches p ON p.org_mirror_id = v.parent_id
 WHERE v.scope = 'branch_org';
-- Đơn vị chưa có lịch sử cha → một phiên bản từ đầu theo cha hiện tại.
INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, changed_by)
SELECT b.tenant_id, 'unit_parent', b.id, b.unit_parent_id, DATE '1900-01-01', 'hệ thống'
  FROM branches b
 WHERE NOT EXISTS (SELECT 1 FROM org_link_versions v WHERE v.scope = 'unit_parent' AND v.ref_id = b.id);
-- Phiên bản đang hiệu lực phải khớp cha hiện tại.
UPDATE org_link_versions v SET parent_id = b.unit_parent_id
  FROM branches b WHERE v.scope = 'unit_parent' AND v.ref_id = b.id AND v.valid_to IS NULL AND v.parent_id IS DISTINCT FROM b.unit_parent_id;
DELETE FROM org_link_versions WHERE scope IN ('org_parent', 'branch_org');
ALTER TABLE org_link_versions DROP CONSTRAINT org_link_versions_scope_check;
ALTER TABLE org_link_versions ADD CONSTRAINT org_link_versions_scope_check CHECK (scope IN ('unit_parent', 'branch_parent'));
COMMENT ON TABLE org_link_versions IS 'Phiên bản liên kết theo ngày hiệu lực: unit_parent = đơn vị cha (0174), branch_parent = kho tổng mua hàng.';

-- Ghi phiên bản khi đổi MST / đổi cha đơn vị / đổi kho tổng.
CREATE OR REPLACE FUNCTION bizcity_versions_branch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_from date := CASE WHEN TG_OP = 'INSERT' THEN DATE '1900-01-01' ELSE bizcity_valid_from() END;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.tax_code IS DISTINCT FROM OLD.tax_code THEN
    PERFORM bizcity_put_tax_version(NEW.tenant_id, 'branch', NEW.id, CASE WHEN bizcity_is_mst(NEW.tax_code) THEN NEW.tax_code ELSE '' END, v_from);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.unit_parent_id IS DISTINCT FROM OLD.unit_parent_id THEN
    PERFORM bizcity_put_link_version(NEW.tenant_id, 'unit_parent', NEW.id, NEW.unit_parent_id, v_from);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    PERFORM bizcity_put_link_version(NEW.tenant_id, 'branch_parent', NEW.id, NEW.parent_id, v_from);
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'branches'::regclass AND NOT tgisinternal AND tgfoid = 'bizcity_versions_branch'::regproc LOOP
    EXECUTE format('DROP TRIGGER %I ON branches', t.tgname);
  END LOOP;
END $$;
CREATE TRIGGER branches_versions AFTER INSERT OR UPDATE OF tax_code, unit_parent_id, parent_id ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_versions_branch();

-- MST tại một ngày: phân kho → đơn vị → kho tổng mua hàng → cha đơn vị (theo ngày) → … → MST công ty.
CREATE OR REPLACE FUNCTION bizcity_tax_id_at(p_tenant bigint, p_branch bigint, p_wh bigint, p_day date) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE v text; b bigint := p_branch; u bigint; n int := 0;
BEGIN
  IF p_wh IS NOT NULL THEN
    v := bizcity_tax_ver_at(p_tenant, 'warehouse', p_wh, p_day);
    IF bizcity_is_mst(v) THEN RETURN btrim(v); END IF;
  END IF;
  -- Đơn vị và chuỗi kho tổng mua hàng của nó (như trước).
  WHILE b IS NOT NULL AND n < 30 LOOP
    v := bizcity_tax_ver_at(p_tenant, 'branch', b, p_day);
    IF bizcity_is_mst(v) THEN RETURN btrim(v); END IF;
    b := bizcity_link_at(p_tenant, 'branch_parent', b, p_day);
    n := n + 1;
  END LOOP;
  -- Lên cây đơn vị theo cha tại ngày đó.
  u := bizcity_link_at(p_tenant, 'unit_parent', p_branch, p_day);
  n := 0;
  WHILE u IS NOT NULL AND n < 40 LOOP
    v := bizcity_tax_ver_at(p_tenant, 'branch', u, p_day);
    IF bizcity_is_mst(v) THEN RETURN btrim(v); END IF;
    u := bizcity_link_at(p_tenant, 'unit_parent', u, p_day);
    n := n + 1;
  END LOOP;
  SELECT btrim(t.tax_code) INTO v FROM tenants t WHERE t.id = p_tenant AND bizcity_is_mst(t.tax_code);
  RETURN coalesce(v, '');
END $$;
COMMENT ON FUNCTION bizcity_tax_id_at(bigint, bigint, bigint, date) IS 'MST tại ngày: phân kho → đơn vị → kho tổng → cha đơn vị theo ngày → công ty (0121, 0174).';


-- ═══ 5. XOÁ CÂY CŨ ════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE costing_runs DROP COLUMN IF EXISTS org_unit_id;
COMMENT ON COLUMN costing_runs.org_uid IS 'Định danh đơn vị (cn_…) là điểm tính giá vốn của lượt tính (0174).';
UPDATE costing_runs r SET org_uid = b.uid FROM org_units o JOIN branches b ON b.org_mirror_id = o.id WHERE r.org_uid = o.uid;
ALTER TABLE accounting_units DROP COLUMN IF EXISTS org_unit_id;
ALTER TABLE branches DROP COLUMN IF EXISTS org_unit_id;
ALTER TABLE branches DROP COLUMN IF EXISTS org_mirror_id;
DROP TABLE IF EXISTS org_units CASCADE;
DROP FUNCTION IF EXISTS bizcity_versions_org_unit();
DROP FUNCTION IF EXISTS bizcity_org_units_assignment_guard();
DROP FUNCTION IF EXISTS bizcity_org_cost_units();
