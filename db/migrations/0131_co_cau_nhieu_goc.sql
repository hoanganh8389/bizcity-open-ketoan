-- [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức một màn: nhiều gốc (nhiều công ty cha) + loại nút Công ty / Đơn vị (đóng góp)
--
-- Trước đây cây chỉ có một gốc (Công ty). Nay khai được nhiều công ty cha song song, và công ty con nằm trong cây
-- (loại nút 'company'). Các cấp còn lại là 'unit' — gọi theo cấp (Cơ cấu cấp 1, cấp 2…), người dùng tự đặt tên nút.
-- Cửa hàng / chi nhánh (branches), kho (warehouses), phòng ban (dimensions) vẫn ở bảng riêng, chỉ gắn vào nút.

DROP INDEX IF EXISTS org_units_one_root;

ALTER TABLE org_units ADD COLUMN kind text NOT NULL DEFAULT 'unit';
ALTER TABLE org_units ADD CONSTRAINT org_units_kind_check CHECK (kind IN ('company', 'unit'));
UPDATE org_units SET kind = 'company' WHERE parent_id IS NULL;
COMMENT ON COLUMN org_units.kind IS 'Loại nút: company = công ty (có MST, có thể là gốc hoặc công ty con), unit = đơn vị cơ cấu (0131).';
