-- [2026-11-19 Nguyễn Văn Thủy] Sổ chứng từ chung: tên loại chứng từ, vòng đời Thực hiện / Hoàn tất, chính sách giá vào sổ (đóng góp)
--
-- Chốt theo sơ đồ Document Kernel:
-- 1) VÒNG ĐỜI Nháp → Trình → Duyệt → Thực hiện → Hoàn tất (+ Huỷ): thêm nhóm trạng thái in_progress.
--      draft (nháp, bị trả) · pending (chờ duyệt) · approved (đã duyệt, chưa làm) · in_progress (đang thực hiện) · done (hoàn tất) · cancelled
--    Gán theo loại:
--      đơn đặt hàng        đã duyệt → chưa nhập: approved · nhập một phần: in_progress · nhập đủ mọi mã: done (tính lại mỗi khi phiếu nhập đổi)
--      phiếu nhập / xuất, chi phí, thưởng, trả tiền   đã duyệt = đã ghi sổ: done
--      chuyển kho          đã xuất (đang đi đường): in_progress · đã nhận: done
--      hợp đồng            còn hiệu lực: in_progress · thanh lý: done
--      chính sách giá      đang áp dụng (published): in_progress · hết hạn: done · ngừng / xoá: cancelled
--      đề nghị thanh toán  đã duyệt: approved · đã chi: done (như cũ)
-- 2) TÊN LOẠI <nghiệp vụ>.<loại> theo chứng từ là gì, không theo phân hệ sinh ra (phân hệ đã ở cột module):
--      purchase.contract (hợp đồng mua hàng; hợp đồng khác giữ contract.<loại>), purchase.order,
--      inventory.receipt (nhập mua, nhận hàng tặng), inventory.issue (trả hàng NCC, xuất hàng tặng), inventory.exchange (đổi hàng NCC),
--      purchase.cost / purchase.rebate / purchase.prepayment (không đụng kho), finance.payment (trả tiền NCC), pricing.policy.
--    Phiếu nhập mua và nhận hàng tặng cùng inventory.receipt: phân biệt bằng tiêu đề + meta.kind.
-- 3) CHÍNH SÁCH GIÁ vào sổ chứng từ: mua-hang.policy:<id> (đúng định danh liên kết 'applies' đang dùng). Phiên bản do phân hệ tự ghi
--    vào document_versions khi phát hành (0160) nên đầu phiếu lấy thẳng số bản của chính sách, trigger không ghi thêm bản.
-- Chỉ chạm business_documents / document_links; accounting_events, sổ, kho không đổi.

-- ── 1. Nhóm trạng thái ───────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE business_documents DROP CONSTRAINT IF EXISTS business_documents_status_check;
ALTER TABLE business_documents ADD CONSTRAINT business_documents_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'in_progress', 'done', 'cancelled'));
COMMENT ON COLUMN business_documents.status IS 'Vòng đời chuẩn: draft (nháp, bị trả) · pending (chờ duyệt) · approved (đã duyệt, chưa thực hiện) · in_progress (đang thực hiện: đơn nhập dở, hàng đi đường, hợp đồng / chính sách đang hiệu lực) · done (hoàn tất) · cancelled (huỷ).';
COMMENT ON COLUMN business_documents.doc_type IS 'Loại chứng từ <nghiệp vụ>.<loại> theo chứng từ là gì: purchase.contract, purchase.order, inventory.receipt, inventory.issue, inventory.transfer, finance.payment, finance.payment_request, pricing.policy…';

