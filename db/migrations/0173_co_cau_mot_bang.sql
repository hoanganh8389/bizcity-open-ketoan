-- [2026-11-20 Nguyễn Văn Thủy] CƠ CẤU MỘT BẢNG: mọi cấp (công ty, miền, chi nhánh, tỉnh, cửa hàng…) đều là một ĐƠN VỊ trong bảng branches (đóng góp)
--
-- Luật (người dùng chốt 20/11/2026):
--   * Đơn vị = một dòng branches (item_id cn_…). Cấp nào cũng giống nhau, chỉ khác TÊN GỌI (level_label: Công ty, Miền, Tỉnh, Cửa hàng… tuỳ đặt).
--   * Đơn vị có cha (unit_parent_id), đường dẫn mã (unit_path 'CTY/BAC/PT/PTO/29000'), cấp (unit_level 1, 2, 3…, không giới hạn).
--   * MST: đơn vị tự khai thì dùng của mình; trống thì lấy MST của cấp gần nhất có khai.
--   * Phân kho (warehouses, kho_…) thuộc một đơn vị (branch_id). Bộ phận (dimensions kind=department, pb_…) thuộc một đơn vị (branch_id).
--     Tạo đơn vị là tự có một bộ phận (trigger branches_own_department đã có, nay gắn thêm branch_id).
--   * Mọi chứng từ (sổ chứng từ chung business_documents) mang đơn vị_item_id, phân kho_item_id, bộ phận_item_id.
--   * Lịch sử đổi cha – con: ghi tệp JSONL (luồng co-cau-doi-cha), không tạo bảng.
--
-- Tương thích: org_units (cây cũ) KHÔNG còn là nơi khai báo — nó thành bản sao tự sinh từ branches (branches.org_mirror_id) cho
-- các phần đang đọc nó (phân quyền theo vùng, giá vốn theo cơ cấu, tồn max / đơn vị mua hàng). Ứng dụng đồng bộ sau mỗi lần ghi.
-- Không xoá dữ liệu cũ.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS unit_parent_id bigint REFERENCES branches(id) ON DELETE RESTRICT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS unit_path text NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS unit_level integer NOT NULL DEFAULT 1;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS level_label text NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS org_mirror_id bigint REFERENCES org_units(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_unit_parent_chk') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_unit_parent_chk CHECK (unit_parent_id IS NULL OR unit_parent_id <> id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS branches_unit_parent_idx ON branches (tenant_id, unit_parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS branches_org_mirror_uq ON branches (org_mirror_id) WHERE org_mirror_id IS NOT NULL;
COMMENT ON COLUMN branches.unit_parent_id IS 'Đơn vị cha trên cây cơ cấu (0173). Khác parent_id (kho tổng mua hàng, tự tính).';
COMMENT ON COLUMN branches.unit_path IS 'Đường dẫn mã từ gốc: CTY/BAC/PT/PTO/29000 (0173, tự tính).';
COMMENT ON COLUMN branches.level_label IS 'Tên gọi cấp do người dùng đặt: Công ty, Miền, Chi nhánh, Tỉnh, Cửa hàng… (0173).';
COMMENT ON COLUMN branches.org_mirror_id IS 'Nút org_units bản sao của đơn vị này (0173, tự sinh cho phần cũ đọc cây org_units).';

-- 1) Mỗi nút cây cũ → một đơn vị. Mã trùng một chi nhánh sẵn có → thêm đuôi -CC.
INSERT INTO branches (tenant_id, code, name, tax_code, note, is_active, level_label, sort_order, org_mirror_id)
SELECT o.tenant_id,
       CASE WHEN EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = o.tenant_id AND lower(b.code) = lower(o.code)) THEN o.code || '-CC' ELSE o.code END,
       o.name, o.tax_id, o.note, o.is_active,
       CASE WHEN o.kind = 'company' OR o.parent_id IS NULL THEN 'Công ty' WHEN o.level = 1 THEN 'Miền' WHEN o.level = 2 THEN 'Chi nhánh' WHEN o.level = 3 THEN 'Tỉnh' ELSE '' END,
       o.sort_order, o.id
  FROM org_units o
 WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.org_mirror_id = o.id);

-- 2) Cha: đơn vị từ cây cũ theo nút cha cũ; cửa hàng theo nút đang gắn (org_unit_id).
UPDATE branches b SET unit_parent_id = p.id
  FROM org_units o JOIN branches p ON p.org_mirror_id = o.parent_id
 WHERE b.org_mirror_id = o.id AND b.unit_parent_id IS NULL;
UPDATE branches b SET unit_parent_id = p.id
  FROM branches p
 WHERE b.org_mirror_id IS NULL AND b.org_unit_id IS NOT NULL AND p.org_mirror_id = b.org_unit_id AND b.unit_parent_id IS NULL;
-- Đơn vị nhóm nằm trong chính nút bản sao của nó (điểm hạch toán riêng của nhóm).
UPDATE branches SET org_unit_id = org_mirror_id WHERE org_mirror_id IS NOT NULL AND org_unit_id IS DISTINCT FROM org_mirror_id;
UPDATE branches SET level_label = 'Cửa hàng' WHERE level_label = '' AND org_mirror_id IS NULL;

-- 3) Đường dẫn + cấp.
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
SELECT bizcity_unit_paths(id) FROM tenants;

