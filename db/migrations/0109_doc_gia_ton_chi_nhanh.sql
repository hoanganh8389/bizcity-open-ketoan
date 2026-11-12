-- [2026-11-12 04:00 PM Võ Hoàng] POS-CATALOG — khung nhìn đọc giá theo chi nhánh và tồn theo chi nhánh cho module (BIZCITY-DATA §8 bổ sung 2026-11-12, phiếu NT-BH-006) (đóng góp)
-- =============================================================================
-- 0109 Khung nhìn đọc: giá bán theo chi nhánh, tồn theo chi nhánh.
--   Module chỉ đọc được bizcity_read.* (data.read-views). Máy bán POS cần giá đúng bảng giá của cửa hàng và tồn của cửa hàng
--   từ kế toán (một nguồn với dữ liệu ghi sổ), thay cho bản sao ở website.
--   Cùng khuôn 0044: security_invoker (RLS bảng gốc vẫn áp), trigger chặn ghi, COMMENT từng cột. Chỉ đọc bảng gốc, không lồng
--   khung nhìn khác — ensureModuleDb cấp SELECT đúng các cột khung nhìn dùng trên bảng gốc.
--   Không đổi bảng, không chạm sổ, không đổi định khoản.
-- =============================================================================

-- ── Giá bán theo chi nhánh ───────────────────────────────────────────────────────────────────────────────────────────────
-- Luật DM14 (docs/huong-dan/bang-gia.md): hàng chính chỉ lấy bảng giá công ty; hàng thường lấy bảng giá đang dùng gán cho
-- chi nhánh, ô trống thì bảng giá công ty; chi nhánh chưa gán (hoặc bảng giá ngừng dùng) thì bảng giá công ty.
CREATE OR REPLACE VIEW bizcity_read.branch_prices WITH (security_invoker = true) AS
SELECT b.tenant_id, b.code AS branch_code, u.sku, p.item_id, u.unit, u.ratio, u.is_default AS is_default_unit,
       CASE WHEN p.is_main THEN cp.price ELSE COALESCE(bp.price, cp.price) END AS price,
       CASE WHEN NOT p.is_main AND bp.price IS NOT NULL THEN 'branch'
            WHEN cp.price IS NOT NULL THEN 'company' END AS price_source,
       GREATEST(p.updated_at, bp.updated_at, cp.updated_at) AS updated_at
  FROM public.branches b
  JOIN public.product_units u ON u.tenant_id = b.tenant_id
  JOIN public.products p ON p.tenant_id = u.tenant_id AND p.sku = u.sku
  LEFT JOIN public.price_list_branches lb ON lb.tenant_id = b.tenant_id AND lb.branch_code = b.code
  LEFT JOIN public.price_lists bl ON bl.tenant_id = lb.tenant_id AND bl.code = lb.price_list_code AND bl.is_active AND NOT bl.is_company
  LEFT JOIN public.product_prices bp ON bp.tenant_id = b.tenant_id AND bp.price_list_code = bl.code AND bp.sku = u.sku AND bp.unit = u.unit
        AND bp.price IS NOT NULL
  LEFT JOIN public.price_lists cl ON cl.tenant_id = b.tenant_id AND cl.is_company AND cl.is_active
  LEFT JOIN public.product_prices cp ON cp.tenant_id = b.tenant_id AND cp.price_list_code = cl.code AND cp.sku = u.sku AND cp.unit = u.unit
        AND cp.price IS NOT NULL
 WHERE p.is_active AND NOT p.no_sale;

COMMENT ON VIEW bizcity_read.branch_prices IS 'Giá bán đã áp luật DM14 theo chi nhánh × mặt hàng × ĐVT (chỉ đọc, 0109). Chỉ mặt hàng đang dùng, không ngừng bán.';
COMMENT ON COLUMN bizcity_read.branch_prices.branch_code IS 'Chi nhánh (mã website cửa hàng).';
COMMENT ON COLUMN bizcity_read.branch_prices.unit IS 'Đơn vị tính bán (product_units).';
COMMENT ON COLUMN bizcity_read.branch_prices.ratio IS '1 ĐVT này = ratio × đơn vị nhỏ nhất.';
COMMENT ON COLUMN bizcity_read.branch_prices.is_default_unit IS 'true = ĐVT bán chính.';
COMMENT ON COLUMN bizcity_read.branch_prices.price IS 'Giá trọn 1 ĐVT (giá niêm yết của bảng giá); NULL = chưa khai giá ở cả bảng giá chi nhánh lẫn công ty.';
COMMENT ON COLUMN bizcity_read.branch_prices.price_source IS 'branch = bảng giá gán cho chi nhánh; company = bảng giá công ty (hàng chính luôn company); NULL = chưa khai giá.';
COMMENT ON COLUMN bizcity_read.branch_prices.updated_at IS 'Lần đổi gần nhất của mặt hàng / ô giá — máy bán dùng làm phiên bản danh mục.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.branch_prices
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Tồn theo chi nhánh ───────────────────────────────────────────────────────────────────────────────────────────────────
-- SUM(qty) của sổ kho (qty có dấu: nhập dương, xuất âm) theo chi nhánh × kho × item_id, ĐVT nhỏ nhất. Mã đã đổi vẫn một dòng
-- (theo item_id), hiện dưới mã hiện tại ở products; dòng sổ chưa có item_id thì gom theo mã lúc ghi.
CREATE OR REPLACE VIEW bizcity_read.stock_on_hand WITH (security_invoker = true) AS
SELECT m.tenant_id, b.code AS branch_code, m.warehouse_code, m.item_id,
       COALESCE(max(p.sku), max(m.sku)) AS sku, sum(m.qty) AS qty
  FROM public.inventory_movements m
  JOIN public.branches b ON b.id = m.branch_id
  LEFT JOIN public.products p ON p.tenant_id = m.tenant_id AND p.item_id = m.item_id
 GROUP BY m.tenant_id, b.code, m.warehouse_code, m.item_id, CASE WHEN m.item_id IS NULL THEN m.sku END;

COMMENT ON VIEW bizcity_read.stock_on_hand IS 'Tồn hiện có theo chi nhánh × kho × mặt hàng (chỉ đọc, 0109), ĐVT nhỏ nhất. Đọc luôn lọc theo chi nhánh và mã.';
COMMENT ON COLUMN bizcity_read.stock_on_hand.branch_code IS 'Chi nhánh của dòng sổ kho.';
COMMENT ON COLUMN bizcity_read.stock_on_hand.warehouse_code IS 'Kho ('''' = kho mặc định / chưa ghi kho).';
COMMENT ON COLUMN bizcity_read.stock_on_hand.item_id IS 'Định danh bất biến của mặt hàng; NULL với dòng sổ cũ chưa gắn item_id.';
COMMENT ON COLUMN bizcity_read.stock_on_hand.sku IS 'Mã hiện tại của mặt hàng (products); dòng chưa có item_id thì mã lúc ghi.';
COMMENT ON COLUMN bizcity_read.stock_on_hand.qty IS 'Tồn = tổng nhập − tổng xuất (ĐVT nhỏ nhất); âm khi bán vượt.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.stock_on_hand
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();
