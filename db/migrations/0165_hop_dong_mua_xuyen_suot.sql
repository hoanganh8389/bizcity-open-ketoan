-- [2026-11-18 Nguyễn Văn Thủy] Hợp đồng mua xuyên suốt + nhãn hàng theo cây nhóm hàng (đóng góp)
--
-- 1) NHÃN / NGÀNH THEO CÂY NHÓM HÀNG. Cây Nhóm hàng (DM11): cấp 1 = ngành, cấp 2 = nhãn, cấp 3 = nhóm sản phẩm; mã hàng sinh theo
--    cây (ngành + nhãn + nhóm + số). Dữ liệu cũ có sẵn nhãn / ngành trùng mã nút cấp 2 / cấp 1, nhưng nút tạo mới thì không — mặt
--    hàng mới không có nhãn, chọn mã ở chính sách / hợp đồng không ra nhãn ("Không có nhãn khớp"). Từ nay:
--      - nút cấp 1 / cấp 2 của cây tự có ngành / nhãn cùng mã, cùng tên (trigger item_classes_mirror);
--      - mặt hàng có nhóm mà chưa có ngành / nhãn thì tự lấy theo tổ tiên cấp 1 / cấp 2 (trigger products_class_from_group).
-- 2) HỢP ĐỒNG MUA = Danh mục hợp đồng (dimensions kind 'contract', loại goods_supplier "Nhà cung cấp hàng hoá") — một nơi cho mọi
--    hợp đồng (mua hàng, thuê nhà, dịch vụ…), mã hợp đồng là số hợp đồng. Không bảng mới:
--      - hợp đồng vào sổ chứng từ chung: hop-dong.contract:<mã> (phiên bản = phụ lục, đính kèm = bản scan);
--      - bảng giá mua thuộc hợp đồng: supplier_products.contract_code; chính sách thuộc hợp đồng: purchase_policies.scope.contractCode;
--      - chứng từ mua thuộc hợp đồng: purchase_documents.data.contractCode → liên kết 'applies' tới hợp đồng; khi ghi sổ, mọi dòng bút
--        toán mang dims.contract (công nợ theo hợp đồng đọc thẳng từ sổ);
--      - chính sách loại 'contract' cũ chuyển thành hợp đồng trong danh mục rồi bỏ.

-- ── 1. Nhãn / ngành theo cây nhóm hàng ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_group_chain(p_tenant bigint, p_group text) RETURNS text[] LANGUAGE sql STABLE AS $$
  WITH RECURSIVE up AS (
    SELECT code, parent_code, 1 AS d FROM item_classes WHERE tenant_id = p_tenant AND kind = 'group' AND code = p_group
    UNION ALL
    SELECT c.code, c.parent_code, up.d + 1 FROM item_classes c JOIN up ON c.tenant_id = p_tenant AND c.kind = 'group' AND c.code = up.parent_code
     WHERE up.d < 20
  )
  SELECT COALESCE(array_agg(code ORDER BY d DESC), '{}'::text[]) FROM up;
$$;
COMMENT ON FUNCTION bizcity_group_chain(bigint, text) IS 'Chuỗi mã nhóm từ gốc (cấp 1) tới nút: [1] = ngành, [2] = nhãn, [3] = nhóm sản phẩm (0163).';

CREATE OR REPLACE FUNCTION bizcity_item_class_mirror() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_lvl int;
  v_kind text;
BEGIN
  IF NEW.kind <> 'group' THEN RETURN NULL; END IF;
  v_lvl := cardinality(bizcity_group_chain(NEW.tenant_id, NEW.code));
  v_kind := CASE v_lvl WHEN 1 THEN 'industry' WHEN 2 THEN 'brand' END;
  IF v_kind IS NULL THEN RETURN NULL; END IF;
  -- Trùng mã với ngành / nhãn cũ khác tên: theo tên của cây nếu ngành / nhãn đó không có mặt hàng ngoài nhánh này dùng; có thì giữ
  -- (mặt hàng của nhánh khi đó không tự nhận ngành / nhãn — xem bizcity_product_class_from_group).
  INSERT INTO item_classes AS c (tenant_id, kind, code, name, is_active, full_name, created_by, updated_by)
  VALUES (NEW.tenant_id, v_kind, NEW.code, NEW.name, NEW.is_active, NEW.full_name, NEW.created_by, NEW.updated_by)
  ON CONFLICT (tenant_id, kind, code) DO UPDATE SET name = EXCLUDED.name, full_name = EXCLUDED.full_name, updated_at = now()
   WHERE lower(c.name) <> lower(EXCLUDED.name) AND NOT EXISTS (
     SELECT 1 FROM products p WHERE p.tenant_id = NEW.tenant_id
        AND (CASE v_lvl WHEN 1 THEN p.industry_code ELSE p.brand_code END) = NEW.code
        AND COALESCE((bizcity_group_chain(p.tenant_id, p.group_code))[v_lvl], '') <> NEW.code);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_item_class_mirror() IS 'Nút cấp 1 / cấp 2 của cây Nhóm hàng tự có ngành / nhãn cùng mã (0163).';
