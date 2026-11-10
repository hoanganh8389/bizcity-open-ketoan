-- [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — tài khoản ngầm định theo mặt hàng: doanh thu, trả lại, giá vốn, kho (công tắc lý do / nhóm hạch toán tắt) (đóng góp)
-- =============================================================================
-- 0100 Tài khoản ngầm định theo mặt hàng (docs/nghiep-vu/18-bo-ly-do-loai-nghiep-vu.md).
--   Công tắc bizcity.posting.use_reasons TẮT (mặc định): bộ định khoản không đọc lý do, nhóm hạch toán, tài khoản theo mặt hàng —
--   doanh thu / hàng bán trả lại / giá vốn / kho lấy ở Tài khoản ngầm định (ACC41) bốn khoá mới dưới đây; trường hợp riêng (hàng
--   khuyến mại, vật tư…) là định khoản thêm ở ACC41 / quy tắc ở ACC92 theo loại hàng.
--   Đơn vị đang có: chép từ nhóm hạch toán mặc định (giữ đúng tài khoản đang dùng cho phần lớn mặt hàng). Không ghi đè khoá đã có.
-- =============================================================================

INSERT INTO posting_defaults (tenant_id, key, account_code)
SELECT g.tenant_id, k.key, k.acc
  FROM product_posting_groups g
 CROSS JOIN LATERAL (VALUES ('revenue', g.revenue_account), ('sales_return', g.sales_return_account), ('cogs', g.cogs_account), ('inventory', g.inventory_account)) AS k(key, acc)
 WHERE g.is_default AND k.acc IS NOT NULL AND k.acc <> ''
ON CONFLICT DO NOTHING;
