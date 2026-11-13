-- [2026-11-13 Nguyễn Văn Thủy] Bút toán gộp theo tài khoản (0134) mang đủ bộ định danh như dòng sổ (đóng góp)
--
-- Lớp nào cũng mang cùng một bộ định danh: chi nhánh cn_, phân kho kho_, đối tượng dt_, phòng ban pb_, MST tại ngày, mặt hàng
-- (item_id, 0135). Khác kho / khác phòng ban / khác MST trong cùng bút toán thì tách dòng gộp — sổ gộp lọc, cộng theo MST
-- (sổ thuế theo MST tại ngày), theo kho (TK kho theo loại kho) mà không phải quay về quét dòng mã hàng.

ALTER TABLE ledger_entry_accounts ADD COLUMN branch_uid text;
ALTER TABLE ledger_entry_accounts ADD COLUMN partner_uid text;
ALTER TABLE ledger_entry_accounts ADD COLUMN warehouse_uid text NOT NULL DEFAULT '';
ALTER TABLE ledger_entry_accounts ADD COLUMN warehouse_code text;
ALTER TABLE ledger_entry_accounts ADD COLUMN department_uid text NOT NULL DEFAULT '';
ALTER TABLE ledger_entry_accounts ADD COLUMN tax_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN ledger_entry_accounts.branch_uid IS 'Định danh chi nhánh / shop cn_… (0136), theo dòng sổ.';
COMMENT ON COLUMN ledger_entry_accounts.partner_uid IS 'Định danh đối tượng dt_… (0136), theo dòng sổ; trống = không theo đối tượng.';
COMMENT ON COLUMN ledger_entry_accounts.warehouse_uid IS 'Định danh phân kho kho_… (0136); trống = dòng không gắn kho. Khác kho thì tách dòng gộp.';
COMMENT ON COLUMN ledger_entry_accounts.warehouse_code IS 'Mã kho chụp lúc ghi (0136).';
COMMENT ON COLUMN ledger_entry_accounts.department_uid IS 'Định danh phòng ban pb_… (0136); trống = không gắn. Khác phòng ban thì tách dòng gộp.';
COMMENT ON COLUMN ledger_entry_accounts.tax_id IS 'MST tại ngày hạch toán của dòng sổ (0136); khác MST thì tách dòng gộp — sổ thuế theo MST.';

ALTER TABLE ledger_entry_accounts DROP CONSTRAINT ledger_entry_accounts_pkey;
ALTER TABLE ledger_entry_accounts ADD PRIMARY KEY (entry_id, account_code, counter_accounts, partner_id, side, branch_id, warehouse_uid, department_uid, tax_id);
CREATE INDEX ledger_entry_accounts_tax ON ledger_entry_accounts (tenant_id, tax_id, posting_date);

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
                                     sku_count, product_sku, product_name, item_id,
                                     branch_uid, partner_uid, warehouse_uid, warehouse_code, department_uid, tax_id)
  SELECT min(tenant_id), entry_id, branch_id, min(posting_date), account_code, counter, COALESCE(partner_id, 0), sd, sum(debit), sum(credit), count(*), min(line_no),
         count(DISTINCT product_sku),
         CASE WHEN count(DISTINCT product_sku) = 1 THEN min(product_sku) END,
         CASE WHEN count(DISTINCT product_sku) = 1 THEN min(product_name) END,
         CASE WHEN count(DISTINCT product_sku) = 1 AND count(DISTINCT item_id) = 1 THEN min(item_id) END,
         min(branch_uid), min(partner_uid), COALESCE(warehouse_uid, ''), min(warehouse_code), COALESCE(department_uid, ''), COALESCE(tax_id, '')
    FROM x GROUP BY entry_id, account_code, counter, COALESCE(partner_id, 0), sd, branch_id, COALESCE(warehouse_uid, ''), COALESCE(department_uid, ''), COALESCE(tax_id, '');
$$;

CREATE OR REPLACE VIEW bizcity_read.ledger_entry_accounts WITH (security_invoker = true) AS
SELECT tenant_id, entry_id, branch_id, posting_date, account_code, counter_accounts, partner_id, side, debit, credit, line_count, first_line_no,
       sku_count, product_sku, product_name, item_id,
       branch_uid, partner_uid, warehouse_uid, warehouse_code, department_uid, tax_id
  FROM public.ledger_entry_accounts;

-- Dựng lại cho dữ liệu đã có.
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
