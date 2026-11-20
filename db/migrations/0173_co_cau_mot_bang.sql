-- [2026-11-20 Nguyễn Văn Thủy] CƠ CẤU TỔ CHỨC MỘT BẢNG: đơn vị – phân kho – bộ phận; mọi chứng từ mang 3 item_id (đóng góp)
--
-- Ba bảng, không thêm bảng mới:
--   branches    ĐƠN VỊ (cn_…)   mọi cấp: công ty, miền, chi nhánh, tỉnh, cửa hàng… chỉ khác tên gọi cấp (level_label).
--                               Cha unit_parent_id, đường dẫn unit_path (A/B/C), cấp unit_level. MST trống = theo cấp gần nhất có khai.
--   warehouses  PHÂN KHO (kho_…) thuộc một đơn vị (branch_id).
--   dimensions  BỘ PHẬN (pb_…, kind = department) thuộc một đơn vị (branch_id); bộ phận cha (parent_code) chỉ trong cùng đơn vị.
-- Tạo đơn vị là tự có một bộ phận. Lịch sử đổi cha ghi JSONL (luồng co-cau-doi-cha), không tạo bảng.
-- Chứng từ: mỗi bảng chứng từ có branch_uid / warehouse_uid / department_uid, điền bằng trigger riêng của bảng đó.
--   Không chọn phân kho / bộ phận → lấy cái mặc định của đơn vị.
-- org_units (cây cũ) thành bản sao tự sinh từ branches (branches.org_mirror_id) cho phần cũ còn đọc nó; ứng dụng đồng bộ sau mỗi lần ghi.
--
-- Mục lục: 1 Đơn vị · 2 Bộ phận · 3 Người tạo / người sửa · 4 Chứng từ mang 3 item_id · 5 Thẻ hướng dẫn


-- ═══ 1. ĐƠN VỊ ═══════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE branches ADD COLUMN IF NOT EXISTS unit_parent_id bigint REFERENCES branches(id) ON DELETE RESTRICT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS unit_path      text    NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS unit_level     integer NOT NULL DEFAULT 1;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS level_label    text    NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS sort_order     integer NOT NULL DEFAULT 0;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS org_mirror_id  bigint REFERENCES org_units(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_unit_parent_chk') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_unit_parent_chk CHECK (unit_parent_id IS NULL OR unit_parent_id <> id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS branches_unit_parent_idx ON branches (tenant_id, unit_parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS branches_org_mirror_uq ON branches (org_mirror_id) WHERE org_mirror_id IS NOT NULL;
COMMENT ON COLUMN branches.unit_parent_id IS 'Đơn vị cha (0173). Khác parent_id (kho tổng mua hàng, tự tính).';
COMMENT ON COLUMN branches.unit_path      IS 'Đường dẫn mã từ gốc, vd CTY/BAC/PT/29000 (0173, tự tính).';
COMMENT ON COLUMN branches.level_label    IS 'Tên gọi cấp người dùng đặt: Công ty, Miền, Chi nhánh, Tỉnh, Cửa hàng… (0173).';
COMMENT ON COLUMN branches.org_mirror_id  IS 'Nút org_units bản sao của đơn vị (0173, tự sinh cho phần cũ đọc cây org_units).';

-- Mỗi nút cây cũ → một đơn vị (mã trùng chi nhánh sẵn có thì thêm đuôi -CC).
INSERT INTO branches (tenant_id, code, name, tax_code, note, is_active, level_label, sort_order, org_mirror_id)
SELECT o.tenant_id,
       CASE WHEN EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = o.tenant_id AND lower(b.code) = lower(o.code)) THEN o.code || '-CC' ELSE o.code END,
       o.name, o.tax_id, o.note, o.is_active,
       CASE WHEN o.kind = 'company' OR o.parent_id IS NULL THEN 'Công ty' WHEN o.level = 1 THEN 'Miền' WHEN o.level = 2 THEN 'Chi nhánh' WHEN o.level = 3 THEN 'Tỉnh' ELSE '' END,
       o.sort_order, o.id
  FROM org_units o
 WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.org_mirror_id = o.id);

-- Cha: đơn vị từ cây cũ theo nút cha cũ; cửa hàng theo nút đang gắn (org_unit_id).
UPDATE branches b SET unit_parent_id = p.id
  FROM org_units o JOIN branches p ON p.org_mirror_id = o.parent_id
 WHERE b.org_mirror_id = o.id AND b.unit_parent_id IS NULL;
