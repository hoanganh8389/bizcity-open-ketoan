-- [2026-11-15 07:00 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: voucher đổi điểm (đóng góp)
-- Voucher phát khi khách đổi điểm ở quầy (chính sách loại 6); dùng một lần ở đơn sau (chiết khấu trên chứng từ bán của module pos).
CREATE TABLE vouchers (
  tenant_id         bigint        NOT NULL,
  code              text          NOT NULL,
  partner_code      text,
  name              text          NOT NULL,
  discount_type     text          NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
  discount_value    numeric(18,2) NOT NULL CHECK (discount_value > 0),
  max_discount      numeric(18,2) NOT NULL DEFAULT 0,
  min_order_amount  numeric(18,2) NOT NULL DEFAULT 0,
  expires_at        timestamptz,
  status            text          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used')),
  reward_index      text          NOT NULL,
  issued_order_id   text          NOT NULL,
  issued_order_code text,
  used_order_id     text,
  used_order_code   text,
  used_at           timestamptz,
  note              text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code)
);
CREATE INDEX vouchers_partner ON vouchers (tenant_id, partner_code, status);
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vouchers USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE vouchers IS 'Voucher đổi điểm: phát khi khách đổi điểm (chính sách loại 6), dùng một lần ở đơn sau — tiền giảm là chiết khấu trên chứng từ bán của module pos.';
COMMENT ON COLUMN vouchers.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN vouchers.code IS 'Mã voucher (tiền tố chính sách + 8 ký tự định theo đơn đổi) — in trên bill.';
COMMENT ON COLUMN vouchers.partner_code IS 'Mã khách sở hữu; NULL = ai cũng dùng được.';
COMMENT ON COLUMN vouchers.name IS 'Tên phần thưởng (in bill).';
COMMENT ON COLUMN vouchers.discount_type IS 'fixed giảm số tiền · percent giảm theo phần trăm (có trần max_discount).';
COMMENT ON COLUMN vouchers.discount_value IS 'Số tiền giảm (fixed, gồm thuế) hoặc phần trăm (percent).';
COMMENT ON COLUMN vouchers.max_discount IS 'Trần tiền giảm khi giảm theo %; 0 = không trần.';
COMMENT ON COLUMN vouchers.min_order_amount IS 'Đơn tối thiểu để dùng (gồm thuế); 0 = không yêu cầu.';
COMMENT ON COLUMN vouchers.expires_at IS 'Hết hạn lúc; NULL = không hết hạn.';
COMMENT ON COLUMN vouchers.status IS 'active còn dùng · used đã dùng.';
COMMENT ON COLUMN vouchers.reward_index IS 'Phần thưởng đã đổi (lp_<chính sách>_<mã phần thưởng>).';
COMMENT ON COLUMN vouchers.issued_order_id IS 'Đơn máy bán đổi điểm phát voucher này.';
COMMENT ON COLUMN vouchers.issued_order_code IS 'Mã đơn phát (HD…).';
COMMENT ON COLUMN vouchers.used_order_id IS 'Đơn đã dùng voucher.';
COMMENT ON COLUMN vouchers.used_order_code IS 'Mã đơn đã dùng (HD…).';
COMMENT ON COLUMN vouchers.used_at IS 'Lúc dùng.';
COMMENT ON COLUMN vouchers.note IS 'Ghi chú (vd dùng trùng ở hai máy cùng lúc).';
COMMENT ON COLUMN vouchers.created_at IS 'Lúc phát.';
