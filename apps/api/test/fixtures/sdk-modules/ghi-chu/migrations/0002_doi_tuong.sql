-- Module thử ghi-chu (PHASE-014 W4): ghi chú gắn với một đối tượng (mã danh mục chuẩn, không khoá ngoại sang bảng Core).
ALTER TABLE notes ADD COLUMN partner_code text;
COMMENT ON COLUMN notes.partner_code IS 'Mã đối tượng (danh mục chuẩn) ghi chú nói tới; tuỳ chọn.';
