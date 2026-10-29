-- 0027 Hàng KHÔNG CHỊU THUẾ GTGT (KCT) khi MUA vào: mã thuế đầu vào V13K "Thuế GTGT đầu vào 0% (không chịu VAT)" (đúng mã đang dùng ở
--      dữ liệu thật). Mặt hàng chỉ khai thuế bán ra KCT / R00K mà bỏ trống thuế mua vào thì phiếu mua tự lấy 8% — sai; điền V13K.
INSERT INTO tax_codes (tenant_id, code, name, rate, direction, account_code, report_group)
SELECT t.id, 'V13K', 'Thuế GTGT đầu vào 0% (không chịu VAT)', 0, 'input', '1331', 'KCT' FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

UPDATE products SET tax_in_code = 'V13K', updated_at = now()
 WHERE tax_in_code IS NULL AND tax_out_code IN ('KCT', 'R00K');
