-- [2026-11-13 Nguyễn Văn Thủy] Chi nhánh chưa gắn bộ phận → Bán hàng (BH) (đóng góp)
-- Bộ phận là phòng ban chức năng (0123); form chi nhánh không còn ô Bộ phận, chi nhánh mới mặc định BH.
-- Chi nhánh cũ còn trống thì gắn BH để chứng từ vào tài khoản theo dõi bộ phận không bị chặn.
UPDATE branches b SET department_code = 'BH'
 WHERE b.department_code IS NULL
   AND EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = b.tenant_id AND d.kind = 'department' AND d.code = 'BH' AND d.is_active);