UPDATE branches b SET unit_parent_id = p.id
  FROM branches p
 WHERE b.org_mirror_id IS NULL AND b.org_unit_id IS NOT NULL AND p.org_mirror_id = b.org_unit_id AND b.unit_parent_id IS NULL;
UPDATE branches SET org_unit_id = org_mirror_id WHERE org_mirror_id IS NOT NULL AND org_unit_id IS DISTINCT FROM org_mirror_id;
UPDATE branches SET level_label = 'Cửa hàng' WHERE level_label = '' AND org_mirror_id IS NULL;

-- Đường dẫn + cấp (ứng dụng gọi lại sau mỗi lần đổi cha).
CREATE OR REPLACE FUNCTION bizcity_unit_paths(p_tenant bigint) RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
  WITH RECURSIVE t AS (
    SELECT id, code::text AS path, 1 AS lv FROM branches WHERE tenant_id = p_tenant AND unit_parent_id IS NULL
    UNION ALL
    SELECT b.id, t.path || '/' || b.code, t.lv + 1 FROM branches b JOIN t ON b.unit_parent_id = t.id WHERE b.tenant_id = p_tenant AND t.lv < 40
  )
  UPDATE branches b SET unit_path = t.path, unit_level = t.lv FROM t WHERE b.id = t.id AND (b.unit_path IS DISTINCT FROM t.path OR b.unit_level <> t.lv);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;
COMMENT ON FUNCTION bizcity_unit_paths(bigint) IS 'Tính lại đường dẫn + cấp của mọi đơn vị trong tenant (0173).';
SELECT bizcity_unit_paths(id) FROM tenants;


