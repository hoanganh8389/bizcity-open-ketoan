-- 0021 Tồn min–max cũ (chính sách stock_minmax) đã chép sang stock_levels ở 0020 — tắt để không còn hai nơi khai.
--      Khai / sửa tồn max ở màn Tồn max (MH16) hoặc thẻ Mua hàng của mặt hàng (ghi stock_levels).
UPDATE purchase_policies SET is_active = false, updated_at = now() WHERE kind = 'stock_minmax' AND is_active;
