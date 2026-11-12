-- [2026-11-12 Nguyễn Văn Thủy] thẻ hướng dẫn sử dụng soạn trong hệ thống, gắn linh hoạt vào từng màn / hộp thoại (đóng góp)
-- =============================================================================
-- 0113 Thẻ hướng dẫn.
--   help_cards : thẻ hướng dẫn (tiêu đề + nội dung). format 'md' = chép từ tài liệu có sẵn (docs/huong-dan), 'html' = soạn trong hệ thống.
--   help_places: mỗi màn / hộp thoại có một định danh (place_key); gắn với một thẻ. Đổi thẻ = đổi card_id, không đụng nội dung.
--   Lần đầu mở một màn chưa gắn thẻ: giao diện chép tài liệu có sẵn thành thẻ rồi gắn (nếu có tài liệu).
-- =============================================================================

CREATE TABLE help_cards (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text   NOT NULL DEFAULT '',
  body        text   NOT NULL DEFAULT '',
  format      text   NOT NULL DEFAULT 'html' CHECK (format IN ('md', 'html')),
  source_key  text   NOT NULL DEFAULT '',
  created_by  text   NOT NULL DEFAULT '',
  updated_by  text   NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX help_cards_tenant ON help_cards (tenant_id, lower(title));
COMMENT ON TABLE help_cards IS 'Thẻ hướng dẫn sử dụng soạn trong hệ thống (0113).';
COMMENT ON COLUMN help_cards.id IS 'Mã thẻ.';
COMMENT ON COLUMN help_cards.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN help_cards.title IS 'Tiêu đề thẻ.';
COMMENT ON COLUMN help_cards.body IS 'Nội dung: HTML (soạn trong hệ thống) hoặc markdown (chép từ tài liệu có sẵn).';
COMMENT ON COLUMN help_cards.format IS 'md = markdown chép từ docs/huong-dan · html = soạn trong hệ thống.';
COMMENT ON COLUMN help_cards.source_key IS 'Khoá tài liệu gốc đã chép (docs/huong-dan/<khoá>.md); trống = thẻ tạo mới.';
COMMENT ON COLUMN help_cards.created_by IS 'Người tạo.';
COMMENT ON COLUMN help_cards.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN help_cards.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN help_cards.updated_at IS 'Lúc sửa gần nhất.';

CREATE TABLE help_places (
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  place_key   text   NOT NULL CHECK (length(place_key) BETWEEN 1 AND 300),
  label       text   NOT NULL DEFAULT '',
  card_id     bigint REFERENCES help_cards(id) ON DELETE SET NULL,
  updated_by  text   NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, place_key)
);
CREATE INDEX help_places_card ON help_places (tenant_id, card_id);
COMMENT ON TABLE help_places IS 'Định danh màn / hộp thoại → thẻ hướng dẫn đang gắn (0113).';
COMMENT ON COLUMN help_places.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN help_places.place_key IS 'Định danh màn / hộp thoại (vd mat-hang, modal:/danh-muc/mat-hang#Mặt hàng).';
COMMENT ON COLUMN help_places.label IS 'Tên dễ đọc của nơi gắn (tiêu đề màn / hộp thoại).';
COMMENT ON COLUMN help_places.card_id IS 'Thẻ đang gắn; NULL = chưa gắn.';
COMMENT ON COLUMN help_places.updated_by IS 'Người gắn gần nhất.';
COMMENT ON COLUMN help_places.updated_at IS 'Lúc gắn gần nhất.';

ALTER TABLE help_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON help_cards USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
ALTER TABLE help_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_places FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON help_places USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON help_cards, help_places TO ketoan_app;
    GRANT USAGE ON SEQUENCE help_cards_id_seq TO ketoan_app;
  END IF;
END $$;