DROP TRIGGER IF EXISTS item_classes_mirror ON item_classes;
CREATE TRIGGER item_classes_mirror AFTER INSERT OR UPDATE OF parent_code, name ON item_classes FOR EACH ROW EXECUTE FUNCTION bizcity_item_class_mirror();

CREATE OR REPLACE FUNCTION bizcity_product_class_from_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_chain text[];
BEGIN
  IF NEW.group_code IS NULL OR (NEW.brand_code IS NOT NULL AND NEW.industry_code IS NOT NULL) THEN RETURN NEW; END IF;
  v_chain := bizcity_group_chain(NEW.tenant_id, NEW.group_code);
  -- Chỉ nhận ngành / nhãn cùng mã VÀ cùng tên với nút của cây (mã trùng với ngành / nhãn cũ khác tên thì để trống, không gán nhầm).
  IF NEW.industry_code IS NULL AND cardinality(v_chain) >= 1 AND EXISTS (
       SELECT 1 FROM item_classes i JOIN item_classes g ON g.tenant_id = i.tenant_id AND g.kind = 'group' AND g.code = i.code
        WHERE i.tenant_id = NEW.tenant_id AND i.kind = 'industry' AND i.code = v_chain[1] AND lower(i.name) = lower(g.name)) THEN
    NEW.industry_code := v_chain[1];
  END IF;
  IF NEW.brand_code IS NULL AND cardinality(v_chain) >= 2 AND EXISTS (
       SELECT 1 FROM item_classes b JOIN item_classes g ON g.tenant_id = b.tenant_id AND g.kind = 'group' AND g.code = b.code
        WHERE b.tenant_id = NEW.tenant_id AND b.kind = 'brand' AND b.code = v_chain[2] AND lower(b.name) = lower(g.name)) THEN
    NEW.brand_code := v_chain[2];
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_product_class_from_group() IS 'Mặt hàng có nhóm mà chưa có ngành / nhãn: lấy theo tổ tiên cấp 1 / cấp 2 của cây nhóm hàng (0163).';
DROP TRIGGER IF EXISTS products_class_from_group ON products;
CREATE TRIGGER products_class_from_group BEFORE INSERT OR UPDATE OF group_code, brand_code, industry_code ON products
  FOR EACH ROW EXECUTE FUNCTION bizcity_product_class_from_group();

-- Nạp lại: nút cấp 1 / cấp 2 đang có, rồi mặt hàng thiếu nhãn / ngành.
INSERT INTO item_classes (tenant_id, kind, code, name, is_active, full_name, created_by, updated_by)
SELECT g.tenant_id, CASE cardinality(bizcity_group_chain(g.tenant_id, g.code)) WHEN 1 THEN 'industry' ELSE 'brand' END,
       g.code, g.name, g.is_active, g.full_name, g.created_by, g.updated_by
  FROM item_classes g
 WHERE g.kind = 'group' AND cardinality(bizcity_group_chain(g.tenant_id, g.code)) IN (1, 2)
