-- [2026-11-13 Nguyễn Văn Thủy] Lớp trung gian "bút toán gộp theo tài khoản" (đóng góp)
--
-- Sổ cái vẫn lưu CHI TIẾT từng dòng mã hàng (ledger_lines): phiếu 10 mã hàng → ~30 dòng. Sổ sách chính thức (Nhật ký chung,
-- Sổ cái, Sổ chi tiết tài khoản, Sổ quỹ, Sổ công nợ) khi chọn "Cộng gộp các bút toán giống nhau" chỉ cần mỗi phiếu × tài khoản ×
-- TK đối ứng × đối tượng × bên Nợ/Có một dòng (phiếu đó còn 3 dòng: Nợ 131 / Có 511 / Có 3331). Trước đây báo cáo đọc toàn bộ dòng
-- chi tiết rồi mới cộng → nặng khi dữ liệu thật lớn. Bảng này giữ sẵn kết quả gộp, báo cáo gộp đọc đây (phân trang ở máy chủ);
-- bấm vào một dòng gộp mới xem các dòng mã hàng bên trong (đọc ledger_lines theo entry_id).
--
-- Cập nhật bằng trigger theo câu lệnh trên ledger_lines, nên mọi đường ghi đều theo: ghi bút toán (INSERT) và điền giá vốn tháng
-- (ledger_fill_cost_lines, UPDATE debit / credit). Mỗi lần: dựng lại các dòng gộp của đúng những bút toán vừa ghi / vừa đổi số tiền.
-- Sổ chỉ ghi thêm, bút toán đảo là bút toán mới → không có đường xoá. Kiểm tra: tổng bảng này = tổng ledger_lines theo bút toán.
--
-- TK đối ứng: tài khoản phía bên kia cùng cặp định khoản (pair_no) — cùng luật với báo cáo (otherSide của Kernel): bên của dòng
-- = Nợ nếu debit ≠ 0, Có nếu credit ≠ 0, dòng số 0 theo cost_fill, dòng số 0 khác thì phía bên kia là dòng còn lại của cặp.

CREATE TABLE ledger_entry_accounts (
  tenant_id bigint NOT NULL,
  entry_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  posting_date date NOT NULL,
  account_code text NOT NULL,
  counter_accounts text NOT NULL DEFAULT '',
  partner_id bigint NOT NULL DEFAULT 0,
  side smallint NOT NULL,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  line_count integer NOT NULL,
  first_line_no integer NOT NULL,
  PRIMARY KEY (entry_id, account_code, counter_accounts, partner_id, side)
);
CREATE INDEX ledger_entry_accounts_date ON ledger_entry_accounts (tenant_id, posting_date, entry_id);
CREATE INDEX ledger_entry_accounts_account ON ledger_entry_accounts (tenant_id, account_code, posting_date);

COMMENT ON TABLE ledger_entry_accounts IS 'Bút toán gộp theo tài khoản (0134): lớp trung gian giữa sổ chi tiết từng mã hàng (ledger_lines) và sổ sách chính thức. Một dòng = bút toán × tài khoản × TK đối ứng × đối tượng × bên. Trigger trên ledger_lines giữ đồng bộ; không ghi tay.';
COMMENT ON COLUMN ledger_entry_accounts.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN ledger_entry_accounts.entry_id IS 'Bút toán (ledger_entries.id).';
COMMENT ON COLUMN ledger_entry_accounts.branch_id IS 'Chi nhánh của dòng sổ.';
COMMENT ON COLUMN ledger_entry_accounts.posting_date IS 'Ngày ghi sổ.';
COMMENT ON COLUMN ledger_entry_accounts.account_code IS 'Tài khoản.';
COMMENT ON COLUMN ledger_entry_accounts.counter_accounts IS 'Tài khoản đối ứng (phía bên kia cùng cặp định khoản), nhiều TK ngăn bằng dấu phẩy; trống = không có.';
COMMENT ON COLUMN ledger_entry_accounts.partner_id IS 'Đối tượng của dòng sổ; 0 = không theo đối tượng.';
COMMENT ON COLUMN ledger_entry_accounts.side IS 'Bên: 1 Nợ, -1 Có, 0 dòng số 0 chưa xác định bên.';
COMMENT ON COLUMN ledger_entry_accounts.debit IS 'Tổng Nợ các dòng mã hàng gộp vào.';
COMMENT ON COLUMN ledger_entry_accounts.credit IS 'Tổng Có các dòng mã hàng gộp vào.';
COMMENT ON COLUMN ledger_entry_accounts.line_count IS 'Số dòng chi tiết (dòng mã hàng) gộp vào dòng này.';
COMMENT ON COLUMN ledger_entry_accounts.first_line_no IS 'Số dòng nhỏ nhất trong bút toán — để xếp thứ tự như sổ chi tiết.';

