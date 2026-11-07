-- [2026-11-06 02:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-41 (D030-15, R-LEDGER-12): ledger_entries.event_id bắt buộc ở CSDL — chữ chốt docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/25-BUT-TOAN-LUON-CO-CHUNG-TU.md
-- =============================================================================
-- 0077 Mọi bút toán có chứng từ gốc: ledger_entries.event_id NOT NULL (R-LEDGER-12, bốn câu không thương lượng: không sự việc, không bút toán).
--   Trước đây cột cho phép NULL (0006); chỉ kỷ luật của mã và chẩn đoán LEDGER_ORPHAN giữ. Nay CSDL từ chối.
--   An toàn cho bản cài có dữ liệu: ràng buộc CHECK ... NOT VALID rồi VALIDATE (quét cả bảng, không bị RLS che) trong khối bắt lỗi — nếu có
--   dòng rỗng, dừng bằng câu tiếng Việt nêu số dòng và số bút toán đầu thay vì lỗi PostgreSQL trần. KHÔNG tự sửa sổ (R-LEDGER-1, sổ chỉ thêm).
--   Khoá ngoại ledger_entries_source_document_id_fkey giữ nguyên: NOT NULL không thay được "sự việc có thật".
-- =============================================================================

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_event_id_required CHECK (event_id IS NOT NULL) NOT VALID;

DO $$
DECLARE
  v_n bigint;
  v_first text;
BEGIN
  BEGIN
    ALTER TABLE public.ledger_entries VALIDATE CONSTRAINT ledger_entries_event_id_required;
  EXCEPTION WHEN check_violation THEN
    -- Bản cài có dòng rỗng: đếm bằng chủ bảng (superuser / BYPASSRLS thấy hết; vai trò khác có thể chỉ thấy phần của mình — con số là tối thiểu).
    SELECT count(*), min(entry_no) INTO v_n, v_first FROM public.ledger_entries WHERE event_id IS NULL;
    RAISE EXCEPTION 'Migration 0077 dừng: có ít nhất % bút toán không có chứng từ gốc (ledger_entries.event_id rỗng), bút toán đầu: %. Sổ chỉ thêm nên migration KHÔNG tự sửa. Báo nhóm Lõi (PHASE-030 · 25 §2 D030-15b): lập sự việc bổ sung rồi nối qua đường E3 có biên bản; sau đó chạy lại migration.', v_n, coalesce(v_first, '(không đọc được do RLS)')
      USING ERRCODE = 'check_violation';
  END;
END
$$;

-- Đã có ràng buộc được xác nhận: PostgreSQL 12+ dùng nó để bỏ qua lần quét khi đặt NOT NULL; xong bỏ ràng buộc thừa.
ALTER TABLE public.ledger_entries ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE public.ledger_entries DROP CONSTRAINT ledger_entries_event_id_required;

COMMENT ON COLUMN public.ledger_entries.event_id IS 'Sự kiện kế toán (chứng từ gốc) sinh ra bút toán này. Bắt buộc (NOT NULL, R-LEDGER-12): bút toán đảo giữ cùng event_id với bút toán gốc.';
