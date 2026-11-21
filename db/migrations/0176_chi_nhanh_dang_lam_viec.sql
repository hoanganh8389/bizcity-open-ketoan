-- [2026-11-21 Nguyễn Văn Thủy] CHI NHÁNH ĐANG LÀM VIỆC trên mọi chứng từ (sổ chứng từ chung business_documents) (đóng góp)
--
-- Mỗi chứng từ có thêm "nơi lập": chi nhánh người lập đang làm việc (nút chọn chi nhánh ở thanh trên cùng) — chỉ là đơn vị đại diện,
-- không cần phân kho. Có thể khác chi nhánh của chứng từ (vd công ty lập đơn đặt hộ chi nhánh / giao nhiều chi nhánh).
--   work_branch_code = meta.workBranchCode (chứng từ gửi lên), không có thì = chi nhánh của chứng từ (branch_code).
--   work_branch_uid  = item_id cn_… của đơn vị đó (định danh bất biến, như branch_uid).
-- Phiếu mua hàng: workBranchCode / departmentCode / warehouseCode nằm trong purchase_documents.data → trigger chép sang meta
-- của sổ chứng từ (để bộ phận, phân kho của sổ chung đúng phiếu, không rơi về mặc định).

ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS work_branch_code text, ADD COLUMN IF NOT EXISTS work_branch_uid text;
COMMENT ON COLUMN business_documents.work_branch_code IS 'Chi nhánh đang làm việc của người lập (nơi lập) — trống thì bằng chi nhánh của chứng từ (0176).';
COMMENT ON COLUMN business_documents.work_branch_uid IS 'Định danh cn_… của chi nhánh đang làm việc (0176).';
CREATE INDEX IF NOT EXISTS business_documents_work_branch_idx ON business_documents (tenant_id, work_branch_uid);

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
  NEW.work_branch_code := COALESCE(NULLIF(NEW.meta->>'workBranchCode', ''), NEW.branch_code);
  NEW.work_branch_uid := CASE WHEN NEW.work_branch_code = NEW.branch_code THEN NEW.branch_uid
    ELSE (SELECT b.uid FROM branches b WHERE b.tenant_id = NEW.tenant_id AND b.code = NEW.work_branch_code) END;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_business_documents_unit_ids() IS 'Đơn vị / phân kho / bộ phận / chi nhánh đang làm việc (item_id) của sổ chứng từ chung (0173, 0176).';

-- Chứng từ đã có: nơi lập = chi nhánh của chứng từ (chưa ghi nhận người lập đang ở đâu).
UPDATE business_documents SET work_branch_code = branch_code, work_branch_uid = branch_uid WHERE work_branch_code IS NULL;
