-- [2026-11-05 01:50 PM Nguyễn Văn Thủy] PHASE-026 — S026-19 (docs/core/06-xuong-ca-dinh-danh.md): phủ kín item_id: dòng danh mục, JSON dòng phiếu, khung nhìn đọc (đóng góp)
-- =============================================================================
-- 0070 Phủ kín định danh mặt hàng.
--   products.item_id          dòng danh mục trỏ thẳng định danh, không phải tra qua mã.
--   JSON dòng phiếu           purchase_documents, transfer_requests, stock_max_requests: mỗi dòng có sku thì kèm itemId, do trigger gắn.
--   sales_lines               thêm item_id, tính từ mã tại ngày chứng từ.
--   bizcity_read              ledger_lines, products có item_id; thêm items, item_codes.
--   bizcity_items_of_codes    mã bất kỳ → cả chuỗi gộp, dùng khi lọc sổ theo mặt hàng.
--   bizcity_item_sku_at       định danh + ngày → mã có hiệu lực, dùng cho cửa nạp nhận itemId.
-- Không gắn vào: accounting_events.payload, document_versions.snapshot (nguyên bản nguồn, là căn cứ so nội dung);
-- định danh của các phiếu này nằm trên ledger_lines, inventory_movements, tax_invoice_lines.
-- =============================================================================

-- ── products.item_id ────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN item_id text;
COMMENT ON COLUMN products.item_id IS 'Định danh bất biến của mặt hàng (items.item_id). Đổi mã không đổi cột này; hệ thống cấp, không nhận từ người dùng (0070).';

ALTER TABLE products DISABLE TRIGGER USER;
UPDATE products p SET item_id = c.item_id
  FROM item_codes c
 WHERE c.tenant_id = p.tenant_id AND c.kind = 'sku' AND c.code = p.sku AND c.valid_to IS NULL;
ALTER TABLE products ENABLE TRIGGER USER;
CREATE UNIQUE INDEX products_item ON products (item_id) WHERE item_id IS NOT NULL;
-- Khoá ngoại kiểm cuối giao dịch: định danh được cấp trước khi thêm dòng, mặt hàng tạo ở trigger sau khi thêm.
ALTER TABLE products ADD CONSTRAINT products_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id) DEFERRABLE INITIALLY DEFERRED;

