-- [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản theo nghiệp vụ + chương trình có hạn mức thay mã phụ (đóng góp)
-- =============================================================================
-- 0096 Quy tắc định khoản và chương trình có hạn mức (docs/nghiep-vu/15-quy-tac-dinh-khoan.md).
--
--   posting_businesses  Nghiệp vụ: Bán hàng, Khách trả hàng, Nhập mua, Chuyển kho… (hệ thống) và nghiệp vụ kế toán tự tạo
--                       (dựa trên một nghiệp vụ hệ thống, nhận chứng từ mang lý do riêng).
--   posting_rules       Một dòng = một quy tắc: nghiệp vụ + khoản tiền + điều kiện → Nợ / Có. Ô tài khoản để trống = giữ
--                       tài khoản bộ định khoản tự tra (tài khoản ngầm định). Có hiệu lực theo ngày chứng từ, phải được duyệt.
--   program_kinds       Loại chương trình (KM của NCC, KM của công ty, xả hàng cận date…): điều kiện chung của quy tắc.
--   sale_programs       Chương trình bán: quà tặng hoặc giảm giá trên CHÍNH mặt hàng, có thời gian và hạn mức theo cửa hàng —
--   sale_program_quotas thay cho việc sinh mã phụ (đuôi tặng / giảm giá) cho cùng một sản phẩm.
--   sale_program_usage  Lượt đã dùng hạn mức (một dòng bán = một lượt); báo cáo quà tặng tính từ đây.
--
--   Không chạm sổ: chưa có quy tắc nào thì định khoản giữ nguyên như trước.
-- =============================================================================

-- ── Nghiệp vụ ────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE posting_businesses (
  tenant_id   bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text        NOT NULL,
  name        text        NOT NULL,
  area        text        NOT NULL DEFAULT '',
  base_code   text,
  reason_code text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_system   boolean     NOT NULL DEFAULT false,
  is_active   boolean     NOT NULL DEFAULT true,
  note        text        NOT NULL DEFAULT '',
  created_by  text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code),
  CONSTRAINT posting_businesses_custom_chk CHECK (is_system OR (base_code IS NOT NULL AND reason_code IS NOT NULL))
);
CREATE UNIQUE INDEX posting_businesses_reason ON posting_businesses (tenant_id, reason_code) WHERE reason_code IS NOT NULL;

COMMENT ON TABLE posting_businesses IS 'Nghiệp vụ định khoản: nghiệp vụ hệ thống theo loại chứng từ và nghiệp vụ kế toán tự tạo (0096).';
COMMENT ON COLUMN posting_businesses.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN posting_businesses.code IS 'Mã nghiệp vụ. Hệ thống: sale, sale_return, purchase, purchase_return, transfer, stock_increase, stock_decrease, customer_payment, supplier_payment, cash_transfer.';
COMMENT ON COLUMN posting_businesses.name IS 'Tên hiện cho kế toán.';
COMMENT ON COLUMN posting_businesses.area IS 'Nhóm hiện ở cột trái: Bán hàng, Mua hàng, Kho, Tiền.';
COMMENT ON COLUMN posting_businesses.base_code IS 'Nghiệp vụ tự tạo: dựa trên nghiệp vụ hệ thống nào (nhận quy tắc của nghiệp vụ đó, quy tắc riêng thắng).';
COMMENT ON COLUMN posting_businesses.reason_code IS 'Nghiệp vụ tự tạo: chứng từ mang lý do này thì theo nghiệp vụ này.';
COMMENT ON COLUMN posting_businesses.sort_order IS 'Thứ tự hiện.';
COMMENT ON COLUMN posting_businesses.is_system IS 'Nghiệp vụ hệ thống (không xoá).';
COMMENT ON COLUMN posting_businesses.is_active IS 'Đang dùng.';
COMMENT ON COLUMN posting_businesses.note IS 'Ghi chú.';
COMMENT ON COLUMN posting_businesses.created_by IS 'Người tạo.';
COMMENT ON COLUMN posting_businesses.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN posting_businesses.updated_at IS 'Lúc sửa gần nhất.';

