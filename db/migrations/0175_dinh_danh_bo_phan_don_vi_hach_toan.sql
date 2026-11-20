-- [2026-11-20 Nguyễn Văn Thủy] Bộ phận (dimensions) và đơn vị hạch toán (accounting_units) có branch_id (0173, 0174) → mang thêm định danh đơn vị cn_ (branch_uid) như mọi bảng khác (luật canh cửa 0138) (đóng góp)
--
-- Mỗi bảng một trigger, dùng hàm điền chung bizcity_sync_branch_uid (0138): ghi mới hoặc đổi đơn vị thì điền lại branch_uid.

ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS branch_uid text;
COMMENT ON COLUMN dimensions.branch_uid IS 'Định danh bất biến đơn vị cn_… của bộ phận theo branch_id (0175, trigger điền).';
DROP TRIGGER IF EXISTS dimensions_branch_uid ON dimensions;
CREATE TRIGGER dimensions_branch_uid BEFORE INSERT OR UPDATE OF branch_id ON dimensions FOR EACH ROW EXECUTE FUNCTION bizcity_sync_branch_uid();
UPDATE dimensions d SET branch_uid = b.uid FROM branches b WHERE b.id = d.branch_id AND d.branch_uid IS DISTINCT FROM b.uid;

ALTER TABLE accounting_units ADD COLUMN IF NOT EXISTS branch_uid text;
COMMENT ON COLUMN accounting_units.branch_uid IS 'Định danh bất biến đơn vị cn_… là điểm tính giá vốn của đơn vị hạch toán (0175, trigger điền).';
DROP TRIGGER IF EXISTS accounting_units_branch_uid ON accounting_units;
CREATE TRIGGER accounting_units_branch_uid BEFORE INSERT OR UPDATE OF branch_id ON accounting_units FOR EACH ROW EXECUTE FUNCTION bizcity_sync_branch_uid();
UPDATE accounting_units a SET branch_uid = b.uid FROM branches b WHERE b.id = a.branch_id AND a.branch_uid IS DISTINCT FROM b.uid;

-- Bộ phận chưa gắn đơn vị mà chọn cha → thuộc đơn vị của cha: điền luôn branch_uid (0173 bản trước chỉ gán branch_id).
CREATE OR REPLACE FUNCTION bizcity_dept_parent_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_b bigint; v_cur text := NEW.parent_code; n int := 0;
BEGIN
  IF NEW.kind <> 'department' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.parent_code, '') = '' THEN NEW.parent_code := NULL; RETURN NEW; END IF;
  IF NEW.parent_code = NEW.code THEN RAISE EXCEPTION 'Bộ phận % không thể là cha của chính nó', NEW.code USING ERRCODE = 'check_violation'; END IF;
  SELECT branch_id INTO v_b FROM dimensions WHERE tenant_id = NEW.tenant_id AND kind = 'department' AND code = NEW.parent_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bộ phận cha % không có', NEW.parent_code USING ERRCODE = 'check_violation'; END IF;
  -- Bộ phận chưa gắn đơn vị mà chọn cha → thuộc đơn vị của cha (dữ liệu mẫu, danh mục chiều phân tích cũ, nhập Excel).
  IF NEW.branch_id IS NULL AND v_b IS NOT NULL THEN
    NEW.branch_id := v_b;
    NEW.branch_uid := (SELECT uid FROM branches WHERE id = v_b); -- trigger dimensions_branch_uid không chạy lại khi gán ở đây
  END IF;
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
