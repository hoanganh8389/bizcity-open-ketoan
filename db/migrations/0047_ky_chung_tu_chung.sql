-- [2026-11-01 03:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.signatures (PHASES 2.7): ký theo vai trên mọi chứng từ (doc_ref), không chỉ phiếu kế toán
-- =============================================================================
-- 0047 Ký theo vai trên mọi chứng từ (năng lực documents.signatures, bizcity_document@1 STD-DOC-8, §8).
--      document_signatures trước chỉ gắn sự việc kế toán (event_id). Thêm doc_ref (<module>.<loại>:<id>): mỗi dòng gắn ĐÚNG MỘT
--      trong hai. Phiếu kế toán giữ nguyên 4 vai (người lập, thủ quỹ, kế toán trưởng, giám đốc) và luồng ký cũ; chứng từ của
--      module đặt vai riêng (chữ thường, số, gạch dưới — vd preparer, legal, customer), module quyết ai ký được vai nào trong
--      action của mình. Chữ ký gắn phiên bản lúc ký (document_versions); phiên bản mới thì chữ ký cũ hết hiệu lực, vẫn lưu.
--      Mỗi (chứng từ, vai, phiên bản) tối đa một chữ ký còn hiệu lực — như phiếu kế toán.
-- =============================================================================

ALTER TABLE document_signatures ADD COLUMN doc_ref text CHECK (doc_ref ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$');
ALTER TABLE document_signatures ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE document_signatures ADD CONSTRAINT document_signatures_target_check CHECK ((event_id IS NULL) <> (doc_ref IS NULL));

-- Vai: phiếu kế toán giữ 4 vai cũ; chứng từ module đặt vai theo khuôn tên.
ALTER TABLE document_signatures DROP CONSTRAINT document_signatures_role_check;
ALTER TABLE document_signatures ADD CONSTRAINT document_signatures_role_check CHECK (
  role ~ '^[a-z][a-z0-9_]{1,39}$'
  AND (event_id IS NULL OR role IN ('preparer', 'cashier', 'chief_accountant', 'director'))
);

CREATE UNIQUE INDEX document_signatures_ref_active ON document_signatures (tenant_id, doc_ref, role, version) WHERE revoked_at IS NULL AND doc_ref IS NOT NULL;
CREATE INDEX document_signatures_ref ON document_signatures (tenant_id, doc_ref) WHERE doc_ref IS NOT NULL;

COMMENT ON TABLE document_signatures IS 'Ký xác nhận theo vai, gắn phiên bản lúc ký: phiếu kế toán (event_id; người lập, thủ quỹ, kế toán trưởng, giám đốc) hoặc chứng từ của module (doc_ref; vai do module đặt). Phiên bản mới thì chữ ký cũ hết hiệu lực nhưng vẫn lưu; huỷ chữ ký = revoked_at.';
COMMENT ON COLUMN document_signatures.event_id IS 'Phiếu kế toán được ký (accounting_events.id); NULL khi ký chứng từ của module (doc_ref).';
COMMENT ON COLUMN document_signatures.doc_ref IS 'Chứng từ của module được ký (<module>.<loại>:<id>); NULL khi ký phiếu kế toán (event_id). Đúng một trong hai có giá trị.';
COMMENT ON COLUMN document_signatures.role IS 'Vai ký. Phiếu kế toán: preparer / cashier / chief_accountant / director. Chứng từ module: vai do module đặt (chữ thường, số, gạch dưới).';
COMMENT ON COLUMN document_signatures.version IS 'Phiên bản chứng từ lúc ký (phiếu kế toán: accounting_events.version; chứng từ module: document_versions.version, chưa lưu phiên bản nào = 1).';
