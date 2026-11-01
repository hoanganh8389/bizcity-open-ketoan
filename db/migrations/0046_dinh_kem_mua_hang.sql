-- [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — 2.7 / A-19: đính kèm Mua hàng chuyển sang document_attachments chung; purchase_attachments giữ làm bản đối chiếu, khoá ghi
-- =============================================================================
-- 0046 Đính kèm Mua hàng → đính kèm chung (bizcity_document@1 STD-DOC-7, PHASES 2.7, audit A-19).
--      Chép SIÊU DỮ LIỆU từ purchase_attachments sang document_attachments, docRef = mua-hang.<loại chủ>:<mã chủ>
--      (partner / document / policy / invoice). Nội dung tệp KHÔNG chép: dòng mới trỏ đúng tệp cũ trên ổ
--      (storage_root = 'dinh-kem' → DATA_DIR/dinh-kem/<đơn vị>/<path>), nên không có khoảng hở dữ liệu, không cần
--      script chép tệp. sha256 của tệp cũ chưa biết (CSDL không đọc được ổ): để NULL, máy chủ băm và điền ở lần tải đầu.
--      legacy_ref = 'purchase_attachments:<id>' để đối chiếu từng dòng.
--      purchase_attachments KHÔNG xoá dòng nào; từ nay chặn thêm / sửa (ứng dụng ghi vào document_attachments) — bảng
--      chỉ còn để đối chiếu, bỏ hẳn ở một bản phát hành sau khi chủ dự án xác nhận.
--      Loại tệp của Mua hàng dùng gạch dưới (hop_dong, chung_tu_10…): nới ràng buộc kind cho phép '_'.
-- =============================================================================

ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_kind_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_kind_check CHECK (kind ~ '^[a-z][a-z0-9_-]{0,39}$');
COMMENT ON COLUMN document_attachments.kind IS 'Loại tệp do module đặt: chữ thường, số, gạch ngang / gạch dưới (vd contract-scan, hop_dong); mặc định other.';

ALTER TABLE document_attachments ADD COLUMN storage_root text NOT NULL DEFAULT 'attachments' CHECK (storage_root IN ('attachments', 'dinh-kem'));
COMMENT ON COLUMN document_attachments.storage_root IS 'Thư mục gốc trong DATA_DIR: attachments (tệp gửi từ 0045) hoặc dinh-kem (tệp Mua hàng gửi trước 0046, giữ nguyên chỗ).';

ALTER TABLE document_attachments ALTER COLUMN sha256 DROP NOT NULL;
COMMENT ON COLUMN document_attachments.sha256 IS 'Băm nội dung tệp — kiểm toàn vẹn khi tải về. NULL chỉ ở dòng chuyển từ purchase_attachments (0046) chưa tải lần nào; lần tải đầu máy chủ băm và điền.';

ALTER TABLE document_attachments ADD COLUMN legacy_ref text UNIQUE;
COMMENT ON COLUMN document_attachments.legacy_ref IS 'Dòng gốc trước khi dùng đính kèm chung (vd purchase_attachments:12) — đối chiếu khi chuyển dữ liệu; NULL với tệp gửi mới.';

INSERT INTO document_attachments (tenant_id, doc_ref, kind, file_name, content_type, size_bytes, sha256, storage_root, storage_path, note, created_by, created_at, legacy_ref)
SELECT p.tenant_id,
       'mua-hang.' || p.owner_type || ':' || left(regexp_replace(p.owner_id, '\s+', '_', 'g'), 200),
       CASE WHEN p.kind ~ '^[a-z][a-z0-9_-]{0,39}$' THEN p.kind ELSE 'khac' END,
       left(p.file_name, 200),
       COALESCE(NULLIF(p.mime, ''), 'application/octet-stream'),
       p.size, NULL, 'dinh-kem', p.path, p.note, p.uploaded_by, p.created_at,
       'purchase_attachments:' || p.id
  FROM purchase_attachments p
 WHERE p.size > 0 AND length(p.file_name) > 0
ON CONFLICT (legacy_ref) DO NOTHING;

DO $$
DECLARE skipped bigint;
BEGIN
  SELECT count(*) INTO skipped FROM purchase_attachments WHERE size <= 0 OR length(file_name) = 0;
  IF skipped > 0 THEN
    RAISE NOTICE '0046: % dòng purchase_attachments rỗng (size = 0 hoặc không tên tệp) không chuyển — vẫn còn ở bảng cũ để đối chiếu', skipped;
  END IF;
END $$;

COMMENT ON TABLE purchase_attachments IS 'ĐÃ CHUYỂN (0046) sang document_attachments (docRef mua-hang.<loại chủ>:<mã>, legacy_ref purchase_attachments:<id>). Giữ để đối chiếu, chặn thêm / sửa; nội dung tệp vẫn ở DATA_DIR/dinh-kem và được document_attachments trỏ tới.';

CREATE OR REPLACE FUNCTION forbid_purchase_attachments_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'purchase_attachments đã chuyển sang document_attachments (0046): gửi tệp qua /api/v1/purchase/attachments hoặc ctx.documents.attach' USING ERRCODE = 'insufficient_privilege';
END $$;
COMMENT ON FUNCTION forbid_purchase_attachments_write() IS 'Trigger: chặn thêm / sửa purchase_attachments sau khi chuyển sang đính kèm chung (0046).';
CREATE TRIGGER purchase_attachments_frozen BEFORE INSERT OR UPDATE ON purchase_attachments FOR EACH ROW EXECUTE FUNCTION forbid_purchase_attachments_write();
