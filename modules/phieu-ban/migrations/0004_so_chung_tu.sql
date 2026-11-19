-- Module phieu-ban (phiếu NT-BH-033, docs/nghiep-vu/26): đơn đặt hàng BH20, phiếu bán BH10, phiếu trả BH11 vào sổ chứng từ chung
-- (business_documents) bằng trigger gọi public.bizcity_doc_put / public.bizcity_doc_link. Chạy bằng vai trò mod_phieu_ban_owner trong
-- schema mod_phieu_ban: không tạo / sửa bảng Core, không thêm bảng. Hai hàm lõi chạy SECURITY DEFINER và kiểm đơn vị của phiên
-- (migration lõi 0167) nên trigger chạy được dưới vai trò mod_phieu_ban_rw lúc phục vụ.
--   phieu-ban.order:<order_id>  sales.order    draft → draft · pending → pending · open chưa giao → approved, đã giao / đang giao một
--                                              phần → in_progress · closed → done · cancelled → cancelled
--   phieu-ban.doc:<doc_id>      sales.invoice (kind sale) / sales.return (kind sale_return)   draft → draft · approved → done ·
--                                              xoá nháp → cancelled (status_raw deleted; dòng sổ giữ lại)
-- Liên kết: ledger → ledger.event:phieu-ban:<doc_id> khi phiếu đã duyệt (docKey của chứng từ kế toán); source: phiếu bán lập từ đơn
-- (giao hàng / chuyến giao) → đơn, phiếu trả → phiếu bán gốc, đơn copy (copied_from order:<số> / sale:<số>) → đơn / phiếu gốc khi
-- số gốc khớp đúng một chứng từ (copy từ đơn máy bán pos:<mã> nằm ở module khác — không tra được, bỏ qua).
-- Bản chụp phiên bản bỏ trạng thái, tiến độ giao (delivered / held / shipping trên dòng, deliveries), giữ hàng, lý do chờ / đóng,
-- người duyệt, mốc giờ, trạng thái sổ: gửi / duyệt / giao / đóng không sinh phiên bản; sửa dòng, khách, giá thì sinh.
-- Nạp dữ liệu cũ bằng SELECT gọi hàm ghi (không UPDATE bảng nguồn).
-- [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-033: đơn đặt hàng, phiếu bán, phiếu trả vào sổ chứng từ chung (đóng góp)

-- Nội dung đơn để chụp phiên bản: bỏ tiến độ giao của dòng và nhật ký giao / trả lại.
CREATE OR REPLACE FUNCTION mod_phieu_ban.doc_order_content(b jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE SET search_path = mod_phieu_ban, public, pg_temp AS $$
  SELECT (COALESCE(b, '{}'::jsonb) - ARRAY['deliveries', 'rejection'])
    || jsonb_build_object('lines', COALESCE((
         SELECT jsonb_agg(l - ARRAY['delivered', 'held', 'shipping'] ORDER BY n)
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b -> 'lines') = 'array' THEN b -> 'lines' ELSE '[]'::jsonb END) WITH ORDINALITY x(l, n)),
         '[]'::jsonb))
$$;
COMMENT ON FUNCTION mod_phieu_ban.doc_order_content(jsonb) IS 'NT-BH-033: nội dung đơn đặt hàng để chụp phiên bản sổ chứng từ — bỏ tiến độ giao (delivered / held / shipping, deliveries) và lần trả lại.';

-- Trạng thái chuẩn của đơn: open chưa giao → approved, đã giao / đang giao một phần → in_progress.
CREATE OR REPLACE FUNCTION mod_phieu_ban.doc_order_status(p_status text, b jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = mod_phieu_ban, public, pg_temp AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN 'draft' WHEN 'pending' THEN 'pending' WHEN 'closed' THEN 'done' WHEN 'cancelled' THEN 'cancelled'
    ELSE CASE WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b -> 'lines') = 'array' THEN b -> 'lines' ELSE '[]'::jsonb END) l
       WHERE COALESCE(NULLIF(l ->> 'delivered', '')::numeric, 0) > 0 OR COALESCE(NULLIF(l ->> 'shipping', '')::numeric, 0) > 0)
      THEN 'in_progress' ELSE 'approved' END END