-- ── 2. Loại chứng từ của phiếu mua ───────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_purchase_type(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind
    WHEN 'order' THEN 'purchase.order'
    WHEN 'receipt' THEN 'inventory.receipt' WHEN 'gift_in' THEN 'inventory.receipt'
    WHEN 'return' THEN 'inventory.issue' WHEN 'gift_out' THEN 'inventory.issue'
    WHEN 'exchange' THEN 'inventory.exchange'
    WHEN 'payment' THEN 'finance.payment'
    ELSE 'purchase.' || p_kind END
$$;
COMMENT ON FUNCTION bizcity_doc_purchase_type(text) IS 'Loại chứng từ chuẩn của phiếu mua theo kind (0166).';

-- Tiến độ đơn đặt đã duyệt: so số lượng từng mã trên đơn với tổng các phiếu nhập đã duyệt lập từ đơn.
CREATE OR REPLACE FUNCTION bizcity_doc_order_progress(p_tenant bigint, p_order bigint) RETURNS text LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT l->>'sku' AS sku, sum((l->>'qty')::numeric) AS q
      FROM purchase_documents d,
           jsonb_array_elements(CASE WHEN jsonb_typeof(d.data->'lines') = 'array' THEN d.data->'lines' ELSE '[]'::jsonb END) l
     WHERE d.tenant_id = p_tenant AND d.id = p_order AND COALESCE(l->>'sku', '') <> '' AND COALESCE(l->>'qty', '') ~ '^-?\d+(\.\d+)?$'
     GROUP BY 1 HAVING sum((l->>'qty')::numeric) > 0),
  r AS (
    SELECT l->>'sku' AS sku, sum((l->>'qty')::numeric) AS q
      FROM purchase_documents d,
           jsonb_array_elements(CASE WHEN jsonb_typeof(d.data->'lines') = 'array' THEN d.data->'lines' ELSE '[]'::jsonb END) l
     WHERE d.tenant_id = p_tenant AND d.kind = 'receipt' AND d.status = 'approved' AND p_order = ANY(d.ref_ids)
       AND COALESCE(l->>'sku', '') <> '' AND COALESCE(l->>'qty', '') ~ '^-?\d+(\.\d+)?$'
     GROUP BY 1)
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM r) THEN 'approved'
    WHEN EXISTS (SELECT 1 FROM o) AND NOT EXISTS (SELECT 1 FROM o LEFT JOIN r USING (sku) WHERE COALESCE(r.q, 0) < o.q) THEN 'done'
    ELSE 'in_progress' END
$$;
COMMENT ON FUNCTION bizcity_doc_order_progress(bigint, bigint) IS 'Đơn đặt đã duyệt: approved (chưa nhập) · in_progress (nhập một phần) · done (mọi mã nhập đủ) — 0166.';