-- Cấp định danh trước khi thêm dòng: chỉ gán giá trị, không ghi gì khác, nên INSERT … ON CONFLICT không làm sai dữ liệu khi trùng mã.
CREATE OR REPLACE FUNCTION bizcity_products_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT c.item_id INTO NEW.item_id FROM item_codes c
   WHERE c.tenant_id = NEW.tenant_id AND c.kind = 'sku' AND c.code = NEW.sku AND c.valid_to IS NULL;
  IF NEW.item_id IS NULL THEN
    NEW.item_id := bizcity_ulid(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_item_id() IS 'Dòng danh mục mới: lấy định danh của mã đang mở, chưa có thì cấp mới (0070).';
CREATE TRIGGER products_item_id BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION bizcity_products_item_id();
-- Dòng còn thiếu định danh tự lành khi sửa.
CREATE TRIGGER products_item_id_fill BEFORE UPDATE ON products FOR EACH ROW WHEN (NEW.item_id IS NULL) EXECUTE FUNCTION bizcity_products_item_id();

CREATE OR REPLACE FUNCTION bizcity_products_item_id_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.item_id IS NOT NULL AND NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    RAISE EXCEPTION 'Định danh mặt hàng không đổi được (mã %).', OLD.sku USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_products_item_id_guard() IS 'Bất biến: products.item_id không đổi sau khi cấp (0070).';
CREATE TRIGGER products_item_id_guard BEFORE UPDATE OF item_id ON products FOR EACH ROW EXECUTE FUNCTION bizcity_products_item_id_guard();

-- Tạo mặt hàng dùng đúng định danh đã cấp trên dòng danh mục.
CREATE OR REPLACE FUNCTION bizcity_items_from_product(p products) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_taken text;
  v_status text := CASE WHEN p.is_draft THEN 'draft' WHEN NOT p.is_active THEN 'retired' ELSE 'active' END;
  v_attrs jsonb := jsonb_strip_nulls(jsonb_build_object('brand', p.brand_code, 'industry', p.industry_code, 'group', p.group_code, 'type', p.type_code, 'parentSku', p.parent_sku));
BEGIN
  -- Mã đang mở mà không có dòng products (mặt hàng mồ côi: mã có trong sổ / kho, 0066) → NHẬN LẠI mặt hàng đó, không tạo mới.
  SELECT c.item_id INTO v_id FROM item_codes c WHERE c.tenant_id = p.tenant_id AND c.kind = 'sku' AND c.code = p.sku AND c.valid_to IS NULL;
  IF v_id IS NOT NULL THEN
    UPDATE items SET name = p.name, unit_base = p.unit, status = v_status, draft_codes = p.draft_codes,
           attributes = (attributes - 'orphan' - 'brand' - 'industry' - 'group' - 'type' - 'parentSku') || v_attrs,
           source_system = p.source_system, retired_at = CASE WHEN p.is_active THEN NULL ELSE COALESCE(retired_at, now()) END
     WHERE item_id = v_id;
  ELSE
    v_taken := bizcity_item_code_taken(p.tenant_id, p.sku);
    IF v_taken IS NOT NULL THEN
      RAISE EXCEPTION 'Mã % đã đổi hoặc đã gộp sang mặt hàng khác (%), không dùng lại cho hàng mới.', p.sku, v_taken USING ERRCODE = 'unique_violation';
    END IF;
    v_id := COALESCE(p.item_id, bizcity_ulid(COALESCE(p.created_at, now())));
    INSERT INTO items (item_id, tenant_id, name, unit_base, status, draft_codes, attributes, source_system, created_at, created_by, retired_at)
    VALUES (v_id, p.tenant_id, p.name, p.unit, v_status, p.draft_codes, v_attrs, p.source_system, COALESCE(p.created_at, now()), 'system:products-sync',
            CASE WHEN NOT p.is_active THEN now() END);
    -- Mã từng dùng cho mặt hàng đã xoá: mã mới bắt đầu từ ngày mã cũ đóng (không chồng hiệu lực, R-ITEM-0).
    INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by)
    VALUES (p.tenant_id, v_id, 'sku', p.sku,
            COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = p.tenant_id AND kind = 'sku' AND code = p.sku), DATE '1970-01-01'), 'system:products-sync');
  END IF;
  IF p.barcode <> '' AND NOT EXISTS (SELECT 1 FROM item_codes WHERE item_id = v_id AND kind = 'barcode' AND code = p.barcode AND valid_to IS NULL) THEN
    BEGIN
      INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by)
      VALUES (p.tenant_id, v_id, 'barcode', p.barcode,
              COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = p.tenant_id AND kind = 'barcode' AND code = p.barcode), DATE '1970-01-01'), 'system:products-sync');
    EXCEPTION WHEN exclusion_violation THEN
      -- Dữ liệu cũ hay có hai mặt hàng cùng mã vạch: không làm hỏng việc ghi mặt hàng, ghi nhận để kế toán xử lý (DG-ITEM-1).
      UPDATE items SET attributes = attributes || jsonb_build_object('barcodeConflict', p.barcode) WHERE item_id = v_id;
    END;
  END IF;
  PERFORM bizcity_item_classify(p.tenant_id, v_id, p);
  PERFORM bizcity_item_fill_refs(p.tenant_id, p.sku, v_id);
  RETURN v_id;
END $$;

-- ── Tra cứu dùng chung ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_of_codes(p_tenant bigint, p_codes text[]) RETURNS SETOF text LANGUAGE sql STABLE AS $$
  SELECT i.item_id
    FROM unnest(p_codes) AS s(code)
    JOIN items r ON r.item_id = bizcity_item_at(p_tenant, s.code, CURRENT_DATE)
    JOIN items i ON i.tenant_id = r.tenant_id AND i.root_item_id = r.root_item_id
$$;
COMMENT ON FUNCTION bizcity_items_of_codes(bigint, text[]) IS 'Các mã bất kỳ (mã cũ, đã gộp đều được) → mọi item_id cùng chuỗi gộp. Dùng khi lọc sổ theo mặt hàng (0070).';

CREATE OR REPLACE FUNCTION bizcity_item_sku_at(p_item text, p_day date) RETURNS text LANGUAGE sql STABLE AS $$
  WITH t AS (SELECT bizcity_item_walk(p_item, p_day) AS id)
  SELECT c.code FROM item_codes c, t
   WHERE c.item_id = t.id AND c.kind = 'sku' AND (c.valid_to IS NULL OR c.valid_to > p_day)
   ORDER BY c.valid_from <= p_day DESC, c.valid_from DESC
   LIMIT 1
$$;
COMMENT ON FUNCTION bizcity_item_sku_at(text, date) IS 'Định danh + ngày → mã hàng có hiệu lực, đi theo chuỗi gộp; ngày trước mã đầu tiên thì lấy mã gần nhất (0070).';

