-- [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn (đóng góp)
-- =============================================================================
-- 0095 Lý do theo màn.
--   Mỗi màn nghiệp vụ (bán hàng, khách trả hàng, nhập mua, trả NCC, điều chỉnh kho, phiếu thu, phiếu chi…) chỉ dùng
--   vài lý do do kế toán chọn. Màn nhập liệu chỉ hiện các lý do này; bấm một lý do ở màn Thiết kế hạch toán (ACC90)
--   mở sơ đồ dây chuyền định khoản của lý do đó.
--   Màn chưa gán lý do nào: dùng như trước (lọc theo loại lý do), không màn nào bị chặn.
--   Không đổi định khoản, không chạm sổ: tài khoản vẫn lấy theo lý do → nhóm hạch toán → tài khoản ngầm định.
-- =============================================================================

CREATE TABLE screen_reasons (
  id          bigserial   PRIMARY KEY,
  tenant_id   bigint      NOT NULL REFERENCES tenants(id),
  screen_key  text        NOT NULL,
  reason_code text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_default  boolean     NOT NULL DEFAULT false,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, screen_key, reason_code)
);
CREATE UNIQUE INDEX screen_reasons_one_default ON screen_reasons (tenant_id, screen_key) WHERE is_default;

COMMENT ON TABLE screen_reasons IS 'Lý do được dùng ở từng màn nghiệp vụ; màn nhập liệu chỉ hiện các lý do này (0095).';
COMMENT ON COLUMN screen_reasons.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN screen_reasons.screen_key IS 'Màn: sale, sale_return, purchase, purchase_return, stock_increase, stock_decrease, transfer, cash_receipt, cash_payment.';
COMMENT ON COLUMN screen_reasons.reason_code IS 'Mã lý do (posting_reasons.code).';
COMMENT ON COLUMN screen_reasons.sort_order IS 'Thứ tự hiện trên màn.';
COMMENT ON COLUMN screen_reasons.is_default IS 'Lý do chọn sẵn khi lập phiếu ở màn này (mỗi màn tối đa một).';
COMMENT ON COLUMN screen_reasons.created_by IS 'Người gán.';
COMMENT ON COLUMN screen_reasons.created_at IS 'Lúc gán.';
COMMENT ON COLUMN screen_reasons.updated_at IS 'Lúc sửa gần nhất.';

-- Gán sẵn lý do mặc định đang có của từng loại chứng từ, để màn có ngay một lý do.
INSERT INTO screen_reasons (tenant_id, screen_key, reason_code, sort_order, is_default, created_by)
SELECT r.tenant_id, m.screen_key, r.code, 0, true, 'migration 0095'
  FROM posting_reasons r
  JOIN (VALUES ('sale', 'sale'), ('sale_return', 'sale_return'), ('purchase', 'purchase'), ('purchase_return', 'purchase_return'),
               ('stock_adjustment:increase', 'stock_increase'), ('stock_adjustment:decrease', 'stock_decrease'), ('transfer', 'transfer'),
               ('customer_payment', 'cash_receipt'), ('supplier_payment', 'cash_payment')) AS m(flag, screen_key)
    ON r.flags->>'default' = m.flag
 WHERE r.is_active
ON CONFLICT DO NOTHING;

-- ── Cô lập đơn vị (như 0041) ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE screen_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_reasons FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON screen_reasons USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Quyền vai trò API (0032) ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON screen_reasons TO ketoan_app;
    GRANT USAGE ON SEQUENCE screen_reasons_id_seq TO ketoan_app;
  END IF;
END $$;
