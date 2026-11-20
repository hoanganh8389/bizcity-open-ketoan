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

-- 7. Người tạo / ngày tạo / người sửa / ngày sửa cho đơn vị, phân kho, bộ phận (bảng hiện, mặc định ẩn cột).
--    Người lấy từ ketoan.actor_name của giao dịch (API đặt trước khi ghi); trống thì để trống.
ALTER TABLE branches    ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
                        ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '',
                        ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE warehouses  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
                        ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '';
ALTER TABLE dimensions  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
                        ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
                        ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '',
                        ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE OR REPLACE FUNCTION bizcity_stamp_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_by text := COALESCE(NULLIF(current_setting('ketoan.actor_name', true), ''), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.created_by, '') = '' THEN NEW.created_by := v_by; END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    IF NEW IS DISTINCT FROM OLD THEN
      NEW.updated_at := now();
      IF v_by <> '' THEN NEW.updated_by := v_by; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS branches_stamp_actor ON branches;
CREATE TRIGGER branches_stamp_actor BEFORE INSERT OR UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_stamp_actor();
DROP TRIGGER IF EXISTS warehouses_stamp_actor ON warehouses;
CREATE TRIGGER warehouses_stamp_actor BEFORE INSERT OR UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_stamp_actor();
DROP TRIGGER IF EXISTS dimensions_stamp_actor ON dimensions;
CREATE TRIGGER dimensions_stamp_actor BEFORE INSERT OR UPDATE ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_stamp_actor();

-- 8a. Đơn vị nào chưa có bộ phận riêng thì tạo (mỗi đơn vị luôn có một bộ phận).
DO $$
DECLARE b record;
BEGIN
  FOR b IN SELECT * FROM branches x WHERE COALESCE(x.department_code, '') = ''
              OR NOT EXISTS (SELECT 1 FROM dimensions d WHERE d.branch_id = x.id AND d.kind = 'department') LOOP
    UPDATE branches SET department_code = bizcity_ensure_branch_department(b.tenant_id, b.id, b.code, b.name, COALESCE(b.level, '')) WHERE id = b.id;
  END LOOP;
END $$;

-- 8. Mọi bảng chứng từ mang đủ ba định danh nhỏ nhất: đơn vị cn_ (branch_uid), phân kho kho_ (warehouse_uid), bộ phận pb_ (department_uid).
--    Không chọn bộ phận → bộ phận mặc định của đơn vị; không chọn phân kho → phân kho mặc định của đơn vị.
--    Bảng chuyển kho có hai đầu: from_/to_branch_uid + from_/to_warehouse_uid, bộ phận theo đầu xuất.
CREATE OR REPLACE FUNCTION bizcity_resolve_unit_uids(p_tenant bigint, p_branch_id bigint, p_branch_code text, p_dept text, p_wh text,
                                                     OUT branch_uid text, OUT warehouse_uid text, OUT department_uid text)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_bid bigint; v_dept text;
BEGIN
  IF p_branch_id IS NOT NULL THEN
    SELECT b.id, b.uid, b.department_code INTO v_bid, branch_uid, v_dept FROM branches b WHERE b.id = p_branch_id;
  ELSIF COALESCE(p_branch_code, '') <> '' THEN
    SELECT b.id, b.uid, b.department_code INTO v_bid, branch_uid, v_dept FROM branches b WHERE b.tenant_id = p_tenant AND b.code = p_branch_code;
  END IF;
  IF COALESCE(p_dept, '') <> '' THEN
    SELECT d.uid INTO department_uid FROM dimensions d WHERE d.tenant_id = p_tenant AND d.kind = 'department' AND d.code = p_dept;
  END IF;
  IF department_uid IS NULL AND v_bid IS NOT NULL THEN
    SELECT d.uid INTO department_uid FROM dimensions d
     WHERE d.tenant_id = p_tenant AND d.kind = 'department' AND (d.code = v_dept OR d.branch_id = v_bid)
     ORDER BY (d.code = v_dept) DESC NULLS LAST, d.id LIMIT 1;
  END IF;
  IF COALESCE(p_wh, '') <> '' THEN
    SELECT w.uid INTO warehouse_uid FROM warehouses w WHERE w.tenant_id = p_tenant AND w.code = p_wh;
  END IF;
  IF warehouse_uid IS NULL AND v_bid IS NOT NULL THEN
    SELECT w.uid INTO warehouse_uid FROM warehouses w WHERE w.branch_id = v_bid AND w.is_active ORDER BY w.is_default DESC, w.id LIMIT 1;
  END IF;
