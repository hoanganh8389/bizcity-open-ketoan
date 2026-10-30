-- =============================================================================
-- Xoá SẠCH dữ liệu phân hệ Mua hàng của MỘT đơn vị (gọi từ scripts/lam-sach-mua-hang.sh, biến :'tenant', :'chay').
--
-- Xoá:  mọi chứng từ mua hàng (đơn đặt, phiếu nhập, trả / đổi NCC, trả tiền, ứng trước, chi phí, thưởng, quà…), chính sách
--       mua hàng, hoá đơn NCC (MH22), tệp đính kèm của chứng từ / chính sách; cùng chứng từ kế toán chúng sinh ra (kể cả bản
--       đã huỷ khi bỏ duyệt): bút toán, công nợ và đối trừ, thẻ kho, sổ hoá đơn, nhật ký định khoản; số dư đầu kỳ của các
--       NCC mẫu (mã NCC-…); số dư nợ đầu kỳ theo nhãn ở Cài đặt mua hàng.
-- Giữ:  chứng từ kéo từ trang quản trị (bán, hoàn, kho…), phiếu cân tồn khởi đầu (MH20), giá mua NCC, tồn max, danh mục,
--       người dùng, cài đặt khác (ngày lễ, tài khoản…), tệp hồ sơ NCC.
-- :'chay' = 1 thì xoá thật (COMMIT); khác 1 thì chỉ đếm, cuối cùng ROLLBACK — không đổi gì.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _t ON COMMIT DROP AS SELECT id FROM tenants WHERE code = :'tenant';

-- 1. Chứng từ kế toán của phân hệ Mua hàng
CREATE TEMP TABLE _ev ON COMMIT DROP AS
SELECT e.id FROM accounting_events e
 WHERE e.tenant_id IN (SELECT id FROM _t)
   AND (
     e.doc_key LIKE 'mh:%'                                                            -- phiếu hàng, chi phí, thưởng, quà
     OR e.id IN (SELECT (l->>'eventId')::bigint FROM purchase_documents d, jsonb_array_elements(d.links) l
                  WHERE d.tenant_id IN (SELECT id FROM _t) AND l ? 'eventId')            -- phiếu chi / báo nợ đang gắn phiếu
     OR (e.source_system = 'manual' AND e.doc_type IN ('payment', 'bank_payment', 'receipt', 'bank_receipt', 'manual')
         AND e.payload->>'reference' ~ '^(UC|UT|DO|TN|CK|TT|CP|NM|DH|QT|XQ)[0-9]{6,}')   -- kể cả bản đã huỷ / phiếu mẫu đã xoá
     OR (e.source_system = 'manual' AND e.doc_type = 'opening'
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.payload->'lines') x
                          WHERE coalesce(x->>'partnerCode', '') NOT LIKE 'NCC-%' OR x->>'accountCode' NOT LIKE '331%'))
   );
CREATE TEMP TABLE _le ON COMMIT DROP AS SELECT id FROM ledger_entries WHERE event_id IN (SELECT id FROM _ev);
CREATE TEMP TABLE _di ON COMMIT DROP AS SELECT id FROM debt_items WHERE event_id IN (SELECT id FROM _ev);

\echo ''
\echo '== Sẽ xoá'
SELECT 'Chứng từ mua hàng (MH11)       ' AS muc, count(*) AS so FROM purchase_documents WHERE tenant_id IN (SELECT id FROM _t)
UNION ALL SELECT 'Chính sách mua hàng (MH04)     ', count(*) FROM purchase_policies WHERE tenant_id IN (SELECT id FROM _t)
UNION ALL SELECT 'Hoá đơn NCC (MH22)             ', count(*) FROM supplier_invoices WHERE tenant_id IN (SELECT id FROM _t)
UNION ALL SELECT 'Chứng từ kế toán sinh ra       ', count(*) FROM _ev
UNION ALL SELECT '  trong đó số dư đầu kỳ NCC-…  ', count(*) FROM accounting_events WHERE id IN (SELECT id FROM _ev) AND doc_type = 'opening'
UNION ALL SELECT 'Bút toán                       ', count(*) FROM _le
UNION ALL SELECT 'Khoản công nợ                  ', count(*) FROM _di
UNION ALL SELECT 'Dòng thẻ kho                   ', count(*) FROM inventory_movements WHERE event_id IN (SELECT id FROM _ev)
UNION ALL SELECT 'Tệp đính kèm chứng từ / CS     ', count(*) FROM purchase_attachments WHERE tenant_id IN (SELECT id FROM _t) AND owner_type <> 'partner';
\echo '== Giữ nguyên (để đối chiếu)'
SELECT 'Chứng từ kế toán khác          ' AS muc, count(*) AS so FROM accounting_events WHERE tenant_id IN (SELECT id FROM _t) AND id NOT IN (SELECT id FROM _ev)
UNION ALL SELECT 'Giá mua NCC                    ', count(*) FROM supplier_products WHERE tenant_id IN (SELECT id FROM _t)
UNION ALL SELECT 'Tồn max                        ', count(*) FROM stock_levels WHERE tenant_id IN (SELECT id FROM _t);
\echo '== Số dư đầu kỳ NCC sẽ xoá'
SELECT doc_no, doc_date, status, left(payload->>'description', 70) AS dien_giai FROM accounting_events WHERE id IN (SELECT id FROM _ev) AND doc_type = 'opening' ORDER BY id;

