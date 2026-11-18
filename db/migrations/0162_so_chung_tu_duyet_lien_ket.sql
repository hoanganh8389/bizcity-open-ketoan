-- [2026-11-18 Nguyễn Văn Thủy] Sổ chứng từ chung đầy đủ hơn: người duyệt + liên kết áp chính sách, dùng lô, trả kỳ hợp đồng (đóng góp)
--
-- Tham khảo đầu phiếu local_ledger của website (local_ledger_approver_*, purchase_policy_id, contract_id, lot_id) — không thêm cột
-- cho từng thứ: người duyệt thành cột của đầu phiếu chung; chính sách / hợp đồng / lô là CHỨNG TỪ hoặc đối tượng có định danh nên nối
-- bằng document_links. Không bảng mới.
--   business_documents.approved_by / approved_at   người duyệt, lúc duyệt (phiếu mua: duyệt; đề nghị thanh toán: cấp cuối)
--   document_links vai mới:
--     applies  chứng từ ÁP chính sách / chương trình  → mua-hang.policy:<id>   (vết tính policyTrace, chương trình trên dòng, phiếu thưởng)
--     uses     chứng từ DÙNG lô hàng                   → kho.lot:<id>           (số lô + HSD trên dòng, khớp item_lots)
--   settles (có sẵn): đề nghị thanh toán trả cho kỳ hợp đồng → hop-dong.schedule:<id>

ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS approved_by text NOT NULL DEFAULT '';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS approved_at timestamptz;
COMMENT ON COLUMN business_documents.approved_by IS 'Người duyệt (cấp cuối); rỗng = chưa duyệt / loại chứng từ không có bước duyệt (0162).';
COMMENT ON COLUMN business_documents.approved_at IS 'Thời điểm duyệt (cấp cuối) (0162).';

ALTER TABLE document_links DROP CONSTRAINT IF EXISTS document_links_role_check;
ALTER TABLE document_links ADD CONSTRAINT document_links_role_check
  CHECK (role IN ('source', 'reverses', 'replaces', 'settles', 'attachesTo', 'ledger', 'applies', 'uses'));
COMMENT ON COLUMN document_links.role IS 'source = lập từ, reverses = đảo, replaces = thay thế, settles = thanh toán cho, attachesTo = đính vào, ledger = sự việc kế toán sinh ra, applies = áp chính sách / chương trình (0162), uses = dùng lô hàng (0162).';

-- ── Ghi đầu phiếu (thêm người duyệt) ─────────────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS bizcity_doc_put(bigint, text, text, text, text, date, text, text, text, numeric, text, text, jsonb, jsonb, text, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION bizcity_doc_put(
  p_tenant bigint, p_ref text, p_module text, p_type text, p_no text, p_date date, p_branch text, p_partner text,
  p_title text, p_total numeric, p_status_raw text, p_status text, p_snapshot jsonb, p_meta jsonb, p_actor text,
  p_created timestamptz, p_updated timestamptz, p_approved_by text, p_approved_at timestamptz
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
                                       status_raw, status, version, meta, created_by, created_at, updated_at, approved_by, approved_at)
  VALUES (p_tenant, p_ref, p_module, p_type, COALESCE(p_no, ''), p_date, COALESCE(p_branch, ''), COALESCE(p_partner, ''), COALESCE(p_title, ''),
          COALESCE(p_total, 0), p_status_raw, p_status, v_ver, COALESCE(p_meta, '{}'::jsonb), COALESCE(p_actor, ''),
          COALESCE(p_created, now()), COALESCE(p_updated, p_created, now()), COALESCE(p_approved_by, ''), p_approved_at)
  ON CONFLICT (tenant_id, doc_ref) DO UPDATE SET
    doc_type = EXCLUDED.doc_type, doc_no = EXCLUDED.doc_no, doc_date = EXCLUDED.doc_date, branch_code = EXCLUDED.branch_code,
    partner_ref = EXCLUDED.partner_ref, title = EXCLUDED.title, total = EXCLUDED.total, status_raw = EXCLUDED.status_raw,
    status = EXCLUDED.status, version = EXCLUDED.version, meta = EXCLUDED.meta, created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at
  WHERE (b.doc_type, b.doc_no, b.doc_date, b.branch_code, b.partner_ref, b.title, b.total, b.status_raw, b.status, b.version, b.meta,
         b.created_by, b.created_at, b.updated_at, b.approved_by, b.approved_at)
        IS DISTINCT FROM (EXCLUDED.doc_type, EXCLUDED.doc_no, EXCLUDED.doc_date, EXCLUDED.branch_code, EXCLUDED.partner_ref, EXCLUDED.title,
                          EXCLUDED.total, EXCLUDED.status_raw, EXCLUDED.status, EXCLUDED.version, EXCLUDED.meta, EXCLUDED.created_by,
                          EXCLUDED.created_at, EXCLUDED.updated_at, EXCLUDED.approved_by, EXCLUDED.approved_at);
END $$;
COMMENT ON FUNCTION bizcity_doc_put(bigint, text, text, text, text, date, text, text, text, numeric, text, text, jsonb, jsonb, text, timestamptz, timestamptz, text, timestamptz)
  IS 'Ghi đầu phiếu vào business_documents (kèm người duyệt, 0162) + ảnh chụp document_versions khi nội dung đổi.';

-- ── Phiếu mua hàng: + người duyệt, áp chính sách, dùng lô ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'mua-hang.document:' || NEW.id;
  v_src bigint;
  v_link jsonb;
  v_id bigint;
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
    COALESCE(NULLIF(NEW.created_by_name, ''), NEW.created_by), NEW.created_at, NEW.updated_at,
    CASE WHEN NEW.status IN ('draft', 'pending_approval') THEN '' ELSE COALESCE(NULLIF(NEW.approved_by, ''), NEW.data->>'approvedActor', '') END,
    CASE WHEN NEW.status IN ('draft', 'pending_approval') THEN NULL ELSE NEW.approved_at END);
  FOREACH v_src IN ARRAY COALESCE(NEW.ref_ids, '{}'::bigint[]) LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'mua-hang.document:' || v_src, 'source', NEW.created_by);
  END LOOP;
  FOR v_link IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.links) = 'array' THEN NEW.links ELSE '[]'::jsonb END) x LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || (v_link ->> 'docKey'), 'ledger', NEW.created_by);
  END LOOP;
  -- Áp chính sách / chương trình: mã ở vết tính, ở dòng (program), ở phiếu thưởng → chính sách mua cùng mã.
  FOR v_id IN
    SELECT DISTINCT p.id FROM purchase_policies p
     WHERE p.tenant_id = NEW.tenant_id AND p.code IN (
       SELECT t->>'policy' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'policyTrace') = 'array' THEN NEW.data->'policyTrace' ELSE '[]'::jsonb END) t
       UNION SELECT l->>'program' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'lines') = 'array' THEN NEW.data->'lines' ELSE '[]'::jsonb END) l
       UNION SELECT NEW.data->'rebate'->>'policyCode')
  LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'mua-hang.policy:' || v_id, 'applies', NEW.created_by);
  END LOOP;
  -- Dùng lô: số lô (+ HSD nếu có) trên dòng khớp lô hàng đã ghi nhận.
  FOR v_id IN
    SELECT DISTINCT i.id FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'lines') = 'array' THEN NEW.data->'lines' ELSE '[]'::jsonb END) l
      JOIN item_lots i ON i.tenant_id = NEW.tenant_id AND i.sku = l->>'sku' AND i.lot_no = l->>'lotNo'
       AND (COALESCE(l->>'expDate', '') = '' OR i.exp_date::text = l->>'expDate')
     WHERE COALESCE(l->>'lotNo', '') <> ''
  LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'kho.lot:' || v_id, 'uses', NEW.created_by);
  END LOOP;
  RETURN NULL;
