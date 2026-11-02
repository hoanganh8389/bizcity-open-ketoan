-- [2026-11-02 02:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — đổi số 0050 → 0051 khi gộp main (PR #20 có 0050_vai_tro_nha_phat_trien); chưa phát hành nên không cần RENAMED.
-- [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — hồ sơ kế toán của đơn vị có phiên bản: năm tài chính, chế độ kế toán, loại pháp nhân, hiệu lực từ đầu năm tài chính (ADR-0013, S020-22, khoảng trống G1).
-- [2026-11-02 02:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — đổi số migration hồ sơ kế toán 0049 → 0050 (main đã có 0049_khoa_dau_but_toan từ PR #18).
-- =============================================================================
-- 0051 Hồ sơ kế toán của đơn vị (ADR-0013; PHASE-020 S020-22).
--      accounting_profiles: mỗi dòng là MỘT phiên bản hồ sơ, hiệu lực từ ngày đầu một năm tài chính. Chỉ thêm.
--        fiscal_year_start_month — tháng bắt đầu năm tài chính (1 = năm dương lịch); kỳ kế toán tháng giữ nguyên (fiscal_periods);
--        regime                  — chế độ kế toán đơn vị áp dụng cho các năm tài chính từ effective_from;
--        entity_type             — loại pháp nhân (doanh nghiệp, nhỏ và vừa, siêu nhỏ, hộ kinh doanh).
--      Hồ sơ áp cho ngày D = dòng có effective_from ≤ D lớn nhất (bằng nhau thì version lớn nhất). Không có dòng = CHƯA KHAI:
--      Core không đoán chế độ; Conformance Engine báo "chưa khai" để người dùng quyết (ADR-0012, R-VNC-10).
--      Core chỉ giữ CẤU TRÚC (ngày đầu tháng, trùng tháng bắt đầu năm tài chính, không lùi vào kỳ đã khoá). Chế độ có hợp
--      với loại pháp nhân / năm tài chính không là phân tích của Conformance, không chặn ở đây.
-- =============================================================================

CREATE TABLE IF NOT EXISTS accounting_profiles (
  tenant_id               bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version                 integer     NOT NULL CHECK (version >= 1),
  effective_from          date        NOT NULL CHECK (EXTRACT(day FROM effective_from) = 1),
  fiscal_year_start_month smallint    NOT NULL CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  regime                  text        NOT NULL CHECK (regime IN ('vn-tt200-2014', 'vn-tt99-2025', 'vn-tt133-2016', 'vn-tt152-2025')),
  entity_type             text        NOT NULL CHECK (entity_type IN ('enterprise', 'sme', 'micro', 'household')),
  note                    text        NOT NULL,
  created_by              text        NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, version),
  CONSTRAINT accounting_profiles_starts_fiscal_year CHECK (EXTRACT(month FROM effective_from) = fiscal_year_start_month)
);
CREATE INDEX IF NOT EXISTS accounting_profiles_effective_idx ON accounting_profiles (tenant_id, effective_from DESC, version DESC);

-- Chỉ thêm: không sửa; không xoá trực tiếp (xoá đơn vị vẫn xoá theo khoá ngoại — trigger lồng dưới trigger RI).
CREATE OR REPLACE FUNCTION accounting_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Hồ sơ kế toán không sửa / xoá được (chỉ thêm; đổi hồ sơ thì phát hành bản mới)' USING ERRCODE = 'P0001';
END $$;
DROP TRIGGER IF EXISTS accounting_profiles_guard ON accounting_profiles;
CREATE TRIGGER accounting_profiles_guard BEFORE UPDATE OR DELETE ON accounting_profiles FOR EACH ROW EXECUTE FUNCTION accounting_profiles_guard();

-- Cô lập đơn vị (cùng khuôn 0041, SC-DATA-6).
ALTER TABLE accounting_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounting_profiles;
CREATE POLICY tenant_isolation ON accounting_profiles USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

COMMENT ON TABLE accounting_profiles IS 'Hồ sơ kế toán của đơn vị có phiên bản (ADR-0013): năm tài chính, chế độ kế toán, loại pháp nhân; hiệu lực từ đầu năm tài chính. Chỉ thêm.';
COMMENT ON COLUMN accounting_profiles.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN accounting_profiles.version IS 'Số phiên bản tăng dần trong đơn vị.';
COMMENT ON COLUMN accounting_profiles.effective_from IS 'Ngày hiệu lực = ngày đầu một năm tài chính của hồ sơ này (ngày 01, tháng = fiscal_year_start_month).';
COMMENT ON COLUMN accounting_profiles.fiscal_year_start_month IS 'Tháng bắt đầu năm tài chính: 1 = năm dương lịch; 7 = năm tài chính 01/7 – 30/6.';
COMMENT ON COLUMN accounting_profiles.regime IS 'Chế độ kế toán: vn-tt200-2014, vn-tt99-2025, vn-tt133-2016, vn-tt152-2025. Căn cứ ở kho nguồn pháp lý của bộ kiểm chuẩn.';
COMMENT ON COLUMN accounting_profiles.entity_type IS 'Loại pháp nhân: enterprise (doanh nghiệp), sme (nhỏ và vừa), micro (siêu nhỏ), household (hộ, cá nhân kinh doanh).';
COMMENT ON COLUMN accounting_profiles.note IS 'Lý do / căn cứ của lần phát hành (bắt buộc).';
COMMENT ON COLUMN accounting_profiles.created_by IS 'Người phát hành.';
COMMENT ON COLUMN accounting_profiles.created_at IS 'Lúc phát hành.';