ALTER TABLE ledger_entry_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entry_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_entry_accounts USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- Dựng lại các dòng gộp của những bút toán cho trước (xoá rồi cộng lại từ ledger_lines).
CREATE FUNCTION bizcity_entry_accounts_rebuild(p_entries bigint[]) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM ledger_entry_accounts WHERE entry_id = ANY (p_entries);
  WITH s AS (
    SELECT l.*, CASE WHEN l.debit <> 0 THEN 1 WHEN l.credit <> 0 THEN -1 WHEN l.cost_fill = 'debit' THEN 1 WHEN l.cost_fill = 'credit' THEN -1 ELSE 0 END AS sd
      FROM ledger_lines l WHERE l.entry_id = ANY (p_entries)
  ), k AS (
    -- TK đối ứng của từng dòng: nối các dòng cùng cặp (entry_id, pair_no) phía bên kia — phép nối băm, không dò từng dòng.
    SELECT s.id, string_agg(DISTINCT o.account_code, ', ' ORDER BY o.account_code) AS counter
      FROM s JOIN s o ON o.entry_id = s.entry_id AND o.pair_no = s.pair_no AND o.id <> s.id
                     AND (o.sd <> s.sd OR (o.sd = 0 AND s.sd = 0 AND o.line_no <> s.line_no))
     GROUP BY s.id
  ), x AS (
    SELECT s.*, COALESCE(k.counter, '') AS counter FROM s LEFT JOIN k ON k.id = s.id
  )
  INSERT INTO ledger_entry_accounts (tenant_id, entry_id, branch_id, posting_date, account_code, counter_accounts, partner_id, side, debit, credit, line_count, first_line_no)
  SELECT min(tenant_id), entry_id, min(branch_id), min(posting_date), account_code, counter, COALESCE(partner_id, 0), sd, sum(debit), sum(credit), count(*), min(line_no)
    FROM x GROUP BY entry_id, account_code, counter, COALESCE(partner_id, 0), sd;
$$;
COMMENT ON FUNCTION bizcity_entry_accounts_rebuild(bigint[]) IS 'Dựng lại bút toán gộp theo tài khoản (0134) của các bút toán cho trước từ ledger_lines.';

CREATE FUNCTION bizcity_entry_accounts_on_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM bizcity_entry_accounts_rebuild(ARRAY(SELECT DISTINCT entry_id FROM nt));
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_entry_accounts_on_insert() IS 'Ghi bút toán mới → dựng dòng gộp theo tài khoản (0134).';

CREATE FUNCTION bizcity_entry_accounts_on_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v bigint[];
BEGIN
  v := ARRAY(SELECT DISTINCT n.entry_id FROM nt n JOIN ot o ON o.id = n.id
              WHERE n.debit IS DISTINCT FROM o.debit OR n.credit IS DISTINCT FROM o.credit);
  IF cardinality(v) > 0 THEN PERFORM bizcity_entry_accounts_rebuild(v); END IF;
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_entry_accounts_on_update() IS 'Điền giá vốn (đổi số tiền dòng sổ) → dựng lại dòng gộp theo tài khoản của bút toán đó (0134).';

CREATE TRIGGER ledger_lines_entry_accounts_ins AFTER INSERT ON ledger_lines
  REFERENCING NEW TABLE AS nt FOR EACH STATEMENT EXECUTE FUNCTION bizcity_entry_accounts_on_insert();
CREATE TRIGGER ledger_lines_entry_accounts_upd AFTER UPDATE ON ledger_lines
  REFERENCING OLD TABLE AS ot NEW TABLE AS nt FOR EACH STATEMENT EXECUTE FUNCTION bizcity_entry_accounts_on_update();
CREATE FUNCTION bizcity_entry_accounts_on_delete() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM bizcity_entry_accounts_rebuild(ARRAY(SELECT DISTINCT entry_id FROM ot));
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_entry_accounts_on_delete() IS 'Dọn dòng sổ (chỉ việc dọn dữ liệu được phép) → dựng lại / bỏ dòng gộp tương ứng (0134).';
CREATE TRIGGER ledger_lines_entry_accounts_del AFTER DELETE ON ledger_lines
  REFERENCING OLD TABLE AS ot FOR EACH STATEMENT EXECUTE FUNCTION bizcity_entry_accounts_on_delete();
COMMENT ON TRIGGER ledger_lines_entry_accounts_del ON ledger_lines IS 'Giữ bút toán gộp theo tài khoản (0134) khi dọn dòng sổ.';
COMMENT ON TRIGGER ledger_lines_entry_accounts_ins ON ledger_lines IS 'Giữ bút toán gộp theo tài khoản (0134) khi ghi dòng sổ.';
COMMENT ON TRIGGER ledger_lines_entry_accounts_upd ON ledger_lines IS 'Giữ bút toán gộp theo tài khoản (0134) khi điền giá vốn.';

-- Khung nhìn chỉ đọc cho báo cáo (ngoài Kernel không đọc thẳng bảng sổ).
CREATE VIEW bizcity_read.ledger_entry_accounts WITH (security_invoker = true) AS
SELECT tenant_id, entry_id, branch_id, posting_date, account_code, counter_accounts, partner_id, side, debit, credit, line_count, first_line_no
  FROM public.ledger_entry_accounts;
COMMENT ON VIEW bizcity_read.ledger_entry_accounts IS 'Bút toán gộp theo tài khoản (0134), chỉ đọc: sổ sách chế độ "Cộng gộp các bút toán giống nhau" đọc đây; chi tiết mã hàng đọc ledger_lines.';
CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.ledger_entry_accounts
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ledger_entry_accounts FROM ketoan_app;
    GRANT SELECT ON ledger_entry_accounts TO ketoan_app;
    GRANT SELECT ON bizcity_read.ledger_entry_accounts TO ketoan_app;
  END IF;
END $$;

-- Dựng cho dữ liệu đã có (theo lô bút toán).
DO $$
DECLARE v bigint[]; last bigint := 0;
BEGIN
  LOOP
    v := ARRAY(SELECT DISTINCT entry_id FROM ledger_lines WHERE entry_id > last ORDER BY entry_id LIMIT 5000);
    EXIT WHEN cardinality(v) = 0;
    PERFORM bizcity_entry_accounts_rebuild(v);
    last := v[cardinality(v)];
  END LOOP;
END $$;