-- ── JSON dòng phiếu ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_json_lines_item_id(p_tenant bigint, p_lines jsonb, p_day date) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(
           CASE WHEN jsonb_typeof(x.l) = 'object' AND COALESCE(x.l->>'sku', '') <> ''
                THEN (x.l - 'itemId') || jsonb_strip_nulls(jsonb_build_object('itemId', bizcity_item_at(p_tenant, x.l->>'sku', p_day)))
                ELSE x.l END
           ORDER BY x.ord), '[]'::jsonb)
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS x(l, ord)
$$;
COMMENT ON FUNCTION bizcity_json_lines_item_id(bigint, jsonb, date) IS 'Gắn itemId cho từng dòng có sku trong mảng JSON, theo mã tại ngày (0070).';

CREATE OR REPLACE FUNCTION bizcity_json_data_item_id(p_tenant bigint, p_data jsonb, p_day date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_key text;
  v_data jsonb := p_data;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['lines', 'items'] LOOP
    IF jsonb_typeof(v_data->v_key) = 'array' THEN
      v_data := jsonb_set(v_data, ARRAY[v_key], bizcity_json_lines_item_id(p_tenant, v_data->v_key, p_day));
    END IF;
  END LOOP;
  RETURN v_data;
END $$;
COMMENT ON FUNCTION bizcity_json_data_item_id(bigint, jsonb, date) IS 'Gắn itemId cho hai mảng dòng của phiếu: lines, items (0070).';

-- Chứng từ mua: theo ngày chứng từ. Đổi trạng thái cũng gắn lại: hàng mới có mã sau khi lập phiếu sẽ có định danh lúc duyệt.
CREATE OR REPLACE FUNCTION bizcity_purchase_doc_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.data IS NOT DISTINCT FROM OLD.data AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  NEW.data := bizcity_json_data_item_id(NEW.tenant_id, NEW.data, NEW.doc_date);
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_purchase_doc_item_id() IS 'Dòng chứng từ mua luôn kèm itemId theo mã tại ngày chứng từ (0070).';
CREATE TRIGGER purchase_documents_item_id BEFORE INSERT OR UPDATE ON purchase_documents FOR EACH ROW EXECUTE FUNCTION bizcity_purchase_doc_item_id();

-- Đề nghị chuyển hàng, đăng ký tồn max: không có ngày chứng từ, theo ngày lập.
CREATE OR REPLACE FUNCTION bizcity_request_item_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.data IS NOT DISTINCT FROM OLD.data AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  NEW.data := bizcity_json_data_item_id(NEW.tenant_id, NEW.data, COALESCE(NEW.created_at, now())::date);
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_request_item_id() IS 'Dòng đề nghị chuyển hàng, đăng ký tồn max luôn kèm itemId theo mã tại ngày lập (0070).';
CREATE TRIGGER transfer_requests_item_id  BEFORE INSERT OR UPDATE ON transfer_requests  FOR EACH ROW EXECUTE FUNCTION bizcity_request_item_id();
CREATE TRIGGER stock_max_requests_item_id BEFORE INSERT OR UPDATE ON stock_max_requests FOR EACH ROW EXECUTE FUNCTION bizcity_request_item_id();

-- Điền phiếu đã có, không đổi updated_at, không tạo phiên bản phiếu.
UPDATE purchase_documents SET data = bizcity_json_data_item_id(tenant_id, data, doc_date)
 WHERE jsonb_typeof(data->'lines') = 'array' OR jsonb_typeof(data->'items') = 'array';
UPDATE transfer_requests SET data = bizcity_json_data_item_id(tenant_id, data, created_at::date)
 WHERE jsonb_typeof(data->'lines') = 'array' OR jsonb_typeof(data->'items') = 'array';
UPDATE stock_max_requests SET data = bizcity_json_data_item_id(tenant_id, data, created_at::date)
 WHERE jsonb_typeof(data->'lines') = 'array' OR jsonb_typeof(data->'items') = 'array';

-- ── Khung nhìn đọc ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Thêm cột ở cuối, giữ nguyên các cột cũ. Không đọc item_id thì hàm tra mã không chạy.
CREATE OR REPLACE VIEW sales_lines AS
 SELECT d.id * 100000 + l.ord AS id,
    d.tenant_id,
    d.id AS event_id,
    d.branch_id,
    d.partner_id,
    d.doc_date,
        CASE
            WHEN d.doc_type = 'sale_return'::text THEN '-1'::integer
            ELSE 1
        END::smallint AS sign,
    l.ord::integer AS line_no,
    COALESCE(l.j ->> 'sku'::text, ''::text) AS sku,
    COALESCE(l.j ->> 'name'::text, ''::text) AS name,
    COALESCE(l.j ->> 'unit'::text, ''::text) AS unit,
    COALESCE((l.j ->> 'qty'::text)::numeric, 0::numeric) AS qty,
    COALESCE((l.j ->> 'unitPrice'::text)::numeric, 0::numeric) AS unit_price,
    COALESCE((l.j ->> 'amountBeforeTax'::text)::numeric, 0::numeric) AS amount_before_tax,
    COALESCE((l.j ->> 'discount'::text)::numeric, 0::numeric) AS discount,
    COALESCE(l.j ->> 'taxCode'::text, ''::text) AS tax_code,
    COALESCE((l.j ->> 'taxAmount'::text)::numeric, 0::numeric) AS tax_amount,
    COALESCE((l.j ->> 'isGift'::text)::boolean, false) AS is_gift,
    (l.j ->> 'cost'::text)::numeric AS cost,
    bizcity_item_at(d.tenant_id, l.j ->> 'sku'::text, d.doc_date) AS item_id
   FROM posted_event_payloads d
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.payload -> 'lines'::text, '[]'::jsonb)) WITH ORDINALITY l(j, ord)
  WHERE d.doc_type = ANY (ARRAY['sale'::text, 'sale_return'::text]);
