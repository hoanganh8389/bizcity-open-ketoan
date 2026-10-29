-- 0020 Tồn max theo kho, chuyển hàng xuống shop, công thức đặt mua theo chi nhánh cha (docs/nghiep-vu/09-ton-max-dat-hang.md).

-- 1. Phân cấp 2 cấp: chi nhánh cha (kho tổng) → shop con.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE branches ADD CONSTRAINT branches_level_check CHECK (level IN ('', 'branch', 'shop'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS branches_parent_idx ON branches (tenant_id, parent_id);
COMMENT ON COLUMN branches.parent_id IS 'Shop: chi nhánh cha (nơi có kho tổng, mua hàng về rồi chia xuống shop). Chi nhánh cha: NULL.';
COMMENT ON COLUMN branches.level IS 'branch = chi nhánh cha (kho tổng); shop = cửa hàng con; rỗng = chưa xếp.';

-- Lần đầu: tự xếp theo mã — mã "xx000" là chi nhánh cha, mã cùng 2 số đầu là shop con của nó.
UPDATE branches SET level = 'branch' WHERE level = '' AND code ~ '^[0-9]{2}000$';
UPDATE branches s SET level = 'shop', parent_id = p.id
  FROM branches p
 WHERE s.level = '' AND s.parent_id IS NULL AND p.tenant_id = s.tenant_id AND p.level = 'branch'
   AND s.code ~ '^[0-9]{5}' AND substr(s.code, 1, 2) = substr(p.code, 1, 2) AND s.id <> p.id;

-- 2. Tồn max / min theo (chi nhánh, kho, mã hàng) — một nơi khai duy nhất.
CREATE TABLE IF NOT EXISTS stock_levels (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_code    text   NOT NULL,
  warehouse_code text   NOT NULL DEFAULT '',
  sku            text   NOT NULL,
  max_qty        numeric(18,4) NOT NULL DEFAULT 0 CHECK (max_qty >= 0),
  min_qty        numeric(18,4) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  source         text   NOT NULL DEFAULT 'manual',
  note           text   NOT NULL DEFAULT '',
  updated_by     text   NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_code, warehouse_code, sku)
);
CREATE INDEX IF NOT EXISTS stock_levels_sku_idx ON stock_levels (tenant_id, sku);
COMMENT ON TABLE stock_levels IS 'Tồn max / min theo chi nhánh – kho – mã hàng (ĐVT nhỏ nhất). Shop: kho mặc định của shop. Nguồn: manual / request (phiếu đăng ký) / import / suggest.';

-- Chuyển chính sách "Tồn min–max" cũ sang bảng mới (kho mặc định của chi nhánh), rồi tắt chính sách cũ.
INSERT INTO stock_levels (tenant_id, branch_code, warehouse_code, sku, max_qty, min_qty, source, note)
SELECT p.tenant_id, COALESCE(p.scope->>'branchCode', ''), COALESCE((SELECT w.code FROM warehouses w JOIN branches b ON b.id = w.branch_id
         WHERE b.tenant_id = p.tenant_id AND b.code = p.scope->>'branchCode' AND w.is_default ORDER BY w.id LIMIT 1), ''),
       p.scope->>'sku', GREATEST(COALESCE((p.rule->>'max')::numeric, 0), 0), GREATEST(COALESCE((p.rule->>'min')::numeric, 0), 0), 'manual', p.name
  FROM purchase_policies p
 WHERE p.kind = 'stock_minmax' AND p.is_active AND COALESCE(p.scope->>'sku', '') <> '' AND COALESCE(p.scope->>'branchCode', '') <> ''
ON CONFLICT (tenant_id, branch_code, warehouse_code, sku) DO NOTHING;

-- 3. Cài riêng từng mã: số ngày đo tốc độ bán, số ngày cần đủ hàng, cách làm tròn khi chuyển xuống shop.
CREATE TABLE IF NOT EXISTS stock_sku_settings (
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku           text   NOT NULL,
  window_days   int CHECK (window_days IS NULL OR window_days BETWEEN 1 AND 120),
  cover_days    numeric(8,2) CHECK (cover_days IS NULL OR cover_days > 0),
  transfer_mode text NOT NULL DEFAULT 'auto' CHECK (transfer_mode IN ('auto', 'pack', 'unit')),
  note          text NOT NULL DEFAULT '',
  updated_by    text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sku)
);
COMMENT ON TABLE stock_sku_settings IS 'Riêng từng mã: số ngày đo tốc độ bán (window_days), số ngày cần đủ hàng (cover_days), cách làm tròn khi chuyển (auto / pack nguyên thùng / unit lẻ). Trống = theo công thức của chi nhánh.';

-- 4. Phiếu đăng ký tồn max (shop đăng ký mã có sẵn / chi nhánh đăng ký hàng mới theo bảng mặt hàng × shop).
CREATE TABLE IF NOT EXISTS stock_max_requests (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         text   NOT NULL,
  kind         text   NOT NULL DEFAULT 'existing' CHECK (kind IN ('existing', 'new_item')),
  branch_code  text   NOT NULL,
  parent_code  text   NOT NULL DEFAULT '',
  status       text   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'cancelled')),
  title        text   NOT NULL DEFAULT '',
  note         text   NOT NULL DEFAULT '',
  source       text   NOT NULL DEFAULT 'erp',
  data         jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_by   text   NOT NULL DEFAULT '',
  approved_by  text   NOT NULL DEFAULT '',
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS stock_max_requests_list_idx ON stock_max_requests (tenant_id, created_at DESC);
COMMENT ON TABLE stock_max_requests IS 'Phiếu đăng ký tồn max: existing = shop đăng ký mã có sẵn; new_item = hàng mới chưa có mã (bảng mặt hàng × shop). data.items[]; duyệt = ghi max vào stock_levels.';

-- 5. Công thức đặt hàng của từng chi nhánh cha.
CREATE TABLE IF NOT EXISTS order_formulas (
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_code text   NOT NULL,
  config      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  updated_by  text   NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_code)
);
COMMENT ON TABLE order_formulas IS 'Công thức đặt mua của chi nhánh cha: kho tính tồn / lấy max, các thành phần (bật, dấu, hệ số, số ngày), làm tròn, đuôi mã bỏ qua.';

-- 6. Đề nghị chuyển hàng kho → shop đã chốt (kế toán kho / POS quét để lên phiếu chuyển).
CREATE TABLE IF NOT EXISTS transfer_requests (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code           text   NOT NULL,
  from_branch    text   NOT NULL,
  from_warehouse text   NOT NULL DEFAULT '',
  to_branch      text   NOT NULL,
  to_warehouse   text   NOT NULL DEFAULT '',
  status         text   NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  note           text   NOT NULL DEFAULT '',
  data           jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_by     text   NOT NULL DEFAULT '',
  done_by        text   NOT NULL DEFAULT '',
  done_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS transfer_requests_list_idx ON transfer_requests (tenant_id, created_at DESC);
COMMENT ON TABLE transfer_requests IS 'Đề nghị chuyển hàng từ kho chi nhánh cha xuống shop (tính từ tồn max). data.lines[] {sku, name, unit, qty, pack, packUnit}.';

-- 7. Mặt hàng của NCC: tên hàng bên NCC (để sau nhận diện hoá đơn tự động).
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS ncc_name text NOT NULL DEFAULT '';
COMMENT ON COLUMN supplier_products.ncc_name IS 'Tên hàng theo cách NCC gọi (báo giá / hoá đơn của họ) — đi cùng ncc_sku để nhận diện hoá đơn đầu vào.';
