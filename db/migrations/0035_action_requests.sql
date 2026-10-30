-- [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
-- =============================================================================
-- 0035 action_requests: idempotency cho action ghi (bizcity_action@1 §8, STD-ACT-4, audit A-21; PHASES 2.5).
--      Gửi lại cùng (đơn vị, action, Idempotency-Key) và cùng nội dung → trả đúng phản hồi lần đầu, không làm lại.
--      Cùng khoá mà khác nội dung → IDEMPOTENCY_CONFLICT. Dòng ghi trong CÙNG giao dịch với action: action lỗi thì không có dòng,
--      gửi lại được. Hai yêu cầu cùng khoá chạy song song: yêu cầu sau chờ khoá duy nhất rồi đọc phản hồi của yêu cầu trước.
--      Giữ 7 ngày (khoá cấu hình bizcity.platform.idempotency_days): dòng quá hạn bị thay khi dùng lại khoá.
--      Cửa nạp sổ (POST /documents) KHÔNG dùng bảng này: có docKey + version, mạnh hơn (vĩnh viễn).
-- =============================================================================

CREATE TABLE IF NOT EXISTS action_requests (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_id    text   NOT NULL,
  idem_key     text   NOT NULL CHECK (length(idem_key) BETWEEN 8 AND 128),
  request_hash text   NOT NULL,
  status_code  integer NOT NULL DEFAULT 200,
  response     jsonb,
  actor        text   NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, action_id, idem_key)
);
CREATE INDEX IF NOT EXISTS action_requests_created_idx ON action_requests (created_at);

COMMENT ON TABLE action_requests IS 'Idempotency của action ghi (bizcity_action@1 §8): một dòng mỗi (đơn vị, action, Idempotency-Key), lưu phản hồi để trả lại khi gửi lặp. Giữ 7 ngày.';
COMMENT ON COLUMN action_requests.action_id IS 'Mã action dạng <module>.<thực thể>.<động từ>, vd quy.payment-request.create.';
COMMENT ON COLUMN action_requests.idem_key IS 'Header Idempotency-Key do bên gọi sinh (8–128 ký tự), một khoá cho một ý định thao tác.';
COMMENT ON COLUMN action_requests.request_hash IS 'SHA-256 của input đã chuẩn hoá: cùng khoá khác băm → IDEMPOTENCY_CONFLICT.';
COMMENT ON COLUMN action_requests.status_code IS 'Mã HTTP của phản hồi lần đầu (200, 201) để gửi lặp nhận đúng mã đó.';
COMMENT ON COLUMN action_requests.response IS 'Phần data của phản hồi lần đầu (khuôn { ok, data }).';
COMMENT ON COLUMN action_requests.actor IS 'Người / khoá gọi lần đầu: user:<id>, apikey:<id>.';