ON CONFLICT (tenant_id, kind, code) DO NOTHING;
-- Trùng mã khác tên (vd nhãn cũ 1913 "Bioamicus" vs nút cấp 2 1913 "Bỉm tã Merries"): chạy lại trigger để đổi tên theo cây khi được.
UPDATE item_classes SET name = name WHERE kind = 'group';
UPDATE products p SET brand_code = COALESCE(p.brand_code, x.brand), industry_code = COALESCE(p.industry_code, x.industry)
  FROM (SELECT q.id,
               CASE WHEN EXISTS (SELECT 1 FROM item_classes b JOIN item_classes g ON g.tenant_id = b.tenant_id AND g.kind = 'group' AND g.code = b.code
                                  WHERE b.tenant_id = q.tenant_id AND b.kind = 'brand' AND b.code = q.ch[2] AND lower(b.name) = lower(g.name)) THEN q.ch[2] END AS brand,
               CASE WHEN EXISTS (SELECT 1 FROM item_classes b JOIN item_classes g ON g.tenant_id = b.tenant_id AND g.kind = 'group' AND g.code = b.code
                                  WHERE b.tenant_id = q.tenant_id AND b.kind = 'industry' AND b.code = q.ch[1] AND lower(b.name) = lower(g.name)) THEN q.ch[1] END AS industry
          FROM (SELECT id, tenant_id, bizcity_group_chain(tenant_id, group_code) AS ch FROM products
                 WHERE group_code IS NOT NULL AND (brand_code IS NULL OR industry_code IS NULL)) q) x
 WHERE p.id = x.id AND ((p.brand_code IS NULL AND x.brand IS NOT NULL) OR (p.industry_code IS NULL AND x.industry IS NOT NULL));

-- ── 2. Hợp đồng mua ──────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS contract_code text NOT NULL DEFAULT '';
COMMENT ON COLUMN supplier_products.contract_code IS 'Thuộc hợp đồng mua (mã trong Danh mục hợp đồng); rỗng = giá không theo hợp đồng (0163).';
CREATE INDEX IF NOT EXISTS supplier_products_contract_idx ON supplier_products (tenant_id, contract_code) WHERE contract_code <> '';

-- Chính sách loại 'contract' cũ → hợp đồng trong danh mục (mã = số hợp đồng; trùng mã thì giữ bản đang có).
INSERT INTO dimensions (tenant_id, kind, code, name, note, is_active, extra)
SELECT p.tenant_id, 'contract', left(COALESCE(NULLIF(btrim(p.rule->>'no'), ''), p.code), 64), p.name, COALESCE(p.rule->>'note', ''), true,
       jsonb_strip_nulls(jsonb_build_object('type', 'goods_supplier', 'partnerCode', p.scope->>'partnerCode', 'signedDate', NULLIF(p.rule->>'signedOn', ''),
         'startDate', p.valid_from, 'endDate', p.valid_to, 'status', CASE WHEN p.is_active THEN 'active' ELSE 'liquidated' END,
         'branchCodes', CASE WHEN p.scope ? 'branchCode' THEN jsonb_build_array(p.scope->>'branchCode') END,
         'brandCodes', CASE WHEN p.scope ? 'brandCode' THEN jsonb_build_array(p.scope->>'brandCode') END,
         'skus', CASE WHEN p.scope ? 'sku' THEN jsonb_build_array(p.scope->>'sku') END,
         'createdBy', NULLIF(p.created_by, '')))
  FROM purchase_policies p WHERE p.kind = 'contract'
ON CONFLICT (tenant_id, kind, code) DO NOTHING;
DELETE FROM purchase_policies WHERE kind = 'contract';

-- Hợp đồng vào sổ chứng từ chung.
CREATE OR REPLACE FUNCTION bizcity_doc_sync_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text;
  v_raw text;
BEGIN
  IF NEW.kind <> 'contract' OR NEW.code ~ '\s' THEN RETURN NULL; END IF;
  v_ref := 'hop-dong.contract:' || NEW.code;
  v_raw := COALESCE(NULLIF(NEW.extra->>'status', ''), CASE WHEN NEW.is_active THEN 'active' ELSE 'liquidated' END);
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'hop-dong', 'contract.' || COALESCE(NULLIF(NEW.extra->>'type', ''), 'other'), NEW.code,
    CASE WHEN COALESCE(NEW.extra->>'signedDate', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (NEW.extra->>'signedDate')::date END,
    COALESCE(NEW.extra->'branchCodes'->>0, ''), COALESCE(NEW.extra->>'partnerCode', ''),
    CASE NEW.extra->>'type' WHEN 'goods_supplier' THEN 'Hợp đồng mua hàng' WHEN 'rent' THEN 'Hợp đồng thuê' WHEN 'asset_service' THEN 'Hợp đồng dịch vụ'
      WHEN 'credit' THEN 'Hợp đồng tín dụng' ELSE 'Hợp đồng' END,
    CASE WHEN COALESCE(NEW.extra->>'value', '') ~ '^-?\d+(\.\d+)?$' THEN (NEW.extra->>'value')::numeric ELSE 0 END,
    v_raw,
    CASE v_raw WHEN 'draft' THEN 'draft' WHEN 'liquidated' THEN 'done' WHEN 'cancelled' THEN 'cancelled' ELSE 'approved' END,
    jsonb_build_object('code', NEW.code, 'name', NEW.name, 'note', NEW.note, 'extra', NEW.extra - ARRAY['status', 'createdBy']),
    jsonb_strip_nulls(jsonb_build_object('name', NEW.name, 'startDate', NEW.extra->'startDate', 'endDate', NEW.extra->'endDate',
      'branches', NEW.extra->'branchCodes', 'brands', NEW.extra->'brandCodes', 'items', jsonb_array_length(COALESCE(NEW.extra->'skus', '[]'::jsonb)))),
    COALESCE(NEW.extra->>'createdBy', ''), NULL, NULL, '', NULL);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_doc_sync_contract() IS 'Hợp đồng (Danh mục hợp đồng) → sổ chứng từ chung hop-dong.contract:<mã> (0163).';
