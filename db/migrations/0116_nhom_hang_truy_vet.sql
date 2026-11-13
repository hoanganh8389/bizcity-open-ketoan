-- [2026-11-12 Nguyễn Văn Thủy] nhóm hàng: người tạo / sửa, thời gian, lịch sử thay đổi (đóng góp)
-- =============================================================================
-- 0116 item_classes: created_by, created_at, updated_by. Nhóm có từ trước: created_at để trống.
--   item_class_history: mỗi lần thêm / sửa một dòng (ai, lúc nào, đổi gì). Không có xoá. Không chạm sổ.
-- =============================================================================
ALTER TABLE item_classes ADD COLUMN created_by text NOT NULL DEFAULT '';
ALTER TABLE item_classes ADD COLUMN created_at timestamptz;
ALTER TABLE item_classes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE item_classes ADD COLUMN updated_by text NOT NULL DEFAULT '';

CREATE TABLE item_class_history (
  id bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  code text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  by_user text NOT NULL DEFAULT '',
  action text NOT NULL,
  changes text NOT NULL DEFAULT ''
);
CREATE INDEX item_class_history_code ON item_class_history (tenant_id, kind, code, at DESC);
COMMENT ON TABLE item_class_history IS 'Lịch sử thêm / sửa nhóm hàng (0116).';
ALTER TABLE item_class_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_class_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_class_history USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT ON item_class_history TO ketoan_app;
    GRANT USAGE ON SEQUENCE item_class_history_id_seq TO ketoan_app;
  END IF;
END $$;
