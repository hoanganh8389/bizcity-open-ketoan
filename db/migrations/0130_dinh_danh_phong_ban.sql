-- [2026-11-13 Nguyễn Văn Thủy] Định danh bất biến cho phòng ban (và mọi chiều phân tích), lưu vào từng dòng sổ (đóng góp)
--
-- Như chi nhánh (cn_…), kho (kho_…), cơ cấu (cc_…) ở 0121: mỗi mục danh mục chiều phân tích có uid bất biến —
--   phòng ban pb_<ULID>, mục khác dm_<ULID>. Không sửa được (guard).
-- ledger_lines.department_uid: khi ghi dòng, lấy theo mã phòng ban trong dims (department) → uid. Sau này đổi tên,
--   đổi mã hay ngừng phòng ban, dòng sổ vẫn bám đúng phòng ban. Dòng cũ điền một lần (chỉ từ trống → có, guard cho phép).

ALTER TABLE dimensions ADD COLUMN uid text;
UPDATE dimensions SET uid = CASE WHEN kind = 'department' THEN 'pb_' ELSE 'dm_' END || bizcity_ulid() WHERE uid IS NULL;

CREATE OR REPLACE FUNCTION bizcity_dimension_uid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.uid IS NULL THEN NEW.uid := CASE WHEN NEW.kind = 'department' THEN 'pb_' ELSE 'dm_' END || bizcity_ulid(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dimensions_uid BEFORE INSERT ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_dimension_uid();
COMMENT ON FUNCTION bizcity_dimension_uid() IS 'Mục chiều phân tích mới có định danh bất biến: phòng ban pb_<ULID>, mục khác dm_<ULID> (0130).';

ALTER TABLE dimensions ALTER COLUMN uid SET NOT NULL;
CREATE UNIQUE INDEX dimensions_uid_key ON dimensions (uid);
CREATE TRIGGER dimensions_uid_guard BEFORE UPDATE OF uid ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_uid_guard();
COMMENT ON COLUMN dimensions.uid IS 'Định danh bất biến: phòng ban pb_<ULID>, mục khác dm_<ULID> (0130).';

ALTER TABLE ledger_lines ADD COLUMN department_uid text;
COMMENT ON COLUMN ledger_lines.department_uid IS 'Định danh bất biến phòng ban pb_… của dòng (theo dims.department lúc ghi) (0130).';

CREATE OR REPLACE FUNCTION bizcity_fill_department_uid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_code text := nullif(btrim(coalesce(NEW.dims ->> 'department', '')), '');
BEGIN
  IF NEW.department_uid IS NULL AND v_code IS NOT NULL THEN
    SELECT uid INTO NEW.department_uid FROM dimensions WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = v_code;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_lines_department_uid BEFORE INSERT ON ledger_lines FOR EACH ROW EXECUTE FUNCTION bizcity_fill_department_uid();
COMMENT ON FUNCTION bizcity_fill_department_uid() IS 'Dòng sổ ghi định danh phòng ban theo mã phòng ban trong dims (0130).';

-- Guard sổ cái: thêm department_uid vào ngoại lệ "điền cột còn trống" (0121/0122), giữ nguyên các luật khác.
CREATE OR REPLACE FUNCTION public.guard_ledger_line_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 0066 (B2b): gắn định danh mặt hàng cho dòng đã ghi — chỉ từ NULL → có giá trị, mọi cột khác giữ nguyên.
  IF TG_OP = 'UPDATE' AND OLD.item_id IS NULL AND NEW.item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') THEN
    RETURN NEW;
  END IF;
  -- 0121 / 0130: điền kho / MST / phòng ban còn trống — mọi cột khác giữ nguyên, giá trị đã có không đổi.
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'branch_uid' - 'warehouse_uid' - 'warehouse_code' - 'tax_id' - 'department_uid') = (to_jsonb(OLD) - 'branch_uid' - 'warehouse_uid' - 'warehouse_code' - 'tax_id' - 'department_uid')
     AND (OLD.branch_uid IS NULL OR NEW.branch_uid IS NOT DISTINCT FROM OLD.branch_uid)
     AND (OLD.warehouse_uid IS NULL OR NEW.warehouse_uid IS NOT DISTINCT FROM OLD.warehouse_uid)
     AND (OLD.department_uid IS NULL OR NEW.department_uid IS NOT DISTINCT FROM OLD.department_uid)
     AND (coalesce(OLD.warehouse_code, '') = '' OR NEW.warehouse_code IS NOT DISTINCT FROM OLD.warehouse_code)
     AND (coalesce(OLD.tax_id, '') = '' OR NEW.tax_id IS NOT DISTINCT FROM OLD.tax_id) THEN
    RETURN NEW;
  END IF;
  -- 0091 (E1): điền giá vốn chỉ qua hàm ledger_fill_cost_lines (chủ hàm ketoan_ledger_cost); cờ phiên cũ không còn tác dụng.
  IF TG_OP = 'UPDATE'
     AND current_user = 'ketoan_ledger_cost'
     AND OLD.cost_fill IS NOT NULL AND NEW.cost_fill IS NOT DISTINCT FROM OLD.cost_fill
     AND NEW.entry_id = OLD.entry_id AND NEW.tenant_id = OLD.tenant_id AND NEW.branch_id = OLD.branch_id
     AND NEW.posting_date = OLD.posting_date AND NEW.line_no = OLD.line_no AND NEW.pair_no = OLD.pair_no
     AND NEW.account_code = OLD.account_code AND NEW.part = OLD.part
     AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.product_sku IS NOT DISTINCT FROM OLD.product_sku
     AND NEW.item_id IS NOT DISTINCT FROM OLD.item_id
     AND NEW.branch_uid IS NOT DISTINCT FROM OLD.branch_uid AND NEW.warehouse_uid IS NOT DISTINCT FROM OLD.warehouse_uid
     AND NEW.department_uid IS NOT DISTINCT FROM OLD.department_uid
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

-- Dòng sổ đã ghi: điền định danh phòng ban theo mã
ALTER TABLE ledger_lines DISABLE TRIGGER ledger_lines_balanced_update;
UPDATE ledger_lines l SET department_uid = d.uid
  FROM dimensions d
 WHERE l.department_uid IS NULL AND d.tenant_id = l.tenant_id AND d.kind = 'department'
   AND d.code = nullif(btrim(coalesce(l.dims ->> 'department', '')), '');
ALTER TABLE ledger_lines ENABLE TRIGGER ledger_lines_balanced_update;

CREATE INDEX ledger_lines_department_uid ON ledger_lines (tenant_id, department_uid, posting_date) WHERE department_uid IS NOT NULL;
