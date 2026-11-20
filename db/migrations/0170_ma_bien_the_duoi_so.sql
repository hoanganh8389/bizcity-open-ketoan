-- [2026-11-20 kiennt] NT-DM-013 — mã biến thể: phần cuối nhận cả chữ số; mã cha = 9 số đầu (đóng góp)
-- =============================================================================
-- 0170 Mã cha suy theo mã — thêm dạng phần cuối có chữ số (NT-DM-013):
--   · [chữ 0–3] + 9 chữ số + [chữ 0–3], có ít nhất một chữ → mã cha = 9 chữ số           (như 0115)
--   · 9 chữ số + 1–3 ký tự chữ / số (không có chữ đầu)        → mã cha = 9 chữ số đầu    (MỚI)
--   · 1 chữ + 8 chữ số + chữ 1–3 cuối                          → mã cha = 9 ký tự đầu    (như 0115)
-- Phần đầu chỉ chữ cái, có chữ đầu thì phần cuối chỉ chữ cái → mỗi mã chỉ một cách đọc.
-- Chỉ thay hàm; trigger products_parent_fill (0112) giữ nguyên. KHÔNG tính lại mã cha của mặt hàng đang có
-- (mã 10–12 chữ số có sẵn giữ nguyên quan hệ cũ cho tới khi được sửa / đổi mã). Không chạm sổ.
-- Đường lui: chạy lại định nghĩa hàm của 0115.
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_parent_from_sku(p_sku text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(p_sku) ~ '^[A-Z]{0,3}[0-9]{9}[A-Z]{0,3}$' AND upper(p_sku) !~ '^[0-9]{9}$' THEN substring(upper(p_sku) from '[0-9]{9}')
    WHEN upper(p_sku) ~ '^[0-9]{9}[A-Z0-9]{1,3}$' THEN left(upper(p_sku), 9)
    WHEN upper(p_sku) ~ '^[A-Z][0-9]{8}[A-Z]{1,3}$' THEN left(upper(p_sku), 9)
    ELSE NULL END
$$;
COMMENT ON FUNCTION bizcity_parent_from_sku(text) IS 'Mã cha suy từ mã hàng: bỏ chữ đầu / phần cuối (chữ hoặc số, NT-DM-013) quanh mã chính (0115, 0170).';