CREATE OR REPLACE FUNCTION bizcity_doc_purchase_status(p_tenant bigint, p_id bigint, p_kind text, p_status text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN 'draft' WHEN 'pending_approval' THEN 'pending' WHEN 'cancelled' THEN 'cancelled'
    ELSE CASE WHEN p_kind = 'order' THEN bizcity_doc_order_progress(p_tenant, p_id) ELSE 'done' END END
$$;

CREATE OR REPLACE FUNCTION bizcity_doc_sync_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'mua-hang.document:' || NEW.id;
  v_src bigint;
  v_link jsonb;
  v_id bigint;
BEGIN
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

-- ── 3. Hợp đồng: purchase.contract, còn hiệu lực = đang thực hiện ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text;
  v_raw text;
BEGIN
  IF NEW.kind <> 'contract' OR NEW.code ~ '\s' THEN RETURN NULL; END IF;
  v_ref := 'hop-dong.contract:' || NEW.code;
  v_raw := COALESCE(NULLIF(NEW.extra->>'status', ''), CASE WHEN NEW.is_active THEN 'active' ELSE 'liquidated' END);
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'hop-dong',
    CASE COALESCE(NULLIF(NEW.extra->>'type', ''), 'other') WHEN 'goods_supplier' THEN 'purchase.contract' ELSE 'contract.' || COALESCE(NULLIF(NEW.extra->>'type', ''), 'other') END,
    NEW.code,
    CASE WHEN COALESCE(NEW.extra->>'signedDate', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (NEW.extra->>'signedDate')::date END,
    COALESCE(NEW.extra->'branchCodes'->>0, ''), COALESCE(NEW.extra->>'partnerCode', ''),
    CASE NEW.extra->>'type' WHEN 'goods_supplier' THEN 'Hợp đồng mua hàng' WHEN 'rent' THEN 'Hợp đồng thuê' WHEN 'asset_service' THEN 'Hợp đồng dịch vụ'
      WHEN 'credit' THEN 'Hợp đồng tín dụng' ELSE 'Hợp đồng' END,
    CASE WHEN COALESCE(NEW.extra->>'value', '') ~ '^-?\d+(\.\d+)?$' THEN (NEW.extra->>'value')::numeric ELSE 0 END,
    v_raw,
    CASE v_raw WHEN 'draft' THEN 'draft' WHEN 'liquidated' THEN 'done' WHEN 'cancelled' THEN 'cancelled' ELSE 'in_progress' END,
    jsonb_build_object('code', NEW.code, 'name', NEW.name, 'note', NEW.note, 'extra', NEW.extra - ARRAY['status', 'createdBy']),
    jsonb_strip_nulls(jsonb_build_object('name', NEW.name, 'startDate', NEW.extra->'startDate', 'endDate', NEW.extra->'endDate',
      'branches', NEW.extra->'branchCodes', 'brands', NEW.extra->'brandCodes', 'items', jsonb_array_length(COALESCE(NEW.extra->'skus', '[]'::jsonb)))),
    COALESCE(NEW.extra->>'createdBy', ''), NULL, NULL, '', NULL);
  RETURN NULL;
END $$;

-- ── 4. Chuyển kho: đã xuất (đi đường) = đang thực hiện, đã nhận = hoàn tất ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_doc_sync_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'kho.transfer:' || NEW.id;
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'kho', 'inventory.transfer', NEW.doc_no, NEW.doc_date, NEW.from_branch_code, '',
    'Phiếu chuyển kho', 0, NEW.status,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'shipped' THEN 'in_progress' WHEN 'cancelled' THEN 'cancelled' ELSE 'done' END,
    to_jsonb(NEW) - ARRAY['status', 'received_date', 'received_by', 'received_note', 'out_doc_key', 'in_doc_key', 'created_at', 'updated_at', 'updated_by', 'einvoice'],
    jsonb_strip_nulls(jsonb_build_object('fromWarehouse', NULLIF(NEW.from_warehouse, ''), 'toBranch', NEW.to_branch_code,
      'toWarehouse', NULLIF(NEW.to_warehouse, ''), 'receivedDate', NEW.received_date, 'receivedBy', NULLIF(NEW.received_by, ''), 'reason', NULLIF(NEW.reason_code, ''))),
    COALESCE(NEW.created_by, NEW.updated_by, ''), NEW.created_at, NEW.updated_at, '', NULL);
  PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || NULLIF(NEW.out_doc_key, ''), 'ledger', NEW.created_by);
  IF NEW.status = 'received' THEN
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'ledger.event:' || NULLIF(NEW.in_doc_key, ''), 'ledger', NEW.created_by);
  END IF;
  RETURN NULL;
END $$;

-- ── 5. Chính sách giá: pricing.policy ────────────────────────────────────────────────────────────────────────────────────
-- Đầu phiếu ghi thẳng (không qua bizcity_doc_put): số bản = số bản phân hệ đã phát hành vào document_versions.
CREATE OR REPLACE FUNCTION bizcity_doc_policy_put(p purchase_policies) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'mua-hang.policy:' || p.id;
  v_raw text := CASE WHEN NOT p.is_active THEN 'inactive' WHEN p.valid_to IS NOT NULL AND p.valid_to < current_date THEN 'expired' ELSE 'published' END;
