-- [2026-11-11 Nguyễn Văn Thủy] 0108 Hồ sơ in (print_profiles, 0103) thiếu RLS: bật RLS + FORCE + chính sách cô lập đơn vị theo khuôn 0041 (đóng góp)
ALTER TABLE public.print_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.print_profiles;
CREATE POLICY tenant_isolation ON public.print_profiles USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
