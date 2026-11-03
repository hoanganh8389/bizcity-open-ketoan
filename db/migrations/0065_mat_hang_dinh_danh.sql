-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: sửa trước khi phát hành — tạo lại mã đã xoá không vấp chặn chồng hiệu lực; nhận lại mặt hàng mồ côi; hàm phân loại dùng chung; móc điền item_id (0066)
-- [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a (S024-4 / 5, D024-1 / 2, R-ITEM-0 / 1 / 5 / 7): Item Master chạy SONG SONG với products — items (định danh bất biến), item_codes (mã có phiên bản), item_classification (phân loại theo ngày)
-- =============================================================================
-- 0065 Item Master — bước B2a (chạy song song, chưa ai đọc; `products` CHƯA đổi).
--   items                 item_id ULID bất biến (D024-1); tên, đơn vị gốc, trạng thái (nháp / đang dùng / ngừng), thuộc tính. KHÔNG có cột mã.
--   item_codes            mã hàng CÓ PHIÊN BẢN: (kind, code, valid_from, valid_to) → item_id. Chỉ thêm; UPDATE duy nhất = đóng valid_to.
--   item_classification   phân loại hạch toán theo ngày hiệu lực (nhóm hạch toán, thuế, theo dõi); chưa phân loại = kind NULL (R-ITEM-8).
--   Bất biến Ở CSDL (không chỉ ở code): không đổi / xoá item_id; item_codes chỉ thêm; tại một ngày một (đơn vị, loại mã, mã) trỏ ≤ 1 mặt hàng.
--   Đồng bộ: trigger trên products giữ items / item_codes / item_classification khớp MỌI đường ghi mặt hàng (form, Excel, POS, module…)
--   nên không có cửa phụ; bỏ trigger khi products thành khung nhìn (B2b). Điền ban đầu từ products bằng bizcity_items_backfill().
--   Lộ trình: docs/phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/70-LO-TRINH-ON-DINH-CORE.md §3.1.
-- =============================================================================

-- ── ULID: 48 bit thời gian (ms) + 80 bit ngẫu nhiên, Crockford base32, 26 ký tự, sắp theo thời gian ───────────────────────
CREATE OR REPLACE FUNCTION bizcity_ulid(ts timestamptz DEFAULT clock_timestamp()) RETURNS text
  LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ms bigint := (extract(epoch FROM ts) * 1000)::bigint;
  out text := '';
  i int;
BEGIN
  FOR i IN REVERSE 9..0 LOOP
    out := out || substr(alphabet, ((ms >> (5 * i)) & 31)::int + 1, 1);
  END LOOP;
  FOR i IN 1..16 LOOP
    out := out || substr(alphabet, floor(random() * 32)::int + 1, 1);
  END LOOP;
  RETURN out;
END $$;
COMMENT ON FUNCTION bizcity_ulid(timestamptz) IS 'ULID 26 ký tự (D024-1): 10 ký tự thời gian + 16 ngẫu nhiên, Crockford base32. Cấp item_id.';

-- ── Bảng ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE items (
  item_id        text        PRIMARY KEY DEFAULT bizcity_ulid() CHECK (item_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  tenant_id      bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           text        NOT NULL DEFAULT '',
  unit_base      text        NOT NULL DEFAULT '',
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  draft_codes    text[]      NOT NULL DEFAULT '{}',
  parent_item_id text        REFERENCES items(item_id),
  attributes     jsonb       NOT NULL DEFAULT '{}',
  source_system  text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text        NOT NULL DEFAULT 'system',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  retired_at     timestamptz,
  UNIQUE (tenant_id, item_id)
);
CREATE INDEX items_tenant_status ON items (tenant_id, status);

CREATE TABLE item_codes (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   bigint      NOT NULL,
  item_id     text        NOT NULL,
  kind        text        NOT NULL CHECK (kind ~ '^(sku|barcode|alias|external:[a-z0-9_.-]{1,32})$'),
  code        text        NOT NULL CHECK (length(code) BETWEEN 1 AND 160),
  valid_from  date        NOT NULL DEFAULT '1970-01-01',
  valid_to    date        CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by  text        NOT NULL DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now(),
  note        text        NOT NULL DEFAULT '',
  FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id),
  UNIQUE (tenant_id, kind, code, valid_from)
);
CREATE INDEX item_codes_lookup ON item_codes (tenant_id, kind, code);
CREATE INDEX item_codes_item ON item_codes (item_id);

CREATE TABLE item_classification (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id          bigint      NOT NULL,
  item_id            text        NOT NULL,
  valid_from         date        NOT NULL DEFAULT '1970-01-01',
  valid_to           date        CHECK (valid_to IS NULL OR valid_to > valid_from),
  kind               text        CHECK (kind IS NULL OR kind IN ('goods', 'material', 'finished', 'service', 'tool', 'asset', 'gift', 'packaging', 'other')),
  posting_group_code text,
  tax_out_code       text,
  tax_in_code        text,
  excise_rate        numeric,
  track              text[]      NOT NULL DEFAULT '{}',
  policy_version     int,
  created_by         text        NOT NULL DEFAULT 'system',
  created_at         timestamptz NOT NULL DEFAULT now(),
  note               text        NOT NULL DEFAULT '',
  FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id),
  UNIQUE (tenant_id, item_id, valid_from)
);
CREATE INDEX item_classification_item ON item_classification (tenant_id, item_id, valid_from);

