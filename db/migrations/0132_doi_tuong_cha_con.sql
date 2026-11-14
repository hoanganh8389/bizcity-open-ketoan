-- [2026-11-13 Nguyễn Văn Thủy] Đối tượng (nhà cung cấp, khách hàng) có định danh bất biến dt_ và quan hệ cha – con (đóng góp)
--
-- 1. partners.uid = dt_<ULID>: định danh bất biến (như kho_, cn_, cc_, pb_). Một tiền tố chung vì một đối tượng đứng được
--    hai vai (vừa nhà cung cấp vừa khách hàng) — vai trò nằm ở kind / also_kinds, không nằm trong định danh.
-- 2. partners.parent_uid: đơn vị cha (trỏ theo định danh, không theo mã). Nhiều cấp: công ty mẹ → chi nhánh → …
--    Chặn: tự làm cha của mình, vòng lặp, cha ở đơn vị (tenant) khác.
-- Chứng từ vẫn ghi vào đúng đơn vị (đơn vị xuất / nhận hoá đơn); cha dùng để gom doanh số, công nợ, tính thưởng.

ALTER TABLE partners ADD COLUMN uid text;
UPDATE partners SET uid = 'dt_' || bizcity_ulid() WHERE uid IS NULL;
ALTER TABLE partners ALTER COLUMN uid SET DEFAULT 'dt_' || bizcity_ulid(), ALTER COLUMN uid SET NOT NULL;
CREATE UNIQUE INDEX partners_uid ON partners (uid);
CREATE TRIGGER partners_uid_guard BEFORE UPDATE OF uid ON partners FOR EACH ROW EXECUTE FUNCTION bizcity_uid_guard();
COMMENT ON COLUMN partners.uid IS 'Định danh bất biến của đối tượng: dt_<ULID> (0132). Không mang vai trò — một đối tượng có thể vừa là NCC vừa là khách hàng.';

ALTER TABLE partners ADD COLUMN parent_uid text REFERENCES partners (uid) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX partners_parent ON partners (tenant_id, parent_uid) WHERE parent_uid IS NOT NULL;
COMMENT ON COLUMN partners.parent_uid IS 'Đơn vị cha (partners.uid) — vd chi nhánh của nhà cung cấp / khách hàng thuộc công ty mẹ (0132). Trống = đơn vị gốc.';

CREATE OR REPLACE FUNCTION bizcity_partner_parent_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_tenant bigint; v_cur text; v_depth int := 0;
BEGIN
  IF NEW.parent_uid IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_uid = NEW.uid THEN
    RAISE EXCEPTION 'Đối tượng % không làm đơn vị cha của chính mình', NEW.code USING ERRCODE = 'check_violation';
  END IF;
  SELECT tenant_id INTO v_tenant FROM partners WHERE uid = NEW.parent_uid;
  IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Đơn vị cha không cùng đơn vị kế toán' USING ERRCODE = 'check_violation';
  END IF;
  -- Đi ngược lên các cấp cha: gặp lại chính mình là vòng lặp.
  v_cur := NEW.parent_uid;
  WHILE v_cur IS NOT NULL AND v_depth < 50 LOOP
    IF v_cur = NEW.uid THEN
      RAISE EXCEPTION 'Không chọn được: % đang là cấp trên của đơn vị cha đã chọn (vòng lặp)', NEW.code USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_uid INTO v_cur FROM partners WHERE uid = v_cur;
    v_depth := v_depth + 1;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER partners_parent_check BEFORE INSERT OR UPDATE OF parent_uid ON partners FOR EACH ROW EXECUTE FUNCTION bizcity_partner_parent_check();
COMMENT ON FUNCTION bizcity_partner_parent_check() IS 'Đơn vị cha của đối tượng: cùng tenant, không tự trỏ, không vòng lặp (0132).';


