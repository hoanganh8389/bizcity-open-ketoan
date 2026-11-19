-- [2026-11-19 10:40 AM Võ Hoàng] NT-BH-033 — sổ chứng từ chung ghi được từ trigger của module: bizcity_doc_put / bizcity_doc_link chạy SECURITY DEFINER, ghim search_path, kiểm đơn vị của phiên
--
-- Vấn đề (kiểm 19/11 trên CSDL thử): lúc chạy, module dùng vai trò mod_<key>_rw (packages/platform/src/db/module-db.ts, SET LOCAL ROLE).
-- Vai trò này gọi được bizcity_doc_put nhưng không có quyền đọc / ghi business_documents, document_versions, document_links; hàm chạy
-- quyền người gọi → trigger của module báo "permission denied for table document_versions" và huỷ cả giao dịch lưu đơn.
--
-- Sửa:
--   1. bizcity_doc_put, bizcity_doc_link: SECURITY DEFINER (chạy bằng quyền chủ hàm — giữ chủ hiện tại, vai trò lõi chạy migration,
--      có quyền ghi ba bảng trên), SET search_path = pg_catalog, public, pg_temp (pg_temp đặt cuối: người gọi không chen bảng tạm /
--      hàm giả qua search_path).
--      Hai hàm không gọi hàm phụ nào ghi bảng lõi; chữ ký, kiểu trả, cách ghi giữ nguyên như 0164 / 0158.
--   2. Kiểm đơn vị ngay trong hàm (bizcity_doc_assert_tenant): p_tenant phải bằng bizcity.tenant_id của phiên — đúng biến RLS lõi dùng
--      (bizcity_tenant_visible, 0041). Phiên CHƯA gắn đơn vị (migration lõi / migration module nạp lại dữ liệu cũ, việc nền, script
--      vận hành) thì cho qua — giống hệt RLS; phiên đã gắn mà khác → lỗi 42501, huỷ giao dịch. Vì chủ hàm có thể bỏ qua RLS, phép
--      kiểm này là chốt chặn ghi chéo đơn vị duy nhất trên đường ghi qua hàm.
--   3. Không cấp quyền bảng lõi cho vai trò module. EXECUTE: PUBLIC đã có sẵn từ lúc tạo hàm (vai trò module tạo về sau dùng được ngay,
--      không phải sửa trình cài module); cấp lại cho ketoan_app cho rõ.
-- Không đổi dữ liệu. Chạy lại nhiều lần được (CREATE OR REPLACE).

-- ── Kiểm đơn vị của phiên ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_assert_tenant(p_tenant bigint) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_session text := NULLIF(current_setting('bizcity.tenant_id', true), '');
BEGIN
  IF p_tenant IS NULL THEN
    RAISE EXCEPTION 'Sổ chứng từ chung: thiếu đơn vị' USING ERRCODE = '22004';
  END IF;
  IF v_session IS NOT NULL AND v_session::bigint <> p_tenant THEN
    RAISE EXCEPTION 'Sổ chứng từ chung: không ghi chứng từ của đơn vị % từ phiên của đơn vị %', p_tenant, v_session
      USING ERRCODE = '42501', HINT = 'Trigger / module chỉ ghi chứng từ của đơn vị đang gắn với kết nối (bizcity.tenant_id).';
  END IF;
END $$;
COMMENT ON FUNCTION bizcity_doc_assert_tenant(bigint) IS 'Sổ chứng từ chung (0167, NT-BH-033): p_tenant phải bằng bizcity.tenant_id của phiên (như RLS 0041). Phiên chưa gắn đơn vị (migration, nạp dữ liệu cũ, việc nền) thì cho qua; gắn mà khác → lỗi 42501.';

