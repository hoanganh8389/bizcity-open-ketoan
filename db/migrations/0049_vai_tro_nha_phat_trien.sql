-- [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: vai trò developer (Q019-1 = b) cho Bàn điều tra
-- =============================================================================
-- 0049 Vai trò Nhà phát triển (PHASE-019 Q019-1, D019-3).
--      developer = quyền chỉ xem (như viewer) + devtools:read — đọc trace / log / bằng chứng của ĐƠN VỊ MÌNH qua Bàn điều tra.
--      Không ghi chứng từ, không cấu hình. Quyền theo vai trò nằm ở packages/platform/src/core/auth.ts (ROLE_PERMISSIONS);
--      CSDL chỉ giữ danh sách vai trò hợp lệ.
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['owner', 'chief_accountant', 'accountant', 'viewer', 'developer']));

COMMENT ON COLUMN users.role IS 'Vai trò: owner / chief_accountant / accountant / viewer / developer (chỉ xem + Bàn điều tra, 0049). Quyền chi tiết ở core/auth.ts.';
