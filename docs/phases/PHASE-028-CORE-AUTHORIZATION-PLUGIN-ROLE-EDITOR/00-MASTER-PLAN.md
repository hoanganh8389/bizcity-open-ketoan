# PHASE-028 · 00 — Kế hoạch: Core Authorization Foundation, Plugin Contract & Role Editor
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W0 master plan: D-AUTH-01..10, 7 wave, không code trước khi chủ duyệt -->

## 1. Vì sao

Đề bài gốc: `PHASE-DE-XUAT-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR.md` (chủ dự án, 05/11/2026) — DRAFT, chưa phải ADR đã duyệt. Mục tiêu: dev tạo module khai `permissions[]` là có cây quyền; quản trị viên có Role Editor kiểu WordPress User Role Editor; **mặc định không ai có thêm đặc quyền, kể cả `owner`**; Accounting Kernel giữ độc quyền sự thật kế toán.

Sự thật đọc mã: [10-AS-IS-AUDIT.md](10-AS-IS-AUDIT.md). Kết luận W0: không dựng authz service thứ hai — nối ba nền đã có (`auth.ts`, `defineAction` guard, mẫu `app_installations` module-grant) và bịt 2 lỗ hổng cụ thể (owner auto-grant, module trong tiến trình không có bước cấp quyền).

## 2. Quy mô phase này (W0) và cái gì KHÔNG làm ở đây

**W0 chỉ là tài liệu.** Không có migration, không sửa `auth.ts`, không sửa manifest schema trong PR này. Mọi thay đổi Kernel/Platform/contract thật sự bắt đầu ở W1 trở đi, **mỗi wave một PR tài liệu chốt thiết kế riêng vào `main` trước PR code** (RULE-FLOW §3 — đây là "đụng thứ dùng chung": `packages/contracts`, migration, chính sách bằng chứng, luật lớp).

**Không làm trong phase này** (theo đúng giới hạn đề bài §1, §10 tự đặt ra):
- Không mã hoá đủ 349 mã TGS thành action thật — chỉ map, chọn 3 luồng MVP (POS/Sales, Purchase, Warehouse) ở W5.
- Không chuyển `phan-he/*` → `modules/*` hàng loạt (đóng băng theo ADR-0024) — chỉ thêm adapter tương thích gọi chung authorize.
- Không sửa Ledger/Kernel invariants để phục vụ UI quyền (đề bài §0 cấm rõ).
- Không tự tạo bảng `core_users` song song nếu `users` hiện tại mở rộng được (xem D-AUTH-01).

## 3. Mười quyết định cần chủ dự án duyệt (D-AUTH-01..10)

Đề bài §13 đã tự ghi "phương án ưu tiên để đề xuất" — dưới đây giữ nguyên hướng đó, đối chiếu lại với bằng chứng thật ở AS-IS audit, chỉ nói rõ thêm khi cần. **Claude không tự quyết — đây là đề xuất chờ duyệt**, đúng như đề bài tự yêu cầu ở §0 và §13.

