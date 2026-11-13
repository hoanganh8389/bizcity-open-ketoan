-- [2026-11-12 Nguyễn Văn Thủy] mặt hàng: người sửa lần cuối (đóng góp)
-- 0120 products.updated_by: người sửa lần cuối (form / Excel ghi họ tên). Mặt hàng có từ trước: để trống. Không chạm sổ.
ALTER TABLE products ADD COLUMN updated_by text NOT NULL DEFAULT '';
