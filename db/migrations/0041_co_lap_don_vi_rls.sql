-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
-- =============================================================================
-- 0041 Cô lập đơn vị ở tầng CSDL — Row Level Security (PHASE-007, PHASES 2.4, G1-05; STD-DATA-1, R-SEC; audit A-23).
--      Mọi bảng có tenant_id (84 bảng): ENABLE + FORCE ROW LEVEL SECURITY (FORCE: áp cả cho vai trò sở hữu bảng) +
--      chính sách tenant_isolation: dòng chỉ thấy / ghi được khi tenant_id = bizcity.tenant_id của kết nối.
--      bizcity.tenant_id do API đặt mỗi lần mượn kết nối (apps/api/src/db/client.ts) theo đơn vị đã xác thực của yêu cầu.
--      CHƯA đặt (rỗng) — migration, seed, dispatcher sự kiện, đăng nhập, script vận hành — thì không lọc: việc nền chạy như cũ.
--      Nghĩa là RLS chặn được lỗi "truy vấn trong một yêu cầu quên lọc tenant_id" (đọc / ghi chéo đơn vị); không thay việc
--      kiểm quyền. Bảng con không có tenant_id (SC-DATA-5) lọc qua bảng cha.
--      Bảng module mới có tenant_id phải thêm chính sách cùng khuôn (SC-DATA-6).
-- =============================================================================

-- Đúng khi kết nối chưa gắn đơn vị, hoặc dòng thuộc đơn vị đang gắn. STABLE + SQL đơn giản: planner nhúng thẳng vào câu truy vấn.
CREATE OR REPLACE FUNCTION bizcity_tenant_visible(row_tenant bigint) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('bizcity.tenant_id', true), '')::bigint = row_tenant, true)
$$;
COMMENT ON FUNCTION bizcity_tenant_visible(bigint) IS 'RLS (0041): dòng của đơn vị đang gắn với kết nối (bizcity.tenant_id); chưa gắn thì đúng (việc nền, migration).';

