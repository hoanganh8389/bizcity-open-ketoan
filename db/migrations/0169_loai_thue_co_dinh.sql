-- [2026-11-19 kiennt] NT-DM-012 — Loại thuế GTGT cố định theo quy định nhà nước; bỏ Chiều, bỏ Tài khoản; TSCĐ 1332 theo quy tắc (đóng góp)
-- =============================================================================
-- 0169 Loại thuế GTGT cố định (NT-DM-012).
--
-- Thuế suất / loại chịu thuế GTGT do nhà nước quy định → phần mềm cấu hình sẵn 6 loại, người dùng chỉ xem:
--   KCT · 0 · 5 · 8 (đến hết 31/12/2026, NQ 204/2025/QH15) · 10 · KKKN.
--   - Chiều 'both': một loại dùng cho cả mua và bán; hoá đơn mua hay bán do loại chứng từ quyết định.
--   - account_code NULL: tiền thuế ghi vào TK của Quy tắc hạch toán (ACC41): tax_input 1331, tax_output 33311,
--     tax_input_fixed_asset 1332 (khoá mới — thuế mua tài sản cố định).
-- 51 mã cũ (V…, R…) GIỮ NGUYÊN để chứng từ đã ghi, máy bán POS và cầu nối website vẫn ghi sổ như trước; đánh dấu is_legacy,
-- replaced_by = loại mới tương ứng (mã chưa xác định được loại để trống — chờ kế toán, NT-DM-012 mục 8). Màn chọn thuế chỉ hiện 6 loại.
-- Mặt hàng: tax_out_code / tax_in_code đổi sang loại mới khi mã cũ có replaced_by (mua và bán cùng một loại).
-- Đường lui: xoá 4 dòng mã 0 / 5 / 8 / 10, trả KCT về (output, 33311) và KKKN về (input, 1331), bỏ cờ is_legacy / replaced_by,
--   trả mặt hàng theo item_classification phiên bản trước; xoá khoá tax_input_fixed_asset; bỏ 5 cột mới, trả ràng buộc chiều cũ.
-- =============================================================================

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_direction_check;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_direction_check CHECK (direction = ANY (ARRAY['output'::text, 'input'::text, 'both'::text]));

ALTER TABLE tax_codes
  ADD COLUMN IF NOT EXISTS valid_from  date,
  ADD COLUMN IF NOT EXISTS valid_to    date,
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS is_legacy   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaced_by text;

COMMENT ON COLUMN tax_codes.direction IS 'Chiều: both = loại thuế cố định dùng cho cả mua và bán (NT-DM-012); output / input = mã cũ trước NT-DM-012 (bán ra / mua vào).';
COMMENT ON COLUMN tax_codes.account_code IS 'Tài khoản thuế của mã cũ. Loại thuế cố định để trống: TK theo Quy tắc hạch toán ACC41 (tax_input 1331, tax_output 33311, tax_input_fixed_asset 1332).';
COMMENT ON COLUMN tax_codes.valid_from IS 'Ngày bắt đầu hiệu lực của thuế suất (trống = không giới hạn). Chứng từ ngày trước đó không dùng được loại thuế này.';
COMMENT ON COLUMN tax_codes.valid_to IS 'Ngày hết hiệu lực của thuế suất (trống = không giới hạn), vd 8% đến 31/12/2026 theo NQ 204/2025/QH15. Chứng từ ngày sau đó không ghi sổ được.';
COMMENT ON COLUMN tax_codes.legal_basis IS 'Căn cứ pháp lý của loại thuế (luật, nghị quyết, nghị định).';
COMMENT ON COLUMN tax_codes.is_legacy IS 'Mã cũ trước NT-DM-012 (V…, R…): vẫn ghi sổ như trước để không đổi chứng từ đã ghi; không hiện ở ô chọn thuế.';
COMMENT ON COLUMN tax_codes.replaced_by IS 'Mã cũ: loại thuế cố định tương ứng (dùng khi quy đổi mặt hàng, tệp Excel cũ). Trống = chưa xác định được loại (chờ kế toán).';

