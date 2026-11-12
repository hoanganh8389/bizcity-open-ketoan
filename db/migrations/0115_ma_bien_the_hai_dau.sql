-- [2026-11-12 Nguyễn Văn Thủy] mã biến thể: chữ ở đầu hoặc cuối mã cha, mã cha giữ nguyên (đóng góp)
-- =============================================================================
-- 0115 Mã cha suy theo mã, nhận cả chữ ở đầu lẫn ở cuối:
--   · [chữ 0–3] + 9 chữ số + [chữ 0–3], có ít nhất một chữ → mã cha = 9 chữ số.
--   · 1 chữ + 8 chữ số + chữ 1–3 cuối → mã cha = 9 ký tự đầu.
-- Trigger products_parent_fill (0112) giữ nguyên, chỉ thay hàm. Không chạm sổ.
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_parent_from_sku(p_sku text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(p_sku) ~ '^[A-Z]{0,3}[0-9]{9}[A-Z]{0,3}$' AND upper(p_sku) !~ '^[0-9]{9}$' THEN substring(upper(p_sku) from '[0-9]{9}')
    WHEN upper(p_sku) ~ '^[A-Z][0-9]{8}[A-Z]{1,3}$' THEN left(upper(p_sku), 9)
    ELSE NULL END
$$;
COMMENT ON FUNCTION bizcity_parent_from_sku(text) IS 'Mã cha suy từ mã hàng: bỏ chữ ở đầu / cuối quanh mã chính (0115).';

UPDATE products SET parent_manual = false WHERE parent_sku IS DISTINCT FROM bizcity_parent_from_sku(sku);
