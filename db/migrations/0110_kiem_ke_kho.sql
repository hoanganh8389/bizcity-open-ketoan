-- [2026-11-12 03:30 PM kiennt] NT-KHO-002 — biên bản kiểm kê kho (KHO02): biên bản kiểm kê → xác minh → quyết định xử lý chênh lệch
-- =============================================================================
-- BIÊN BẢN KIỂM KÊ KHO (KHO02) — phiếu nghiệm thu docs/nghiem-thu/kho/NT-KHO-002-kiem-ke-kho.md.
-- Một dòng = một biên bản kiểm một phân kho của một chi nhánh tại một ngày, theo mặt hàng × lô / HSD. Ba chứng từ trên một dòng:
--   1. Biên bản kiểm kê (lines, members): Ghi nhận chênh lệch → chứng từ điều chỉnh tồn (stock_adjustment, adjust_doc_key) cho phần
--      thừa / thiếu (lý do kiểm kê thừa / thiếu của đơn vị) + chứng từ chuyển kho cùng chi nhánh (transfer, transfer_doc_key) đưa hàng
--      kém / mất phẩm chất sang kho cách ly — qua cửa ghi sổ của lõi, không ghi thẳng sổ.
--   2. Biên bản xác minh (causes): nguyên nhân từng dòng chênh lệch.
--   3. Quyết định xử lý (decision_*): phiếu kế toán (manual_journal, journal_doc_key) tất toán chênh lệch theo lý do của đơn vị.
-- Huỷ = huỷ chứng từ đã sinh (bút toán đảo), không xoá biên bản.
-- =============================================================================
CREATE TABLE stock_counts (
  id bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_no text NOT NULL,
  count_date date NOT NULL,
  branch_code text NOT NULL,
  warehouse_code text NOT NULL DEFAULT '',
  quarantine_warehouse text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  conclusion text NOT NULL DEFAULT '',
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  adjust_doc_key text NOT NULL DEFAULT '',
  transfer_doc_key text NOT NULL DEFAULT '',
  recorded_at timestamptz,
  recorded_by text,
  causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  verify_note text NOT NULL DEFAULT '',
  verified_at timestamptz,
  verified_by text,
  decision_no text NOT NULL DEFAULT '',
  decision_date date,
  decision_signer text NOT NULL DEFAULT '',
  decision_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  journal_doc_key text NOT NULL DEFAULT '',
  settled_at timestamptz,
  settled_by text,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_counts_status_chk CHECK (status IN ('draft', 'recorded', 'verified', 'settled')),
  CONSTRAINT stock_counts_lines_chk CHECK (jsonb_typeof(lines) = 'array' AND jsonb_typeof(members) = 'array' AND jsonb_typeof(causes) = 'array'),
  CONSTRAINT stock_counts_reasons_chk CHECK (jsonb_typeof(decision_reasons) = 'object')
);
CREATE UNIQUE INDEX stock_counts_no ON stock_counts (tenant_id, doc_no);
CREATE INDEX stock_counts_date ON stock_counts (tenant_id, count_date DESC, id DESC);

