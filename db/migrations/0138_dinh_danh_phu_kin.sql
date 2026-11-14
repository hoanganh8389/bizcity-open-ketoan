-- [2026-11-13 Nguyễn Văn Thủy] Phủ kín bộ định danh cn_ / kho_ / dt_ cho 19 bảng cũ (nợ ghi ở test dinh-danh-canh-cua) (đóng góp)
--
-- Bảng có cột chi nhánh (branch_id) → branch_uid cn_…; cột kho (warehouse_code) → warehouse_uid kho_…; cột đối tượng (partner_id)
-- → partner_uid dt_…. Ba trigger dùng chung điền khi ghi mới và khi đổi chi nhánh / kho / đối tượng; dữ liệu cũ điền một lần ở đây.
-- Chạy lại an toàn (đã có cột / trigger / chỉ mục thì bỏ qua): bản cùng nội dung từng mang số 0137 vài phút trên main.
-- Định danh bất biến nên đổi mã chi nhánh, mã kho, mã đối tượng, sáp nhập, gộp cha – con về sau không làm lệch số đã ghi.

-- ── Trigger dùng chung ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_sync_branch_uid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    NEW.branch_uid := NULL;
  ELSIF TG_OP = 'INSERT' AND NEW.branch_uid IS NULL OR TG_OP = 'UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    SELECT uid INTO NEW.branch_uid FROM branches WHERE id = NEW.branch_id;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_sync_branch_uid() IS 'Điền định danh chi nhánh cn_… (branch_uid) theo branch_id khi ghi / đổi chi nhánh (0138).';

CREATE OR REPLACE FUNCTION bizcity_sync_partner_uid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.partner_id IS NULL THEN
    NEW.partner_uid := NULL;
  ELSIF TG_OP = 'INSERT' AND NEW.partner_uid IS NULL OR TG_OP = 'UPDATE' AND NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    SELECT uid INTO NEW.partner_uid FROM partners WHERE id = NEW.partner_id; -- partner_id = 0 (không theo đối tượng) → NULL
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_sync_partner_uid() IS 'Điền định danh đối tượng dt_… (partner_uid) theo partner_id khi ghi / đổi đối tượng (0138).';

CREATE OR REPLACE FUNCTION bizcity_sync_warehouse_uid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.warehouse_code, '') = '' THEN
    NEW.warehouse_uid := NULL;
  ELSIF TG_OP = 'INSERT' AND NEW.warehouse_uid IS NULL OR TG_OP = 'UPDATE' AND NEW.warehouse_code IS DISTINCT FROM OLD.warehouse_code THEN
    SELECT uid INTO NEW.warehouse_uid FROM warehouses WHERE tenant_id = NEW.tenant_id AND code = NEW.warehouse_code;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_sync_warehouse_uid() IS 'Điền định danh phân kho kho_… (warehouse_uid) theo mã kho lúc ghi / đổi kho (0138).';

-- ── Cột + trigger + điền dữ liệu cũ ─────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  -- Bút toán (chỉ ghi thêm): tạm tắt khoá chống sửa trong lúc điền cột định danh còn trống, mọi cột khác giữ nguyên.
  ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_no_update;
  ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_header_audit;

  FOREACH t IN ARRAY ARRAY['accounting_events', 'asset_allocations', 'assets', 'cash_plans', 'cost_norms', 'debt_items', 'inventory_lot_moves',
                           'ledger_balances_daily', 'ledger_entries', 'period_lock_events', 'period_locks', 'tax_invoices', 'warehouses'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS branch_uid text', t);
    EXECUTE format('COMMENT ON COLUMN %I.branch_uid IS %L', t, 'Định danh bất biến chi nhánh / shop cn_… theo branch_id (0138, trigger điền).');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_branch_uid', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF branch_id ON %I FOR EACH ROW EXECUTE FUNCTION bizcity_sync_branch_uid()', t || '_branch_uid', t);
    EXECUTE format('COMMENT ON TRIGGER %I ON %I IS %L', t || '_branch_uid', t, 'Điền định danh chi nhánh cn_… (0138).');
    EXECUTE format('UPDATE %I x SET branch_uid = b.uid FROM branches b WHERE b.id = x.branch_id AND x.branch_uid IS NULL', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['accounting_events', 'cash_plans', 'debt_items', 'item_lots', 'ledger_balances_daily', 'ledger_entries',
                           'long_term_balances', 'payment_requests', 'reference_documents', 'tax_invoices'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS partner_uid text', t);
    EXECUTE format('COMMENT ON COLUMN %I.partner_uid IS %L', t, 'Định danh bất biến đối tượng dt_… theo partner_id (0138, trigger điền); NULL = không theo đối tượng.');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_partner_uid', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF partner_id ON %I FOR EACH ROW EXECUTE FUNCTION bizcity_sync_partner_uid()', t || '_partner_uid', t);
    EXECUTE format('COMMENT ON TRIGGER %I ON %I IS %L', t || '_partner_uid', t, 'Điền định danh đối tượng dt_… (0138).');
    EXECUTE format('UPDATE %I x SET partner_uid = p.uid FROM partners p WHERE p.id = x.partner_id AND x.partner_uid IS NULL', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['inventory_lot_moves', 'stock_counts', 'stock_levels'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS warehouse_uid text', t);
    EXECUTE format('COMMENT ON COLUMN %I.warehouse_uid IS %L', t, 'Định danh bất biến phân kho kho_… theo mã kho lúc ghi (0138, trigger điền).');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_warehouse_uid', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF warehouse_code ON %I FOR EACH ROW EXECUTE FUNCTION bizcity_sync_warehouse_uid()', t || '_warehouse_uid', t);
    EXECUTE format('COMMENT ON TRIGGER %I ON %I IS %L', t || '_warehouse_uid', t, 'Điền định danh phân kho kho_… (0138).');
    EXECUTE format('UPDATE %I x SET warehouse_uid = w.uid FROM warehouses w WHERE w.tenant_id = x.tenant_id AND w.code = x.warehouse_code AND x.warehouse_uid IS NULL', t);
  END LOOP;

  ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_header_audit;
  ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_no_update;
END $$;

CREATE INDEX IF NOT EXISTS ledger_entries_partner_uid ON ledger_entries (tenant_id, partner_uid) WHERE partner_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_balances_daily_partner_uid ON ledger_balances_daily (tenant_id, partner_uid) WHERE partner_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS tax_invoices_partner_uid ON tax_invoices (tenant_id, partner_uid) WHERE partner_uid IS NOT NULL;