END $$;
COMMENT ON FUNCTION bizcity_resolve_unit_uids(bigint, bigint, text, text, text) IS 'Đơn vị / phân kho / bộ phận item_id của một chứng từ; trống thì lấy mặc định của đơn vị (0173).';

-- Trigger chung: đọc cột chi nhánh (branch_id / branch_code), mã bộ phận (department_code hoặc departmentCode trong data / payload / meta),
-- mã kho (warehouse_code hoặc warehouseCode trong JSON). Chỉ điền cột trống; cột chi nhánh / kho do trigger cũ điền thì giữ nguyên.
CREATE OR REPLACE FUNCTION bizcity_fill_unit_uids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j jsonb := to_jsonb(NEW); x jsonb; r record; v jsonb := '{}';
BEGIN
  x := COALESCE(j->'data', j->'payload', j->'meta', '{}'::jsonb);
  IF jsonb_typeof(x) <> 'object' THEN x := '{}'::jsonb; END IF;
  SELECT * INTO r FROM bizcity_resolve_unit_uids(NEW.tenant_id, NULLIF(j->>'branch_id', '')::bigint, j->>'branch_code',
                                                 COALESCE(NULLIF(j->>'department_code', ''), x->>'departmentCode'),
                                                 COALESCE(NULLIF(j->>'warehouse_code', ''), x->>'warehouseCode', x->>'fromWarehouse'));
  IF j ? 'branch_uid' AND (j->>'branch_uid' IS NULL OR (TG_OP = 'UPDATE' AND NOT j ? 'branch_id')) THEN v := v || jsonb_build_object('branch_uid', r.branch_uid); END IF;
  IF j ? 'warehouse_uid' AND (j->>'warehouse_uid' IS NULL OR (TG_OP = 'UPDATE' AND NOT j ? 'warehouse_code')) THEN v := v || jsonb_build_object('warehouse_uid', r.warehouse_uid); END IF;
  IF j ? 'department_uid' THEN v := v || jsonb_build_object('department_uid', r.department_uid); END IF;
  IF v <> '{}'::jsonb THEN NEW := jsonb_populate_record(NEW, v); END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_fill_unit_uids() IS 'Điền branch_uid / warehouse_uid / department_uid của chứng từ (0173).';

CREATE OR REPLACE FUNCTION bizcity_fill_transfer_uids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j jsonb := to_jsonb(NEW); a record; b record;
BEGIN
  SELECT * INTO a FROM bizcity_resolve_unit_uids(NEW.tenant_id, NULL, COALESCE(j->>'from_branch_code', j->>'from_branch'), j->'data'->>'departmentCode', j->>'from_warehouse');
  SELECT * INTO b FROM bizcity_resolve_unit_uids(NEW.tenant_id, NULL, COALESCE(j->>'to_branch_code', j->>'to_branch'), NULL, j->>'to_warehouse');
  NEW := jsonb_populate_record(NEW, jsonb_build_object('from_branch_uid', a.branch_uid, 'from_warehouse_uid', a.warehouse_uid, 'department_uid', a.department_uid,
                                                       'to_branch_uid', b.branch_uid, 'to_warehouse_uid', b.warehouse_uid));
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_fill_transfer_uids() IS 'Chuyển kho hai đầu: đơn vị / phân kho item_id đầu xuất, đầu nhận + bộ phận đầu xuất (0173).';

