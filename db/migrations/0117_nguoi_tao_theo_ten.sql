-- [2026-11-12 Nguyễn Văn Thủy] người tạo / sửa ghi họ tên thay cho "user:<id>" (đóng góp)
-- 0117 Đổi các dòng đã ghi "user:<id>" (0114, 0116) sang họ tên người dùng. Không chạm sổ.
UPDATE products p SET created_by = u.full_name FROM users u WHERE p.created_by = 'user:' || u.id::text AND u.full_name <> '';
UPDATE item_classes c SET created_by = u.full_name FROM users u WHERE c.created_by = 'user:' || u.id::text AND u.full_name <> '';
UPDATE item_classes c SET updated_by = u.full_name FROM users u WHERE c.updated_by = 'user:' || u.id::text AND u.full_name <> '';
UPDATE item_class_history c SET by_user = u.full_name FROM users u WHERE c.by_user = 'user:' || u.id::text AND u.full_name <> '';