-- ═══ 2. BỘ PHẬN ══════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS branch_id bigint REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dimensions_branch_idx ON dimensions (tenant_id, branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN dimensions.branch_id IS 'Bộ phận (kind = department) thuộc đơn vị nào (0173).';

-- Bộ phận mặc định tự tạo khi thêm đơn vị (trigger branches_own_department, 0129): không gắn cha.
CREATE OR REPLACE FUNCTION bizcity_ensure_branch_department(p_tenant bigint, p_branch_id bigint, p_code text, p_name text, p_level text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE v_code text := bizcity_branch_department_code(p_tenant, p_branch_id, p_code);
BEGIN
  -- Chạy BEFORE INSERT của branches: dòng đơn vị chưa có nên chưa gắn branch_id ở đây (branches_link_department gắn sau).
  INSERT INTO dimensions (tenant_id, kind, code, name)
  VALUES (p_tenant, 'department', v_code, CASE WHEN p_level = 'shop' THEN 'Shop ' ELSE '' END || p_name)
  ON CONFLICT (tenant_id, kind, code) DO UPDATE SET is_active = true;
  RETURN v_code;
END $fn$;

CREATE OR REPLACE FUNCTION bizcity_link_branch_department() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.department_code IS NOT NULL THEN
    UPDATE dimensions SET branch_id = NEW.id WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = NEW.department_code AND branch_id IS NULL;
  END IF;
  RETURN NULL;
END $fn$;
COMMENT ON FUNCTION bizcity_link_branch_department() IS 'Gắn bộ phận mặc định vào đơn vị sau khi chèn / đổi bộ phận mặc định (0173).';
DROP TRIGGER IF EXISTS branches_link_department ON branches;
CREATE TRIGGER branches_link_department AFTER INSERT OR UPDATE OF department_code ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_link_branch_department();

-- Gắn bộ phận cũ vào đơn vị: bộ phận mặc định của đơn vị; bộ phận gắn cơ cấu cũ (extra.orgUnitCode).
UPDATE dimensions d SET branch_id = b.id FROM branches b
 WHERE d.kind = 'department' AND d.branch_id IS NULL AND b.tenant_id = d.tenant_id AND b.department_code = d.code;
UPDATE dimensions d SET branch_id = b.id FROM org_units o JOIN branches b ON b.org_mirror_id = o.id
 WHERE d.kind = 'department' AND d.branch_id IS NULL AND o.tenant_id = d.tenant_id AND d.extra->>'orgUnitCode' = o.code;
-- Đơn vị chưa có bộ phận riêng → tạo (mỗi đơn vị luôn có một bộ phận).
DO $$
DECLARE b record;
BEGIN
  FOR b IN SELECT * FROM branches x WHERE COALESCE(x.department_code, '') = ''
              OR NOT EXISTS (SELECT 1 FROM dimensions d WHERE d.branch_id = x.id AND d.kind = 'department') LOOP
    UPDATE branches SET department_code = bizcity_ensure_branch_department(b.tenant_id, b.id, b.code, b.name, COALESCE(b.level, '')) WHERE id = b.id;
  END LOOP;
END $$;
-- Bộ phận chung chưa thuộc đơn vị nào (Ban giám đốc, Kế toán tổng hợp…) → công ty gốc lớn nhất.
WITH goc AS (
  SELECT DISTINCT ON (b.tenant_id) b.tenant_id, b.id
    FROM branches b
   WHERE b.unit_parent_id IS NULL
   ORDER BY b.tenant_id, (SELECT count(*) FROM branches c WHERE c.tenant_id = b.tenant_id AND c.unit_path LIKE b.unit_path || '/%') DESC, b.id
)
UPDATE dimensions d SET branch_id = goc.id FROM goc
 WHERE d.tenant_id = goc.tenant_id AND d.kind = 'department' AND d.branch_id IS NULL;

-- Bộ phận cha – con: không bắt buộc, chỉ trong cùng đơn vị (vd Kế toán → Kế toán thuế).
-- Quan hệ cũ trỏ sang bộ phận của đơn vị khác (shop → "CN" ở công ty) bỏ đi; giá trị cũ giữ ở extra.parentCodeCu.
UPDATE dimensions d SET extra = COALESCE(d.extra, '{}'::jsonb) || jsonb_build_object('parentCodeCu', d.parent_code), parent_code = NULL
 WHERE d.kind = 'department' AND COALESCE(d.parent_code, '') <> ''
   AND NOT EXISTS (SELECT 1 FROM dimensions p WHERE p.tenant_id = d.tenant_id AND p.kind = 'department' AND p.code = d.parent_code
                     AND p.id <> d.id AND p.branch_id IS NOT DISTINCT FROM d.branch_id);

CREATE OR REPLACE FUNCTION bizcity_dept_parent_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_b bigint; v_cur text := NEW.parent_code; n int := 0;
BEGIN
  IF NEW.kind <> 'department' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.parent_code, '') = '' THEN NEW.parent_code := NULL; RETURN NEW; END IF;
  IF NEW.parent_code = NEW.code THEN RAISE EXCEPTION 'Bộ phận % không thể là cha của chính nó', NEW.code USING ERRCODE = 'check_violation'; END IF;
  SELECT branch_id INTO v_b FROM dimensions WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = NEW.parent_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bộ phận cha % không có', NEW.parent_code USING ERRCODE = 'check_violation'; END IF;
  -- Bộ phận chưa gắn đơn vị mà chọn cha → thuộc đơn vị của cha (dữ liệu mẫu, danh mục chiều phân tích cũ, nhập Excel).
  IF NEW.branch_id IS NULL AND v_b IS NOT NULL THEN NEW.branch_id := v_b; END IF;
  IF v_b IS DISTINCT FROM NEW.branch_id THEN
    -- Chuyển bộ phận sang đơn vị khác mà không chọn cha mới: bỏ cha cũ.
    IF TG_OP = 'UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id AND NEW.parent_code IS NOT DISTINCT FROM OLD.parent_code THEN
      NEW.parent_code := NULL; RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Bộ phận cha % phải cùng đơn vị với bộ phận %', NEW.parent_code, NEW.code USING ERRCODE = 'check_violation';
  END IF;
  WHILE v_cur IS NOT NULL AND n < 50 LOOP
    IF v_cur = NEW.code THEN RAISE EXCEPTION 'Chọn % làm cha sẽ tạo vòng lặp cha – con', NEW.parent_code USING ERRCODE = 'check_violation'; END IF;
    SELECT parent_code INTO v_cur FROM dimensions WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = v_cur;
    n := n + 1;
  END LOOP;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_dept_parent_check() IS 'Bộ phận cha phải cùng đơn vị, không vòng lặp (0173).';
DROP TRIGGER IF EXISTS dimensions_dept_parent_check ON dimensions;
CREATE TRIGGER dimensions_dept_parent_check BEFORE INSERT OR UPDATE OF parent_code, branch_id ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_dept_parent_check();

CREATE OR REPLACE FUNCTION bizcity_dept_moved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'department' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    UPDATE dimensions SET parent_code = NULL
     WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND parent_code = NEW.code AND branch_id IS DISTINCT FROM NEW.branch_id;
  END IF;
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_dept_moved() IS 'Bộ phận chuyển đơn vị: bộ phận con ở đơn vị cũ thôi nhận nó làm cha (0173).';
DROP TRIGGER IF EXISTS dimensions_dept_moved ON dimensions;
CREATE TRIGGER dimensions_dept_moved AFTER UPDATE OF branch_id ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_dept_moved();


-- ═══ 3. NGƯỜI TẠO / NGƯỜI SỬA (đơn vị, phân kho, bộ phận) ═══════════════════════════════════════════════════════════
-- Người lấy từ ketoan.actor_name của giao dịch (API đặt trước khi ghi).

ALTER TABLE branches   ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
                       ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '',
                       ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
                       ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '';
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
                       ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
                       ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '',
                       ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Ba bảng cùng bốn cột created_by / created_at / updated_by / updated_at → một hàm, mỗi bảng một trigger.
CREATE OR REPLACE FUNCTION bizcity_stamp_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_by text := COALESCE(current_setting('ketoan.actor_name', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by = '' THEN NEW.created_by := v_by; END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    IF NEW IS DISTINCT FROM OLD THEN
      NEW.updated_at := now();
      IF v_by <> '' THEN NEW.updated_by := v_by; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_stamp_actor() IS 'Ghi người tạo / người sửa / ngày sửa theo ketoan.actor_name (0173).';
DROP TRIGGER IF EXISTS branches_stamp_actor ON branches;
CREATE TRIGGER branches_stamp_actor BEFORE INSERT OR UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_stamp_actor();
DROP TRIGGER IF EXISTS warehouses_stamp_actor ON warehouses;
CREATE TRIGGER warehouses_stamp_actor BEFORE INSERT OR UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_stamp_actor();
DROP TRIGGER IF EXISTS dimensions_stamp_actor ON dimensions;
CREATE TRIGGER dimensions_stamp_actor BEFORE INSERT OR UPDATE ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_stamp_actor();


-- ═══ 4. CHỨNG TỪ MANG 3 ITEM_ID: đơn vị cn_ · phân kho kho_ · bộ phận pb_ ══════════════════════════════════════════
-- Một hàm tra cứu dùng chung; MỖI BẢNG MỘT TRIGGER ghi rõ lấy đơn vị / phân kho / bộ phận từ cột nào của bảng đó.

CREATE OR REPLACE FUNCTION bizcity_unit_ids(p_tenant bigint, p_branch_id bigint, p_branch_code text, p_dept text, p_wh text,
                                            OUT branch_uid text, OUT warehouse_uid text, OUT department_uid text)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_bid bigint; v_dept text;
BEGIN
  IF p_branch_id IS NOT NULL THEN
    SELECT b.id, b.uid, b.department_code INTO v_bid, branch_uid, v_dept FROM branches b WHERE b.id = p_branch_id;
  ELSIF COALESCE(p_branch_code, '') <> '' THEN
    SELECT b.id, b.uid, b.department_code INTO v_bid, branch_uid, v_dept FROM branches b WHERE b.tenant_id = p_tenant AND b.code = p_branch_code;
  END IF;
  -- Bộ phận: mã chứng từ chọn, không có thì bộ phận mặc định của đơn vị.
  IF COALESCE(p_dept, '') <> '' THEN
    SELECT d.uid INTO department_uid FROM dimensions d WHERE d.tenant_id = p_tenant AND d.kind = 'department' AND d.code = p_dept;
  END IF;
  IF department_uid IS NULL AND v_bid IS NOT NULL THEN
    SELECT d.uid INTO department_uid FROM dimensions d
     WHERE d.tenant_id = p_tenant AND d.kind = 'department' AND (d.code = v_dept OR d.branch_id = v_bid)
     ORDER BY (d.code = v_dept) DESC NULLS LAST, d.id LIMIT 1;
  END IF;
  -- Phân kho: mã chứng từ chọn, không có thì phân kho mặc định của đơn vị.
  IF COALESCE(p_wh, '') <> '' THEN
    SELECT w.uid INTO warehouse_uid FROM warehouses w WHERE w.tenant_id = p_tenant AND w.code = p_wh;
  END IF;
  IF warehouse_uid IS NULL AND v_bid IS NOT NULL THEN
    SELECT w.uid INTO warehouse_uid FROM warehouses w WHERE w.branch_id = v_bid AND w.is_active ORDER BY w.is_default DESC, w.id LIMIT 1;
  END IF;
END $$;
COMMENT ON FUNCTION bizcity_unit_ids(bigint, bigint, text, text, text) IS 'Đơn vị / phân kho / bộ phận item_id của một chứng từ; trống thì mặc định của đơn vị (0173).';

-- Cột mới.
ALTER TABLE business_documents  ADD COLUMN IF NOT EXISTS branch_uid text, ADD COLUMN IF NOT EXISTS warehouse_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE purchase_documents  ADD COLUMN IF NOT EXISTS branch_uid text, ADD COLUMN IF NOT EXISTS warehouse_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE payment_requests    ADD COLUMN IF NOT EXISTS branch_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE reference_documents ADD COLUMN IF NOT EXISTS branch_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE stock_max_requests  ADD COLUMN IF NOT EXISTS branch_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE stock_counts        ADD COLUMN IF NOT EXISTS branch_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE accounting_events   ADD COLUMN IF NOT EXISTS warehouse_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE tax_invoices        ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE debt_items          ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE cost_norms          ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE stock_transfer_docs ADD COLUMN IF NOT EXISTS from_branch_uid text, ADD COLUMN IF NOT EXISTS from_warehouse_uid text,
                                ADD COLUMN IF NOT EXISTS to_branch_uid text, ADD COLUMN IF NOT EXISTS to_warehouse_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
ALTER TABLE transfer_requests   ADD COLUMN IF NOT EXISTS from_branch_uid text, ADD COLUMN IF NOT EXISTS from_warehouse_uid text,
                                ADD COLUMN IF NOT EXISTS to_branch_uid text, ADD COLUMN IF NOT EXISTS to_warehouse_uid text, ADD COLUMN IF NOT EXISTS department_uid text;
CREATE INDEX IF NOT EXISTS business_documents_department_idx ON business_documents (tenant_id, department_uid) WHERE department_uid IS NOT NULL;

-- business_documents (sổ chứng từ chung): đơn vị branch_code · phân kho meta.warehouseCode / fromWarehouse · bộ phận meta.departmentCode
CREATE OR REPLACE FUNCTION bizcity_business_documents_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NEW.meta->>'departmentCode', COALESCE(NEW.meta->>'warehouseCode', NEW.meta->>'fromWarehouse'));
  NEW.branch_uid := r.branch_uid; NEW.warehouse_uid := r.warehouse_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS business_documents_unit_ids ON business_documents;
CREATE TRIGGER business_documents_unit_ids BEFORE INSERT OR UPDATE OF branch_code, meta ON business_documents FOR EACH ROW EXECUTE FUNCTION bizcity_business_documents_unit_ids();

-- purchase_documents (phiếu mua): đơn vị branch_code · phân kho data.warehouseCode · bộ phận data.departmentCode
CREATE OR REPLACE FUNCTION bizcity_purchase_documents_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NEW.data->>'departmentCode', NEW.data->>'warehouseCode');
  NEW.branch_uid := r.branch_uid; NEW.warehouse_uid := r.warehouse_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS purchase_documents_unit_ids ON purchase_documents;
CREATE TRIGGER purchase_documents_unit_ids BEFORE INSERT OR UPDATE OF branch_code, data ON purchase_documents FOR EACH ROW EXECUTE FUNCTION bizcity_purchase_documents_unit_ids();

-- payment_requests (đề nghị thanh toán): đơn vị branch_code · bộ phận mặc định của đơn vị
CREATE OR REPLACE FUNCTION bizcity_payment_requests_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NULL, NULL);
  NEW.branch_uid := r.branch_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_requests_unit_ids ON payment_requests;