-- Nghiệp vụ hệ thống cho mọi đơn vị đang có (đơn vị mới: API tự thêm khi mở màn).
INSERT INTO posting_businesses (tenant_id, code, name, area, sort_order, is_system, created_by)
SELECT t.id, b.code, b.name, b.area, b.sort, true, 'migration 0096'
  FROM tenants t
  CROSS JOIN (VALUES
    ('sale', 'Bán hàng', 'Bán hàng', 10), ('sale_return', 'Khách trả hàng', 'Bán hàng', 20),
    ('purchase', 'Nhập mua hàng', 'Mua hàng', 30), ('purchase_return', 'Trả hàng nhà cung cấp', 'Mua hàng', 40),
    ('transfer', 'Chuyển kho', 'Kho', 50), ('stock_increase', 'Nhập điều chỉnh kho', 'Kho', 60), ('stock_decrease', 'Xuất điều chỉnh kho', 'Kho', 70),
    ('customer_payment', 'Thu tiền', 'Tiền', 80), ('supplier_payment', 'Chi tiền', 'Tiền', 90), ('cash_transfer', 'Chuyển tiền', 'Tiền', 100)
  ) AS b(code, name, area, sort)
ON CONFLICT DO NOTHING;

-- ── Quy tắc ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE posting_rules (
  id             bigserial   PRIMARY KEY,
  tenant_id      bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_code  text        NOT NULL,
  part           text        NOT NULL,
  book           text        NOT NULL DEFAULT 'all',
  cond           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  debit_account  text,
  credit_account text,
  priority       integer     NOT NULL DEFAULT 0,
  effective_from date        NOT NULL,
  effective_to   date,
  status         text        NOT NULL DEFAULT 'draft',
  replaces_id    bigint      REFERENCES posting_rules(id),
  note           text        NOT NULL DEFAULT '',
  change_reason  text        NOT NULL DEFAULT '',
  created_by     text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  approved_by    text,
  approved_at    timestamptz,
  rejected_note  text,
  FOREIGN KEY (tenant_id, business_code) REFERENCES posting_businesses(tenant_id, code),
  CONSTRAINT posting_rules_part_chk CHECK (part IN ('goods', 'tax', 'cogs', 'payment')),
  CONSTRAINT posting_rules_book_chk CHECK (book IN ('all', 'internal', 'tax')),
  CONSTRAINT posting_rules_status_chk CHECK (status IN ('draft', 'active', 'rejected')),
  CONSTRAINT posting_rules_account_chk CHECK (debit_account IS NOT NULL OR credit_account IS NOT NULL),
  CONSTRAINT posting_rules_dates_chk CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT posting_rules_cond_chk CHECK (jsonb_typeof(cond) = 'object')
);
CREATE INDEX posting_rules_lookup ON posting_rules (tenant_id, business_code, part) WHERE status = 'active';

COMMENT ON TABLE posting_rules IS 'Quy tắc định khoản: nghiệp vụ + khoản tiền + điều kiện → tài khoản Nợ / Có; đè lên tài khoản bộ định khoản tự tra (0096).';
COMMENT ON COLUMN posting_rules.id IS 'Khoá.';
COMMENT ON COLUMN posting_rules.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN posting_rules.business_code IS 'Nghiệp vụ (posting_businesses.code).';
COMMENT ON COLUMN posting_rules.part IS 'Khoản tiền: goods tiền hàng, tax thuế, cogs giá vốn, payment tiền thanh toán.';
COMMENT ON COLUMN posting_rules.book IS 'Sổ áp dụng: all cả hai, internal chỉ sổ nội bộ, tax chỉ sổ thuế.';
COMMENT ON COLUMN posting_rules.cond IS 'Điều kiện (ô trống = mọi trường hợp): method, taxCode, itemType, programKind, program, gift, leg, sameUnit.';
COMMENT ON COLUMN posting_rules.debit_account IS 'Tài khoản Nợ; trống = giữ tài khoản tự tra.';
COMMENT ON COLUMN posting_rules.credit_account IS 'Tài khoản Có; trống = giữ tài khoản tự tra.';
COMMENT ON COLUMN posting_rules.priority IS 'Ưu tiên khi hai quy tắc khớp ngang nhau (số lớn thắng).';
COMMENT ON COLUMN posting_rules.effective_from IS 'Áp cho chứng từ từ ngày này.';
COMMENT ON COLUMN posting_rules.effective_to IS 'Áp đến trước ngày này (trống = chưa đóng). Quy tắc bị thay hoặc ngừng thì được đóng ở đây, chứng từ cũ vẫn theo quy tắc cũ.';
COMMENT ON COLUMN posting_rules.status IS 'draft đề xuất chờ duyệt, active đã duyệt, rejected bị từ chối.';
COMMENT ON COLUMN posting_rules.replaces_id IS 'Đề xuất sửa: quy tắc đang áp bị thay khi đề xuất này được duyệt.';
COMMENT ON COLUMN posting_rules.note IS 'Diễn giải của quy tắc.';
COMMENT ON COLUMN posting_rules.change_reason IS 'Lý do đề xuất thêm / đổi.';
COMMENT ON COLUMN posting_rules.created_by IS 'Người đề xuất.';
COMMENT ON COLUMN posting_rules.created_at IS 'Lúc đề xuất.';
COMMENT ON COLUMN posting_rules.updated_at IS 'Lúc sửa gần nhất.';
COMMENT ON COLUMN posting_rules.approved_by IS 'Người duyệt.';
COMMENT ON COLUMN posting_rules.approved_at IS 'Lúc duyệt.';
COMMENT ON COLUMN posting_rules.rejected_note IS 'Lý do từ chối.';

