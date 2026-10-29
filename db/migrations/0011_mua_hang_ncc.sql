-- =============================================================================
-- 0011 Mua hàng — hồ sơ nhà cung cấp: người tạo chính sách, tệp đính kèm (hợp đồng, CO, CQ, báo giá, chứng từ)
-- =============================================================================

-- Chính sách: ai tạo (updated_by đã có). Dữ liệu cũ lấy người sửa gần nhất làm người tạo.
ALTER TABLE purchase_policies ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '';
UPDATE purchase_policies SET created_by = updated_by WHERE created_by = '';

-- Tệp đính kèm: nội dung tệp lưu trên ổ dữ liệu của ERP (<DATA_DIR>/dinh-kem/<tenant>/…), bảng chỉ giữ thông tin.
-- owner_type: partner (hồ sơ NCC) · document (chứng từ mua hàng) · policy (chính sách / hợp đồng).
CREATE TABLE IF NOT EXISTS purchase_attachments (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type  text   NOT NULL CHECK (owner_type IN ('partner', 'document', 'policy')),
  owner_id    text   NOT NULL,
  kind        text   NOT NULL DEFAULT 'khac',
  file_name   text   NOT NULL,
  mime        text   NOT NULL DEFAULT 'application/octet-stream',
  size        bigint NOT NULL DEFAULT 0,
  path        text   NOT NULL,
  note        text   NOT NULL DEFAULT '',
  uploaded_by text   NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_attachments_owner_idx ON purchase_attachments (tenant_id, owner_type, owner_id);

COMMENT ON TABLE purchase_attachments IS 'Tệp đính kèm phân hệ Mua hàng (hợp đồng, CO, CQ, báo giá, chứng từ số 10/11…); nội dung tệp nằm trên ổ dữ liệu ERP.';
