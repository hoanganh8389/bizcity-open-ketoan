-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — đối chiếu dữ liệu kế toán một đơn vị (R-REV-6): cân sổ, công nợ ↔ 331, sổ hoá đơn ↔ 1331, kho ↔ 156, làm tròn, mã hàng, ĐVT.
-- Chỉ đọc. Dùng khi rà soát việc của người đóng góp (docs/rules/RULE-REVIEW.md), sau khi nạp bộ tình huống của phân hệ:
--   docker exec -i <db> psql -U ketoan -d <csdl> -v tenant=<mã đơn vị> -P pager=off < scripts/doi-chieu-ke-toan.sql
-- Mỗi mục in "lech" — khác 0 là phải giải thích trong biên bản. Mục 3b liệt kê sự việc ghi 1331 mà không có hoá đơn.
\set t '(select id from tenants where code = ' :'tenant' ')'

\echo '== 1. Cân sổ (Nợ − Có, phải 0)'
select sum(debit) no_, sum(credit) co, sum(debit) - sum(credit) lech from ledger_lines where tenant_id = :t;

\echo '== 2. Công nợ phải trả: khoản mở (debt_items) ↔ số dư 331 theo đối tượng'
with di as (
  select partner_id, sum(case side when 'credit' then amount - settled_amount else -(amount - settled_amount) end) mo
  from debt_items where tenant_id = :t and account_code like '331%' group by partner_id),
so as (select partner_id, sum(credit - debit) du from ledger_lines where tenant_id = :t and account_code like '331%' group by partner_id)
select p.code, coalesce(di.mo, 0) cong_no_mo, coalesce(so.du, 0) so_du_331, coalesce(di.mo, 0) - coalesce(so.du, 0) lech
from di full join so using (partner_id) left join partners p on p.id = coalesce(di.partner_id, so.partner_id) order by p.code;

\echo '== 2b. Công nợ phải thu: khoản mở ↔ số dư 131 theo đối tượng'
with di as (
  select partner_id, sum(case side when 'debit' then amount - settled_amount else -(amount - settled_amount) end) mo
  from debt_items where tenant_id = :t and account_code like '131%' group by partner_id),
so as (select partner_id, sum(debit - credit) du from ledger_lines where tenant_id = :t and account_code like '131%' group by partner_id)
select p.code, coalesce(di.mo, 0) cong_no_mo, coalesce(so.du, 0) so_du_131, coalesce(di.mo, 0) - coalesce(so.du, 0) lech
from di full join so using (partner_id) left join partners p on p.id = coalesce(di.partner_id, so.partner_id)
where abs(coalesce(di.mo, 0) - coalesce(so.du, 0)) > 0.5 order by p.code;

\echo '== 3. Thuế GTGT đầu vào: sổ hoá đơn (tax_invoices input) ↔ phát sinh 133'
select (select coalesce(sum(total_tax * sign), 0) from tax_invoices where tenant_id = :t and direction = 'input') thue_so_hoa_don,
       (select coalesce(sum(debit - credit), 0) from ledger_lines where tenant_id = :t and account_code like '133%') phat_sinh_133;
\echo '== 3b. Sự việc ghi 133 lệch sổ hoá đơn (thường: phiếu chưa có số hoá đơn)'
with so as (
  select e.event_id, max(e.doc_no) doc_no, max(e.doc_type) doc_type, sum(ll.debit - ll.credit) thue_so
  from ledger_entries e join ledger_lines ll on ll.entry_id = e.id
  where e.tenant_id = :t and e.status = 'posted' and ll.account_code like '133%' group by e.event_id),
hd as (select event_id, sum(total_tax * sign) thue_hd from tax_invoices where tenant_id = :t group by event_id)
select so.doc_no, so.doc_type, so.thue_so, coalesce(hd.thue_hd, 0) thue_hoa_don, so.thue_so - coalesce(hd.thue_hd, 0) lech
from so left join hd using (event_id) where abs(so.thue_so - coalesce(hd.thue_hd, 0)) > 0.5 order by so.doc_no;

\echo '== 4. Kho: giá trị thẻ kho (inventory_movements) ↔ số dư 156'
select (select coalesce(sum(amount), 0) from inventory_movements where tenant_id = :t) gia_tri_the_kho,
       (select coalesce(sum(debit - credit), 0) from ledger_lines where tenant_id = :t and account_code like '156%') so_du_156;

\echo '== 5. Làm tròn: số tiền không tròn đồng (phải 0)'
select 'dòng sổ' cho, count(*) from ledger_lines where tenant_id = :t and (debit <> round(debit) or credit <> round(credit))
union all
select 'phiếu mua đã duyệt', count(*) from purchase_documents where tenant_id = :t and status = 'approved'
  and (total <> round(total) or total_tax <> round(total_tax) or total_before_tax <> round(total_before_tax));

\echo '== 6. Mã hàng theo SKU_RULE (modules/catalog/sku-rule.ts): 2 + 3 + 1 + 3 số; quà Q + 3 + 1 + 4; đuôi biến thể chữ hoa'
select sku, name from products where tenant_id = :t and sku !~ '^([0-9]{9}|Q[0-9]{8})[A-Z]{0,2}$' order by sku;
\echo '== 6b. Mã hàng trùng khi bỏ khoảng trắng / đổi hoa thường'
select upper(btrim(sku)) ma, count(*), string_agg(sku, ' | ') from products where tenant_id = :t group by 1 having count(*) > 1;

\echo '== 7. ĐVT: mặt hàng thiếu ĐVT gốc tỉ lệ 1, hoặc không đúng một ĐVT mua mặc định'
select p.sku, count(u.*) filter (where u.ratio = 1) dvt_goc, count(u.*) filter (where u.is_purchase_default) dvt_mua
from products p left join product_units u on u.tenant_id = p.tenant_id and u.sku = p.sku
where p.tenant_id = :t group by p.sku
having count(u.*) > 0 and (count(u.*) filter (where u.ratio = 1) <> 1 or count(u.*) filter (where u.is_purchase_default) > 1)
order by p.sku;
