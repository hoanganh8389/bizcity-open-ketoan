-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
-- =============================================================================
-- 0039 Sự kiện miền: transactional outbox (bizcity_event@1, R-OUTBOX-1..7; PHASE-006, PHASES 3.4).
--      event_outbox        : sự kiện ghi CÙNG giao dịch với dữ liệu gây ra nó (giao dịch huỷ → không có sự kiện).
--      event_deliveries    : mỗi (subscriber, sự kiện) một dòng, tạo lúc phát; dispatcher đọc FOR UPDATE SKIP LOCKED,
--                            giao ít nhất một lần, lỗi thì thử lại giãn nhịp, quá số lần → 'dead'.
--      event_consumptions  : (consumer, event_id) đã xử lý — chèn trong cùng giao dịch với việc subscriber làm, nên giao lại
--                            lần hai bị khoá trùng chặn (STD-EVT-2, R-OUTBOX-4).
--      Sự kiện không sửa (trigger chặn UPDATE); chỉ xoá khi quá hạn giữ (bizcity.platform.event_retention_days).
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_outbox (
  id              uuid        PRIMARY KEY,
  seq             bigserial   NOT NULL UNIQUE,
  tenant_id       bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type ~ '^[a-z][a-z0-9-]*(\.[a-z0-9-]+){2,}$'),
  version         integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  subject         text        NOT NULL,
  source_module   text        NOT NULL,
  actor_kind      text        NOT NULL CHECK (actor_kind IN ('user', 'apikey', 'ai', 'system')),
  actor_id        text        NOT NULL,
  correlation_id  text,
  causation_id    uuid,
  dedupe_key      text,
  data            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_dedupe_uq ON event_outbox (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_outbox_tenant_subject_idx ON event_outbox (tenant_id, subject, seq);
CREATE INDEX IF NOT EXISTS event_outbox_occurred_idx ON event_outbox (occurred_at);

CREATE TABLE IF NOT EXISTS event_deliveries (
  tenant_id   bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consumer    text        NOT NULL,
  event_id    uuid        NOT NULL REFERENCES event_outbox(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dead')),
  attempts    integer     NOT NULL DEFAULT 0,
  next_at     timestamptz NOT NULL DEFAULT now(),
  last_error  text,
  done_at     timestamptz,
  PRIMARY KEY (consumer, event_id)
);
CREATE INDEX IF NOT EXISTS event_deliveries_due_idx ON event_deliveries (next_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS event_deliveries_event_idx ON event_deliveries (event_id);
CREATE INDEX IF NOT EXISTS event_deliveries_tenant_idx ON event_deliveries (tenant_id, consumer, status);

CREATE TABLE IF NOT EXISTS event_consumptions (
  tenant_id     bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consumer      text        NOT NULL,
  event_id      uuid        NOT NULL REFERENCES event_outbox(id) ON DELETE CASCADE,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE OR REPLACE FUNCTION event_outbox_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Sự kiện miền không sửa được (event_outbox chỉ thêm; sai thì phát sự kiện mới)' USING ERRCODE = 'P0001';
END $$;
DROP TRIGGER IF EXISTS event_outbox_no_update ON event_outbox;
CREATE TRIGGER event_outbox_no_update BEFORE UPDATE ON event_outbox FOR EACH ROW EXECUTE FUNCTION event_outbox_no_update();

-- Quyền cho ketoan_app: ALTER DEFAULT PRIVILEGES của 0032 đã phủ bảng / sequence mới; UPDATE event_outbox bị trigger chặn.

COMMENT ON TABLE event_outbox IS 'Sự kiện miền (bizcity_event@1): ghi cùng giao dịch với dữ liệu, giao sau commit. Chỉ thêm; xoá khi quá hạn giữ.';
COMMENT ON COLUMN event_outbox.id IS 'UUID v7 (có thứ tự thời gian); khoá chống trùng của consumer.';
COMMENT ON COLUMN event_outbox.seq IS 'Thứ tự ghi; giao theo seq trong cùng (đơn vị, subject).';
COMMENT ON COLUMN event_outbox.type IS '<module>.<thực thể>.<việc ở quá khứ>; sự kiện Core bắt đầu bằng bizcity.';
COMMENT ON COLUMN event_outbox.version IS 'Phiên bản khuôn data của loại sự kiện này (không phải phiên bản chứng từ).';
COMMENT ON COLUMN event_outbox.subject IS 'Đối tượng (docKey, period:<yyyy-mm>, clock…): khoá thứ tự giao.';
COMMENT ON COLUMN event_outbox.source_module IS 'Module phát (bizcity.kernel, bizcity.platform, <key> của module).';
COMMENT ON COLUMN event_outbox.actor_kind IS 'user / apikey / ai / system.';
COMMENT ON COLUMN event_outbox.actor_id IS 'Định danh người / khoá / tiến trình gây ra sự kiện.';
COMMENT ON COLUMN event_outbox.correlation_id IS 'Nối chuỗi phản ứng (X-Correlation-Id, mặc định mã yêu cầu).';
COMMENT ON COLUMN event_outbox.causation_id IS 'Sự kiện gây ra sự kiện này (subscriber phát tiếp).';
COMMENT ON COLUMN event_outbox.dedupe_key IS 'Khoá chống phát trùng trong một đơn vị (vd bizcity.clock.daily:2026-10-30); NULL = không chống.';
COMMENT ON COLUMN event_outbox.data IS 'Chỉ mã và số; không dữ liệu cá nhân thô, không tài khoản kế toán (STD-DATA-10).';
COMMENT ON COLUMN event_outbox.occurred_at IS 'Lúc phát (thời điểm giao dịch ghi).';
COMMENT ON TABLE event_deliveries IS 'Giao sự kiện cho từng subscriber: tạo lúc phát, dispatcher đọc SKIP LOCKED, thử lại giãn nhịp, quá số lần → dead.';
COMMENT ON COLUMN event_deliveries.tenant_id IS 'Đơn vị (chép từ sự kiện) — lọc / RLS không cần nối event_outbox.';
COMMENT ON COLUMN event_deliveries.event_id IS 'Sự kiện được giao (event_outbox.id).';
COMMENT ON COLUMN event_deliveries.consumer IS 'id subscriber (defineSubscriber.id); đổi id = mất lịch sử đã xử lý.';
COMMENT ON COLUMN event_deliveries.status IS 'pending: chờ giao / chờ thử lại; done: đã xử lý; dead: hết lượt thử, hiện ở tự chẩn đoán.';
COMMENT ON COLUMN event_deliveries.attempts IS 'Số lần đã thử.';
COMMENT ON COLUMN event_deliveries.next_at IS 'Lúc được thử tiếp.';
COMMENT ON COLUMN event_deliveries.last_error IS 'Lỗi lần thử gần nhất (đã cắt ngắn, không dữ liệu cá nhân).';
COMMENT ON COLUMN event_deliveries.done_at IS 'Lúc xử lý xong.';
COMMENT ON TABLE event_consumptions IS 'Dấu (consumer, event_id) đã xử lý, chèn cùng giao dịch với việc subscriber làm: giao lại không thực thi trùng.';
COMMENT ON COLUMN event_consumptions.tenant_id IS 'Đơn vị (chép từ sự kiện).';
COMMENT ON COLUMN event_consumptions.consumer IS 'id subscriber đã xử lý.';
COMMENT ON COLUMN event_consumptions.event_id IS 'Sự kiện đã xử lý (event_outbox.id).';
COMMENT ON COLUMN event_consumptions.processed_at IS 'Lúc xử lý.';
