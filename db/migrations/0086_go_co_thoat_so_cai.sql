-- [2026-11-08 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-12 (K3 thêm chặt, review R1 RV-R1-01, chữ chốt docs/phases/PHASE-004-MOT-CUA-GHI-SO/20-CHOT-CO-THOAT-VA-E2.md D004-6, D004-7): gỡ cờ thoát allow_ledger_purge khỏi chín trigger bảo vệ sổ, thu DELETE / TRUNCATE của ketoan_app trên sáu bảng sổ
-- =============================================================================
-- 0086 — Gỡ cờ thoát `ketoan.allow_ledger_purge`, thu quyền xoá của vai trò ứng dụng
--
--   Trước: chín trigger bảo vệ sổ chỉ chạy khi current_setting('ketoan.allow_ledger_purge', true) IS DISTINCT FROM 'on'.
--   Cờ là biến cấu hình của phiên: phiên nào cũng set_config được, không cần quyền gì; vai trò ketoan_app lại có DELETE trên các
--   bảng này (0032). Cờ chỉ test dùng (nhóm E4 của RULE-LEDGER), không mã ứng dụng, không script nào dùng.
--
--   Sau:
--     (1) Mỗi trigger được tạo lại KHÔNG có mệnh đề WHEN: luôn chạy. Tên trigger và hàm trigger giữ nguyên (không đụng thân hàm;
--         guard_ledger_line_mutation có thân mới nhất ở 0066). Muốn vượt trigger chỉ còn đường E3 (superuser, session_replication_role).
--     (2) REVOKE DELETE, TRUNCATE trên sáu bảng sổ khỏi ketoan_app. Giữ INSERT / SELECT / UPDATE: đảo, E1, E2, đổi trạng thái sự việc cần.
--         Vai trò ketoan_app do người cài đặt tạo (0032): chưa có thì bỏ qua bước này, lớp trigger vẫn có.
--     (3) Tự kiểm cuối: còn trigger nào nhắc cờ thì migration dừng.
--
--   Không đổi dữ liệu, không quét bảng; khoá ngắn (DROP / CREATE TRIGGER) trên năm bảng sổ.
--   Chỉ tiến (R-REL-5). Quay lui = khôi phục bản sao lưu ngay trước cập nhật.
-- =============================================================================

-- ledger_entries
DROP TRIGGER ledger_entries_no_truncate ON public.ledger_entries;
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON public.ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_truncate();

DROP TRIGGER ledger_entries_no_update ON public.ledger_entries;
CREATE TRIGGER ledger_entries_no_update BEFORE DELETE OR UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_entry_mutation();
COMMENT ON TRIGGER ledger_entries_no_update ON public.ledger_entries IS 'R-LEDGER-1 (0049, 0086): đầu bút toán chỉ đổi theo ba lối của Kernel; xoá bị chặn; luôn chạy (không còn cờ thoát).';

-- ledger_lines
DROP TRIGGER ledger_lines_no_truncate ON public.ledger_lines;
CREATE TRIGGER ledger_lines_no_truncate BEFORE TRUNCATE ON public.ledger_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_truncate();

DROP TRIGGER ledger_lines_no_update ON public.ledger_lines;
CREATE TRIGGER ledger_lines_no_update BEFORE DELETE OR UPDATE ON public.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_line_mutation();

-- ledger_links
DROP TRIGGER ledger_links_no_update ON public.ledger_links;
CREATE TRIGGER ledger_links_no_update BEFORE DELETE OR UPDATE ON public.ledger_links
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();

-- accounting_events
DROP TRIGGER accounting_events_no_delete ON public.accounting_events;
CREATE TRIGGER accounting_events_no_delete BEFORE DELETE OR UPDATE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_event_mutation();
COMMENT ON TRIGGER accounting_events_no_delete ON public.accounting_events IS 'R-LEDGER-12 / câu không thương lượng 1 (0049, 0086): sự việc không xoá được, định danh không đổi; luôn chạy (không còn cờ thoát).';

DROP TRIGGER accounting_events_no_truncate ON public.accounting_events;
CREATE TRIGGER accounting_events_no_truncate BEFORE TRUNCATE ON public.accounting_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_truncate();

-- accounting_event_versions
DROP TRIGGER accounting_event_versions_no_update ON public.accounting_event_versions;
CREATE TRIGGER accounting_event_versions_no_update BEFORE DELETE OR UPDATE ON public.accounting_event_versions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
COMMENT ON TRIGGER accounting_event_versions_no_update ON public.accounting_event_versions IS 'Bản cất phiên bản cũ của sự việc chỉ thêm (0049, 0086); luôn chạy (không còn cờ thoát).';

DROP TRIGGER accounting_event_versions_no_truncate ON public.accounting_event_versions;
CREATE TRIGGER accounting_event_versions_no_truncate BEFORE TRUNCATE ON public.accounting_event_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_truncate();

-- Thu quyền phá huỷ của vai trò ứng dụng trên bảng sổ (lớp thứ hai, độc lập với trigger).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    REVOKE DELETE, TRUNCATE ON public.ledger_entries, public.ledger_lines, public.ledger_links,
      public.accounting_events, public.accounting_event_versions, public.posting_log FROM ketoan_app;
  END IF;
END $$;

-- Tự kiểm: không còn trigger nào nhắc cờ thoát.
DO $$
DECLARE v_left text;
BEGIN
  SELECT string_agg(c.relname || '.' || t.tgname, ', ') INTO v_left
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND pg_get_triggerdef(t.oid) LIKE '%allow_ledger_purge%';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0086 dừng: còn trigger nhắc cờ thoát allow_ledger_purge: %', v_left;
  END IF;
END $$;
