-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 Quy định dữ liệu danh mục: duyệt luật nhắc theo đơn vị (D023-4, D023-8) + mốc tạo mặt hàng (báo cáo mặt hàng tự thêm từ chứng từ)
-- [2026-11-03 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — gộp main: migration 0062 → 0063 (0062 = sơ đồ tổ chức)
-- =============================================================================
-- 0063 Quy định dữ liệu danh mục.
--   catalog_rule_reviews  Kế toán trưởng của đơn vị duyệt luật nhắc của khung "Vì sao" (bizcity_catalog_hint@1): đồng ý, sửa câu
--                         chữ, hoặc hạ cảnh báo mềm xuống nhắc (D023-8 — có lý do, ghi nhật ký). Một dòng / mã / đơn vị = trạng
--                         thái hiện hành; lịch sử từng lần duyệt ở audit_logs (catalog.rule.review). Chưa có dòng = nội dung
--                         mặc định, nhãn "nháp". Không hạ được mức chặn (chặn chỉ dành cho toàn vẹn dữ liệu). Bản duyệt gắn dấu
--                         của luật gốc (rule_hash): luật đổi ở bản phát hành sau thì bản duyệt hết hiệu lực, phải duyệt lại.
--   products.created_at   Mốc tạo mặt hàng — báo cáo "mặt hàng hệ thống bán hàng tự thêm trong N ngày" trước khi tắt tự thêm
--                         (bizcity.item.auto_create, D024-3). Dòng cũ lấy updated_at (gần nhất có được).
-- =============================================================================

CREATE TABLE catalog_rule_reviews (
  tenant_id     bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text        NOT NULL,
  title         text,
  why           text,
  fix           text,
  lowered       boolean     NOT NULL DEFAULT false,
  note          text        NOT NULL DEFAULT '',
  rule_hash     text        NOT NULL,
  reviewed_by   text        NOT NULL,
  reviewed_by_name text     NOT NULL DEFAULT '',
  reviewed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code)
);

COMMENT ON TABLE catalog_rule_reviews IS 'Duyệt luật nhắc khung Vì sao theo đơn vị (0063, D023-4 / D023-8): có dòng = đã duyệt; lịch sử ở audit_logs.';
COMMENT ON COLUMN catalog_rule_reviews.code IS 'Mã luật trong CATALOG_HINTS (ACC-*, PART-*, ITEM-*).';
COMMENT ON COLUMN catalog_rule_reviews.title IS 'Câu ngắn đơn vị sửa lại (null = dùng mặc định); chỉ dùng biến {..} của luật gốc.';
COMMENT ON COLUMN catalog_rule_reviews.why IS 'Câu "vì sao" đơn vị sửa lại (null = mặc định).';
COMMENT ON COLUMN catalog_rule_reviews.fix IS 'Cách sửa đơn vị sửa lại (null = mặc định).';
COMMENT ON COLUMN catalog_rule_reviews.lowered IS 'Cảnh báo mềm hạ xuống nhắc tại đơn vị (D023-8): không còn bắt ghi lý do khi lưu. Chỉ áp cho mức warn.';
COMMENT ON COLUMN catalog_rule_reviews.rule_hash IS 'Dấu của luật gốc lúc duyệt (hintHash: mức + câu chữ mặc định). Luật đổi ở bản phát hành sau → bản duyệt hết hiệu lực, luật về "chưa duyệt" (S023-17).';
COMMENT ON COLUMN catalog_rule_reviews.note IS 'Ghi chú / lý do của người duyệt (bắt buộc khi hạ mức).';
COMMENT ON COLUMN catalog_rule_reviews.reviewed_by IS 'Người duyệt lần gần nhất (user:<id> / apikey:<id>).';
COMMENT ON COLUMN catalog_rule_reviews.reviewed_by_name IS 'Họ tên người duyệt lúc duyệt (hiện trên màn HT09).';
COMMENT ON COLUMN catalog_rule_reviews.reviewed_at IS 'Lúc duyệt lần gần nhất.';

ALTER TABLE catalog_rule_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_rule_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog_rule_reviews USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_rule_reviews TO ketoan_app;
  END IF;
END $$;

ALTER TABLE products ADD COLUMN created_at timestamptz;
UPDATE products SET created_at = updated_at WHERE created_at IS NULL;
ALTER TABLE products ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE products ALTER COLUMN created_at SET NOT NULL;
COMMENT ON COLUMN products.created_at IS 'Lúc thêm mặt hàng (0063); dòng có trước 0063 lấy updated_at.';
