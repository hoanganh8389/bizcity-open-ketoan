-- [2026-11-14 05:48 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4 (B2, chữ chốt PHASE-036 · 00 §11): bảng sample_runs — mỗi lần máy chủ chạy một gói mẫu (preset) cho đơn vị: trạng thái, tiến độ từng khối, nhịp sống
-- =============================================================================
-- 0139 Lần chạy gói mẫu (core.setup.*, PHASE-036 · 00 §11, D036-4, D036-7).
--   Bộ chạy gọi lại action Core cho từng bản ghi (mỗi bản ghi có bằng chứng riêng); bảng này chỉ giữ trạng thái + tiến độ để
--   giao diện hỏi, và để biết đơn vị đã từng chạy gói nào (cho chạy lại / chạy tiếp, không nạp vào đơn vị có dữ liệu thật).
--   Một đơn vị chỉ một lần chạy đang chạy (chỉ mục duy nhất một phần). Không phải sổ.
-- =============================================================================

CREATE TABLE sample_runs (
  id              bigserial   PRIMARY KEY,
  tenant_id       bigint      NOT NULL REFERENCES tenants(id),
  preset_id       text        NOT NULL CHECK (preset_id ~ '^[a-z0-9][a-z0-9-]*$'),
  preset_version  text        NOT NULL,
  status          text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  first_run       boolean     NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  error           text,
  idempotency_key text        NOT NULL,
  started_by      text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  heartbeat_at    timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE UNIQUE INDEX sample_runs_one_running ON sample_runs (tenant_id) WHERE status = 'running';
CREATE UNIQUE INDEX sample_runs_idempotency ON sample_runs (tenant_id, idempotency_key);
CREATE INDEX sample_runs_tenant ON sample_runs (tenant_id, preset_id, id DESC);

COMMENT ON TABLE  sample_runs IS 'Lần máy chủ chạy một gói mẫu (bizcity_preset@1) cho đơn vị (S036-4, PHASE-036 · 00 §11): trạng thái, tiến độ từng khối. Bản ghi danh mục / chứng từ do action Core ghi, có bằng chứng riêng.';
COMMENT ON COLUMN sample_runs.tenant_id       IS 'Đơn vị.';
COMMENT ON COLUMN sample_runs.preset_id       IS 'Mã gói (thư mục presets/<id>).';
COMMENT ON COLUMN sample_runs.preset_version  IS 'Phiên bản gói lúc chạy (preset.json version).';
COMMENT ON COLUMN sample_runs.status          IS 'running = đang chạy; done = xong (có thể có mục lỗi, xem steps); failed = dừng giữa chừng hoặc mất nhịp sống quá 5 phút.';
COMMENT ON COLUMN sample_runs.first_run       IS 'true = đơn vị còn trắng lúc bắt đầu (lần chạy đầu): mới đặt khối cấu hình.';
COMMENT ON COLUMN sample_runs.steps           IS '[{ key, label, total, written, skipped, failed, firstError: { code, message, requestId } | null, status }] theo thứ tự khối.';
COMMENT ON COLUMN sample_runs.error           IS 'Lỗi làm dừng cả lần chạy (không phải lỗi một mục).';
COMMENT ON COLUMN sample_runs.idempotency_key IS 'Idempotency-Key của lệnh chạy: gửi lại cùng khoá trả cùng lần chạy.';
COMMENT ON COLUMN sample_runs.started_by      IS 'Người bấm (user:<id>); action con chạy với quyền của người này.';
COMMENT ON COLUMN sample_runs.started_at      IS 'Giờ bắt đầu.';
COMMENT ON COLUMN sample_runs.heartbeat_at    IS 'Nhịp sống: bộ chạy cập nhật sau mỗi mục; cũ hơn 5 phút mà còn running → coi là failed.';
COMMENT ON COLUMN sample_runs.finished_at     IS 'Giờ xong / dừng.';

-- ── Cô lập đơn vị (như 0041) ──────────────────────────────────────────────────────
ALTER TABLE sample_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sample_runs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032) ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT ON sample_runs TO ketoan_app;
    GRANT UPDATE (status, steps, error, heartbeat_at, finished_at) ON sample_runs TO ketoan_app;
    GRANT USAGE ON SEQUENCE sample_runs_id_seq TO ketoan_app;
  END IF;
END $$;
