-- 0023 Quà khuyến mại cho người tiêu dùng nhận kèm phiếu mua (KM NTD, không chia giá): vẫn vào kho nhưng KHÔNG tính vào đơn giá
--      bình quân tháng (không làm giảm giá vốn hàng bán). Quà KM người bán (chia giá) vẫn tính như cũ.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS exclude_cost boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN inventory_movements.exclude_cost IS 'Không tính vào tử / mẫu đơn giá bình quân tháng (quà KM người tiêu dùng nhận kèm phiếu mua). Vẫn cộng vào tồn.';

-- Phiếu nhập đã duyệt trước đây: dòng hàng tặng của phiếu mua hàng là quà KM người tiêu dùng (cùng mã không có dòng KM người bán)
-- thì đánh dấu lại để tính lại giá vốn tháng cho đúng.
UPDATE inventory_movements m SET exclude_cost = true
  FROM purchase_documents d
 WHERE m.kind = 'purchase' AND m.is_gift AND NOT m.exclude_cost AND d.tenant_id = m.tenant_id
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.links) k WHERE k->>'eventId' = m.event_id::text)
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.data->'lines') l WHERE l->>'sku' = m.sku AND l->>'lineType' = 'gift_consumer')
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.data->'lines') l WHERE l->>'sku' = m.sku AND l->>'lineType' = 'gift_seller');
