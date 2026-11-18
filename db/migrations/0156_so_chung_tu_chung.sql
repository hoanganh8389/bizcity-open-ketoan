-- [2026-11-18 Nguyễn Văn Thủy] Sổ chứng từ chung business_documents: một đầu phiếu cho mọi chứng từ nghiệp vụ (đóng góp)
--
-- Document Kernel (bizcity_document@1 §1–§5): quản lý định danh, vòng đời, phiên bản, liên kết của MỌI chứng từ, kể cả chứng từ
-- chưa / không chạm sổ (đơn đặt, đề nghị thanh toán, hợp đồng…). Nội dung chuyên môn (dòng hàng…) vẫn ở bảng của phân hệ;
-- sự việc kế toán vẫn ở accounting_events (không đổi). Tham khảo bộ local_ledger / local_ledger_item / local_ledger_meta của
-- website: một bảng đầu phiếu chung cho mọi loại (phân biệt bằng loại) + thông tin thêm dạng JSON — ở đây JSON nằm ngay trong
-- bảng (cột meta), không tách bảng meta riêng.
--
-- Một bảng mới duy nhất. Dùng lại bảng chung có sẵn từ 0045: document_versions (ảnh chụp mỗi lần nội dung đổi),
-- document_links (lập từ / sinh sự việc kế toán), document_attachments (đính kèm).
--
-- Đồng bộ bằng trigger trên bảng nguồn nên mọi đường ghi (giao diện, API, nhập Excel, test) đều vào sổ, phân hệ không phải
-- gọi thêm gì:
--   purchase_documents   mua-hang.document:<id>     purchase.<kind>   (đơn đặt, phiếu nhập, trả NCC, chi phí, quà, thưởng…)
--   stock_transfer_docs  kho.transfer:<id>          inventory.transfer
--   payment_requests     quy.payment_request:<id>   finance.payment_request
-- Trạng thái riêng của phân hệ giữ ở status_raw; status = nhóm chuẩn (draft, pending, approved, done, cancelled) để theo dõi chung.
-- Phiên bản: mỗi lần NỘI DUNG đổi (bỏ qua trạng thái, người duyệt, mốc giờ) thêm một ảnh chụp vào document_versions.

CREATE TABLE IF NOT EXISTS business_documents (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint  NOT NULL REFERENCES tenants(id),
  doc_ref      text    NOT NULL CHECK (doc_ref ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'),
  module       text    NOT NULL,
  doc_type     text    NOT NULL CHECK (doc_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  doc_no       text    NOT NULL DEFAULT '',
  doc_date     date,
  branch_code  text    NOT NULL DEFAULT '',
  partner_ref  text    NOT NULL DEFAULT '',
  title        text    NOT NULL DEFAULT '',
  total        numeric(20,4) NOT NULL DEFAULT 0,
  status_raw   text    NOT NULL,
  status       text    NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'done', 'cancelled')),
  version      integer NOT NULL DEFAULT 1 CHECK (version > 0),
  meta         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_by   text    NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_ref)
);
CREATE INDEX IF NOT EXISTS business_documents_type_idx ON business_documents (tenant_id, doc_type, doc_date DESC);
CREATE INDEX IF NOT EXISTS business_documents_status_idx ON business_documents (tenant_id, status, doc_date DESC);
CREATE INDEX IF NOT EXISTS business_documents_no_idx ON business_documents (tenant_id, doc_no);
COMMENT ON TABLE business_documents IS 'Sổ chứng từ chung (0156, bizcity_document@1): đầu phiếu của mọi chứng từ nghiệp vụ — định danh, loại, số, ngày, chi nhánh, đối tượng, tổng tiền, trạng thái, phiên bản. Dòng chi tiết ở bảng phân hệ; phiên bản ở document_versions; liên kết ở document_links. Đồng bộ bằng trigger từ bảng nguồn — không ghi tay.';
COMMENT ON COLUMN business_documents.doc_ref IS 'Định danh chứng từ <module>.<loại>:<id> (bất biến); trùng doc_key khi chứng từ nộp sự việc kế toán.';
COMMENT ON COLUMN business_documents.module IS 'Phân hệ giữ nội dung: mua-hang, kho, quy…';
COMMENT ON COLUMN business_documents.doc_type IS 'Loại chứng từ chuẩn <miền>.<loại>: purchase.order, purchase.receipt, inventory.transfer, finance.payment_request…';
COMMENT ON COLUMN business_documents.doc_no IS 'Số chứng từ (do phân hệ cấp).';
COMMENT ON COLUMN business_documents.branch_code IS 'Chi nhánh lập / chi nhánh xuất.';
COMMENT ON COLUMN business_documents.partner_ref IS 'Đối tượng (mã NCC / khách / dt_…), rỗng nếu không có.';
COMMENT ON COLUMN business_documents.title IS 'Tên loại chứng từ để hiển thị (Đơn đặt hàng, Phiếu nhập kho…).';
COMMENT ON COLUMN business_documents.total IS 'Tổng tiền của chứng từ (0 nếu không có tiền).';
COMMENT ON COLUMN business_documents.status_raw IS 'Trạng thái riêng của phân hệ (pending_approval, shipped, approved1…).';
COMMENT ON COLUMN business_documents.status IS 'Nhóm trạng thái chuẩn: draft (nháp, bị trả) · pending (chờ duyệt) · approved (đã duyệt / đang thực hiện) · done (hoàn tất) · cancelled (huỷ).';
COMMENT ON COLUMN business_documents.version IS 'Phiên bản nội dung mới nhất (= số phiên bản cuối ở document_versions).';
COMMENT ON COLUMN business_documents.meta IS 'Thông tin thêm dạng JSON (như local_ledger_meta): hạn thanh toán, kho, số hoá đơn… tuỳ loại.';

