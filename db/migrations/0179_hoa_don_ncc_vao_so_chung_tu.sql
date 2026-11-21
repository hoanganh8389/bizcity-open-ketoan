-- [2026-11-21 Nguyễn Văn Thủy] Hoá đơn NCC vào sổ chứng từ chung + phiếu nhập nhiều hoá đơn theo chuẩn Document Kernel (đóng góp)
--
-- Theo tiêu chuẩn đã chốt: Document Kernel quản định danh / vòng đời / phiên bản / liên kết của MỌI chứng từ; phân hệ giữ nội dung.
--   1. Hoá đơn NCC (MH22, supplier_invoices) = chứng từ `purchase.invoice` trong business_documents (mua-hang.invoice:<id>).
--      Chỉ quản chứng từ — KHÔNG vào accounting_events (bút toán vẫn đi theo phiếu nhập đã duyệt).
--      Vòng đời: đang dùng = done (đã nhận hoá đơn), huỷ = cancelled.
--   2. Đầu phiếu nhập trong sổ ghi ĐỦ các hoá đơn (meta.invoices — mảng mở rộng: key, ngày, điều chỉnh cho, tên dễ đọc),
--      không chỉ số hoá đơn đầu (meta.invoiceNo giữ cho dữ liệu cũ).
--   3. Liên kết qua document_links (không bảng mới):
--        hoá đơn NCC --attachesTo--> phiếu nhập          (hoá đơn đính vào phiếu nhập; bỏ hoá đơn khỏi phiếu thì gỡ liên kết)
--        hoá đơn điều chỉnh --adjusts--> hoá đơn gốc     (vai mới `adjusts` = điều chỉnh cho)
--      Hoá đơn gõ tay chưa có ở MH22 chỉ nằm trong meta.invoices; khi nhập vào MH22 sau, trigger hoá đơn tự nối lại.

-- ── Vai liên kết mới: adjusts (điều chỉnh cho) ───────────────────────────────────────────────────────────────────────────
ALTER TABLE document_links DROP CONSTRAINT IF EXISTS document_links_role_check;
ALTER TABLE document_links ADD CONSTRAINT document_links_role_check
  CHECK (role IN ('source', 'reverses', 'replaces', 'settles', 'attachesTo', 'ledger', 'applies', 'uses', 'adjusts'));
COMMENT ON COLUMN document_links.role IS 'source = lập từ, reverses = đảo, replaces = thay thế, settles = thanh toán cho, attachesTo = đính vào, ledger = sự việc kế toán sinh ra, applies = áp chính sách / chương trình (0162), uses = dùng lô hàng (0162), adjusts = điều chỉnh cho (hoá đơn điều chỉnh → hoá đơn gốc, 0179).';

-- ── Khoá so khớp hoá đơn (như invoiceKey ở packages/contracts): "ký hiệu 6 ký tự|số bỏ 0 đầu" ─────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_invoice_key(p_serial text, p_no text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text := upper(regexp_replace(COALESCE(p_serial, ''), '[^A-Za-z0-9]', '', 'g'));
  n text := upper(regexp_replace(COALESCE(p_no, ''), '[^A-Za-z0-9]', '', 'g'));
  m text[];
BEGIN
  m := regexp_match(n, '^([0-9]?[A-Z][0-9]{2}[A-Z]{3})([0-9]+)$');
  IF m IS NOT NULL THEN s := m[1]; n := m[2]; END IF;
  IF length(s) = 7 AND s ~ '^[0-9]' THEN s := substr(s, 2); END IF;
  IF length(s) > 6 THEN s := right(s, 6); END IF;
  n := regexp_replace(n, '^0+([0-9])', '\1');
  RETURN s || '|' || n;
END $$;
COMMENT ON FUNCTION bizcity_invoice_key(text, text) IS 'Khoá so khớp hoá đơn "ký hiệu|số" (ký hiệu có mẫu số đầu, số dính ký hiệu, số có 0 đầu đều về một khoá) — như invoiceKey phía máy chủ (0179).';

-- Tìm hoá đơn NCC (MH22) cho một hoá đơn ghi trên phiếu: ưu tiên supplierInvoiceId, không có thì theo NCC + khoá ký hiệu|số.
CREATE OR REPLACE FUNCTION bizcity_find_supplier_invoice(p_tenant bigint, p_partner text, p_inv jsonb) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT s.id FROM supplier_invoices s WHERE s.tenant_id = p_tenant AND (p_inv->>'supplierInvoiceId') ~ '^[0-9]+$' AND s.id = (p_inv->>'supplierInvoiceId')::bigint),
    (SELECT s.id FROM supplier_invoices s
      WHERE s.tenant_id = p_tenant AND s.partner_code = p_partner AND s.status = 'active' AND COALESCE(p_inv->>'no', '') <> ''
        AND bizcity_invoice_key(s.invoice_series, s.invoice_no) = bizcity_invoice_key(p_inv->>'serial', p_inv->>'no')
      ORDER BY s.id DESC LIMIT 1));
