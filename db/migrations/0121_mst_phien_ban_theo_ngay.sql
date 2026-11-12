-- [2026-11-13 Nguyễn Văn Thủy] mọi dòng ở đơn vị nhỏ nhất + MST theo phiên bản ngày hiệu lực (đóng góp)
-- =============================================================================
-- 0121 Dòng nhỏ nhất · MST & cơ cấu có phiên bản theo ngày.
--
-- Nguyên tắc: mỗi dòng sổ cái / phiếu kho mang đủ tọa độ nhỏ nhất — chi nhánh (shop), PHÂN KHO (định danh kho bất biến
-- kho_… + mã kho chụp), MST. Cơ cấu tổ chức / cơ cấu thuế chỉ là cây để gom; đổi cây không phải sửa dữ liệu.
--
-- 1. Phiên bản MST (tax_id_versions): MST đặt ở kho / chi nhánh / nút cơ cấu, mỗi lần đổi là một phiên bản "hiệu lực từ ngày".
--    Thường đặt ở TỈNH (chi nhánh pháp lý / nút cơ cấu tỉnh); shop là địa điểm kinh doanh, không MST riêng → theo tỉnh.
-- 2. Phiên bản cơ cấu (org_link_versions): shop thuộc nút nào (branch_org), shop thuộc chi nhánh cha nào (branch_parent),
--    nút thuộc nút cha nào (org_parent) — mỗi lần đổi một phiên bản "từ ngày".
-- 3. MST của một dòng = tra theo NGÀY CHỨNG TỪ (posting_date / doc_date), cấp gần nhất thắng:
--    kho → chi nhánh → chi nhánh cha … → nút cơ cấu của chi nhánh → nút cha … → công ty.
--    Phiếu nhập lùi ngày sau khi đã đổi MST vẫn lấy MST đúng tại ngày đó.
-- 4. Giá trị được chụp vào dòng lúc ghi: thống kê theo shop ra mọi dòng (MST cũ lẫn mới); theo MST ra đúng dòng của MST đó;
--    mang sang hệ thống khác dòng vẫn tự đủ.
-- 5. Ghi phiên bản: tự động khi đổi tax_id / tax_code / org_unit_id / parent_id. Ngày hiệu lực lấy từ biến phiên
--    ketoan.valid_from (màn hình gửi lên), mặc định hôm nay; không cho ngày sớm hơn phiên bản đang có (trừ cùng ngày = sửa).
-- 6. Dòng sổ cái vẫn chỉ thêm; ngoại lệ: điền branch_uid / warehouse_uid / warehouse_code / tax_id còn trống. Không đổi số tiền.
-- 7. Định danh bất biến có tiền tố (như item_id của mặt hàng, mang sang hệ thống khác vẫn đúng): kho_<ULID>, cn_<ULID> (chi nhánh /
--    shop), cc_<ULID> (nút cơ cấu). Không sửa được. Dòng sổ / phiếu kho lưu cn_ và kho_ (kèm mã kho chụp lúc ghi).
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_is_mst(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(btrim(p), '') ~ '^[0-9]{10}(-[0-9]{3})?$'
$$;
COMMENT ON FUNCTION bizcity_is_mst(text) IS 'Đúng dạng MST: 10 số hoặc 10 số-3 số (0121).';

-- ── 0. Định danh bất biến có tiền tố ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE warehouses ADD COLUMN uid text;
ALTER TABLE branches ADD COLUMN uid text;
ALTER TABLE org_units ADD COLUMN uid text;
UPDATE warehouses SET uid = 'kho_' || bizcity_ulid() WHERE uid IS NULL;
UPDATE branches SET uid = 'cn_' || bizcity_ulid() WHERE uid IS NULL;
UPDATE org_units SET uid = 'cc_' || bizcity_ulid() WHERE uid IS NULL;
ALTER TABLE warehouses ALTER COLUMN uid SET DEFAULT 'kho_' || bizcity_ulid(), ALTER COLUMN uid SET NOT NULL;
ALTER TABLE branches ALTER COLUMN uid SET DEFAULT 'cn_' || bizcity_ulid(), ALTER COLUMN uid SET NOT NULL;
ALTER TABLE org_units ALTER COLUMN uid SET DEFAULT 'cc_' || bizcity_ulid(), ALTER COLUMN uid SET NOT NULL;
CREATE UNIQUE INDEX warehouses_uid ON warehouses (uid);
CREATE UNIQUE INDEX branches_uid ON branches (uid);
CREATE UNIQUE INDEX org_units_uid ON org_units (uid);
COMMENT ON COLUMN warehouses.uid IS 'Định danh bất biến của kho: kho_<ULID> (0121).';
COMMENT ON COLUMN branches.uid IS 'Định danh bất biến của chi nhánh / shop: cn_<ULID> (0121).';
COMMENT ON COLUMN org_units.uid IS 'Định danh bất biến của nút cơ cấu: cc_<ULID> (0121).';
CREATE OR REPLACE FUNCTION bizcity_uid_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.uid IS DISTINCT FROM OLD.uid THEN
    RAISE EXCEPTION 'Định danh % là bất biến, không sửa được', OLD.uid USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER warehouses_uid_guard BEFORE UPDATE OF uid ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_uid_guard();
CREATE TRIGGER branches_uid_guard BEFORE UPDATE OF uid ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_uid_guard();
CREATE TRIGGER org_units_uid_guard BEFORE UPDATE OF uid ON org_units FOR EACH ROW EXECUTE FUNCTION bizcity_uid_guard();

ALTER TABLE warehouses ADD COLUMN tax_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN warehouses.tax_id IS 'MST kê khai riêng của kho, hiện hành (0121); thường trống = theo chi nhánh / tỉnh. Lịch sử: tax_id_versions.';
ALTER TABLE org_units ADD COLUMN tax_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN org_units.tax_id IS 'MST kê khai đặt ở nút cơ cấu (vd tỉnh), hiện hành (0121). Lịch sử: tax_id_versions.';

-- ── 1. Phiên bản MST ───────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE tax_id_versions (
  id bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('warehouse', 'branch', 'org_unit')),
  ref_id bigint NOT NULL,
  tax_id text NOT NULL DEFAULT '',
  valid_from date NOT NULL,
  valid_to date,
  changed_by text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope, ref_id, valid_from)
);
CREATE INDEX tax_id_versions_at ON tax_id_versions (tenant_id, scope, ref_id, valid_from DESC);
COMMENT ON TABLE tax_id_versions IS 'Phiên bản MST theo ngày hiệu lực của kho / chi nhánh / nút cơ cấu (0121). valid_to loại trừ (ngày bắt đầu phiên bản sau).';

