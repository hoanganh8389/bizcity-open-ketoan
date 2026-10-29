-- 0029 Thêm users.session_version: cột này được core/security/session-state.ts (sessionStillValid, bumpSession) dùng để thu hồi
--      phiên đăng nhập (đổi/đặt lại mật khẩu, đổi vai trò, đăng xuất máy khác) nhưng chưa từng có migration tạo ra — API build
--      sẵn đã tham chiếu cột này nên mọi lượt xác thực (kể cả đăng nhập) báo lỗi "column session_version does not exist".
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.users.session_version IS 'Tăng mỗi lần thu hồi phiên (đổi mật khẩu, đổi vai trò, đăng xuất máy khác); vé JWT mang số lúc cấp, khác số thì bị từ chối.';
