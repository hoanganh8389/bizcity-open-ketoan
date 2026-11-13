-- [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: bảng default_data_backups — ảnh chụp danh mục trước mỗi lần quay về dữ liệu gốc
-- [2026-11-13 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: đổi số migration 0135 → 0136 khi gộp main (0135 thuộc bút toán gộp mã hàng — so-tiep-theo kiem)
-- =============================================================================
-- 0136 Sao lưu tự động trước khi "Quay về dữ liệu gốc" (PHASE-036 · 00 §9, D036-9).
--   Mỗi lần quay về (một bộ hoặc toàn bộ) chạy thật: chụp các dòng của đơn vị ở những bảng danh mục bộ đó chạm tới
--   (JSON, cùng giao dịch với lần ghi — chụp hỏng thì không ghi). Giữ 10 bản gần nhất mỗi đơn vị.
--   Đây là bản sao của danh mục (không phải sổ): xoá bản cũ khi vượt số giữ là việc của dịch vụ default-data.
-- =============================================================================

CREATE TABLE default_data_backups (
  id          bigserial   PRIMARY KEY,
  tenant_id   bigint      NOT NULL REFERENCES tenants(id),
  dataset_key text        NOT NULL CHECK (dataset_key ~ '^[a-z_]+$'),
  tables      text[]      NOT NULL,
  row_count   integer     NOT NULL CHECK (row_count >= 0),
  snapshot    jsonb       NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  result      jsonb,
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX default_data_backups_tenant ON default_data_backups (tenant_id, id DESC);

COMMENT ON TABLE  default_data_backups IS 'Ảnh chụp danh mục của đơn vị ngay trước mỗi lần Quay về dữ liệu gốc (S036-8a, PHASE-036 · 00 §9): lấy lại khi quay về nhầm; giữ 10 bản gần nhất.';
COMMENT ON COLUMN default_data_backups.tenant_id   IS 'Đơn vị.';
COMMENT ON COLUMN default_data_backups.dataset_key IS 'Bộ dữ liệu gốc đã quay về (khoá DATASETS) hoặc all = quay về toàn bộ.';
COMMENT ON COLUMN default_data_backups.tables      IS 'Các bảng đã chụp.';
COMMENT ON COLUMN default_data_backups.row_count   IS 'Tổng số dòng đã chụp.';
COMMENT ON COLUMN default_data_backups.snapshot    IS '{ tên bảng: [dòng…] } — các dòng của đơn vị ở bảng đó trước khi ghi.';
COMMENT ON COLUMN default_data_backups.result      IS 'Kết quả lần quay về (thêm / sửa / xoá / khoá theo bộ) — điền sau khi ghi xong, cùng giao dịch.';
COMMENT ON COLUMN default_data_backups.created_by  IS 'Người quay về (id người dùng / khoá).';
COMMENT ON COLUMN default_data_backups.created_at  IS 'Giờ chụp.';

-- ── Cô lập đơn vị (như 0041) ──────────────────────────────────────────────────────
ALTER TABLE default_data_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_data_backups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON default_data_backups USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032) ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, DELETE ON default_data_backups TO ketoan_app;
    GRANT UPDATE (result) ON default_data_backups TO ketoan_app;
    GRANT USAGE ON SEQUENCE default_data_backups_id_seq TO ketoan_app;
  END IF;
END $$;
