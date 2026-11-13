-- [2026-11-13 Nguyễn Văn Thủy] bộ phận = phòng ban chức năng; shop không còn là bộ phận riêng (đóng góp)
-- =============================================================================
-- 0123 Bộ phận chỉ còn phòng ban chức năng (Bán hàng, Mua hàng, Kế toán, Kho vận…). "Ở shop nào" đã có trên từng dòng sổ
--   (chi nhánh / kho, 0121) nên không cần mỗi shop một bộ phận nữa.
--   · Chi nhánh đang gắn bộ phận dạng BH + mã cửa hàng → gắn bộ phận "BH" (Bán hàng).
--   · Bộ phận dạng BH + mã cửa hàng → ngừng dùng (giữ lại, không xoá: dòng sổ cũ vẫn tra được tên).
--   · Đơn vị chưa có bộ phận "BH" thì thêm. Dòng sổ đã ghi giữ nguyên.
-- =============================================================================
INSERT INTO dimensions (tenant_id, kind, code, name)
SELECT DISTINCT b.tenant_id, 'department', 'BH', 'Bán hàng' FROM branches b
 WHERE b.department_code ~ '^BH[0-9]'
   AND NOT EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = b.tenant_id AND d.kind = 'department' AND d.code = 'BH');
UPDATE dimensions SET is_active = true WHERE kind = 'department' AND code = 'BH';
UPDATE branches SET department_code = 'BH' WHERE department_code ~ '^BH[0-9]';
UPDATE dimensions SET is_active = false WHERE kind = 'department' AND code ~ '^BH[0-9]';