$$;
COMMENT ON FUNCTION mod_phieu_ban.doc_order_status(text, jsonb) IS 'NT-BH-033: nhóm trạng thái chuẩn của đơn đặt hàng BH20 (open chưa giao = approved, giao một phần = in_progress).';

CREATE OR REPLACE FUNCTION mod_phieu_ban.doc_put_order(o mod_phieu_ban.orders) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_phieu_ban, public, pg_temp AS $$
DECLARE
  v_ref text := 'phieu-ban.order:' || o.order_id;
  v_kind text := split_part(COALESCE(o.copied_from, ''), ':', 1);
  v_no text := substr(COALESCE(o.copied_from, ''), length(split_part(COALESCE(o.copied_from, ''), ':', 1)) + 2);
  v_src text;
BEGIN
  PERFORM public.bizcity_doc_put(o.tenant_id, v_ref, 'phieu-ban', 'sales.order', o.order_no, o.order_date, o.branch_code,
    COALESCE(NULLIF(o.partner_code, ''), ''), 'Đơn đặt hàng bán', o.total, o.status,
    mod_phieu_ban.doc_order_status(o.status, o.body),
    (to_jsonb(o) - ARRAY['status', 'body', 'hold_seq', 'hold_warehouse_code', 'pending_reasons', 'close_reason', 'created_at', 'updated_at',
      'updated_by', 'approved_by', 'approved_at']) || jsonb_build_object('body', mod_phieu_ban.doc_order_content(o.body)),
    jsonb_strip_nulls(jsonb_build_object('source', o.source, 'warehouse', o.warehouse_code, 'validUntil', o.valid_until,
      'phone', NULLIF(o.phone, ''), 'closeReason', NULLIF(o.close_reason, ''), 'copiedFrom', NULLIF(o.copied_from, ''),
      'tracking', NULLIF(o.tracking_no, ''))),
    o.created_by, o.created_at, o.updated_at,
    CASE WHEN o.status IN ('draft', 'pending') THEN '' ELSE COALESCE(o.approved_by, '') END,
    CASE WHEN o.status IN ('draft', 'pending') THEN NULL ELSE o.approved_at END);
  IF v_kind = 'order' AND v_no <> '' THEN
    SELECT CASE WHEN count(*) = 1 THEN 'phieu-ban.order:' || min(x.order_id::text) END INTO v_src
      FROM mod_phieu_ban.orders x WHERE x.tenant_id = o.tenant_id AND x.order_no = v_no AND x.order_id <> o.order_id;
  ELSIF v_kind = 'sale' AND v_no <> '' THEN
    SELECT CASE WHEN count(*) = 1 THEN 'phieu-ban.doc:' || min(x.doc_id::text) END INTO v_src
      FROM mod_phieu_ban.docs x WHERE x.tenant_id = o.tenant_id AND x.kind = 'sale' AND x.doc_no = v_no;
  END IF;
  PERFORM public.bizcity_doc_link(o.tenant_id, v_ref, v_src, 'source', o.created_by);
END $$;
COMMENT ON FUNCTION mod_phieu_ban.doc_put_order(mod_phieu_ban.orders) IS 'NT-BH-033: ghi đơn đặt hàng BH20 vào sổ chứng từ chung (phieu-ban.order:<order_id>, sales.order) + liên kết source của đơn copy.';

CREATE OR REPLACE FUNCTION mod_phieu_ban.doc_put_doc(d mod_phieu_ban.docs, p_deleted boolean DEFAULT false) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_phieu_ban, public, pg_temp AS $$
DECLARE
  v_ref text := 'phieu-ban.doc:' || d.doc_id;