-- ── Định danh đối tượng xuyên suốt: sổ cái và chứng từ mua hàng lưu dt_ của ĐƠN VỊ NHỎ NHẤT (đơn vị con ghi trên chứng từ).
--    Báo cáo gom lên cha bằng cây partners.parent_uid; đổi mã / tên / cha sau này không làm lệch số đã ghi.
ALTER TABLE ledger_lines ADD COLUMN partner_uid text;
COMMENT ON COLUMN ledger_lines.partner_uid IS 'Định danh bất biến dt_… của đối tượng công nợ của dòng (theo partner_id lúc ghi) (0132).';
CREATE OR REPLACE FUNCTION bizcity_fill_partner_uid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.partner_uid IS NULL AND NEW.partner_id IS NOT NULL THEN
    SELECT uid INTO NEW.partner_uid FROM partners WHERE id = NEW.partner_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_lines_partner_uid BEFORE INSERT ON ledger_lines FOR EACH ROW EXECUTE FUNCTION bizcity_fill_partner_uid();
COMMENT ON FUNCTION bizcity_fill_partner_uid() IS 'Dòng sổ ghi định danh đối tượng theo partner_id (0132).';

-- Guard sổ cái: thêm partner_uid vào ngoại lệ "điền cột còn trống" (như department_uid ở 0130), giữ nguyên các luật khác.
CREATE OR REPLACE FUNCTION public.guard_ledger_line_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 0066 (B2b): gắn định danh mặt hàng cho dòng đã ghi — chỉ từ NULL → có giá trị, mọi cột khác giữ nguyên.
  IF TG_OP = 'UPDATE' AND OLD.item_id IS NULL AND NEW.item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') THEN
    RETURN NEW;
  END IF;
  -- 0121 / 0130 / 0132: điền kho / MST / phòng ban / đối tượng còn trống — mọi cột khác giữ nguyên, giá trị đã có không đổi.
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'branch_uid' - 'warehouse_uid' - 'warehouse_code' - 'tax_id' - 'department_uid' - 'partner_uid') = (to_jsonb(OLD) - 'branch_uid' - 'warehouse_uid' - 'warehouse_code' - 'tax_id' - 'department_uid' - 'partner_uid')
     AND (OLD.branch_uid IS NULL OR NEW.branch_uid IS NOT DISTINCT FROM OLD.branch_uid)
     AND (OLD.warehouse_uid IS NULL OR NEW.warehouse_uid IS NOT DISTINCT FROM OLD.warehouse_uid)
     AND (OLD.department_uid IS NULL OR NEW.department_uid IS NOT DISTINCT FROM OLD.department_uid)
     AND (OLD.partner_uid IS NULL OR NEW.partner_uid IS NOT DISTINCT FROM OLD.partner_uid)
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
     AND NEW.partner_uid IS NOT DISTINCT FROM OLD.partner_uid
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

ALTER TABLE ledger_lines DISABLE TRIGGER ledger_lines_balanced_update;
UPDATE ledger_lines l SET partner_uid = p.uid FROM partners p WHERE l.partner_uid IS NULL AND l.partner_id = p.id;
ALTER TABLE ledger_lines ENABLE TRIGGER ledger_lines_balanced_update;
CREATE INDEX ledger_lines_partner_uid ON ledger_lines (tenant_id, partner_uid, posting_date) WHERE partner_uid IS NOT NULL;

ALTER TABLE purchase_documents ADD COLUMN partner_uid text;
COMMENT ON COLUMN purchase_documents.partner_uid IS 'Định danh bất biến dt_… của nhà cung cấp trên chứng từ (theo partner_code lúc ghi) (0132).';
CREATE OR REPLACE FUNCTION bizcity_purchase_partner_uid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.partner_code IS DISTINCT FROM OLD.partner_code OR NEW.partner_uid IS NULL THEN
    SELECT uid INTO NEW.partner_uid FROM partners WHERE tenant_id = NEW.tenant_id AND code = NEW.partner_code;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_documents_partner_uid BEFORE INSERT OR UPDATE ON purchase_documents FOR EACH ROW EXECUTE FUNCTION bizcity_purchase_partner_uid();
UPDATE purchase_documents d SET partner_uid = p.uid FROM partners p WHERE d.partner_uid IS NULL AND p.tenant_id = d.tenant_id AND p.code = d.partner_code;
