-- =============================================================================
-- 0014 Danh mục đơn vị tính (tên ĐVT dùng chung) + chú thích cột phân hệ Mua hàng
--   - unit_names: danh sách TÊN ĐVT của đơn vị (Hộp, Lốc, Lốc_4, Thùng…) — chỉ là tên tham khảo, KHÔNG có tỉ lệ.
--     Tỉ lệ quy đổi nằm ở product_units (theo từng mặt hàng, quy về ĐVT nhỏ nhất tỉ lệ 1).
--   - Khởi tạo: mỗi đơn vị (tenant) có sẵn danh sách ĐVT thông dụng (source = 'seed') — trigger trên tenants.
--   - Tự cập nhật: ai khai ĐVT mới ở mặt hàng (product_units / products.unit) — bằng form, nhập Excel, đồng bộ, dữ liệu mẫu —
--     CSDL tự thêm tên đó vào danh mục (source = 'auto'). Làm ở trigger để không đường ghi nào bị sót.
--   - Tên không phân biệt hoa thường: "hộp" và "Hộp" là một (chỉ mục duy nhất trên lower(name)).
-- =============================================================================

CREATE TABLE IF NOT EXISTS unit_names (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text   NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 32),
  note        text   NOT NULL DEFAULT '',
  source      text   NOT NULL DEFAULT 'manual' CHECK (source IN ('seed', 'auto', 'manual')),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  text   NOT NULL DEFAULT '',
  updated_by  text   NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS unit_names_uniq ON unit_names (tenant_id, lower(name));
COMMENT ON TABLE unit_names IS 'Danh mục tên đơn vị tính (Hộp, Lốc, Lốc_4, Thùng…): tên tham khảo, không có tỉ lệ. Tỉ lệ quy đổi ở product_units theo từng mặt hàng.';
COMMENT ON COLUMN unit_names.name IS 'Tên ĐVT, duy nhất trong đơn vị (không phân biệt hoa thường).';
COMMENT ON COLUMN unit_names.source IS 'seed = có sẵn lúc khởi tạo · auto = CSDL tự thêm khi khai ở mặt hàng · manual = người dùng thêm ở danh mục.';
COMMENT ON COLUMN unit_names.is_active IS 'false = ẩn khỏi gợi ý khi khai mặt hàng (mặt hàng đang dùng vẫn giữ).';

-- Danh sách ĐVT thông dụng khởi tạo cho mỗi đơn vị.
CREATE OR REPLACE FUNCTION unit_names_defaults() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Cái','Chiếc','Hộp','Lon','Chai','Gói','Túi','Bịch','Thùng','Lốc','Lốc_4','Lốc_6','Lốc_8','Vỉ','Hũ','Lọ','Tuýp',
               'Bình','Can','Két','Khay','Bao','Cuộn','Tờ','Quyển','Bộ','Đôi','Cặp','Tá','Kg','Gam','Lít','Ml','Mét','Set','Combo','Suất','Ống','Thanh','Miếng']
$$;

CREATE OR REPLACE FUNCTION unit_names_seed_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO unit_names (tenant_id, name, source, created_by, updated_by)
  SELECT NEW.id, n, 'seed', 'Khởi tạo', 'Khởi tạo' FROM unnest(unit_names_defaults()) AS n
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tenants_seed_unit_names ON tenants;
CREATE TRIGGER tenants_seed_unit_names AFTER INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION unit_names_seed_tenant();

-- Khai ĐVT ở mặt hàng → tên chưa có thì thêm vào danh mục.
CREATE OR REPLACE FUNCTION unit_names_autoadd() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unit IS NOT NULL AND btrim(NEW.unit) <> '' AND length(btrim(NEW.unit)) <= 32 THEN
    INSERT INTO unit_names (tenant_id, name, source, created_by, updated_by)
    VALUES (NEW.tenant_id, btrim(NEW.unit), 'auto', 'Tự thêm khi khai mặt hàng', 'Tự thêm khi khai mặt hàng')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS product_units_autoadd_unit_name ON product_units;
CREATE TRIGGER product_units_autoadd_unit_name AFTER INSERT OR UPDATE OF unit ON product_units FOR EACH ROW EXECUTE FUNCTION unit_names_autoadd();
DROP TRIGGER IF EXISTS products_autoadd_unit_name ON products;
CREATE TRIGGER products_autoadd_unit_name AFTER INSERT OR UPDATE OF unit ON products FOR EACH ROW EXECUTE FUNCTION unit_names_autoadd();