-- Chặn: dữ liệu ngoài phân hệ đang dựa vào các chứng từ này (khấu hao, phiếu lặp lại) → dừng, không xoá gì.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM asset_depreciations WHERE event_id IN (SELECT id FROM _ev))
     OR EXISTS (SELECT 1 FROM voucher_recurrence_runs WHERE document_id IN (SELECT id FROM _ev)) THEN
    RAISE EXCEPTION 'Có khấu hao / phiếu lặp lại gắn vào chứng từ mua hàng — dừng, không xoá.';
  END IF;
END $$;

-- 2. Xoá. Sổ / bằng chứng chỉ được thêm (trigger chặn sửa, xoá): tắt trigger trong đúng giao dịch này,
--    nên khoá ngoại không tự xoá theo → xoá lần lượt, bảng con trước.
SET LOCAL session_replication_role = replica;

-- Số dư theo ngày: trừ đúng phần phát sinh của các bút toán bị xoá (ngược với lúc ghi sổ — chỉ tài khoản theo dõi đối
-- tượng mới tách theo đối tượng, còn lại đối tượng 0; như aggregateBalances của sổ cái).
UPDATE ledger_balances_daily b SET debit = b.debit - x.d, credit = b.credit - x.c
  FROM (SELECT l.tenant_id, l.branch_id, l.account_code, l.posting_date,
               CASE WHEN (a.track_partner OR a.is_debt OR a.normal_side = 'both') AND l.partner_id IS NOT NULL THEN l.partner_id ELSE 0 END AS partner_id,
               sum(l.debit) d, sum(l.credit) c
          FROM ledger_lines l LEFT JOIN accounts a ON a.tenant_id = l.tenant_id AND a.code = l.account_code
         WHERE l.entry_id IN (SELECT id FROM _le) GROUP BY 1, 2, 3, 4, 5) x
 WHERE b.tenant_id = x.tenant_id AND b.branch_id = x.branch_id AND b.account_code = x.account_code AND b.posting_date = x.posting_date AND b.partner_id = x.partner_id;
DELETE FROM ledger_balances_daily WHERE tenant_id IN (SELECT id FROM _t) AND debit = 0 AND credit = 0;

DELETE FROM ledger_links  WHERE entry_id IN (SELECT id FROM _le) OR target_entry_id IN (SELECT id FROM _le);
DELETE FROM ledger_lines  WHERE entry_id IN (SELECT id FROM _le);
DELETE FROM ledger_entries WHERE id IN (SELECT id FROM _le);

-- Đối trừ công nợ: phía còn giữ (nếu có) trả lại số đã đối trừ.
UPDATE debt_items k SET settled_amount = k.settled_amount - x.amt
  FROM (SELECT CASE WHEN a.debit_item_id IN (SELECT id FROM _di) THEN a.credit_item_id ELSE a.debit_item_id END AS keep_id, sum(a.amount) amt
          FROM debt_allocations a
         WHERE (a.debit_item_id IN (SELECT id FROM _di)) <> (a.credit_item_id IN (SELECT id FROM _di)) GROUP BY 1) x
 WHERE k.id = x.keep_id;
DELETE FROM debt_allocations WHERE debit_item_id IN (SELECT id FROM _di) OR credit_item_id IN (SELECT id FROM _di);
DELETE FROM debt_items WHERE id IN (SELECT id FROM _di);

DELETE FROM inventory_movements         WHERE event_id IN (SELECT id FROM _ev);
DELETE FROM tax_invoice_lines           WHERE tax_invoice_id IN (SELECT id FROM tax_invoices WHERE event_id IN (SELECT id FROM _ev));
DELETE FROM tax_invoices                WHERE event_id IN (SELECT id FROM _ev);
DELETE FROM posting_log                 WHERE event_id IN (SELECT id FROM _ev);
DELETE FROM document_signatures         WHERE event_id IN (SELECT id FROM _ev);
DELETE FROM cash_transfer_confirmations WHERE event_id IN (SELECT id FROM _ev);
DELETE FROM tax_info_patches            WHERE event_id IN (SELECT id FROM _ev);
UPDATE reference_documents SET used_event_id = NULL WHERE used_event_id IN (SELECT id FROM _ev);
UPDATE payment_requests    SET paid_event_id = NULL WHERE paid_event_id IN (SELECT id FROM _ev);
DELETE FROM accounting_event_versions   WHERE event_id IN (SELECT id FROM _ev);
DELETE FROM accounting_events           WHERE id IN (SELECT id FROM _ev);

