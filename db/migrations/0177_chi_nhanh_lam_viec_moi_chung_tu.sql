-- [2026-11-21 Nguyễn Văn Thủy] Chi nhánh đang làm việc tự ghi cho MỌI chứng từ (không cần từng form gửi lên) (đóng góp)
--
-- Máy chủ đặt bizcity.chi_nhanh_lam_viec trên kết nối CSDL của mỗi yêu cầu (header x-chi-nhanh = nút chi nhánh trên cùng,
-- db/client.ts). Sổ chứng từ chung lấy chi nhánh đang làm việc theo thứ tự:
--   1. meta.workBranchCode (chứng từ tự gửi, vd phiếu mua hàng)
--   2. giá trị đã ghi lần trước (sửa chứng từ không đổi nơi lập)
--   3. chi nhánh đang làm việc của yêu cầu đang ghi (chứng từ mới của mọi phân hệ)
--   4. chi nhánh của chứng từ.

CREATE OR REPLACE FUNCTION bizcity_business_documents_unit_ids() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; v_data jsonb;
BEGIN
  -- Phiếu mua: lấy nơi lập / bộ phận / phân kho từ data của phiếu gốc.
  IF NEW.module = 'mua-hang' AND NEW.doc_ref LIKE 'mua-hang.document:%' THEN
    SELECT p.data INTO v_data FROM purchase_documents p
     WHERE p.tenant_id = NEW.tenant_id AND p.id = NULLIF(substring(NEW.doc_ref FROM 'mua-hang\.document:([0-9]+)$'), '')::bigint;
    IF v_data IS NOT NULL THEN
      NEW.meta := NEW.meta || jsonb_strip_nulls(jsonb_build_object(
        'workBranchCode', NULLIF(v_data->>'workBranchCode', ''), 'departmentCode', NULLIF(v_data->>'departmentCode', ''),
        'warehouseCode', NULLIF(COALESCE(v_data->>'warehouseCode', v_data->>'deliveryWarehouse'), '')));
    END IF;
  END IF;
  SELECT * INTO r FROM bizcity_unit_ids(NEW.tenant_id, NULL, NEW.branch_code, NEW.meta->>'departmentCode', COALESCE(NEW.meta->>'warehouseCode', NEW.meta->>'fromWarehouse'));
  NEW.branch_uid := r.branch_uid; NEW.warehouse_uid := r.warehouse_uid; NEW.department_uid := r.department_uid;
  NEW.work_branch_code := COALESCE(
    NULLIF(NEW.meta->>'workBranchCode', ''),
    CASE WHEN TG_OP = 'UPDATE' THEN NULLIF(OLD.work_branch_code, '') END,
    (SELECT b.code FROM branches b WHERE b.tenant_id = NEW.tenant_id AND b.code = NULLIF(current_setting('bizcity.chi_nhanh_lam_viec', true), '')),
    NEW.branch_code);
  NEW.work_branch_uid := CASE WHEN NEW.work_branch_code = NEW.branch_code THEN NEW.branch_uid
    ELSE (SELECT b.uid FROM branches b WHERE b.tenant_id = NEW.tenant_id AND b.code = NEW.work_branch_code) END;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_business_documents_unit_ids() IS 'Đơn vị / phân kho / bộ phận / chi nhánh đang làm việc (item_id) của sổ chứng từ chung; nơi lập lấy từ chứng từ, lần ghi trước, hoặc chi nhánh đang làm việc của yêu cầu (0173, 0176, 0177).';
