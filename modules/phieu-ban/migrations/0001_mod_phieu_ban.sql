-- Phiếu bán nhập tay (module phieu-ban, phiếu NT-BH-015, chữ chốt docs/nghiep-vu/21): phiếu bán / trả hàng do kế toán lập ở BH10 / BH11.
-- Chạy bằng vai trò mod_phieu_ban_owner trong schema mod_phieu_ban: không tạo / sửa được bảng của Core. Mọi bảng: tenant_id, RLS, COMMENT.
-- [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: bảng phiếu + bộ đếm số theo cửa hàng (đóng góp)

CREATE TABLE docs (
  doc_id          uuid        NOT NULL PRIMARY KEY,
  tenant_id       bigint      NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('sale', 'sale_return')),
  branch_code     text        NOT NULL,
  warehouse_code  text,
  doc_no          text        NOT NULL,
  doc_date        date        NOT NULL,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  partner_code    text,
  original_doc_id uuid,
  body            jsonb       NOT NULL,
  total           numeric(18,2) NOT NULL DEFAULT 0,
  ledger_version  integer     NOT NULL DEFAULT 0,
  ledger_status   text,
  created_by      text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  approved_by     text,
  approved_at     timestamptz,
  CONSTRAINT docs_no_unique UNIQUE (tenant_id, branch_code, kind, doc_no)
);
CREATE INDEX docs_list ON docs (tenant_id, kind, doc_date DESC);
CREATE INDEX docs_original ON docs (tenant_id, original_doc_id) WHERE original_doc_id IS NOT NULL;
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON docs USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE docs IS 'Phiếu bán / trả hàng nhập tay (BH10 / BH11): nháp → duyệt (nộp sổ qua ctx.ledger.submit, docKey phieu-ban:<doc_id>) → bỏ duyệt (ctx.ledger.cancel).';
COMMENT ON COLUMN docs.doc_id IS 'Định danh phiếu (uuid); docKey trong sổ = phieu-ban:<doc_id>.';
COMMENT ON COLUMN docs.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN docs.kind IS 'Loại: sale (phiếu bán) / sale_return (hàng bán trả lại).';
COMMENT ON COLUMN docs.branch_code IS 'Cửa hàng (bizcity_read.branches.code).';
COMMENT ON COLUMN docs.warehouse_code IS 'Kho xuất (bán) / kho nhận (trả); trống = kho mặc định của chi nhánh.';
COMMENT ON COLUMN docs.doc_no IS 'Số phiếu: BH / TL + yyMM + 6 số theo cửa hàng × loại × tháng, hoặc người lập gõ; không trùng trong cửa hàng + loại.';
COMMENT ON COLUMN docs.doc_date IS 'Ngày chứng từ.';
COMMENT ON COLUMN docs.status IS 'draft (nháp, sửa / xoá được) / approved (đã duyệt, đã nộp sổ).';
COMMENT ON COLUMN docs.partner_code IS 'Mã khách (bizcity_read.partners.code); trống = khách lẻ.';
COMMENT ON COLUMN docs.original_doc_id IS 'Phiếu trả: phiếu bán gốc của module (để kiểm số còn trả được); trống = trả không nối phiếu của module.';
COMMENT ON COLUMN docs.body IS 'Nội dung phiếu theo khuôn TradeDoc (docs/api/13-phieu-nhap-tay.md): dòng hàng, thu tiền, hoá đơn, hạn thanh toán, ghi chú — đã tính lại ở máy chủ.';
COMMENT ON COLUMN docs.total IS 'Tổng thanh toán (sau thuế) — để lọc / cộng ở danh sách.';
COMMENT ON COLUMN docs.ledger_version IS 'Phiên bản chứng từ đã nộp sổ lần cuối (tăng mỗi lần duyệt lại); 0 = chưa từng nộp.';
COMMENT ON COLUMN docs.ledger_status IS 'Trạng thái chứng từ trong sổ lúc nộp / huỷ gần nhất (posted, pending, error, cancelled).';
COMMENT ON COLUMN docs.created_by IS 'Người lập (actor id).';
COMMENT ON COLUMN docs.created_at IS 'Lúc lập.';
COMMENT ON COLUMN docs.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN docs.updated_at IS 'Lúc sửa gần nhất.';
COMMENT ON COLUMN docs.approved_by IS 'Người duyệt lần gần nhất (trống khi đang nháp).';
COMMENT ON COLUMN docs.approved_at IS 'Lúc duyệt lần gần nhất.';

CREATE TABLE code_counters (
  tenant_id   bigint      NOT NULL,
  branch_code text        NOT NULL,
  kind        text        NOT NULL,
  period      text        NOT NULL,
  last_no     integer     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_code, kind, period)
);
ALTER TABLE code_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON code_counters USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE code_counters IS 'Bộ đếm số phiếu theo cửa hàng × loại × tháng (ctx.documents.nextNumber chỉ đếm theo đơn vị × năm — không đủ cho số theo cửa hàng), tăng một chiều.';
COMMENT ON COLUMN code_counters.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN code_counters.branch_code IS 'Cửa hàng.';
COMMENT ON COLUMN code_counters.kind IS 'sale / sale_return.';
COMMENT ON COLUMN code_counters.period IS 'Tháng yyMM.';
COMMENT ON COLUMN code_counters.last_no IS 'Số đã cấp gần nhất.';
COMMENT ON COLUMN code_counters.updated_at IS 'Lúc cấp gần nhất.';
