-- =============================================================================
-- 0013 Mặt hàng & giá mua của nhà cung cấp — MỘT nơi cho "NCC bán mã nào, theo ĐVT nào, giá bao nhiêu"
--   - product_units.is_purchase_default: ĐVT mua mặc định của mặt hàng (cạnh is_default = ĐVT bán chính).
--   - supplier_products: NCC × mã hàng × ĐVT (ĐVT chọn từ product_units, tỉ lệ quy đổi lấy từ đó — không khai "quy cách" riêng),
--     mã hàng bên NCC, giá mua cố định (gồm / chưa thuế, ngưỡng cảnh báo lệch), hiệu lực. partner_code NULL = giá chung mọi NCC.
--   - Chuyển dữ liệu cũ: chính sách "Mặt hàng NCC cung cấp" (supplier_item) và "Giá mua cố định" (purchase_price) sang bảng mới
--     rồi xoá khỏi purchase_policies.
-- =============================================================================

ALTER TABLE product_units ADD COLUMN IF NOT EXISTS is_purchase_default boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN product_units.is_purchase_default IS 'ĐVT mua mặc định (đơn đặt / phiếu nhập tự chọn ĐVT này); is_default = ĐVT bán chính.';

CREATE TABLE IF NOT EXISTS supplier_products (
  id                 bigserial PRIMARY KEY,
  tenant_id          bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_code       text,                    -- NULL = giá chung cho mọi nhà cung cấp
  sku                text   NOT NULL,
  unit               text   NOT NULL,         -- một ĐVT của mặt hàng (product_units)
  is_default_unit    boolean NOT NULL DEFAULT false,  -- ĐVT NCC này giao mặc định (ghi đè ĐVT mua mặc định của mặt hàng)
  ncc_sku            text   NOT NULL DEFAULT '',      -- mã hàng bên NCC (báo giá / hoá đơn của họ)
  price              numeric(18,4),                   -- giá mua cố định; NULL = chỉ khai NCC có bán mã này
  price_includes_vat boolean NOT NULL DEFAULT false,
  warn_pct           numeric(6,2) NOT NULL DEFAULT 2, -- lệch quá % này so với giá cố định thì cảnh báo
  valid_from         date,
  valid_to           date,
  note               text   NOT NULL DEFAULT '',
  is_active          boolean NOT NULL DEFAULT true,
  is_demo            boolean NOT NULL DEFAULT false,
  created_by         text   NOT NULL DEFAULT '',
  updated_by         text   NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
-- Một dòng cho mỗi NCC × mã × ĐVT × ngày hiệu lực (đổi giá = thêm dòng hiệu lực mới).
CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_uniq ON supplier_products (tenant_id, COALESCE(partner_code, ''), sku, unit, COALESCE(valid_from, DATE '1900-01-01'));
CREATE INDEX IF NOT EXISTS supplier_products_partner_idx ON supplier_products (tenant_id, partner_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS supplier_products_sku_idx ON supplier_products (tenant_id, sku) WHERE is_active;
COMMENT ON TABLE supplier_products IS 'Mặt hàng & giá mua của nhà cung cấp: NCC × mã × ĐVT, mã bên NCC, giá mua cố định, hiệu lực (NCC NULL = giá chung).';

-- Chuyển "Mặt hàng NCC cung cấp" (supplier_item).
INSERT INTO supplier_products (tenant_id, partner_code, sku, unit, is_default_unit, ncc_sku, note, is_active, is_demo, valid_from, valid_to, created_by, updated_by, created_at, updated_at)
SELECT p.tenant_id, p.scope ->> 'partnerCode', p.scope ->> 'sku', COALESCE(NULLIF(p.rule ->> 'unit', ''), pr.unit, ''), (p.rule ->> 'unit') IS NOT NULL,
       COALESCE(p.rule ->> 'nccSku', ''), COALESCE(p.rule ->> 'note', ''), p.is_active, p.is_demo, p.valid_from, p.valid_to, p.created_by, p.updated_by, p.created_at, p.updated_at
  FROM purchase_policies p LEFT JOIN products pr ON pr.tenant_id = p.tenant_id AND pr.sku = p.scope ->> 'sku'
 WHERE p.kind = 'supplier_item' AND p.scope ? 'sku'
ON CONFLICT DO NOTHING;

-- Chuyển "Giá mua cố định" (purchase_price): gộp vào dòng đã có (cùng NCC × mã × ĐVT × hiệu lực) hoặc thêm dòng mới.
INSERT INTO supplier_products (tenant_id, partner_code, sku, unit, price, price_includes_vat, warn_pct, valid_from, valid_to, is_active, is_demo, created_by, updated_by, created_at, updated_at)
SELECT p.tenant_id, p.scope ->> 'partnerCode', p.scope ->> 'sku', COALESCE(NULLIF(p.rule ->> 'unit', ''), pr.unit, ''),
       (p.rule ->> 'price')::numeric, COALESCE((p.rule ->> 'includesVat')::boolean, false), COALESCE((p.rule ->> 'warnPct')::numeric, 2),
       p.valid_from, p.valid_to, p.is_active, p.is_demo, p.created_by, p.updated_by, p.created_at, p.updated_at
  FROM purchase_policies p LEFT JOIN products pr ON pr.tenant_id = p.tenant_id AND pr.sku = p.scope ->> 'sku'
 WHERE p.kind = 'purchase_price' AND p.scope ? 'sku'
ON CONFLICT (tenant_id, COALESCE(partner_code, ''), sku, unit, COALESCE(valid_from, DATE '1900-01-01'))
DO UPDATE SET price = EXCLUDED.price, price_includes_vat = EXCLUDED.price_includes_vat, warn_pct = EXCLUDED.warn_pct, valid_to = EXCLUDED.valid_to;

DELETE FROM purchase_policies WHERE kind IN ('supplier_item', 'purchase_price') AND (scope ? 'sku');
