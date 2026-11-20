-- [2026-11-19 11:27 AM khanhtd] NT-DM-011 — D029-19-5: đổi tên / MST / địa chỉ có thể chọn ngày hiệu lực đã qua (biến phiên ketoan.valid_from)
-- =============================================================================
-- 0168 Ngày hiệu lực khi đổi thuộc tính đối tượng (NT-DM-011, PHASE-029 · 36 D029-19-5).
--
-- 0087 ghi phiên bản thuộc tính mới (tên / MST / địa chỉ) LUÔN từ hôm nay. Đối tác hay báo đổi MST trễ khoảng một tháng, nên kế toán
-- cần ghi "MST mới có hiệu lực từ ngày X" (X đã qua). Migration này chỉ thay bizcity_entity_attrs_sync(): ngày bắt đầu của bản mới
-- lấy từ biến phiên ketoan.valid_from (YYYY-MM-DD — cùng biến 0121 dùng cho MST chi nhánh / kho) khi màn hình gửi lên.
--   - Không đặt biến (đồng bộ, nhập Excel, đường cũ) → y như 0087: từ hôm nay (hoặc sau bản đang mở ít nhất một ngày).
--   - Có đặt: ngày ≤ hôm nay và SAU ngày bắt đầu của bản đang mở (0087 chỉ thêm, phiên bản theo thứ tự ngày) — sai thì báo lỗi tiếng Việt.
--   - Bất biến 0087 giữ nguyên (entity_attributes_guard không đổi). Dòng sổ đã ghi giữ partner_attr_id lúc ghi — không đổi.
--   - Chỉ áp cho partners: chi nhánh / kho đã có phiên bản MST riêng (0121) và chưa có màn chọn ngày cho tên / địa chỉ.
-- Đường lui: chạy lại thân hàm bizcity_entity_attrs_sync() của 0087.
-- =============================================================================

CREATE OR REPLACE FUNCTION bizcity_entity_attrs_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_type  text := CASE TG_TABLE_NAME WHEN 'partners' THEN 'partner' WHEN 'branches' THEN 'branch' WHEN 'warehouses' THEN 'warehouse' END;
  v_day   date := CURRENT_DATE;
  v_old   entity_attributes;
  v_from  date;
  v_req   date;
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
    -- Ngày người dùng chọn (chỉ đối tượng); không chọn thì như 0087.
    v_req := CASE WHEN v_type = 'partner' THEN nullif(current_setting('ketoan.valid_from', true), '')::date END;
    IF v_req IS NOT NULL THEN
      IF v_req > v_day THEN
        RAISE EXCEPTION 'Ngày hiệu lực (%) không được sau hôm nay (%).', to_char(v_req, 'DD/MM/YYYY'), to_char(v_day, 'DD/MM/YYYY')
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_old.id IS NOT NULL AND v_req <= v_old.valid_from THEN
        RAISE EXCEPTION 'Ngày hiệu lực (%) phải sau ngày bắt đầu của phiên bản đang dùng (%): phiên bản ghi theo thứ tự ngày, nhập thay đổi cũ hơn trước.',
          to_char(v_req, 'DD/MM/YYYY'), to_char(v_old.valid_from, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
      END IF;
      v_from := v_req;
    ELSE
      v_from := GREATEST(v_day, COALESCE(v_old.valid_from, '1969-12-31'::date) + 1);
    END IF;
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
COMMENT ON FUNCTION bizcity_entity_attrs_sync() IS 'Giữ entity_attributes khớp cột name / tax_code / address của partners / branches / warehouses ở mọi đường ghi (0087): thêm → phiên bản 1; đổi → đóng bản cũ + thêm bản mới từ hôm nay, hoặc với đối tượng từ ngày ở biến phiên ketoan.valid_from (≤ hôm nay, sau bản đang mở — 0168, NT-DM-011); xoá → đóng.';