$$;

-- ── Liên kết hoá đơn ↔ phiếu nhập (gọi từ trigger phiếu mua và trigger hoá đơn NCC) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_link_receipt_invoices(p_tenant bigint, p_doc bigint) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  d record;
  v_ref text := 'mua-hang.document:' || p_doc;
  v_inv jsonb;
  v_list jsonb;
  v_id bigint;
  v_adj bigint;
  v_keep text[] := '{}';
  v_actor text;
BEGIN
  PERFORM bizcity_doc_assert_tenant(p_tenant);
  SELECT id, kind, partner_code, status, data, invoice_no, invoice_serial, invoice_date, created_by INTO d
    FROM purchase_documents WHERE tenant_id = p_tenant AND id = p_doc;
  IF d IS NULL THEN RETURN; END IF;
  v_actor := COALESCE(NULLIF(d.created_by, ''), 'system');
  v_list := CASE WHEN jsonb_typeof(d.data->'invoices') = 'array' AND jsonb_array_length(d.data->'invoices') > 0 THEN d.data->'invoices'
                 WHEN COALESCE(d.invoice_no, '') <> '' THEN jsonb_build_array(jsonb_build_object('no', d.invoice_no, 'serial', d.invoice_serial, 'date', d.invoice_date))
                 ELSE '[]'::jsonb END;
  IF d.status <> 'cancelled' THEN
    FOR v_inv IN SELECT x FROM jsonb_array_elements(v_list) x LOOP
      v_id := bizcity_find_supplier_invoice(p_tenant, d.partner_code, v_inv);
      CONTINUE WHEN v_id IS NULL;
      v_keep := v_keep || ('mua-hang.invoice:' || v_id);
      PERFORM bizcity_doc_link(p_tenant, 'mua-hang.invoice:' || v_id, v_ref, 'attachesTo', v_actor);
      -- Hoá đơn điều chỉnh: "adjusts" = ký hiệu-số hoá đơn gốc (thường cũng nằm trên phiếu này).
      IF COALESCE(v_inv->>'adjusts', '') <> '' THEN
        v_adj := (SELECT bizcity_find_supplier_invoice(p_tenant, d.partner_code, y) FROM jsonb_array_elements(v_list) y
                   WHERE CASE WHEN COALESCE(y->>'serial', '') <> '' THEN (y->>'serial') || '-' || (y->>'no') ELSE y->>'no' END = v_inv->>'adjusts' LIMIT 1);
        IF v_adj IS NULL THEN
          v_adj := bizcity_find_supplier_invoice(p_tenant, d.partner_code,
            jsonb_build_object('serial', substring(v_inv->>'adjusts' FROM '^(.*)-[^-]+$'), 'no', substring(v_inv->>'adjusts' FROM '([^-]+)$')));
        END IF;
        IF v_adj IS NOT NULL AND v_adj <> v_id THEN
          PERFORM bizcity_doc_link(p_tenant, 'mua-hang.invoice:' || v_id, 'mua-hang.invoice:' || v_adj, 'adjusts', v_actor);
        END IF;
      END IF;
    END LOOP;
  END IF;
  -- Hoá đơn đã bỏ khỏi phiếu (hoặc phiếu huỷ) → gỡ liên kết đính vào.
  DELETE FROM document_links
   WHERE tenant_id = p_tenant AND to_ref = v_ref AND role = 'attachesTo' AND from_ref LIKE 'mua-hang.invoice:%' AND NOT (from_ref = ANY(v_keep));