CREATE TRIGGER payment_requests_unit_ids BEFORE INSERT OR UPDATE OF branch_code ON payment_requests FOR EACH ROW EXECUTE FUNCTION bizcity_payment_requests_unit_ids();

-- reference_documents (chứng từ tham chiếu từ hệ thống khác): đơn vị branch_code · bộ phận payload.departmentCode
CREATE OR REPLACE FUNCTION bizcity_reference_documents_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NEW.payload->>'departmentCode', NULL);
  NEW.branch_uid := r.branch_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reference_documents_unit_ids ON reference_documents;
CREATE TRIGGER reference_documents_unit_ids BEFORE INSERT OR UPDATE OF branch_code, payload ON reference_documents FOR EACH ROW EXECUTE FUNCTION bizcity_reference_documents_unit_ids();

-- stock_max_requests (đề xuất tồn max): đơn vị branch_code · bộ phận data.departmentCode
CREATE OR REPLACE FUNCTION bizcity_stock_max_requests_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NEW.data->>'departmentCode', NULL);
  NEW.branch_uid := r.branch_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_max_requests_unit_ids ON stock_max_requests;
CREATE TRIGGER stock_max_requests_unit_ids BEFORE INSERT OR UPDATE OF branch_code, data ON stock_max_requests FOR EACH ROW EXECUTE FUNCTION bizcity_stock_max_requests_unit_ids();

