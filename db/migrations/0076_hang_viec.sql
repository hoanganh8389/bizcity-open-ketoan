-- [2026-11-06 07:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31: hàng việc — khung nhìn chỉ đọc bizcity_read.document_queue gộp trạng thái bốn bảng có sẵn về năm nhóm chuẩn + cờ (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/23-HANG-VIEC.md)
-- =============================================================================
-- 0076 Hàng việc (PHASE-030 S030-31).
--   Một khung nhìn chỉ đọc cho câu hỏi "bao nhiêu chứng từ đang nháp / chờ duyệt / đã duyệt chưa ghi nhận / ở bể chờ / bị chặn".
--   Chỉ lấy việc ĐANG MỞ; chứng từ xong (posted, paid, cancelled) không có mặt. Không đổi bảng gốc, không dữ liệu.
--   Bốn nguồn hiện có (phân hệ cũ + Kernel): payment_requests, purchase_documents, accounting_events, intake_inbox.
--   Khi chứng từ chuyển sang defineDocument (module_documents, PHASE-030 P-030-1) thêm một nhánh UNION; nhánh của hai phân hệ cũ
--   bỏ khi phân hệ chuyển sang modules/ (ADR-0024).
--   security_invoker: RLS của bảng gốc áp theo người gọi; mọi truy vấn vẫn phải lọc tenant_id (R-TEN).
-- =============================================================================

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
   WHERE i.status = 'open';

COMMENT ON VIEW bizcity_read.document_queue IS 'Hàng việc (chỉ đọc): chứng từ đang mở cần ai đó làm gì — nháp, chờ duyệt, đã duyệt chưa ghi nhận, ở bể chờ, bị chặn. Gộp payment_requests, purchase_documents, accounting_events (pending / error), intake_inbox (open) về năm nhóm trạng thái chuẩn (bizcity_document@1 §5) + cờ. Không có nội dung chứng từ. Lọc tenant_id ở mọi truy vấn (PHASE-030 · 23).';
COMMENT ON COLUMN bizcity_read.document_queue.tenant_id IS 'Đơn vị; RLS của bảng gốc áp qua security_invoker.';
COMMENT ON COLUMN bizcity_read.document_queue.source IS 'Nguồn: payment_request | purchase_document | accounting_event | intake.';
COMMENT ON COLUMN bizcity_read.document_queue.source_id IS 'Khoá trong bảng nguồn (dạng chữ) để mở đúng màn.';
COMMENT ON COLUMN bizcity_read.document_queue.doc_ref IS 'Khoá chứng từ ổn định dạng <module>.<loại>:<id>. Với phân hệ cũ là khoá tổng hợp; với sự việc kế toán và bể chờ là doc_key.';
COMMENT ON COLUMN bizcity_read.document_queue.doc_type IS 'Loại chứng từ: payment_request, loại phiếu mua (kind), docType của sự việc kế toán, hoặc loại ở bể chờ.';
COMMENT ON COLUMN bizcity_read.document_queue.doc_no IS 'Số chứng từ; bể chờ không có số thì dùng doc_key hoặc #<id>.';
COMMENT ON COLUMN bizcity_read.document_queue.doc_date IS 'Ngày chứng từ; trống ở bể chờ.';
COMMENT ON COLUMN bizcity_read.document_queue.branch_code IS 'Mã chi nhánh; trống ở bể chờ.';
COMMENT ON COLUMN bizcity_read.document_queue.amount IS 'Số tiền chứng từ (tổng); trống ở bể chờ.';
COMMENT ON COLUMN bizcity_read.document_queue.status_raw IS 'Trạng thái gốc của bảng nguồn.';
COMMENT ON COLUMN bizcity_read.document_queue.status_group IS 'Nhóm trạng thái chuẩn: draft | pending | approved (việc đang mở; done, cancelled không có mặt).';
COMMENT ON COLUMN bizcity_read.document_queue.flag IS 'Cờ: held (ở bể chờ / chờ định khoản), blocked (bị chặn hoặc lỗi định khoản), returned (bị trả lại để sửa); trống = bình thường.';
COMMENT ON COLUMN bizcity_read.document_queue.created_by IS 'Người lập: user:<id> hoặc apikey:<id>.';
COMMENT ON COLUMN bizcity_read.document_queue.created_at IS 'Thời điểm lập.';
COMMENT ON COLUMN bizcity_read.document_queue.waiting_since IS 'Thời điểm bắt đầu chờ ở trạng thái hiện tại — dùng tính tuổi của việc.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.document_queue
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();
