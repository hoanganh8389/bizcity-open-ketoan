-- [2026-11-11 Nguyễn Văn Thủy] 0103 Hồ sơ in (màn HT16 Báo cáo, chứng từ) (đóng góp)
-- Thông tin đơn vị in trên báo cáo / chứng từ, hiện / ẩn từng phần, ngày ký, người ký (chức danh, tiêu đề, tên).
-- Một dòng cả đơn vị (branch_code '') + tuỳ chọn một dòng mỗi chi nhánh ghi đè. Chỉ lưu phần khác mặc định;
-- cấu trúc và mặc định khai ở packages/contracts/src/print-profile.ts (printProfileSchema, PRINT_PROFILE_DEFAULT).
CREATE TABLE IF NOT EXISTS print_profiles (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_code  text   NOT NULL DEFAULT '',
  profile      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  updated_by   text   NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_profiles_uniq UNIQUE (tenant_id, branch_code)
);

COMMENT ON TABLE print_profiles IS 'Hồ sơ in theo đơn vị / chi nhánh: thông tin đơn vị trên bản in, hiện / ẩn, ngày ký, người ký. Không có dòng = in theo mặc định (Thông tin đơn vị HT03).';
COMMENT ON COLUMN print_profiles.id IS 'Định danh dòng.';
COMMENT ON COLUMN print_profiles.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN print_profiles.branch_code IS 'Mã chi nhánh ghi đè; chuỗi rỗng = áp cả đơn vị.';
COMMENT ON COLUMN print_profiles.profile IS 'Phần khác mặc định: company {reportName, address, taxCode, phone, email, website, bankAccount}, show {nameAddress, taxCode, phone, email, website, bankAccount, logo, align, repeatOnPages, branchLine}, signDate {reportPeriodEnd, voucherDate}, signers [{role, title, name}].';
COMMENT ON COLUMN print_profiles.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN print_profiles.updated_at IS 'Lúc sửa gần nhất.';