-- stock_counts (kiểm kê): đơn vị branch_code · bộ phận mặc định (phân kho warehouse_uid do trigger 0138 điền theo warehouse_code)
CREATE OR REPLACE FUNCTION bizcity_stock_counts_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NULL, NULL);
  NEW.branch_uid := r.branch_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_counts_unit_ids ON stock_counts;
CREATE TRIGGER stock_counts_unit_ids BEFORE INSERT OR UPDATE OF branch_code ON stock_counts FOR EACH ROW EXECUTE FUNCTION bizcity_stock_counts_unit_ids();

-- accounting_events (sự kiện kế toán): đơn vị branch_id (branch_uid do 0138) · phân kho payload.warehouseCode / fromWarehouse · bộ phận payload.departmentCode
CREATE OR REPLACE FUNCTION bizcity_accounting_events_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NEW.branch_id, NULL, NEW.payload->>'departmentCode', COALESCE(NEW.payload->>'warehouseCode', NEW.payload->>'fromWarehouse'));
  NEW.warehouse_uid := r.warehouse_uid; NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounting_events_unit_ids ON accounting_events;
CREATE TRIGGER accounting_events_unit_ids BEFORE INSERT OR UPDATE OF branch_id, payload ON accounting_events FOR EACH ROW EXECUTE FUNCTION bizcity_accounting_events_unit_ids();