-- ── Bất biến ở CSDL ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Định danh mặt hàng bất biến (R-ITEM-0): không đổi item_id, đơn vị, ngày tạo của mặt hàng %.', OLD.item_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Không xoá mặt hàng (R-ITEM-0): item_id không dùng lại — ngừng dùng bằng status = retired.' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_items_guard() IS 'Bất biến items (R-ITEM-0): không đổi item_id / đơn vị / ngày tạo, không xoá.';
CREATE TRIGGER items_guard BEFORE UPDATE OR DELETE ON items FOR EACH ROW EXECUTE FUNCTION bizcity_items_guard();

CREATE OR REPLACE FUNCTION bizcity_item_truncate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không TRUNCATE bảng định danh mặt hàng (R-ITEM-0).' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_item_truncate_guard() IS 'Chặn TRUNCATE items / item_codes / item_classification (R-ITEM-0).';
CREATE TRIGGER items_no_truncate BEFORE TRUNCATE ON items FOR EACH STATEMENT EXECUTE FUNCTION bizcity_item_truncate_guard();
CREATE TRIGGER item_codes_no_truncate BEFORE TRUNCATE ON item_codes FOR EACH STATEMENT EXECUTE FUNCTION bizcity_item_truncate_guard();
CREATE TRIGGER item_classification_no_truncate BEFORE TRUNCATE ON item_classification FOR EACH STATEMENT EXECUTE FUNCTION bizcity_item_truncate_guard();

