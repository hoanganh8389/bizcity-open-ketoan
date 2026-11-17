# Module `thiet-lap` — Thiết lập nhanh (TI15)

Hộp thoại bốn bước cho **đơn vị trắng** (chưa có chứng từ nào): thông tin công ty, chế độ ghi sổ chuẩn, danh mục mẫu nếu muốn. Thiết kế: [PHASE-036 · 00 §4, §12](../../docs/phases/PHASE-036-THIET-LAP-NHANH-DU-LIEU-MAU/00-MASTER-PLAN.md); hướng dẫn người dùng: [docs/huong-dan/thiet-lap-nhanh.md](../../docs/huong-dan/thiet-lap-nhanh.md).

**Chỉ giao diện** (như `thu-vien`): không action, không bảng, không quyền riêng. Mọi việc đi qua API Core:

| Việc | API |
|---|---|
| Đơn vị trắng không, có lần chạy nào đang chạy | `GET /api/v1/setup/status` (`core.setup.status`) |
| Gói mẫu theo ngành | `GET /api/v1/setup/presets` (`core.setup.presets`) |
| Thông tin công ty | `GET` / `PUT /api/v1/tenant` (`core.tenant.update`) |
| Xem trước từng khối (tổng / đã có / sẽ thêm), chạy được không | `GET /api/v1/setup/presets/:id/plan?blocks=` (`core.setup.plan`) |
| Nạp (máy chủ chạy nền) | `POST /api/v1/setup/presets/:id/apply?blocks=` → 202 `{ runId }` |
| Tiến độ từng khối | `GET /api/v1/setup/runs/:id` (`core.setup.run`) |

Quyền: `settings:write` (chủ đơn vị, kế toán trưởng). Máy chủ gọi lại action Core cho từng bản ghi với quyền của người bấm — không SQL, không số tài khoản.

## Luồng

1. **Bắt đầu** — *Thiết lập công ty của tôi*. *Xem công ty mẫu* (B5a): bản cài có Công ty Mẫu (`core.setup.status` → `sampleTenantCode`) thì bấm *Mở Công ty Mẫu* — module phát sự kiện `ketoan:open-sample` (`detail.code`), khung giao diện (`CongTyMau.tsx`) điền sẵn mã đơn vị ở trang đăng nhập, đăng xuất và tải lại. Module không chạm vé đăng nhập.
2. **Công ty** — tên, MST, địa chỉ, điện thoại (lưu khi đổi); ngành = gói mẫu có trong bản cài.
3. **Nạp gì** — cấu hình (luôn có) + danh mục mẫu tick được (mặc định tắt). Không có chứng từ mẫu.
4. **Đang nạp → Xong** — hỏi tiến độ mỗi giây; lỗi thì *Thử lại* (phần đã có bỏ qua). Đóng giữa chừng không dừng việc nạp; mở lại thì vào thẳng bước này.

Lối vào: nút *Thiết lập nhanh* trên biểu ngữ *Đơn vị chưa có dữ liệu* ở Tổng quan (Core, chỉ hiện khi module bật) và menu TI15.

## Tệp

| Tệp | Việc |
|---|---|
| `web/index.tsx` | menu TI15 `/app/thiet-lap` |
| `web/screens/ThietLapPage.tsx` | màn bốn bước (thanh bước `Steps` của `@bizcity/ui-kit`) |
| `web/lib/thiet-lap.ts` | logic thuần: chọn khối, hàng hiện ở bước 3, trạng thái khối, kết quả lần chạy, MST — test ở `test/` |
