-- [2026-11-17 02:25 PM khanhtd] NT-HT-003 — vai trò staff (Nhân viên): không quyền đọc toàn đơn vị, quyền nghiệp vụ chỉ đến từ lần gán tại chi nhánh / kho (chờ chủ dự án chốt trước khi mở PR)
-- =============================================================================
-- 0149 Vai trò Nhân viên (staff) — phân quyền theo chi nhánh cho chuỗi cửa hàng.
--      staff = chỉ catalog:read. Thu ngân, nhân viên bán hàng, thủ kho cửa hàng nhận quyền nghiệp vụ qua vai trò gán TẠI chi nhánh / kho
--      (user_role_assignments.scope_type branch / warehouse, công tắc bizcity.authz.branch_scope bật), nên không thấy sổ, báo cáo,
--      chứng từ của chi nhánh khác. Quyền theo vai trò nằm ở packages/platform/src/core/auth.ts (ROLE_PERMISSIONS); CSDL chỉ giữ danh
--      sách vai trò hợp lệ. Dùng được làm vai trò chính, vai trò gán thêm và vai trò nền của vai trò đơn vị.
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['owner', 'chief_accountant', 'accountant', 'viewer', 'developer', 'auditor', 'staff']));

ALTER TABLE user_role_assignments DROP CONSTRAINT user_role_assignments_role_check;
ALTER TABLE user_role_assignments ADD CONSTRAINT user_role_assignments_role_check
  CHECK (role IN ('owner', 'chief_accountant', 'accountant', 'viewer', 'developer', 'auditor', 'staff'));

ALTER TABLE tenant_roles DROP CONSTRAINT tenant_roles_base_role_check;
ALTER TABLE tenant_roles ADD CONSTRAINT tenant_roles_base_role_check
  CHECK (base_role IN ('chief_accountant', 'accountant', 'viewer', 'developer', 'auditor', 'staff'));

COMMENT ON COLUMN users.role IS 'Vai trò: owner / chief_accountant / accountant / viewer / developer (chỉ xem + Bàn điều tra, 0050) / auditor (chỉ xem + Bàn đánh giá, 0057) / staff (Nhân viên: chỉ danh mục, quyền nghiệp vụ theo lần gán tại chi nhánh / kho, 0149). Quyền chi tiết ở core/auth.ts.';
COMMENT ON CONSTRAINT user_role_assignments_role_check ON user_role_assignments IS 'Vai trò hệ thống hợp lệ của lần gán (0149 thêm staff).';
COMMENT ON CONSTRAINT tenant_roles_base_role_check ON tenant_roles IS 'Vai trò nền hợp lệ của vai trò đơn vị — không owner (0149 thêm staff).';
