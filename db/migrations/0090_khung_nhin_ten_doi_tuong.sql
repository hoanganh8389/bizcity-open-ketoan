-- [2026-11-09 10:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2b: khung nhìn bizcity_read.ledger_lines / ledger_entries thêm partner_name + partner_attr_id — chữ chốt docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md §2
-- =============================================================================
-- 0090 Khung nhìn đọc sổ thấy tên đối tượng lúc ghi.
--   Báo cáo đọc sổ qua bizcity_read.* (SC-KERNEL-7), mà các khung nhìn này liệt kê cột tường minh nên hai cột 0087 thêm vào
--   ledger_lines / ledger_entries (partner_name, partner_attr_id) chưa tới được báo cáo. Giống 0072 (product_name): CREATE OR
--   REPLACE VIEW chỉ được THÊM cột ở cuối, giữ nguyên thứ tự và kiểu các cột cũ, giữ security_invoker và quyền hiện có.
--   Không đổi bảng, không đổi trigger, không đổi dữ liệu. Đường lui: tạo lại hai khung nhìn không có hai cột cuối (báo cáo đã đọc cột này
--   thì phải về COALESCE trên tên hiện tại).
-- =============================================================================

CREATE OR REPLACE VIEW bizcity_read.ledger_lines WITH (security_invoker = true) AS
SELECT id, entry_id, tenant_id, branch_id, posting_date, line_no, pair_no, account_code, debit, credit, partner_id, tax_code,
       part, product_sku, description, source_line_key, dims, cost_fill, item_id, product_name,
       partner_name, partner_attr_id
  FROM public.ledger_lines;

CREATE OR REPLACE VIEW bizcity_read.ledger_entries WITH (security_invoker = true) AS
SELECT id, tenant_id, branch_id, period_id, entry_no, doc_type, event_id, event_version, doc_no, invoice_no, doc_date,
       posting_date, reason_code, partner_id, description, total, status, reverses_entry_id, created_by, created_at,
       is_reversal, policy_version,
       partner_name, partner_attr_id
  FROM public.ledger_entries;
