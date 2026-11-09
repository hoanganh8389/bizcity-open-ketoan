-- [2026-11-08 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 1 (E3, ECP-03, T029-ECP-P001): entity_attributes — thuộc tính có hiệu lực của đối tượng / chi nhánh / kho + tên đối tượng lúc ghi trên sổ cái — chữ chốt docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md
-- =============================================================================
-- 0087 Thuộc tính có hiệu lực (tên, MST, địa chỉ) và tên đối tượng lúc ghi.
--   NGUỒN SỰ THẬT của tên / MST / địa chỉ tại một ngày là entity_attributes (chỉ thêm, có `version` và hiệu lực), KHÔNG phải cột trên
--   bảng thực thể: cột partners.name / tax_code / address là ảnh chụp hiện hành (giữ cho mọi nơi đang đọc), trigger giữ khớp ở mọi đường ghi.
--   Tên lúc ghi: ledger_entries / ledger_lines thêm partner_name + partner_attr_id, trigger BEFORE INSERT điền theo NGÀY CHỨNG TỪ
--   (không theo lúc ghi sổ): chứng từ nhập muộn vẫn mang tên đúng tại ngày phát sinh. partner_attr_id trỏ ĐÚNG bản thuộc tính đã dùng
--   (có version, valid_from) nên đọc một dòng sổ là biết tên lấy từ phiên bản nào. Bút toán đảo mang tên của bút toán gốc.
--   Mức K3 (thêm cột + trigger trên ledger_*): cột nullable chỉ THÊM; trigger chỉ điền khi INSERT và khi cột đang rỗng; dòng đã ghi giữ
--   nguyên (cột để trống — báo cáo đợt 2 đọc COALESCE(partner_name, tên hiện tại)); ledger_*_no_update không đổi; tên không vào dấu vân
--   tay bút toán. Đường lui: DROP TRIGGER ledger_entries_partner_name, ledger_lines_partner_name; DROP COLUMN partner_name,
--   partner_attr_id ở hai bảng; DROP TABLE entity_attributes.
--   Đổi thuộc tính qua cột (UPDATE partners SET name…) có hiệu lực từ HÔM NAY (hoặc ngày sau bản cũ ít nhất một ngày: sửa lần hai
--   trong cùng ngày có hiệu lực từ ngày kế tiếp). Điền ban đầu từ dòng đang có; chạy lại an toàn.
-- =============================================================================

CREATE TABLE entity_attributes (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   bigint      NOT NULL,
  entity_type text        NOT NULL CHECK (entity_type IN ('partner', 'branch', 'warehouse')),
  entity_id   bigint      NOT NULL,
  version     integer     NOT NULL DEFAULT 0 CHECK (version >= 1),
  name        text        NOT NULL,
  tax_code    text,
  address     text,
  valid_from  date        NOT NULL DEFAULT '1970-01-01',
  valid_to    date        CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by  text        NOT NULL DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now(),
  note        text        NOT NULL DEFAULT '',
  UNIQUE (tenant_id, entity_type, entity_id, version),
  UNIQUE (tenant_id, entity_type, entity_id, valid_from)
);
CREATE INDEX entity_attributes_entity ON entity_attributes (tenant_id, entity_type, entity_id);

-- ── Bất biến ở CSDL ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_entity_attr_truncate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không TRUNCATE bảng thuộc tính thực thể (entity_attributes): lịch sử tên / MST / địa chỉ chỉ thêm.' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_entity_attr_truncate_guard() IS 'Chặn TRUNCATE entity_attributes (0087, S029-19).';
CREATE TRIGGER entity_attributes_no_truncate BEFORE TRUNCATE ON entity_attributes FOR EACH STATEMENT EXECUTE FUNCTION bizcity_entity_attr_truncate_guard();

CREATE OR REPLACE FUNCTION bizcity_entity_attr_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT id, tenant_id FROM partners   WHERE NEW.entity_type = 'partner'
        UNION ALL SELECT id, tenant_id FROM branches   WHERE NEW.entity_type = 'branch'
        UNION ALL SELECT id, tenant_id FROM warehouses WHERE NEW.entity_type = 'warehouse'
      ) e WHERE e.id = NEW.entity_id AND e.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Thuộc tính thực thể: % % không có trong đơn vị này.', NEW.entity_type, NEW.entity_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    -- Khoá theo (đơn vị, loại thực thể): hai lần ghi song song không cùng lấy một số phiên bản.
    PERFORM pg_advisory_xact_lock(hashtextextended('entity_attributes|' || NEW.tenant_id::text || '|' || NEW.entity_type, 0));
    SELECT max(valid_from) INTO v_last FROM entity_attributes
     WHERE tenant_id = NEW.tenant_id AND entity_type = NEW.entity_type AND entity_id = NEW.entity_id;
    IF v_last IS NOT NULL AND NEW.valid_from <= v_last THEN
      RAISE EXCEPTION 'Phiên bản thuộc tính mới phải bắt đầu SAU phiên bản trước (% ≤ %): phiên bản đi theo thứ tự ngày.', NEW.valid_from, v_last USING ERRCODE = 'exclusion_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM entity_attributes a
                WHERE a.tenant_id = NEW.tenant_id AND a.entity_type = NEW.entity_type AND a.entity_id = NEW.entity_id
                  AND daterange(a.valid_from, a.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
      RAISE EXCEPTION 'Thuộc tính của % % đã có hiệu lực trong khoảng này: đóng phiên bản trước (valid_to) rồi mới thêm phiên bản mới.', NEW.entity_type, NEW.entity_id USING ERRCODE = 'exclusion_violation';
    END IF;
    -- Số phiên bản do trigger gán, liên tục 1, 2, 3… theo từng thực thể (không nhận số từ ngoài).
    NEW.version := COALESCE((SELECT max(version) FROM entity_attributes
                              WHERE tenant_id = NEW.tenant_id AND entity_type = NEW.entity_type AND entity_id = NEW.entity_id), 0) + 1;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'valid_to' - 'note') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to' - 'note') THEN
      RAISE EXCEPTION 'Thuộc tính thực thể chỉ thêm: không sửa tên, MST, địa chỉ, phiên bản, ngày bắt đầu — đổi = đóng phiên bản cũ + thêm phiên bản mới.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
      RAISE EXCEPTION 'Phiên bản % đã đóng hiệu lực, không mở lại / đổi ngày đóng.', OLD.version USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Thuộc tính thực thể chỉ thêm: không xoá, chỉ đóng hiệu lực (valid_to).' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_entity_attr_guard() IS 'Bất biến entity_attributes (0087): thực thể có thật cùng đơn vị, chỉ thêm, phiên bản liên tục theo ngày, UPDATE duy nhất là đóng valid_to, chặn chồng hiệu lực.';
