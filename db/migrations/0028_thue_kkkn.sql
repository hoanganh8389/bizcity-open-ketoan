-- 0028 Mã thuế KKKN "HH, DV không phải kê khai, tính nộp VAT" (quà không hoá đơn, hàng tự mua không VAT): trước chỉ có ở đơn vị
--      nạp dữ liệu mẫu hoặc khôi phục danh mục Loại thuế — đơn vị mới thiếu nên dòng quà mã KKKN không ghi sổ được. Thêm cho mọi đơn vị
--      (đã có thì giữ nguyên); đơn vị tạo sau lấy từ dữ liệu khởi tạo.
INSERT INTO tax_codes (tenant_id, code, name, rate, direction, account_code, report_group)
SELECT t.id, 'KKKN', 'HH, DV không phải kê khai, tính nộp VAT', 0, 'input', '1331', 'KKK' FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;
