-- [2026-11-07 03:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1 (PHASE-030, D030-16 / S030-42): accounting_events.created_by bắt buộc — chữ chốt docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/35-GOI-K3.md
-- =============================================================================
-- 0081 Mọi sự việc kế toán biết ai / tác vụ nào tạo ra: accounting_events.created_by NOT NULL, không rỗng.
--   Trước đây cột cho phép NULL: chứng từ nhận từ nguồn, phiếu tay đều ghi auth.actor, riêng sự việc do Kernel tự lập qua
--   eventStore.saveVersion (khấu hao, giá vốn, khoá sổ…) bỏ trống. Đo 2026-11-07 trên ketoan_test: 1.484 / 68.923 dòng rỗng,
--   toàn bộ là khấu hao (792) và giá vốn (692) — truy được chứng từ nào nhưng chưa truy được ai khởi tạo.
--   Bước 1: điền dòng rỗng bằng danh tính tác vụ `system:<doc_type>`. Đúng sự thật: đường duy nhất để trống cột là đường tự lập
--   của Kernel, nên mọi dòng rỗng là sự việc hệ thống. Không đoán tên người.
--   Trigger accounting_events_no_delete (0049) coi người lập là định danh, cấm đổi kể cả từ rỗng sang có giá trị. Lần điền này
--   tắt RIÊNG trigger đó trong chính giao dịch của migration (ALTER TABLE giữ khoá ACCESS EXCLUSIVE: không phiên nào chen vào
--   sửa được), chỉ điền dòng đang rỗng, rồi bật lại ngay. Không dùng cờ ketoan.allow_ledger_purge (E4, chỉ cho test).
--   Người lập đã có giá trị vẫn không đổi được.
--   Bước 2: ràng buộc "không rỗng" (kể cả chuỗi trắng) NOT VALID rồi VALIDATE trong khối bắt lỗi — còn dòng chuỗi trắng thì dừng bằng
--   câu tiếng Việt, KHÔNG tự sửa (chuỗi trắng là dữ liệu lạ, cần người xem).
--   Bước 3: SET NOT NULL. Đường lui: ALTER COLUMN created_by DROP NOT NULL + DROP CONSTRAINT (các dòng đã điền giữ nguyên, đó là thông tin đúng).
-- =============================================================================

ALTER TABLE public.accounting_events DISABLE TRIGGER accounting_events_no_delete;
UPDATE public.accounting_events SET created_by = 'system:' || doc_type WHERE created_by IS NULL;
ALTER TABLE public.accounting_events ENABLE TRIGGER accounting_events_no_delete;

ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_created_by_present CHECK (created_by IS NOT NULL AND btrim(created_by) <> '') NOT VALID;

DO $$
DECLARE
  v_n bigint;
  v_first text;
BEGIN
  BEGIN
    ALTER TABLE public.accounting_events VALIDATE CONSTRAINT accounting_events_created_by_present;
  EXCEPTION WHEN check_violation THEN
    SELECT count(*), min(doc_key) INTO v_n, v_first FROM public.accounting_events WHERE created_by IS NULL OR btrim(created_by) = '';
    RAISE EXCEPTION 'Migration 0081 dừng: có ít nhất % sự việc có người tạo là chuỗi trắng (accounting_events.created_by), sự việc đầu: %. Migration KHÔNG tự sửa: xem các dòng này, ghi đúng người / tác vụ đã tạo rồi chạy lại.', v_n, v_first
      USING ERRCODE = 'check_violation';
  END;
END
$$;

ALTER TABLE public.accounting_events ALTER COLUMN created_by SET NOT NULL;

COMMENT ON COLUMN public.accounting_events.created_by IS 'Ai tạo sự việc: actor của lần nhận (user:<id>, key:<id>, mcp:…) hoặc danh tính tác vụ hệ thống (system:<doc_type>) cho sự việc Kernel tự lập. Bắt buộc, không rỗng (0081, D030-16).';