ALTER TABLE business_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON business_documents;
CREATE POLICY tenant_isolation ON business_documents USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON business_documents TO ketoan_app;
    GRANT USAGE ON SEQUENCE business_documents_id_seq TO ketoan_app;
  END IF;
END $$;

-- ── Ghi một chứng từ: đầu phiếu + ảnh chụp phiên bản (nếu nội dung đổi) ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS bizcity_doc_put(bigint, text, text, text, text, date, text, text, text, numeric, text, text, jsonb, jsonb, text);
CREATE OR REPLACE FUNCTION bizcity_doc_put(
  p_tenant bigint, p_ref text, p_module text, p_type text, p_no text, p_date date, p_branch text, p_partner text,
  p_title text, p_total numeric, p_status_raw text, p_status text, p_snapshot jsonb, p_meta jsonb, p_actor text,
  p_created timestamptz, p_updated timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hash text := encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex');
  v_last record;
  v_ver integer;
BEGIN
  SELECT version, content_hash INTO v_last FROM document_versions
   WHERE tenant_id = p_tenant AND doc_ref = p_ref ORDER BY version DESC LIMIT 1;
  IF v_last IS NULL OR v_last.content_hash <> v_hash THEN
    v_ver := COALESCE(v_last.version, 0) + 1;
    INSERT INTO document_versions (tenant_id, doc_ref, version, snapshot, content_hash, created_by)
    VALUES (p_tenant, p_ref, v_ver, p_snapshot, v_hash, COALESCE(NULLIF(p_actor, ''), 'system'));
  ELSE
    v_ver := v_last.version;
  END IF;
  INSERT INTO business_documents AS b (tenant_id, doc_ref, module, doc_type, doc_no, doc_date, branch_code, partner_ref, title, total,
                                       status_raw, status, version, meta, created_by, created_at, updated_at)
  VALUES (p_tenant, p_ref, p_module, p_type, COALESCE(p_no, ''), p_date, COALESCE(p_branch, ''), COALESCE(p_partner, ''), COALESCE(p_title, ''),
          COALESCE(p_total, 0), p_status_raw, p_status, v_ver, COALESCE(p_meta, '{}'::jsonb), COALESCE(p_actor, ''),
          COALESCE(p_created, now()), COALESCE(p_updated, p_created, now()))
  ON CONFLICT (tenant_id, doc_ref) DO UPDATE SET
    doc_type = EXCLUDED.doc_type, doc_no = EXCLUDED.doc_no, doc_date = EXCLUDED.doc_date, branch_code = EXCLUDED.branch_code,
    partner_ref = EXCLUDED.partner_ref, title = EXCLUDED.title, total = EXCLUDED.total, status_raw = EXCLUDED.status_raw,
    status = EXCLUDED.status, version = EXCLUDED.version, meta = EXCLUDED.meta, created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
  WHERE (b.doc_type, b.doc_no, b.doc_date, b.branch_code, b.partner_ref, b.title, b.total, b.status_raw, b.status, b.version, b.meta, b.created_by, b.created_at, b.updated_at)
        IS DISTINCT FROM (EXCLUDED.doc_type, EXCLUDED.doc_no, EXCLUDED.doc_date, EXCLUDED.branch_code, EXCLUDED.partner_ref, EXCLUDED.title,
                          EXCLUDED.total, EXCLUDED.status_raw, EXCLUDED.status, EXCLUDED.version, EXCLUDED.meta, EXCLUDED.created_by, EXCLUDED.created_at, EXCLUDED.updated_at);
END $$;
COMMENT ON FUNCTION bizcity_doc_put(bigint, text, text, text, text, date, text, text, text, numeric, text, text, jsonb, jsonb, text, timestamptz, timestamptz) IS 'Ghi đầu phiếu vào business_documents + ảnh chụp document_versions khi nội dung đổi (0156).';

CREATE OR REPLACE FUNCTION bizcity_doc_link(p_tenant bigint, p_from text, p_to text, p_role text, p_actor text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO document_links (tenant_id, from_ref, to_ref, role, created_by)
  SELECT p_tenant, p_from, p_to, p_role, COALESCE(NULLIF(p_actor, ''), 'system')
   WHERE p_to IS NOT NULL AND p_to <> p_from AND p_to ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'
  ON CONFLICT (tenant_id, from_ref, to_ref, role) DO NOTHING;
$$;
COMMENT ON FUNCTION bizcity_doc_link(bigint, text, text, text, text) IS 'Gắn liên kết chứng từ, bỏ qua nếu đích rỗng / sai dạng / đã có (0156).';

-- ── Phiếu mua hàng ───────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'mua-hang.document:' || NEW.id;
  v_src bigint;
  v_link jsonb;
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'mua-hang', 'purchase.' || NEW.kind, NEW.doc_no, NEW.doc_date, NEW.branch_code,
    COALESCE(NULLIF(NEW.partner_code, ''), NEW.partner_uid, ''),
    CASE NEW.kind WHEN 'order' THEN 'Đơn đặt hàng' WHEN 'receipt' THEN 'Phiếu nhập mua' WHEN 'return' THEN 'Phiếu trả hàng NCC'
      WHEN 'cost' THEN 'Chi phí mua hàng' WHEN 'payment' THEN 'Thanh toán NCC' WHEN 'prepayment' THEN 'Trả trước NCC'
      WHEN 'rebate' THEN 'Thưởng / chiết khấu NCC' WHEN 'gift_in' THEN 'Nhận hàng tặng' WHEN 'gift_out' THEN 'Xuất hàng tặng'
      WHEN 'exchange' THEN 'Đổi hàng NCC' ELSE 'Chứng từ mua hàng' END,
    NEW.total, NEW.status,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'pending_approval' THEN 'pending' WHEN 'cancelled' THEN 'cancelled' ELSE 'approved' END,
    to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approved_at', 'created_at', 'updated_at', 'links'],
    jsonb_strip_nulls(jsonb_build_object('invoiceNo', NULLIF(NEW.invoice_no, ''), 'invoiceDate', NEW.invoice_date, 'dueDate', NEW.due_date,
      'totalBeforeTax', NEW.total_before_tax, 'totalTax', NEW.total_tax, 'demo', NULLIF(NEW.is_demo, false))),
    COALESCE(NULLIF(NEW.created_by_name, ''), NEW.created_by), NEW.created_at, NEW.updated_at);
  FOREACH v_src IN ARRAY COALESCE(NEW.ref_ids, '{}'::bigint[]) LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'mua-hang.document:' || v_src, 'source', NEW.created_by);
  END LOOP;
  FOR v_link IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.links) = 'array' THEN NEW.links ELSE '[]'::jsonb END) x LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || (v_link ->> 'docKey'), 'ledger', NEW.created_by);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS business_documents_sync ON purchase_documents;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON purchase_documents FOR EACH ROW EXECUTE FUNCTION bizcity_doc_sync_purchase();