CREATE OR REPLACE FUNCTION bizcity_item_codes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Một (đơn vị, loại mã, mã) tại một ngày trỏ ≤ 1 mặt hàng (DG-ITEM-1): khoá để hai lần ghi song song không cùng lọt.
    -- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: khoá theo (đơn vị, loại mã), KHÔNG theo từng mã — nạp 20.000 mặt hàng
    -- trong một giao dịch với khoá từng mã làm cạn bảng khoá (out of shared memory / max_locks_per_transaction). Đổi lại: ghi mã cùng
    -- đơn vị đi nối đuôi tới hết giao dịch (đơn vị khác không ảnh hưởng).
    PERFORM pg_advisory_xact_lock(hashtextextended('item_codes|' || NEW.tenant_id::text || '|' || NEW.kind, 0));
    IF EXISTS (SELECT 1 FROM item_codes c
                WHERE c.tenant_id = NEW.tenant_id AND c.kind = NEW.kind AND c.code = NEW.code
                  AND daterange(c.valid_from, c.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
      RAISE EXCEPTION 'Mã % (%) đã có hiệu lực trong khoảng này (một mã tại một ngày chỉ trỏ một mặt hàng — DG-ITEM-1).', NEW.code, NEW.kind USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Chỉ thêm (R-ITEM-0): UPDATE duy nhất được phép là ĐÓNG hiệu lực (valid_to từ NULL thành ngày) và sửa ghi chú.
    IF (to_jsonb(NEW) - 'valid_to' - 'note') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to' - 'note') THEN
      RAISE EXCEPTION 'Mã hàng chỉ thêm (R-ITEM-0): không sửa mã, loại mã, mặt hàng, ngày bắt đầu — đổi mã = đóng mã cũ + thêm mã mới.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
      RAISE EXCEPTION 'Mã % đã đóng hiệu lực, không mở lại / đổi ngày đóng (R-ITEM-0).', OLD.code USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Mã hàng chỉ thêm (R-ITEM-0): không xoá, đóng hiệu lực (valid_to).' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_item_codes_guard() IS 'Bất biến item_codes: chỉ thêm, UPDATE duy nhất là đóng valid_to, chặn chồng hiệu lực cùng (đơn vị, loại, mã).';
CREATE TRIGGER item_codes_guard BEFORE INSERT OR UPDATE OR DELETE ON item_codes FOR EACH ROW EXECUTE FUNCTION bizcity_item_codes_guard();

CREATE OR REPLACE FUNCTION bizcity_item_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('item_classification|' || NEW.tenant_id::text, 1));   -- theo đơn vị (như item_codes, B2b)
    IF EXISTS (SELECT 1 FROM item_classification c
                WHERE c.tenant_id = NEW.tenant_id AND c.item_id = NEW.item_id
                  AND daterange(c.valid_from, c.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
      RAISE EXCEPTION 'Phân loại của mặt hàng % đã có hiệu lực trong khoảng này.', NEW.item_id USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Phân loại có ngày hiệu lực (R-ITEM-7): không đổi mặt hàng / ngày bắt đầu.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    -- Đóng hiệu lực: được. Sửa nội dung: chỉ bản ĐANG MỞ bắt đầu hoặc được tạo từ hôm nay (chỉnh trong ngày); bản của ngày trước là lịch sử.
    IF (to_jsonb(NEW) - 'valid_to' - 'note') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to' - 'note')
       AND NOT (OLD.valid_to IS NULL AND (OLD.valid_from >= CURRENT_DATE OR OLD.created_at >= CURRENT_DATE::timestamptz)) THEN
      RAISE EXCEPTION 'Phân loại của ngày trước là lịch sử (R-ITEM-5): đổi phân loại = đóng bản cũ + thêm bản mới có ngày hiệu lực.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
      RAISE EXCEPTION 'Bản phân loại đã đóng hiệu lực, không mở lại / đổi ngày đóng (R-ITEM-5).' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Phân loại hạch toán chỉ thêm (R-ITEM-5): không xoá, đóng hiệu lực.' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_item_classification_guard() IS 'Bất biến item_classification: lịch sử không bị sửa / xoá; chỉ chỉnh bản đang mở bắt đầu / tạo hôm nay; chặn chồng hiệu lực.';
CREATE TRIGGER item_classification_guard BEFORE INSERT OR UPDATE OR DELETE ON item_classification FOR EACH ROW EXECUTE FUNCTION bizcity_item_classification_guard();

-- ── Phân loại hiện hành của một mặt hàng theo một dòng products (dùng chung) ──────────────────────────────────────────────
-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: tách hàm phân loại; tạo lại mã đã xoá / nhận mặt hàng mồ côi không vấp chặn chồng hiệu lực
CREATE OR REPLACE FUNCTION bizcity_item_classify(p_tenant bigint, p_item text, p products) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_day date := CURRENT_DATE;
  v_cur item_classification%ROWTYPE;
  v_track text[] := CASE WHEN p.track_identifier THEN ARRAY['identifier'] ELSE '{}'::text[] END;
BEGIN
  SELECT * INTO v_cur FROM item_classification WHERE tenant_id = p_tenant AND item_id = p_item AND valid_to IS NULL;
  IF NOT FOUND THEN
    -- chưa có bản nào: bản đầu tiên có hiệu lực từ 1970 (hoặc từ ngày đóng của bản cũ nếu có)
    INSERT INTO item_classification (tenant_id, item_id, valid_from, posting_group_code, tax_out_code, tax_in_code, excise_rate, track, created_by)
    VALUES (p_tenant, p_item, COALESCE((SELECT max(valid_to) FROM item_classification WHERE tenant_id = p_tenant AND item_id = p_item), DATE '1970-01-01'),
            p.posting_group_code, p.tax_out_code, p.tax_in_code, p.excise_rate, v_track, 'system:products-sync');
    RETURN;
  END IF;
  IF (v_cur.posting_group_code, v_cur.tax_out_code, v_cur.tax_in_code, v_cur.excise_rate, v_cur.track)
     IS NOT DISTINCT FROM (p.posting_group_code, p.tax_out_code, p.tax_in_code, p.excise_rate::numeric, v_track) THEN
    RETURN;                                          -- không đổi
  END IF;
  IF v_cur.valid_from >= v_day OR v_cur.created_at >= v_day::timestamptz THEN
    -- chỉnh trong ngày: sửa bản đang mở
    UPDATE item_classification SET posting_group_code = p.posting_group_code, tax_out_code = p.tax_out_code, tax_in_code = p.tax_in_code,
           excise_rate = p.excise_rate, track = v_track WHERE id = v_cur.id;
  ELSE
    -- đổi từ hôm nay: đóng bản cũ + thêm bản mới (lịch sử giữ nguyên)
    UPDATE item_classification SET valid_to = v_day WHERE id = v_cur.id;
    INSERT INTO item_classification (tenant_id, item_id, valid_from, posting_group_code, tax_out_code, tax_in_code, excise_rate, track, created_by)
    VALUES (p_tenant, p_item, v_day, p.posting_group_code, p.tax_out_code, p.tax_in_code, p.excise_rate, v_track, 'system:products-sync');
  END IF;
END $$;
COMMENT ON FUNCTION bizcity_item_classify(bigint, text, products) IS 'Phân loại hiện hành theo một dòng products: không đổi → bỏ qua; bản tạo / bắt đầu hôm nay → sửa tại chỗ; khác → đóng bản cũ, thêm bản mới từ hôm nay.';

-- Điền item_id vào các dòng đã có mã nhưng chưa có item_id (mặt hàng vừa được tạo sau chứng từ). 0066 thay thân hàm khi các bảng sổ / kho có cột item_id.
CREATE OR REPLACE FUNCTION bizcity_item_fill_refs(p_tenant bigint, p_sku text, p_item text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RETURN;
END $$;
COMMENT ON FUNCTION bizcity_item_fill_refs(bigint, text, text) IS 'Điền item_id cho dòng sổ / kho / đơn vị / giá mang mã này mà chưa có item_id (thân hàm đầy đủ ở 0066).';

-- ── Tạo (hoặc nhận lại) mặt hàng từ một dòng products (dùng cho trigger và điền ban đầu) ──────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_from_product(p products) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
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
    v_id := bizcity_ulid(COALESCE(p.created_at, now()));
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
COMMENT ON FUNCTION bizcity_items_from_product(products) IS 'Tạo items + item_codes (sku, mã vạch) + item_classification từ một dòng products; mã đang mở của mặt hàng mồ côi thì nhận lại mặt hàng đó (B2a / B2b).';

-- ── Đồng bộ mọi đường ghi products (bỏ khi products thành khung nhìn, B2b) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_day date := CURRENT_DATE;
  v_old_from date;
  v_from date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM bizcity_items_from_product(NEW);
    RETURN NEW;
  END IF;

  SELECT c.item_id, c.valid_from INTO v_id, v_old_from FROM item_codes c
   WHERE c.tenant_id = OLD.tenant_id AND c.kind = 'sku' AND c.code = OLD.sku AND c.valid_to IS NULL;

  IF TG_OP = 'DELETE' THEN
    IF v_id IS NOT NULL THEN
      UPDATE items SET status = 'retired', retired_at = COALESCE(retired_at, now()) WHERE item_id = v_id;
      UPDATE item_codes SET valid_to = GREATEST(v_day, valid_from + 1) WHERE item_id = v_id AND valid_to IS NULL;
    END IF;
    RETURN OLD;
  END IF;

  IF v_id IS NULL THEN            -- mặt hàng chưa có định danh (dòng có trước migration, điền sót): tạo mới
    PERFORM bizcity_items_from_product(NEW);
    RETURN NEW;
  END IF;

  IF NEW.sku IS DISTINCT FROM OLD.sku THEN        -- đổi mã = đóng mã cũ + thêm mã mới, item_id giữ nguyên (R-ITEM-0)
    v_from := GREATEST(v_day, v_old_from + 1);
    -- mã mới từng dùng cho mặt hàng đã xoá: bắt đầu sau ngày mã đó đóng
    v_from := GREATEST(v_from, COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = NEW.tenant_id AND kind = 'sku' AND code = NEW.sku), v_from));
    UPDATE item_codes SET valid_to = v_from WHERE item_id = v_id AND kind = 'sku' AND valid_to IS NULL;
    INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by, note)
    VALUES (NEW.tenant_id, v_id, 'sku', NEW.sku, v_from, 'system:products-sync', 'đổi mã từ ' || OLD.sku);
    PERFORM bizcity_item_fill_refs(NEW.tenant_id, NEW.sku, v_id);
  END IF;

  IF NEW.barcode IS DISTINCT FROM OLD.barcode THEN
    UPDATE item_codes SET valid_to = GREATEST(v_day, valid_from + 1) WHERE item_id = v_id AND kind = 'barcode' AND valid_to IS NULL;
    IF NEW.barcode <> '' THEN
      BEGIN
        INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by)
        VALUES (NEW.tenant_id, v_id, 'barcode', NEW.barcode, GREATEST(v_day, COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = NEW.tenant_id AND kind = 'barcode' AND code = NEW.barcode), v_day)), 'system:products-sync');
      EXCEPTION WHEN exclusion_violation THEN
        UPDATE items SET attributes = attributes || jsonb_build_object('barcodeConflict', NEW.barcode) WHERE item_id = v_id;
      END;
    END IF;
  END IF;

  IF (NEW.name, NEW.unit, NEW.is_active, NEW.is_draft, NEW.draft_codes, NEW.brand_code, NEW.industry_code, NEW.group_code, NEW.type_code, NEW.parent_sku, NEW.source_system)
     IS DISTINCT FROM (OLD.name, OLD.unit, OLD.is_active, OLD.is_draft, OLD.draft_codes, OLD.brand_code, OLD.industry_code, OLD.group_code, OLD.type_code, OLD.parent_sku, OLD.source_system) THEN
    UPDATE items SET name = NEW.name, unit_base = NEW.unit,
           status = CASE WHEN NEW.is_draft THEN 'draft' WHEN NOT NEW.is_active THEN 'retired' ELSE 'active' END,
           draft_codes = NEW.draft_codes,
           attributes = (attributes - 'brand' - 'industry' - 'group' - 'type' - 'parentSku')
                        || jsonb_strip_nulls(jsonb_build_object('brand', NEW.brand_code, 'industry', NEW.industry_code, 'group', NEW.group_code, 'type', NEW.type_code, 'parentSku', NEW.parent_sku)),
           source_system = NEW.source_system,
           retired_at = CASE WHEN NEW.is_active THEN NULL ELSE COALESCE(retired_at, now()) END
     WHERE item_id = v_id;
  END IF;

  IF (NEW.posting_group_code, NEW.tax_out_code, NEW.tax_in_code, NEW.excise_rate, NEW.track_identifier)
     IS DISTINCT FROM (OLD.posting_group_code, OLD.tax_out_code, OLD.tax_in_code, OLD.excise_rate, OLD.track_identifier) THEN
    PERFORM bizcity_item_classify(NEW.tenant_id, v_id, NEW);   -- trong ngày: sửa bản đang mở; khác ngày: bản mới từ hôm nay
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_items_sync() IS 'B2a: giữ items / item_codes / item_classification khớp products ở mọi đường ghi (không cửa phụ). Bỏ ở B2b khi products thành khung nhìn.';
CREATE TRIGGER products_items_sync AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION bizcity_items_sync();