DO $$
DECLARE t text; c text; cols text[];
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_documents', 'payment_requests', 'reference_documents', 'stock_max_requests', 'stock_counts',
                           'accounting_events', 'inventory_movements', 'tax_invoices', 'debt_items', 'cost_norms'] LOOP
    cols := ARRAY['department_uid'];
    IF t IN ('purchase_documents', 'payment_requests', 'reference_documents', 'stock_max_requests', 'stock_counts') THEN cols := cols || 'branch_uid'::text; END IF;
    IF t IN ('purchase_documents', 'accounting_events', 'inventory_movements', 'stock_counts') THEN cols := cols || 'warehouse_uid'::text; END IF;
    FOREACH c IN ARRAY cols LOOP
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I text', t, c);
      EXECUTE format('COMMENT ON COLUMN %I.%I IS %L', t, c, 'Định danh bất biến ' || CASE c WHEN 'branch_uid' THEN 'đơn vị cn_…' WHEN 'warehouse_uid' THEN 'phân kho kho_…' ELSE 'bộ phận pb_…' END || ' (0173, trigger điền).');
    END LOOP;
    EXECUTE format('DROP TRIGGER IF EXISTS zz_unit_uids ON %I', t);
    EXECUTE format('CREATE TRIGGER zz_unit_uids BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bizcity_fill_unit_uids()', t);
    -- điền dữ liệu cũ không chạy trigger khác (đồng bộ sổ chứng từ, khoá chống sửa)
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', t);
    EXECUTE format($q$UPDATE %I x SET (%s) = (SELECT %s FROM bizcity_resolve_unit_uids(x.tenant_id, %s, %s, %s, %s) r)$q$, t,
      (SELECT string_agg(format('%I', c2), ', ') FROM unnest(cols) c2),
      (SELECT string_agg(format('COALESCE(x.%I, r.%I)', c2, c2), ', ') FROM unnest(cols) c2),
      CASE WHEN t IN ('accounting_events', 'inventory_movements', 'tax_invoices', 'debt_items', 'cost_norms') THEN 'x.branch_id' ELSE 'NULL' END,
      CASE WHEN t IN ('accounting_events', 'inventory_movements', 'tax_invoices', 'debt_items', 'cost_norms') THEN 'NULL' ELSE 'x.branch_code' END,
      CASE WHEN t = 'cost_norms' THEN 'x.department_code'
           WHEN t IN ('purchase_documents', 'stock_max_requests') THEN $s$x.data->>'departmentCode'$s$
           WHEN t = 'accounting_events' THEN $s$x.payload->>'departmentCode'$s$ ELSE 'NULL' END,
      CASE WHEN t IN ('inventory_movements', 'stock_counts') THEN 'x.warehouse_code'
           WHEN t = 'purchase_documents' THEN $s$x.data->>'warehouseCode'$s$
           WHEN t = 'accounting_events' THEN $s$COALESCE(x.payload->>'warehouseCode', x.payload->>'fromWarehouse')$s$ ELSE 'NULL' END);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['stock_transfer_docs', 'transfer_requests'] LOOP
    FOREACH c IN ARRAY ARRAY['from_branch_uid', 'from_warehouse_uid', 'to_branch_uid', 'to_warehouse_uid', 'department_uid'] LOOP
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I text', t, c);
    END LOOP;
    EXECUTE format('DROP TRIGGER IF EXISTS zz_unit_uids ON %I', t);
    EXECUTE format('CREATE TRIGGER zz_unit_uids BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bizcity_fill_transfer_uids()', t);
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', t);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER zz_unit_uids', t);
    EXECUTE format('UPDATE %I SET id = id', t);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', t);
  END LOOP;
END $$;

-- 9. Thẻ hướng dẫn DM16 theo mô hình mới (docs/huong-dan/so-do-to-chuc.md).
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

-- 10. Bộ phận cha – con trong CÙNG đơn vị (không bắt buộc), ví dụ Kế toán → Kế toán thuế.
--     Quan hệ cũ trỏ sang bộ phận của đơn vị khác (shop → "CN" ở công ty) bỏ đi, giá trị cũ giữ ở extra.parentCodeCu.
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
  IF v_b IS DISTINCT FROM NEW.branch_id AND TG_OP = 'UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id AND NEW.parent_code IS NOT DISTINCT FROM OLD.parent_code THEN
    NEW.parent_code := NULL; RETURN NEW; -- chuyển đơn vị: bỏ cha cũ
  END IF;
  IF v_b IS DISTINCT FROM NEW.branch_id THEN
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

-- Bộ phận chuyển sang đơn vị khác: bộ phận con ở đơn vị cũ thôi nhận nó làm cha.
CREATE OR REPLACE FUNCTION bizcity_dept_moved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'department' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    UPDATE dimensions SET parent_code = NULL
     WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND parent_code = NEW.code AND branch_id IS DISTINCT FROM NEW.branch_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS dimensions_dept_moved ON dimensions;
CREATE TRIGGER dimensions_dept_moved AFTER UPDATE OF branch_id ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_dept_moved();

-- Bộ phận mặc định tự tạo khi thêm đơn vị: không gắn cha (cha – con chỉ trong cùng đơn vị, người dùng tự đặt).
CREATE OR REPLACE FUNCTION bizcity_ensure_branch_department(p_tenant bigint, p_branch_id bigint, p_code text, p_name text, p_level text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
  v_code text := bizcity_branch_department_code(p_tenant, p_branch_id, p_code);
BEGIN
  INSERT INTO dimensions (tenant_id, kind, code, name)
  VALUES (p_tenant, 'department', v_code, CASE WHEN p_level = 'shop' THEN 'Shop ' ELSE '' END || p_name)
  ON CONFLICT (tenant_id, kind, code) DO UPDATE SET is_active = true;
  RETURN v_code;
END $fn$;
