-- 0028 Cấu hình mẫu in theo đơn vị (màn Hệ thống → Mẫu in, HT05): bật / tắt mẫu, mẫu mặc định, chỉnh nội dung (tiêu đề, số liên, khổ,
--      chức danh ký, dòng căn cứ, ghi chú cuối) mà không sửa code. Bố cục mẫu vẫn nằm trong code (apps/web/src/components/print);
--      bảng chỉ lưu phần KHÁC mặc định. Áp theo thứ tự ưu tiên: người dùng → chi nhánh (shop) → chi nhánh cha → cả đơn vị.
CREATE TABLE IF NOT EXISTS print_template_settings (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_code text   NOT NULL CHECK (template_code ~ '^[A-Za-z0-9]+:[a-z0-9-]+$'),
  scope         text   NOT NULL CHECK (scope IN ('tenant', 'branch', 'user')),
  scope_ref     text   NOT NULL DEFAULT '',
  is_enabled    boolean NOT NULL DEFAULT true,
  is_default    boolean NOT NULL DEFAULT false,
  overrides     jsonb  NOT NULL DEFAULT '{}'::jsonb,
  updated_by    text   NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_template_settings_scope_ref CHECK ((scope = 'tenant') = (scope_ref = '')),
  CONSTRAINT print_template_settings_uniq UNIQUE (tenant_id, template_code, scope, scope_ref)
);
CREATE INDEX IF NOT EXISTS print_template_settings_scope_idx ON print_template_settings (tenant_id, scope, scope_ref);

COMMENT ON TABLE print_template_settings IS 'Cấu hình mẫu in theo đơn vị / chi nhánh / người dùng: chỉ lưu phần khác mặc định trong code. Mẫu nào không có dòng thì in như mặc định.';
COMMENT ON COLUMN print_template_settings.template_code IS 'Mã mẫu cố định = mã màn + ":" + mã mẫu, vd BH10:a5, ACC51:2lien, ACC89:s03a (danh mục ở apps/web/src/components/print/catalog.ts).';
COMMENT ON COLUMN print_template_settings.scope IS 'tenant = cả đơn vị; branch = một chi nhánh / shop (chi nhánh cha áp cho các shop con); user = riêng một người dùng.';
COMMENT ON COLUMN print_template_settings.scope_ref IS 'Mã chi nhánh (scope branch) hoặc id người dùng (scope user); rỗng khi scope tenant.';
COMMENT ON COLUMN print_template_settings.is_enabled IS 'false = ẩn mẫu này khỏi danh sách chọn mẫu của màn.';
COMMENT ON COLUMN print_template_settings.is_default IS 'Mẫu in khi bấm In (mỗi màn tối đa một mẫu mặc định trong cùng phạm vi).';
COMMENT ON COLUMN print_template_settings.overrides IS 'Phần chỉnh nội dung: title, copies, paper, signs [{title, note, name}], formNote, footer, showLogo. Trường không có = theo mẫu gốc.';