-- inventory_movements (nhập xuất kho): đơn vị branch_id · phân kho warehouse_code · bộ phận mặc định của đơn vị
CREATE OR REPLACE FUNCTION bizcity_inventory_movements_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NEW.branch_id, NULL, NULL, NEW.warehouse_code);
  NEW.branch_uid := COALESCE(NEW.branch_uid, r.branch_uid); NEW.warehouse_uid := COALESCE(NEW.warehouse_uid, r.warehouse_uid); NEW.department_uid := r.department_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_movements_unit_ids ON inventory_movements;
CREATE TRIGGER inventory_movements_unit_ids BEFORE INSERT OR UPDATE OF branch_id, warehouse_code ON inventory_movements FOR EACH ROW EXECUTE FUNCTION bizcity_inventory_movements_unit_ids();

-- tax_invoices (hoá đơn): bộ phận mặc định của đơn vị branch_id
CREATE OR REPLACE FUNCTION bizcity_tax_invoices_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.department_uid := (SELECT department_uid FROM bizcity_unit_ids(NEW.tenant_id, NEW.branch_id, NULL, NULL, NULL));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tax_invoices_unit_ids ON tax_invoices;
CREATE TRIGGER tax_invoices_unit_ids BEFORE INSERT OR UPDATE OF branch_id ON tax_invoices FOR EACH ROW EXECUTE FUNCTION bizcity_tax_invoices_unit_ids();

-- debt_items (công nợ): bộ phận mặc định của đơn vị branch_id
CREATE OR REPLACE FUNCTION bizcity_debt_items_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.department_uid := (SELECT department_uid FROM bizcity_unit_ids(NEW.tenant_id, NEW.branch_id, NULL, NULL, NULL));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS debt_items_unit_ids ON debt_items;
CREATE TRIGGER debt_items_unit_ids BEFORE INSERT OR UPDATE OF branch_id ON debt_items FOR EACH ROW EXECUTE FUNCTION bizcity_debt_items_unit_ids();

-- cost_norms (định mức chi phí): bộ phận department_code, trống thì mặc định của đơn vị branch_id
CREATE OR REPLACE FUNCTION bizcity_cost_norms_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.department_uid := (SELECT department_uid FROM bizcity_unit_ids(NEW.tenant_id, NEW.branch_id, NULL, NEW.department_code, NULL));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cost_norms_unit_ids ON cost_norms;
CREATE TRIGGER cost_norms_unit_ids BEFORE INSERT OR UPDATE OF branch_id, department_code ON cost_norms FOR EACH ROW EXECUTE FUNCTION bizcity_cost_norms_unit_ids();

-- stock_transfer_docs (chuyển kho, hai đầu): xuất from_branch_code + from_warehouse · nhận to_branch_code + to_warehouse · bộ phận của đầu xuất
CREATE OR REPLACE FUNCTION bizcity_stock_transfer_docs_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; b record;
BEGIN
  SELECT * INTO a FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.from_branch_code, NULL, NEW.from_warehouse);
  SELECT * INTO b FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.to_branch_code, NULL, NEW.to_warehouse);
  NEW.from_branch_uid := a.branch_uid; NEW.from_warehouse_uid := a.warehouse_uid; NEW.department_uid := a.department_uid;
  NEW.to_branch_uid := b.branch_uid; NEW.to_warehouse_uid := b.warehouse_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_transfer_docs_unit_ids ON stock_transfer_docs;
