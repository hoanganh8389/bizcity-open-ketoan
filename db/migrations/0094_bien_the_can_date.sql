-- [2026-11-10 04:00 PM Nguyễn Văn Thủy] PHASE-026 — biến thể Cận date (mã B cũ) (đóng góp)
-- =============================================================================
-- 0094 Biến thể Cận date.
--   Mã B cũ = hàng sắp hết hạn: giảm giá, áp chương trình. Cửa hàng có cả mã thường và mã cận date, nhân viên chọn khi bán;
--   hai giá bán khác nhau. Chuyển hàng từ mã thường sang mã cận date bằng phiếu chuyển đổi (như mã Z).
--   Vẫn gửi lên thuế, sổ thuế ghi theo mã cha (mã thường): bản chất chỉ để quản lý hạn sử dụng.
--   Trước đây mã B nằm ở 'legacy' (Đuôi khác, chưa xử lý). Mã B đang có chuyển sang 'expiry', đổi updated_at để
--   hệ thống bán hàng kéo lại cột biến thể. Không đổi định khoản, không chạm sổ.
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_seed_variant_kinds(p_tenant bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO item_variant_kinds (tenant_id, code, name, legacy_suffix, tax_flow, tax_sku, sort_order, note) VALUES
    (p_tenant, 'normal',   'Thường',            '',  'invoice',   'self', 10, 'Hàng thường và sản phẩm con màu, size. Lên thuế theo hoá đơn.'),
    (p_tenant, 'share',    'Chia giá',          'K', 'invoice',   'parent', 20, 'Hàng tặng được chia vào giá trị hàng bán.'),
    (p_tenant, 'promo',    'Khuyến mại',        'M', 'invoice',   'parent', 30, 'Hàng tặng người tiêu dùng, ghi nhận 0 đồng.'),
    (p_tenant, 'program',  'Theo chương trình', 'T', 'invoice',   'parent', 40, 'Hàng theo chương trình: giá khác, bao bì riêng.'),
    (p_tenant, 'clip',     'Kẹp quà',           'Q', 'invoice',   'invoice', 50, 'Hàng bán bó kèm quà, không được tách.'),
    (p_tenant, 'expiry',   'Cận date',          'B', 'invoice',   'parent', 55, 'Hàng sắp hết hạn: giá bán riêng, áp chương trình. Lên thuế theo mã cha.'),
    (p_tenant, 'internal', 'Nội bộ',            'Z', 'never',     'none', 60, 'Tách hẳn khỏi thuế ở mọi khâu.'),
    (p_tenant, 'legacy',   'Đuôi khác',         '',  'undecided', 'self', 90, 'Đuôi C, D… chưa xử lý.')
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
COMMENT ON FUNCTION bizcity_seed_variant_kinds(bigint) IS 'Nạp bộ biến thể và loại hàng chuẩn cho một đơn vị; chạy lại an toàn (0092, thêm Cận date 0094).';

CREATE OR REPLACE FUNCTION bizcity_variant_from_sku(p_sku text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(p_sku) ~ 'Z$' THEN 'internal'
    WHEN upper(p_sku) ~ '^[0-9]{9}K$' THEN 'share'
    WHEN upper(p_sku) ~ '^[0-9]{9}M$' THEN 'promo'
    WHEN upper(p_sku) ~ '^[0-9]{9}T$' THEN 'program'
    WHEN upper(p_sku) ~ '^[0-9]{9}Q$' THEN 'clip'
    WHEN upper(p_sku) ~ '^[0-9]{9}B$' THEN 'expiry'
    WHEN upper(p_sku) ~ '^[0-9]{9}[A-Z]{1,3}$' THEN 'legacy'
    ELSE 'normal'
  END
$$;
COMMENT ON FUNCTION bizcity_variant_from_sku(text) IS 'Biến thể suy từ đuôi mã cũ; chỉ dùng lúc tạo mặt hàng và lúc điền ban đầu (0092, B → Cận date 0094).';

DO $$
DECLARE t bigint;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM bizcity_seed_variant_kinds(t);
  END LOOP;
END $$;

UPDATE item_variant_kinds SET note = 'Đuôi C, D… chưa xử lý.' WHERE code = 'legacy' AND note = 'Đuôi B, C, D… chưa xử lý trong đợt đầu.';

UPDATE products SET variant_code = 'expiry', updated_at = now()
 WHERE variant_code = 'legacy' AND upper(sku) ~ '^[0-9]{9}B$';

COMMENT ON COLUMN item_variant_kinds.code IS 'Mã biến thể: normal, share, promo, program, clip, expiry, internal, legacy hoặc do đơn vị thêm.';