-- Đơn vị đang có: danh sách khởi tạo + mọi ĐVT đã khai ở mặt hàng.
INSERT INTO unit_names (tenant_id, name, source, created_by, updated_by)
SELECT t.id, n, 'seed', 'Khởi tạo', 'Khởi tạo' FROM tenants t CROSS JOIN unnest(unit_names_defaults()) AS n
ON CONFLICT DO NOTHING;
INSERT INTO unit_names (tenant_id, name, source, created_by, updated_by)
SELECT DISTINCT ON (tenant_id, lower(btrim(unit))) tenant_id, btrim(unit), 'auto', 'Tự thêm khi khai mặt hàng', 'Tự thêm khi khai mặt hàng'
FROM (SELECT tenant_id, unit FROM product_units UNION ALL SELECT tenant_id, unit FROM products) u
WHERE btrim(unit) <> '' AND length(btrim(unit)) <= 32
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN product_units.unit IS 'Tên ĐVT (lấy từ danh mục unit_names; tên mới tự thêm vào danh mục).';
COMMENT ON COLUMN product_units.ratio IS 'Số ĐVT nhỏ nhất trong 1 ĐVT này (Hộp 1 · Lốc 4 · Thùng 48). Đúng một dòng tỉ lệ 1 = ĐVT nhỏ nhất = ĐVT tồn kho.';
COMMENT ON COLUMN product_units.is_default IS 'ĐVT bán chính.';

-- Chú thích cột còn thiếu của phân hệ Mua hàng (trang "Cơ sở dữ liệu mua hàng" đọc thẳng từ đây).
COMMENT ON COLUMN purchase_documents.doc_no IS 'Số phiếu (tự cấp theo loại khi ghi, sửa tay được; duy nhất trong đơn vị).';
COMMENT ON COLUMN purchase_documents.doc_date IS 'Ngày chứng từ — ngày ghi sổ khi duyệt.';
COMMENT ON COLUMN purchase_documents.branch_code IS 'Chi nhánh nhận hàng / chịu công nợ (hạn mức theo chi nhánh, kho).';
COMMENT ON COLUMN purchase_documents.partner_code IS 'Mã nhà cung cấp (partners.code).';
COMMENT ON COLUMN purchase_documents.invoice_no IS 'Số hoá đơn NCC — cùng MST + ký hiệu + số chỉ được một phiếu (chặn trùng ở chỉ mục duy nhất).';
COMMENT ON COLUMN purchase_documents.invoice_date IS 'Ngày hoá đơn — mốc tính hạn trả khi điều khoản tính từ ngày hoá đơn.';
COMMENT ON COLUMN purchase_documents.due_date IS 'Hạn trả (tự tính theo điều khoản thanh toán: ngày làm việc, trừ lễ, nhiều đợt).';
COMMENT ON COLUMN purchase_documents.total_before_tax IS 'Tiền hàng sau chiết khấu, trước thuế.';
COMMENT ON COLUMN purchase_documents.total_tax IS 'Tiền thuế GTGT đầu vào.';
COMMENT ON COLUMN purchase_documents.created_by_name IS 'Tên người lập (hiện trên màn, nhật ký).';
COMMENT ON COLUMN purchase_documents.approved_by IS 'Người duyệt (ghi sổ) lần gần nhất.';
COMMENT ON COLUMN purchase_policies.code IS 'Mã chính sách, duy nhất trong đơn vị (tự đặt <mã NCC>-<loại>).';
COMMENT ON COLUMN purchase_policies.kind IS 'Loại: trade_discount, qty_tier, payment_discount, promo_gift, period_rebate, target_rebate, stage_rebate, credit_limit, payment_term, supply_target, lot_tracking, gift_budget, contract, stock_minmax.';
COMMENT ON COLUMN purchase_policies.valid_from IS 'Hiệu lực từ ngày (trống = không giới hạn).';
COMMENT ON COLUMN purchase_policies.valid_to IS 'Hiệu lực đến ngày (trống = không giới hạn).';
COMMENT ON COLUMN purchase_policies.priority IS 'Ưu tiên khi nhiều chính sách cùng loại cùng phạm vi (lớn hơn thắng).';
COMMENT ON COLUMN purchase_attachments.owner_type IS 'Gắn với: partner (hồ sơ NCC) · document (chứng từ) · policy (chính sách).';
COMMENT ON COLUMN purchase_attachments.path IS 'Đường dẫn tệp trên ổ dữ liệu ERP (DATA_DIR/dinh-kem/<tenant>/…) — nội dung tệp không lưu trong CSDL.';
COMMENT ON COLUMN supplier_products.partner_code IS 'Mã NCC; NULL = giá chung cho mọi NCC (giá của đúng NCC luôn thắng).';
COMMENT ON COLUMN supplier_products.unit IS 'Một ĐVT đã khai của mặt hàng (product_units) — giá khai theo ĐVT này, phiếu ĐVT khác thì quy đổi theo tỉ lệ.';
COMMENT ON COLUMN supplier_products.is_default_unit IS 'ĐVT NCC này hay giao — lập đơn / phiếu tự chọn.';
COMMENT ON COLUMN supplier_products.price IS 'Giá mua cố định theo ĐVT của dòng; NULL = chỉ khai NCC có bán mã này.';
COMMENT ON COLUMN supplier_products.warn_pct IS 'Đơn giá phiếu lệch quá % này so với giá cố định (đã quy đổi ĐVT) thì cảnh báo.';
COMMENT ON COLUMN supplier_products.valid_from IS 'Hiệu lực từ — đổi giá theo đợt = thêm dòng hiệu lực mới, dòng cũ giữ làm lịch sử.';