CREATE TRIGGER stock_transfer_docs_unit_ids BEFORE INSERT OR UPDATE OF from_branch_code, from_warehouse, to_branch_code, to_warehouse ON stock_transfer_docs
  FOR EACH ROW EXECUTE FUNCTION bizcity_stock_transfer_docs_unit_ids();

-- transfer_requests (yêu cầu chuyển hàng, hai đầu): xuất from_branch + from_warehouse · nhận to_branch + to_warehouse · bộ phận data.departmentCode / đầu xuất
CREATE OR REPLACE FUNCTION bizcity_transfer_requests_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; b record;
BEGIN
  SELECT * INTO a FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.from_branch, NEW.data->>'departmentCode', NEW.from_warehouse);
  SELECT * INTO b FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.to_branch, NULL, NEW.to_warehouse);
  NEW.from_branch_uid := a.branch_uid; NEW.from_warehouse_uid := a.warehouse_uid; NEW.department_uid := a.department_uid;
  NEW.to_branch_uid := b.branch_uid; NEW.to_warehouse_uid := b.warehouse_uid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transfer_requests_unit_ids ON transfer_requests;
CREATE TRIGGER transfer_requests_unit_ids BEFORE INSERT OR UPDATE OF from_branch, from_warehouse, to_branch, to_warehouse, data ON transfer_requests
  FOR EACH ROW EXECUTE FUNCTION bizcity_transfer_requests_unit_ids();

-- Điền dữ liệu cũ: gán lại cột mà trigger của bảng theo dõi để chạy đúng trigger đó
-- (tạm tắt trigger khác — đồng bộ sổ chứng từ, khoá chống sửa — để không đụng gì ngoài các cột item_id).
DO $$
DECLARE t text[];
BEGIN
  FOREACH t SLICE 1 IN ARRAY ARRAY[
    ['business_documents', 'branch_code'], ['purchase_documents', 'branch_code'], ['payment_requests', 'branch_code'],
    ['reference_documents', 'branch_code'], ['stock_max_requests', 'branch_code'], ['stock_counts', 'branch_code'],
    ['accounting_events', 'branch_id'], ['inventory_movements', 'branch_id'], ['tax_invoices', 'branch_id'], ['debt_items', 'branch_id'],
    ['cost_norms', 'branch_id'], ['stock_transfer_docs', 'from_branch_code'], ['transfer_requests', 'from_branch']] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', t[1]);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', t[1], t[1] || '_unit_ids');
    EXECUTE format('UPDATE %I SET %I = %I', t[1], t[2], t[2]);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', t[1]);
  END LOOP;
END $$;


-- ═══ 5. THẺ HƯỚNG DẪN DM16 (docs/huong-dan/so-do-to-chuc.md) ════════════════════════════════════════════════════════
UPDATE help_cards SET body = $hd$Mọi cấp (công ty, miền, chi nhánh, tỉnh, cửa hàng…) đều là một **đơn vị**. Chúng chỉ khác nhau ở **tên gọi cấp**, do bạn tự đặt.
Đơn vị nào cũng có thể chứa đơn vị con, có **phân kho** và **bộ phận** riêng.

```
Công ty TGS                         cấp 1
└─ Miền Bắc                         cấp 2
   └─ Chi nhánh Phú Thọ             cấp 3   ← có phân kho trung gian, bộ phận kế toán
      └─ Cửa hàng 08001             cấp 4   ← có phân kho hàng hoá, bộ phận bán hàng
```

Đường dẫn của đơn vị ghi theo kiểu **Công ty TGS / Miền Bắc / Chi nhánh Phú Thọ**. Ô **Thuộc** và các bảng đều hiện đường dẫn này.

## Ba thứ cần khai

| Loại | Thuộc | Ô chính |
|---|---|---|
| **Đơn vị** | Một đơn vị khác (trống = cấp cao nhất) | Mã, Tên, Tên gọi cấp, MST, Tên in chứng từ, Địa chỉ, Điện thoại |
| **Phân kho** | Một đơn vị | Mã phân kho, Tên, Loại kho, Mặc định |
| **Bộ phận** | Một đơn vị | Mã bộ phận, Tên |

