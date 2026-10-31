-- [2026-10-31 11:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — data.read-views (PHASES 2.4): khung nhìn chỉ đọc danh mục chuẩn trong bizcity_read
-- =============================================================================
-- 0044 Danh mục chuẩn đọc qua bizcity_read (năng lực data.read-views, PHASES 2.4; BIZCITY-DATA §3, §8).
--      Module đọc khách hàng / nhà cung cấp, mặt hàng, chi nhánh, kho, đơn vị tính, mã thuế, phương thức thanh toán,
--      mã phân tích qua các khung nhìn này (JOIN theo MÃ, STD-DATA-6), không đọc bảng lõi; ghi thì gọi action của chủ
--      (core.partner.upsert…). Phase 3.10: vai trò CSDL của module chỉ SELECT trên bizcity_read.
--      Cùng khuôn 0043:
--      - security_invoker: chính sách RLS tenant_isolation của bảng gốc vẫn áp (0041).
--      - Chỉ đọc: trigger INSTEAD OF bizcity_read.reject_write() chặn INSERT / UPDATE / DELETE.
--      - Theo mã, không theo id: quan hệ (chi nhánh của kho, chi nhánh cha) trả mã.
--      - Không đưa ra thuộc tính hạch toán của Kernel (nhóm hạch toán, tài khoản, nhóm giá vốn) — module không viết số
--        tài khoản (AGENTS.md câu 4) — và dữ liệu cá nhân không cần cho nghiệp vụ chung (số tài khoản ngân hàng, ngày
--        sinh, giới tính). Liên hệ (điện thoại, email) có, đánh dấu PII ở chú thích cột (STD-DATA-10).
--      Cột mới của bảng gốc KHÔNG tự hiện ở đây: thêm bằng migration mới (CREATE OR REPLACE VIEW, chỉ thêm cột ở cuối).
-- =============================================================================

-- ── Đối tượng (khách hàng, nhà cung cấp, nhân viên…) ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.partners WITH (security_invoker = true) AS
SELECT tenant_id, code, name, short_name, kind, also_kinds, customer_type, is_prospect, group_code, tax_code,
       company_name, company_address, address, contact_name, position, phone, mobile, email, website,
       payment_term_days, credit_limit, manager_code, branch_code, is_active, note, created_at, updated_at
  FROM public.partners;

COMMENT ON VIEW bizcity_read.partners IS 'Danh mục đối tượng (chỉ đọc). Module lưu partner_code, đọc tên / liên hệ ở đây; tạo, sửa qua action core.partner.upsert. Không có tài khoản ngân hàng, ngày sinh, giới tính.';
COMMENT ON COLUMN bizcity_read.partners.code IS 'Mã đối tượng, duy nhất trong đơn vị — khoá để module tham chiếu.';
COMMENT ON COLUMN bizcity_read.partners.kind IS 'Loại chính: customer / supplier / employee / internal / other.';
COMMENT ON COLUMN bizcity_read.partners.also_kinds IS 'Các loại phụ (vừa là khách vừa là nhà cung cấp…).';
COMMENT ON COLUMN bizcity_read.partners.is_prospect IS 'true = khách tiềm năng, chưa phát sinh giao dịch.';
COMMENT ON COLUMN bizcity_read.partners.group_code IS 'Nhóm đối tượng (partner_groups.code).';
COMMENT ON COLUMN bizcity_read.partners.tax_code IS 'Mã số thuế.';
COMMENT ON COLUMN bizcity_read.partners.phone IS 'Điện thoại — dữ liệu cá nhân (PII, STD-DATA-10).';
COMMENT ON COLUMN bizcity_read.partners.mobile IS 'Di động — dữ liệu cá nhân (PII, STD-DATA-10).';
COMMENT ON COLUMN bizcity_read.partners.email IS 'Email — dữ liệu cá nhân (PII, STD-DATA-10).';
COMMENT ON COLUMN bizcity_read.partners.payment_term_days IS 'Hạn thanh toán mặc định (ngày).';
COMMENT ON COLUMN bizcity_read.partners.credit_limit IS 'Hạn mức nợ, numeric(18,2).';
COMMENT ON COLUMN bizcity_read.partners.manager_code IS 'Mã nhân viên phụ trách.';
COMMENT ON COLUMN bizcity_read.partners.branch_code IS 'Chi nhánh quản lý đối tượng.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.partners
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Mặt hàng ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.products WITH (security_invoker = true) AS
SELECT tenant_id, sku, parent_sku, name, unit, barcode, group_code, type_code, brand_code, industry_code,
       tax_out_code, tax_in_code, is_active, no_sale, track_identifier, description, image_url, weight_kg, origin, updated_at
  FROM public.products;

COMMENT ON VIEW bizcity_read.products IS 'Danh mục mặt hàng (chỉ đọc). Module lưu sku (SKU_RULE). Không có nhóm hạch toán (thuộc Kernel).';
COMMENT ON COLUMN bizcity_read.products.sku IS 'Mã hàng theo SKU_RULE, duy nhất trong đơn vị — khoá để module tham chiếu.';
COMMENT ON COLUMN bizcity_read.products.parent_sku IS 'Mã hàng cha (họ mã một cấp).';
COMMENT ON COLUMN bizcity_read.products.unit IS 'Đơn vị tính chính.';
COMMENT ON COLUMN bizcity_read.products.tax_out_code IS 'Mã thuế GTGT đầu ra mặc định (tax_codes.code).';
COMMENT ON COLUMN bizcity_read.products.tax_in_code IS 'Mã thuế GTGT đầu vào mặc định (tax_codes.code).';
COMMENT ON COLUMN bizcity_read.products.no_sale IS 'true = không bán (vật tư, hàng nội bộ).';
COMMENT ON COLUMN bizcity_read.products.track_identifier IS 'true = theo dõi số serial / lô.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.products
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Chi nhánh / cửa hàng ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.branches WITH (security_invoker = true) AS
SELECT b.tenant_id, b.code, b.name, b.level, p.code AS parent_code, b.department_code, b.address, b.company_name,
       b.tax_code, b.phone, b.is_active, b.note, b.created_at
  FROM public.branches b
  LEFT JOIN public.branches p ON p.id = b.parent_id;

COMMENT ON VIEW bizcity_read.branches IS 'Danh mục chi nhánh / cửa hàng (chỉ đọc). Module lưu branch_code. Không có đơn vị tính giá vốn (thuộc Kernel).';
COMMENT ON COLUMN bizcity_read.branches.code IS 'Mã chi nhánh, duy nhất trong đơn vị.';
COMMENT ON COLUMN bizcity_read.branches.level IS 'branch = chi nhánh (kho tổng), shop = cửa hàng con, rỗng = chưa xếp.';
COMMENT ON COLUMN bizcity_read.branches.parent_code IS 'Mã chi nhánh cha của cửa hàng.';
COMMENT ON COLUMN bizcity_read.branches.department_code IS 'Mã bộ phận (dimensions kind department) gắn với chi nhánh.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.branches
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Kho ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.warehouses WITH (security_invoker = true) AS
SELECT w.tenant_id, w.code, w.name, b.code AS branch_code, w.address, w.is_active, w.is_default, w.is_promo, w.note,
       w.created_at, w.updated_at
  FROM public.warehouses w
  JOIN public.branches b ON b.id = w.branch_id;

COMMENT ON VIEW bizcity_read.warehouses IS 'Danh mục kho (chỉ đọc). Không có tài khoản kho (thuộc Kernel).';
COMMENT ON COLUMN bizcity_read.warehouses.code IS 'Mã kho, duy nhất trong đơn vị.';
COMMENT ON COLUMN bizcity_read.warehouses.branch_code IS 'Chi nhánh của kho.';
COMMENT ON COLUMN bizcity_read.warehouses.is_default IS 'true = kho mặc định của chi nhánh.';
COMMENT ON COLUMN bizcity_read.warehouses.is_promo IS 'true = kho hàng khuyến mại.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.warehouses
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Đơn vị tính ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.unit_names WITH (security_invoker = true) AS
SELECT tenant_id, name, is_active, note
  FROM public.unit_names;

COMMENT ON VIEW bizcity_read.unit_names IS 'Danh mục tên đơn vị tính chuẩn hoá (chỉ đọc).';
COMMENT ON COLUMN bizcity_read.unit_names.name IS 'Tên đơn vị tính (khoá, duy nhất trong đơn vị).';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.unit_names
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Mã thuế ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.tax_codes WITH (security_invoker = true) AS
SELECT tenant_id, code, name, rate, direction, report_group, is_active
  FROM public.tax_codes;

COMMENT ON VIEW bizcity_read.tax_codes IS 'Danh mục mã thuế (chỉ đọc). Không có tài khoản thuế (thuộc Kernel).';
COMMENT ON COLUMN bizcity_read.tax_codes.code IS 'Mã thuế (vd R08, R10, KCT).';
COMMENT ON COLUMN bizcity_read.tax_codes.rate IS 'Thuế suất (%).';
COMMENT ON COLUMN bizcity_read.tax_codes.direction IS 'Chiều: output (đầu ra) / input (đầu vào).';
COMMENT ON COLUMN bizcity_read.tax_codes.report_group IS 'Nhóm chỉ tiêu trên tờ khai.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.tax_codes
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Phương thức thanh toán ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.payment_methods WITH (security_invoker = true) AS
SELECT tenant_id, code, name, is_receivable, bank_account_code, partner_code, discount_rate, sort_order, is_active, note
  FROM public.payment_methods;

COMMENT ON VIEW bizcity_read.payment_methods IS 'Danh mục phương thức thanh toán (chỉ đọc). Module gửi methodCode khi nộp chứng từ; không có tài khoản hạch toán (thuộc Kernel).';
COMMENT ON COLUMN bizcity_read.payment_methods.code IS 'Mã phương thức (vd TM tiền mặt, CK chuyển khoản).';
COMMENT ON COLUMN bizcity_read.payment_methods.is_receivable IS 'true = tiền chưa về (ví, cổng thanh toán): ghi nhận phải thu đối tác.';
COMMENT ON COLUMN bizcity_read.payment_methods.bank_account_code IS 'Mã tài khoản ngân hàng của đơn vị (bank_accounts.code) nhận tiền.';
COMMENT ON COLUMN bizcity_read.payment_methods.partner_code IS 'Đối tác thu hộ (ví, cổng thanh toán).';
COMMENT ON COLUMN bizcity_read.payment_methods.discount_rate IS 'Phí / chiết khấu của đối tác thu hộ (%).';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.payment_methods
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Mã phân tích (hợp đồng, dự án, bộ phận, khoản mục…) ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.dimensions WITH (security_invoker = true) AS
SELECT tenant_id, kind, code, name, parent_code, is_active, note
  FROM public.dimensions;

COMMENT ON VIEW bizcity_read.dimensions IS 'Mã phân tích (chỉ đọc): chiều gắn trên dòng sổ (ledger_lines.dims). Đọc số liệu theo mã: ctx.ledger.query({ dimension }).';
COMMENT ON COLUMN bizcity_read.dimensions.kind IS 'Loại chiều: contract, project, department, cost_item, employee, case, capital_source…';
COMMENT ON COLUMN bizcity_read.dimensions.code IS 'Mã giá trị, duy nhất theo (đơn vị, loại).';
COMMENT ON COLUMN bizcity_read.dimensions.parent_code IS 'Mã cha cùng loại (cây phân cấp).';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.dimensions
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Quyền: vai trò API (0032) chỉ được SELECT (0043 đã đặt mặc định cho bảng mới của schema; cấp lại cho chắc) ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA bizcity_read TO ketoan_app;
  END IF;
END $$;
