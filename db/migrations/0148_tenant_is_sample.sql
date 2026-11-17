-- [2026-11-17 11:21 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 (B5a, chữ chốt PHASE-036 · 00 §14): đơn vị mẫu riêng — cờ tenants.is_sample
-- =============================================================================
-- 0148 Đơn vị mẫu (Công ty Mẫu, dữ liệu hư cấu — PHASE-036 · 00 §14, D036-2, Q036-1).
--   Job db-migrate tạo khi BIZCITY_SAMPLE và CSDL vừa khởi tạo. Đơn vị mẫu là đơn vị bình thường (RLS, sổ chỉ thêm như mọi
--   đơn vị); cờ chỉ để: biểu ngữ "số liệu hư cấu", chặn gửi ra ngoài (action sideEffects external, kết nối app — T036-4).
-- =============================================================================

ALTER TABLE tenants ADD COLUMN is_sample boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.is_sample IS 'Đơn vị mẫu (Công ty Mẫu, dữ liệu hư cấu — PHASE-036 · 00 §14): biểu ngữ số liệu hư cấu; máy chủ chặn gửi ra ngoài (action external, kết nối app). Đặt bởi job db-migrate, không sửa qua API.';
