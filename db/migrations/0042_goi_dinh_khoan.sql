-- [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gói định khoản cài / xem trước / gỡ: bảng config_packs, cài = phát hành một bản chính sách (ADR-0009 Q-5).
-- =============================================================================
-- 0042 Gói định khoản đã cài (bizcity_posting_template@1 §5, PHASES 3.11; PHASE-012 S012-3).
--      Cài gói = xem trước → người có quyền settings:write xác nhận → ghi lý do, nhóm hạch toán, tài khoản ngầm định,
--      hình thức thanh toán, mã thuế, tài khoản con trong MỘT giao dịch, rồi phát hành MỘT bản chính sách kế toán
--      (posting_policy_versions kind 'publish', note ghi tên + phiên bản gói — ADR-0009 Q-5). Bút toán đã ghi không đổi (STD-TPL-6).
--      Gỡ gói = ngừng dùng các mã gói đã THÊM mà chưa phát sinh; mã đã dùng giữ nguyên (STD-TPL-8).
--      items: từng mục gói đụng tới và việc đã làm (add / update / keep / conflict) — căn cứ để gỡ đúng phần gói đã thêm.
-- =============================================================================

CREATE TABLE IF NOT EXISTS config_packs (
  tenant_id       bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pack_id         text        NOT NULL,
  version         text        NOT NULL,
  title           text        NOT NULL,
  regime          text        NOT NULL,
  status          text        NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'uninstalled')),
  manifest        jsonb       NOT NULL,
  items           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  policy_version  integer,
  installed_by    text        NOT NULL,
  installed_at    timestamptz NOT NULL DEFAULT now(),
  uninstalled_by  text,
  uninstalled_at  timestamptz,
  PRIMARY KEY (tenant_id, pack_id)
);

ALTER TABLE config_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_packs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON config_packs;
CREATE POLICY tenant_isolation ON config_packs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

COMMENT ON TABLE config_packs IS 'Gói định khoản đã cài vào đơn vị (bizcity_posting_template@1): nội dung gói, các mục đã thêm / sửa, bản chính sách kế toán do lần cài phát hành.';
COMMENT ON COLUMN config_packs.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN config_packs.pack_id IS 'Mã gói <publisher>.<chế độ>.<ngành>, vd bizcity.vn-tt99.thuong-mai.';
COMMENT ON COLUMN config_packs.version IS 'Phiên bản gói (SemVer) đang cài.';
COMMENT ON COLUMN config_packs.title IS 'Tên gói.';
COMMENT ON COLUMN config_packs.regime IS 'Chế độ kế toán của gói (vn-tt99-2025, vn-tt133-2016).';
COMMENT ON COLUMN config_packs.status IS 'installed: đang dùng; uninstalled: đã gỡ (mã chưa phát sinh đã ngừng dùng).';
COMMENT ON COLUMN config_packs.manifest IS 'Nội dung gói lúc cài (kể cả gợi ý AI ai.keywords / examples cho posting.reason.suggest, tình huống mẫu).';
COMMENT ON COLUMN config_packs.items IS 'Mục gói đụng tới: [{ kind, code, action: add | update | keep | conflict }] — gỡ gói chỉ ngừng dùng mục action add.';
COMMENT ON COLUMN config_packs.policy_version IS 'Bản chính sách kế toán phát hành khi cài (posting_policy_versions.version); NULL = gói không đổi cấu hình định khoản.';
COMMENT ON COLUMN config_packs.installed_by IS 'Người xác nhận cài.';
COMMENT ON COLUMN config_packs.installed_at IS 'Lúc cài (hoặc cài lại / nâng cấp gần nhất).';
COMMENT ON COLUMN config_packs.uninstalled_by IS 'Người gỡ.';
COMMENT ON COLUMN config_packs.uninstalled_at IS 'Lúc gỡ.';