-- 3. Bảng của phân hệ
DELETE FROM purchase_attachments  WHERE tenant_id IN (SELECT id FROM _t) AND owner_type <> 'partner';
DELETE FROM supplier_invoice_lines WHERE invoice_id IN (SELECT id FROM supplier_invoices WHERE tenant_id IN (SELECT id FROM _t));
DELETE FROM supplier_invoices     WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM purchase_documents    WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM purchase_policies     WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM document_sequences    WHERE tenant_id IN (SELECT id FROM _t) AND doc_type LIKE 'mh:%';  -- số phiếu mua hàng chạy lại từ 0001
UPDATE tenants SET settings = jsonb_set(settings, '{purchase,brandOpening}', '{}'::jsonb)
 WHERE id IN (SELECT id FROM _t) AND settings->'purchase' ? 'brandOpening';

-- 4. Kiểm sau xoá: sổ còn cân, không còn dòng mồ côi
\echo '== Kiểm sau xoá'
SELECT 'Nợ − Có toàn sổ (phải = 0)' AS muc, coalesce(sum(debit) - sum(credit), 0) AS so FROM ledger_lines WHERE tenant_id IN (SELECT id FROM _t)
UNION ALL SELECT 'Dòng sổ không có bút toán', count(*) FROM ledger_lines l WHERE l.tenant_id IN (SELECT id FROM _t) AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.id = l.entry_id)
UNION ALL SELECT 'Bút toán không có chứng từ', count(*) FROM ledger_entries e WHERE e.tenant_id IN (SELECT id FROM _t) AND e.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting_events a WHERE a.id = e.event_id)
UNION ALL SELECT 'Số dư ngày lệch sổ (nhóm)', count(*) FROM (
    SELECT branch_id, account_code, posting_date FROM (
      SELECT branch_id, account_code, posting_date, sum(debit) d, sum(credit) c FROM ledger_lines WHERE tenant_id IN (SELECT id FROM _t) GROUP BY 1, 2, 3) l
    FULL JOIN (SELECT branch_id, account_code, posting_date, sum(debit) d, sum(credit) c FROM ledger_balances_daily WHERE tenant_id IN (SELECT id FROM _t) GROUP BY 1, 2, 3) b
    USING (branch_id, account_code, posting_date)
    WHERE coalesce(l.d, 0) <> coalesce(b.d, 0) OR coalesce(l.c, 0) <> coalesce(b.c, 0)) z;

-- Kiểm không đạt thì dừng (lỗi → psql thoát, giao dịch bị huỷ, không xoá gì).
DO $$
BEGIN
  IF (SELECT coalesce(sum(debit) - sum(credit), 0) FROM ledger_lines WHERE tenant_id IN (SELECT id FROM _t)) <> 0
     OR EXISTS (SELECT 1 FROM (
          SELECT branch_id, account_code, posting_date, partner_id, sum(debit) d, sum(credit) c FROM ledger_balances_daily WHERE tenant_id IN (SELECT id FROM _t) GROUP BY 1, 2, 3, 4) b
        FULL JOIN (
          SELECT l.branch_id, l.account_code, l.posting_date,
                 CASE WHEN (a.track_partner OR a.is_debt OR a.normal_side = 'both') AND l.partner_id IS NOT NULL THEN l.partner_id ELSE 0 END AS partner_id,
                 sum(l.debit) d, sum(l.credit) c
            FROM ledger_lines l LEFT JOIN accounts a ON a.tenant_id = l.tenant_id AND a.code = l.account_code
           WHERE l.tenant_id IN (SELECT id FROM _t) GROUP BY 1, 2, 3, 4) l
        USING (branch_id, account_code, posting_date, partner_id)
        WHERE coalesce(l.d, 0) <> coalesce(b.d, 0) OR coalesce(l.c, 0) <> coalesce(b.c, 0)) THEN
    RAISE EXCEPTION 'Kiểm sau xoá không đạt (sổ không cân / số dư ngày lệch) — huỷ, không xoá gì.';
  END IF;
END $$;

SELECT CASE WHEN :'chay' = '1' THEN 'COMMIT' ELSE 'ROLLBACK' END AS ket_thuc \gset
\echo '== Kết thúc giao dịch:' :ket_thuc
:ket_thuc;
