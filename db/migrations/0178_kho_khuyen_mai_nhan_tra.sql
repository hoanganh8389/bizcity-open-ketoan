-- [2026-11-21 11:06 AM Võ Hoàng] NT-BH-035 — kho khuyến mại (KKM) nhận hàng khách trả: thêm KKM vào nghiệp vụ "Khách trả hàng" (đóng góp)
--
-- Quà khách trả lại (dòng isGift nguyên vẹn) về kho quà KKM của cửa hàng nhận trả (phiếu NT-BH-035 §3.2, Q2). Loại kho của nghiệp vụ
-- sale_return_in (0128) trước chỉ có KTL, KHH → kho KKM bị chặn ở màn chọn kho.
--   1. Mọi đơn vị đang có: nối KKM vào CUỐI danh sách sale_return_in (giữ KTL, KHH đứng trước — kho tự chọn mặc định không đổi).
--      Đơn vị đã tự khai danh sách khác: chỉ nối thêm KKM nếu chưa có, không đổi thứ tự của họ. Chạy lại không thêm trùng.
--   2. Đơn vị mới: bộ mặc định (bizcity_seed_warehouse_types) có sale_return_in = KTL, KHH, KKM.
--   3. Khung nhìn chỉ đọc bizcity_read.item_kinds (loại mặt hàng theo ngày) cho module bán hàng — §3.3 mặt hàng dịch vụ không ghi kho.
-- Không đổi sổ, không đổi thẻ kho cũ.

UPDATE warehouse_type_ops
   SET type_codes = type_codes || ARRAY['KKM'], updated_by = 'migration:0178', updated_at = now()
 WHERE op = 'sale_return_in' AND NOT ('KKM' = ANY (type_codes));

CREATE OR REPLACE FUNCTION bizcity_seed_warehouse_types(p_tenant bigint) RETURNS void LANGUAGE sql AS $$
  INSERT INTO warehouse_types (tenant_id, code, name, purpose, can_sell, owned, track_expiry, account_prefix, is_system, sort_order)
  SELECT p_tenant, x.* FROM (VALUES
    ('KHH',   'Kho hàng hóa kinh doanh', 'Hàng đủ điều kiện bán',                         true,  true,  true,  '156', true, 1),
    ('KKM',   'Kho hàng khuyến mại',     'Hàng dành riêng cho chương trình khuyến mại',   false, true,  true,  '156', true, 2),
    ('KHG',   'Kho hàng gửi bán',        'Hàng gửi đại lý, chưa bán',                     false, true,  true,  '157', true, 3),
    ('KTL',   'Kho hàng trả lại',        'Hàng khách trả, chờ kiểm tra',                  false, true,  true,  '156', true, 4),
    ('KCL',   'Kho hàng cách ly',        'Hàng chờ kiểm tra chất lượng',                  false, true,  true,  '156', true, 5),
    ('KLO',   'Kho hàng lỗi',            'Hàng hư hỏng, không đạt tiêu chuẩn',            false, true,  true,  '156', true, 6),
    ('KHHAN', 'Kho hàng cận hạn',        'Hàng gần hết hạn — bán theo chính sách',        true,  true,  true,  '156', true, 7),
    ('KHHSD', 'Kho hàng hết hạn',        'Hàng hết hạn — chỉ tiêu huỷ, không bán',        false, true,  true,  '156', true, 8),
    ('KDC',   'Kho hàng điều chuyển',    'Hàng đang vận chuyển giữa các kho',             false, true,  true,  '156', true, 9),
    ('KNB',   'Kho hàng nhận giữ hộ',    'Hàng của bên khác — chỉ theo dõi số lượng',     false, false, false, '',    true, 10),
    ('KCB',   'Kho hàng chờ bán',        'Hàng đã giữ cho đơn bán',                       false, true,  true,  '156', true, 11),
    ('KCC',   'Kho hàng chờ chứng từ',   'Hàng đã nhận nhưng chưa đủ hồ sơ',              false, true,  true,  '156', true, 12)
  ) AS x(code, name, purpose, can_sell, owned, track_expiry, account_prefix, is_system, sort_order)
  ON CONFLICT (tenant_id, code) DO NOTHING;
  INSERT INTO warehouse_type_ops (tenant_id, op, type_codes)
  SELECT p_tenant, o.op, o.codes FROM (VALUES
    ('purchase_in',         ARRAY['KHH','KKM','KCL','KCC']),
    ('purchase_return_out', ARRAY['KHH','KLO','KHHAN','KTL','KCL','KKM']),
    ('sale_out',            ARRAY['KHH','KHHAN','KKM']),
    ('sale_return_in',      ARRAY['KTL','KHH','KKM']),
    ('gift_in',             ARRAY['KKM','KNB','KHH']),
    ('gift_out',            ARRAY['KKM','KHH']),
    ('transfer',            ARRAY['KHH','KKM','KTL','KCL','KLO','KHHAN','KHHSD','KHG','KDC','KCB','KCC']),
    ('stock_in_other',      ARRAY['KHH','KKM','KCL','KNB']),
    ('stock_out_other',     ARRAY['KHHSD','KLO','KHH','KKM']),
    ('consignment_out',     ARRAY['KHG'])
  ) AS o(op, codes)
  ON CONFLICT (tenant_id, op) DO NOTHING;
$$;
COMMENT ON FUNCTION bizcity_seed_warehouse_types(bigint) IS 'Nạp 12 loại kho gốc + nghiệp vụ dùng loại kho (0128); chạy lại không ghi đè. 0178: khách trả hàng (sale_return_in) nhận cả KKM (quà trả về kho quà), sau KTL, KHH.';

-- ── Loại mặt hàng theo ngày cho module (NT-BH-035 §3.3) ─────────────────────────────────────────────────────────────────
-- Kernel kho không ghi thẻ kho cho dòng mặt hàng dịch vụ (item_classification.kind = 'service' tại ngày chứng từ). Module bán hàng
-- (pos, phieu-ban) cần biết cùng điều đó để không kiểm / giữ tồn của dòng dịch vụ (phí ship…) và để BH17 nhắc khi mã phí ship chưa là
-- dịch vụ. Khung nhìn chỉ đọc, chỉ cột loại + ngày hiệu lực (không nhóm hạch toán / thuế — thuộc Kernel). Module khai ở data.reads.
CREATE OR REPLACE VIEW bizcity_read.item_kinds WITH (security_invoker = true) AS
SELECT tenant_id, item_id, kind, valid_from, valid_to
  FROM public.item_classification;
COMMENT ON VIEW bizcity_read.item_kinds IS 'Loại mặt hàng theo ngày hiệu lực (chỉ đọc, 0178): goods, service… NULL = chưa phân loại. Dòng dịch vụ không ghi thẻ kho (NT-BH-035).';
COMMENT ON COLUMN bizcity_read.item_kinds.item_id IS 'Định danh mặt hàng (bizcity_read.products.item_id).';
COMMENT ON COLUMN bizcity_read.item_kinds.kind IS 'goods · material · finished · service · tool · asset · gift · packaging · other; NULL = chưa phân loại.';
COMMENT ON COLUMN bizcity_read.item_kinds.valid_from IS 'Ngày bắt đầu hiệu lực (tính).';
COMMENT ON COLUMN bizcity_read.item_kinds.valid_to IS 'Ngày hết hiệu lực (không tính); trống là đang dùng.';
DROP TRIGGER IF EXISTS bizcity_read_only ON bizcity_read.item_kinds;
CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.item_kinds
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON bizcity_read.item_kinds TO ketoan_app;
  END IF;
END $$;