-- ── Loại chương trình ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE program_kinds (
  tenant_id  bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text        NOT NULL,
  name       text        NOT NULL,
  side       text        NOT NULL DEFAULT 'both',
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  note       text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code),
  CONSTRAINT program_kinds_side_chk CHECK (side IN ('sale', 'purchase', 'both'))
);
COMMENT ON TABLE program_kinds IS 'Loại chương trình khuyến mại / chính sách; quy tắc định khoản đặt điều kiện theo loại (0096).';
COMMENT ON COLUMN program_kinds.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN program_kinds.code IS 'Mã loại.';
COMMENT ON COLUMN program_kinds.name IS 'Tên loại.';
COMMENT ON COLUMN program_kinds.side IS 'Dùng ở: sale chương trình bán, purchase chính sách mua, both cả hai.';
COMMENT ON COLUMN program_kinds.sort_order IS 'Thứ tự hiện.';
COMMENT ON COLUMN program_kinds.is_active IS 'Đang dùng.';
COMMENT ON COLUMN program_kinds.note IS 'Ghi chú cách hạch toán thường dùng.';
COMMENT ON COLUMN program_kinds.created_at IS 'Lúc tạo.';

INSERT INTO program_kinds (tenant_id, code, name, side, sort_order, note)
SELECT t.id, k.code, k.name, k.side, k.sort, k.note
  FROM tenants t
  CROSS JOIN (VALUES
    ('KM-NCC', 'Khuyến mại của nhà cung cấp', 'both', 10, 'Nhà cung cấp tặng hàng / giảm giá'),
    ('KM-CTY', 'Khuyến mại của công ty', 'sale', 20, 'Công ty tự tặng / giảm giá cho khách'),
    ('XA-DATE', 'Xả hàng cận date', 'sale', 30, 'Bán giảm giá hàng sắp hết hạn dùng')
  ) AS k(code, name, side, sort, note)
ON CONFLICT DO NOTHING;

ALTER TABLE purchase_policies ADD COLUMN program_kind text;
COMMENT ON COLUMN purchase_policies.program_kind IS 'Loại chương trình (program_kinds.code) để quy tắc định khoản phân biệt hàng tặng / giảm giá theo chương trình (0096).';
UPDATE purchase_policies SET program_kind = 'KM-NCC' WHERE kind IN ('promo_gift', 'item_discount', 'qty_tier', 'trade_discount');

