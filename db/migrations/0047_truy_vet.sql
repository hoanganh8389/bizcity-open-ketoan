-- [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
-- =============================================================================
-- 0047 Truy vết OpenTelemetry (ADR-0010 §3, PHASE-018 W5). CHỈ THÊM hai cột cho phép NULL, không đổi dữ liệu cũ, không khoá bảng lâu
--      (ADD COLUMN không mặc định = chỉ đổi catalog — R-DB-13).
--
--   - event_outbox.trace_parent  W3C traceparent của span phát sự kiện, ghi CÙNG giao dịch với sự kiện. Dispatcher mở span giao
--                                mới và NỐI (span link) về đây: lần ngược từ một subscriber lỗi (vd module crm) về yêu cầu gốc.
--   - audit_logs.trace_id        mã trace của yêu cầu đã ghi bằng chứng: bằng chứng ↔ trace ↔ log. Là thông tin QUAN SÁT:
--                                KHÔNG đưa vào audit_log_hash (danh sách cột cố định ở 0036) nên chuỗi băm cũ / mới không đổi.
--
--   Quay lui: để NULL (đặt OTEL_SDK_DISABLED=true thì ứng dụng không ghi); không cần gỡ cột.
-- =============================================================================

ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS trace_parent text
  CHECK (trace_parent IS NULL OR trace_parent ~ '^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$');
COMMENT ON COLUMN event_outbox.trace_parent IS 'W3C traceparent của span phát (ADR-0010): span giao sự kiện nối (link) về đây. NULL = phát khi chưa bật truy vết / sự kiện trước 0047.';

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS trace_id text
  CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$');
COMMENT ON COLUMN audit_logs.trace_id IS 'Mã trace OpenTelemetry của yêu cầu (ADR-0010): tra trace trong Tempo, log trong Loki. Quan sát — không thuộc chuỗi băm (audit_log_hash).';
