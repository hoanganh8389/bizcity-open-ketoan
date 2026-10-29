-- 0025 Bỏ hẳn loại chính sách "Tồn min–max (đặt hàng tự động)" (stock_minmax): tồn max / min đã khai ở bảng stock_levels
--      (màn Tồn max MH16), đề xuất đặt hàng ở Phân tích đặt hàng MH02. 0020 đã chép sang stock_levels và 0021 đã tắt; dòng còn sót
--      (vd nạp lại dữ liệu mẫu sau 0020) chép nốt — mức đã có ở stock_levels thì GIỮ — rồi xoá vĩnh viễn khỏi purchase_policies.
INSERT INTO stock_levels (tenant_id, branch_code, warehouse_code, sku, max_qty, min_qty, source, note)
SELECT p.tenant_id, COALESCE(p.scope->>'branchCode', ''), COALESCE((SELECT w.code FROM warehouses w JOIN branches b ON b.id = w.branch_id
         WHERE b.tenant_id = p.tenant_id AND b.code = p.scope->>'branchCode' AND w.is_default ORDER BY w.id LIMIT 1), ''),
       p.scope->>'sku', GREATEST(COALESCE((p.rule->>'max')::numeric, 0), 0), GREATEST(COALESCE((p.rule->>'min')::numeric, 0), 0), 'manual', p.name
  FROM purchase_policies p
 WHERE p.kind = 'stock_minmax' AND COALESCE(p.scope->>'sku', '') <> '' AND COALESCE(p.scope->>'branchCode', '') <> ''
   AND COALESCE((p.rule->>'max')::numeric, 0) > 0
ON CONFLICT (tenant_id, branch_code, warehouse_code, sku) DO NOTHING;

DELETE FROM purchase_policies WHERE kind = 'stock_minmax';
