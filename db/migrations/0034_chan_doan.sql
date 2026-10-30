-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
-- =============================================================================
-- 0034 diagnostic_runs: kết quả mỗi lần tự chẩn đoán (R-DIAG-5, PHASES 2.10) — GET /api/v1/system/diagnostics, trước khi khoá kỳ
--      (R-DIAG-4), sau cập nhật. Chỉ thêm: không sửa dòng đã ghi (trigger). Xoá chỉ để dọn dòng quá hạn giữ (90 ngày), do lệnh
--      dọn chạy, không do người dùng. Mã kiểm (checks[].code) trùng mã ở docs/ops/DIAGNOSTICS.md §2 và lane diagnostics của
--      bộ kiểm chuẩn (tests/conformance/diagnostics/).
-- =============================================================================

CREATE TABLE IF NOT EXISTS diagnostic_runs (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  layer       text   NOT NULL CHECK (layer IN ('L1', 'L3')),
  trigger     text   NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'period-lock', 'schedule', 'release')),
  scope       jsonb  NOT NULL DEFAULT '{}'::jsonb,
  summary     jsonb  NOT NULL,
  checks      jsonb  NOT NULL,
  error_count integer NOT NULL DEFAULT 0,
  actor       text   NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diagnostic_runs_tenant_idx ON diagnostic_runs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION forbid_diagnostic_run_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Kết quả chẩn đoán chỉ được thêm, không sửa (R-DIAG-5).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS diagnostic_runs_no_update ON diagnostic_runs;
CREATE TRIGGER diagnostic_runs_no_update BEFORE UPDATE ON diagnostic_runs
  FOR EACH ROW EXECUTE FUNCTION forbid_diagnostic_run_update();

COMMENT ON TABLE diagnostic_runs IS 'Kết quả tự chẩn đoán (R-DIAG-5): mỗi lần chạy một dòng, chỉ thêm. Giữ 90 ngày.';
COMMENT ON COLUMN diagnostic_runs.layer IS 'Tầng chẩn đoán RULE-SELF-DIAGNOSTICS §1: L1 sẵn sàng (migration, trigger, ghi được), L3 toàn vẹn sổ.';
COMMENT ON COLUMN diagnostic_runs.trigger IS 'Vì sao chạy: manual (người gọi API / màn Chẩn đoán), period-lock (trước khi khoá kỳ, R-DIAG-4), schedule (lịch đêm), release (sau cập nhật, R-REL-9).';
COMMENT ON COLUMN diagnostic_runs.scope IS 'Phạm vi đã xét: { from, to, branchCode } — trống = toàn bộ sổ của đơn vị.';
COMMENT ON COLUMN diagnostic_runs.summary IS 'Đếm theo mức: { pass, warn, error, info, empty }.';
COMMENT ON COLUMN diagnostic_runs.checks IS 'Từng kiểm: [{ code, level, examined, count, sample }] — sample chỉ là khoá chứng từ / số bút toán, không có số tiền, tên khách (R-DIAG-6).';
COMMENT ON COLUMN diagnostic_runs.error_count IS 'Số kiểm ở mức error (để lọc nhanh lần chạy có lỗi).';
COMMENT ON COLUMN diagnostic_runs.actor IS 'Ai / cái gì chạy: user:<id>, apikey:<id>, system.';