| ID | Quyết định | Phương án đề xuất (đã đối chiếu mã thật) | Vì sao |
|---|---|---|---|
| D-AUTH-01 | `users` cũ ↔ `core_users` mới | **Mở rộng `users`**, không tạo bảng song song. Thêm bảng mới `user_role_assignments` (user, role, tenant, scope, purpose, hiệu lực) **cạnh** `users.role`; cột `users.role` giữ nguyên là "role chính / legacy" trong suốt giai đoạn chuyển, có adapter đọc hai nguồn | F1/F2: `users` có FK, RLS, login gắn chặt; tạo bảng song song phải double-write mọi nơi, rủi ro cao hơn lợi ích |
| D-AUTH-02 | Định dạng permission mới | Giữ **`<module>:<việc>`** v1 nguyên trạng (không đổi dấu chấm); thêm bảng chiếu `permission_catalog` (projection từ registry code, không phải nguồn sự thật mới) mang thêm `resource`, `operation`, `risk`, `scopeKinds` | F5/F13: đổi định dạng ID phải sửa mọi `requirePermission(...)`, `defineAction`, schema module — chi phí lớn, không có lợi ích tương xứng ở W1–W2 |
| D-AUTH-03 | Role mặc định và plugin mới | **Mặc định cấm (default-deny) cho mọi quyền module mới**, kể cả `owner`. Nhân mẫu `app_installations.permissions` (F10) sang module trong tiến trình: thêm bảng `module_grants(tenant_id, module_key, permission_key, granted_by, granted_at)`; cài/nâng cấp module **không** tự chèn dòng — quản trị viên bấm "Cấp" ở Role Editor mới có | F6: đây là lỗ hổng xác nhận rõ nhất, đúng tinh thần AUTHZ-03. Preset hệ thống (role mẫu) vẫn chạy bình thường cho quyền **Core** có sẵn trong `PERMISSIONS`, chỉ quyền **module** mới bị khoá |
| D-AUTH-04 | Nhiều role & quyền riêng | ALLOW = **UNION trong cùng scope** của mọi role đang gán hợp lệ; `DENY`/SoD luôn thắng `ALLOW`; không union chéo scope thành siêu quyền | Khớp mô hình RLS/scope đã có (tenant), mở rộng tự nhiên xuống chi nhánh/kho mà không phá nguyên tắc cô lập đơn vị |
| D-AUTH-05 | Chuyển đổi `users.role`/JWT | **EXPAND → BACKFILL → SHADOW CHECK → SWITCH**, không cắt khi thiếu bằng chứng. Cụ thể theo F4/F8: đổi `users.role` phải bump `session_version` ngay (sửa 1 chỗ, P0, độc lập waves khác) | Giữ nguyên JWT/login hiện tại trong lúc chuyển; chỉ vá điểm hở revoke đã tìm thấy |
| D-AUTH-06 | Scoreboard | **Mở rộng pillar VII có sẵn** trong `tru-cot.json` (`bizcity_pillars@1`) — thêm tiêu chí S-5..S-n, không mở `authz_compliance@1` song song, không sửa số % của S-1..S-4 trong PR này | F19/F20: pillar VII đã đúng chủ đề "phân quyền"; mở contract mới là trùng, vi phạm "Core gọn" (R-KER-8) |
| D-AUTH-07 | Mẫu role kế toán trưởng | Giữ preset `chief_accountant` rộng về **nghiệp vụ kế toán Core** (đã có ở `ROLE_PERMISSIONS`), nhưng **quyền module** vẫn phải qua `module_grants` như mọi role — không có ngoại lệ "trưởng thì tự có" | Đúng D-AUTH-03; tách rõ "quyền Core theo vai trò" (giữ nguyên) khỏi "quyền module" (default-deny mới) |
| D-AUTH-08 | TGS mapping & 6 cờ | Dùng làm **migration/test source** duy nhất — mỗi dòng mapping có `confidence`, `verified_status`; không mã nào tự thành quyền thật khi chưa `BA_REVIEWED` | Đúng đề bài §7.1; tránh biến bản chụp Excel thành luật ngầm |
| D-AUTH-09 | Thứ tự 3 luồng MVP | **Warehouse trước** (transfer 2 đầu là ca test rõ nhất cho scope theo kho, đã có sẵn `kho:*` actions một phần), sau đó Purchase, Sales — ngược thứ tự đề bài gợi ý vì ít đụng `phan-he/ban-hang` đang có PR khác đang chạy (PHASE-026 xương cá) | Giảm xung đột R-FLOW với các dòng giữ chỗ đang "đang làm" trên `main` hiện nay (xem CLAIMS.md) |
| D-AUTH-10 | Cross-tenant / đa pháp nhân | **Không làm ở phase này.** Nhóm đơn vị (`tenant_groups`) đã là tiêu chí S-3/S-4 của chính pillar VII, do PHASE-026 (Master Data Governance) sở hữu. PHASE-028 chỉ đọc kết quả khi PHASE-026 xong, không tự làm trùng | Tránh hai phase cùng sửa một migration/contract (SC-PHASE-1 không cho một mã ở hai nơi) |

**Khi chủ duyệt:** ghi chữ chốt trực tiếp vào bảng này (như các phase khác), ADR-0027 chuyển "Đề xuất" → "Chấp nhận", rồi mới mở PR giữ chỗ W1.

## 4. Bảy wave (giữ đúng khung đề bài §10, chỉnh theo bằng chứng)