COMMENT ON COLUMN sales_lines.item_id IS 'Định danh mặt hàng theo mã tại ngày chứng từ (0070).';

CREATE OR REPLACE VIEW bizcity_read.ledger_lines WITH (security_invoker = true) AS
SELECT id, entry_id, tenant_id, branch_id, posting_date, line_no, pair_no, account_code, debit, credit, partner_id, tax_code,
       part, product_sku, description, source_line_key, dims, cost_fill, item_id
  FROM public.ledger_lines;
COMMENT ON COLUMN bizcity_read.ledger_lines.item_id IS 'Định danh mặt hàng. Lọc theo sản phẩm dùng cột này; product_sku là mã lúc ghi (0070).';

CREATE OR REPLACE VIEW bizcity_read.products WITH (security_invoker = true) AS
SELECT tenant_id, sku, parent_sku, name, unit, barcode, group_code, type_code, brand_code, industry_code,
       tax_out_code, tax_in_code, is_active, no_sale, track_identifier, description, image_url, weight_kg, origin, updated_at, item_id
  FROM public.products;
COMMENT ON COLUMN bizcity_read.products.item_id IS 'Định danh bất biến của mặt hàng (0070).';

CREATE OR REPLACE VIEW bizcity_read.items WITH (security_invoker = true) AS
SELECT item_id, tenant_id, name, unit_base, status, parent_item_id, merged_into_item_id, merged_at, root_item_id, source_system, created_at, retired_at
  FROM public.items;
COMMENT ON VIEW bizcity_read.items IS 'Mặt hàng theo định danh bất biến (chỉ đọc): gồm cả mặt hàng đã gộp, đã ngừng (0070).';
COMMENT ON COLUMN bizcity_read.items.item_id IS 'Định danh bất biến, không bao giờ đổi.';
COMMENT ON COLUMN bizcity_read.items.parent_item_id IS 'Mặt hàng cha (họ mã một cấp).';
COMMENT ON COLUMN bizcity_read.items.merged_into_item_id IS 'Đã gộp vào mặt hàng nào; trống là chưa gộp.';
COMMENT ON COLUMN bizcity_read.items.root_item_id IS 'Đích cuối của chuỗi gộp; chưa gộp thì là chính nó.';
CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.items
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

CREATE OR REPLACE VIEW bizcity_read.item_codes WITH (security_invoker = true) AS
SELECT tenant_id, item_id, kind, code, valid_from, valid_to, note
  FROM public.item_codes;
COMMENT ON VIEW bizcity_read.item_codes IS 'Mọi mã của mặt hàng theo ngày hiệu lực (chỉ đọc): sku, barcode, alias, external:<nguồn> (0070).';
COMMENT ON COLUMN bizcity_read.item_codes.kind IS 'Loại mã: sku, barcode, alias, external:<nguồn>.';
COMMENT ON COLUMN bizcity_read.item_codes.valid_to IS 'Ngày đóng (không tính); trống là đang dùng.';
CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.item_codes
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA bizcity_read TO ketoan_app;
    GRANT SELECT ON sales_lines TO ketoan_app;
  END IF;
END $$;