-- ── Chương trình bán có hạn mức ──────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE sale_programs (
  id              bigserial     PRIMARY KEY,
  tenant_id       bigint        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            text          NOT NULL,
  name            text          NOT NULL,
  program_kind    text          NOT NULL,
  mode            text          NOT NULL,
  sku             text          NOT NULL,
  buy_qty         numeric(18,4) NOT NULL DEFAULT 1,
  gift_sku        text,
  gift_qty        numeric(18,4),
  discount_pct    numeric(7,3),
  discount_amount numeric(18,2),
  sale_price      numeric(18,2),
  valid_from      date          NOT NULL,
  valid_to        date          NOT NULL,
  is_active       boolean       NOT NULL DEFAULT true,
  version         integer       NOT NULL DEFAULT 0,
  content_hash    text,
  note            text          NOT NULL DEFAULT '',
  created_by      text          NOT NULL DEFAULT '',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      text          NOT NULL DEFAULT '',
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CONSTRAINT sale_programs_mode_chk CHECK (mode IN ('gift', 'discount')),
  CONSTRAINT sale_programs_dates_chk CHECK (valid_to >= valid_from),
  CONSTRAINT sale_programs_gift_chk CHECK (mode <> 'gift' OR (gift_qty IS NOT NULL AND gift_qty > 0 AND buy_qty > 0)),
  CONSTRAINT sale_programs_discount_chk CHECK (mode <> 'discount' OR num_nonnulls(discount_pct, discount_amount, sale_price) = 1)
);
CREATE INDEX sale_programs_sku ON sale_programs (tenant_id, sku) WHERE is_active;

COMMENT ON TABLE sale_programs IS 'Chương trình bán: quà tặng / giảm giá trên chính mặt hàng, có thời gian và hạn mức theo cửa hàng — không sinh mã phụ (0096).';
COMMENT ON COLUMN sale_programs.id IS 'Khoá.';
COMMENT ON COLUMN sale_programs.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN sale_programs.code IS 'Mã chương trình (khoá chính sách trên dòng chứng từ: policyRef.key).';
COMMENT ON COLUMN sale_programs.name IS 'Tên chương trình.';
COMMENT ON COLUMN sale_programs.program_kind IS 'Loại chương trình (program_kinds.code) — quy tắc định khoản theo loại.';
COMMENT ON COLUMN sale_programs.mode IS 'gift tặng hàng, discount giảm giá.';
COMMENT ON COLUMN sale_programs.sku IS 'Mặt hàng chính được áp chương trình.';
COMMENT ON COLUMN sale_programs.buy_qty IS 'Quà tặng: mua đủ số lượng này (ĐVT nhỏ nhất) thì được tặng.';
COMMENT ON COLUMN sale_programs.gift_sku IS 'Quà tặng: mặt hàng tặng; trống = tặng chính mặt hàng chính.';
COMMENT ON COLUMN sale_programs.gift_qty IS 'Quà tặng: số lượng tặng cho mỗi lần đủ điều kiện.';
COMMENT ON COLUMN sale_programs.discount_pct IS 'Giảm giá: phần trăm giảm.';
COMMENT ON COLUMN sale_programs.discount_amount IS 'Giảm giá: số tiền giảm trên một đơn vị.';
COMMENT ON COLUMN sale_programs.sale_price IS 'Giảm giá: giá bán chương trình trên một đơn vị.';
COMMENT ON COLUMN sale_programs.valid_from IS 'Bắt đầu.';
COMMENT ON COLUMN sale_programs.valid_to IS 'Kết thúc (gồm cả ngày này).';
COMMENT ON COLUMN sale_programs.is_active IS 'Đang áp dụng (bỏ tích = ngừng sớm).';
COMMENT ON COLUMN sale_programs.version IS 'Bản đã đăng ký ở sổ đăng ký chính sách (policy_registry).';
COMMENT ON COLUMN sale_programs.content_hash IS 'Băm nội dung bản hiện hành (policyRef.hash).';
COMMENT ON COLUMN sale_programs.note IS 'Ghi chú.';
COMMENT ON COLUMN sale_programs.created_by IS 'Người tạo.';
COMMENT ON COLUMN sale_programs.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN sale_programs.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN sale_programs.updated_at IS 'Lúc sửa gần nhất.';

