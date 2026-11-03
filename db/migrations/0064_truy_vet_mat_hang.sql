-- [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: chỉ mục truy vết theo mã hàng trên dòng sổ cái (Hành trình mặt hàng, ADR-0021)
-- =============================================================================
-- 0064 Truy vết theo mã hàng.
--      Màn Hành trình mặt hàng (bizcity_lineage@1) đọc mọi dòng bút toán của MỘT mã hàng theo ngày. Dòng sổ cái chưa có chỉ mục theo
--      mã hàng (chỉ có tài khoản, chi nhánh, đối tượng) nên truy vết một mã trong dữ liệu bán lẻ lớn phải quét cả bảng.
--      inventory_movements đã có inventory_movements_sku (0007): không thêm.
--      Chỉ mục từng phần (product_sku IS NOT NULL): dòng không mang mã hàng (tiền, thuế…) không tốn chỗ.
--      Tạo trong giao dịch của bộ chạy migration (không CONCURRENTLY được): bản cài lớn nên chạy ngoài giờ cao điểm.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ledger_lines_sku ON ledger_lines (tenant_id, product_sku, posting_date) WHERE product_sku IS NOT NULL;

COMMENT ON INDEX ledger_lines_sku IS 'Truy vết theo mã hàng (0064, PHASE-025): mọi dòng bút toán của một mã hàng theo ngày hạch toán.';
