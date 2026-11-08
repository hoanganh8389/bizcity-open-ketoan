-- [2026-11-07 03:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1 (S029-17): khoá kỳ ở CSDL — chữ chốt docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/35-GOI-K3.md
-- =============================================================================
-- 0081 Bút toán không vào được kỳ đã khoá, kể cả khi bỏ qua ứng dụng (R-LEDGER-9).
--   Trước đây chỉ ledgerService.post / repost kiểm (periodRepository.isLocked). Trigger này chặn đường vòng (SQL tay, script, mã mới
--   quên kiểm). Cùng điều kiện với isLocked: khoá cùng kỳ, chi nhánh trống (mọi chi nhánh) hoặc đúng chi nhánh, loại '*' hoặc đúng loại.
--   Đo 2026-11-07 trên ketoan_test: 0 bút toán được tạo sau lúc khoá kỳ (591 bút toán thuộc kỳ đã khoá, đều ghi trước khi khoá) —
--   trigger không chặn dữ liệu cũ nào, chỉ áp cho lần chèn sau. Chỉ BEFORE INSERT: sửa bút toán đã có sẵn bị ledger_entries_no_update chặn.
--   Đường lui: DROP TRIGGER ledger_entries_period_lock ON ledger_entries; DROP FUNCTION ledger_entries_period_lock_guard(). Không đổi dòng nào.
-- =============================================================================

CREATE FUNCTION public.ledger_entries_period_lock_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_y smallint;
  v_m smallint;
BEGIN
  IF NEW.period_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.period_locks l
    WHERE l.tenant_id = NEW.tenant_id AND l.period_id = NEW.period_id
      AND (l.branch_id IS NULL OR l.branch_id = NEW.branch_id)
      AND (l.doc_type = '*' OR l.doc_type = NEW.doc_type)
  ) THEN
    SELECT p.year, p.month INTO v_y, v_m FROM public.fiscal_periods p WHERE p.id = NEW.period_id;
    RAISE EXCEPTION 'PERIOD_LOCKED: kỳ %/% đã khoá — không ghi bút toán % (loại %) vào kỳ này. Mở khoá kỳ trước, hoặc ghi vào kỳ đang mở.',
      lpad(coalesce(v_m, 0)::text, 2, '0'), coalesce(v_y, 0), coalesce(NEW.entry_no, '(chưa số)'), NEW.doc_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ledger_entries_period_lock BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_period_lock_guard();

COMMENT ON FUNCTION public.ledger_entries_period_lock_guard() IS 'Chặn chèn bút toán vào kỳ đã khoá (cùng điều kiện periodRepository.isLocked: kỳ, chi nhánh trống hoặc đúng, loại * hoặc đúng). 0081, S029-17, R-LEDGER-9.';
