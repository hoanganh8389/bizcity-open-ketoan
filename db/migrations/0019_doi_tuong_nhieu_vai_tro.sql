-- 0019 Một đối tượng nhiều vai trò: vừa là nhà cung cấp vừa là khách hàng (cùng một mã, công nợ 131 / 331 vẫn tách theo tài khoản).
--      kind = vai trò chính; also_kinds = các vai trò thêm (customer / supplier). Danh sách lọc theo kiểu lấy cả vai trò thêm.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS also_kinds text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN partners.also_kinds IS 'Vai trò thêm ngoài kind (vd NCC vừa là khách hàng: kind = supplier, also_kinds = {customer}). Lọc danh sách theo kiểu lấy cả vai trò thêm.';
