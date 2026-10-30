-- =============================================================================
-- 0040 Chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009, C-9 / STD-CMP-9; PHASE-005, PHASES 2.14).
--      posting_policy_versions: bản chụp cấu hình định khoản (lý do, nhóm hạch toán, tài khoản ngầm định, phần tài khoản của
--      hình thức thanh toán / mã thuế / tài khoản ngân hàng). Chỉ thêm.
--        initial — bản đầu, hiệu lực từ 1900-01-01 (= cấu hình đang dùng; sổ hiện có không đổi);
--        amend   — cấu hình vừa được sửa: tự chụp lúc định khoản, CÙNG ngày hiệu lực với bản đang đứng đầu (sửa chế độ đang áp);
--        publish — đổi chế độ: người có quyền phát hành kèm ngày hiệu lực mới (accounting.policy.publish).
--      Định khoản chứng từ ngày D dùng bản có effective_from ≤ D lớn nhất (bằng nhau thì version lớn nhất).
--      posting_log.policy_version, ledger_entries.policy_version: bản đã dùng (NULL = không theo chính sách: phiếu kế toán tay,
--      kết chuyển, khấu hao; hoặc ghi trước 0040).
-- =============================================================================

CREATE TABLE IF NOT EXISTS posting_policy_versions (
  tenant_id       bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version         integer     NOT NULL CHECK (version >= 1),
  effective_from  date        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('initial', 'amend', 'publish')),
  snapshot        jsonb       NOT NULL,
  hash            text        NOT NULL,
  note            text        NOT NULL DEFAULT '',
  created_by      text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, version)
);
CREATE INDEX IF NOT EXISTS posting_policy_versions_effective_idx ON posting_policy_versions (tenant_id, effective_from DESC, version DESC);

-- Chỉ thêm: không sửa; không xoá trực tiếp (xoá đơn vị vẫn xoá theo khoá ngoại — trigger lồng dưới trigger RI).
CREATE OR REPLACE FUNCTION posting_policy_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Phiên bản chính sách kế toán không sửa / xoá được (chỉ thêm; đổi chính sách thì phát hành bản mới)' USING ERRCODE = 'P0001';
END $$;
DROP TRIGGER IF EXISTS posting_policy_versions_guard ON posting_policy_versions;
CREATE TRIGGER posting_policy_versions_guard BEFORE UPDATE OR DELETE ON posting_policy_versions FOR EACH ROW EXECUTE FUNCTION posting_policy_versions_guard();

ALTER TABLE posting_log ADD COLUMN IF NOT EXISTS policy_version integer;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS policy_version integer;

COMMENT ON TABLE posting_policy_versions IS 'Chính sách kế toán có phiên bản (ADR-0009): bản chụp cấu hình định khoản + ngày hiệu lực. Chỉ thêm.';
COMMENT ON COLUMN posting_policy_versions.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN posting_policy_versions.version IS 'Số phiên bản tăng dần trong đơn vị.';
COMMENT ON COLUMN posting_policy_versions.effective_from IS 'Ngày hiệu lực: chứng từ có ngày hạch toán ≥ ngày này định khoản theo bản này (tới khi có bản hiệu lực muộn hơn).';
COMMENT ON COLUMN posting_policy_versions.kind IS 'initial: bản đầu từ cấu hình đang dùng; amend: tự chụp sau khi sửa cấu hình, cùng ngày hiệu lực bản đứng đầu; publish: phát hành chế độ mới.';
COMMENT ON COLUMN posting_policy_versions.snapshot IS 'Bản chụp: reasons, groups, paymentMethods, taxCodes, defaults, bankAccounts (dòng đang dùng, không cột thời gian).';
COMMENT ON COLUMN posting_policy_versions.hash IS 'SHA-256 bản chụp đã chuẩn hoá: cấu hình đang dùng khác băm bản đứng đầu → tự chụp bản amend.';
COMMENT ON COLUMN posting_policy_versions.note IS 'Ghi chú (vd "Áp dụng TT99 từ 01/01/2026", tên gói định khoản đã cài).';
COMMENT ON COLUMN posting_policy_versions.created_by IS 'Người phát hành, hoặc người có lần định khoản tạo bản amend.';
COMMENT ON COLUMN posting_policy_versions.created_at IS 'Lúc tạo bản.';
COMMENT ON COLUMN posting_log.policy_version IS 'Phiên bản chính sách kế toán đã dùng khi định khoản (ADR-0009); NULL = không theo chính sách hoặc trước 0040.';
COMMENT ON COLUMN ledger_entries.policy_version IS 'Phiên bản chính sách kế toán bút toán được dựng theo (ADR-0009); NULL = phiếu kế toán tay, kết chuyển, khấu hao, bút toán đảo, hoặc trước 0040.';
