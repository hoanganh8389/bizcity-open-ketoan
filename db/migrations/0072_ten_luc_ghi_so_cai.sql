-- [2026-11-05 07:40 PM Nguyễn Văn Thủy] PHASE-026 — S026-23 (docs/core/06-xuong-ca-dinh-danh.md): dòng sổ cái lưu cả tên mặt hàng lúc ghi
-- [2026-11-05 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — nhận đóng góp vào framework: Nguyễn Văn Thủy rà và gộp theo uỷ quyền review / merge
-- =============================================================================
-- 0072 Tên lúc ghi trên dòng sổ cái.
--   Sổ kho và chứng từ đã lưu tên lúc ghi, dòng sổ cái mới có mã và item_id.
--   ledger_lines.product_name      tên tại thời điểm ghi, trigger điền theo item_id, không đổi về sau.
--   bizcity_item_name_now          tên hiện tại theo mã hiện hành, cho báo cáo gom theo mặt hàng.
--   Dòng đã ghi giữ nguyên, cột để trống: sổ cái chỉ thêm, báo cáo hiện tên hiện tại cho các dòng này.
--   Tên không vào dấu vân tay bút toán: đổi tên rồi định khoản lại vẫn giữ bút toán cũ.
-- =============================================================================
ALTER TABLE ledger_lines ADD COLUMN product_name text;
COMMENT ON COLUMN ledger_lines.product_name IS 'Tên mặt hàng lúc ghi dòng sổ (0072). Không đổi khi đổi tên về sau; bút toán đảo mang tên của dòng gốc. NULL: dòng ghi trước 0072 hoặc không gắn mặt hàng.';

CREATE FUNCTION bizcity_set_line_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_name IS NULL AND NEW.item_id IS NOT NULL THEN
    SELECT i.name INTO NEW.product_name FROM items i WHERE i.item_id = NEW.item_id;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_set_line_name() IS 'Điền tên lúc ghi cho dòng sổ mới theo item_id (0072). Chạy sau ledger_lines_item_id: trigger cùng thời điểm chạy theo thứ tự tên.';
CREATE TRIGGER ledger_lines_item_name BEFORE INSERT ON ledger_lines FOR EACH ROW EXECUTE FUNCTION bizcity_set_line_name();

CREATE OR REPLACE VIEW bizcity_read.ledger_lines WITH (security_invoker = true) AS
SELECT id, entry_id, tenant_id, branch_id, posting_date, line_no, pair_no, account_code, debit, credit, partner_id, tax_code,
       part, product_sku, description, source_line_key, dims, cost_fill, item_id, product_name
  FROM public.ledger_lines;
COMMENT ON COLUMN bizcity_read.ledger_lines.product_name IS 'Tên mặt hàng lúc ghi (0072). Báo cáo theo dòng: COALESCE với tên hiện tại vì dòng ghi trước 0072 để trống.';

CREATE FUNCTION bizcity_item_name_now(p_tenant bigint, p_sku text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT i.name FROM item_codes c JOIN items i ON i.item_id = c.item_id
   WHERE c.tenant_id = p_tenant AND c.kind = 'sku' AND c.code = p_sku AND c.valid_to IS NULL
   LIMIT 1
$$;
COMMENT ON FUNCTION bizcity_item_name_now(bigint, text) IS 'Tên hiện tại của mã hiện hành (0072). Báo cáo gom theo mặt hàng dùng hàm này thay cho MAX(tên lúc ghi).';
