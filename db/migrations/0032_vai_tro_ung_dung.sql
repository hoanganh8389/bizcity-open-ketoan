-- =============================================================================
-- 0032 Vai trò CSDL cho API: ketoan_app — KHÔNG superuser, KHÔNG sở hữu bảng (R-SEC-6, R-KER-3).
--   Vì sao: superuser / chủ bảng tắt được trigger bảo vệ sổ (ALTER TABLE … DISABLE TRIGGER, session_replication_role),
--   tức là vượt được lớp "sổ cái chỉ thêm" ở tầng CSDL. API chỉ cần đọc / thêm / sửa / xoá dữ liệu.
--   - Job db-migrate vẫn chạy bằng vai trò sở hữu (DATABASE_URL của db-migrate). Bảng tạo ở migration sau tự cấp quyền
--     cho ketoan_app nhờ ALTER DEFAULT PRIVILEGES bên dưới.
--   - Không cấp TRUNCATE, không cấp quyền sở hữu: ketoan_app không tắt được trigger, không xoá trắng bảng.
--   - Vai trò tạo ở dạng NOLOGIN. Job db-migrate bật LOGIN + đặt mật khẩu khi có biến DB_APP_PASSWORD (db/setup.ts);
--     docker-compose cho API dùng vai trò này khi đặt DB_APP_USER=ketoan_app.
--   - Máy chủ mà vai trò chạy migration không được tạo vai trò (không superuser, không CREATEROLE): bỏ qua, chỉ báo NOTICE —
--     người quản trị CSDL tự tạo vai trò theo đúng các câu GRANT dưới.
-- =============================================================================
DO $$
DECLARE
  can_create boolean;
BEGIN
  SELECT rolsuper OR rolcreaterole INTO can_create FROM pg_roles WHERE rolname = current_user;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    IF NOT can_create THEN
      RAISE NOTICE 'Bỏ qua tạo vai trò ketoan_app: % không có quyền tạo vai trò (xem 0032_vai_tro_ung_dung.sql)', current_user;
      RETURN;
    END IF;
    CREATE ROLE ketoan_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;

  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO ketoan_app', current_database());
  GRANT USAGE ON SCHEMA public TO ketoan_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ketoan_app;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ketoan_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ketoan_app;
  -- Bảng / dãy số / hàm do vai trò chạy migration tạo về sau: tự cấp đúng các quyền trên.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ketoan_app', current_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ketoan_app', current_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ketoan_app', current_user);
END
$$;
