-- [2026-11-15 Nguyễn Văn Thủy] Tài khoản của quy tắc cho đơn vị đang có: giá vốn hàng tặng kèm, doanh thu / giá vốn bán nội bộ (đóng góp)
-- gift_cogs: chép từ giá vốn hàng bán — bộ định khoản chưa có khoá này vẫn dùng giá vốn hàng bán, nên bút toán không đổi.
-- internal_revenue / internal_cogs: bán cho chi nhánh khác (lý do bán nội bộ) — 51116 / 6326 nếu là tài khoản chi tiết của đơn vị.
INSERT INTO posting_defaults (tenant_id, key, account_code)
SELECT tenant_id, 'gift_cogs', account_code FROM posting_defaults WHERE key = 'cogs'
ON CONFLICT (tenant_id, key) DO NOTHING;

INSERT INTO posting_defaults (tenant_id, key, account_code)
SELECT a.tenant_id, k.key, a.code
  FROM (VALUES ('internal_revenue', '51116'), ('internal_cogs', '6326')) AS k(key, code)
  JOIN accounts a ON a.code = k.code AND a.is_posting AND a.is_active
ON CONFLICT (tenant_id, key) DO NOTHING;
