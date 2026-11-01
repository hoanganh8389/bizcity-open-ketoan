-- [2026-11-01 10:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — P0-1 (AUDIT-2026-11-01, A-07): khoá ledger_entries ở tầng CSDL (chặn DELETE, UPDATE chỉ đúng ba lối E1 / E2 / đảo); accounting_events chặn DELETE và đổi định danh; accounting_event_versions chỉ thêm
-- =============================================================================
-- 0049 Khoá đầu bút toán và sự việc kế toán ở tầng CSDL (R-LEDGER-1, R-LEDGER-2; RULE-LEDGER E1, E2).
--      Trước đây ledger_entries chỉ chặn TRUNCATE: vai trò ứng dụng UPDATE / DELETE được đầu bút toán (tổng tiền, ngày,
--      tài khoản đối ứng qua sự việc, trạng thái), chỉ có quy ước trong mã giữ. Nay trigger cho phép ĐÚNG ba lối mà Kernel
--      đang dùng, mọi thay đổi khác bị từ chối:
--        (a) đảo bút toán: status 'posted' → 'reversed', mọi cột khác giữ nguyên (ledger.repository markReversed);
--        (b) E2 cập nhật thông tin đầu khi định khoản lại mà thân không đổi: chỉ doc_no, invoice_no, reason_code, partner_id,
--            description, content_hash, event_version; bút toán đang 'posted' (posting.service);
--        (c) E1 điền giá vốn: chỉ total, khi ketoan.cost_overwrite = 'on', bút toán 'posted' không phải bút toán đảo
--            (ledger.service overwriteCostPairs — cùng điều kiện với guard_ledger_line_mutation).
--      DELETE luôn bị chặn. Nhánh ketoan.allow_ledger_purge (E4, chỉ test) giữ như các trigger sổ khác; E3 (scripts/
--      xoa-chung-tu.sh) dùng session_replication_role = replica nên không đổi.
--      accounting_events: chặn DELETE; không đổi id, tenant_id, doc_key, source_system, created_by; version không giảm.
--      Các cột còn lại (trạng thái, phiên bản mới, payload…) do cửa nạp / eventStore quản lý như cũ.
--      accounting_event_versions: chỉ thêm (bản cất phiên bản cũ là bằng chứng).
-- =============================================================================

CREATE FUNCTION public.guard_ledger_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     -- định danh, nguồn, kỳ, ngày, chi nhánh, chiều đảo, dấu vân tay thân, chính sách: không bao giờ đổi
     AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.branch_id = OLD.branch_id
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
       AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash AND NEW.event_version IS NOT DISTINCT FROM OLD.event_version
    THEN
      RETURN NEW;
    END IF;
    -- (b) E2: thông tin đầu, tiền và trạng thái giữ nguyên
    IF OLD.status = 'posted' AND NEW.status = 'posted' AND NEW.total = OLD.total THEN
      RETURN NEW;
    END IF;
    -- (c) E1: điền giá vốn đổi tổng tiền, mọi thông tin đầu giữ nguyên
    IF current_setting('ketoan.cost_overwrite', true) = 'on'
       AND OLD.status = 'posted' AND NEW.status = 'posted' AND NOT OLD.is_reversal AND NEW.total >= 0
       AND NEW.doc_no IS NOT DISTINCT FROM OLD.doc_no AND NEW.invoice_no IS NOT DISTINCT FROM OLD.invoice_no
       AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id
       AND NEW.description IS NOT DISTINCT FROM OLD.description AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
       AND NEW.event_version IS NOT DISTINCT FROM OLD.event_version
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá bút toán.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

COMMENT ON FUNCTION public.guard_ledger_entry_mutation() IS 'Trigger ledger_entries (0049): chặn DELETE; UPDATE chỉ cho (a) đảo posted → reversed, (b) E2 cập nhật thông tin đầu khi thân không đổi, (c) E1 điền giá vốn đổi total khi ketoan.cost_overwrite = on. RULE-LEDGER R-LEDGER-1.';

CREATE TRIGGER ledger_entries_no_update BEFORE DELETE OR UPDATE ON public.ledger_entries
  FOR EACH ROW WHEN ((current_setting('ketoan.allow_ledger_purge'::text, true) IS DISTINCT FROM 'on'::text))
  EXECUTE FUNCTION public.guard_ledger_entry_mutation();

CREATE FUNCTION public.guard_accounting_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.doc_key = OLD.doc_key
     AND NEW.source_system IS NOT DISTINCT FROM OLD.source_system AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.version >= OLD.version
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sự việc kế toán không được xoá, không đổi định danh (doc_key, nguồn, người lập), không lùi phiên bản. Huỷ = trạng thái cancelled qua cửa nạp.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

COMMENT ON FUNCTION public.guard_accounting_event_mutation() IS 'Trigger accounting_events (0049): chặn DELETE; UPDATE không đổi id, tenant_id, doc_key, source_system, created_by và không lùi version. Không có sự việc thì không có bút toán (câu không thương lượng 1).';

CREATE TRIGGER accounting_events_no_delete BEFORE DELETE OR UPDATE ON public.accounting_events
  FOR EACH ROW WHEN ((current_setting('ketoan.allow_ledger_purge'::text, true) IS DISTINCT FROM 'on'::text))
  EXECUTE FUNCTION public.guard_accounting_event_mutation();

CREATE TRIGGER accounting_event_versions_no_update BEFORE DELETE OR UPDATE ON public.accounting_event_versions
  FOR EACH ROW WHEN ((current_setting('ketoan.allow_ledger_purge'::text, true) IS DISTINCT FROM 'on'::text))
  EXECUTE FUNCTION public.forbid_ledger_mutation();

CREATE TRIGGER accounting_event_versions_no_truncate BEFORE TRUNCATE ON public.accounting_event_versions
  FOR EACH STATEMENT WHEN ((current_setting('ketoan.allow_ledger_purge'::text, true) IS DISTINCT FROM 'on'::text))
  EXECUTE FUNCTION public.forbid_ledger_truncate();

CREATE TRIGGER accounting_events_no_truncate BEFORE TRUNCATE ON public.accounting_events
  FOR EACH STATEMENT WHEN ((current_setting('ketoan.allow_ledger_purge'::text, true) IS DISTINCT FROM 'on'::text))
  EXECUTE FUNCTION public.forbid_ledger_truncate();

COMMENT ON TRIGGER ledger_entries_no_update ON public.ledger_entries IS 'R-LEDGER-1 (0049): đầu bút toán chỉ đổi theo ba lối của Kernel; xoá bị chặn.';
COMMENT ON TRIGGER accounting_events_no_delete ON public.accounting_events IS 'R-LEDGER-12 / câu không thương lượng 1 (0049): sự việc không xoá được, định danh không đổi.';
COMMENT ON TRIGGER accounting_event_versions_no_update ON public.accounting_event_versions IS 'Bản cất phiên bản cũ của sự việc chỉ thêm (0049).';