END $$;
COMMENT ON FUNCTION bizcity_doc_link_receipt_invoices(bigint, bigint) IS 'Nối hoá đơn NCC (MH22) đính vào phiếu mua theo danh sách hoá đơn trên phiếu (attachesTo) + hoá đơn điều chỉnh → hoá đơn gốc (adjusts); gỡ liên kết hoá đơn đã bỏ (0179).';

-- ── Hoá đơn NCC vào sổ chứng từ ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_supplier_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_doc bigint;
  v_key text := bizcity_invoice_key(NEW.invoice_series, NEW.invoice_no);
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, 'mua-hang.invoice:' || NEW.id, 'mua-hang', 'purchase.invoice',
    CASE WHEN NEW.invoice_series <> '' THEN NEW.invoice_series || '-' || NEW.invoice_no ELSE NEW.invoice_no END,
    NEW.invoice_date, COALESCE(NEW.data->>'branchCode', ''), NEW.partner_code, 'Hoá đơn NCC', NEW.total, NEW.status,
    CASE NEW.status WHEN 'cancelled' THEN 'cancelled' ELSE 'done' END,
    to_jsonb(NEW) - ARRAY['status', 'created_at', 'updated_at', 'updated_by', 'cancelled_by', 'cancelled_at'],
    jsonb_strip_nulls(jsonb_build_object('form', NULLIF(NEW.invoice_form, ''), 'series', NULLIF(NEW.invoice_series, ''), 'invoiceNo', NEW.invoice_no,
      'invoiceDate', NEW.invoice_date, 'sellerTaxCode', NULLIF(NEW.seller_tax_code, ''), 'buyerTaxCode', NULLIF(NEW.buyer_tax_code, ''),
      'totalBeforeTax', NEW.total_before_tax, 'totalTax', NEW.total_tax, 'source', NEW.source, 'cancelReason', NULLIF(NEW.cancel_reason, ''))),
    NEW.created_by, NEW.created_at, NEW.updated_at, '', NULL);
  -- Phiếu mua cùng NCC đang ghi hoá đơn này (gõ tay trước khi có ở MH22, hoặc vừa huỷ) → nối / gỡ lại liên kết.
  FOR v_doc IN
    SELECT p.id FROM purchase_documents p
     WHERE p.tenant_id = NEW.tenant_id AND p.partner_code = NEW.partner_code
       AND (bizcity_invoice_key(p.invoice_serial, p.invoice_no) = v_key
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'invoices') = 'array' THEN p.data->'invoices' ELSE '[]'::jsonb END) x
                        WHERE bizcity_invoice_key(x->>'serial', x->>'no') = v_key OR x->>'supplierInvoiceId' = NEW.id::text))
  LOOP
    PERFORM bizcity_doc_link_receipt_invoices(NEW.tenant_id, v_doc);
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS business_documents_sync ON supplier_invoices;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON supplier_invoices FOR EACH ROW EXECUTE FUNCTION bizcity_doc_sync_supplier_invoice();

-- ── Phiếu mua: meta.invoices đủ danh sách + nối hoá đơn (thân như 0166, thêm hai chỗ đánh dấu 0179) ──────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'mua-hang.document:' || NEW.id;
  v_src bigint;
  v_link jsonb;
  v_id bigint;
  v_invs jsonb;
