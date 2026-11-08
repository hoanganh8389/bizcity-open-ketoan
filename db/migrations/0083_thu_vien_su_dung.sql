-- [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 (B2, chữ chốt PHASE-030 · 26 §8–§9, ADR-0032): bảng đếm lượt dùng thư viện library_usage_daily — chỉ mã, không giá trị nhập; ghi gom theo lượt sau khi kiểm
-- =============================================================================
-- 0083 Theo dõi sử dụng thư viện (bizcity_library@1).
--   Một dòng = (đơn vị, ngày, thư viện, bản, nguồn, mã mục, kết quả, mã phát hiện) với số lần. Bộ đếm ở
--   packages/platform/src/core/libraries/usage.ts gom trong bộ nhớ rồi ghi một câu INSERT … ON CONFLICT DO UPDATE
--   SET count = count + EXCLUDED.count. Số đếm là QUAN SÁT (eventual, ECP): mất vài lượt khi tiến trình chết là chấp nhận;
--   không phải sự thật kế toán, không đọc để ghi sổ.
--   KHÔNG lưu giá trị người nhập (R-SEC-10): chỉ mã thư viện, mã mục, mã phát hiện.
-- =============================================================================

CREATE TABLE library_usage_daily (
  tenant_id     bigint      NOT NULL REFERENCES tenants(id),
  day           date        NOT NULL,
  library_id    text        NOT NULL CHECK (library_id ~ '^[a-z0-9-]+\.[a-z0-9][a-z0-9-]{1,48}$'),
  version       text        NOT NULL CHECK (version ~ '^\d+\.\d+\.\d+$'),
  source        text        NOT NULL CHECK (length(source) BETWEEN 1 AND 80),
  item_code     text        NOT NULL CHECK (length(item_code) BETWEEN 1 AND 80),
  outcome       text        NOT NULL CHECK (outcome IN ('pass', 'warn', 'block')),
  finding_code  text        NOT NULL DEFAULT '' CHECK (length(finding_code) <= 40),
  count         bigint      NOT NULL CHECK (count > 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day, library_id, version, source, item_code, outcome, finding_code)
);

COMMENT ON TABLE  library_usage_daily IS 'Lượt dùng thư viện bizcity_library@1 theo ngày (S030-48, PHASE-030 · 26 §8): đếm, không lưu giá trị nhập; ghi gom theo lượt, eventual — quan sát, không phải sự thật kế toán.';
COMMENT ON COLUMN library_usage_daily.tenant_id    IS 'Đơn vị dùng thư viện.';
COMMENT ON COLUMN library_usage_daily.day          IS 'Ngày dùng (giờ máy chủ, UTC).';
COMMENT ON COLUMN library_usage_daily.library_id   IS 'id thư viện <miền>.<tên> (vd vn.tham-so-phap-ly).';
COMMENT ON COLUMN library_usage_daily.version      IS 'Bản thư viện lúc dùng (semver).';
COMMENT ON COLUMN library_usage_daily.source       IS 'Nguồn: module / action / kênh gọi bộ kiểm (vd api, modules/luong, intake); không gửi thì "api".';
COMMENT ON COLUMN library_usage_daily.item_code    IS 'Mã mục thư viện đã khớp (mã chuẩn, sau bí danh); "?" khi mã không có trong thư viện.';
COMMENT ON COLUMN library_usage_daily.outcome      IS 'Kết quả lượt kiểm: pass (không cảnh báo / chặn) · warn (có cảnh báo) · block (có lỗi chặn).';
COMMENT ON COLUMN library_usage_daily.finding_code IS 'Mã phát hiện nặng nhất của lượt (LIB-* hoặc mã luật thư viện); rỗng khi chỉ có mức nhắc hoặc không có.';
COMMENT ON COLUMN library_usage_daily.count        IS 'Số lượt.';
COMMENT ON COLUMN library_usage_daily.updated_at   IS 'Lần cộng dồn gần nhất.';

CREATE INDEX library_usage_daily_lib ON library_usage_daily (tenant_id, library_id, day);
COMMENT ON INDEX library_usage_daily_lib IS 'Bảng đánh giá: lượt theo thư viện trong khoảng ngày.';

-- ── Cô lập đơn vị (như 0041) ──────────────────────────────────────────────────────
ALTER TABLE library_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_usage_daily FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON library_usage_daily USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032): chỉ thêm và cộng dồn số đếm; không xoá ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT ON library_usage_daily TO ketoan_app;
    GRANT UPDATE (count, updated_at) ON library_usage_daily TO ketoan_app;
  END IF;
END $$;