| Wave | Mục tiêu | Đụng gì (K-level) | Cổng nghiệm thu |
|---|---|---|---|
| **W0** (phase này) | Audit + ADR-0027 + 10 quyết định | K0, chỉ tài liệu | Chủ duyệt D-AUTH-01..10; PR tài liệu vào `main` |
| **W1 — Identity & multi-role** | `user_role_assignments` (migration mới); sửa 1 chỗ bump `session_version` khi đổi `users.role` (D-AUTH-05, có thể tách PR riêng làm ngay, rủi ro thấp) | K2 (migration + `auth.ts`) | Test: 1 user 2 role 2 scope; đổi role cũ có hiệu lực ngay; không phá login hiện tại |
| **W2 — Module grant (default-deny)** | `module_grants` (migration); sửa `rolePermissions()` bỏ nhánh `role === 'owner'` auto-grant; Role Editor API đọc/ghi grant | K3 (đổi hành vi `auth.ts` — ảnh hưởng mọi module đang chạy, cần kế hoạch tương thích ngược: migration backfill grant cho module **đã cài trước ngày chuyển**, chỉ module **mới** từ nay mới default-deny) | Test AUTH-REG-01/02; không có module nào đang chạy bị khoá đột ngột sau nâng cấp |
| **W3 — SDK & guard hoàn thiện** | Đóng nốt 17 route ghi thô còn lại (F16) vào `defineAction`; `requireScope()` wrapper cho resource scope (chi nhánh/kho) | K2 | SC-AUTH-03 (mọi route ghi có guard), test `WAREHOUSE_REPORT_VS_OPERATE` |
| **W4 — Role Editor UI** | Màn mới (mã `HT12`/`HT13` — xác nhận trước khi code), dùng `@bizcity/ui-kit`, đọc registry + `module_grants` + `user_role_assignments` | K1 (UI + API đọc/ghi quyền, không chạm Ledger) | 9 nghiệm thu UI ở đề bài §8.1, không có nút tự tick "Đạt" |
| **W5 — TGS mapping & 1 luồng MVP** | Map 349 mã (tài liệu + JSON/CSV có `confidence`); chuyển luồng **Warehouse transfer** làm ca mẫu | K1 (mapping) + K2 (nếu luồng mẫu cần action mới) | Coverage report; `TRANSFER_TWO_SIDES` test pass |
| **W6 — Scoreboard & gate** | Thêm S-5..S-n vào pillar VII; nối `selfcheck.mjs` (SC-AUTH-*) | K1 | Scoreboard đọc evidence thật, không % giả |

## 5. Mười hai mã kiểm (SC-AUTH-01..12) — đề xuất vị trí, chưa viết

Theo đúng bảng đề bài §5.3. Đề xuất: mở rộng `tests/conformance/checks/` (thư mục `authz/`), không viết validator riêng. Danh sách mã giữ nguyên như đề bài; sẽ chốt code cụ thể ở W3 cùng với PR sửa `defineAction`/`web.ts`.

## 6. Mã việc lộ trình

Chưa thêm vào `docs/standard/roadmap.json`/`PHASES.md` ở W0 — gộp chung đợt với PHASE-018/019/020 (Q018-1/Q019-4/Q020-1, đã chủ duyệt 2026-11-05, đang chờ PR riêng vì trùng dải số 2.17–2.21 đang dùng cho PHASE-021). Khi mở PR mã việc đó, thêm cùng lúc mã cho PHASE-028 W1–W6.

## 7. Câu hỏi còn mở (không thuộc D-AUTH-01..10, không chặn duyệt W0)

| ID | Câu hỏi | Ghi chú |
|---|---|---|
| Q028-1 | Mã màn Role Editor: `HT12`/`HT13` hay số khác? | Chỉ cần quyết trước W4, không chặn W0–W3 |
| Q028-2 | `module_grants` có cần hạn (`expires_at`) như quyền đặc biệt (AUTHZ-09) hay chỉ vĩnh viễn tới khi thu hồi tay? | Quyết trước W2 |
| Q028-3 | Role preset mới (đề bài §4.2: `cashier`, `warehouse_keeper`, `store_manager`...) có thay thế 6 role hiện tại hay cộng thêm? | 6 role hiện tại (`owner`, `chief_accountant`, `accountant`, `viewer`, `developer`, `auditor`) đang có test/migration gắn chặt — đề xuất **cộng thêm**, không thay, nhưng cần chủ xác nhận trước W1 |
