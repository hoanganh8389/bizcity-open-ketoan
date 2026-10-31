-- [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.* (PHASES 2.7): phiên bản, liên kết, đính kèm chung cho mọi chứng từ (bizcity_document@1 §3, §7)
-- =============================================================================
-- 0045 Chứng từ dùng chung (Platform, gói đích packages/documents): bizcity_document@1.
--      Chứng từ được gọi bằng docRef = <module>.<loại>:<id> (vd hop-dong.contract:42); sự việc kế toán = ledger.event:<docKey>.
--      - document_versions     ảnh chụp mỗi phiên bản (STD-DOC-2): chỉ thêm, có băm nội dung.
--      - document_links        tham chiếu giữa chứng từ (lập từ, đảo, thay, thanh toán cho, đính vào, sự việc kế toán).
--      - document_attachments  tệp đính kèm chung (STD-DOC-7) thay bảng đính kèm riêng của từng phân hệ; nội dung tệp nằm
--                              trên ổ dữ liệu (DATA_DIR/attachments/<đơn vị>/…), CSDL giữ siêu dữ liệu + sha256. Không xoá
--                              cứng (STD-DATA-9): gỡ = archived_at.
--      Đánh số (documents.numbering) dùng bộ đếm document_sequences sẵn có của Kernel — không có bảng mới.
--      Cả ba bảng có RLS tenant_isolation như 0041.
-- =============================================================================

-- ── Phiên bản ────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE document_versions (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_ref      text   NOT NULL CHECK (doc_ref ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'),
  version      integer NOT NULL CHECK (version > 0),
  snapshot     jsonb  NOT NULL,
  content_hash text   NOT NULL,
  created_by   text   NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_ref, version)
);
COMMENT ON TABLE document_versions IS 'Ảnh chụp từng phiên bản chứng từ nghiệp vụ (bizcity_document@1 STD-DOC-2): chỉ thêm, không sửa / xoá. Nội dung trùng phiên bản trước thì không thêm.';
COMMENT ON COLUMN document_versions.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN document_versions.doc_ref IS 'Chứng từ: <module>.<loại>:<id> (vd hop-dong.contract:42).';
COMMENT ON COLUMN document_versions.version IS 'Số phiên bản, tăng từ 1 theo từng doc_ref.';
COMMENT ON COLUMN document_versions.snapshot IS 'Nội dung chứng từ tại phiên bản này (JSON do module gửi).';
COMMENT ON COLUMN document_versions.content_hash IS 'sha256 của nội dung đã chuẩn hoá (khoá sắp xếp) — so để biết nội dung có đổi.';
COMMENT ON COLUMN document_versions.created_by IS 'Người lưu phiên bản (actor của action).';
COMMENT ON COLUMN document_versions.created_at IS 'Thời điểm lưu.';

CREATE OR REPLACE FUNCTION forbid_document_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Phiên bản chứng từ chỉ được thêm (STD-DOC-2): không sửa, xoá document_versions.' USING ERRCODE = 'insufficient_privilege';
END $$;
COMMENT ON FUNCTION forbid_document_version_mutation() IS 'Trigger: document_versions chỉ thêm.';
CREATE TRIGGER document_versions_no_update BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION forbid_document_version_mutation();
CREATE TRIGGER document_versions_no_truncate BEFORE TRUNCATE ON document_versions FOR EACH STATEMENT EXECUTE FUNCTION forbid_document_version_mutation();

-- ── Liên kết ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE document_links (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_ref   text   NOT NULL CHECK (from_ref ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'),
  to_ref     text   NOT NULL CHECK (to_ref ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'),
  role       text   NOT NULL CHECK (role IN ('source', 'reverses', 'replaces', 'settles', 'attachesTo', 'ledger')),
  created_by text   NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_ref, to_ref, role),
  CHECK (from_ref <> to_ref)
);
CREATE INDEX document_links_to_idx ON document_links (tenant_id, to_ref);
COMMENT ON TABLE document_links IS 'Tham chiếu giữa chứng từ (bizcity_document@1 §3): from_ref --role--> to_ref. Gắn lặp cùng cặp + vai trò thì giữ một dòng.';
COMMENT ON COLUMN document_links.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN document_links.from_ref IS 'Chứng từ gốc của liên kết (docRef).';
COMMENT ON COLUMN document_links.to_ref IS 'Chứng từ được tham chiếu (docRef; sự việc kế toán: ledger.event:<docKey>).';
COMMENT ON COLUMN document_links.role IS 'source = lập từ, reverses = đảo, replaces = thay thế, settles = thanh toán cho, attachesTo = đính vào, ledger = sự việc kế toán sinh ra.';
COMMENT ON COLUMN document_links.created_by IS 'Người tạo liên kết.';
COMMENT ON COLUMN document_links.created_at IS 'Thời điểm tạo.';

-- ── Đính kèm ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE document_attachments (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_ref      text   NOT NULL CHECK (doc_ref ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'),
  kind         text   NOT NULL DEFAULT 'other' CHECK (kind ~ '^[a-z][a-z0-9-]{0,39}$'),
  file_name    text   NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  content_type text   NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   bigint NOT NULL CHECK (size_bytes > 0),
  sha256       text   NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text   NOT NULL,
  note         text   NOT NULL DEFAULT '',
  created_by   text   NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  archived_by  text
);
CREATE INDEX document_attachments_ref_idx ON document_attachments (tenant_id, doc_ref);
COMMENT ON TABLE document_attachments IS 'Tệp đính kèm chung của mọi chứng từ (bizcity_document@1 STD-DOC-7). Nội dung trên ổ dữ liệu, ở đây siêu dữ liệu + sha256; gỡ tệp = archived_at, không xoá cứng.';
COMMENT ON COLUMN document_attachments.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN document_attachments.doc_ref IS 'Chứng từ được đính kèm (docRef).';
COMMENT ON COLUMN document_attachments.kind IS 'Loại tệp do module đặt (vd contract-scan, invoice, quote); mặc định other.';
COMMENT ON COLUMN document_attachments.file_name IS 'Tên tệp gốc người gửi.';
COMMENT ON COLUMN document_attachments.content_type IS 'Kiểu MIME.';
COMMENT ON COLUMN document_attachments.size_bytes IS 'Kích thước (byte).';
COMMENT ON COLUMN document_attachments.sha256 IS 'Băm nội dung tệp — kiểm toàn vẹn khi tải về.';
COMMENT ON COLUMN document_attachments.storage_path IS 'Đường dẫn tương đối trong DATA_DIR/attachments/<đơn vị>/ — nội dung tệp không lưu trong CSDL.';
COMMENT ON COLUMN document_attachments.note IS 'Ghi chú.';
COMMENT ON COLUMN document_attachments.created_by IS 'Người gửi tệp.';
COMMENT ON COLUMN document_attachments.created_at IS 'Thời điểm gửi.';
COMMENT ON COLUMN document_attachments.archived_at IS 'Thời điểm gỡ tệp khỏi chứng từ; NULL = đang hiệu lực.';
COMMENT ON COLUMN document_attachments.archived_by IS 'Người gỡ tệp.';

-- ── Cô lập đơn vị (như 0041) ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_versions USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_links USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
ALTER TABLE document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_attachments USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032): ghi được, không TRUNCATE ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT ON document_versions TO ketoan_app;
    GRANT SELECT, INSERT, DELETE ON document_links TO ketoan_app;
    GRANT SELECT, INSERT, UPDATE ON document_attachments TO ketoan_app;
    GRANT USAGE ON SEQUENCE document_versions_id_seq, document_links_id_seq, document_attachments_id_seq TO ketoan_app;
  END IF;
END $$;