CREATE TABLE sale_program_quotas (
  tenant_id   bigint        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id  bigint        NOT NULL REFERENCES sale_programs(id) ON DELETE CASCADE,
  branch_code text          NOT NULL,
  quota_qty   numeric(18,4) NOT NULL,
  used_qty    numeric(18,4) NOT NULL DEFAULT 0,
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, branch_code),
  CONSTRAINT sale_program_quotas_qty_chk CHECK (quota_qty >= 0 AND used_qty >= 0)
);
COMMENT ON TABLE sale_program_quotas IS 'Hạn mức số lượng của chương trình bán theo từng cửa hàng (0096).';
COMMENT ON COLUMN sale_program_quotas.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN sale_program_quotas.program_id IS 'Chương trình.';
COMMENT ON COLUMN sale_program_quotas.branch_code IS 'Mã cửa hàng / chi nhánh.';
COMMENT ON COLUMN sale_program_quotas.quota_qty IS 'Hạn mức: số lượng quà được tặng hoặc số lượng được bán giá giảm (ĐVT nhỏ nhất).';
COMMENT ON COLUMN sale_program_quotas.used_qty IS 'Đã dùng (cộng dồn từ sale_program_usage, khoá dòng khi trừ để hai máy không trừ trùng).';
COMMENT ON COLUMN sale_program_quotas.updated_at IS 'Lúc đổi gần nhất.';

CREATE TABLE sale_program_usage (
  id          bigserial     PRIMARY KEY,
  tenant_id   bigint        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id  bigint        NOT NULL REFERENCES sale_programs(id),
  branch_code text          NOT NULL,
  doc_key     text          NOT NULL,
  line_key    text          NOT NULL,
  doc_no      text          NOT NULL DEFAULT '',
  doc_date    date          NOT NULL,
  sku         text          NOT NULL,
  qty         numeric(18,4) NOT NULL,
  amount      numeric(18,2) NOT NULL DEFAULT 0,
  source      text          NOT NULL DEFAULT '',
  created_by  text          NOT NULL DEFAULT '',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, program_id, doc_key, line_key),
  CONSTRAINT sale_program_usage_qty_chk CHECK (qty > 0)
);
CREATE INDEX sale_program_usage_report ON sale_program_usage (tenant_id, program_id, branch_code, doc_date);
COMMENT ON TABLE sale_program_usage IS 'Lượt dùng hạn mức chương trình bán: mỗi dòng hàng đã bán theo chương trình một dòng; huỷ phiếu thì xoá lượt (0096).';
COMMENT ON COLUMN sale_program_usage.id IS 'Khoá.';
COMMENT ON COLUMN sale_program_usage.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN sale_program_usage.program_id IS 'Chương trình.';
COMMENT ON COLUMN sale_program_usage.branch_code IS 'Cửa hàng bán.';
COMMENT ON COLUMN sale_program_usage.doc_key IS 'Khoá phiếu bán ở hệ thống nguồn (docKey).';
COMMENT ON COLUMN sale_program_usage.line_key IS 'Khoá dòng hàng.';
COMMENT ON COLUMN sale_program_usage.doc_no IS 'Số phiếu bán.';
COMMENT ON COLUMN sale_program_usage.doc_date IS 'Ngày phiếu bán.';
COMMENT ON COLUMN sale_program_usage.sku IS 'Mặt hàng tặng / bán giảm giá.';
COMMENT ON COLUMN sale_program_usage.qty IS 'Số lượng đã dùng hạn mức.';
COMMENT ON COLUMN sale_program_usage.amount IS 'Giá trị: tiền giảm (giảm giá) hoặc giá bán thường của quà (quà tặng), để báo cáo.';
COMMENT ON COLUMN sale_program_usage.source IS 'Nơi ghi: pos, erp, nhập tay.';
COMMENT ON COLUMN sale_program_usage.created_by IS 'Người / máy ghi.';
COMMENT ON COLUMN sale_program_usage.created_at IS 'Lúc ghi.';

-- ── Cô lập đơn vị (như 0041) ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posting_businesses', 'posting_rules', 'program_kinds', 'sale_programs', 'sale_program_quotas', 'sale_program_usage'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id))', t);
  END LOOP;
END $$;

-- ── Quyền vai trò API (0032) ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON posting_businesses, posting_rules, program_kinds, sale_programs, sale_program_quotas, sale_program_usage TO ketoan_app;
    GRANT USAGE ON SEQUENCE posting_rules_id_seq, sale_programs_id_seq, sale_program_usage_id_seq TO ketoan_app;
  END IF;
END $$;