BEGIN
  PERFORM public.bizcity_doc_put(d.tenant_id, v_ref, 'phieu-ban', CASE d.kind WHEN 'sale_return' THEN 'sales.return' ELSE 'sales.invoice' END,
    d.doc_no, d.doc_date, d.branch_code, COALESCE(d.partner_code, ''),
    CASE d.kind WHEN 'sale_return' THEN 'Phiếu trả hàng bán' ELSE 'Phiếu bán hàng' END, d.total,
    CASE WHEN p_deleted THEN 'deleted' ELSE d.status END,
    CASE WHEN p_deleted THEN 'cancelled' WHEN d.status = 'approved' THEN 'done' ELSE 'draft' END,
    to_jsonb(d) - ARRAY['status', 'ledger_version', 'ledger_status', 'created_at', 'updated_at', 'updated_by', 'approved_by', 'approved_at'],
    jsonb_strip_nulls(jsonb_build_object('warehouse', d.warehouse_code, 'ledgerStatus', d.ledger_status,
      'ledgerVersion', NULLIF(d.ledger_version, 0), 'order', d.body -> 'order' ->> 'no')),
    d.created_by, d.created_at, CASE WHEN p_deleted THEN now() ELSE d.updated_at END,
    CASE WHEN d.status = 'approved' THEN COALESCE(d.approved_by, '') ELSE '' END,
    CASE WHEN d.status = 'approved' THEN d.approved_at END);
  IF p_deleted THEN RETURN; END IF;
  IF d.status = 'approved' THEN
    PERFORM public.bizcity_doc_link(d.tenant_id, v_ref, 'ledger.event:phieu-ban:' || d.doc_id, 'ledger', d.updated_by);
  END IF;
  PERFORM public.bizcity_doc_link(d.tenant_id, v_ref, 'phieu-ban.order:' || NULLIF(d.body -> 'order' ->> 'id', ''), 'source', d.created_by);
  PERFORM public.bizcity_doc_link(d.tenant_id, v_ref, 'phieu-ban.doc:' || d.original_doc_id, 'source', d.created_by);
END $$;
COMMENT ON FUNCTION mod_phieu_ban.doc_put_doc(mod_phieu_ban.docs, boolean) IS 'NT-BH-033: ghi phiếu bán BH10 (sales.invoice) / phiếu trả BH11 (sales.return) vào sổ chứng từ chung (phieu-ban.doc:<doc_id>) + liên kết ledger khi đã duyệt, source tới đơn / phiếu gốc; xoá nháp → cancelled.';

CREATE OR REPLACE FUNCTION mod_phieu_ban.doc_sync_order() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_phieu_ban, public, pg_temp AS $$
BEGIN
  PERFORM mod_phieu_ban.doc_put_order(NEW);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_phieu_ban.doc_sync_order() IS 'NT-BH-033: trigger đồng bộ đơn đặt hàng BH20 vào sổ chứng từ chung.';

CREATE OR REPLACE FUNCTION mod_phieu_ban.doc_sync_doc() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_phieu_ban, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM mod_phieu_ban.doc_put_doc(OLD, true);
  ELSE
    PERFORM mod_phieu_ban.doc_put_doc(NEW);
  END IF;
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_phieu_ban.doc_sync_doc() IS 'NT-BH-033: trigger đồng bộ phiếu bán / trả BH10 / BH11 vào sổ chứng từ chung (xoá nháp → cancelled).';

DROP TRIGGER IF EXISTS business_documents_sync ON mod_phieu_ban.orders;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON mod_phieu_ban.orders FOR EACH ROW EXECUTE FUNCTION mod_phieu_ban.doc_sync_order();
COMMENT ON TRIGGER business_documents_sync ON mod_phieu_ban.orders IS 'NT-BH-033: mọi đường ghi đơn đặt hàng đều vào sổ chứng từ chung.';
DROP TRIGGER IF EXISTS business_documents_sync ON mod_phieu_ban.docs;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE OR DELETE ON mod_phieu_ban.docs FOR EACH ROW EXECUTE FUNCTION mod_phieu_ban.doc_sync_doc();
COMMENT ON TRIGGER business_documents_sync ON mod_phieu_ban.docs IS 'NT-BH-033: mọi đường ghi phiếu bán / trả đều vào sổ chứng từ chung.';

-- Nạp dữ liệu cũ (liên kết không đòi đích có trước nên thứ tự không quan trọng).
SELECT mod_phieu_ban.doc_put_doc(d) FROM mod_phieu_ban.docs d ORDER BY d.created_at;
SELECT mod_phieu_ban.doc_put_order(o) FROM mod_phieu_ban.orders o ORDER BY o.created_at;
