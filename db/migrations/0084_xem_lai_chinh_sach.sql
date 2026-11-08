-- [2026-11-08 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2c (S031-22, chữ chốt PHASE-031 · 00 §10, ADR-0031): bằng chứng "đã xem chính sách" + nhánh policy_review của hàng việc
-- =============================================================================
-- 0084 Hàng việc "Chờ kế toán xem" (PHASE-031 W2c).
--   policy_review_acks: mỗi lần kế toán xem một bản kiểm chính sách của sự việc là MỘT dòng bằng chứng, chỉ thêm, không sửa sự việc.
--   Khoá (tenant_id, event_id, checked_at): sự việc nhận bản mới / kiểm lại thì policy_check.checkedAt đổi -> việc mở lại.
--   View document_queue thêm một nhánh policy_review (cờ policy, nhóm pending; không thêm nhóm trạng thái).
-- =============================================================================

CREATE TABLE policy_review_acks (
  id          bigserial   PRIMARY KEY,
  tenant_id   bigint      NOT NULL REFERENCES tenants(id),
  event_id    bigint      NOT NULL REFERENCES accounting_events(id),
  checked_at  text        NOT NULL,
  acked_by    text        NOT NULL,
  acked_at    timestamptz NOT NULL DEFAULT now(),
  note        text,
  UNIQUE (tenant_id, event_id, checked_at)
);
COMMENT ON TABLE policy_review_acks IS 'Bằng chứng kế toán đã xem bản kiểm chính sách của một sự việc (ADR-0031 W2c). Chỉ thêm; không sửa sự việc.';
COMMENT ON COLUMN policy_review_acks.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN policy_review_acks.event_id IS 'Sự việc kế toán đã xem.';
COMMENT ON COLUMN policy_review_acks.checked_at IS 'policy_check.checkedAt của bản kiểm đã xem; bản kiểm mới có giá trị khác nên mở lại việc.';
COMMENT ON COLUMN policy_review_acks.acked_by IS 'Người xem: user:<id> hoặc apikey:<id>.';
COMMENT ON COLUMN policy_review_acks.acked_at IS 'Thời điểm xem.';
COMMENT ON COLUMN policy_review_acks.note IS 'Ghi chú của người xem (không bắt buộc).';
COMMENT ON COLUMN policy_review_acks.id IS 'Khoá dòng.';

CREATE OR REPLACE FUNCTION bizcity_policy_review_acks_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bằng chứng đã xem chính sách chỉ thêm, không sửa / xoá (ADR-0031 W2c).' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_policy_review_acks_guard() IS 'Bất biến policy_review_acks: không UPDATE / DELETE / TRUNCATE.';
CREATE TRIGGER policy_review_acks_guard BEFORE UPDATE OR DELETE ON policy_review_acks FOR EACH ROW EXECUTE FUNCTION bizcity_policy_review_acks_guard();
CREATE TRIGGER policy_review_acks_no_truncate BEFORE TRUNCATE ON policy_review_acks FOR EACH STATEMENT EXECUTE FUNCTION bizcity_policy_review_acks_guard();

ALTER TABLE policy_review_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_review_acks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON policy_review_acks USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

CREATE OR REPLACE VIEW bizcity_read.document_queue WITH (security_invoker = true) AS
  -- Đề nghị thanh toán: duyệt xong chưa phải xong việc — còn phải CHI (điểm ghi nhận), nên 'approved' vẫn ở hàng việc.
  SELECT p.tenant_id,
         'payment_request'::text AS source,
         p.id::text AS source_id,
         ('quy.payment_request:' || p.id)::text AS doc_ref,
         'payment_request'::text AS doc_type,
         p.request_no AS doc_no,
         p.request_date AS doc_date,
         p.branch_code,
         p.amount,
         p.status AS status_raw,
         (CASE p.status WHEN 'draft' THEN 'draft' WHEN 'rejected' THEN 'draft'
                        WHEN 'submitted' THEN 'pending' WHEN 'approved1' THEN 'pending'
                        WHEN 'approved' THEN 'approved' END)::text AS status_group,
         (CASE WHEN p.status = 'rejected' THEN 'returned' END)::text AS flag,
         p.created_by,
         p.created_at,
         (CASE p.status WHEN 'approved' THEN coalesce(p.approved2_at, p.approved1_at, p.updated_at)
                        WHEN 'approved1' THEN coalesce(p.approved1_at, p.updated_at)
                        WHEN 'submitted' THEN coalesce(p.submitted_at, p.updated_at)
                        ELSE p.updated_at END)::timestamptz AS waiting_since
    FROM public.payment_requests p
   WHERE p.status IN ('draft', 'submitted', 'approved1', 'approved', 'rejected')
  UNION ALL
  -- Phiếu mua: duyệt = ghi sổ (điểm ghi nhận), nên chỉ lấy nháp và chờ duyệt.
  SELECT d.tenant_id,
         'purchase_document'::text,
         d.id::text,
         ('mua-hang.document:' || d.id)::text,
         d.kind,
         d.doc_no,
         d.doc_date,
         d.branch_code,
         d.total,
         d.status,
         (CASE d.status WHEN 'draft' THEN 'draft' WHEN 'pending_approval' THEN 'pending' END)::text,
         NULL::text,
         d.created_by,
         d.created_at,
         d.updated_at::timestamptz
    FROM public.purchase_documents d
   WHERE d.status IN ('draft', 'pending_approval')
  UNION ALL
  -- Sự việc kế toán đang chờ định khoản (ACC14, giữ lại) hoặc bị lỗi định khoản.
  SELECT e.tenant_id,
         'accounting_event'::text,
         e.id::text,
         e.doc_key,
         e.doc_type,
         e.doc_no,
         e.doc_date,
         b.code,
         e.total,
         e.status,
         (CASE e.status WHEN 'pending' THEN 'pending' WHEN 'error' THEN 'draft' END)::text,
         (CASE e.status WHEN 'pending' THEN 'held' WHEN 'error' THEN 'blocked' END)::text,
         e.created_by,
         e.received_at,
         e.received_at::timestamptz
    FROM public.accounting_events e
    LEFT JOIN public.branches b ON b.id = e.branch_id AND b.tenant_id = e.tenant_id
   WHERE e.status IN ('pending', 'error')
  UNION ALL
  -- Bể chờ đầu vào (trạm tiền kiểm): chỉ mục đang mở; 'trial' là chạy thử preflight, không phải việc cần làm.
  SELECT i.tenant_id,
         'intake'::text,
         i.id::text,
         coalesce(i.doc_key, 'intake:' || i.id),
         coalesce(i.doc_type, 'intake'),
         coalesce(i.doc_key, '#' || i.id),
         NULL::date,
         NULL::text,
         NULL::numeric,
         i.status,
         'pending'::text,
         'held'::text,
         i.actor,
         i.received_at,
         i.received_at::timestamptz
    FROM public.intake_inbox i
   WHERE i.status = 'open'
  UNION ALL
  -- [PHASE-031 W2c] Sự việc đã ghi sổ nhưng có phát hiện chính sách (IN-POL-*) mà kế toán chưa xem bản kiểm này. pending / error đã hiện ở nhánh
  -- accounting_event nên không lặp. Xem rồi = có dòng ở policy_review_acks cùng (event_id, checkedAt); kiểm lại (checkedAt mới) mở lại việc.
  SELECT e.tenant_id,
         'policy_review'::text,
         e.id::text,
         e.doc_key,
         e.doc_type,
         e.doc_no,
         e.doc_date,
         b.code,
         e.total,
         e.status,
         'pending'::text,
         'policy'::text,
         e.created_by,
         e.received_at,
         coalesce((e.policy_check->>'checkedAt')::timestamptz, e.received_at)
    FROM public.accounting_events e
    LEFT JOIN public.branches b ON b.id = e.branch_id AND b.tenant_id = e.tenant_id
   WHERE e.status = 'posted'
     AND jsonb_array_length(COALESCE(e.policy_check->'findings', '[]'::jsonb)) > 0
     AND NOT EXISTS (SELECT 1 FROM public.policy_review_acks a
                      WHERE a.tenant_id = e.tenant_id AND a.event_id = e.id AND a.checked_at = (e.policy_check->>'checkedAt'));

COMMENT ON VIEW bizcity_read.document_queue IS 'Hàng việc (chỉ đọc): chứng từ đang mở cần ai đó làm gì — nháp, chờ duyệt, đã duyệt chưa ghi nhận, ở bể chờ, bị chặn, chờ kế toán xem chính sách. Gộp payment_requests, purchase_documents, accounting_events (pending / error; posted có phát hiện chính sách chưa xem), intake_inbox (open) về năm nhóm trạng thái chuẩn (bizcity_document@1 §5) + cờ. Không có nội dung chứng từ. Lọc tenant_id ở mọi truy vấn.';
COMMENT ON COLUMN bizcity_read.document_queue.source IS 'Nguồn: payment_request | purchase_document | accounting_event | intake | policy_review.';
COMMENT ON COLUMN bizcity_read.document_queue.flag IS 'Cờ: held (ở bể chờ / chờ định khoản), blocked (bị chặn hoặc lỗi định khoản), returned (bị trả lại để sửa), policy (đã ghi sổ, có phát hiện chính sách chờ kế toán xem); trống = bình thường.';
