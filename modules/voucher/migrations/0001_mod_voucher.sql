-- Voucher (module voucher, phiếu NT-BH-026): đợt phát, mã voucher gắn khách, nhật ký phát / dùng / trả / thu hồi.
-- Chạy bằng vai trò mod_voucher_owner trong schema mod_voucher: không chạm bảng Core. Mọi bảng: tenant_id, RLS, COMMENT.
-- Voucher đổi điểm (loại 3) vẫn ở module loyalty (NT-BH-020). Module này không nộp chứng từ: tiền voucher đi trên chứng từ bán của
-- module pos / phieu-ban (TGS phát = chiết khấu trên dòng; hãng phát = dòng thanh toán theo hình thức kế toán khai).
-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: bảng đợt phát / mã / nhật ký voucher (đóng góp)

CREATE TABLE campaigns (
  campaign_id          uuid          NOT NULL PRIMARY KEY,
  tenant_id            bigint        NOT NULL,
  code                 text          NOT NULL,
  name                 text          NOT NULL,
  kind                 text          NOT NULL CHECK (kind IN ('cash', 'next_purchase')),
  issuer               text          NOT NULL CHECK (issuer IN ('tgs', 'brand')),
  issuer_partner_code  text,
  payment_method_code  text,
  face_value           numeric(18,2) NOT NULL CHECK (face_value > 0),
  min_order            numeric(18,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  valid_from           date          NOT NULL,
  valid_to             date,
  valid_days           integer       CHECK (valid_days IS NULL OR valid_days > 0),
  item_ids             jsonb         NOT NULL DEFAULT '[]'::jsonb,
  brand_codes          jsonb         NOT NULL DEFAULT '[]'::jsonb,
  issue_mode           text          NOT NULL DEFAULT 'manual' CHECK (issue_mode IN ('manual', 'auto')),
  auto_rule            jsonb,
  status               text          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  note                 text,
  created_by           text          NOT NULL,
  created_by_name      text,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_by           text          NOT NULL,
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CHECK (issuer = 'tgs' OR (issuer_partner_code IS NOT NULL AND payment_method_code IS NOT NULL)),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX campaigns_code ON campaigns (tenant_id, code);
CREATE INDEX campaigns_auto ON campaigns (tenant_id, issue_mode, status);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON campaigns USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE campaigns IS 'Đợt phát voucher (màn Voucher): loại, người phát (TGS / hãng – NCC), mệnh giá, hạn, đơn tối thiểu, sản phẩm / nhãn áp dụng, kiểu phát (thủ công / tự động lần mua sau). Đã có mã thì không đổi mệnh giá / loại / người phát (ECP-13).';
COMMENT ON COLUMN campaigns.campaign_id IS 'Định danh đợt phát (uuid).';
COMMENT ON COLUMN campaigns.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN campaigns.code IS 'Mã đợt (vd ABBOTT50K), duy nhất trong đơn vị — để đọc; mã voucher nối theo campaign_id.';
COMMENT ON COLUMN campaigns.name IS 'Tên đợt (in trên bill, báo cáo).';
COMMENT ON COLUMN campaigns.kind IS 'cash = tương đương tiền (trừ thẳng tổng thanh toán); next_purchase = lần mua sau sản phẩm / nhãn (chỉ trừ khi giỏ có sản phẩm / nhãn áp dụng, trừ tối đa tiền các dòng đó).';
COMMENT ON COLUMN campaigns.issuer IS 'tgs = công ty phát (chiết khấu trên hoá đơn: giảm doanh thu + thuế); brand = hãng / NCC phát (hình thức thanh toán: doanh thu đủ, phải thu hãng).';
COMMENT ON COLUMN campaigns.issuer_partner_code IS 'Hãng / NCC phát (mã đối tượng ở danh mục — khung nhìn bizcity_read.partners chỉ có mã, chưa có định danh). Bắt buộc khi issuer = brand.';
COMMENT ON COLUMN campaigns.payment_method_code IS 'Hình thức thanh toán kế toán khai cho voucher hãng (tài khoản phải thu hãng nằm ở hình thức, không ở module). Bắt buộc khi issuer = brand.';
COMMENT ON COLUMN campaigns.face_value IS 'Mệnh giá (gồm thuế). Dùng một lần: đơn nhỏ hơn mệnh giá thì phần dư mất.';
COMMENT ON COLUMN campaigns.min_order IS 'Đơn tối thiểu (tổng đơn sau khuyến mại, trước voucher); 0 = không.';
COMMENT ON COLUMN campaigns.valid_from IS 'Ngày bắt đầu dùng / phát.';
COMMENT ON COLUMN campaigns.valid_to IS 'Ngày cuối dùng được (gồm); trống = không hạn.';
COMMENT ON COLUMN campaigns.valid_days IS 'Hạn mỗi mã tính từ ngày phát (số ngày, gồm ngày phát) — hạn mã = sớm hơn giữa ngày phát + hạn và valid_to; trống = theo valid_to.';
COMMENT ON COLUMN campaigns.item_ids IS 'Mặt hàng áp dụng (mảng item_id — định danh bất biến, không phải mã hàng) cho loại next_purchase.';
COMMENT ON COLUMN campaigns.brand_codes IS 'Nhãn hàng áp dụng (mảng mã nhãn products.brand_code — danh mục nhãn chưa có định danh riêng) cho loại next_purchase.';
COMMENT ON COLUMN campaigns.issue_mode IS 'manual = sinh / nạp mã ở màn Voucher; auto = máy bán tự phát khi đơn đủ điều kiện auto_rule.';
COMMENT ON COLUMN campaigns.auto_rule IS 'Điều kiện tự phát: { itemIds: [item_id], brandCodes: [mã nhãn], minQty: N (đơn vị nhỏ nhất), branches: [mã cửa hàng] (rỗng = mọi cửa hàng) }.';
COMMENT ON COLUMN campaigns.status IS 'active = đang dùng; stopped = ngừng (mã của đợt không dùng được, không tự phát nữa).';
COMMENT ON COLUMN campaigns.note IS 'Ghi chú.';
COMMENT ON COLUMN campaigns.created_by IS 'Người lập (actor id).';
COMMENT ON COLUMN campaigns.created_by_name IS 'Tên người lập (ảnh chụp).';
COMMENT ON COLUMN campaigns.created_at IS 'Lúc lập.';
COMMENT ON COLUMN campaigns.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN campaigns.updated_at IS 'Lúc sửa gần nhất.';

CREATE TABLE codes (
  tenant_id          bigint        NOT NULL,
  code               text          NOT NULL,
  campaign_id        uuid          NOT NULL REFERENCES campaigns (campaign_id),
  phone              text          NOT NULL,
  partner_code       text,
  status             text          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  source             text          NOT NULL CHECK (source IN ('generate', 'import', 'auto')),
  expires_on         date,
  issued_at          timestamptz   NOT NULL DEFAULT now(),
  issued_by          text          NOT NULL,
  issued_order_id    text,
  issued_order_code  text,
  issued_branch      text,
  used_source        text          CHECK (used_source IS NULL OR used_source IN ('pos', 'phieu-ban')),
  used_ref_id        text,
  used_ref_code      text,
  used_branch        text,
  used_on            date,
  used_amount        numeric(18,2),
  used_at            timestamptz,
  revoked_at         timestamptz,
  revoke_reason      text,
  PRIMARY KEY (tenant_id, code)
);
CREATE INDEX codes_phone ON codes (tenant_id, phone, status);
CREATE INDEX codes_campaign ON codes (tenant_id, campaign_id, status);
CREATE INDEX codes_issued_order ON codes (tenant_id, issued_order_id) WHERE issued_order_id IS NOT NULL;
CREATE UNIQUE INDEX codes_auto_once ON codes (tenant_id, campaign_id, issued_order_id) WHERE source = 'auto';
ALTER TABLE codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON codes USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE codes IS 'Mã voucher: luôn gắn SĐT khách (chỉ khách đó dùng), dùng một lần (phần dư mất). Đã dùng vẫn tra cứu được: đơn / phiếu nào, ngày, cửa hàng, số tiền trừ.';
COMMENT ON COLUMN codes.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN codes.code IS 'Mã voucher (viết hoa) — sinh ngẫu nhiên, nạp từ danh sách của hãng / voucher giấy, hoặc định theo đơn khi tự phát.';
COMMENT ON COLUMN codes.campaign_id IS 'Đợt phát.';
COMMENT ON COLUMN codes.phone IS 'SĐT khách được dùng (chuẩn hoá 0xxxxxxxxx).';
COMMENT ON COLUMN codes.partner_code IS 'Mã khách ở danh mục đối tượng nếu biết lúc phát (đơn máy bán tự phát).';
COMMENT ON COLUMN codes.status IS 'active = còn (xem expires_on) / used = đã dùng / revoked = đã thu hồi (trả hàng đơn gốc, thu hồi tay).';
COMMENT ON COLUMN codes.source IS 'generate = sinh ở màn; import = nạp danh sách có sẵn; auto = máy bán tự phát (lần mua sau).';
COMMENT ON COLUMN codes.expires_on IS 'Ngày cuối dùng được (gồm); trống = không hạn.';
COMMENT ON COLUMN codes.issued_at IS 'Lúc phát.';
COMMENT ON COLUMN codes.issued_by IS 'Người phát (actor id; tự phát = system).';
COMMENT ON COLUMN codes.issued_order_id IS 'Đơn máy bán đã tự phát mã này (trả cả đơn này → thu hồi nếu chưa dùng).';
COMMENT ON COLUMN codes.issued_order_code IS 'Số đơn gốc (ảnh chụp).';
COMMENT ON COLUMN codes.issued_branch IS 'Cửa hàng phát (đơn gốc).';
COMMENT ON COLUMN codes.used_source IS 'Nơi dùng: pos (máy bán) / phieu-ban (BH10).';
COMMENT ON COLUMN codes.used_ref_id IS 'Định danh đơn / phiếu đã dùng.';
COMMENT ON COLUMN codes.used_ref_code IS 'Số đơn / phiếu đã dùng (ảnh chụp).';
COMMENT ON COLUMN codes.used_branch IS 'Cửa hàng đã dùng.';
COMMENT ON COLUMN codes.used_on IS 'Ngày bán của đơn đã dùng.';
COMMENT ON COLUMN codes.used_amount IS 'Số tiền thực trừ (≤ mệnh giá — phần dư mất).';
COMMENT ON COLUMN codes.used_at IS 'Lúc ghi nhận đã dùng.';
COMMENT ON COLUMN codes.revoked_at IS 'Lúc thu hồi.';
COMMENT ON COLUMN codes.revoke_reason IS 'Lý do thu hồi.';

CREATE TABLE code_log (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id   bigint        NOT NULL,
  code        text          NOT NULL,
  action      text          NOT NULL CHECK (action IN ('issue', 'use', 'release', 'revoke', 'conflict')),
  ref_source  text,
  ref_id      text,
  ref_code    text,
  branch_code text,
  amount      numeric(18,2),
  note        text,
  actor       text          NOT NULL,
  at          timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX code_log_code ON code_log (tenant_id, code, at);
ALTER TABLE code_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON code_log USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE code_log IS 'Nhật ký mã voucher (chỉ thêm): phát, dùng, trả lại (huỷ đơn chờ thanh toán / bỏ duyệt phiếu), thu hồi, dùng trùng (hai nơi cùng dùng trong cửa sổ chưa nhận sự kiện).';
COMMENT ON COLUMN code_log.id IS 'Số thứ tự.';
COMMENT ON COLUMN code_log.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN code_log.code IS 'Mã voucher.';
COMMENT ON COLUMN code_log.action IS 'issue / use / release / revoke / conflict.';
COMMENT ON COLUMN code_log.ref_source IS 'pos / phieu-ban / screen.';
COMMENT ON COLUMN code_log.ref_id IS 'Định danh đơn / phiếu.';
COMMENT ON COLUMN code_log.ref_code IS 'Số đơn / phiếu.';
COMMENT ON COLUMN code_log.branch_code IS 'Cửa hàng.';
COMMENT ON COLUMN code_log.amount IS 'Số tiền (dùng: tiền thực trừ).';
COMMENT ON COLUMN code_log.note IS 'Ghi chú.';
COMMENT ON COLUMN code_log.actor IS 'Người làm (actor id; sự kiện = system).';
COMMENT ON COLUMN code_log.at IS 'Lúc ghi.';
