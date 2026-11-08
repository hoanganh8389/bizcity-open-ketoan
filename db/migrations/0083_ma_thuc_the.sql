-- [2026-11-08 01:49 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-4 (D026-3, MD-001): entity_codes — mã có phiên bản cho đối tượng / chi nhánh / kho — chữ chốt docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/20-KIEN-TRUC.md §2
-- =============================================================================
-- 0083 Mã có phiên bản cho đối tượng (partners), chi nhánh (branches), kho (warehouses).
--   Cùng khuôn item_codes (0065): bảng chỉ thêm; UPDATE duy nhất = đóng valid_to (và sửa ghi chú); chặn chồng hiệu lực cùng
--   (đơn vị, loại thực thể, loại mã, mã). `id` của bảng thực thể là định danh bất biến; cột `code` hiện có thành ẢNH CHỤP mã hiện hành
--   (giữ cho tương thích), trigger giữ entity_codes khớp MỌI đường ghi (form, Excel, API, module…) — không cửa phụ.
--   Đổi mã = đóng mã cũ + thêm mã mới; thực thể bị xoá = đóng mã (lịch sử mã giữ lại, tra mã cũ vẫn ra thực thể cũ).
--   Đợt này ba loại partner / branch / warehouse; đơn vị tính và lý do để đợt sau.
--   KHÔNG cấm xoá thực thể (form xoá chi nhánh / đối tượng / kho đang dùng): chỉ đóng mã. Cấm đổi id / tenant_id (guard riêng).
--   Điền ban đầu từ cột code của dòng đang có; chạy lại an toàn (chỉ điền thực thể chưa có mã đang mở).
-- =============================================================================

CREATE TABLE entity_codes (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   bigint      NOT NULL,
  entity_type text        NOT NULL CHECK (entity_type IN ('partner', 'branch', 'warehouse')),
  entity_id   bigint      NOT NULL,
  kind        text        NOT NULL DEFAULT 'code' CHECK (kind ~ '^(code|alias|external:[a-z0-9_.-]{1,32})$'),
  code        text        NOT NULL CHECK (length(code) BETWEEN 1 AND 160),
  valid_from  date        NOT NULL DEFAULT '1970-01-01',
  valid_to    date        CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by  text        NOT NULL DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now(),
  note        text        NOT NULL DEFAULT '',
  UNIQUE (tenant_id, entity_type, kind, code, valid_from)
);
CREATE INDEX entity_codes_lookup ON entity_codes (tenant_id, entity_type, kind, code);
CREATE INDEX entity_codes_entity ON entity_codes (tenant_id, entity_type, entity_id);

-- ── Bất biến ở CSDL ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_entity_truncate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không TRUNCATE bảng mã thực thể (entity_codes): mã là lịch sử, chỉ thêm.' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_entity_truncate_guard() IS 'Chặn TRUNCATE entity_codes (0083, D026-3).';
CREATE TRIGGER entity_codes_no_truncate BEFORE TRUNCATE ON entity_codes FOR EACH STATEMENT EXECUTE FUNCTION bizcity_entity_truncate_guard();

CREATE OR REPLACE FUNCTION bizcity_entity_codes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Thực thể phải có thật và cùng đơn vị (bảng thực thể là bảng riêng nên không có khoá ngoại chung).
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT id, tenant_id FROM partners   WHERE NEW.entity_type = 'partner'
        UNION ALL SELECT id, tenant_id FROM branches   WHERE NEW.entity_type = 'branch'
        UNION ALL SELECT id, tenant_id FROM warehouses WHERE NEW.entity_type = 'warehouse'
      ) e WHERE e.id = NEW.entity_id AND e.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Mã thực thể: % % không có trong đơn vị này.', NEW.entity_type, NEW.entity_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    -- Khoá theo (đơn vị, loại thực thể, loại mã) như item_codes (B2b): nạp hàng loạt trong một giao dịch không làm cạn bảng khoá.
    PERFORM pg_advisory_xact_lock(hashtextextended('entity_codes|' || NEW.tenant_id::text || '|' || NEW.entity_type || '|' || NEW.kind, 0));
    IF EXISTS (SELECT 1 FROM entity_codes c
                WHERE c.tenant_id = NEW.tenant_id AND c.entity_type = NEW.entity_type AND c.kind = NEW.kind AND c.code = NEW.code
                  AND daterange(c.valid_from, c.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
      RAISE EXCEPTION 'Mã % (% / %) đã có hiệu lực trong khoảng này: một mã tại một ngày chỉ trỏ một thực thể.', NEW.code, NEW.entity_type, NEW.kind USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Chỉ thêm: UPDATE duy nhất được phép là ĐÓNG hiệu lực (valid_to từ NULL thành ngày) và sửa ghi chú.
    IF (to_jsonb(NEW) - 'valid_to' - 'note') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to' - 'note') THEN
      RAISE EXCEPTION 'Mã thực thể chỉ thêm: không sửa mã, loại mã, thực thể, ngày bắt đầu — đổi mã = đóng mã cũ + thêm mã mới.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
      RAISE EXCEPTION 'Mã % đã đóng hiệu lực, không mở lại / đổi ngày đóng.', OLD.code USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Mã thực thể chỉ thêm: không xoá, chỉ đóng hiệu lực (valid_to).' USING ERRCODE = 'integrity_constraint_violation';
END $$;
COMMENT ON FUNCTION bizcity_entity_codes_guard() IS 'Bất biến entity_codes (0083): thực thể phải có thật cùng đơn vị, chỉ thêm, UPDATE duy nhất là đóng valid_to, chặn chồng hiệu lực cùng (đơn vị, loại thực thể, loại mã, mã).';
CREATE TRIGGER entity_codes_guard BEFORE INSERT OR UPDATE OR DELETE ON entity_codes FOR EACH ROW EXECUTE FUNCTION bizcity_entity_codes_guard();

-- Định danh của thực thể không đổi (id là khoá bất biến; cột code mới là thứ đổi được).
CREATE OR REPLACE FUNCTION bizcity_entity_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Định danh của % không đổi (id, đơn vị): đổi mã bằng cột code, mã cũ được giữ trong entity_codes.', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_entity_identity_guard() IS 'Không đổi id / tenant_id của đối tượng, chi nhánh, kho (0083, D026-3).';
CREATE TRIGGER partners_identity_guard   BEFORE UPDATE OF id, tenant_id ON partners   FOR EACH ROW EXECUTE FUNCTION bizcity_entity_identity_guard();
CREATE TRIGGER branches_identity_guard   BEFORE UPDATE OF id, tenant_id ON branches   FOR EACH ROW EXECUTE FUNCTION bizcity_entity_identity_guard();
CREATE TRIGGER warehouses_identity_guard BEFORE UPDATE OF id, tenant_id ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_entity_identity_guard();

-- ── Đồng bộ: cột code là ảnh chụp mã hiện hành; mọi đường ghi đều đi qua trigger này ────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_entity_codes_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_type     text := CASE TG_TABLE_NAME WHEN 'partners' THEN 'partner' WHEN 'branches' THEN 'branch' WHEN 'warehouses' THEN 'warehouse' END;
  v_day      date := CURRENT_DATE;
  v_old_from date;
  v_from     date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- mã từng thuộc thực thể đã xoá: bắt đầu sau ngày mã đó đóng (không chồng hiệu lực)
    v_from := GREATEST('1970-01-01'::date, COALESCE((SELECT max(valid_to) FROM entity_codes
                WHERE tenant_id = NEW.tenant_id AND entity_type = v_type AND kind = 'code' AND code = NEW.code), '1970-01-01'::date));
    INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, valid_from, created_by)
    VALUES (NEW.tenant_id, v_type, NEW.id, 'code', NEW.code, v_from, 'system:entity-sync');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE entity_codes SET valid_to = GREATEST(v_day, valid_from + 1)
     WHERE tenant_id = OLD.tenant_id AND entity_type = v_type AND entity_id = OLD.id AND valid_to IS NULL;
    RETURN OLD;
  END IF;

  IF NEW.code IS DISTINCT FROM OLD.code THEN       -- đổi mã = đóng mã cũ + thêm mã mới, id giữ nguyên
    SELECT c.valid_from INTO v_old_from FROM entity_codes c
     WHERE c.tenant_id = OLD.tenant_id AND c.entity_type = v_type AND c.entity_id = OLD.id AND c.kind = 'code' AND c.valid_to IS NULL;
    v_from := GREATEST(v_day, COALESCE(v_old_from, '1970-01-01'::date) + 1);
    v_from := GREATEST(v_from, COALESCE((SELECT max(valid_to) FROM entity_codes
                WHERE tenant_id = NEW.tenant_id AND entity_type = v_type AND kind = 'code' AND code = NEW.code), v_from));
    UPDATE entity_codes SET valid_to = v_from
     WHERE tenant_id = NEW.tenant_id AND entity_type = v_type AND entity_id = NEW.id AND kind = 'code' AND valid_to IS NULL;
    INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, valid_from, created_by, note)
    VALUES (NEW.tenant_id, v_type, NEW.id, 'code', NEW.code, v_from, 'system:entity-sync', 'đổi mã từ ' || OLD.code);
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_entity_codes_sync() IS 'Giữ entity_codes khớp cột code của partners / branches / warehouses ở mọi đường ghi (0083): thêm → mã đầu; đổi code → đóng cũ + thêm mới; xoá → đóng mã.';
CREATE TRIGGER partners_entity_codes_sync   AFTER INSERT OR UPDATE OF code OR DELETE ON partners   FOR EACH ROW EXECUTE FUNCTION bizcity_entity_codes_sync();
CREATE TRIGGER branches_entity_codes_sync   AFTER INSERT OR UPDATE OF code OR DELETE ON branches   FOR EACH ROW EXECUTE FUNCTION bizcity_entity_codes_sync();
CREATE TRIGGER warehouses_entity_codes_sync AFTER INSERT OR UPDATE OF code OR DELETE ON warehouses FOR EACH ROW EXECUTE FUNCTION bizcity_entity_codes_sync();

