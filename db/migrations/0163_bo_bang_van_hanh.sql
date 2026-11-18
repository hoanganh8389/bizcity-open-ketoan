-- [2026-11-18 Nguyễn Văn Thủy] Gom bảng về lõi, đợt 4: bộ đếm, hàng đợi sự kiện, nhật ký vận hành — bỏ 5 bảng (đóng góp)
--
-- Luật mới: LỊCH SỬ / LƯỢT CHẠY (thứ "đã xảy ra, để xem lại", không cần cùng giao dịch với sổ) ghi nhật ký JSONL
-- (packages/platform/src/core/run-log.ts: DATA_DIR/nhat-ky/<luồng>/<đơn vị>/<yyyy-mm>.jsonl), KHÔNG tạo bảng.
-- Bảng chỉ dành cho thứ phải nằm cùng giao dịch: chứng từ, sổ, chống gửi trùng, hàng đợi sự kiện, bằng chứng có chuỗi băm.
--
--   ledger_entry_sequences  → document_sequences, loại 'ledger:entry' (một bộ đếm số chung)
--   event_consumptions      → event_deliveries.consumed_at (dấu đã xử lý nằm trên chính dòng giao, khoá cùng dòng)
--   diagnostic_runs         → nhật ký JSONL luồng chan-doan   (lượt tự chẩn đoán; ứng dụng chép dòng cũ ra tệp khi khởi động)
--   conformance_runs        → nhật ký JSONL luồng kiem-chuan  (lượt Kiểm chuẩn; như trên)
--   library_usage_daily     → nhật ký JSONL luồng thu-vien    (số đếm lượt dùng thư viện; như trên)
-- Ba bảng nhật ký: migration không ghi được tệp, nên chép nội dung sang bảng tạm _run_log_export; ứng dụng (lần khởi động đầu)
-- ghi ra JSONL rồi xoá bảng tạm (runLogImport ở app). Bảng tạm chỉ tồn tại tới lần khởi động đó.

-- ── Bộ đếm số bút toán ───────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('ledger_entry_sequences') IS NULL THEN RETURN; END IF;
  INSERT INTO document_sequences (tenant_id, doc_type, year, last_no)
  SELECT tenant_id, 'ledger:entry', year, last_no FROM ledger_entry_sequences
  ON CONFLICT (tenant_id, doc_type, year) DO UPDATE SET last_no = GREATEST(document_sequences.last_no, EXCLUDED.last_no);
  IF EXISTS (SELECT 1 FROM ledger_entry_sequences s WHERE NOT EXISTS (
       SELECT 1 FROM document_sequences d WHERE d.tenant_id = s.tenant_id AND d.doc_type = 'ledger:entry' AND d.year = s.year AND d.last_no >= s.last_no)) THEN
    RAISE EXCEPTION '0161: chuyển bộ đếm số bút toán thiếu / lùi số';
  END IF;
  DROP TABLE ledger_entry_sequences;
END $$;

-- ── Dấu đã xử lý của hàng đợi sự kiện ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE event_deliveries ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
COMMENT ON COLUMN event_deliveries.consumed_at IS 'Thời điểm subscriber đã xử lý sự kiện (0161, thay event_consumptions): có giá trị thì giao lại → bỏ qua (R-OUTBOX-4); phát lại thì xoá.';
DO $$
DECLARE n_left bigint;
BEGIN
  IF to_regclass('event_consumptions') IS NULL THEN RETURN; END IF;
  UPDATE event_deliveries d SET consumed_at = c.processed_at
    FROM event_consumptions c WHERE c.consumer = d.consumer AND c.event_id = d.event_id AND d.consumed_at IS NULL;
  -- Dấu không có dòng giao (không xảy ra ở luồng hiện tại) thì tạo dòng giao đã xong để không xử lý lại.
  INSERT INTO event_deliveries (tenant_id, consumer, event_id, status, attempts, done_at, consumed_at)
  SELECT c.tenant_id, c.consumer, c.event_id, 'done', 1, c.processed_at, c.processed_at FROM event_consumptions c
   WHERE NOT EXISTS (SELECT 1 FROM event_deliveries d WHERE d.consumer = c.consumer AND d.event_id = c.event_id);
  SELECT count(*) INTO n_left FROM event_consumptions c
   WHERE NOT EXISTS (SELECT 1 FROM event_deliveries d WHERE d.consumer = c.consumer AND d.event_id = c.event_id AND d.consumed_at IS NOT NULL);
  IF n_left > 0 THEN RAISE EXCEPTION '0161: còn % dấu đã xử lý chưa chuyển', n_left; END IF;
  DROP TABLE event_consumptions;
END $$;

-- ── Ba bảng nhật ký → bảng tạm để ứng dụng ghi ra JSONL ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _run_log_export (
  stream     text        NOT NULL,
  tenant_id  bigint      NOT NULL,
  at         timestamptz NOT NULL,
  data       jsonb       NOT NULL
);
COMMENT ON TABLE _run_log_export IS 'Tạm (0161): dòng nhật ký cũ chờ ứng dụng ghi ra JSONL ở lần khởi động đầu, ghi xong thì xoá bảng.';

DO $$
BEGIN
  IF to_regclass('diagnostic_runs') IS NOT NULL THEN
    INSERT INTO _run_log_export (stream, tenant_id, at, data)
    SELECT 'chan-doan', tenant_id, created_at,
           jsonb_build_object('layer', layer, 'trigger', trigger, 'scope', scope, 'summary', summary, 'checks', checks, 'errorCount', error_count, 'actor', actor)
      FROM diagnostic_runs;
    DROP TABLE diagnostic_runs;
  END IF;
  IF to_regclass('conformance_runs') IS NOT NULL THEN
    INSERT INTO _run_log_export (stream, tenant_id, at, data)
    SELECT 'kiem-chuan', tenant_id, created_at,
           jsonb_build_object('as_of', as_of::text, 'layers', to_jsonb(layers), 'profile_version', profile_version, 'kit_version', kit_version, 'kit_hash', kit_hash,
                              'result', result, 'counts', counts, 'report', report, 'actor', actor)
      FROM conformance_runs;
    DROP TABLE conformance_runs;
  END IF;
  IF to_regclass('library_usage_daily') IS NOT NULL THEN
    INSERT INTO _run_log_export (stream, tenant_id, at, data)
    SELECT 'thu-vien', tenant_id, COALESCE(updated_at, day::timestamptz),
           jsonb_build_object('day', day::text, 'libraryId', library_id, 'version', version, 'source', source, 'itemCode', item_code,
                              'outcome', outcome, 'findingCode', finding_code, 'count', count)
      FROM library_usage_daily;
    DROP TABLE library_usage_daily;
  END IF;
END $$;
