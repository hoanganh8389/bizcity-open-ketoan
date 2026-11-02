-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D1, D2): registry module của bản cài (module_registry: phiên bản, hash bản dựng, trạng thái, kết quả nạp) × bật / tắt theo đơn vị (tenant_modules); việc giao sự kiện 'skipped' khi module tắt
-- =============================================================================
-- 0052 Registry module và vòng đời (ADR-0011 D1, D2; PHASES 3.13).
--      Hai mức bật:
--        module_registry — CẤP BẢN CÀI (không có tenant_id, không RLS): module / add-in nào đã cài, phiên bản, hash bản dựng
--          (sha256 thư mục module), trạng thái installed / active / disabled, lịch sử. Chỉ job cài đặt / lệnh `module` (vai
--          trò sở hữu) ghi; API (ketoan_app) chỉ đọc + ghi kết quả lần nạp (last_load_*). API chỉ nạp module 'active' có hash
--          khớp (bản thật); lệch → bỏ riêng module đó, DG-MOD-1 đỏ.
--        tenant_modules — CẤP ĐƠN VỊ: chủ đơn vị bật / tắt module cho đơn vị mình. Không có dòng = bật (tương thích bản cũ).
--          Tắt: route của module trả MODULE_DISABLED, sự kiện tới subscriber của module giao 'skipped' (không 'dead'),
--          dữ liệu và bút toán giữ nguyên — tắt module không bao giờ đụng sổ.
--      App ngoài tiến trình (kind "app") bật / tắt ở app_installations (0051), không ở đây.
-- =============================================================================

CREATE TABLE module_registry (
  key              text        PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9-]*$'),
  kind             text        NOT NULL CHECK (kind IN ('module', 'addin')),
  version          text        NOT NULL,
  source           text        NOT NULL DEFAULT 'bundled' CHECK (source IN ('bundled', 'local')),
  build_hash       text        NOT NULL CHECK (build_hash ~ '^sha256:[0-9a-f]{64}$'),
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('installed', 'active', 'disabled')),
  installed_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  history          jsonb       NOT NULL DEFAULT '[]',
  last_load_at     timestamptz,
  last_load_result text        CHECK (last_load_result IN ('loaded', 'skipped_status', 'skipped_hash', 'skipped_missing')),
  last_load_hash   text
);

COMMENT ON TABLE module_registry IS 'Module / add-in đã cài vào BẢN CÀI (ADR-0011 D1, D2): phiên bản, hash bản dựng, trạng thái. Cấp bản cài, không theo đơn vị. Ghi bằng job cài đặt / lệnh module; API chỉ đọc + ghi kết quả nạp.';
COMMENT ON COLUMN module_registry.key IS 'Khoá module (manifest key), trùng thư mục.';
COMMENT ON COLUMN module_registry.kind IS 'module (phân hệ) | addin.';
COMMENT ON COLUMN module_registry.version IS 'Phiên bản manifest lúc cài / nâng cấp lần cuối.';
COMMENT ON COLUMN module_registry.source IS 'bundled: đi kèm mã nguồn Core (apps/api/src/phan-he, addins); local: module bản cài tự thêm (modules/<key>, PR-5).';
COMMENT ON COLUMN module_registry.build_hash IS 'sha256 của thư mục module (đường dẫn tương đối + nội dung, sắp theo đường dẫn) lúc cài / nâng cấp. API so với thư mục đang chạy.';
COMMENT ON COLUMN module_registry.status IS 'installed: đã cài, chưa nạp; active: nạp khi khởi động; disabled: không nạp trên cả bản cài.';
COMMENT ON COLUMN module_registry.installed_at IS 'Lúc cài lần đầu.';
COMMENT ON COLUMN module_registry.updated_at IS 'Lúc đổi phiên bản / hash / trạng thái lần cuối.';
COMMENT ON COLUMN module_registry.history IS 'Lịch sử chỉ thêm: [{at, by, action: install|upgrade|rehash|activate|deactivate, from?, to?}].';
COMMENT ON COLUMN module_registry.last_load_at IS 'Lần API khởi động gần nhất xét module này.';
COMMENT ON COLUMN module_registry.last_load_result IS 'loaded | skipped_status (không active) | skipped_hash (hash lệch) | skipped_missing (registry có, mã không có). DG-MOD-1 đọc cột này.';
COMMENT ON COLUMN module_registry.last_load_hash IS 'Hash thư mục module API thấy ở lần khởi động gần nhất.';

CREATE TABLE tenant_modules (
  tenant_id   bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key  text        NOT NULL CHECK (module_key ~ '^[a-z][a-z0-9-]*$'),
  enabled     boolean     NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  text        NOT NULL,
  reason      text,
  PRIMARY KEY (tenant_id, module_key)
);

COMMENT ON TABLE tenant_modules IS 'Bật / tắt module cho từng đơn vị (ADR-0011 D1). Không có dòng = bật. Tắt: route trả MODULE_DISABLED, sự kiện giao skipped; dữ liệu, bút toán giữ nguyên.';
COMMENT ON COLUMN tenant_modules.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN tenant_modules.module_key IS 'Khoá module / add-in (module_registry.key).';
COMMENT ON COLUMN tenant_modules.enabled IS 'true: bật; false: tắt cho đơn vị này.';
COMMENT ON COLUMN tenant_modules.changed_at IS 'Lúc đổi lần cuối.';
COMMENT ON COLUMN tenant_modules.changed_by IS 'Người đổi (user:<id>).';
COMMENT ON COLUMN tenant_modules.reason IS 'Lý do tắt / bật (ghi cùng bằng chứng của action core.module.enable / disable).';

ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_modules USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- Sự kiện tới subscriber của module đang tắt ở đơn vị: ghi 'skipped' (không xử lý, không 'dead'); bật lại không tự xử lý bù.
ALTER TABLE event_deliveries DROP CONSTRAINT event_deliveries_status_check;
ALTER TABLE event_deliveries ADD CONSTRAINT event_deliveries_status_check CHECK (status IN ('pending', 'done', 'dead', 'skipped'));
COMMENT ON COLUMN event_deliveries.status IS 'pending: chờ giao / chờ thử lại; done: đã xử lý; dead: hết lượt thử, hiện ở tự chẩn đoán; skipped: module của subscriber đang tắt ở đơn vị lúc giao (0052) — không xử lý, bật lại thì phát lại bằng core.events.replay nếu cần.';

-- ── Quyền vai trò API (0032) ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON module_registry TO ketoan_app;
    GRANT UPDATE (last_load_at, last_load_result, last_load_hash) ON module_registry TO ketoan_app;
    GRANT SELECT, INSERT, UPDATE ON tenant_modules TO ketoan_app;
  END IF;
END $$;
