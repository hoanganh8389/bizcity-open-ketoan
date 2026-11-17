-- [2026-11-17 10:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-19 / D023-9: bỏ accounts.name_en, chép giá trị khác rỗng sang accounts_name_en_luu rồi xoá cột
-- [2026-11-17 10:20 AM kiennt] NT-DM-001 — bỏ tên tiếng Anh của tài khoản (D023-9, PHASE-023 00 §9): chép accounts.name_en sang bảng lưu rồi xoá cột (đóng góp)
-- =============================================================================
-- 0147 Bỏ tên tiếng Anh của tài khoản.
--      accounts.name_en (ô "Tên tài khoản theo ngôn ngữ" ở ACC1) chỉ để hiển thị: định khoản, AccountResolver, báo cáo, BCTC,
--      bản in, MCP, khung nhìn bizcity_read đều không đọc. Bỏ khỏi màn, API, Excel, dữ liệu mẫu và CSDL.
--      Giá trị đơn vị đã khai KHÔNG mất (ECP-13): chép sang accounts_name_en_luu trước khi xoá cột.
--      Đường lui: ALTER TABLE accounts ADD COLUMN name_en text;
--                 UPDATE accounts a SET name_en = l.name_en FROM accounts_name_en_luu l WHERE l.tenant_id = a.tenant_id AND l.code = a.code;
-- =============================================================================

CREATE TABLE IF NOT EXISTS accounts_name_en_luu (
  tenant_id   bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text        NOT NULL,
  name_en     text        NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code)
);
COMMENT ON TABLE accounts_name_en_luu IS 'Tên tiếng Anh của tài khoản lưu lại khi bỏ cột accounts.name_en (0147, D023-9). Chỉ đọc; dùng khi cần khôi phục.';
COMMENT ON COLUMN accounts_name_en_luu.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN accounts_name_en_luu.code IS 'Số tài khoản (accounts.code) lúc lưu.';
COMMENT ON COLUMN accounts_name_en_luu.name_en IS 'Tên tiếng Anh đơn vị đã khai (giá trị cũ của accounts.name_en, khác rỗng).';
COMMENT ON COLUMN accounts_name_en_luu.archived_at IS 'Lúc chép sang bảng lưu.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'name_en') THEN
    INSERT INTO accounts_name_en_luu (tenant_id, code, name_en)
    SELECT tenant_id, code, btrim(name_en) FROM accounts WHERE COALESCE(btrim(name_en), '') <> ''
    ON CONFLICT (tenant_id, code) DO NOTHING;
    ALTER TABLE accounts DROP COLUMN name_en;
  END IF;
END $$;

-- ── Cô lập đơn vị (như 0041) ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE accounts_name_en_luu ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_name_en_luu FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounts_name_en_luu;
CREATE POLICY tenant_isolation ON accounts_name_en_luu USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032): chỉ đọc ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON accounts_name_en_luu TO ketoan_app;
  END IF;
END $$;