CREATE TRIGGER entity_attributes_guard BEFORE INSERT OR UPDATE OR DELETE ON entity_attributes FOR EACH ROW EXECUTE FUNCTION bizcity_entity_attr_guard();

-- ── Tra theo ngày: bản thuộc tính hiệu lực tại một ngày (quy tắc 36 §0.4) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_entity_attr_at(p_tenant bigint, p_type text, p_entity bigint, p_date date) RETURNS entity_attributes
  LANGUAGE plpgsql STABLE AS $$
DECLARE
  r entity_attributes;
BEGIN
  SELECT * INTO r FROM entity_attributes a
   WHERE a.tenant_id = p_tenant AND a.entity_type = p_type AND a.entity_id = p_entity
     AND a.valid_from <= p_date AND (a.valid_to IS NULL OR p_date < a.valid_to)
   ORDER BY a.version DESC LIMIT 1;
  IF r.id IS NULL THEN
    -- ngày cũ hơn bản đầu → bản đầu; ngày sau bản cuối đã đóng (thực thể đã xoá) → bản cuối; không có bản nào → rỗng (không bịa)
    SELECT * INTO r FROM entity_attributes a
     WHERE a.tenant_id = p_tenant AND a.entity_type = p_type AND a.entity_id = p_entity
     ORDER BY CASE WHEN p_date < a.valid_from THEN 0 ELSE 1 END, CASE WHEN p_date < a.valid_from THEN a.version END ASC, a.version DESC LIMIT 1;
  END IF;
  RETURN r;
