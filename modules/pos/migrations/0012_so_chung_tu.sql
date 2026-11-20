-- Module pos (phiếu NT-BH-033, docs/nghiep-vu/26): đơn máy bán và phiếu trả vào sổ chứng từ chung (business_documents) bằng trigger
-- gọi public.bizcity_doc_put / public.bizcity_doc_link. Chạy bằng vai trò mod_pos_owner trong schema mod_pos: không tạo / sửa bảng Core,
-- không thêm bảng. Hai hàm lõi chạy SECURITY DEFINER và kiểm đơn vị của phiên (migration lõi 0167) nên trigger chạy được dưới vai trò
-- mod_pos_rw lúc phục vụ.
--   pos.order:<order_id>    sales.order    awaiting_payment → in_progress · completed → done · cancelled → cancelled
--   pos.return:<return_id>  sales.return   ghi sổ (posted / unchanged) → done · chờ duyệt ở ACC14 (pending) → pending
-- Liên kết: ledger → ledger.event:<doc_key> (sự việc kế toán của đơn / phiếu trả), source: phiếu trả → đơn gốc.
-- Bản chụp phiên bản bỏ trạng thái, phần QR (chờ / đã trả / gia hạn), số phiên bản đơn, mốc giờ: xác nhận QR, huỷ không sinh phiên
-- bản; đổi nội dung (người mua hoá đơn, chuyển dòng sang Z) thì sinh.
-- Nạp dữ liệu cũ bằng SELECT gọi hàm ghi (không UPDATE bảng nguồn: không viết lại dòng đơn).
-- [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-033: đơn máy bán, phiếu trả vào sổ chứng từ chung (đóng góp)

CREATE OR REPLACE FUNCTION mod_pos.doc_put_order(o mod_pos.orders) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_pos, public, pg_temp AS $$
DECLARE
  v_ref text := 'pos.order:' || o.order_id;
BEGIN
  PERFORM public.bizcity_doc_put(o.tenant_id, v_ref, 'pos', 'sales.order', o.code, o.business_date, o.branch_code, COALESCE(o.customer_code, ''),
    'Đơn bán máy POS', o.total, o.status,
    CASE o.status WHEN 'awaiting_payment' THEN 'in_progress' WHEN 'completed' THEN 'done' WHEN 'cancelled' THEN 'cancelled' ELSE 'draft' END,
    (to_jsonb(o) - ARRAY['id', 'status', 'version', 'doc_status', 'snapshot', 'cancelled_at', 'cancel_reason', 'created_at'])
      || jsonb_build_object('order', COALESCE(o.snapshot, '{}'::jsonb) - ARRAY['status', 'qr']),
    jsonb_strip_nulls(jsonb_build_object('docKey', o.doc_key, 'docStatus', o.doc_status, 'cashier', NULLIF(o.cashier_name, ''),
      'subtotal', o.subtotal, 'taxTotal', o.tax_total, 'cancelReason', NULLIF(o.cancel_reason, ''))),
    COALESCE(NULLIF(o.cashier_name, ''), o.created_by), o.created_at, COALESCE(o.cancelled_at, o.created_at), '', NULL);
  PERFORM public.bizcity_doc_link(o.tenant_id, v_ref, 'ledger.event:' || NULLIF(o.doc_key, ''), 'ledger', o.created_by);
END $$;
COMMENT ON FUNCTION mod_pos.doc_put_order(mod_pos.orders) IS 'NT-BH-033: ghi đơn máy bán vào sổ chứng từ chung (pos.order:<order_id>, sales.order) + liên kết ledger tới sự việc kế toán.';

CREATE OR REPLACE FUNCTION mod_pos.doc_put_return(r mod_pos.returns) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_pos, public, pg_temp AS $$
DECLARE
  v_ref text := 'pos.return:' || r.return_id;
BEGIN
  PERFORM public.bizcity_doc_put(r.tenant_id, v_ref, 'pos', 'sales.return', r.code, r.business_date, r.branch_code,
    COALESCE((SELECT o.customer_code FROM mod_pos.orders o WHERE o.tenant_id = r.tenant_id AND o.order_id = r.order_id), ''),
    'Phiếu trả hàng máy POS', r.refund_total, r.doc_status,
    CASE r.doc_status WHEN 'pending' THEN 'pending' WHEN 'cancelled' THEN 'cancelled' ELSE 'done' END,
    to_jsonb(r) - ARRAY['id', 'doc_status', 'created_at'],
    jsonb_strip_nulls(jsonb_build_object('docKey', r.doc_key, 'docStatus', r.doc_status, 'refundMethod', r.refund_method,
      'refundNet', r.refund_net, 'refundTax', r.refund_tax, 'exchange', CASE WHEN r.exchange_order_id IS NOT NULL THEN true END,
      'cashier', NULLIF(r.cashier_name, ''))),
    COALESCE(NULLIF(r.cashier_name, ''), r.created_by), r.created_at, r.created_at,
    COALESCE(r.approved_by, ''), CASE WHEN r.approved_by IS NOT NULL THEN r.created_at END);
  PERFORM public.bizcity_doc_link(r.tenant_id, v_ref, 'ledger.event:' || NULLIF(r.doc_key, ''), 'ledger', r.created_by);
  PERFORM public.bizcity_doc_link(r.tenant_id, v_ref, 'pos.order:' || r.order_id, 'source', r.created_by);
END $$;
COMMENT ON FUNCTION mod_pos.doc_put_return(mod_pos.returns) IS 'NT-BH-033: ghi phiếu trả máy bán vào sổ chứng từ chung (pos.return:<return_id>, sales.return) + liên kết ledger, source tới đơn gốc.';

CREATE OR REPLACE FUNCTION mod_pos.doc_sync_order() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_pos, public, pg_temp AS $$
BEGIN
  PERFORM mod_pos.doc_put_order(NEW);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_pos.doc_sync_order() IS 'NT-BH-033: trigger đồng bộ đơn máy bán vào sổ chứng từ chung.';

CREATE OR REPLACE FUNCTION mod_pos.doc_sync_return() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_pos, public, pg_temp AS $$
BEGIN
  PERFORM mod_pos.doc_put_return(NEW);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_pos.doc_sync_return() IS 'NT-BH-033: trigger đồng bộ phiếu trả máy bán vào sổ chứng từ chung.';

DROP TRIGGER IF EXISTS business_documents_sync ON mod_pos.orders;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON mod_pos.orders FOR EACH ROW EXECUTE FUNCTION mod_pos.doc_sync_order();
COMMENT ON TRIGGER business_documents_sync ON mod_pos.orders IS 'NT-BH-033: mọi đường ghi đơn máy bán đều vào sổ chứng từ chung.';
DROP TRIGGER IF EXISTS business_documents_sync ON mod_pos.returns;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON mod_pos.returns FOR EACH ROW EXECUTE FUNCTION mod_pos.doc_sync_return();
COMMENT ON TRIGGER business_documents_sync ON mod_pos.returns IS 'NT-BH-033: mọi đường ghi phiếu trả máy bán đều vào sổ chứng từ chung.';

-- Nạp dữ liệu cũ (đơn trước phiếu trả để liên kết source có đích).
SELECT mod_pos.doc_put_order(o) FROM mod_pos.orders o ORDER BY o.id;
SELECT mod_pos.doc_put_return(r) FROM mod_pos.returns r ORDER BY r.id;