-- 4) Bộ phận thuộc đơn vị.
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS branch_id bigint REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dimensions_branch_idx ON dimensions (tenant_id, branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN dimensions.branch_id IS 'Bộ phận (kind=department) thuộc đơn vị nào (0173).';
UPDATE dimensions d SET branch_id = b.id
  FROM branches b
 WHERE d.kind = 'department' AND d.branch_id IS NULL AND b.tenant_id = d.tenant_id AND b.department_code = d.code;
UPDATE dimensions d SET branch_id = b.id
  FROM org_units o JOIN branches b ON b.org_mirror_id = o.id
 WHERE d.kind = 'department' AND d.branch_id IS NULL AND o.tenant_id = d.tenant_id AND d.extra->>'orgUnitCode' = o.code;
-- Bộ phận mặc định tự tạo khi thêm đơn vị: gắn luôn đơn vị.
CREATE OR REPLACE FUNCTION bizcity_ensure_branch_department(p_tenant bigint, p_branch_id bigint, p_code text, p_name text, p_level text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
  v_code text := bizcity_branch_department_code(p_tenant, p_branch_id, p_code);
  v_parent text := CASE WHEN p_level = 'shop' THEN 'CN-CH' ELSE 'CN' END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dimensions WHERE tenant_id = p_tenant AND kind = 'department' AND code = v_parent) THEN v_parent := NULL; END IF;
  -- Chạy BEFORE INSERT của branches: dòng đơn vị chưa có → chưa gắn branch_id ở đây (trigger branches_link_department gắn sau khi chèn).
  INSERT INTO dimensions (tenant_id, kind, code, name, parent_code)
  VALUES (p_tenant, 'department', v_code, CASE WHEN p_level = 'shop' THEN 'Shop ' ELSE '' END || p_name, v_parent)
  ON CONFLICT (tenant_id, kind, code) DO UPDATE SET is_active = true, parent_code = COALESCE(EXCLUDED.parent_code, dimensions.parent_code);
  RETURN v_code;
END $fn$;
-- branches_own_department chạy BEFORE INSERT (id có rồi nhưng dòng chưa có) → gắn branch_id sau khi chèn.
CREATE OR REPLACE FUNCTION bizcity_link_branch_department() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.department_code IS NOT NULL THEN
    UPDATE dimensions SET branch_id = NEW.id WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = NEW.department_code AND branch_id IS NULL;
  END IF;
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS branches_link_department ON branches;
CREATE TRIGGER branches_link_department AFTER INSERT OR UPDATE OF department_code ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_link_branch_department();
UPDATE dimensions d SET branch_id = b.id
  FROM branches b
 WHERE d.kind = 'department' AND d.branch_id IS NULL AND b.tenant_id = d.tenant_id AND b.department_code = d.code;

-- 5) Chứng từ mang đơn vị / phân kho / bộ phận theo item_id.
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS branch_uid text;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS warehouse_uid text;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS department_uid text;
COMMENT ON COLUMN business_documents.branch_uid IS 'Đơn vị của chứng từ (cn_…, 0173), theo branch_code.';
COMMENT ON COLUMN business_documents.warehouse_uid IS 'Phân kho (kho_…, 0173): meta.warehouseCode / fromWarehouse, không có thì phân kho mặc định của đơn vị.';
COMMENT ON COLUMN business_documents.department_uid IS 'Bộ phận (pb_…, 0173): meta.departmentCode, không có thì bộ phận mặc định của đơn vị.';
CREATE INDEX IF NOT EXISTS business_documents_department_idx ON business_documents (tenant_id, department_uid) WHERE department_uid IS NOT NULL;
CREATE OR REPLACE FUNCTION bizcity_doc_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE b record;
BEGIN
  SELECT id, uid, department_code INTO b FROM branches WHERE tenant_id = NEW.tenant_id AND code = NEW.branch_code;
  NEW.branch_uid := b.uid;
  NEW.department_uid := COALESCE(
    (SELECT uid FROM dimensions WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = NULLIF(NEW.meta->>'departmentCode', '')),
    (SELECT uid FROM dimensions WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = b.department_code));
  NEW.warehouse_uid := COALESCE(
    (SELECT uid FROM warehouses WHERE tenant_id = NEW.tenant_id AND code = NULLIF(COALESCE(NEW.meta->>'warehouseCode', NEW.meta->>'fromWarehouse'), '')),
    (SELECT uid FROM warehouses WHERE tenant_id = NEW.tenant_id AND branch_id = b.id AND is_default ORDER BY code LIMIT 1));
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS business_documents_unit_ids ON business_documents;
CREATE TRIGGER business_documents_unit_ids BEFORE INSERT OR UPDATE OF branch_code, meta ON business_documents FOR EACH ROW EXECUTE FUNCTION bizcity_doc_unit_ids();
UPDATE business_documents SET branch_code = branch_code;

-- 6) Bộ phận chung chưa thuộc đơn vị nào (vd Ban giám đốc, Kế toán tổng hợp…) → thuộc công ty gốc lớn nhất của đơn vị sử dụng.
WITH goc AS (
  SELECT DISTINCT ON (b.tenant_id) b.tenant_id, b.id
    FROM branches b
   WHERE b.unit_parent_id IS NULL
   ORDER BY b.tenant_id, (SELECT count(*) FROM branches c WHERE c.tenant_id = b.tenant_id AND c.unit_path LIKE b.unit_path || '/%') DESC, b.id
)
UPDATE dimensions d SET branch_id = goc.id FROM goc
 WHERE d.tenant_id = goc.tenant_id AND d.kind = 'department' AND d.branch_id IS NULL;