COMMENT ON TABLE stock_counts IS 'Biên bản kiểm kê kho (KHO02, NT-KHO-002): biên bản kiểm kê → xác minh → quyết định xử lý; chênh lệch vào sổ qua chứng từ điều chỉnh tồn / chuyển kho cách ly / phiếu kế toán của cửa ghi sổ';
COMMENT ON COLUMN stock_counts.id IS 'Khoá dòng';
COMMENT ON COLUMN stock_counts.tenant_id IS 'Đơn vị';
COMMENT ON COLUMN stock_counts.doc_no IS 'Số biên bản (KK + năm 2 số + số thứ tự), duy nhất trong đơn vị';
COMMENT ON COLUMN stock_counts.count_date IS 'Ngày kiểm kê — số theo sổ tính đến hết ngày này; ngày của chứng từ ghi nhận chênh lệch';
COMMENT ON COLUMN stock_counts.branch_code IS 'Mã chi nhánh của kho kiểm';
COMMENT ON COLUMN stock_counts.warehouse_code IS 'Mã phân kho kiểm (đã quy về kho mặc định của chi nhánh nếu để trống)';
COMMENT ON COLUMN stock_counts.quarantine_warehouse IS 'Kho cách ly nhận hàng kém / mất phẩm chất (cùng chi nhánh); trống khi không có hàng kém phẩm chất';
COMMENT ON COLUMN stock_counts.purpose IS 'Mục đích kiểm kê (cuối tháng, đột xuất…)';
COMMENT ON COLUMN stock_counts.conclusion IS 'Kết luận của biên bản kiểm kê';
COMMENT ON COLUMN stock_counts.members IS 'Thành viên tham gia: [{name, title, represent}]';
COMMENT ON COLUMN stock_counts.lines IS 'Dòng kiểm: [{lineKey, sku, name, unit, lotNo, expDate (HSD trên sổ), actualExpDate, bookQty, countedQty, poorQty, lostQty, newLot, note}] — số lượng ĐVT nhỏ nhất';
COMMENT ON COLUMN stock_counts.status IS 'draft = nháp (chưa đụng sổ) · recorded = đã ghi nhận chênh lệch · verified = đã xác minh · settled = đã xử lý';
COMMENT ON COLUMN stock_counts.adjust_doc_key IS 'Khoá chứng từ điều chỉnh tồn sinh khi ghi nhận chênh lệch (erp:kk:<id>:dc), trống nếu không có chênh lệch';
COMMENT ON COLUMN stock_counts.transfer_doc_key IS 'Khoá chứng từ chuyển hàng kém / mất phẩm chất sang kho cách ly (erp:kk:<id>:cl), trống nếu không có';
COMMENT ON COLUMN stock_counts.recorded_at IS 'Lúc ghi nhận chênh lệch';
COMMENT ON COLUMN stock_counts.recorded_by IS 'Người ghi nhận chênh lệch';
COMMENT ON COLUMN stock_counts.causes IS 'Biên bản xác minh: [{lineKey, cause (unknown|compensate|expense|owned|missing_receipt), qty, partnerCode, receiptDocNo, note}] — tổng số lượng mỗi dòng = chênh lệch';
COMMENT ON COLUMN stock_counts.verify_note IS 'Ghi chú của biên bản xác minh';
COMMENT ON COLUMN stock_counts.verified_at IS 'Lúc ghi biên bản xác minh';
COMMENT ON COLUMN stock_counts.verified_by IS 'Người ghi biên bản xác minh';
COMMENT ON COLUMN stock_counts.decision_no IS 'Số quyết định xử lý chênh lệch';
COMMENT ON COLUMN stock_counts.decision_date IS 'Ngày quyết định — ngày của phiếu kế toán tất toán';
COMMENT ON COLUMN stock_counts.decision_signer IS 'Người ký quyết định';
COMMENT ON COLUMN stock_counts.decision_reasons IS 'Lý do phiếu kế toán dùng cho từng hướng xử lý: {compensate, expense, owned} → mã lý do (kind journal) của đơn vị';
COMMENT ON COLUMN stock_counts.journal_doc_key IS 'Khoá phiếu kế toán tất toán (erp:kk:<id>:qd), trống nếu quyết định không phát sinh bút toán';
COMMENT ON COLUMN stock_counts.settled_at IS 'Lúc ghi quyết định xử lý';
COMMENT ON COLUMN stock_counts.settled_by IS 'Người ghi quyết định xử lý';
COMMENT ON COLUMN stock_counts.created_by IS 'Người lập biên bản';
COMMENT ON COLUMN stock_counts.updated_by IS 'Người sửa gần nhất';
COMMENT ON COLUMN stock_counts.created_at IS 'Lúc lập';
COMMENT ON COLUMN stock_counts.updated_at IS 'Lúc sửa gần nhất';

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_counts USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stock_counts TO ketoan_app;
    GRANT USAGE ON SEQUENCE stock_counts_id_seq TO ketoan_app;
  END IF;
END $$;
