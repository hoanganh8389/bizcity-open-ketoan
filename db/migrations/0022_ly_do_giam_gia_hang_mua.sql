-- 0022 Phiếu thưởng / chiết khấu sau mua (phân hệ Mua hàng) ghi như trả hàng NCC số lượng 0. Trước đây không ghi lý do nên
--      lấy lý do trả hàng mặc định (XTR1, cờ returnAtOpeningCost): giá vốn tháng định giá theo tồn đầu × SL trả = 0, khoản
--      thưởng bị bỏ qua. Nay phiếu thưởng mang lý do GGHM (chép tài khoản của lý do trả hàng mặc định, bỏ cờ đó) — tính giá
--      vốn lấy đúng số tiền giảm. Chuyển lý do cho phiếu thưởng đã duyệt; tính lại giá vốn tháng để áp.
INSERT INTO posting_reasons (tenant_id, code, name, kind, counter_account, revenue_account, expense_account, flags)
SELECT DISTINCT ON (d.tenant_id) d.tenant_id, 'GGHM', 'Giảm giá hàng mua (thưởng / chiết khấu sau mua)', 'out',
       r.counter_account, r.revenue_account, r.expense_account,
       (COALESCE(r.flags, '{"postToLedger": true}'::jsonb) - 'returnAtOpeningCost' - 'default') || '{"module": "mua-hang"}'::jsonb
  FROM purchase_documents d
  LEFT JOIN posting_reasons r ON r.tenant_id = d.tenant_id AND r.flags->>'default' = 'purchase_return'
 WHERE d.kind = 'rebate' AND d.status = 'approved'
 ORDER BY d.tenant_id, r.id
ON CONFLICT (tenant_id, code) DO NOTHING;

UPDATE inventory_movements m SET reason_code = 'GGHM'
  FROM purchase_documents d, jsonb_array_elements(d.links) l
 WHERE d.kind = 'rebate' AND d.status = 'approved' AND m.tenant_id = d.tenant_id
   AND m.event_id = (l->>'eventId')::bigint AND m.kind = 'purchase_return' AND m.reason_code IS DISTINCT FROM 'GGHM';
