-- [2026-11-11 Nguyễn Văn Thủy] 0104 Mục thu / chi: chiều phân tích dòng tiền trên dòng phiếu thu / chi (đóng góp)
-- Loại danh mục mới `cash_item` trong dimensions (cây hai gốc THU = Mục thu, CHI = Mục chi), cờ theo dõi trên tài khoản,
-- danh mục mặc định cho mọi đơn vị. Dòng sổ ghi mã ở ledger_lines.dims.cashItem; báo cáo Dòng tiền gom theo mục.

ALTER TABLE public.dimensions DROP CONSTRAINT IF EXISTS dimensions_kind_check;
ALTER TABLE public.dimensions ADD CONSTRAINT dimensions_kind_check CHECK (kind = ANY (ARRAY[
  'cost_item', 'department', 'contract', 'employee', 'case', 'project', 'capital_source', 'tool_group', 'usage_purpose', 'cash_item'
]::text[]));

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS track_cash_item boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.accounts.track_cash_item IS 'Theo dõi theo mục thu / chi (bắt buộc chọn mục trên dòng khi đơn vị đã khai danh mục).';
COMMENT ON COLUMN bizcity_read.dimensions.kind IS 'Loại chiều: contract, project, department, cost_item, employee, case, capital_source, cash_item (mục thu / chi)…';

-- Danh mục mặc định: hai gốc + các mục thường dùng của đơn vị bán lẻ nhiều cửa hàng. Đã có mã thì giữ nguyên.
INSERT INTO public.dimensions (tenant_id, kind, code, name, parent_code, note)
SELECT t.id, 'cash_item', v.code, v.name, v.parent, v.note
  FROM tenants t
 CROSS JOIN (VALUES
   ('THU', 'Mục thu', NULL, 'Gốc các mục thu'),
   ('100', 'Thu từ bán hàng thu tiền ngay', 'THU', ''),
   ('101', 'Thu nợ khách hàng', 'THU', ''),
   ('102', 'Thu hoàn ứng nhân viên', 'THU', ''),
   ('103', 'Thu tiền vay', 'THU', ''),
   ('104', 'Thu lãi tiền gửi, đầu tư', 'THU', ''),
   ('105', 'Thu hồi các khoản cho vay', 'THU', ''),
   ('106', 'Thu ký quỹ, ký cược', 'THU', ''),
   ('180', 'Nhận tiền chuyển nội bộ', 'THU', 'Rút tiền gửi về quỹ, nhận tiền từ chi nhánh khác'),
   ('199', 'Thu khác', 'THU', ''),
   ('CHI', 'Mục chi', NULL, 'Gốc các mục chi'),
   ('200', 'Chi mua hàng thanh toán ngay', 'CHI', ''),
   ('201', 'Chi trả nợ nhà cung cấp', 'CHI', ''),
   ('202', 'Chi lương, thưởng', 'CHI', ''),
   ('203', 'Chi thuê mặt bằng', 'CHI', ''),
   ('204', 'Chi điện, nước, internet', 'CHI', ''),
   ('205', 'Chi vận chuyển', 'CHI', ''),
   ('206', 'Chi tạm ứng nhân viên', 'CHI', ''),
   ('207', 'Chi nộp thuế, phí, lệ phí', 'CHI', ''),
   ('208', 'Chi trả nợ vay, lãi vay', 'CHI', ''),
   ('209', 'Chi cho vay', 'CHI', ''),
   ('280', 'Chuyển tiền nội bộ', 'CHI', 'Nộp tiền vào ngân hàng, chuyển tiền cho chi nhánh khác'),
   ('299', 'Chi khác', 'CHI', '')
 ) AS v(code, name, parent, note)
ON CONFLICT (tenant_id, kind, code) DO NOTHING;