-- ── Điền từ products đang có (idempotent) ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_items_backfill(p_tenant bigint DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r products;
  n int := 0;
BEGIN
  FOR r IN SELECT p.* FROM products p
            WHERE (p_tenant IS NULL OR p.tenant_id = p_tenant)
              AND NOT EXISTS (SELECT 1 FROM item_codes c WHERE c.tenant_id = p.tenant_id AND c.kind = 'sku' AND c.code = p.sku AND c.valid_to IS NULL)
            ORDER BY p.created_at, p.id LOOP
    PERFORM bizcity_items_from_product(r);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
COMMENT ON FUNCTION bizcity_items_backfill(bigint) IS 'Điền items / item_codes / item_classification từ products chưa có định danh; trả số mặt hàng mới điền. Chạy lại an toàn.';
SELECT bizcity_items_backfill();

-- ── Cô lập đơn vị (như 0041) và quyền vai trò API (0032): không DELETE ────────────────────────────────────────────────────
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON items USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
ALTER TABLE item_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_codes USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
ALTER TABLE item_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_classification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_classification USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON items, item_codes, item_classification TO ketoan_app;
    -- quyền mặc định của schema (0032) tự cấp cả DELETE cho bảng mới: thu hồi cho rõ (trigger vẫn chặn xoá)
    REVOKE DELETE, TRUNCATE ON items, item_codes, item_classification FROM ketoan_app;
    GRANT USAGE ON SEQUENCE item_codes_id_seq, item_classification_id_seq TO ketoan_app;
  END IF;
END $$;

-- ── Chú thích ────────────────────────────────────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE items IS 'Item Master (0065, D024-1): định danh bất biến của mặt hàng; KHÔNG có cột mã. Chạy song song với products (B2a).';
COMMENT ON COLUMN items.item_id IS 'ULID 26 ký tự, cấp một lần, không đổi, không xoá, không dùng lại (R-ITEM-0).';
COMMENT ON COLUMN items.tenant_id IS 'Đơn vị sở hữu.';
COMMENT ON COLUMN items.name IS 'Tên mặt hàng (thuộc tính, sửa thoải mái).';
COMMENT ON COLUMN items.unit_base IS 'Đơn vị tính gốc (nhỏ nhất).';
COMMENT ON COLUMN items.status IS 'draft (Gate A còn lỗi chặn, ADR-0019) · active · retired (ngừng dùng; item_id vẫn giữ).';
COMMENT ON COLUMN items.draft_codes IS 'Mã lỗi chặn khiến còn nháp (ITEM-BLOCK-*).';
COMMENT ON COLUMN items.parent_item_id IS 'Biến thể theo dõi tồn riêng (D024-7); thường NULL.';
COMMENT ON COLUMN items.attributes IS 'Thuộc tính trưng bày / phân nhóm (nhãn, ngành, nhóm, loại, mã cha cũ…) — không phải khoá liên kết kế toán (R-ITEM-2).';
COMMENT ON COLUMN items.source_system IS 'Nguồn tạo (document, pos, excel…).';
COMMENT ON COLUMN items.created_at IS 'Lúc tạo (không đổi).';
COMMENT ON COLUMN items.created_by IS 'Người / hệ thống tạo.';
COMMENT ON COLUMN items.updated_at IS 'Lần sửa gần nhất.';
COMMENT ON COLUMN items.retired_at IS 'Lúc ngừng dùng.';
COMMENT ON TABLE item_codes IS 'Mã hàng CÓ PHIÊN BẢN (0065, R-ITEM-0): (loại, mã, hiệu lực) → item_id. Chỉ thêm; UPDATE duy nhất là đóng valid_to. Tại một ngày một mã trỏ ≤ 1 mặt hàng.';
COMMENT ON COLUMN item_codes.id IS 'Khoá nội bộ.';
COMMENT ON COLUMN item_codes.tenant_id IS 'Đơn vị (cùng đơn vị với mặt hàng, khoá ngoại ghép).';
COMMENT ON COLUMN item_codes.item_id IS 'Mặt hàng mã này trỏ tới.';
COMMENT ON COLUMN item_codes.kind IS 'sku · barcode · alias (gộp mã) · external:<nguồn> (mã của hệ thống ngoài).';
COMMENT ON COLUMN item_codes.code IS 'Mã.';
COMMENT ON COLUMN item_codes.valid_from IS 'Hiệu lực từ ngày (gồm). Dữ liệu điền từ products: 1970-01-01.';
COMMENT ON COLUMN item_codes.valid_to IS 'Hiệu lực đến ngày (không gồm); NULL = còn hiệu lực. Đóng một lần.';
COMMENT ON COLUMN item_codes.created_by IS 'Người / hệ thống thêm mã.';
COMMENT ON COLUMN item_codes.created_at IS 'Lúc thêm.';
COMMENT ON COLUMN item_codes.note IS 'Ghi chú (vd "đổi mã từ SUA01").';
COMMENT ON TABLE item_classification IS 'Phân loại hạch toán của mặt hàng theo ngày hiệu lực (0065, R-ITEM-7). Lịch sử không sửa; kind NULL = chưa phân loại (R-ITEM-8).';
COMMENT ON COLUMN item_classification.id IS 'Khoá nội bộ.';
COMMENT ON COLUMN item_classification.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN item_classification.item_id IS 'Mặt hàng.';
COMMENT ON COLUMN item_classification.valid_from IS 'Hiệu lực từ ngày (gồm).';
COMMENT ON COLUMN item_classification.valid_to IS 'Hiệu lực đến ngày (không gồm); NULL = hiện hành.';
COMMENT ON COLUMN item_classification.kind IS 'goods · material · finished · service · tool · asset · gift · packaging · other; NULL = chưa phân loại.';
COMMENT ON COLUMN item_classification.posting_group_code IS 'Nhóm hạch toán (product_posting_groups).';
COMMENT ON COLUMN item_classification.tax_out_code IS 'Loại thuế đầu ra.';
COMMENT ON COLUMN item_classification.tax_in_code IS 'Loại thuế đầu vào.';
COMMENT ON COLUMN item_classification.excise_rate IS 'Thuế tiêu thụ đặc biệt (%).';
COMMENT ON COLUMN item_classification.track IS 'Theo dõi thêm: identifier (mã định danh) · lot · expiry · serial.';
COMMENT ON COLUMN item_classification.policy_version IS 'Phiên bản chính sách kế toán lúc chụp (ADR-0009); NULL cho tới khi phát hành chế độ chụp.';
COMMENT ON COLUMN item_classification.created_by IS 'Người / hệ thống tạo bản này.';
COMMENT ON COLUMN item_classification.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN item_classification.note IS 'Ghi chú.';
