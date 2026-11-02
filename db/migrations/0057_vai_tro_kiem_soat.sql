-- [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: vai trò auditor (kiểm soát / ban kiểm soát, Q022-1) — chỉ xem + Bàn đánh giá (review:read).
-- =============================================================================
-- 0057 Vai trò Kiểm soát (PHASE-022 Q022-1).
--      auditor = quyền chỉ xem (như viewer) + review:read — đọc Bàn đánh giá (HT08) của ĐƠN VỊ MÌNH: checklist giả định lỗi,
--      phương án khắc phục, các lần xác nhận cảnh báo. Không ghi chứng từ, không cấu hình, không khoá kỳ.
--      Quyền theo vai trò nằm ở packages/platform/src/core/auth.ts (ROLE_PERMISSIONS); CSDL chỉ giữ danh sách vai trò hợp lệ.
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['owner', 'chief_accountant', 'accountant', 'viewer', 'developer', 'auditor']));

COMMENT ON COLUMN users.role IS 'Vai trò: owner / chief_accountant / accountant / viewer / developer (chỉ xem + Bàn điều tra, 0050) / auditor (chỉ xem + Bàn đánh giá, 0057). Quyền chi tiết ở core/auth.ts.';
