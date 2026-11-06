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
| S028-8 | W3: đóng 17 route ghi thô còn lại, `requireScope()` | W3 | P1 | ☐ |
| S028-9 | W4: Role Editor UI (mã màn — Q028-1) | W4 | P1 | ☐ |
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
| 2026-11-06 16:30 | Claude Code | W2 đợt 2 code (bước 3): `core.role.create` / `update` / `rule-add` / `rule-remove`, `GET /api/v1/roles[/:id]`, `core.user.role-assign` nhận `tenantRoleId`; `auth.ts` thi hành (chính ∪ bổ sung ∪ nền + Cho) − Cấm, Cấm không áp cho vai trò quản trị cao; `confirmPassword` cho Cho quyền rủi ro cao; chống leo thang. |
