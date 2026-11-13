-- [2026-11-13 Nguyễn Văn Thủy] sửa guard sổ cái: giữ luật 0091 (điền giá vốn chỉ qua hàm, không qua cờ phiên) cùng ngoại lệ 0121 (đóng góp)
-- 0122 Bản guard trong 0121 lỡ chép từ 0066 (cho điền giá vốn bằng cờ phiên ketoan.cost_overwrite) — 0091 đã bỏ lối đó.
--   Khôi phục: điền giá vốn chỉ khi current_user = ketoan_ledger_cost (hàm SECURITY DEFINER); giữ ngoại lệ điền kho / MST còn trống.
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