-- ── 2. Phiên bản cơ cấu ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE org_link_versions (
  id bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('branch_org', 'branch_parent', 'org_parent')),
  ref_id bigint NOT NULL,
  parent_id bigint,
  valid_from date NOT NULL,
  valid_to date,
  changed_by text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope, ref_id, valid_from)
);
CREATE INDEX org_link_versions_at ON org_link_versions (tenant_id, scope, ref_id, valid_from DESC);
COMMENT ON TABLE org_link_versions IS 'Phiên bản cơ cấu (0121): branch_org = chi nhánh → nút; branch_parent = chi nhánh → chi nhánh cha; org_parent = nút → nút cha.';

DO $$ BEGIN
  EXECUTE 'ALTER TABLE tax_id_versions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE tax_id_versions FORCE ROW LEVEL SECURITY';
  EXECUTE 'CREATE POLICY tenant_isolation ON tax_id_versions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id))';
  EXECUTE 'ALTER TABLE org_link_versions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE org_link_versions FORCE ROW LEVEL SECURITY';
  EXECUTE 'CREATE POLICY tenant_isolation ON org_link_versions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id))';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON tax_id_versions, org_link_versions TO ketoan_app;
    GRANT USAGE ON SEQUENCE tax_id_versions_id_seq, org_link_versions_id_seq TO ketoan_app;
  END IF;
END $$;

-- Ngày hiệu lực của lần đổi đang ghi: biến phiên ketoan.valid_from (YYYY-MM-DD), mặc định hôm nay.
CREATE OR REPLACE FUNCTION bizcity_valid_from() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('ketoan.valid_from', true), '')::date, current_date)
$$;
CREATE OR REPLACE FUNCTION bizcity_actor_name() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('ketoan.actor_name', true), ''), '')
$$;