END $$;
COMMENT ON FUNCTION bizcity_entity_attr_at(bigint, text, bigint, date) IS 'Bản thuộc tính (tên, MST, địa chỉ) hiệu lực tại một ngày; không có bản hiệu lực thì bản gần nhất; không có bản nào thì id rỗng (0087).';

-- ── Đồng bộ: cột trên bảng thực thể là ảnh chụp hiện hành; mọi đường ghi đi qua trigger này ─────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_entity_attrs_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_type  text := CASE TG_TABLE_NAME WHEN 'partners' THEN 'partner' WHEN 'branches' THEN 'branch' WHEN 'warehouses' THEN 'warehouse' END;
  v_day   date := CURRENT_DATE;
  v_old   entity_attributes;
  v_from  date;
  v_nt    text;
  v_ot    text;
  v_note  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE entity_attributes SET valid_to = GREATEST(v_day, valid_from + 1)
     WHERE tenant_id = OLD.tenant_id AND entity_type = v_type AND entity_id = OLD.id AND valid_to IS NULL;
    RETURN OLD;
  END IF;
  v_nt := to_jsonb(NEW) ->> 'tax_code';   -- kho không có cột tax_code → NULL
  IF TG_OP = 'INSERT' THEN
    INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name, tax_code, address, created_by)
    VALUES (NEW.tenant_id, v_type, NEW.id, NEW.name, v_nt, NEW.address, 'system:entity-sync');
    RETURN NEW;
  END IF;
  v_ot := to_jsonb(OLD) ->> 'tax_code';
  IF (NEW.name, v_nt, NEW.address) IS DISTINCT FROM (OLD.name, v_ot, OLD.address) THEN
    SELECT * INTO v_old FROM entity_attributes a
     WHERE a.tenant_id = OLD.tenant_id AND a.entity_type = v_type AND a.entity_id = OLD.id AND a.valid_to IS NULL;
    v_from := GREATEST(v_day, COALESCE(v_old.valid_from, '1969-12-31'::date) + 1);
    IF v_old.id IS NOT NULL THEN
      UPDATE entity_attributes SET valid_to = v_from WHERE id = v_old.id;
    END IF;
    v_note := concat_ws('; ',
      CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN 'tên từ "' || OLD.name || '"' END,
      CASE WHEN v_nt IS DISTINCT FROM v_ot THEN 'MST từ "' || COALESCE(v_ot, '') || '"' END,
      CASE WHEN NEW.address IS DISTINCT FROM OLD.address THEN 'địa chỉ từ "' || COALESCE(OLD.address, '') || '"' END);
    INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name, tax_code, address, valid_from, created_by, note)
    VALUES (NEW.tenant_id, v_type, NEW.id, NEW.name, v_nt, NEW.address, v_from, 'system:entity-sync', 'đổi ' || v_note);
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_entity_attrs_sync() IS 'Giữ entity_attributes khớp cột name / tax_code / address của partners / branches / warehouses ở mọi đường ghi (0087): thêm → phiên bản 1; đổi → đóng bản cũ + thêm bản mới từ hôm nay; xoá → đóng.';
CREATE TRIGGER partners_entity_attrs_sync   AFTER INSERT OR UPDATE OF name, tax_code, address OR DELETE ON partners   FOR EACH ROW EXECUTE FUNCTION bizcity_entity_attrs_sync();
CREATE TRIGGER branches_entity_attrs_sync   AFTER INSERT OR UPDATE OF name, tax_code, address OR DELETE ON branches   FOR EACH ROW EXECUTE FUNCTION bizcity_entity_attrs_sync();
CREATE TRIGGER warehouses_entity_attrs_sync AFTER INSERT OR UPDATE OF name, address OR DELETE ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_entity_attrs_sync();

