-- [2026-11-11 Nguyễn Văn Thủy] DM Tài khoản (ACC1) theo chuẩn danh mục phổ biến: thêm Diễn giải (đóng góp)
-- =============================================================================
-- 0101 Diễn giải của tài khoản (docs/cap-nhat-ux/08-dm-tai-khoan.md).
--   Danh sách hệ thống tài khoản hiện: Số TK · Tên · Tính chất · Tên tiếng Anh · Diễn giải · Trạng thái.
--   Diễn giải = ghi chú cách dùng tài khoản (vd "Chỉ dùng cho chi nhánh Phú Thọ"); không ảnh hưởng ghi sổ.
-- =============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
COMMENT ON COLUMN accounts.description IS 'Diễn giải: ghi chú cách dùng tài khoản, hiện ở danh mục; không ảnh hưởng ghi sổ';
