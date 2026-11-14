-- [2026-11-13 Nguyễn Văn Thủy] Bút toán gộp theo tài khoản (0134) mang thêm mã hàng: dòng gộp chỉ một mã thì có mã / tên, nhiều mã thì đếm số mã (đóng góp)

ALTER TABLE ledger_entry_accounts ADD COLUMN sku_count integer NOT NULL DEFAULT 0;
ALTER TABLE ledger_entry_accounts ADD COLUMN product_sku text;
ALTER TABLE ledger_entry_accounts ADD COLUMN product_name text;
ALTER TABLE ledger_entry_accounts ADD COLUMN item_id text;
COMMENT ON COLUMN ledger_entry_accounts.sku_count IS 'Số mã hàng khác nhau trong các dòng gộp vào (0135); 0 = dòng không gắn mã hàng (thuế, tiền, công nợ…).';
COMMENT ON COLUMN ledger_entry_accounts.product_sku IS 'Mã hàng khi dòng gộp chỉ có một mã (0135); nhiều mã thì trống.';
COMMENT ON COLUMN ledger_entry_accounts.product_name IS 'Tên hàng khi dòng gộp chỉ có một mã (0135).';
COMMENT ON COLUMN ledger_entry_accounts.item_id IS 'Định danh mặt hàng (bất biến) khi dòng gộp chỉ có một mã (0135); mã hàng là ảnh chụp lúc ghi.';

CREATE OR REPLACE FUNCTION bizcity_entry_accounts_rebuild(p_entries bigint[]) RETURNS void
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
  INSERT INTO ledger_entry_accounts (tenant_id, entry_id, branch_id, posting_date, account_code, counter_accounts, partner_id, side, debit, credit, line_count, first_line_no,
                                     sku_count, product_sku, product_name, item_id)
  SELECT min(tenant_id), entry_id, min(branch_id), min(posting_date), account_code, counter, COALESCE(partner_id, 0), sd, sum(debit), sum(credit), count(*), min(line_no),
         count(DISTINCT product_sku),
         CASE WHEN count(DISTINCT product_sku) = 1 THEN min(product_sku) END,
         CASE WHEN count(DISTINCT product_sku) = 1 THEN min(product_name) END,
         CASE WHEN count(DISTINCT product_sku) = 1 AND count(DISTINCT item_id) = 1 THEN min(item_id) END
    FROM x GROUP BY entry_id, account_code, counter, COALESCE(partner_id, 0), sd;
$$;

CREATE OR REPLACE VIEW bizcity_read.ledger_entry_accounts WITH (security_invoker = true) AS
SELECT tenant_id, entry_id, branch_id, posting_date, account_code, counter_accounts, partner_id, side, debit, credit, line_count, first_line_no,
       sku_count, product_sku, product_name, item_id
  FROM public.ledger_entry_accounts;

-- Dựng lại để có mã hàng cho dữ liệu đã có.
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