-- ── Điền ban đầu (chạy lại an toàn: chỉ thực thể chưa có phiên bản đang mở) ────────────────────────────────────────────
INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name, tax_code, address, created_by, note)
SELECT p.tenant_id, 'partner', p.id, p.name, p.tax_code, p.address, 'system:backfill-0087', 'điền từ cột name / tax_code / address lúc thêm bảng' FROM partners p
 WHERE NOT EXISTS (SELECT 1 FROM entity_attributes e WHERE e.tenant_id = p.tenant_id AND e.entity_type = 'partner' AND e.entity_id = p.id AND e.valid_to IS NULL);
INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name, tax_code, address, created_by, note)
SELECT b.tenant_id, 'branch', b.id, b.name, b.tax_code, b.address, 'system:backfill-0087', 'điền từ cột name / tax_code / address lúc thêm bảng' FROM branches b
 WHERE NOT EXISTS (SELECT 1 FROM entity_attributes e WHERE e.tenant_id = b.tenant_id AND e.entity_type = 'branch' AND e.entity_id = b.id AND e.valid_to IS NULL);
INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name, address, created_by, note)
SELECT w.tenant_id, 'warehouse', w.id, w.name, w.address, 'system:backfill-0087', 'điền từ cột name / address lúc thêm bảng' FROM warehouses w
 WHERE NOT EXISTS (SELECT 1 FROM entity_attributes e WHERE e.tenant_id = w.tenant_id AND e.entity_type = 'warehouse' AND e.entity_id = w.id AND e.valid_to IS NULL);

-- ── Cô lập đơn vị (RLS) như item_codes / entity_codes ─────────────────────────────────────────────────────────────────
ALTER TABLE entity_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_attributes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entity_attributes USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

COMMENT ON TABLE entity_attributes IS 'Thuộc tính có hiệu lực (tên, MST, địa chỉ) của đối tượng / chi nhánh / kho (0087, S029-19): NGUỒN SỰ THẬT tại một ngày; chỉ thêm, mỗi thực thể có phiên bản 1, 2, 3…; cột trên bảng thực thể là ảnh chụp hiện hành, trigger giữ khớp.';
COMMENT ON COLUMN entity_attributes.id IS 'Khoá nội bộ; partner_attr_id trên sổ cái trỏ tới đây.';
COMMENT ON COLUMN entity_attributes.tenant_id IS 'Đơn vị (cùng đơn vị với thực thể).';
COMMENT ON COLUMN entity_attributes.entity_type IS 'partner (đối tượng) · branch (chi nhánh) · warehouse (kho).';
COMMENT ON COLUMN entity_attributes.entity_id IS 'Định danh bất biến của thực thể (id của bảng tương ứng).';
COMMENT ON COLUMN entity_attributes.version IS 'Số phiên bản 1, 2, 3… theo từng thực thể; trigger gán, liên tục theo thứ tự ngày hiệu lực.';
COMMENT ON COLUMN entity_attributes.name IS 'Tên tại phiên bản này.';
COMMENT ON COLUMN entity_attributes.tax_code IS 'Mã số thuế tại phiên bản này (kho: không có).';
COMMENT ON COLUMN entity_attributes.address IS 'Địa chỉ tại phiên bản này.';
COMMENT ON COLUMN entity_attributes.valid_from IS 'Hiệu lực từ ngày (gồm). Phiên bản điền từ cột hiện có: 1970-01-01.';
COMMENT ON COLUMN entity_attributes.valid_to IS 'Hiệu lực đến ngày (không gồm); NULL = hiện hành. Đóng một lần.';
COMMENT ON COLUMN entity_attributes.created_by IS 'Người / hệ thống thêm phiên bản.';
COMMENT ON COLUMN entity_attributes.created_at IS 'Lúc thêm.';
COMMENT ON COLUMN entity_attributes.note IS 'Ghi chú (vd "đổi tên từ …").';