BEGIN
  -- 0179: các hoá đơn của phiếu (mảng; phần tử mở rộng thêm khoá được) — dữ liệu cũ chỉ có invoice_no.
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key', CASE WHEN COALESCE(x->>'serial', '') <> '' THEN (x->>'serial') || '-' || (x->>'no') ELSE x->>'no' END,
           'date', NULLIF(x->>'date', ''), 'adjusts', NULLIF(x->>'adjusts', ''), 'supplierInvoiceId', NULLIF(x->>'supplierInvoiceId', ''),
           'label', CASE WHEN COALESCE(x->>'serial', '') <> '' THEN (x->>'serial') || '-' || (x->>'no') ELSE x->>'no' END
                    || CASE WHEN COALESCE(x->>'adjusts', '') <> '' THEN ' (điều chỉnh cho ' || (x->>'adjusts') || ')' ELSE '' END)))
    INTO v_invs
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'invoices') = 'array' THEN NEW.data->'invoices' ELSE '[]'::jsonb END) x
   WHERE COALESCE(x->>'no', '') <> '';
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'mua-hang', bizcity_doc_purchase_type(NEW.kind), NEW.doc_no, NEW.doc_date, NEW.branch_code,
    COALESCE(NULLIF(NEW.partner_code, ''), NEW.partner_uid, ''),
    CASE NEW.kind WHEN 'order' THEN 'Đơn đặt hàng' WHEN 'receipt' THEN 'Phiếu nhập mua' WHEN 'return' THEN 'Phiếu trả hàng NCC'
      WHEN 'cost' THEN 'Chi phí mua hàng' WHEN 'payment' THEN 'Thanh toán NCC' WHEN 'prepayment' THEN 'Trả trước NCC'
      WHEN 'rebate' THEN 'Thưởng / chiết khấu NCC' WHEN 'gift_in' THEN 'Nhận hàng tặng' WHEN 'gift_out' THEN 'Xuất hàng tặng'
      WHEN 'exchange' THEN 'Đổi hàng NCC' ELSE 'Chứng từ mua hàng' END,
    NEW.total, NEW.status,
    bizcity_doc_purchase_status(NEW.tenant_id, NEW.id, NEW.kind, NEW.status),
    to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approved_at', 'created_at', 'updated_at', 'links'],
    jsonb_strip_nulls(jsonb_build_object('kind', NEW.kind, 'invoiceNo', NULLIF(NEW.invoice_no, ''), 'invoiceDate', NEW.invoice_date, 'dueDate', NEW.due_date,
      'invoices', v_invs,
      'totalBeforeTax', NEW.total_before_tax, 'totalTax', NEW.total_tax, 'demo', NULLIF(NEW.is_demo, false))),
    COALESCE(NULLIF(NEW.created_by_name, ''), NEW.created_by), NEW.created_at, NEW.updated_at,
    CASE WHEN NEW.status IN ('draft', 'pending_approval') THEN '' ELSE COALESCE(NULLIF(NEW.approved_by, ''), NEW.data->>'approvedActor', '') END,
    CASE WHEN NEW.status IN ('draft', 'pending_approval') THEN NULL ELSE NEW.approved_at END);
  FOREACH v_src IN ARRAY COALESCE(NEW.ref_ids, '{}'::bigint[]) LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'mua-hang.document:' || v_src, 'source', NEW.created_by);
  END LOOP;
  -- Phiếu nhập đổi (duyệt, huỷ, lập điều chỉnh, đổi đơn gốc) → tính lại tiến độ các đơn đặt nó lập từ.
  IF NEW.kind = 'receipt' THEN
    UPDATE business_documents b SET status = bizcity_doc_order_progress(o.tenant_id, o.id)
      FROM purchase_documents o
     WHERE o.tenant_id = NEW.tenant_id AND o.kind = 'order' AND o.status = 'approved'
       AND o.id = ANY(COALESCE(NEW.ref_ids, '{}'::bigint[]) || CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.ref_ids, '{}'::bigint[]) ELSE '{}'::bigint[] END)
       AND b.tenant_id = o.tenant_id AND b.doc_ref = 'mua-hang.document:' || o.id
       AND b.status IS DISTINCT FROM bizcity_doc_order_progress(o.tenant_id, o.id);
  END IF;
  -- 0179: hoá đơn NCC đính vào phiếu + hoá đơn điều chỉnh → hoá đơn gốc (chỉ khi danh sách hoá đơn / trạng thái / NCC đổi).
  IF TG_OP = 'INSERT' OR NEW.data->'invoices' IS DISTINCT FROM OLD.data->'invoices' OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.partner_code IS DISTINCT FROM OLD.partner_code THEN
    PERFORM bizcity_doc_link_receipt_invoices(NEW.tenant_id, NEW.id);
  END IF;
  FOR v_link IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.links) = 'array' THEN NEW.links ELSE '[]'::jsonb END) x LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || (v_link ->> 'docKey'), 'ledger', NEW.created_by);
  END LOOP;
  -- Áp chính sách / chương trình: mã ở vết tính, ở dòng (program), ở phiếu thưởng → chính sách mua cùng mã.
  FOR v_id IN
    SELECT DISTINCT p.id FROM purchase_policies p
     WHERE p.tenant_id = NEW.tenant_id AND p.code IN (
       SELECT t->>'policy' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'policyTrace') = 'array' THEN NEW.data->'policyTrace' ELSE '[]'::jsonb END) t
       UNION SELECT l->>'program' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'lines') = 'array' THEN NEW.data->'lines' ELSE '[]'::jsonb END) l
       UNION SELECT NEW.data->'rebate'->>'policyCode')
  LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'mua-hang.policy:' || v_id, 'applies', NEW.created_by);
  END LOOP;
  -- Dùng lô: số lô (+ HSD nếu có) trên dòng khớp lô hàng đã ghi nhận.
  FOR v_id IN
    SELECT DISTINCT i.id FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'lines') = 'array' THEN NEW.data->'lines' ELSE '[]'::jsonb END) l
      JOIN item_lots i ON i.tenant_id = NEW.tenant_id AND i.sku = l->>'sku' AND i.lot_no = l->>'lotNo'
       AND (COALESCE(l->>'expDate', '') = '' OR i.exp_date::text = l->>'expDate')
     WHERE COALESCE(l->>'lotNo', '') <> ''
  LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'kho.lot:' || v_id, 'uses', NEW.created_by);
  END LOOP;
  -- Thuộc hợp đồng: phiếu lập theo hợp đồng mua → hop-dong.contract:<số hợp đồng>.
  PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'hop-dong.contract:' || NULLIF(NEW.data->>'contractCode', ''), 'applies', NEW.created_by);
  RETURN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT EXECUTE ON FUNCTION bizcity_invoice_key(text, text) TO ketoan_app;
    GRANT EXECUTE ON FUNCTION bizcity_find_supplier_invoice(bigint, text, jsonb) TO ketoan_app;
    GRANT EXECUTE ON FUNCTION bizcity_doc_link_receipt_invoices(bigint, bigint) TO ketoan_app;
  END IF;
END $$;

-- ── Nạp dữ liệu sẵn có: hoá đơn NCC vào sổ (trigger tự nối phiếu), phiếu có hoá đơn ghi lại meta ───────────────────────────
UPDATE supplier_invoices SET updated_at = updated_at;
UPDATE purchase_documents SET updated_at = updated_at
 WHERE COALESCE(invoice_no, '') <> '' OR (jsonb_typeof(data->'invoices') = 'array' AND jsonb_array_length(data->'invoices') > 0);