-- Ghi một phiên bản MST: đóng phiên bản đang mở, không cho ngày sớm hơn phiên bản đang có (cùng ngày = sửa).
CREATE OR REPLACE FUNCTION bizcity_put_tax_version(p_tenant bigint, p_scope text, p_ref bigint, p_tax text, p_from date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_last date;
BEGIN
  SELECT max(valid_from) INTO v_last FROM tax_id_versions WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref;
  IF v_last IS NOT NULL AND p_from < v_last THEN
    RAISE EXCEPTION 'Ngày hiệu lực MST (%) phải từ ngày phiên bản gần nhất (%) trở đi', to_char(p_from, 'DD/MM/YYYY'), to_char(v_last, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_last = p_from THEN
    UPDATE tax_id_versions SET tax_id = btrim(coalesce(p_tax, '')), changed_by = bizcity_actor_name(), changed_at = now()
     WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref AND valid_from = p_from;
  ELSE
    UPDATE tax_id_versions SET valid_to = p_from WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref AND valid_to IS NULL;
    INSERT INTO tax_id_versions (tenant_id, scope, ref_id, tax_id, valid_from, changed_by)
    VALUES (p_tenant, p_scope, p_ref, btrim(coalesce(p_tax, '')), p_from, bizcity_actor_name());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION bizcity_put_link_version(p_tenant bigint, p_scope text, p_ref bigint, p_parent bigint, p_from date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_last date;
BEGIN
  SELECT max(valid_from) INTO v_last FROM org_link_versions WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref;
  IF v_last IS NOT NULL AND p_from < v_last THEN
    RAISE EXCEPTION 'Ngày hiệu lực cơ cấu (%) phải từ ngày phiên bản gần nhất (%) trở đi', to_char(p_from, 'DD/MM/YYYY'), to_char(v_last, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_last = p_from THEN
    UPDATE org_link_versions SET parent_id = p_parent, changed_by = bizcity_actor_name(), changed_at = now()
     WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref AND valid_from = p_from;
  ELSE
    UPDATE org_link_versions SET valid_to = p_from WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref AND valid_to IS NULL;
    INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, changed_by)
    VALUES (p_tenant, p_scope, p_ref, p_parent, p_from, bizcity_actor_name());
  END IF;
END $$;

-- Tự ghi phiên bản khi đổi trên danh mục.
CREATE OR REPLACE FUNCTION bizcity_versions_warehouse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.tax_id IS DISTINCT FROM OLD.tax_id THEN
    PERFORM bizcity_put_tax_version(NEW.tenant_id, 'warehouse', NEW.id, NEW.tax_id, CASE WHEN TG_OP = 'INSERT' THEN DATE '1900-01-01' ELSE bizcity_valid_from() END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER warehouses_versions AFTER INSERT OR UPDATE OF tax_id ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_versions_warehouse();

CREATE OR REPLACE FUNCTION bizcity_versions_branch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_from date := CASE WHEN TG_OP = 'INSERT' THEN DATE '1900-01-01' ELSE bizcity_valid_from() END;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.tax_code IS DISTINCT FROM OLD.tax_code THEN
    PERFORM bizcity_put_tax_version(NEW.tenant_id, 'branch', NEW.id, CASE WHEN bizcity_is_mst(NEW.tax_code) THEN NEW.tax_code ELSE '' END, v_from);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id THEN
    PERFORM bizcity_put_link_version(NEW.tenant_id, 'branch_org', NEW.id, NEW.org_unit_id, v_from);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    PERFORM bizcity_put_link_version(NEW.tenant_id, 'branch_parent', NEW.id, NEW.parent_id, v_from);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER branches_versions AFTER INSERT OR UPDATE OF tax_code, org_unit_id, parent_id ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_versions_branch();

CREATE OR REPLACE FUNCTION bizcity_versions_org_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_from date := CASE WHEN TG_OP = 'INSERT' THEN DATE '1900-01-01' ELSE bizcity_valid_from() END;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.tax_id IS DISTINCT FROM OLD.tax_id THEN
    PERFORM bizcity_put_tax_version(NEW.tenant_id, 'org_unit', NEW.id, NEW.tax_id, v_from);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    PERFORM bizcity_put_link_version(NEW.tenant_id, 'org_parent', NEW.id, NEW.parent_id, v_from);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER org_units_versions AFTER INSERT OR UPDATE OF tax_id, parent_id ON org_units FOR EACH ROW EXECUTE FUNCTION bizcity_versions_org_unit();

-- Phiên bản gốc (từ 01/01/1900) cho dữ liệu đang có.
INSERT INTO tax_id_versions (tenant_id, scope, ref_id, tax_id, valid_from, changed_by)
SELECT tenant_id, 'warehouse', id, tax_id, DATE '1900-01-01', 'Khởi tạo (0121)' FROM warehouses;
INSERT INTO tax_id_versions (tenant_id, scope, ref_id, tax_id, valid_from, changed_by)
SELECT tenant_id, 'branch', id, CASE WHEN bizcity_is_mst(tax_code) THEN btrim(tax_code) ELSE '' END, DATE '1900-01-01', 'Khởi tạo (0121)' FROM branches;
INSERT INTO tax_id_versions (tenant_id, scope, ref_id, tax_id, valid_from, changed_by)
SELECT tenant_id, 'org_unit', id, tax_id, DATE '1900-01-01', 'Khởi tạo (0121)' FROM org_units;
INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, changed_by)
SELECT tenant_id, 'branch_org', id, org_unit_id, DATE '1900-01-01', 'Khởi tạo (0121)' FROM branches;
INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, changed_by)
SELECT tenant_id, 'branch_parent', id, parent_id, DATE '1900-01-01', 'Khởi tạo (0121)' FROM branches;
INSERT INTO org_link_versions (tenant_id, scope, ref_id, parent_id, valid_from, changed_by)
SELECT tenant_id, 'org_parent', id, parent_id, DATE '1900-01-01', 'Khởi tạo (0121)' FROM org_units;

-- ── 3. Tra cứu theo ngày ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_tax_ver_at(p_tenant bigint, p_scope text, p_ref bigint, p_day date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT tax_id FROM tax_id_versions
   WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref AND valid_from <= p_day AND (valid_to IS NULL OR p_day < valid_to)
   ORDER BY valid_from DESC LIMIT 1
$$;
CREATE OR REPLACE FUNCTION bizcity_link_at(p_tenant bigint, p_scope text, p_ref bigint, p_day date) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT parent_id FROM org_link_versions
   WHERE tenant_id = p_tenant AND scope = p_scope AND ref_id = p_ref AND valid_from <= p_day AND (valid_to IS NULL OR p_day < valid_to)
   ORDER BY valid_from DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION bizcity_default_warehouse_id(p_tenant bigint, p_branch bigint) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT id FROM warehouses WHERE tenant_id = p_tenant AND branch_id = p_branch
   ORDER BY is_default DESC, is_active DESC, code LIMIT 1
$$;
COMMENT ON FUNCTION bizcity_default_warehouse_id(bigint, bigint) IS 'Kho mặc định của chi nhánh (0121).';

-- MST tại ngày: kho → chi nhánh → chi nhánh cha … → nút cơ cấu → nút cha … → công ty. Cấp gần nhất có MST đúng dạng thắng.
CREATE OR REPLACE FUNCTION bizcity_tax_id_at(p_tenant bigint, p_branch bigint, p_wh bigint, p_day date) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v text;
  b bigint := p_branch;
  o bigint;
  n int := 0;
BEGIN
  IF p_wh IS NOT NULL THEN
    v := bizcity_tax_ver_at(p_tenant, 'warehouse', p_wh, p_day);
    IF bizcity_is_mst(v) THEN RETURN btrim(v); END IF;
  END IF;
  WHILE b IS NOT NULL AND n < 30 LOOP
    v := bizcity_tax_ver_at(p_tenant, 'branch', b, p_day);
    IF bizcity_is_mst(v) THEN RETURN btrim(v); END IF;
    IF o IS NULL THEN o := bizcity_link_at(p_tenant, 'branch_org', b, p_day); END IF;
    b := bizcity_link_at(p_tenant, 'branch_parent', b, p_day);
    n := n + 1;
  END LOOP;
  n := 0;
  WHILE o IS NOT NULL AND n < 30 LOOP
    v := bizcity_tax_ver_at(p_tenant, 'org_unit', o, p_day);
    IF bizcity_is_mst(v) THEN RETURN btrim(v); END IF;
    o := bizcity_link_at(p_tenant, 'org_parent', o, p_day);
    n := n + 1;
  END LOOP;
  SELECT btrim(t.tax_code) INTO v FROM tenants t WHERE t.id = p_tenant AND bizcity_is_mst(t.tax_code);
  RETURN coalesce(v, '');
END $$;
COMMENT ON FUNCTION bizcity_tax_id_at(bigint, bigint, bigint, date) IS 'MST của dòng tại ngày chứng từ (0121): kho → chi nhánh → chi nhánh cha → nút cơ cấu → nút cha → công ty.';

-- ── 4. Cột trên dòng ──────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE ledger_lines ADD COLUMN branch_uid text;
ALTER TABLE ledger_lines ADD COLUMN warehouse_uid text;
ALTER TABLE ledger_lines ADD COLUMN warehouse_code text;
ALTER TABLE ledger_lines ADD COLUMN tax_id text;
ALTER TABLE inventory_movements ADD COLUMN branch_uid text;
ALTER TABLE inventory_movements ADD COLUMN warehouse_uid text;
ALTER TABLE inventory_movements ADD COLUMN tax_id text;
COMMENT ON COLUMN ledger_lines.branch_uid IS 'Định danh bất biến chi nhánh / shop cn_… (0121).';
COMMENT ON COLUMN ledger_lines.warehouse_uid IS 'Định danh bất biến kho kho_… (0121); không chọn kho = kho mặc định của chi nhánh.';
COMMENT ON COLUMN ledger_lines.warehouse_code IS 'Mã kho chụp lúc ghi (0121).';
COMMENT ON COLUMN ledger_lines.tax_id IS 'MST tại ngày hạch toán, chụp lúc ghi (0121).';
COMMENT ON COLUMN inventory_movements.branch_uid IS 'Định danh bất biến chi nhánh / shop cn_… (0121).';
COMMENT ON COLUMN inventory_movements.warehouse_uid IS 'Định danh bất biến kho kho_… (0121).';
COMMENT ON COLUMN inventory_movements.tax_id IS 'MST tại ngày chứng từ, chụp lúc ghi (0121).';

CREATE OR REPLACE FUNCTION bizcity_fill_wh_tax() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_code text := nullif(btrim(coalesce(NEW.warehouse_code, '')), '');
  v_wid bigint;
  v_day date;
BEGIN
  IF v_code IS NULL AND TG_TABLE_NAME = 'ledger_lines' THEN
    v_code := nullif(btrim(coalesce(to_jsonb(NEW) -> 'dims' ->> 'warehouse', '')), '');
  END IF;
  IF NEW.warehouse_uid IS NOT NULL THEN
    SELECT id, coalesce(v_code, code) INTO v_wid, v_code FROM warehouses WHERE uid = NEW.warehouse_uid;
  ELSIF v_code IS NOT NULL THEN
    SELECT id INTO v_wid FROM warehouses WHERE tenant_id = NEW.tenant_id AND code = v_code LIMIT 1;
  END IF;
  IF v_wid IS NULL AND NEW.branch_id IS NOT NULL THEN
    v_wid := bizcity_default_warehouse_id(NEW.tenant_id, NEW.branch_id);
    SELECT code INTO v_code FROM warehouses WHERE id = v_wid;
  END IF;
  IF NEW.warehouse_uid IS NULL AND v_wid IS NOT NULL THEN
    SELECT uid INTO NEW.warehouse_uid FROM warehouses WHERE id = v_wid;
  END IF;
  NEW.warehouse_code := coalesce(v_code, '');
  IF NEW.branch_uid IS NULL AND NEW.branch_id IS NOT NULL THEN
    SELECT uid INTO NEW.branch_uid FROM branches WHERE id = NEW.branch_id;
  END IF;
  v_day := CASE WHEN TG_TABLE_NAME = 'ledger_lines' THEN (to_jsonb(NEW) ->> 'posting_date')::date ELSE (to_jsonb(NEW) ->> 'doc_date')::date END;
  IF coalesce(NEW.tax_id, '') = '' THEN
    NEW.tax_id := bizcity_tax_id_at(NEW.tenant_id, NEW.branch_id, v_wid, coalesce(v_day, current_date));
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_fill_wh_tax() IS 'Điền kho (mặc định nếu thiếu) + chụp MST tại ngày chứng từ khi ghi dòng (0121).';
CREATE TRIGGER ledger_lines_wh_tax BEFORE INSERT ON ledger_lines FOR EACH ROW EXECUTE FUNCTION bizcity_fill_wh_tax();
CREATE TRIGGER inventory_movements_wh_tax BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION bizcity_fill_wh_tax();

-- ── 5. Sổ cái chỉ thêm; ngoại lệ: điền kho / MST còn trống ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_ledger_line_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 0066 (B2b): gắn định danh mặt hàng cho dòng đã ghi — chỉ từ NULL → có giá trị, mọi cột khác giữ nguyên.
  IF TG_OP = 'UPDATE' AND OLD.item_id IS NULL AND NEW.item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') THEN
    RETURN NEW;
  END IF;
  -- 0121: điền kho / MST còn trống — mọi cột khác giữ nguyên, giá trị đã có không đổi.
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'branch_uid' - 'warehouse_uid' - 'warehouse_code' - 'tax_id') = (to_jsonb(OLD) - 'branch_uid' - 'warehouse_uid' - 'warehouse_code' - 'tax_id')
     AND (OLD.branch_uid IS NULL OR NEW.branch_uid IS NOT DISTINCT FROM OLD.branch_uid)
     AND (OLD.warehouse_uid IS NULL OR NEW.warehouse_uid IS NOT DISTINCT FROM OLD.warehouse_uid)
     AND (coalesce(OLD.warehouse_code, '') = '' OR NEW.warehouse_code IS NOT DISTINCT FROM OLD.warehouse_code)
     AND (coalesce(OLD.tax_id, '') = '' OR NEW.tax_id IS NOT DISTINCT FROM OLD.tax_id) THEN
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
     AND NEW.branch_uid IS NOT DISTINCT FROM OLD.branch_uid AND NEW.warehouse_uid IS NOT DISTINCT FROM OLD.warehouse_uid
     AND NEW.warehouse_code IS NOT DISTINCT FROM OLD.warehouse_code
     AND NEW.tax_id IS NOT DISTINCT FROM OLD.tax_id
     AND NEW.debit >= 0 AND NEW.credit >= 0
     AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e.id = OLD.entry_id AND e.status = 'posted' AND NOT e.is_reversal)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- ── 6. Điền dòng còn trống (chạy lại được sau khi bổ sung kho / MST) ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_fill_missing_wh_tax() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n1 int; n2 int;
BEGIN
  -- Theo lô (sổ lớn vẫn nhanh): kho mặc định tính một lần / chi nhánh; MST tính một lần / (chi nhánh, kho, ngày).
  CREATE TEMP TABLE _fw_dw ON COMMIT DROP AS
    SELECT DISTINCT ON (tenant_id, branch_id) tenant_id, branch_id, id, uid, code
      FROM warehouses ORDER BY tenant_id, branch_id, is_default DESC, is_active DESC, code;
  CREATE INDEX ON _fw_dw (tenant_id, branch_id);

  -- Sổ cái: dòng còn thiếu → kho theo mã ghi trong dims, không thì kho mặc định của chi nhánh
  CREATE TEMP TABLE _fw_l ON COMMIT DROP AS
    SELECT y.id, y.tenant_id, y.branch_id, y.posting_date AS day,
           coalesce(y.branch_uid, b.uid) AS buid,
           coalesce(wu.id, wc.id, dw.id) AS wid,
           coalesce(y.warehouse_uid, wc.uid, dw.uid) AS wuid,
           CASE WHEN coalesce(y.warehouse_code, '') <> '' THEN y.warehouse_code ELSE coalesce(wu.code, wc.code, dw.code, '') END AS wcode,
           y.tax_id
      FROM ledger_lines y
      LEFT JOIN branches b ON b.id = y.branch_id
      LEFT JOIN warehouses wu ON wu.uid = y.warehouse_uid
      LEFT JOIN warehouses wc ON y.warehouse_uid IS NULL AND wc.tenant_id = y.tenant_id AND wc.code = nullif(btrim(coalesce(y.dims ->> 'warehouse', '')), '')
      LEFT JOIN _fw_dw dw ON dw.tenant_id = y.tenant_id AND dw.branch_id = y.branch_id
     WHERE y.branch_uid IS NULL OR y.warehouse_uid IS NULL OR coalesce(y.warehouse_code, '') = '' OR coalesce(y.tax_id, '') = '';
  CREATE TEMP TABLE _fw_t ON COMMIT DROP AS
    SELECT tenant_id, branch_id, wid, day, bizcity_tax_id_at(tenant_id, branch_id, wid, day) AS tax
      FROM (SELECT DISTINCT tenant_id, branch_id, wid, day FROM _fw_l WHERE coalesce(tax_id, '') = '') d;
  CREATE INDEX ON _fw_t (tenant_id, branch_id, wid, day);

  ALTER TABLE ledger_lines DISABLE TRIGGER ledger_lines_balanced_update;
  UPDATE ledger_lines l SET
      branch_uid = x.buid, warehouse_uid = x.wuid, warehouse_code = x.wcode,
      tax_id = CASE WHEN coalesce(x.tax_id, '') <> '' THEN x.tax_id ELSE coalesce(t.tax, '') END
    FROM _fw_l x
    LEFT JOIN _fw_t t ON t.tenant_id = x.tenant_id AND t.branch_id IS NOT DISTINCT FROM x.branch_id AND t.wid IS NOT DISTINCT FROM x.wid AND t.day = x.day
   WHERE l.id = x.id;
  GET DIAGNOSTICS n1 = ROW_COUNT;
  ALTER TABLE ledger_lines ENABLE TRIGGER ledger_lines_balanced_update;

  -- Phiếu kho: tương tự, ngày = ngày chứng từ
  CREATE TEMP TABLE _fw_m ON COMMIT DROP AS
    SELECT m.id, m.tenant_id, m.branch_id, m.doc_date AS day,
           coalesce(m.branch_uid, b.uid) AS buid,
           coalesce(wu.id, wc.id, dw.id) AS wid,
           coalesce(m.warehouse_uid, wc.uid, dw.uid) AS wuid,
           CASE WHEN m.warehouse_code <> '' THEN m.warehouse_code ELSE coalesce(wu.code, wc.code, dw.code, '') END AS wcode,
           m.tax_id
      FROM inventory_movements m
      LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN warehouses wu ON wu.uid = m.warehouse_uid
      LEFT JOIN warehouses wc ON m.warehouse_uid IS NULL AND wc.tenant_id = m.tenant_id AND wc.code = nullif(m.warehouse_code, '')
      LEFT JOIN _fw_dw dw ON dw.tenant_id = m.tenant_id AND dw.branch_id = m.branch_id
     WHERE m.branch_uid IS NULL OR m.warehouse_uid IS NULL OR m.warehouse_code = '' OR coalesce(m.tax_id, '') = '';
  CREATE TEMP TABLE _fw_mt ON COMMIT DROP AS
    SELECT tenant_id, branch_id, wid, day, bizcity_tax_id_at(tenant_id, branch_id, wid, day) AS tax
      FROM (SELECT DISTINCT tenant_id, branch_id, wid, day FROM _fw_m WHERE coalesce(tax_id, '') = '') d;
  UPDATE inventory_movements m SET
      branch_uid = x.buid, warehouse_uid = x.wuid, warehouse_code = x.wcode,
      tax_id = CASE WHEN coalesce(x.tax_id, '') <> '' THEN x.tax_id ELSE coalesce(t.tax, '') END
    FROM _fw_m x
    LEFT JOIN _fw_mt t ON t.tenant_id = x.tenant_id AND t.branch_id IS NOT DISTINCT FROM x.branch_id AND t.wid IS NOT DISTINCT FROM x.wid AND t.day = x.day
   WHERE m.id = x.id;
  GET DIAGNOSTICS n2 = ROW_COUNT;
  DROP TABLE _fw_dw, _fw_l, _fw_t, _fw_m, _fw_mt;
  RETURN n1 + n2;
END $$;
COMMENT ON FUNCTION bizcity_fill_missing_wh_tax() IS 'Điền kho / MST còn trống trên dòng sổ cái, phiếu kho (0121); chạy lại được, không ghi đè.';

SELECT bizcity_fill_missing_wh_tax();

CREATE INDEX ledger_lines_tax_id ON ledger_lines (tenant_id, tax_id, posting_date);
CREATE INDEX ledger_lines_warehouse ON ledger_lines (tenant_id, warehouse_uid, posting_date);
CREATE INDEX ledger_lines_branch_uid ON ledger_lines (tenant_id, branch_uid, posting_date);
CREATE INDEX inventory_movements_tax_id ON inventory_movements (tenant_id, tax_id, doc_date);