-- ── Tên đối tượng lúc ghi trên sổ cái (theo NGÀY CHỨNG TỪ) ───────────────────────────────────────────────────────────
ALTER TABLE ledger_entries ADD COLUMN partner_name text, ADD COLUMN partner_attr_id bigint REFERENCES entity_attributes (id);
ALTER TABLE ledger_lines   ADD COLUMN partner_name text, ADD COLUMN partner_attr_id bigint REFERENCES entity_attributes (id);
COMMENT ON COLUMN ledger_entries.partner_name IS 'Tên đối tượng tại NGÀY CHỨNG TỪ lúc ghi (0087); không đổi về sau; bút toán đảo mang tên của bút toán gốc. NULL: bút toán ghi trước 0087 hoặc không gắn đối tượng.';
COMMENT ON COLUMN ledger_entries.partner_attr_id IS 'Bản thuộc tính (entity_attributes) đã dùng cho partner_name: đọc ra phiên bản và ngày hiệu lực của tên (0087).';
COMMENT ON COLUMN ledger_lines.partner_name IS 'Tên đối tượng tại NGÀY CHỨNG TỪ lúc ghi dòng sổ (0087); không đổi về sau. NULL: dòng ghi trước 0087 hoặc không gắn đối tượng.';
COMMENT ON COLUMN ledger_lines.partner_attr_id IS 'Bản thuộc tính (entity_attributes) đã dùng cho partner_name của dòng (0087).';

CREATE OR REPLACE FUNCTION bizcity_set_entry_partner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a entity_attributes;
  o record;
BEGIN
  IF NEW.partner_id IS NULL OR NEW.partner_name IS NOT NULL OR NEW.partner_attr_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.reverses_entry_id IS NOT NULL THEN       -- bút toán đảo mang tên của bút toán gốc
    SELECT e.partner_name, e.partner_attr_id INTO o FROM ledger_entries e WHERE e.id = NEW.reverses_entry_id AND e.tenant_id = NEW.tenant_id;
    IF o.partner_name IS NOT NULL OR o.partner_attr_id IS NOT NULL THEN
      NEW.partner_name := o.partner_name;
      NEW.partner_attr_id := o.partner_attr_id;
      RETURN NEW;
    END IF;
  END IF;
  a := bizcity_entity_attr_at(NEW.tenant_id, 'partner', NEW.partner_id, NEW.doc_date);
  IF a.id IS NOT NULL THEN
    NEW.partner_name := a.name;
    NEW.partner_attr_id := a.id;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_set_entry_partner() IS 'Điền tên đối tượng lúc ghi cho bút toán mới theo ngày chứng từ (0087, 36 §0); bút toán đảo lấy của bút toán gốc.';
CREATE TRIGGER ledger_entries_partner_name BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION bizcity_set_entry_partner();

CREATE OR REPLACE FUNCTION bizcity_set_line_partner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a entity_attributes;
  h record;
BEGIN
  IF NEW.partner_id IS NULL OR NEW.partner_name IS NOT NULL OR NEW.partner_attr_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.partner_id, e.partner_name, e.partner_attr_id, e.doc_date INTO h FROM ledger_entries e WHERE e.id = NEW.entry_id AND e.tenant_id = NEW.tenant_id;
  IF h.partner_id IS NOT DISTINCT FROM NEW.partner_id AND (h.partner_name IS NOT NULL OR h.partner_attr_id IS NOT NULL) THEN
    NEW.partner_name := h.partner_name;       -- cùng đối tượng với đầu bút toán: cùng bản (kể cả bút toán đảo)
    NEW.partner_attr_id := h.partner_attr_id;
    RETURN NEW;
  END IF;
  a := bizcity_entity_attr_at(NEW.tenant_id, 'partner', NEW.partner_id, COALESCE(h.doc_date, NEW.posting_date));
  IF a.id IS NOT NULL THEN
    NEW.partner_name := a.name;
    NEW.partner_attr_id := a.id;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_set_line_partner() IS 'Điền tên đối tượng lúc ghi cho dòng sổ mới: cùng đối tượng với đầu bút toán thì cùng bản, khác thì tra theo ngày chứng từ (0087).';
CREATE TRIGGER ledger_lines_partner_name BEFORE INSERT ON ledger_lines FOR EACH ROW EXECUTE FUNCTION bizcity_set_line_partner();