END $$;

-- ── Phiếu chuyển kho (không có bước duyệt) ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'kho.transfer:' || NEW.id;
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'kho', 'inventory.transfer', NEW.doc_no, NEW.doc_date, NEW.from_branch_code, '',
    'Phiếu chuyển kho', 0, NEW.status,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'shipped' THEN 'approved' WHEN 'cancelled' THEN 'cancelled' ELSE 'done' END,
    to_jsonb(NEW) - ARRAY['status', 'received_date', 'received_by', 'received_note', 'out_doc_key', 'in_doc_key', 'created_at', 'updated_at', 'updated_by', 'einvoice'],
    jsonb_strip_nulls(jsonb_build_object('fromWarehouse', NULLIF(NEW.from_warehouse, ''), 'toBranch', NEW.to_branch_code,
      'toWarehouse', NULLIF(NEW.to_warehouse, ''), 'receivedDate', NEW.received_date, 'receivedBy', NULLIF(NEW.received_by, ''), 'reason', NULLIF(NEW.reason_code, ''))),
    COALESCE(NEW.created_by, NEW.updated_by, ''), NEW.created_at, NEW.updated_at, '', NULL);
  PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || NULLIF(NEW.out_doc_key, ''), 'ledger', NEW.created_by);
  IF NEW.status = 'received' THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || NULLIF(NEW.in_doc_key, ''), 'ledger', NEW.created_by);
  END IF;
  RETURN NULL;
END $$;

-- ── Đề nghị thanh toán: + người duyệt cấp cuối, trả cho kỳ hợp đồng ───────────────────────────────────────────────────────
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
    jsonb_strip_nulls(jsonb_build_object('dueDate', NEW.due_date, 'method', NULLIF(NEW.method, ''), 'rejectedReason', NULLIF(NEW.rejected_reason, ''),
      'approved1By', NULLIF(NEW.approved1_by, ''))),
    COALESCE(NULLIF(NEW.created_by_name, ''), NEW.created_by, ''), NEW.created_at, NEW.updated_at,
    CASE WHEN NEW.status IN ('approved', 'paid') THEN COALESCE(NULLIF(NEW.approved2_by, ''), NEW.approved1_by, '') ELSE '' END,
    CASE WHEN NEW.status IN ('approved', 'paid') THEN COALESCE(NEW.approved2_at, NEW.approved1_at) END);
  IF NEW.source_ref IS NOT NULL THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, NEW.source_ref, 'source', NEW.created_by);
  END IF;
  IF NEW.contract_schedule_id IS NOT NULL THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'hop-dong.schedule:' || NEW.contract_schedule_id, 'settles', NEW.created_by);
  END IF;
  IF NEW.paid_event_id IS NOT NULL THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || e.doc_key, 'ledger', NEW.created_by)
       FROM accounting_events e WHERE e.id = NEW.paid_event_id;
  END IF;
  RETURN NULL;
END $$;

-- ── Nạp lại chứng từ đang có ──────────────────────────────────────────────────────────────────────────────────────────────
UPDATE purchase_documents SET id = id;
UPDATE stock_transfer_docs SET id = id;
UPDATE payment_requests SET id = id;