-- ── Điền ban đầu (chạy lại an toàn: chỉ thực thể chưa có mã đang mở) ───────────────────────────────────────────────
INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, created_by, note)
SELECT p.tenant_id, 'partner', p.id, 'code', p.code, 'system:backfill-0083', 'điền từ cột code lúc thêm bảng' FROM partners p
 WHERE NOT EXISTS (SELECT 1 FROM entity_codes e WHERE e.tenant_id = p.tenant_id AND e.entity_type = 'partner' AND e.entity_id = p.id AND e.kind = 'code' AND e.valid_to IS NULL);
INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, created_by, note)
SELECT b.tenant_id, 'branch', b.id, 'code', b.code, 'system:backfill-0083', 'điền từ cột code lúc thêm bảng' FROM branches b
 WHERE NOT EXISTS (SELECT 1 FROM entity_codes e WHERE e.tenant_id = b.tenant_id AND e.entity_type = 'branch' AND e.entity_id = b.id AND e.kind = 'code' AND e.valid_to IS NULL);
INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, created_by, note)
SELECT w.tenant_id, 'warehouse', w.id, 'code', w.code, 'system:backfill-0083', 'điền từ cột code lúc thêm bảng' FROM warehouses w
 WHERE NOT EXISTS (SELECT 1 FROM entity_codes e WHERE e.tenant_id = w.tenant_id AND e.entity_type = 'warehouse' AND e.entity_id = w.id AND e.kind = 'code' AND e.valid_to IS NULL);

