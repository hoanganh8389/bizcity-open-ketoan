-- [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.10 (ADR-0011 D4): schema_migrations.module — migration của module ghi riêng; module chạy migration bằng vai trò mod_<key>_owner, đọc ghi bằng mod_<key>_rw
-- =============================================================================
-- 0053 Migration theo module (ADR-0011 D4; PHASES 3.10).
--      Module có bảng riêng (modules/<key>/migrations/NNNN_*.sql) chạy migration qua trình cài (`module migrate`, vai trò sở
--      hữu) với SET LOCAL ROLE mod_<key>_owner: vai trò này chỉ sở hữu schema mod_<key>, không có quyền trên public —
--      PostgreSQL tự chặn mọi lệnh chạm bảng Kernel (kể cả DO $$ … EXECUTE). Sau migration, trình cài kiểm danh mục: mọi
--      bảng trong mod_<key> có tenant_id + RLS bật + FORCE + chính sách; thiếu → huỷ cả migration.
--      Lúc chạy, module đọc / ghi bảng của mình trong ctx.data.module(fn): SET LOCAL ROLE mod_<key>_rw (chỉ bảng mod_<key> +
--      khung nhìn bizcity_read khai trong manifest), xong trả về vai trò API.
--      Vai trò, schema do trình cài tạo (cần quyền CREATEROLE), không tạo ở đây: tên phụ thuộc module bản cài có.
-- =============================================================================

ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS module text;
COMMENT ON COLUMN schema_migrations.module IS 'NULL: migration của Core (db/migrations). Khoá module: migration của module đó (tên dạng <key>/NNNN_ten.sql), chạy bằng vai trò mod_<key>_owner (ADR-0011 D4).';
