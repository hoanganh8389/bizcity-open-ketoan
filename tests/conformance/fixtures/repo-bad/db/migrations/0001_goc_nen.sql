CREATE TABLE public.branches (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    amount float8 NOT NULL
);
COMMENT ON TABLE public.branches IS 'Chi nhánh.';
COMMENT ON COLUMN public.branches.code IS 'Mã chi nhánh.';