-- ── Phiếu chuyển kho ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'kho.transfer:' || NEW.id;
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'kho', 'inventory.transfer', NEW.doc_no, NEW.doc_date, NEW.from_branch_code, '',
    'Phiếu chuyển kho', 0, NEW.status,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'shipped' THEN 'approved' WHEN 'cancelled' THEN 'cancelled' ELSE 'done' END,
    to_jsonb(NEW) - ARRAY['status', 'received_date', 'received_by', 'received_note', 'out_doc_key', 'in_doc_key', 'created_at', 'updated_at', 'updated_by', 'einvoice'],
    jsonb_strip_nulls(jsonb_build_object('fromWarehouse', NULLIF(NEW.from_warehouse, ''), 'toBranch', NEW.to_branch_code,
      'toWarehouse', NULLIF(NEW.to_warehouse, ''), 'receivedDate', NEW.received_date, 'reason', NULLIF(NEW.reason_code, ''))),
    COALESCE(NEW.created_by, NEW.updated_by, ''), NEW.created_at, NEW.updated_at);
  PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || NULLIF(NEW.out_doc_key, ''), 'ledger', NEW.created_by);
  -- in_doc_key có sẵn từ lúc xuất; sự việc nhập chỉ sinh khi nơi nhận bấm nhận.
  IF NEW.status = 'received' THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || NULLIF(NEW.in_doc_key, ''), 'ledger', NEW.created_by);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS business_documents_sync ON stock_transfer_docs;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON stock_transfer_docs FOR EACH ROW EXECUTE FUNCTION bizcity_doc_sync_transfer();

