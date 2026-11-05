# ADR-0027 · Core Authorization Foundation: module grant mặc định cấm, nhiều role có phạm vi, Role Editor
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — ADR-0027: đề xuất từ đề bài chủ dự án 05/11/2026 (WordPress-style plugin ecosystem + User Role Editor + Accounting Kernel enforcement) -->

- Trạng thái: **Đề xuất** — chờ chủ dự án duyệt D-AUTH-01..10 ([PHASE-028](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/README.md)).
- Nguồn: chủ dự án 2026-11-05 — đề bài `PHASE-DE-XUAT-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR.md`: cộng đồng tạo module nhanh như WordPress, đăng ký chức năng là có cây quyền để quản trị viên cấu hình, nhưng "quyền thực thi và sự thật kế toán luôn nằm dưới Core".
- Ngày: 2026-11-05 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 cho ADR này; thi hành K2–K3 theo từng wave PHASE-028 (xem [00-MASTER-PLAN §4](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/00-MASTER-PLAN.md)).
- Nền: ADR-0011 mức 2 (`app_installations` — mẫu module-grant đã có cho app ngoài tiến trình), PHASE-010/011 (`packages/platform/src/core/auth.ts`, Module SDK), [ADR-0024](ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md) (modules/ vs phan-he/ đóng băng).

## Vấn đề

Đọc mã thật ([10-AS-IS-AUDIT](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/10-AS-IS-AUDIT.md)) xác nhận hai lỗ hổng cụ thể so với mục tiêu "cộng đồng mở module tự do, nhưng không ai tự có thêm đặc quyền":

1. **`owner` tự động nhận mọi quyền module** ngay khi module đăng ký runtime (`rolePermissions()`, `packages/platform/src/core/auth.ts:93-97`) — không qua bước cấp nào, kể cả quyền vừa thêm sau khi nâng cấp module.
2. **`users.role` là một cột, một giá trị** (`db/migrations/0001_goc_nen_tang.sql:232-243`) — không biểu đạt được "một người nhiều role, mỗi role một phạm vi" mà Role Editor cần.

Ngược lại, ba nền đã đúng hướng và **không cần làm lại**: danh mục quyền + đăng ký runtime (`PERMISSIONS`/`registerModulePermissions`), guard thật ở `defineAction` (không chỉ ẩn UI), và mẫu "cấp quyền khi kết nối, mặc định rỗng" đã chạy tốt cho app ngoài tiến trình (`app_installations.permissions`, ADR-0011 mức 2).

## Quyết định đề xuất

| Mã | Quyết định | Lý do |
|---|---|---|
| D-AUTH-01 | Mở rộng `users` (không tạo `core_users` song song); thêm `user_role_assignments(user, role, tenant, scope, purpose, hiệu lực)` cạnh `users.role` | Tránh double-write identity đã gắn FK/RLS/login |
| D-AUTH-02 | Giữ định dạng quyền `<module>:<việc>`; thêm bảng chiếu `permission_catalog` mang `resource/operation/risk/scopeKinds`, không đổi ID đang chạy | Đổi ID phải sửa mọi nơi gọi `requirePermission`/`defineAction`, chi phí không tương xứng |
| D-AUTH-03 | **Mặc định cấm (default-deny) mọi quyền module mới, kể cả `owner`.** Thêm `module_grants(tenant_id, module_key, permission_key, granted_by, granted_at)`, nhân mẫu `app_installations.permissions` sang module trong tiến trình | Đây là lỗ hổng xác nhận rõ nhất qua đọc mã; đúng tinh thần AUTHZ-03 |
| D-AUTH-04 | ALLOW = UNION trong cùng scope của các role đang gán; DENY/SoD luôn thắng ALLOW | Khớp mô hình RLS/scope đã có, mở rộng tự nhiên xuống chi nhánh/kho |
| D-AUTH-05 | Đổi `users.role` phải bump `session_version` ngay (vá điểm hở revoke); EXPAND → BACKFILL → SHADOW CHECK → SWITCH cho các bước còn lại | Giữ login/JWT hiện tại hoạt động trong lúc chuyển |
| D-AUTH-06 | Mở rộng pillar VII có sẵn trong `tru-cot.json` (`bizcity_pillars@1`), không mở `authz_compliance@1` song song | Pillar VII đã đúng chủ đề "Cô lập đơn vị và phân quyền"; mở contract mới là trùng (R-KER-8) |
| D-AUTH-07 | `chief_accountant` giữ nguyên quyền Core; quyền **module** vẫn phải qua `module_grants` như mọi role, không có ngoại lệ | Tách rõ quyền Core (theo vai trò, giữ nguyên) khỏi quyền module (default-deny mới) |
| D-AUTH-08 | TGS mapping & 6 cờ chỉ dùng làm nguồn migration/test, không tự thành quyền thật khi chưa `BA_REVIEWED` | Tránh bản chụp Excel thành luật ngầm |
| D-AUTH-09 | Luồng MVP đầu tiên: **Warehouse transfer**, sau đó Purchase, Sales | Ít xung đột với các dòng giữ chỗ `feat/xuong-ca-dinh-danh`, `feat/phase-026-*` đang chạy trên `main` |
| D-AUTH-10 | Không làm nhóm đơn vị / cross-tenant ở phase này — tiêu chí S-3/S-4 của pillar VII do PHASE-026 sở hữu | Tránh hai phase cùng sửa một migration/contract (SC-PHASE-1) |

Chi tiết từng wave, 12 mã kiểm SC-AUTH-01..12, checklist nghiệm thu: [00-MASTER-PLAN](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/00-MASTER-PLAN.md).

## Hệ quả

- **Tương thích ngược bắt buộc** ở W2: module **đã cài trước ngày chuyển** được backfill `module_grants` tương đương quyền đang có (không khoá đột ngột); chỉ module **mới** từ sau ngày chuyển mới default-deny thật.
- Không đổi Ledger, không đổi `ledgerService`, không thêm cổng ghi sổ mới — quyền module chỉ quyết định actor được gọi action nào, Kernel vẫn là nơi duy nhất ghi sổ.
- Standard `bizcity_module@1` có thể cần trường tuỳ chọn mới ở W2 (tương thích VER-1, minor) — chốt cụ thể khi W2 mở PR tài liệu riêng.
