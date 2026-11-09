-- [2026-11-09 08:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14 (K3 thêm chặt, chữ chốt docs/phases/PHASE-004-MOT-CUA-GHI-SO/21-CHOT-VET-E2-CSDL-VA-E1.md D004-11, D004-12): dấu vết ở CSDL cho mọi thay đổi bảy cột E2 của ledger_entries, kể cả UPDATE viết thẳng bằng ketoan_app
-- =============================================================================
-- 0089 — Dấu vết ở tầng CSDL cho đường E2 (cập nhật thông tin đầu bút toán)
--
--   Trước: trigger guard_ledger_entry_mutation (0049) cho phép đổi bảy cột doc_no, invoice_no, reason_code, partner_id, description,
--   content_hash, event_version của bút toán posted. S004-13 ghi nhật ký trước / sau nhưng ở MÃ ỨNG DỤNG; một câu UPDATE viết thẳng
--   bằng ketoan_app không đi qua mã đó nên không để lại dấu vết.
--
--   Sau: trigger AFTER UPDATE ghi một dòng audit_logs (chuỗi băm, chỉ thêm — 0036) mỗi khi một trong CHÍN cột đổi, từ BẤT KỲ đường nào.
--   Chín = bảy cột E2 mà ứng dụng ghi + partner_name, partner_attr_id (0087, PHASE-029 S029-19): hai cột này ghi chú "không đổi về sau" nhưng
--   trigger guard_ledger_entry_mutation chỉ liệt kê cột BỊ ÉP nên cột mới mặc nhiên đổi được khi bút toán posted. Migration này KHÔNG đóng băng
--   chúng (quyết định của chủ S029-19, câu hỏi Q004-9) mà bảo đảm mọi thay đổi để lại dấu vết.
--   ketoan_app không phải chủ bảng nên không tắt được trigger; không xoá được dòng nhật ký.
--     action = 'ledger.entry.header_update'  (cùng tên với nhật ký mức ứng dụng của S004-13)
--     before_data / after_data: chỉ các cột THẬT SỰ đổi; after_data thêm _source = 'db', _txid (giao dịch), _role (vai trò hiệu lực), _login (vai trò đăng nhập),
--     _app (application_name), _client (địa chỉ máy khách).
--   _txid để phân biệt "đã khai báo" (nhật ký mức ứng dụng có cùng _txid) với "sửa ngoài ứng dụng" (chỉ có dòng _source = 'db'): chẩn đoán S004-15.
--   Không dùng biến phiên làm "giấy phép" (bài học của cờ allow_ledger_purge, 0086): trigger ghi MỌI thay đổi, việc phân loại làm ở tầng đọc.
--
--   Không đổi dữ liệu, không quét bảng. WHEN chỉ kích hoạt khi bảy cột đổi nên đảo (status) và điền giá vốn (total) không tốn gì.
--   Chỉ tiến (R-REL-5).
-- =============================================================================

CREATE FUNCTION public.ledger_entries_header_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
BEGIN
  IF OLD.doc_no IS DISTINCT FROM NEW.doc_no THEN
    v_before := v_before || jsonb_build_object('doc_no', OLD.doc_no);
    v_after := v_after || jsonb_build_object('doc_no', NEW.doc_no);
  END IF;
  IF OLD.invoice_no IS DISTINCT FROM NEW.invoice_no THEN
    v_before := v_before || jsonb_build_object('invoice_no', OLD.invoice_no);
    v_after := v_after || jsonb_build_object('invoice_no', NEW.invoice_no);
  END IF;
  IF OLD.reason_code IS DISTINCT FROM NEW.reason_code THEN
    v_before := v_before || jsonb_build_object('reason_code', OLD.reason_code);
    v_after := v_after || jsonb_build_object('reason_code', NEW.reason_code);
  END IF;
  IF OLD.partner_id IS DISTINCT FROM NEW.partner_id THEN
    v_before := v_before || jsonb_build_object('partner_id', OLD.partner_id);
    v_after := v_after || jsonb_build_object('partner_id', NEW.partner_id);
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    v_before := v_before || jsonb_build_object('description', OLD.description);
    v_after := v_after || jsonb_build_object('description', NEW.description);
  END IF;
  IF OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
    v_before := v_before || jsonb_build_object('content_hash', OLD.content_hash);
    v_after := v_after || jsonb_build_object('content_hash', NEW.content_hash);
  END IF;
  IF OLD.event_version IS DISTINCT FROM NEW.event_version THEN
    v_before := v_before || jsonb_build_object('event_version', OLD.event_version);
    v_after := v_after || jsonb_build_object('event_version', NEW.event_version);
  END IF;
  IF OLD.partner_name IS DISTINCT FROM NEW.partner_name THEN
    v_before := v_before || jsonb_build_object('partner_name', OLD.partner_name);
    v_after := v_after || jsonb_build_object('partner_name', NEW.partner_name);
  END IF;
  IF OLD.partner_attr_id IS DISTINCT FROM NEW.partner_attr_id THEN
    v_before := v_before || jsonb_build_object('partner_attr_id', OLD.partner_attr_id);
    v_after := v_after || jsonb_build_object('partner_attr_id', NEW.partner_attr_id);
  END IF;
  INSERT INTO public.audit_logs (tenant_id, actor, actor_kind, actor_via, module_id, action, object_type, object_id, subject, before_data, after_data)
  VALUES (NEW.tenant_id, session_user, 'system', 'db-trigger', 'kernel', 'ledger.entry.header_update', 'ledger_entry', NEW.id::text, NEW.entry_no,
          v_before,
          v_after || jsonb_build_object('_source', 'db', '_txid', pg_current_xact_id()::text, '_role', current_user, '_login', session_user,
                                        '_app', current_setting('application_name', true), '_client', coalesce(inet_client_addr()::text, 'local')));
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.ledger_entries_header_audit() IS 'Trigger ledger_entries (0089): ghi audit_logs mọi thay đổi chín cột E2 (doc_no, invoice_no, reason_code, partner_id, description, content_hash, event_version + partner_name, partner_attr_id của 0087), từ mọi đường kể cả UPDATE thẳng; after_data mang _source = db và _txid để đối chiếu với nhật ký mức ứng dụng (S004-13).';

CREATE TRIGGER ledger_entries_header_audit AFTER UPDATE ON public.ledger_entries
  FOR EACH ROW WHEN (
       OLD.doc_no IS DISTINCT FROM NEW.doc_no
    OR OLD.invoice_no IS DISTINCT FROM NEW.invoice_no
    OR OLD.reason_code IS DISTINCT FROM NEW.reason_code
    OR OLD.partner_id IS DISTINCT FROM NEW.partner_id
    OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
    OR OLD.event_version IS DISTINCT FROM NEW.event_version
    OR OLD.partner_name IS DISTINCT FROM NEW.partner_name
    OR OLD.partner_attr_id IS DISTINCT FROM NEW.partner_attr_id)
  EXECUTE FUNCTION public.ledger_entries_header_audit();

COMMENT ON TRIGGER ledger_entries_header_audit ON public.ledger_entries IS 'S004-14 (0089): mọi thay đổi chín cột E2 để lại một dòng audit_logs, kể cả UPDATE viết thẳng bằng ketoan_app.';

-- Tự kiểm: trigger có và đang bật.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ledger_entries_header_audit' AND tgrelid = 'public.ledger_entries'::regclass AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Migration 0089 dừng: trigger ledger_entries_header_audit không có hoặc đang tắt';
  END IF;
END $$;