- **Mã không được trùng** giữa đơn vị, phân kho và bộ phận.
- **MST**: đơn vị tự khai thì dùng MST của nó. Để trống thì dùng MST của cấp gần nhất phía trên có khai (bảng hiện dấu ↑).
- Tạo đơn vị là **tự có một bộ phận** (đổi tên được). Chứng từ chưa chọn bộ phận thì tính vào bộ phận này.
- **Bộ phận cha – con** (không bắt buộc): một bộ phận có thể thuộc một bộ phận khác **trong cùng đơn vị**,
  ví dụ *Kế toán → Kế toán thuế*, *Logistic → Kho, Đội xe*. Không chọn được bộ phận của đơn vị khác. Chuyển bộ phận sang đơn vị khác thì nó bỏ cha cũ.

## Chứng từ ghi gì

Mỗi chứng từ lưu ba định danh nhỏ nhất: **đơn vị**, **phân kho**, **bộ phận**.
Chứng từ không chọn phân kho / bộ phận thì lấy cái mặc định của đơn vị.
Nhờ vậy, đổi mã, đổi tên hay chuyển đơn vị sang nhánh khác về sau, số liệu cũ vẫn đúng chỗ.
Báo cáo và định mức chi phí theo đơn vị → bộ phận → khoản mục dựa trên ba định danh này.

## Thao tác

- **Xem**: *Cây* (trái) + chi tiết (phải), *Sơ đồ* (chọn "Xem từ" để xem một nhánh), *Danh sách* (Đơn vị / Phân kho / Bộ phận).
- **Bảng**: không phân trang. Gõ vào hàng lọc dưới tiêu đề để lọc từng cột, bấm tiêu đề để sắp xếp.
  Nút **Cột** để ẩn / hiện cột. Cột *Người tạo, Ngày tạo, Người sửa, Ngày sửa* đang ẩn sẵn. Nút **Xuất Excel** xuất đúng các dòng đang lọc.
- **Tab Phân kho / Bộ phận** chỉ hiện của riêng đơn vị đang chọn. Bấm **Toàn nhánh** để xem cả các đơn vị cấp dưới.
- **Tab Bộ phận**: bảng xếp theo cây (bộ phận con thụt vào dưới cha, có cột *Bộ phận cha*). Bấm **Sơ đồ bộ phận** để xem dạng sơ đồ tổ chức:
  bấm một ô để sửa, rê chuột vào ô rồi bấm **+** để thêm bộ phận con, nút **Toàn màn hình** để xem rộng.
- **Sơ đồ** (chung): tích *Hiện bộ phận* thì mỗi đơn vị hiện cây bộ phận cha – con của nó.
- **Thêm**: nút *Thêm đơn vị* ở đầu trang, hoặc *Thêm* trong chi tiết một đơn vị (đơn vị con / phân kho / bộ phận).
- **Sửa**: *Chỉnh sửa* trong chi tiết, hoặc bấm đúp một dòng trong bảng. Đổi **Thuộc** là chuyển đơn vị sang nhánh khác. Lần chuyển được ghi ở tab **Lịch sử**.
- **Xoá**: xoá vĩnh viễn, kèm toàn bộ đơn vị con, phân kho, bộ phận bên trong. Hộp xoá liệt kê hết những gì sẽ mất trước khi bạn đồng ý.
  Xoá bộ phận cha thì xoá cả bộ phận con. Đơn vị / phân kho / bộ phận **đã có chứng từ** thì không xoá được. Hãy chuyển sang *Ngừng hoạt động*.

## Xuất / nhập Excel

Nút **⋯** → **Xuất Excel** tạo một tệp ba sheet: **Đơn vị**, **Phân kho**, **Bộ phận**.
Cột **Thuộc (mã)** ghi mã đơn vị cha / đơn vị chứa; sheet Bộ phận có thêm **Bộ phận cha (mã)** (cùng đơn vị, để trống = cấp cao nhất). Cột **Đường dẫn** chỉ để đọc.

Nhập theo thứ tự **1. Đơn vị → 2. Phân kho → 3. Bộ phận** (ở nút ⋯):

- Có thể dùng chính tệp vừa xuất: sửa hoặc thêm dòng rồi nhập lại.
- Mã đã có thì cập nhật, mã mới thì thêm.
- Dòng lỗi được báo trước khi ghi: trùng mã khác loại, đơn vị cha không có, MST sai, vòng lặp cha – con.
$hd$, format = 'md', updated_at = now()
 WHERE source_key = 'so-do-to-chuc';