-- ── Đề nghị thanh toán ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_payment_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'quy.payment_request:' || NEW.id;
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'quy', 'finance.payment_request', NEW.request_no, NEW.request_date, NEW.branch_code,
    COALESCE((SELECT p.code FROM partners p WHERE p.id = NEW.partner_id), NULLIF(NEW.partner_uid, ''), ''), 'Đề nghị thanh toán', NEW.amount, NEW.status,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'rejected' THEN 'draft' WHEN 'submitted' THEN 'pending' WHEN 'approved1' THEN 'pending'
      WHEN 'approved' THEN 'approved' WHEN 'paid' THEN 'done' ELSE 'cancelled' END,
    to_jsonb(NEW) - ARRAY['status', 'submitted_at', 'approved1_by', 'approved1_at', 'approved2_by', 'approved2_at', 'rejected_by',
      'rejected_reason', 'paid_event_id', 'created_at', 'updated_at'],
    jsonb_strip_nulls(jsonb_build_object('dueDate', NEW.due_date, 'method', NULLIF(NEW.method, ''), 'rejectedReason', NULLIF(NEW.rejected_reason, ''))),
    COALESCE(NULLIF(NEW.created_by_name, ''), NEW.created_by, ''), NEW.created_at, NEW.updated_at);
  IF NEW.source_ref IS NOT NULL THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, NEW.source_ref, 'source', NEW.created_by);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS business_documents_sync ON payment_requests;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON payment_requests FOR EACH ROW EXECUTE FUNCTION bizcity_doc_sync_payment_request();

-- ── Nạp chứng từ đã có: chạm từng dòng để trigger ghi vào sổ chung (không đổi nội dung bảng nguồn) ─────────────────────────
UPDATE purchase_documents SET id = id;
UPDATE stock_transfer_docs SET id = id;
UPDATE payment_requests SET id = id;
