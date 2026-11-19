-- [2026-11-18 Nguyễn Văn Thủy] Gom bảng về lõi, đợt 2: phiên bản chính sách mua về document_versions, bỏ purchase_policy_versions (đóng góp)
--
-- Phong bì mỗi bản (ngày áp, lý do, người phát hành, trạng thái) đã ở policy_registry (0079); bảng riêng chỉ còn giữ NỘI DUNG
-- bản → chuyển nội dung sang kho phiên bản chung document_versions (chỉ thêm, có băm):
--   doc_ref mua-hang.policy:<id chính sách>, version = số bản, snapshot = nội dung, content_hash giữ nguyên (khớp policy_registry).
-- Ngày áp / lý do đọc từ policy_registry (đã kiểm khớp từng bản trước khi bỏ). Thiếu dòng thì dừng.

DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('purchase_policy_versions') IS NULL THEN RETURN; END IF;
  INSERT INTO document_versions (tenant_id, doc_ref, version, snapshot, content_hash, created_by, created_at)
  SELECT v.tenant_id, 'mua-hang.policy:' || v.policy_id, v.version, v.snapshot, v.content_hash, COALESCE(NULLIF(v.created_by, ''), 'system'), v.created_at
    FROM purchase_policy_versions v
  ON CONFLICT (tenant_id, doc_ref, version) DO NOTHING;
  SELECT count(*) INTO n_src FROM purchase_policy_versions;
  SELECT count(*) INTO n_dst FROM purchase_policy_versions v
    JOIN document_versions d ON d.tenant_id = v.tenant_id AND d.doc_ref = 'mua-hang.policy:' || v.policy_id AND d.version = v.version AND d.content_hash = v.content_hash;
  IF n_dst < n_src THEN RAISE EXCEPTION '0158: chuyển purchase_policy_versions thiếu / lệch (% / %)', n_dst, n_src; END IF;
  DROP TABLE purchase_policy_versions;
  DROP FUNCTION IF EXISTS bizcity_purchase_policy_versions_guard();
END $$;