-- ── Cô lập đơn vị (RLS) như item_codes ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE entity_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entity_codes USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

COMMENT ON TABLE entity_codes IS 'Mã có phiên bản của đối tượng / chi nhánh / kho (0083, D026-3): một mã tại một ngày trỏ một thực thể; chỉ thêm, đổi mã = đóng cũ + thêm mới. Cột code của bảng thực thể là ảnh chụp mã hiện hành, trigger giữ khớp.';
COMMENT ON COLUMN entity_codes.id IS 'Khoá nội bộ.';
COMMENT ON COLUMN entity_codes.tenant_id IS 'Đơn vị (cùng đơn vị với thực thể).';
COMMENT ON COLUMN entity_codes.entity_type IS 'partner (đối tượng) · branch (chi nhánh) · warehouse (kho).';
COMMENT ON COLUMN entity_codes.entity_id IS 'Định danh bất biến của thực thể (id của bảng tương ứng).';
COMMENT ON COLUMN entity_codes.kind IS 'code (mã chính) · alias (bí danh) · external:<nguồn> (mã của hệ thống ngoài).';
COMMENT ON COLUMN entity_codes.code IS 'Mã.';
COMMENT ON COLUMN entity_codes.valid_from IS 'Hiệu lực từ ngày (gồm). Dữ liệu điền từ cột code: 1970-01-01.';
COMMENT ON COLUMN entity_codes.valid_to IS 'Hiệu lực đến ngày (không gồm); NULL = còn hiệu lực. Đóng một lần.';
COMMENT ON COLUMN entity_codes.created_by IS 'Người / hệ thống thêm mã.';
COMMENT ON COLUMN entity_codes.created_at IS 'Lúc thêm.';
COMMENT ON COLUMN entity_codes.note IS 'Ghi chú (vd "đổi mã từ KH01").';