-- 6 loại thuế cố định cho mọi đơn vị (KCT, KKKN đã có: chuyển thành loại cố định).
INSERT INTO tax_codes (tenant_id, code, name, rate, direction, account_code, report_group, is_active, is_legacy, replaced_by, valid_from, valid_to, legal_basis)
SELECT t.id, v.code, v.name, v.rate, 'both', NULL, v.grp, true, false, NULL, NULL, v.valid_to, v.basis
  FROM tenants t
 CROSS JOIN (VALUES
   ('KCT',  'Không chịu thuế GTGT',                         0::numeric,  'KCT', NULL::date,         'Luật Thuế GTGT số 48/2024/QH15'),
   ('0',    'Thuế suất 0%',                                 0::numeric,  '0',   NULL::date,         'Luật Thuế GTGT số 48/2024/QH15'),
   ('5',    'Thuế suất 5%',                                 5::numeric,  '5',   NULL::date,         'Luật Thuế GTGT số 48/2024/QH15'),
   ('8',    'Thuế suất 8% (giảm từ 10%)',                   8::numeric,  '8',   DATE '2026-12-31',  'Nghị quyết 204/2025/QH15; Nghị định 174/2025/NĐ-CP'),
   ('10',   'Thuế suất 10%',                                10::numeric, '10',  NULL::date,         'Luật Thuế GTGT số 48/2024/QH15'),
   ('KKKN', 'Không phải kê khai, tính nộp thuế GTGT',       0::numeric,  'KKK', NULL::date,         'Luật Thuế GTGT số 48/2024/QH15 và văn bản hướng dẫn')
 ) AS v(code, name, rate, grp, valid_to, basis)
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name = EXCLUDED.name, rate = EXCLUDED.rate, direction = 'both', account_code = NULL, report_group = EXCLUDED.report_group,
       is_active = true, is_legacy = false, replaced_by = NULL, valid_to = EXCLUDED.valid_to, legal_basis = EXCLUDED.legal_basis;

-- Mã cũ → loại cố định (theo nhóm bảng kê + thuế suất của dữ liệu gốc). Mã chưa xác định (R05B, R08B, R10B, V05B, V05S, V071, V20…) để trống.
UPDATE tax_codes c
   SET is_legacy = true, replaced_by = m.new
  FROM tax_codes c2
  LEFT JOIN (VALUES
  ('R00K','KCT'), ('V13K','KCT'),
  ('R00','0'), ('R00C','0'), ('R00D','0'), ('R00L','0'), ('V00','0'), ('V00C','0'), ('V00D','0'), ('V00K','0'), ('V105','0'), ('V10B','0'), ('V11B','0'), ('V13B','0'),
  ('R05','5'), ('R05A','5'), ('R05C','5'), ('V05','5'), ('V051','5'), ('V053','5'), ('V054','5'), ('V05C','5'), ('V51A','5'), ('V53A','5'), ('V54A','5'),
  ('R08','8'), ('R08A','8'), ('R08C','8'), ('V08','8'), ('V081','8'), ('V083','8'),
  ('R10','10'), ('R10A','10'), ('R10C','10'), ('V10','10'), ('V101','10'), ('V103','10'), ('V104','10'), ('V10C','10'), ('V11A','10'), ('V13A','10'), ('V14A','10')
  ) AS m(old, new) ON m.old = c2.code
 WHERE c.id = c2.id AND c2.code NOT IN ('KCT', '0', '5', '8', '10', 'KKKN');

-- Mã cũ 8% (R08, V08…) KHÔNG đặt hết hiệu lực: máy bán POS / website còn gửi mã cũ — sau 31/12/2026 vẫn ghi sổ, phép kiểm
-- VAT_REDUCED_RATE cảnh báo như trước (không chặn doanh thu). Chỉ loại cố định 8 bị chặn theo hiệu lực.

-- Khoá mới của Quy tắc hạch toán: thuế GTGT được khấu trừ của TSCĐ (TT 99/2025/TT-BTC: 1332). Chỉ thêm ở đơn vị có TK 1332.
INSERT INTO posting_defaults (tenant_id, key, account_code)
SELECT a.tenant_id, 'tax_input_fixed_asset', a.code FROM accounts a WHERE a.code = '1332'
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Mặt hàng: một loại thuế cho cả bán và mua (mã VAT ra cũ có loại tương ứng).
UPDATE products p
   SET tax_out_code = c.replaced_by, tax_in_code = c.replaced_by, updated_at = now()
  FROM tax_codes c
 WHERE c.tenant_id = p.tenant_id AND c.code = p.tax_out_code AND c.is_legacy AND c.replaced_by IS NOT NULL;
-- Mặt hàng chưa có mã VAT ra nhưng có mã VAT vào cũ: lấy loại theo mã vào.
UPDATE products p
   SET tax_out_code = c.replaced_by, tax_in_code = c.replaced_by, updated_at = now()
  FROM tax_codes c
 WHERE p.tax_out_code IS NULL AND c.tenant_id = p.tenant_id AND c.code = p.tax_in_code AND c.is_legacy AND c.replaced_by IS NOT NULL;
-- Mặt hàng đã ở loại cố định (vd KCT) mà mã VAT vào còn mã cũ: dùng cùng một loại.
UPDATE products p
   SET tax_in_code = p.tax_out_code, updated_at = now()
  FROM tax_codes c
 WHERE c.tenant_id = p.tenant_id AND c.code = p.tax_out_code AND NOT c.is_legacy AND p.tax_in_code IS DISTINCT FROM p.tax_out_code;