ALTER TABLE accounting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounting_events;
CREATE POLICY tenant_isolation ON accounting_events USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE accounting_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounting_units;
CREATE POLICY tenant_isolation ON accounting_units USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounts;
CREATE POLICY tenant_isolation ON accounts USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON action_requests;
CREATE POLICY tenant_isolation ON action_requests USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_keys;
CREATE POLICY tenant_isolation ON api_keys USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON asset_categories;
CREATE POLICY tenant_isolation ON asset_categories USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE asset_depreciations ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON asset_depreciations;
CREATE POLICY tenant_isolation ON asset_depreciations USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE asset_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON asset_events;
CREATE POLICY tenant_isolation ON asset_events USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON assets;
CREATE POLICY tenant_isolation ON assets USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE authority_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON authority_invoices;
CREATE POLICY tenant_isolation ON authority_invoices USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON bank_accounts;
CREATE POLICY tenant_isolation ON bank_accounts USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON branches;
CREATE POLICY tenant_isolation ON branches USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE cash_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cash_plans;
CREATE POLICY tenant_isolation ON cash_plans USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE cash_transfer_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transfer_confirmations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cash_transfer_confirmations;
CREATE POLICY tenant_isolation ON cash_transfer_confirmations USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE catalog_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_tombstones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON catalog_tombstones;
CREATE POLICY tenant_isolation ON catalog_tombstones USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE cit_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cit_returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cit_returns;
CREATE POLICY tenant_isolation ON cit_returns USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE closing_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_rule_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON closing_rule_versions;
CREATE POLICY tenant_isolation ON closing_rule_versions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE closing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON closing_rules;
CREATE POLICY tenant_isolation ON closing_rules USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE contract_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON contract_schedules;
CREATE POLICY tenant_isolation ON contract_schedules USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE cost_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_norms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cost_norms;
CREATE POLICY tenant_isolation ON cost_norms USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE debt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON debt_allocations;
CREATE POLICY tenant_isolation ON debt_allocations USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE debt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON debt_items;
CREATE POLICY tenant_isolation ON debt_items USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON diagnostic_runs;
CREATE POLICY tenant_isolation ON diagnostic_runs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dimensions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dimensions;
CREATE POLICY tenant_isolation ON dimensions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON document_sequences;
CREATE POLICY tenant_isolation ON document_sequences USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_signatures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON document_signatures;
CREATE POLICY tenant_isolation ON document_signatures USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE event_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_consumptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON event_consumptions;
CREATE POLICY tenant_isolation ON event_consumptions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE event_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON event_deliveries;
CREATE POLICY tenant_isolation ON event_deliveries USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON event_outbox;
CREATE POLICY tenant_isolation ON event_outbox USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fiscal_periods;
CREATE POLICY tenant_isolation ON fiscal_periods USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE inventory_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_costs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventory_costs;
CREATE POLICY tenant_isolation ON inventory_costs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventory_movements;
CREATE POLICY tenant_isolation ON inventory_movements USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE item_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_classes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON item_classes;
CREATE POLICY tenant_isolation ON item_classes USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE ledger_balances_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_balances_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ledger_balances_daily;
CREATE POLICY tenant_isolation ON ledger_balances_daily USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ledger_entries;
CREATE POLICY tenant_isolation ON ledger_entries USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE ledger_entry_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entry_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ledger_entry_sequences;
CREATE POLICY tenant_isolation ON ledger_entry_sequences USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE ledger_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ledger_lines;
CREATE POLICY tenant_isolation ON ledger_lines USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE ledger_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ledger_links;
CREATE POLICY tenant_isolation ON ledger_links USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE long_term_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE long_term_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON long_term_balances;
CREATE POLICY tenant_isolation ON long_term_balances USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE mcp_confirm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_confirm_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON mcp_confirm_tokens;
CREATE POLICY tenant_isolation ON mcp_confirm_tokens USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE order_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_formulas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON order_formulas;
CREATE POLICY tenant_isolation ON order_formulas USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE partner_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON partner_groups;
CREATE POLICY tenant_isolation ON partner_groups USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON partners;
CREATE POLICY tenant_isolation ON partners USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payment_methods;
CREATE POLICY tenant_isolation ON payment_methods USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE payment_request_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_request_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payment_request_settings;
CREATE POLICY tenant_isolation ON payment_request_settings USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payment_requests;
CREATE POLICY tenant_isolation ON payment_requests USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE period_lock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_lock_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON period_lock_events;
CREATE POLICY tenant_isolation ON period_lock_events USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE period_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_locks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON period_locks;
CREATE POLICY tenant_isolation ON period_locks USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE posting_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_defaults FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON posting_defaults;
CREATE POLICY tenant_isolation ON posting_defaults USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE posting_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON posting_log;
CREATE POLICY tenant_isolation ON posting_log USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE posting_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_policy_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON posting_policy_versions;
CREATE POLICY tenant_isolation ON posting_policy_versions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE posting_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_reasons FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON posting_reasons;
CREATE POLICY tenant_isolation ON posting_reasons USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE price_list_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_branches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON price_list_branches;
CREATE POLICY tenant_isolation ON price_list_branches USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON price_lists;
CREATE POLICY tenant_isolation ON price_lists USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE print_template_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_template_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON print_template_settings;
CREATE POLICY tenant_isolation ON print_template_settings USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE product_posting_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_posting_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_posting_groups;
CREATE POLICY tenant_isolation ON product_posting_groups USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_prices;
CREATE POLICY tenant_isolation ON product_prices USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_units;
CREATE POLICY tenant_isolation ON product_units USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON products;
CREATE POLICY tenant_isolation ON products USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE purchase_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_attachments;
CREATE POLICY tenant_isolation ON purchase_attachments USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE purchase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_documents;
CREATE POLICY tenant_isolation ON purchase_documents USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE purchase_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_policies;
CREATE POLICY tenant_isolation ON purchase_policies USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE reference_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON reference_documents;
CREATE POLICY tenant_isolation ON reference_documents USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE risky_taxpayers ENABLE ROW LEVEL SECURITY;
ALTER TABLE risky_taxpayers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON risky_taxpayers;
CREATE POLICY tenant_isolation ON risky_taxpayers USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_levels;
CREATE POLICY tenant_isolation ON stock_levels USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE stock_max_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_max_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_max_requests;
CREATE POLICY tenant_isolation ON stock_max_requests USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE stock_sku_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_sku_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_sku_settings;
CREATE POLICY tenant_isolation ON stock_sku_settings USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_invoice_lines;
CREATE POLICY tenant_isolation ON supplier_invoice_lines USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_invoices;
CREATE POLICY tenant_isolation ON supplier_invoices USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE supplier_item_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_item_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_item_aliases;
CREATE POLICY tenant_isolation ON supplier_item_aliases USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_products;
CREATE POLICY tenant_isolation ON supplier_products USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE tax_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax_codes;
CREATE POLICY tenant_isolation ON tax_codes USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE tax_info_patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_info_patches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax_info_patches;
CREATE POLICY tenant_isolation ON tax_info_patches USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax_invoices;
CREATE POLICY tenant_isolation ON tax_invoices USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE taxpayer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxpayer_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON taxpayer_profiles;
CREATE POLICY tenant_isolation ON taxpayer_profiles USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON transfer_requests;
CREATE POLICY tenant_isolation ON transfer_requests USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE unit_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_names FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON unit_names;
CREATE POLICY tenant_isolation ON unit_names USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vat_returns;
CREATE POLICY tenant_isolation ON vat_returns USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE voucher_recurrence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_recurrence_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON voucher_recurrence_runs;
CREATE POLICY tenant_isolation ON voucher_recurrence_runs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE voucher_recurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_recurrences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON voucher_recurrences;
CREATE POLICY tenant_isolation ON voucher_recurrences USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE voucher_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON voucher_templates;
CREATE POLICY tenant_isolation ON voucher_templates USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON warehouses;
CREATE POLICY tenant_isolation ON warehouses USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