DROP TRIGGER IF EXISTS business_documents_sync ON dimensions;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON dimensions FOR EACH ROW WHEN (NEW.kind = 'contract') EXECUTE FUNCTION bizcity_doc_sync_contract();

-- Phiếu mua thuộc hợp đồng → liên kết 'applies' tới hợp đồng.
CREATE OR REPLACE FUNCTION bizcity_doc_sync_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := 'mua-hang.document:' || NEW.id;
  v_src bigint;
  v_link jsonb;
  v_id bigint;
BEGIN
  PERFORM bizcity_doc_put(NEW.tenant_id, v_ref, 'mua-hang', 'purchase.' || NEW.kind, NEW.doc_no, NEW.doc_date, NEW.branch_code,
    COALESCE(NULLIF(NEW.partner_code, ''), NEW.partner_uid, ''),
    CASE NEW.kind WHEN 'order' THEN 'Đơn đặt hàng' WHEN 'receipt' THEN 'Phiếu nhập mua' WHEN 'return' THEN 'Phiếu trả hàng NCC'
      WHEN 'cost' THEN 'Chi phí mua hàng' WHEN 'payment' THEN 'Thanh toán NCC' WHEN 'prepayment' THEN 'Trả trước NCC'
      WHEN 'rebate' THEN 'Thưởng / chiết khấu NCC' WHEN 'gift_in' THEN 'Nhận hàng tặng' WHEN 'gift_out' THEN 'Xuất hàng tặng'
      WHEN 'exchange' THEN 'Đổi hàng NCC' ELSE 'Chứng từ mua hàng' END,
    NEW.total, NEW.status,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'pending_approval' THEN 'pending' WHEN 'cancelled' THEN 'cancelled' ELSE 'approved' END,
    to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approved_at', 'created_at', 'updated_at', 'links'],
    jsonb_strip_nulls(jsonb_build_object('invoiceNo', NULLIF(NEW.invoice_no, ''), 'invoiceDate', NEW.invoice_date, 'dueDate', NEW.due_date,
      'totalBeforeTax', NEW.total_before_tax, 'totalTax', NEW.total_tax, 'demo', NULLIF(NEW.is_demo, false))),
    COALESCE(NULLIF(NEW.created_by_name, ''), NEW.created_by), NEW.created_at, NEW.updated_at,
    CASE WHEN NEW.status IN ('draft', 'pending_approval') THEN '' ELSE COALESCE(NULLIF(NEW.approved_by, ''), NEW.data->>'approvedActor', '') END,
    CASE WHEN NEW.status IN ('draft', 'pending_approval') THEN NULL ELSE NEW.approved_at END);
  FOREACH v_src IN ARRAY COALESCE(NEW.ref_ids, '{}'::bigint[]) LOOP
    PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'mua-hang.document:' || v_src, 'source', NEW.created_by);
  END LOOP;
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
  -- Thuộc hợp đồng (0163): phiếu lập theo hợp đồng mua → hop-dong.contract:<số hợp đồng>.
  PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, 'hop-dong.contract:' || NULLIF(NEW.data->>'contractCode', ''), 'applies', NEW.created_by);
  RETURN NULL;
END $$;

-- ── Nạp lại ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
UPDATE dimensions SET code = code WHERE kind = 'contract';
