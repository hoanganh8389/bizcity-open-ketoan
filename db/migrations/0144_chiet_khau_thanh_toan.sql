-- [2026-11-15 Nguyễn Văn Thủy] Khoá payment_discount_income (chiết khấu thanh toán được hưởng, 515) cho đơn vị đang có (đóng góp)
-- Trước đây khoản này chọn ở Cài đặt mua hàng (tài khoản riêng) hoặc tự chọn theo hệ thống tài khoản; nay khai một nơi ở Quy tắc hạch toán.
-- Chọn như cách phần mềm đang tự chọn (5152 → 5158 → tài khoản chi tiết 515 đầu tiên) nên bút toán không đổi.
INSERT INTO posting_defaults (tenant_id, key, account_code)
SELECT DISTINCT ON (a.tenant_id) a.tenant_id, 'payment_discount_income', a.code
  FROM accounts a
 WHERE a.is_posting AND a.is_active AND a.code LIKE '515%'
 ORDER BY a.tenant_id, CASE a.code WHEN '5152' THEN 0 WHEN '5158' THEN 1 ELSE 2 END, a.code
ON CONFLICT (tenant_id, key) DO NOTHING;
