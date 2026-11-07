# PHASE-028 · 40 — Master checklist
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — master checklist: S028-1..5 (W0), log -->

> Nguồn trạng thái **việc con** duy nhất của phase. Ký hiệu: ☐ chưa làm · 🟡 có mã/tài liệu, chưa đủ tín hiệu · ✅ đủ tín hiệu · ⛔ chờ chủ.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| S028-1 | W0: AS-IS audit có `file:line` ([10](10-AS-IS-AUDIT.md)) | W0 | P0 | ✅ 2026-11-05 |
| S028-2 | W0: Master plan, 10 quyết định D-AUTH-01..10 có phương án đề xuất ([00](00-MASTER-PLAN.md)) | W0 | P0 | ✅ 2026-11-05 |
| S028-3 | W0: ADR-0027 (Đề xuất) | W0 | P0 | ✅ 2026-11-05 |
| S028-4 | Chủ dự án duyệt D-AUTH-01..10 | W0 | P0 | ✅ 2026-11-05 — D-AUTH-03 bản sửa (owner / vai trò quản trị cao vẫn tự có quyền module) <!-- [2026-11-05 06:27 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — chủ duyệt, giữ chỗ W1 --> |
| S028-5 | PR tài liệu W0 merge vào `main` (R-FLOW) | W0 | P0 | ⛔ chờ PR |
| S028-6 | W1: `user_role_assignments` (0073) <!-- [2026-11-05 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — đổi số migration W1 0074 → 0075 (W-13: 0072 tên lúc ghi, 0073 / 0074 PHASE-026 đợt 2 / 3 giữ) -->, quyền hiệu lực = vai trò chính ∪ vai trò bổ sung, `ADMIN_ROLES`, action gán / thu hồi — chữ chốt [00 §4a](00-MASTER-PLAN.md) | W1 | P0 | 🟡 2026-11-06 mã + test xong (migration 0073), PR code — bỏ dòng giữ chỗ trong PR này <!-- [2026-11-06 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 code, đổi số 0075 --> |
| S028-7 | W2: ~~`module_grants`~~ vai trò của đơn vị (`tenant_roles`, `tenant_role_rules`, 0075) + lớp đọc `loadAuthzSnapshot` — chữ chốt [ADR-0027 Phụ lục A](../../adr/ADR-0027-core-authorization-plugin-role-editor.md); cấp quyền module = luật Cho của vai trò tuỳ biến | W2 | P0 | 🟡 2026-11-06 đợt 1 xong (bước 1–2: migration 0075, `core/authz/store.ts`, test `vai-tro-don-vi.test.ts`); đợt 2 xong (bước 3: API `/api/v1/roles`, thi hành Cho + Cấm ở `auth.ts`, `confirmPassword`, test `vai-tro-don-vi-api`); còn màn `modules/phan-quyen` (đợt 3) và bước 4 (nối bộ tính, shadow) <!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2: chủ chọn bỏ module_grants, làm Phụ lục A bước 1–2 --> <!-- [2026-11-06 02:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 1 code, bỏ dòng giữ chỗ --> |
| S028-8 | W3 đợt 2: khoá danh sách 17 route ghi thô (SC-AUTH-03), shadow `core/authz`, `requireScope()` — chữ chốt [ADR-0027 Phụ lục A, W3 đợt 2](../../adr/ADR-0027-core-authorization-plugin-role-editor.md); giữ chỗ sau khi W2 đợt 2 nhả `auth.ts` | W3 | P1 | 🟡 2026-11-06 đợt 2 mã xong: SC-AUTH-03 (danh sách đóng 17 route), shadow `core/authz/shadow.ts` (khoá `bizcity.authz.shadow`), `requireScope` thư viện; còn chẩn đoán `AUTHZ_SHADOW_DIFF` + số đo, gắn `requireScope` vào route (W5), gỡ đường cũ, bỏ `relax` / điều kiện thừa |
| S028-9 | W4: Role Editor UI — module `modules/phan-quyen/`, mã màn `HT12` (Q028-1 chốt), ma trận quyền × vai trò — chữ chốt [ADR-0027 Phụ lục A, W4](../../adr/ADR-0027-core-authorization-plugin-role-editor.md) | W4 | P1 | 🟡 2026-11-06 mã xong (module `phan-quyen`, ma trận / vai trò / người dùng + Xem như, `ui-kit.patch`, `module check` ĐẠT, 13 test logic); chưa chạy thử trên trình duyệt thật |
| S028-10 | W5: TGS mapping 349 mã + luồng mẫu Warehouse transfer | W5 | P1 | ☐ |
| S028-11 | W6: S-5..S-n vào pillar VII `tru-cot.json`, SC-AUTH-01..12 | W6 | P1 | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-05 | Claude Code | Mở phase từ đề bài chủ dự án; W0 audit + master plan + ADR-0027 (Đề xuất). Không giữ chỗ code — chờ duyệt D-AUTH-01..10 theo đúng R-FLOW và đề bài §0/§6. |
| 2026-11-05 18:27 | Claude Code | Chủ duyệt D-AUTH-01..10, sửa D-AUTH-03. ADR-0027 chấp nhận. Chữ chốt W1 (00 §4a), giữ chỗ W1 (S028-6). |
| 2026-11-06 01:10 | Claude Code | W1 code: `user_role_assignments` (migration đổi 0074 → 0075 → 0073: chủ chọn ai merge trước lấy số trước), `ADMIN_ROLES`, quyền hiệu lực nhiều vai trò, `core.user.role-assign` / `role-revoke`; bỏ dòng giữ chỗ W1 (R-FLOW-6). |
| 2026-11-06 13:29 | Claude Code | Chủ chọn: W2 bỏ `module_grants`, làm ADR-0027 Phụ lục A bước 1–2 (vai trò của đơn vị + lớp đọc cho bộ tính); Q028-2 hết đối tượng. Chữ chốt W2 đợt 1 vào Phụ lục A, giữ chỗ W2 (S028-7); bỏ dòng W3 đợt 1 đã xong (#99). |
| 2026-11-06 14:20 | Claude Code | W2 đợt 1 code: migration 0075 (`tenant_roles`, `tenant_role_rules`, `tenant_role_id`, `tenants.authz_version` bằng trigger, không cấp DELETE cho vai trò API), lớp đọc `loadAuthzSnapshot` cho bộ tính (chưa nối đường yêu cầu); `extraRoles` bỏ qua lần gán vai trò của đơn vị. Bỏ dòng giữ chỗ W2 đợt 1 (R-FLOW-6). Merge sau W1 và E2 (0074, bàn giao `schema-catalog.ts`). |
| 2026-11-06 15:10 | Claude Code | Chữ chốt W2 đợt 2 (ADR-0027 Phụ lục A, bước 3): API quản trị vai trò của đơn vị, thi hành Cho + Cấm ở `auth.ts` (chủ chọn), `confirmPassword` cho quyền cao (chủ chọn). Dòng giữ chỗ đợt 2 thêm sau khi PR W2 đợt 1 nhả dòng hiện có (hai dòng không giữ cùng tệp). |
| 2026-11-06 16:30 | Claude Code | W2 đợt 2 code (bước 3): `core.role.create` / `update` / `rule-add` / `rule-remove`, `GET /api/v1/roles[/:id]`, `core.user.role-assign` nhận `tenantRoleId`; `auth.ts` thi hành (chính ∪ bổ sung ∪ nền + Cho) − Cấm, Cấm không áp cho vai trò quản trị cao; `confirmPassword` cho Cho quyền rủi ro cao; chống leo thang; `GET /api/v1/roles/matrix` (ma trận quyền × vai trò cho Role Editor) và `GET /api/v1/users/:id/effective-permissions` (Xem như). Bỏ dòng giữ chỗ W2 đợt 2 (R-FLOW-6). |
| 2026-11-06 20:10 | Claude Code | Chữ chốt W4 (Role Editor, `modules/phan-quyen/`, HT12) và W3 đợt 2 (khoá 17 route, shadow, `requireScope`); giữ chỗ W4 (S028-9). Giữ chỗ W3 đợt 2 chờ W2 đợt 2 nhả `auth.ts`. |
| 2026-11-06 21:30 | Claude Code | W4 code: `modules/phan-quyen/` (HT12) — ma trận quyền × vai trò, vai trò, người dùng + Xem như, hộp thoại ghi (lý do, nhập lại mật khẩu); `@bizcity/ui-kit` thêm `patch`; hướng dẫn `phan-quyen.md`. Bỏ dòng giữ chỗ W4 (R-FLOW-6). |
| 2026-11-06 22:30 | Claude Code | W3 đợt 2 code: SC-AUTH-03 (`tests/conformance/checks/authz/`, `route-giu.json` 17 route, fixture `authz-bad`), shadow (`core/authz/shadow.ts`, hook ở `requirePermission`, khoá `bizcity.authz.shadow` mặc định off), `requireScope` (`core/authz/scope.ts`, đóng an toàn khi thiếu vị trí). Bất đẳng thức "bộ tính không cho thừa" đạt trên 6 vai trò hệ thống và 4 tổ hợp vai trò đơn vị. Bỏ dòng giữ chỗ W3 đợt 2 (R-FLOW-6). |
| 2026-11-07 09:30 | Claude Code | W5 đợt 1 code: `requireScope` ở `POST /documents` + `/batch` (Kernel, chi nhánh tra theo đơn vị, đóng an toàn khi thiếu / sai mã, lô lẫn chi nhánh từ chối cả lô); `requireScope` đi đường nhanh khi có quyền toàn đơn vị, nhận nhiều vị trí; `core.user.role-assign` nhận `scopeType` / `scopeId` (chi nhánh); HT12 chọn chi nhánh; SC-API-3 nhận `requireScope(`. Test cửa nạp 9 ca (chuyển kho hai chiều, Cấm thắng, thu hồi). Bỏ dòng giữ chỗ W5 đợt 1 (R-FLOW-6). |