BEGIN
  INSERT INTO business_documents AS b (tenant_id, doc_ref, module, doc_type, doc_no, doc_date, branch_code, partner_ref, title, total,
                                       status_raw, status, version, meta, created_by, created_at, updated_at)
  VALUES (p.tenant_id, v_ref, 'mua-hang', 'pricing.policy', p.code, p.valid_from,
          COALESCE(NULLIF(p.scope->>'branchCode', ''), p.scope->'branchCodes'->>0, ''), COALESCE(p.scope->>'partnerCode', ''),
          'Chính sách mua hàng', 0, v_raw,
          CASE v_raw WHEN 'published' THEN 'in_progress' WHEN 'expired' THEN 'done' ELSE 'cancelled' END,
          GREATEST(COALESCE(p.version, 1), 1),
          jsonb_strip_nulls(jsonb_build_object('name', p.name, 'kind', p.kind, 'programKind', p.program_kind, 'validFrom', p.valid_from, 'validTo', p.valid_to,
            'contractCode', NULLIF(p.scope->>'contractCode', ''), 'demo', NULLIF(p.is_demo, false))),
          COALESCE(p.created_by, p.updated_by, ''), p.created_at, p.updated_at)
  ON CONFLICT (tenant_id, doc_ref) DO UPDATE SET
    doc_type = EXCLUDED.doc_type, doc_no = EXCLUDED.doc_no, doc_date = EXCLUDED.doc_date, branch_code = EXCLUDED.branch_code,
    partner_ref = EXCLUDED.partner_ref, title = EXCLUDED.title, status_raw = EXCLUDED.status_raw, status = EXCLUDED.status,
    version = EXCLUDED.version, meta = EXCLUDED.meta, updated_at = EXCLUDED.updated_at
  WHERE (b.doc_type, b.doc_no, b.doc_date, b.branch_code, b.partner_ref, b.status_raw, b.status, b.version, b.meta, b.updated_at)
        IS DISTINCT FROM (EXCLUDED.doc_type, EXCLUDED.doc_no, EXCLUDED.doc_date, EXCLUDED.branch_code, EXCLUDED.partner_ref,
                          EXCLUDED.status_raw, EXCLUDED.status, EXCLUDED.version, EXCLUDED.meta, EXCLUDED.updated_at);
  PERFORM bizcity_doc_link(p.tenant_id, v_ref, 'hop-dong.contract:' || NULLIF(p.scope->>'contractCode', ''), 'applies', COALESCE(p.updated_by, ''));
END $$;
COMMENT ON FUNCTION bizcity_doc_policy_put(purchase_policies) IS 'Ghi đầu phiếu chính sách mua vào sổ chứng từ (pricing.policy, 0166); phiên bản do phân hệ ghi.';

CREATE OR REPLACE FUNCTION bizcity_doc_sync_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE business_documents SET status_raw = 'retired', status = 'cancelled', updated_at = now()
     WHERE tenant_id = OLD.tenant_id AND doc_ref = 'mua-hang.policy:' || OLD.id;
    RETURN NULL;
  END IF;
  PERFORM bizcity_doc_policy_put(NEW);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS business_documents_sync ON purchase_policies;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE OR DELETE ON purchase_policies FOR EACH ROW EXECUTE FUNCTION bizcity_doc_sync_policy();

-- ── 6. Cập nhật dữ liệu có sẵn (chỉ đầu phiếu; không thêm phiên bản) ─────────────────────────────────────────────────────
UPDATE business_documents b
   SET doc_type = bizcity_doc_purchase_type(p.kind),
       status = bizcity_doc_purchase_status(p.tenant_id, p.id, p.kind, p.status),
       meta = b.meta || jsonb_build_object('kind', p.kind)
  FROM purchase_documents p
 WHERE b.tenant_id = p.tenant_id AND b.doc_ref = 'mua-hang.document:' || p.id;

UPDATE business_documents SET doc_type = 'purchase.contract' WHERE module = 'hop-dong' AND doc_type = 'contract.goods_supplier';
UPDATE business_documents SET status = 'in_progress'
 WHERE module = 'hop-dong' AND status = 'approved';
UPDATE business_documents SET status = 'in_progress' WHERE doc_type = 'inventory.transfer' AND status_raw = 'shipped';

SELECT bizcity_doc_policy_put(p) FROM purchase_policies p;
