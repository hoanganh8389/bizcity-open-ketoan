-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): app ngoài tiến trình — app_installations (kết nối app với đơn vị: phạm vi quyền + sự kiện), api_keys.app_key (khoá có phạm vi theo app)
-- [2026-11-02 03:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — đổi số 0050 → 0051 (main đã có 0050_vai_tro_nha_phat_trien); chưa phát hành nên đổi được
-- =============================================================================
-- 0051 App ngoài tiến trình (ADR-0011 mức 2, PHASES 3.14).
--      App mức 2 là dịch vụ riêng, nói chuyện với Core chỉ qua API công khai. Manifest app (`kind: "app"`) nằm trong mã
--      nguồn bản cài (apps/api/src/ung-dung/<key>/bizcity.module.json, không có mã chạy); chủ đơn vị KẾT NỐI app với đơn vị
--      của mình → một dòng app_installations + một khoá API gắn app (api_keys.app_key).
--        - Quyền của khoá app = app_installations.permissions (chụp từ manifest lúc kết nối, chủ đơn vị đồng ý), KHÔNG theo
--          api_keys.scopes. Khoá app chỉ dùng được khi kết nối đang 'active'.
--        - Webhook: Core đẩy sự kiện outbox nằm trong app_installations.events tới URL webhook của manifest, ký HMAC-SHA256.
--          Bí mật webhook KHÔNG lưu: tính lại từ webhook_salt + khoá máy chủ (JWT_SECRET) → bản sao CSDL không lộ bí mật.
--        - Tắt kết nối: khoá app bị từ chối, webhook ngừng; dữ liệu và bút toán app đã nộp giữ nguyên (ADR-0011 D1).
-- =============================================================================

CREATE TABLE app_installations (
  tenant_id     bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_key       text        NOT NULL CHECK (app_key ~ '^[a-z][a-z0-9-]*$'),
  app_version   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  permissions   text[]      NOT NULL DEFAULT '{}',
  events        text[]      NOT NULL DEFAULT '{}',
  webhook_salt  text        NOT NULL CHECK (length(webhook_salt) >= 16),
  installed_by  text        NOT NULL,
  installed_at  timestamptz NOT NULL DEFAULT now(),
  updated_by    text,
  updated_at    timestamptz,
  PRIMARY KEY (tenant_id, app_key)
);

COMMENT ON TABLE app_installations IS 'App ngoài tiến trình (ADR-0011 mức 2) đã kết nối với đơn vị. Một dòng / (đơn vị, app). Quyền và sự kiện chụp từ manifest app lúc kết nối, chủ đơn vị đồng ý.';
COMMENT ON COLUMN app_installations.tenant_id IS 'Đơn vị kết nối app.';
COMMENT ON COLUMN app_installations.app_key IS 'Khoá app (manifest key, kind "app"). docKey app nộp phải bắt đầu "<app_key>:".';
COMMENT ON COLUMN app_installations.app_version IS 'Phiên bản manifest app lúc kết nối / cập nhật phạm vi.';
COMMENT ON COLUMN app_installations.status IS 'active: khoá app dùng được, webhook chạy; disabled: khoá bị từ chối, webhook ngừng (sự kiện phát lúc tắt không gửi lại khi bật).';
COMMENT ON COLUMN app_installations.permissions IS 'Quyền của khoá app (danh sách Permission của Core) — chỉ những quyền manifest app khai trong permissions[].';
COMMENT ON COLUMN app_installations.events IS 'Loại sự kiện Core đẩy tới webhook app — manifest events.subscribes[].';
COMMENT ON COLUMN app_installations.webhook_salt IS 'Muối ngẫu nhiên; bí mật ký webhook = HMAC(khoá máy chủ, đơn vị:app:muối). Đổi muối = đổi bí mật (xoay khoá).';
COMMENT ON COLUMN app_installations.installed_by IS 'Người kết nối (user:<id>).';
COMMENT ON COLUMN app_installations.installed_at IS 'Lúc kết nối lần đầu.';
COMMENT ON COLUMN app_installations.updated_by IS 'Người đổi trạng thái / xoay khoá lần cuối.';
COMMENT ON COLUMN app_installations.updated_at IS 'Lúc đổi trạng thái / xoay khoá lần cuối.';

-- Khoá API thuộc app: phạm vi theo app_installations, không theo scopes. Khoá thường: NULL (như cũ).
ALTER TABLE api_keys ADD COLUMN app_key text;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_app_fk FOREIGN KEY (tenant_id, app_key) REFERENCES app_installations (tenant_id, app_key);
CREATE INDEX api_keys_app_idx ON api_keys (tenant_id, app_key) WHERE app_key IS NOT NULL AND revoked_at IS NULL;
COMMENT ON COLUMN api_keys.app_key IS 'Khoá của app ngoài tiến trình (ADR-0011 mức 2): quyền = app_installations.permissions, chỉ dùng được khi kết nối active. NULL = khoá tích hợp thường (quyền theo scopes).';

-- ── Cô lập đơn vị (như 0041) ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_installations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app_installations USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032): thêm / đổi trạng thái, không xoá, không TRUNCATE ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON app_installations TO ketoan_app;
  END IF;
END $$;
