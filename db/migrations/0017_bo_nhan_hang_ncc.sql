-- =============================================================================
-- 0017 Nhãn hàng chỉ khai MỘT chỗ: danh mục mặt hàng (products.brand_code, cây Ngành → Nhãn → Nhóm). Bỏ "nhãn hàng chính"
--      của nhà cung cấp (bản thử chưa lên máy chủ thật). Phiếu mua tự suy nhãn từ các dòng hàng; dòng mang nhãn của mặt hàng.
-- =============================================================================
ALTER TABLE partners DROP COLUMN IF EXISTS main_brand_code;
COMMENT ON COLUMN purchase_documents.brand_code IS 'Nhãn hàng chính của phiếu — máy chủ tự suy: nhãn (theo danh mục mặt hàng) chiếm giá trị hàng mua lớn nhất. Số liệu theo nhãn tính theo phần nhãn của từng dòng (data.lines[].brandCode).';
