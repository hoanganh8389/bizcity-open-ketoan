-- [2026-11-18 Nguyễn Văn Thủy] Gom bảng về khung chung của lõi, đợt 1: bỏ 4 bảng riêng (đóng góp)
--
-- Hệ thống đi từ lõi: lịch sử / phiên bản dùng document_versions, bản lưu dữ liệu bỏ đi dùng catalog_trash, đính kèm dùng
-- document_attachments. Bảng riêng làm cùng việc thì chuyển dữ liệu sang rồi bỏ:
--   item_class_history     → document_versions  doc_ref danh-muc.item_class:<loại>:<mã>, snapshot { action, changes }
--   closing_rule_versions  → document_versions  doc_ref ket-chuyen.rules:mau, snapshot { rules, note, createdByName }
--   accounts_name_en_luu   → catalog_trash       catalog accounts.name_en, row_key = mã tài khoản, payload { name_en, archived_at }
--   purchase_attachments   → (đã chuyển hết sang document_attachments ở 0046, legacy_ref đối chiếu từng dòng) bỏ bảng
-- Chuyển xong mới bỏ; số dòng không khớp thì dừng (RAISE) để không mất dữ liệu.

-- ── item_class_history → document_versions ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('item_class_history') IS NULL THEN RETURN; END IF;
  INSERT INTO document_versions (tenant_id, doc_ref, version, snapshot, content_hash, created_by, created_at)
  SELECT h.tenant_id, 'danh-muc.item_class:' || h.kind || ':' || h.code,
         row_number() OVER (PARTITION BY h.tenant_id, h.kind, h.code ORDER BY h.at, h.id)
           + COALESCE((SELECT max(v.version) FROM document_versions v WHERE v.tenant_id = h.tenant_id AND v.doc_ref = 'danh-muc.item_class:' || h.kind || ':' || h.code), 0),
         jsonb_build_object('action', h.action, 'changes', h.changes),
         encode(sha256(convert_to(jsonb_build_object('action', h.action, 'changes', h.changes, 'at', h.at)::text, 'UTF8')), 'hex'),
         COALESCE(NULLIF(h.by_user, ''), 'system'), h.at
    FROM item_class_history h;
  SELECT count(*) INTO n_src FROM item_class_history;
  SELECT count(*) INTO n_dst FROM document_versions WHERE doc_ref LIKE 'danh-muc.item\_class:%';
  IF n_dst < n_src THEN RAISE EXCEPTION '0157: chuyển item_class_history thiếu dòng (% / %)', n_dst, n_src; END IF;
  DROP TABLE item_class_history;
END $$;

-- ── closing_rule_versions → document_versions ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('closing_rule_versions') IS NULL THEN RETURN; END IF;
  INSERT INTO document_versions (tenant_id, doc_ref, version, snapshot, content_hash, created_by, created_at)
  SELECT c.tenant_id, 'ket-chuyen.rules:mau', c.version,
         jsonb_build_object('rules', c.rules, 'note', c.note, 'createdByName', c.created_by_name),
         encode(sha256(convert_to(c.rules::text, 'UTF8')), 'hex'), COALESCE(NULLIF(c.created_by, ''), 'system'), c.created_at
    FROM closing_rule_versions c
  ON CONFLICT (tenant_id, doc_ref, version) DO NOTHING;
  SELECT count(*) INTO n_src FROM closing_rule_versions;
  SELECT count(*) INTO n_dst FROM document_versions WHERE doc_ref = 'ket-chuyen.rules:mau';
  IF n_dst < n_src THEN RAISE EXCEPTION '0157: chuyển closing_rule_versions thiếu dòng (% / %)', n_dst, n_src; END IF;
  DROP TABLE closing_rule_versions;
END $$;

-- ── accounts_name_en_luu → catalog_trash ──────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('accounts_name_en_luu') IS NULL THEN RETURN; END IF;
  INSERT INTO catalog_trash (tenant_id, catalog, row_key, label, payload, deleted_by, deleted_at)
  SELECT l.tenant_id, 'accounts.name_en', l.code, l.name_en, jsonb_build_object('code', l.code, 'name_en', l.name_en), 'migration 0147', COALESCE(l.archived_at, now())
    FROM accounts_name_en_luu l
   WHERE NOT EXISTS (SELECT 1 FROM catalog_trash t WHERE t.tenant_id = l.tenant_id AND t.catalog = 'accounts.name_en' AND t.row_key = l.code);
  SELECT count(*) INTO n_src FROM accounts_name_en_luu;
  SELECT count(*) INTO n_dst FROM catalog_trash WHERE catalog = 'accounts.name_en';
  IF n_dst < n_src THEN RAISE EXCEPTION '0157: chuyển accounts_name_en_luu thiếu dòng (% / %)', n_dst, n_src; END IF;
  DROP TABLE accounts_name_en_luu;
END $$;

-- ── purchase_attachments: dữ liệu đã ở document_attachments (0046) ────────────────────────────────────────────────────────
DO $$
DECLARE n_left bigint;
BEGIN
  IF to_regclass('purchase_attachments') IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO n_left FROM purchase_attachments p
   WHERE p.size > 0 AND length(p.file_name) > 0
     AND NOT EXISTS (SELECT 1 FROM document_attachments d WHERE d.tenant_id = p.tenant_id AND d.legacy_ref = 'purchase_attachments:' || p.id);
  IF n_left > 0 THEN RAISE EXCEPTION '0157: còn % tệp purchase_attachments chưa có ở document_attachments — không bỏ bảng', n_left; END IF;
  DROP TABLE purchase_attachments;
  DROP FUNCTION IF EXISTS forbid_purchase_attachments_write();
END $$;
