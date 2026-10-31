-- [2026-10-31 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): schema bizcity_read, khung nhìn chỉ đọc ledger_entries / ledger_lines / ledger_balances_daily
-- =============================================================================
-- 0043 Hợp đồng đọc sổ cái (năng lực ledger.query, PHASES 3.7; PHASE-012 S012-2).
--      Ngoài Kernel (báo cáo, phân hệ, add-in) KHÔNG đọc thẳng bảng ledger_*: đọc qua khung nhìn của schema bizcity_read
--      (SQL viết tay cho báo cáo) hoặc qua ledgerQuery ở apps/api/src/kernel/public.ts (truy vấn có sẵn). SC-KERNEL-7 chặn.
--      Vì sao: bảng ledger_* là chỗ Kernel giữ bất biến (chỉ thêm, chuỗi băm, số dư ngày). Khung nhìn là bề mặt đọc ổn định —
--      Kernel đổi cấu trúc bảng thì sửa khung nhìn, không sửa báo cáo; Phase 3.10 cấp vai trò CSDL module chỉ SELECT trên
--      bizcity_read, không chạm bảng sổ.
--      - security_invoker: khung nhìn chạy bằng quyền người gọi → chính sách RLS tenant_isolation của bảng gốc vẫn áp (0041).
--      - Chỉ đọc: trigger INSTEAD OF chặn INSERT / UPDATE / DELETE qua khung nhìn (khung nhìn một bảng mặc định ghi được).
--      - Không đưa content_hash / body_hash ra: chuỗi băm là việc của Kernel (ledger verify, tự chẩn đoán), báo cáo không cần.
--      Cột mới của bảng sổ KHÔNG tự hiện ở đây: thêm cột thì thêm vào khung nhìn bằng migration mới (CREATE OR REPLACE VIEW).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS bizcity_read;
COMMENT ON SCHEMA bizcity_read IS 'Bề mặt chỉ đọc của Kernel cho báo cáo, phân hệ, add-in (ledger.query, data.read-views). Không ghi được; RLS bảng gốc vẫn áp.';

CREATE OR REPLACE FUNCTION bizcity_read.reject_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bizcity_read.% chỉ đọc — ghi sổ qua cửa nạp của Kernel (postDocumentIn / eventStore)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
COMMENT ON FUNCTION bizcity_read.reject_write() IS 'Trigger INSTEAD OF: chặn mọi lệnh ghi qua khung nhìn bizcity_read.*.';

-- ── Bút toán ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.ledger_entries WITH (security_invoker = true) AS
SELECT id, tenant_id, branch_id, period_id, entry_no, doc_type, event_id, event_version, doc_no, invoice_no, doc_date,
       posting_date, reason_code, partner_id, description, total, status, reverses_entry_id, created_by, created_at,
       is_reversal, policy_version
  FROM public.ledger_entries;

COMMENT ON VIEW bizcity_read.ledger_entries IS 'Bút toán sổ cái (chỉ đọc). Số đang hiệu lực: status = ''posted'' AND NOT is_reversal; bút toán đã đảo và bút toán đảo triệt tiêu nhau.';
COMMENT ON COLUMN bizcity_read.ledger_entries.entry_no IS 'Số bút toán theo dãy của đơn vị.';
COMMENT ON COLUMN bizcity_read.ledger_entries.doc_type IS 'Loại chứng từ nguồn (bizcity_ledger_intake@1).';
COMMENT ON COLUMN bizcity_read.ledger_entries.event_id IS 'Sự việc kế toán sinh ra bút toán (accounting_events.id).';
COMMENT ON COLUMN bizcity_read.ledger_entries.doc_no IS 'Số chứng từ nguồn.';
COMMENT ON COLUMN bizcity_read.ledger_entries.posting_date IS 'Ngày ghi sổ — mốc tính kỳ và số dư.';
COMMENT ON COLUMN bizcity_read.ledger_entries.reason_code IS 'Lý do định khoản (posting_reasons.code).';
COMMENT ON COLUMN bizcity_read.ledger_entries.status IS 'posted = đang hiệu lực; reversed = đã bị bút toán đảo triệt tiêu.';
COMMENT ON COLUMN bizcity_read.ledger_entries.is_reversal IS 'true = bút toán đảo (ghi số âm) của một bút toán khác.';
COMMENT ON COLUMN bizcity_read.ledger_entries.policy_version IS 'Bản chính sách kế toán dùng khi định khoản (ADR-0009).';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Dòng bút toán ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.ledger_lines WITH (security_invoker = true) AS
SELECT id, entry_id, tenant_id, branch_id, posting_date, line_no, pair_no, account_code, debit, credit, partner_id, tax_code,
       part, product_sku, description, source_line_key, dims, cost_fill
  FROM public.ledger_lines;

COMMENT ON VIEW bizcity_read.ledger_lines IS 'Dòng bút toán (chỉ đọc). Tài khoản đối ứng: dòng cùng entry_id, cùng pair_no, khác bên — dùng ledgerQuery.otherSide().';
COMMENT ON COLUMN bizcity_read.ledger_lines.pair_no IS 'Số cặp định khoản trong bút toán: các dòng cùng cặp là đối ứng của nhau.';
COMMENT ON COLUMN bizcity_read.ledger_lines.account_code IS 'Tài khoản (accounts.code).';
COMMENT ON COLUMN bizcity_read.ledger_lines.debit IS 'Phát sinh Nợ, numeric(18,2).';
COMMENT ON COLUMN bizcity_read.ledger_lines.credit IS 'Phát sinh Có, numeric(18,2).';
COMMENT ON COLUMN bizcity_read.ledger_lines.partner_id IS 'Đối tượng công nợ (partners.id).';
COMMENT ON COLUMN bizcity_read.ledger_lines.part IS 'Phần của chứng từ sinh dòng (tiền hàng, thuế, giá vốn…).';
COMMENT ON COLUMN bizcity_read.ledger_lines.product_sku IS 'Mã hàng (SKU_RULE) khi dòng chi tiết theo mặt hàng.';
COMMENT ON COLUMN bizcity_read.ledger_lines.dims IS 'Chiều phân tích {mã chiều: mã giá trị} (hợp đồng, dự án, khoản mục…).';
COMMENT ON COLUMN bizcity_read.ledger_lines.cost_fill IS 'Dòng giá vốn chờ tính giá: bên ''debit'' / ''credit'' khi số tiền còn 0.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Số dư ngày ───────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.ledger_balances_daily WITH (security_invoker = true) AS
SELECT tenant_id, branch_id, account_code, posting_date, partner_id, debit, credit
  FROM public.ledger_balances_daily;

COMMENT ON VIEW bizcity_read.ledger_balances_daily IS 'Phát sinh Nợ / Có cộng theo (đơn vị, chi nhánh, tài khoản, ngày, đối tượng) — chỉ đọc. Báo cáo tổng hợp đọc đây; chi tiết theo mã hàng / chiều phân tích đọc ledger_lines.';
COMMENT ON COLUMN bizcity_read.ledger_balances_daily.debit IS 'Tổng phát sinh Nợ trong ngày.';
COMMENT ON COLUMN bizcity_read.ledger_balances_daily.credit IS 'Tổng phát sinh Có trong ngày.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.ledger_balances_daily
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Quyền: vai trò API (0032) chỉ được SELECT ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT USAGE ON SCHEMA bizcity_read TO ketoan_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA bizcity_read TO ketoan_app;
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA bizcity_read GRANT SELECT ON TABLES TO ketoan_app', current_user);
  END IF;
END $$;
