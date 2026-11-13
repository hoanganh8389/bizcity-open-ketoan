-- [2026-11-11 Nguyễn Văn Thủy] 0106 Lập báo cáo tài chính: lưu bộ BCTC đã lập theo kỳ (đóng góp)
-- Một dòng = một bộ báo cáo tài chính đã lập (B01, B02, B03) của một kỳ: số liệu từng chỉ tiêu (kế toán sửa tay được),
-- người lập, người đại diện theo pháp luật, ngày lập, đã kiểm toán / ý kiến kiểm toán.

CREATE TABLE IF NOT EXISTS public.financial_statements (
  id bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  period_kind text NOT NULL DEFAULT 'year',
  period_label text NOT NULL,
  year integer NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  going_concern boolean NOT NULL DEFAULT true,
  reports text[] NOT NULL DEFAULT ARRAY['B01-DN']::text[],
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  audited boolean NOT NULL DEFAULT false,
  audit_opinion text NOT NULL DEFAULT '',
  preparer text NOT NULL DEFAULT '',
  legal_rep text NOT NULL DEFAULT '',
  prepared_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_statements_range_check CHECK (date_from <= date_to)
);
CREATE INDEX IF NOT EXISTS financial_statements_tenant_idx ON public.financial_statements (tenant_id, date_to DESC);
COMMENT ON TABLE public.financial_statements IS 'Báo cáo tài chính đã lập theo kỳ: data = { "B01-DN": { "<mã số>": [số kỳ này, số kỳ trước] }, … } (kể cả số kế toán sửa tay), người lập, người đại diện, ngày lập.';

ALTER TABLE public.financial_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_statements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.financial_statements;
CREATE POLICY tenant_isolation ON public.financial_statements USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

COMMENT ON COLUMN public.financial_statements.id IS 'Định danh bộ báo cáo.';
COMMENT ON COLUMN public.financial_statements.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN public.financial_statements.period_kind IS 'Loại kỳ: year, half1, half2, quarter1..quarter4, month, custom.';
COMMENT ON COLUMN public.financial_statements.period_label IS 'Kỳ báo cáo in trên danh sách (Năm 2026, Quý I/2026…).';
COMMENT ON COLUMN public.financial_statements.year IS 'Năm báo cáo.';
COMMENT ON COLUMN public.financial_statements.date_from IS 'Từ ngày.';
COMMENT ON COLUMN public.financial_statements.date_to IS 'Đến ngày (ngày lập số dư cuối kỳ).';
COMMENT ON COLUMN public.financial_statements.going_concern IS 'Doanh nghiệp đáp ứng giả định hoạt động liên tục.';
COMMENT ON COLUMN public.financial_statements.reports IS 'Các mẫu đã lập: B01-DN, B02-DN, B03-DN.';
COMMENT ON COLUMN public.financial_statements.data IS 'Số từng chỉ tiêu theo mẫu: { "B01-DN": { "100": [cuối kỳ, đầu năm] }, "B02-DN": { "01": [kỳ này, kỳ trước] }, … }.';
COMMENT ON COLUMN public.financial_statements.audited IS 'BCTC đã được kiểm toán.';
COMMENT ON COLUMN public.financial_statements.audit_opinion IS 'Ý kiến kiểm toán.';
COMMENT ON COLUMN public.financial_statements.preparer IS 'Người lập.';
COMMENT ON COLUMN public.financial_statements.legal_rep IS 'Người đại diện theo pháp luật.';
COMMENT ON COLUMN public.financial_statements.prepared_date IS 'Ngày lập.';
COMMENT ON COLUMN public.financial_statements.created_by IS 'Người tạo.';
COMMENT ON COLUMN public.financial_statements.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN public.financial_statements.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN public.financial_statements.updated_at IS 'Lúc sửa gần nhất.';
