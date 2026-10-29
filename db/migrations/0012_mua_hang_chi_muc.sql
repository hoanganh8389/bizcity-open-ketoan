-- =============================================================================
-- 0012 Mua hàng — chỉ mục cho truy vấn chọn lọc (phân tích / lưu / duyệt một phiếu không đọc toàn bộ chứng từ)
-- =============================================================================

-- Lịch sử giá một mã: phiếu nhập có dòng chứa mã đó (data->'lines' @> '[{"sku": "..."}]').
CREATE INDEX IF NOT EXISTS purchase_documents_lines_gin ON purchase_documents USING gin ((data -> 'lines') jsonb_path_ops);

-- Phiếu gắn với phiếu khác: phiếu nhập theo đơn, ứng trước theo đơn, trả / đổi theo phiếu gốc, chi phí / thưởng theo phiếu nhập.
CREATE INDEX IF NOT EXISTS purchase_documents_refs_gin ON purchase_documents USING gin (ref_ids);

-- Đọc chứng từ theo kỳ (danh sách, báo cáo) và xuất quà theo chi nhánh.
CREATE INDEX IF NOT EXISTS purchase_documents_date_idx ON purchase_documents (tenant_id, doc_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS purchase_documents_branch_idx ON purchase_documents (tenant_id, branch_code, kind) WHERE status = 'approved';

-- Chính sách theo NCC (hồ sơ NCC) và theo mã hàng (giá cố định, mặt hàng NCC, min–max).
CREATE INDEX IF NOT EXISTS purchase_policies_partner_idx ON purchase_policies (tenant_id, (scope ->> 'partnerCode'), kind);
CREATE INDEX IF NOT EXISTS purchase_policies_sku_idx ON purchase_policies (tenant_id, (scope ->> 'sku')) WHERE scope ? 'sku';
