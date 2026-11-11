-- [2026-11-10 02:30 PM Võ Hoàng] POS-W1 — module pos: khung nhìn đọc mặt hàng có ô Biến thể và ô Gửi lên thuế cho module (đóng góp)
-- =============================================================================
-- 0102 Khung nhìn đọc mặt hàng: Biến thể, Gửi lên thuế.
--   bizcity_read.products thêm hai cột cuối: variant_code (0092), send_to_tax (0093).
--   Module chỉ đọc được bizcity_read.* (data.read-views), nên trước đây không biết mặt hàng nào không lên hoá đơn thuế,
--   mặt hàng nào là hàng Nội bộ: phải đọc chữ cuối mã, điều đã bỏ (mã hàng chỉ còn là số).
--   Cùng khuôn 0044 / 0070: security_invoker (RLS bảng gốc vẫn áp), trigger chặn ghi giữ nguyên, thêm cột ở CUỐI
--   (CREATE OR REPLACE VIEW không đổi thứ tự cột cũ), COMMENT cho cột mới.
--   Không đổi bảng, không chạm sổ, không đổi định khoản.
--   Số migration lấy lúc gộp vào main: 0096 → 0100 (10/11) → 0102 (11/11) vì main đã dùng 0096, 0100, 0101.
-- =============================================================================

CREATE OR REPLACE VIEW bizcity_read.products WITH (security_invoker = true) AS
SELECT tenant_id, sku, parent_sku, name, unit, barcode, group_code, type_code, brand_code, industry_code,
       tax_out_code, tax_in_code, is_active, no_sale, track_identifier, description, image_url, weight_kg, origin, updated_at, item_id,
       variant_code, send_to_tax
  FROM public.products;

COMMENT ON COLUMN bizcity_read.products.variant_code IS 'Biến thể (item_variant_kinds.code): normal, internal (Nội bộ), clip, expiry, program, share, promo, legacy… Thay chữ cuối mã cũ; không dùng để quyết định thuế (0092, 0102).';
COMMENT ON COLUMN bizcity_read.products.send_to_tax IS 'Gửi lên thuế: false = không lên hoá đơn / dữ liệu thuế. Căn cứ duy nhất để tách khỏi thuế; Nội bộ luôn false (0093, 0102).';
