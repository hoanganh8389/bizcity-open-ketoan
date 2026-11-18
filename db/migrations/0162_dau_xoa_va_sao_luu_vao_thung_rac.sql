-- [2026-11-18 Nguyễn Văn Thủy] Gom bảng về lõi, đợt 3: dấu xoá danh mục và ảnh chụp trước khi nạp dữ liệu gốc về catalog_trash (đóng góp)
--
-- catalog_trash là chỗ chung giữ "dòng đã bỏ đi": nay giữ thêm hai loại, phân biệt bằng cột catalog:
--   catalog_tombstones    → catalog = 'tombstone.<entity>' (product, unit, price, price_list, group), row_key = khoá đã xoá,
--                           payload { replacedByItemId } khi đổi / gộp mã. Luồng danh mục (catalog/feed) đọc theo deleted_at như cũ.
--   default_data_backups  → catalog = 'backup.default-data', row_key = bộ dữ liệu, payload { tables, rowCount, snapshot, result }.
-- Màn Thùng rác chỉ liệt kê theo đúng mã danh mục của nó nên không lẫn hai loại này. Chuyển đủ dòng rồi mới bỏ bảng.

CREATE INDEX IF NOT EXISTS catalog_trash_catalog_at_idx ON catalog_trash (tenant_id, catalog, deleted_at);

DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('catalog_tombstones') IS NULL THEN RETURN; END IF;
  INSERT INTO catalog_trash (tenant_id, catalog, row_key, label, payload, deleted_by, deleted_at)
  SELECT t.tenant_id, 'tombstone.' || t.entity, t.key, t.key,
         CASE WHEN t.replaced_by_item_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('replacedByItemId', t.replaced_by_item_id) END,
         'system', t.deleted_at
    FROM catalog_tombstones t;
  SELECT count(*) INTO n_src FROM catalog_tombstones;
  SELECT count(*) INTO n_dst FROM catalog_trash WHERE catalog LIKE 'tombstone.%';
  IF n_dst < n_src THEN RAISE EXCEPTION '0160: chuyển catalog_tombstones thiếu (% / %)', n_dst, n_src; END IF;
  DROP TABLE catalog_tombstones;
END $$;

DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('default_data_backups') IS NULL THEN RETURN; END IF;
  INSERT INTO catalog_trash (tenant_id, catalog, row_key, label, payload, deleted_by, deleted_at)
  SELECT b.tenant_id, 'backup.default-data', b.dataset_key, b.dataset_key,
         jsonb_build_object('tables', to_jsonb(b.tables), 'rowCount', b.row_count, 'snapshot', b.snapshot, 'result', b.result),
         b.created_by, b.created_at
    FROM default_data_backups b;
  SELECT count(*) INTO n_src FROM default_data_backups;
  SELECT count(*) INTO n_dst FROM catalog_trash WHERE catalog = 'backup.default-data';
  IF n_dst < n_src THEN RAISE EXCEPTION '0160: chuyển default_data_backups thiếu (% / %)', n_dst, n_src; END IF;
  DROP TABLE default_data_backups;
END $$;

-- ── Sửa hàm làm sạch danh mục mẫu (0124): còn ghi / xoá item_class_history đã bỏ ở 0157 ───────────────────────────────────
-- Lịch sử nhóm hàng nay ở document_versions (chỉ thêm): không xoá lịch sử nhóm bị bỏ; nhóm nạp từ dữ liệu gốc chưa có bản nào
-- thì thêm bản 1. Thay đúng hai câu lệnh trong thân hàm, không đổi phần còn lại; thay không được thì dừng.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('bizcity_reset_catalog_sample(bigint)'::regprocedure);
  IF position('item_class_history' IN d) = 0 THEN RETURN; END IF;
  n := replace(d,
    $a$  DELETE FROM item_class_history WHERE tenant_id = p_tenant AND kind = 'group' AND code NOT IN (SELECT code FROM _keep_grp);$a$,
    $b$  -- lịch sử nhóm bị bỏ giữ nguyên ở document_versions (chỉ thêm, 0160)$b$);
  n := replace(n,
    $a$  INSERT INTO item_class_history (tenant_id, kind, code, by_user, action, changes)
    SELECT p_tenant, 'group', code, 'Dữ liệu gốc', 'them', 'Nạp từ dữ liệu gốc'
      FROM item_classes g WHERE g.tenant_id = p_tenant AND g.kind = 'group' AND g.created_by = 'Dữ liệu gốc'
       AND NOT EXISTS (SELECT 1 FROM item_class_history h WHERE h.tenant_id = p_tenant AND h.kind = 'group' AND h.code = g.code);$a$,
    $b$  INSERT INTO document_versions (tenant_id, doc_ref, version, snapshot, content_hash, created_by)
    SELECT p_tenant, 'danh-muc.item_class:group:' || g.code, 1, jsonb_build_object('action', 'them', 'changes', 'Nạp từ dữ liệu gốc'),
           encode(sha256(convert_to('them|Nạp từ dữ liệu gốc|' || g.code, 'UTF8')), 'hex'), 'Dữ liệu gốc'
      FROM item_classes g WHERE g.tenant_id = p_tenant AND g.kind = 'group' AND g.created_by = 'Dữ liệu gốc'
       AND NOT EXISTS (SELECT 1 FROM document_versions h WHERE h.tenant_id = p_tenant AND h.doc_ref = 'danh-muc.item_class:group:' || g.code);$b$);
  IF position('item_class_history' IN n) > 0 THEN RAISE EXCEPTION '0160: chưa thay hết item_class_history trong bizcity_reset_catalog_sample'; END IF;
  EXECUTE n;
END $$;
