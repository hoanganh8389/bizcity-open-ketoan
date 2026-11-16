-- [2026-11-15 Nguyễn Văn Thủy] Bút toán: branch_uid bất biến như branch_id; partner_uid đổi cùng partner_id (đường E2) và có dấu vết (đóng góp)
--
-- 0138 thêm branch_uid, partner_uid vào ledger_entries (trigger tự điền từ branch_id / partner_id) nhưng chưa đưa vào luật bất biến
-- của sổ: guard_ledger_entry_mutation không ép, trigger dấu vết 0089 không ghi. Ở đây:
--   branch_uid  → ép không đổi (chi nhánh của bút toán không bao giờ đổi);
--   partner_uid → đổi được cùng partner_id (cập nhật thông tin đầu E2, khi đảo và khi điền giá vốn thì giữ nguyên), ghi dấu vết như partner_id.

CREATE OR REPLACE FUNCTION public.guard_ledger_entry_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     -- định danh, nguồn, kỳ, ngày, chi nhánh, chiều đảo, dấu vân tay thân, chính sách: không bao giờ đổi
     AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.branch_id = OLD.branch_id AND NEW.branch_uid IS NOT DISTINCT FROM OLD.branch_uid
     AND NEW.period_id IS NOT DISTINCT FROM OLD.period_id AND NEW.entry_no = OLD.entry_no AND NEW.doc_type = OLD.doc_type
     AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id AND NEW.doc_date IS NOT DISTINCT FROM OLD.doc_date
     AND NEW.posting_date = OLD.posting_date AND NEW.is_reversal = OLD.is_reversal
     AND NEW.reverses_entry_id IS NOT DISTINCT FROM OLD.reverses_entry_id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by AND NEW.created_at = OLD.created_at
     AND NEW.body_hash IS NOT DISTINCT FROM OLD.body_hash AND NEW.policy_version IS NOT DISTINCT FROM OLD.policy_version
  THEN
    -- (a) đảo: chỉ trạng thái posted → reversed
    IF OLD.status = 'posted' AND NEW.status = 'reversed'
       AND NEW.total = OLD.total AND NEW.doc_no IS NOT DISTINCT FROM OLD.doc_no
       AND NEW.invoice_no IS NOT DISTINCT FROM OLD.invoice_no AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code
       AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.partner_uid IS NOT DISTINCT FROM OLD.partner_uid AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash AND NEW.event_version IS NOT DISTINCT FROM OLD.event_version
    THEN
      RETURN NEW;
    END IF;
    -- (b) E2: thông tin đầu, tiền và trạng thái giữ nguyên
    IF OLD.status = 'posted' AND NEW.status = 'posted' AND NEW.total = OLD.total THEN
      RETURN NEW;
    END IF;
    -- (c) E1: điền giá vốn đổi tổng tiền, mọi thông tin đầu giữ nguyên — chỉ qua hàm ledger_fill_entry_totals (chủ hàm ketoan_ledger_cost)
    IF current_user = 'ketoan_ledger_cost'
       AND OLD.status = 'posted' AND NEW.status = 'posted' AND NOT OLD.is_reversal AND NEW.total >= 0
       AND NEW.doc_no IS NOT DISTINCT FROM OLD.doc_no AND NEW.invoice_no IS NOT DISTINCT FROM OLD.invoice_no
       AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.partner_uid IS NOT DISTINCT FROM OLD.partner_uid
       AND NEW.description IS NOT DISTINCT FROM OLD.description AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
       AND NEW.event_version IS NOT DISTINCT FROM OLD.event_version
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá bút toán.'
    USING ERRCODE = 'insufficient_privilege';
END $function$;

CREATE OR REPLACE FUNCTION public.ledger_entries_header_audit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  IF OLD.partner_uid IS DISTINCT FROM NEW.partner_uid THEN
    v_before := v_before || jsonb_build_object('partner_uid', OLD.partner_uid);
    v_after := v_after || jsonb_build_object('partner_uid', NEW.partner_uid);
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
END $function$;

DROP TRIGGER IF EXISTS ledger_entries_header_audit ON public.ledger_entries;
CREATE TRIGGER ledger_entries_header_audit AFTER UPDATE ON public.ledger_entries FOR EACH ROW
  WHEN ((old.doc_no IS DISTINCT FROM new.doc_no) OR (old.invoice_no IS DISTINCT FROM new.invoice_no) OR (old.reason_code IS DISTINCT FROM new.reason_code)
     OR (old.partner_id IS DISTINCT FROM new.partner_id) OR (old.partner_uid IS DISTINCT FROM new.partner_uid) OR (old.description IS DISTINCT FROM new.description)
     OR (old.content_hash IS DISTINCT FROM new.content_hash) OR (old.event_version IS DISTINCT FROM new.event_version)
     OR (old.partner_name IS DISTINCT FROM new.partner_name) OR (old.partner_attr_id IS DISTINCT FROM new.partner_attr_id))
  EXECUTE FUNCTION public.ledger_entries_header_audit();
