# PHASE-028 · 10 — AS-IS audit (đọc mã thật trên `origin/main`, 05/11/2026)
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W0 audit, dẫn file:line, không suy luận từ tên màn -->

Commit đọc: `origin/main` sau PR #88/#89 (xem `git log --oneline -1 origin/main` lúc đọc). Cột **Trạng thái**: `EXISTS` (đã có, tái dùng được) · `PARTIAL` (có nền, còn thiếu) · `MISSING` · `CONFLICT` (mâu thuẫn yêu cầu mới) · `CẦN XÁC MINH` (chưa đủ bằng chứng để kết luận, không suy diễn).

## 1. Identity / users / role

| # | Sự thật | `file:line` | Trạng thái |
|---|---|---|---|
| F1 | `users` có `tenant_id`, `email`, `role` (**một cột text, một giá trị**), `is_active`, `session_version` (thêm ở 0029) | [`db/migrations/0001_goc_nen_tang.sql:232-243`](../../../db/migrations/0001_goc_nen_tang.sql#L232-L243) | EXISTS (nền) / **CONFLICT** với yêu cầu nhiều role/scope cho một người |
| F2 | `users_role_check` đã đổi 3 lần (thêm `developer`, `auditor`): 4 → 5 → 6 giá trị cố định | [`0001:242`](../../../db/migrations/0001_goc_nen_tang.sql#L242), [`0050_vai_tro_nha_phat_trien.sql:9-10`](../../../db/migrations/0050_vai_tro_nha_phat_trien.sql#L9-L10), [`0057_vai_tro_kiem_soat.sql:9-10`](../../../db/migrations/0057_vai_tro_kiem_soat.sql#L9-L10) | EXISTS — xác nhận "không giả định chỉ còn 4 vai trò" của đề bài là đúng, hiện có 6 |
| F3 | Không có `core_usermeta` / `core_options` kiểu WordPress; cấu hình đơn vị hiện ở `tenant.settings` + registry (`registerModuleSettings`) | `grep -r "core_usermeta\|core_options"` → không có | MISSING (nhưng có thể không cần bảng mới — xem D-AUTH-01) |
| F4 | Thu hồi phiên: `users.session_version` (`sv` trong JWT) + `sessionStillValid()` kiểm mỗi request | [`packages/platform/src/core/security/session-state.ts:17-33`](../../../packages/platform/src/core/security/session-state.ts#L17-L33) | EXISTS — đã xác minh 2026-11-05: đổi `users.role` / khoá / đặt lại mật khẩu đều `bumpSession` (`apps/api/src/modules/access/access.service.ts` `updateUserIn`); đổi vai trò có hiệu lực ngay (AUTH-GRD-03 cho vai trò chính) <!-- [2026-11-05 06:27 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — F4 xác minh --> |

## 2. Permission catalog & role → permission

| # | Sự thật | `file:line` | Trạng thái |
|---|---|---|---|
| F5 | Danh mục quyền Core cố định trong mã (`PERMISSIONS` as const) + quyền module đăng ký runtime (`registerModulePermissions`) | [`packages/platform/src/core/auth.ts:35-90`](../../../packages/platform/src/core/auth.ts#L35-L90) | EXISTS — đã có "registry" ở mức tối thiểu, không phải MISSING như đề bài giả định |
| F6 | **`owner` tự động nhận MỌI quyền module** ngay khi module đăng ký (`role === 'owner' \|\| p.roles?.includes(role)`), không qua bước cấp nào | [`auth.ts:93-97`](../../../packages/platform/src/core/auth.ts#L93-L97) | **CONFLICT xác nhận** — đúng là vi phạm AUTHZ-03/AUTH-REG-02 của đề bài, có bằng chứng dòng cụ thể |
| F7 | Quyền tính **sống** ở mỗi request khi không có `claims.perms` trong JWT (không cache cứng) | [`auth.ts:189-191`](../../../packages/platform/src/core/auth.ts#L189-L191) | EXISTS — thu hồi quyền module gần như tức thời cho đa số phiên, tốt hơn giả định ban đầu của đề bài |
| F8 | Một số phiên đăng nhập qua "hệ thống quản trị" **chụp quyền vào JWT** (`claims.perms`) | [`auth.ts:188-191`](../../../packages/platform/src/core/auth.ts#L188-L191), [`security/tokens.ts:26`](../../../packages/platform/src/core/security/tokens.ts#L26) | PARTIAL — đường này cần cùng cơ chế `policyVersion`/`session_version` để thu hồi ngay (AUTHZ-15) |
| F9 | Quyền module có **risk cao bị chặn cho AI** (`isHighRiskPermission`) ở tầng action | [`packages/platform/src/core/actions.ts:392`](../../../packages/platform/src/core/actions.ts#L392) | EXISTS — AUTHZ-14 (AI không mượn quyền cao) đã có một phần, chỉ ở action, chưa chắc phủ route thô |

## 3. Module grant — mẫu đã có cho app ngoài tiến trình

| # | Sự thật | `file:line` | Trạng thái |
|---|---|---|---|
| F10 | `app_installations.permissions` = quyền **chụp từ manifest lúc kết nối, chủ đơn vị đồng ý** — mặc định rỗng, không tự có | [`db/migrations/0051_ung_dung_ngoai.sql:15-35`](../../../db/migrations/0051_ung_dung_ngoai.sql#L15-L35) | **EXISTS — đúng mẫu "module grant / default-deny" đề bài muốn**, nhưng chỉ áp cho `kind: "app"` (ngoài tiến trình), không áp cho `kind: "module"`/`"addin"` chạy trong cùng tiến trình |
| F11 | `module_registry` (cấp bản cài) + `tenant_modules` (cấp đơn vị, **không có dòng = bật**, tương thích ngược) | [`db/migrations/0052_registry_module.sql:1-10`](../../../db/migrations/0052_registry_module.sql#L1-L10) | EXISTS cho bật/tắt module; **MISSING** cho "cấp quyền" của module trong tiến trình (khác hẳn bật/tắt) |

## 4. Module SDK / manifest contract

| # | Sự thật | `file:line` | Trạng thái |
|---|---|---|---|
| F12 | `ModuleManifestLike` đã có `requires.capabilities[]` (capability **nền tảng/môi trường**, khác actor permission) | [`packages/module-sdk/src/manifest.ts:4-15`](../../../packages/module-sdk/src/manifest.ts#L4-L15) | EXISTS — đúng tách biệt §3.2 đề bài yêu cầu, không được gộp |
| F13 | Schema `permissions[]` của module: `{ key: <module>:<việc>, label, roles?, risk? }` | [`docs/contracts/BIZCITY-MODULE-v1.schema.json` — `properties.permissions`] | EXISTS |
| F14 | `defineWebModule`: menu/route/slot đều có `permission?: string`, kiểm tồn tại bằng `checkPerm` lúc build manifest | [`packages/module-sdk/src/web.ts:27,31,48,70,73,76`](../../../packages/module-sdk/src/web.ts#L27) | EXISTS |
| F15 | `defineAction`: **một `permission` bắt buộc mỗi action**, enforce server-side thật (`auth.permissions.has(def.permission)`), không chỉ ẩn UI | [`packages/platform/src/core/actions.ts:317,390`](../../../packages/platform/src/core/actions.ts#L317) | EXISTS — AUTHZ-05 (guard ở server, không chỉ menu) đã đúng hướng cho mọi action; route Fastify thô ngoài `defineAction` là nơi còn rủi ro (xem F16) |
| F16 | Route ghi thô ngoài `defineAction`: S014-13 (W6) đã đưa 195 route ghi vào `defineAction`, còn 17 route cố ý giữ có lý do (`// @bizcity-route:`), SC-ACT-1 chuyển `block` | [`docs/phases/PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md` dòng S014-13] | PARTIAL — 17 route còn lại cần liệt kê lại trong W3 (SC-AUTH-03) |

## 5. Tenant isolation / RLS (nền đã vững — không đụng lại)

| # | Sự thật | `file:line` | Trạng thái |
|---|---|---|---|
| F17 | RLS `FORCE` trên mọi bảng có `tenant_id` (84 bảng), chính sách `bizcity_tenant_visible` | PHASE-007, `tru-cot.json` pillar VII S-1 = `dat` | EXISTS — AUTH-GRD-03/TENANT_ISOLATION đã có nền; PHASE-028 **không sửa lại**, chỉ thêm scope *trong* một tenant (chi nhánh/kho/pháp nhân) |
| F18 | Chưa có `tenant_groups` (HO/kho tổng/cửa hàng cùng nhóm) | `tru-cot.json` pillar VII S-3/S-4 = `chua` | MISSING — đã có tiêu chí sẵn trong pillar VII, PHASE-026/028 cùng phụ thuộc, không làm trùng (xem D-AUTH-10) |

## 6. Scoreboard / HT10

| # | Sự thật | `file:line` | Trạng thái |
|---|---|---|---|
| F19 | `bizcity_pillars@1` (`tru-cot.json`) đã có **pillar VII "Cô lập đơn vị và phân quyền"** với S-1..S-4; `source: manual` hôm nay, chuyển dần sang `check` (ADR-0022 D026-6) | [`docs/standard/tru-cot.json` — pillar `VII`] | EXISTS — PHASE-028 **mở rộng pillar này** (thêm S-5..S-n), không mở `authz_compliance@1` song song (đề bài §8.2 cũng để ngỏ lựa chọn này) |
| F20 | S-2 "Phân quyền theo quyền, không theo chức danh" đang ghi `dat` | `tru-cot.json` pillar VII | **CẦN XEM LẠI SAU W1-W2** — đúng cho nghĩa hẹp (không string-match chức danh), nhưng chưa có multi-role/scope/Role Editor; không tự hạ điểm trong PR này (không phải người sở hữu bảng điểm quyết, xem D-AUTH-06) |

## 7. Mã trùng / va chạm cần tránh

| Mã | Đang dùng ở | Lưu ý |
|---|---|---|
| `HT10` | `apps/web/src/phan-he/he-thong/menu.ts` — màn **Trụ cột & mức đạt** | Không chiếm lại; Role Editor/Scoreboard mới đặt mã khác (đề xuất `HT12`, `HT13` — xác nhận với chủ trước khi code) |
| `ACC..`, `BH..`, `CK..`, `DM..`, `MH..` | Chỉ tồn tại trong **workbook TGS**, chưa có trong repo | Không phải mã đang chạy của open-ketoan; mapping ở 50-TGS-MAPPING chỉ là tài liệu đối chiếu, không tạo xung đột mã thật |
| `G1-06` (RBAC) | `docs/CONG-BO-KIEN-TRUC.md` — vừa sửa "một phần" ngày 05/11/2026 | PHASE-028 W1–W2 xong thì G1-06 chuyển "có"; không mở mã G mới trùng nghĩa |

## 8. Kết luận W0

- **Không cần dựng authz service mới.** Ba trụ cột đã có (`PERMISSIONS`/`registerModulePermissions`, `defineAction` guard, `app_installations` làm mẫu module-grant) đúng hướng đề bài; việc chính là **nối chúng lại** và bịt đúng 2 lỗ hổng cụ thể: (F6) owner auto-grant, (F11) module trong tiến trình không có bước cấp quyền.
- **Rủi ro cao nhất xếp theo mức độ:**
  1. F6 — owner tự động có mọi quyền module mới cài (P0, đổi hành vi hiện tại, cần chữ chốt + migration dữ liệu ghi nhận "tương thích ngược").
  2. F1 — một user một role (P0, đổi schema `users`, ảnh hưởng JWT claims, login, mọi nơi đọc `auth.role`).
  3. F18 — chưa có nhóm đơn vị (phụ thuộc chéo PHASE-026, không làm hai nơi).
  4. F16 — 17 route ghi thô còn lại (P1, danh sách hữu hạn, dễ đóng).
  5. F8 — JWT chụp quyền ở đường đăng nhập quản trị chưa có cơ chế thu hồi tức thời riêng (P1).
