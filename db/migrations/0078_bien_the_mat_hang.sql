-- [2026-11-07 05:30 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1 (docs/nghiep-vu/12-phuong-an-bo-chu-khoi-ma-hang.md): danh mục biến thể, ô Biến thể, điền từ đuôi cũ (đóng góp)
-- [2026-11-07 06:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — nhận đóng góp vào framework: Nguyễn Văn Thủy, mã số cha – con GĐ 1, rà theo uỷ quyền review / merge của chủ dự án; chủ dự án chưa tự rà riêng tệp này
-- =============================================================================
-- 0078 Biến thể mặt hàng.
--   Nghĩa của đuôi mã (K, M, Q, T, Z…) chuyển sang ô products.variant_code; mã rồi sẽ chỉ còn là tên gọi.
--   GĐ 1 chỉ GHI NHẬN: chưa nơi nào xử lý theo ô này. Quầy bán, phiếu mua vẫn đọc chữ cuối mã tới GĐ 3,
--   nên điền ô phải khớp đúng cách quầy bán nhận Z (không phân biệt hoa thường, mọi mã tận cùng Z).
--   Không phân loại hạch toán, không đổi định khoản, không chạm sổ. Không tự cập nhật products.updated_at để
--   hệ thống bán hàng không phải kéo lại cả danh mục.
-- =============================================================================

CREATE TABLE item_variant_kinds (
  tenant_id     bigint  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text    NOT NULL,
  name          text    NOT NULL,
  legacy_suffix text    NOT NULL DEFAULT '',
  tax_flow      text    NOT NULL DEFAULT 'invoice' CHECK (tax_flow IN ('invoice', 'never', 'undecided')),
  tax_sku       text    NOT NULL DEFAULT 'self' CHECK (tax_sku IN ('self', 'parent', 'invoice', 'none')),
  allow_numeric boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  note          text    NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code)
);

ALTER TABLE item_variant_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variant_kinds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_variant_kinds USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON item_variant_kinds TO ketoan_app;
    REVOKE DELETE, TRUNCATE ON item_variant_kinds FROM ketoan_app;
  END IF;
END $$;

-- Nạp bộ biến thể và loại hàng chuẩn cho một đơn vị. Chạy lại an toàn.
CREATE OR REPLACE FUNCTION bizcity_seed_variant_kinds(p_tenant bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO item_variant_kinds (tenant_id, code, name, legacy_suffix, tax_flow, tax_sku, allow_numeric, sort_order, note) VALUES
    (p_tenant, 'normal',   'Thường',            '',  'invoice',   'self',    true,  10, 'Hàng thường và sản phẩm con màu, size. Lên thuế theo hoá đơn.'),
    (p_tenant, 'share',    'Chia giá',          'K', 'invoice',   'parent',  false, 20, 'Hàng tặng được chia vào giá trị hàng bán.'),
    (p_tenant, 'promo',    'Khuyến mại',        'M', 'invoice',   'parent',  false, 30, 'Hàng tặng người tiêu dùng, ghi nhận 0 đồng.'),
    (p_tenant, 'program',  'Theo chương trình', 'T', 'invoice',   'parent',  false, 40, 'Hàng theo chương trình: giá khác, bao bì riêng.'),
    (p_tenant, 'clip',     'Kẹp quà',           'Q', 'invoice',   'invoice', false, 50, 'Hàng bán bó kèm quà, không được tách.'),
    (p_tenant, 'internal', 'Nội bộ',            'Z', 'never',     'none',    false, 60, 'Tách hẳn khỏi thuế ở mọi khâu.'),
    (p_tenant, 'legacy',   'Đuôi khác',         '',  'undecided', 'self',    false, 90, 'Đuôi B, C, D… chưa xử lý trong đợt đầu.')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO item_classes (tenant_id, kind, code, name) VALUES
    (p_tenant, 'type', 'HANG-BAN',  'Hàng bán'),
    (p_tenant, 'type', 'QUA',       'Quà, vật phẩm'),
    (p_tenant, 'type', 'VAT-TU',    'Vật tư tiêu hao'),
    (p_tenant, 'type', 'TRUNG-BAY', 'Vật dụng trưng bày'),
    (p_tenant, 'type', 'CCDC',      'Công cụ dụng cụ'),
    (p_tenant, 'type', 'TAI-SAN',   'Tài sản'),
    (p_tenant, 'type', 'DICH-VU',   'Dịch vụ, khác')
  ON CONFLICT (tenant_id, kind, code) DO NOTHING;
END $$;
COMMENT ON FUNCTION bizcity_seed_variant_kinds(bigint) IS 'Nạp bộ biến thể và loại hàng chuẩn cho một đơn vị; chạy lại an toàn (0078).';

-- Biến thể suy từ mã cũ. Khớp đúng cách quầy bán nhận hàng tách thuế: mọi mã tận cùng Z.
CREATE OR REPLACE FUNCTION bizcity_variant_from_sku(p_sku text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(p_sku) ~ 'Z$' THEN 'internal'
    WHEN upper(p_sku) ~ '^[0-9]{9}K$' THEN 'share'
    WHEN upper(p_sku) ~ '^[0-9]{9}M$' THEN 'promo'
    WHEN upper(p_sku) ~ '^[0-9]{9}T$' THEN 'program'
    WHEN upper(p_sku) ~ '^[0-9]{9}Q$' THEN 'clip'
    WHEN upper(p_sku) ~ '^[0-9]{9}[A-Z]{1,3}$' THEN 'legacy'
    ELSE 'normal'
  END
$$;
COMMENT ON FUNCTION bizcity_variant_from_sku(text) IS 'Biến thể suy từ đuôi mã cũ; chỉ dùng lúc tạo mặt hàng và lúc điền ban đầu (0078).';

-- Loại hàng gợi ý từ cấu trúc mã; không chắc thì để trống cho người rà.
CREATE OR REPLACE FUNCTION bizcity_item_type_from_sku(p_sku text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(p_sku) ~ '^Q[0-9]' THEN 'QUA'
    WHEN upper(p_sku) ~ '^TS[0-9]' THEN 'TAI-SAN'
    WHEN upper(p_sku) ~ '^CC[0-9]' THEN 'CCDC'
    WHEN p_sku ~ '^1906[0-9]{4}$' THEN 'CCDC'
    WHEN p_sku ~ '^1986[0-9]{4}$' THEN 'TRUNG-BAY'
    WHEN p_sku ~ '^19[0-9]{6}$' THEN 'VAT-TU'
    WHEN upper(p_sku) ~ '^[0-9]{9}([A-Z]{1,3})?$' THEN 'HANG-BAN'
    ELSE NULL
  END
$$;
COMMENT ON FUNCTION bizcity_item_type_from_sku(text) IS 'Loại hàng gợi ý từ mã lúc điền ban đầu; không chắc thì NULL (0078).';

ALTER TABLE products ADD COLUMN variant_code text NOT NULL DEFAULT 'normal';
COMMENT ON COLUMN products.variant_code IS 'Biến thể (item_variant_kinds.code): nghĩa của đuôi mã cũ. GĐ 1 chỉ ghi nhận, chưa quyết định xử lý (0078).';
CREATE INDEX products_variant ON products (tenant_id, variant_code) WHERE variant_code <> 'normal';

-- Mã tạo mới bằng đường cũ (form, Excel, chứng từ) tự mang đúng biến thể theo đuôi.
CREATE OR REPLACE FUNCTION bizcity_products_variant_fill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.variant_code = 'normal' THEN
    NEW.variant_code := bizcity_variant_from_sku(NEW.sku);
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_variant_fill() IS 'Mã mới có đuôi tự mang biến thể tương ứng (0078).';
CREATE TRIGGER products_variant_fill BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION bizcity_products_variant_fill();

-- Điền cho dữ liệu đang có, mỗi đơn vị.
DO $$
DECLARE t bigint;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM bizcity_seed_variant_kinds(t);
  END LOOP;
END $$;

UPDATE products SET variant_code = bizcity_variant_from_sku(sku) WHERE bizcity_variant_from_sku(sku) <> 'normal';
UPDATE products SET type_code = bizcity_item_type_from_sku(sku) WHERE type_code IS NULL AND bizcity_item_type_from_sku(sku) IS NOT NULL;

COMMENT ON TABLE item_variant_kinds IS 'Danh mục biến thể mặt hàng theo đơn vị: nghĩa của đuôi mã cũ và cách xử lý dự kiến (0078). Tới GĐ 3 phần mềm mới đọc cách xử lý này.';
COMMENT ON COLUMN item_variant_kinds.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN item_variant_kinds.code IS 'Mã biến thể: normal, share, promo, program, clip, internal, legacy hoặc do đơn vị thêm.';
COMMENT ON COLUMN item_variant_kinds.name IS 'Tên hiển thị.';
COMMENT ON COLUMN item_variant_kinds.legacy_suffix IS 'Đuôi mã cũ tương đương; trống nếu không có.';
COMMENT ON COLUMN item_variant_kinds.tax_flow IS 'Sang thuế: invoice theo hoá đơn · never không bao giờ · undecided chưa quyết định.';
COMMENT ON COLUMN item_variant_kinds.tax_sku IS 'Mã khi sang thuế: self chính nó · parent mã cha · invoice theo hoá đơn · none không sang.';
COMMENT ON COLUMN item_variant_kinds.allow_numeric IS 'Được dùng với mã toàn số. Chỉ bật khi phần mềm đã xử lý theo ô (GĐ 3).';
COMMENT ON COLUMN item_variant_kinds.sort_order IS 'Thứ tự hiển thị.';
COMMENT ON COLUMN item_variant_kinds.is_active IS 'Đang dùng.';
COMMENT ON COLUMN item_variant_kinds.note IS 'Giải thích ngắn.';
COMMENT ON COLUMN item_variant_kinds.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN item_variant_kinds.updated_at IS 'Lần sửa gần nhất.';