-- ── Ghi đầu phiếu + phiên bản (thân như 0164, thêm kiểm đơn vị) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_put(
  p_tenant bigint, p_ref text, p_module text, p_type text, p_no text, p_date date, p_branch text, p_partner text,
  p_title text, p_total numeric, p_status_raw text, p_status text, p_snapshot jsonb, p_meta jsonb, p_actor text,
  p_created timestamptz, p_updated timestamptz, p_approved_by text, p_approved_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_hash text := encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex');
  v_last record;
  v_ver integer;
BEGIN
  PERFORM bizcity_doc_assert_tenant(p_tenant);
  SELECT version, content_hash INTO v_last FROM document_versions
   WHERE tenant_id = p_tenant AND doc_ref = p_ref ORDER BY version DESC LIMIT 1;
  IF v_last IS NULL OR v_last.content_hash <> v_hash THEN
    v_ver := COALESCE(v_last.version, 0) + 1;
    INSERT INTO document_versions (tenant_id, doc_ref, version, snapshot, content_hash, created_by)
    VALUES (p_tenant, p_ref, v_ver, p_snapshot, v_hash, COALESCE(NULLIF(p_actor, ''), 'system'));
  ELSE
    v_ver := v_last.version;
  END IF;
  INSERT INTO business_documents AS b (tenant_id, doc_ref, module, doc_type, doc_no, doc_date, branch_code, partner_ref, title, total,
                                       status_raw, status, version, meta, created_by, created_at, updated_at, approved_by, approved_at)
  VALUES (p_tenant, p_ref, p_module, p_type, COALESCE(p_no, ''), p_date, COALESCE(p_branch, ''), COALESCE(p_partner, ''), COALESCE(p_title, ''),
          COALESCE(p_total, 0), p_status_raw, p_status, v_ver, COALESCE(p_meta, '{}'::jsonb), COALESCE(p_actor, ''),
          COALESCE(p_created, now()), COALESCE(p_updated, p_created, now()), COALESCE(p_approved_by, ''), p_approved_at)
  ON CONFLICT (tenant_id, doc_ref) DO UPDATE SET
    doc_type = EXCLUDED.doc_type, doc_no = EXCLUDED.doc_no, doc_date = EXCLUDED.doc_date, branch_code = EXCLUDED.branch_code,
    partner_ref = EXCLUDED.partner_ref, title = EXCLUDED.title, total = EXCLUDED.total, status_raw = EXCLUDED.status_raw,
    status = EXCLUDED.status, version = EXCLUDED.version, meta = EXCLUDED.meta, created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at
  WHERE (b.doc_type, b.doc_no, b.doc_date, b.branch_code, b.partner_ref, b.title, b.total, b.status_raw, b.status, b.version, b.meta,
         b.created_by, b.created_at, b.updated_at, b.approved_by, b.approved_at)
        IS DISTINCT FROM (EXCLUDED.doc_type, EXCLUDED.doc_no, EXCLUDED.doc_date, EXCLUDED.branch_code, EXCLUDED.partner_ref, EXCLUDED.title,
                          EXCLUDED.total, EXCLUDED.status_raw, EXCLUDED.status, EXCLUDED.version, EXCLUDED.meta, EXCLUDED.created_by,
                          EXCLUDED.created_at, EXCLUDED.updated_at, EXCLUDED.approved_by, EXCLUDED.approved_at);
END $$;
COMMENT ON FUNCTION bizcity_doc_put(bigint, text, text, text, text, date, text, text, text, numeric, text, text, jsonb, jsonb, text, timestamptz, timestamptz, text, timestamptz)
  IS 'Ghi đầu phiếu vào business_documents (kèm người duyệt, 0162) + ảnh chụp document_versions khi nội dung đổi. 0167 (NT-BH-033): SECURITY DEFINER + search_path ghim để trigger của module (vai trò mod_<key>_rw, không có quyền bảng lõi) ghi được; p_tenant phải bằng bizcity.tenant_id của phiên (phiên chưa gắn đơn vị — migration, nạp dữ liệu cũ — thì cho qua như RLS).';

-- ── Gắn liên kết (thân như 0158, thêm kiểm đơn vị) ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_link(p_tenant bigint, p_from text, p_to text, p_role text, p_actor text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM bizcity_doc_assert_tenant(p_tenant);
  INSERT INTO document_links (tenant_id, from_ref, to_ref, role, created_by)
  SELECT p_tenant, p_from, p_to, p_role, COALESCE(NULLIF(p_actor, ''), 'system')
   WHERE p_to IS NOT NULL AND p_to <> p_from AND p_to ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:[^\s]{1,200}$'
  ON CONFLICT (tenant_id, from_ref, to_ref, role) DO NOTHING;
END $$;
COMMENT ON FUNCTION bizcity_doc_link(bigint, text, text, text, text) IS 'Gắn liên kết chứng từ, bỏ qua nếu đích rỗng / sai dạng / đã có (0156). 0167 (NT-BH-033): SECURITY DEFINER + search_path ghim để trigger của module ghi được; p_tenant phải bằng bizcity.tenant_id của phiên (chưa gắn thì cho qua như RLS).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT EXECUTE ON FUNCTION bizcity_doc_assert_tenant(bigint) TO ketoan_app;
    GRANT EXECUTE ON FUNCTION bizcity_doc_put(bigint, text, text, text, text, date, text, text, text, numeric, text, text, jsonb, jsonb, text, timestamptz, timestamptz, text, timestamptz) TO ketoan_app;
    GRANT EXECUTE ON FUNCTION bizcity_doc_link(bigint, text, text, text, text) TO ketoan_app;
  END IF;
END $$;
