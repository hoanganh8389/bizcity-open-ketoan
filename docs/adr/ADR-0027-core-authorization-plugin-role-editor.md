# ADR-0027 · Core Authorization Foundation: module grant mặc định cấm, nhiều role có phạm vi, Role Editor
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — ADR-0027: đề xuất từ đề bài chủ dự án 05/11/2026 (WordPress-style plugin ecosystem + User Role Editor + Accounting Kernel enforcement) -->

- Trạng thái: **Chấp nhận** <!-- [2026-11-05 06:27 PM Johnny Chu - Chu Hoàng Anh] ADR-0027 — chấp nhận, sửa D-AUTH-03 --> — chủ dự án (Johnny Chu) duyệt 2026-11-05: *"Đồng ý hướng đề xuất, Mở rộng users. thêm user_role_assignments. Không khai báo thì Default-deny cho mọi quyền module mới, riêng owner và các quyền cao, như super admin, admin thì ok."* — D-AUTH-01..10, **D-AUTH-03 theo bản sửa** dưới đây ([PHASE-028](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/README.md)).
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
| D-AUTH-03 | ~~Mặc định cấm mọi quyền module mới, kể cả `owner`.~~ **Bản chủ duyệt 2026-11-05:** quyền module không khai `roles` → mặc định cấm với mọi vai trò, **trừ tập vai trò quản trị cao `ADMIN_ROLES`** (`owner` hôm nay; `admin` nếu sau này thêm) vẫn tự có. `module_grants(tenant_id, module_key, permission_key, granted_by, granted_at)` (W2, nhân mẫu `app_installations.permissions`) là đường cấp thêm cho vai trò khác | Chủ đơn vị là người chịu trách nhiệm cao nhất của đơn vị; khoá cả họ khỏi module mình cài làm vận hành khó mà không thêm an toàn thật. Rủi ro còn lại (quyền `risk: high`) vẫn chặn AI / khoá API như cũ |
| D-AUTH-04 | ALLOW = UNION trong cùng scope của các role đang gán; DENY/SoD luôn thắng ALLOW | Khớp mô hình RLS/scope đã có, mở rộng tự nhiên xuống chi nhánh/kho |
| D-AUTH-05 | Đổi `users.role` phải bump `session_version` ngay (vá điểm hở revoke); EXPAND → BACKFILL → SHADOW CHECK → SWITCH cho các bước còn lại | Giữ login/JWT hiện tại hoạt động trong lúc chuyển |
| D-AUTH-06 | Mở rộng pillar VII có sẵn trong `tru-cot.json` (`bizcity_pillars@1`), không mở `authz_compliance@1` song song | Pillar VII đã đúng chủ đề "Cô lập đơn vị và phân quyền"; mở contract mới là trùng (R-KER-8) |
| D-AUTH-07 | `chief_accountant` giữ nguyên quyền Core; quyền **module** vẫn phải qua `module_grants` như mọi role, không có ngoại lệ | Tách rõ quyền Core (theo vai trò, giữ nguyên) khỏi quyền module (default-deny mới) |
| D-AUTH-08 | TGS mapping & 6 cờ chỉ dùng làm nguồn migration/test, không tự thành quyền thật khi chưa `BA_REVIEWED` | Tránh bản chụp Excel thành luật ngầm |
| D-AUTH-09 | Luồng MVP đầu tiên: **Warehouse transfer**, sau đó Purchase, Sales | Ít xung đột với các dòng giữ chỗ `feat/xuong-ca-dinh-danh`, `feat/phase-026-*` đang chạy trên `main` |
| D-AUTH-10 | Không làm nhóm đơn vị / cross-tenant ở phase này — tiêu chí S-3/S-4 của pillar VII do PHASE-026 sở hữu | Tránh hai phase cùng sửa một migration/contract (SC-PHASE-1) |
| D-AUTH-11 <!-- [2026-11-06 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — Phụ lục A: chủ duyệt phương án B --> | **Vai trò của đơn vị (tuỳ biến) tạo được ở PHASE-028, bước 1.** Bảng `tenant_roles` và `tenant_role_rules`; `user_role_assignments` thêm cột `tenant_role_id` (FK, cho phép NULL) — đúng một trong `role` (vai trò hệ thống) hoặc `tenant_role_id` | Role Editor cần tạo "Thu ngân", "Thủ kho"; `user_role_assignments.role` hiện chỉ nhận 6 vai trò hệ thống. Mở rộng bảng của W1, không thay (D-AUTH-01) |
| D-AUTH-12 | **Bước 1 chỉ Cho và Cấm**, quyền khai đích danh (Cho không dùng `*`; Cấm được dùng `*`). **Nới và điều kiện** (hạn sửa, người lập, hạn mức) ở bước 2, cùng lúc nối bộ tính vào đường yêu cầu (chế độ shadow trước) | Khớp mockup đã duyệt (tick quyền); điều kiện cần bộ tính chạy thật mới kiểm được. Cột `conditions` có sẵn nhưng chưa dùng ở bước 1 |
| D-AUTH-13 | **API quản trị dùng `users:write` tới hết W4**; chưa thêm quyền Core thứ 19 (`authz:manage`). Xem lại ở bước 2 | Thêm quyền Core làm lệch danh mục 18 quyền, vai trò mặc định, mockup và nhiều test; `users:write` đã là quyền rủi ro cao, đòi nhập lại mật khẩu khi cấp quyền cao |
| D-AUTH-14 | **`base_role` kế thừa một cấp.** Vai trò tuỳ biến dựa trên đúng một vai trò hệ thống **không thuộc `ADMIN_ROLES`**; không dựa trên vai trò tuỳ biến khác. Quyền hiệu lực = quyền của base ∪ luật Cho − luật Cấm (Cấm thắng, D-AUTH-04) | Tránh chuỗi kế thừa khó giải thích; chặn việc dùng base `owner` để lách D-AUTH-03 (quyền module tự có chỉ dành cho `ADMIN_ROLES`) |

Chi tiết từng wave, 12 mã kiểm SC-AUTH-01..12, checklist nghiệm thu: [00-MASTER-PLAN](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/00-MASTER-PLAN.md).

## Hệ quả

- **Tương thích ngược:** với D-AUTH-03 bản sửa, hành vi hôm nay giữ nguyên (`owner` có mọi quyền module; vai trò khác chỉ có quyền module khai `roles`) — W2 không phải backfill để tránh khoá đột ngột.
- Không đổi Ledger, không đổi `ledgerService`, không thêm cổng ghi sổ mới — quyền module chỉ quyết định actor được gọi action nào, Kernel vẫn là nơi duy nhất ghi sổ.
- Standard `bizcity_module@1` có thể cần trường tuỳ chọn mới ở W2 (tương thích VER-1, minor) — chốt cụ thể khi W2 mở PR tài liệu riêng.

## Phụ lục A — Vai trò của đơn vị (D-AUTH-11…14)
<!-- [2026-11-06 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — Phụ lục A: hình dạng hai bảng và thứ tự làm; chủ dự án duyệt phương án B và bốn đề xuất -->

Chủ dự án duyệt 2026-11-06: phương án B (vai trò của đơn vị = bộ luật, ra hai bước) cùng bốn đề xuất D-AUTH-11…14. Phụ lục này chốt hình dạng; **không đổi** D-AUTH-01…10.

### Hình dạng (phác, chốt chi tiết ở PR migration)

```sql
tenant_roles (id, tenant_id, code, label, kind, base_role NULL, is_active, version, created_by, created_at, updated_by, updated_at)
  -- code duy nhất theo đơn vị; base_role ∈ 6 vai trò hệ thống TRỪ ADMIN_ROLES; kind ∈ job | privilege | restriction
tenant_role_rules (id, tenant_id, tenant_role_id, permission, effect, conditions jsonb DEFAULT '{}', note, created_by, created_at)
  -- effect ∈ allow | deny (bước 1); permission là khoá đích danh, riêng deny được dùng *
user_role_assignments ADD COLUMN tenant_role_id NULL REFERENCES tenant_roles(id)
  -- CHECK: đúng một trong role / tenant_role_id; chỉ mục duy nhất đang mở của W1 mở rộng theo tenant_role_id
```

Cả hai bảng mới có `tenant_id`, bật và ép RLS (`bizcity_tenant_visible`), `COMMENT ON` mọi cột. Vai trò tuỳ biến đã có lần gán thì **vô hiệu** (`is_active = false`), không xoá — lịch sử gán giữ nguyên.

### Luật cứng (kiểm ở máy chủ, không chỉ ở giao diện)

1. Cho một quyền không có trong sổ quyền (code) hoặc đã `removed` → từ chối. Quyền đến từ code, không từ client.
2. Cấp đích danh quyền `risk: high` cho vai trò hoặc cho người → nhập lại mật khẩu của người thao tác.
3. Không tự gán vai trò cho chính mình; không thu hồi lần gán quản trị cuối cùng của đơn vị.
4. Mọi thay đổi vai trò, luật, lần gán ghi nhật ký (`audit_logs`, có lý do); sửa luật vai trò phải làm mất hiệu lực đệm quyền của người đang giữ vai trò đó. Cách vô hiệu đệm giữa các tiến trình (bộ đếm phiên bản theo đơn vị hay cách khác) chốt ở PR migration.
5. Quyền hiệu lực của người = vai trò chính ∪ vai trò bổ sung (W1) ∪ vai trò tuỳ biến còn hiệu lực hôm nay, theo phạm vi và mục đích của từng lần gán; Cấm của bất kỳ lần gán nào trong cùng phạm vi thắng.

### Thứ tự làm

| Bước | Việc | Điều kiện |
|---|---|---|
| 1 | Migration `tenant_roles`, `tenant_role_rules`, cột `tenant_role_id` | W1 đã merge (cùng sửa `user_role_assignments`, `schema-catalog.ts`); dòng giữ chỗ riêng |
| 2 | Lớp đọc vai trò tuỳ biến cho bộ tính (`core/authz`), chạy shadow so với đường cũ | bước 1 |
| 3 | API quản trị (vai trò, luật, lần gán, "Xem như", nhật ký) và module `phan-quyen` ở `modules/phan-quyen/` (ADR-0024, chỉ giao diện) | bước 2 |
| 4 | Nới, điều kiện, nối bộ tính vào `requirePermission` / `runAction` | shadow sạch (không cấp thừa) |

Chưa thuộc phụ lục này: khoá API và trợ lý AI nhận vai trò tuỳ biến (giữ phạm vi khoá như hôm nay); nhóm đơn vị (D-AUTH-10).

### Bỏ `module_grants` (chủ dự án chọn 2026-11-06)
<!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2: bỏ bảng module_grants, cấp quyền module = luật Cho của vai trò tuỳ biến (một nguồn sự thật); Q028-2 hết đối tượng -->

Cấp quyền module cho một nhóm người = luật **Cho** trên vai trò tuỳ biến (vd "Kế toán kho": base `accountant` + Cho `kho:xuat`) rồi gán vai trò đó. **Không** có bảng `module_grants` riêng: hai nơi cùng cấp quyền module là hai nguồn sự thật ([ADR-0028](ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md) LEAN-3). Chỗ D-AUTH-03 / D-AUTH-07 / `bizcity_authorization@1` §8 nhắc `module_grants` đọc là "luật Cho của `tenant_role_rules`". Hành vi hôm nay giữ nguyên: `ADMIN_ROLES` tự có quyền module, vai trò hệ thống có quyền module khai `roles` trong manifest. W2 chỉ **cấp thêm**, không bớt mặc định của manifest (bớt = luật Cấm, nối vào đường yêu cầu ở bước 4). Q028-2 (hạn của lần cấp) hết đối tượng: luật không có hạn, hạn nằm ở lần gán (`valid_to` của W1).

### Chữ chốt bước 1–2 (PHASE-028 W2 đợt 1)
<!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 1: chữ chốt migration vai trò của đơn vị + lớp đọc cho bộ tính (RULE-FLOW §3) -->

1. **Migration `0075_vai_tro_don_vi.sql`** (số theo `so-tiep-theo`; E2 giữ 0074). Đi sau W1 (sửa `user_role_assignments` của 0073).
2. **`tenant_roles`:** `code` dạng `^[a-z][a-z0-9_-]{1,39}$`, duy nhất theo đơn vị, không trùng 6 mã vai trò hệ thống. `kind` ∈ `job` · `privilege` · `restriction`. Loại `restriction` không có `base_role` (chỉ để Cấm). `base_role` ∈ `chief_accountant` · `accountant` · `viewer` · `developer` · `auditor` hoặc NULL (D-AUTH-14: không `owner`). **Bất biến** (trigger): `tenant_id`, `code`, `kind`, `base_role`, `created_*`. Đổi base hoặc loại = tạo vai trò mới (ECP-13: lần gán cũ vẫn trỏ đúng nghĩa cũ). Sửa được `label`, `is_active` kèm `version` = cũ + 1 và `updated_by` / `updated_at`. Không xoá: vô hiệu bằng `is_active = false`. Vai trò API không có `DELETE`.
3. **`tenant_role_rules`:** chỉ thêm. Gỡ luật bằng `removed_by` / `removed_at` / `remove_reason` đặt một lần (như W1), lịch sử luật giữ nguyên. Khoá ngoại ghép `(tenant_id, tenant_role_id)` nên luật không trỏ sang vai trò của đơn vị khác. `effect` ∈ `allow` · `deny`; `relax` để bước 4, CHECK chặn. Cho phải đích danh (`<a>:<b>`, không `*`); Cấm được dùng `*`. `conditions` là object, bước 1 phải là `{}` (CHECK). Một luật đang mở cho mỗi (vai trò, quyền, hiệu lực). "Quyền có trong sổ, chưa `removed`" (luật cứng 1) và "loại `restriction` chỉ có Cấm" kiểm ở API bước 3, vì CSDL không thấy sổ quyền của code.
4. **`user_role_assignments`** (bảng của W1): `role` bỏ NOT NULL, thêm `tenant_role_id`, CHECK đúng một trong hai. Khoá ngoại ghép `(tenant_id, tenant_role_id)`. Bộ bất biến của trigger W1 thêm `tenant_role_id`. Chỉ mục "một dòng đang mở" thay bằng bản tính cả `tenant_role_id`.
5. **Đệm (luật cứng 4):** `tenants.authz_version bigint`, tăng bằng **trigger** mỗi lần INSERT / UPDATE ở ba bảng trên (code không quên được). Lớp đọc trả số này làm `authzVersion` của bộ tính. Đệm 15 giây của W1 giữ nguyên tới bước 4.
6. **Lớp đọc** `packages/platform/src/core/authz/store.ts` (bước 2): `loadAuthzSnapshot(conn, tenantId, userId)` trả `{ authzVersion, roles, assignments }` theo `bizcity_authorization@1`.
   - Vai trò hệ thống lấy từ `legacy.ts`. Vai trò tuỳ biến có mã `tenant:<id>`, luật = Cho của `base_role` (tính từ code) + Cho + Cấm của đơn vị. Vai trò vô hiệu: `isActive = false`.
   - Lần gán = `users.role` (`legacyAssignment`) + các dòng của `user_role_assignments`. Phạm vi `tenant` đổi thành `all`, `branch` / `warehouse` giữ nguyên; mỗi dòng một mục đích.
   - Hàm thuần `tenantRoleToAuthz` tách riêng để test không cần CSDL.
7. **Chưa đổi quyền hiệu lực ở đợt này.** Yêu cầu vẫn tính quyền qua `auth.ts` như W1. `extraRoles` của W1 bỏ qua dòng `tenant_role_id`. Chưa có API tạo vai trò tuỳ biến (bước 3), nên giao diện không tạo được dòng "đăng ký mà không thi hành" (AUTHZ-16). Nối bộ tính (shadow trước) là bước 4.
8. **Test** (`apps/api/test/vai-tro-don-vi.test.ts`, CSDL test):
   - Trigger chặn: xoá vai trò, đổi `code` / `base_role`, sửa luật, xoá luật, `relax`, Cho có `*`, luật trỏ vai trò của đơn vị khác, lần gán có cả `role` lẫn `tenant_role_id`.
   - RLS cô lập đơn vị.
   - `authz_version` tăng ở mỗi lần ghi.
   - Lớp đọc + `authorize`: base ∪ Cho, Cấm thắng cả quyền của vai trò chính, vai trò vô hiệu không cấp, thu hồi lần gán có hiệu lực ngay.

### Chữ chốt bước 3 — API quản trị vai trò của đơn vị và thi hành Cho + Cấm (PHASE-028 W2 đợt 2)
<!-- [2026-11-06 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2: chữ chốt API quản trị + thi hành Cho / Cấm ở auth.ts (RULE-FLOW §3, đụng thứ dùng chung); chủ chọn thi hành luôn và confirmPassword -->

Chủ dự án chọn 2026-11-06: (a) thi hành luôn Cho + Cấm cho lần gán phạm vi cả đơn vị + mục đích `operate` (như W1), không để lần gán "đăng ký mà không thi hành" (AUTHZ-16); (b) nhập lại mật khẩu bằng trường `confirmPassword` trong thân yêu cầu. Chi nhánh / kho, mục đích khác, Nới, điều kiện, nối bộ tính đầy đủ vẫn ở bước 4.

1. **Quyền hiệu lực** (`core/auth.ts`, đường vé người dùng): `P = (quyền vai trò chính ∪ quyền các vai trò bổ sung W1 ∪ [nền + Cho] của mọi vai trò của đơn vị còn hiệu lực) − (mọi quyền khớp một luật Cấm của các vai trò của đơn vị còn hiệu lực)`. Cấm thắng cả quyền của vai trò chính (D-AUTH-04). Chỉ dòng `scope_type = 'tenant'` và `purpose = 'operate'`; vai trò vô hiệu (`is_active = false`) không cấp và không cấm. **Cấm không áp cho người có vai trò chính hoặc bổ sung thuộc `ADMIN_ROLES`** (chống khoá chủ đơn vị khỏi quản trị). Khoá API, khoá app, vé đăng nhập qua hệ thống quản trị (`claims.perms`): không đổi.
2. **Nguồn đọc:** mở rộng `extraRoles` của W1 thành một lần đọc trả `{ roles, allow, deny }` (vai trò hệ thống bổ sung, quyền Cho đích danh, mẫu Cấm), đệm 15 giây theo người dùng như hôm nay. Ghi vai trò / luật / lần gán trong tiến trình xoá đệm **của mọi người đang giữ vai trò đó** ngay; giữa các tiến trình, đệm cũ tối đa 15 giây (`authz_version` dùng ở bước 4 để bỏ khoảng này).
3. **API** (quyền `users:write`, `ai: 'deny'`, `mcp: false`, idempotency `natural`, mọi thay đổi `writeAudit` có lý do):

   | Việc | Action | Đường |
   |---|---|---|
   | Danh sách / chi tiết vai trò của đơn vị (kèm luật đang áp dụng, số người giữ) | — (đọc) | `GET /api/v1/roles`, `GET /api/v1/roles/:id` |
   | Tạo vai trò | `core.role.create` | `POST /api/v1/roles` |
   | Sửa tên, bật / tắt | `core.role.update` | `PATCH /api/v1/roles/:id` (kèm `version` hiện tại, sai → 409) |
   | Thêm luật | `core.role.rule-add` | `POST /api/v1/roles/:id/rules` |
   | Gỡ luật | `core.role.rule-remove` | `POST /api/v1/roles/:id/rules/:ruleId/remove` (lý do ≥ 3 ký tự) |
   | Gán vai trò của đơn vị | `core.user.role-assign` (mở rộng của W1: đúng một trong `role` / `tenantRoleId`) | `POST /api/v1/users/:id/roles` |
   | Thu hồi | `core.user.role-revoke` (W1, giữ nguyên) | như cũ |

4. **Luật cứng thi hành ở máy chủ** (ADR-0027 Phụ lục A, luật cứng 1–4):
   - Cho: quyền đích danh, **có trong sổ quyền của code** (`isKnownPermission`) và không `removed`. Cấm: mẫu phải khớp ít nhất một quyền đang biết. Loại `restriction` chỉ nhận Cấm.
   - **Chống leo thang:** người thêm luật Cho phải tự có quyền đó; người gán phải có mọi quyền của vai trò (nền + Cho). Cấm: không giới hạn.
   - **Nhập lại mật khẩu (`confirmPassword`, kiểm bằng `verifyPassword` của chính người thao tác)** khi thêm Cho quyền `risk: high`, hoặc gán vai trò của đơn vị đang có Cho quyền `risk: high`. Sai / thiếu → `VALIDATION`, không ghi gì.
   - Không tự gán cho chính mình (W1). Vai trò vô hiệu: không gán mới được; lần gán cũ còn nhưng không cấp gì.
   - Mã vai trò dạng `^[a-z][a-z0-9_-]{1,39}$`, nền ∈ năm vai trò không quản trị (CSDL cũng chặn).
5. **Danh mục quyền tra cho giao diện:** dùng `GET /api/v1/system/permissions` đã có; không tạo nguồn quyền thứ hai (client không gửi định nghĩa quyền).
6. **Chưa làm ở đợt này:** màn `modules/phan-quyen` (đợt 3, chỉ giao diện trên API này); "Xem như" người dùng; `authz_version` thay đệm; nối `core/authz` bộ tính vào `requirePermission` / `runAction` (bước 4).
7. **Test** (`apps/api/test/vai-tro-don-vi-api.test.ts`): tạo / sửa / vô hiệu; luật Cho đích danh và quyền lạ bị chặn; leo thang bị chặn; quyền cao đòi `confirmPassword`; gán → `/auth/me` có quyền Cho ngay trên vé cũ; Cấm bỏ được quyền của vai trò chính; owner không bị Cấm; thu hồi / gỡ luật / vô hiệu có hiệu lực ngay; đơn vị khác không thấy và không gán được; vai trò hệ thống không đổi hành vi (`vai-tro-bo-sung` vẫn xanh).
8. **Tệp dự kiến** (dòng giữ chỗ W2 đợt 2, thêm sau khi PR W2 đợt 1 nhả dòng hiện có): `packages/platform/src/core/auth.ts`, `packages/platform/src/core/security/role-assignments.ts`, `apps/api/src/modules/access/**` (thêm `tenant-role.service.ts`, `tenant-role.routes.ts`), `apps/api/test/vai-tro-don-vi-api.test.ts`, `apps/api/src/modules/system/schema-catalog.ts` (không đổi trừ khi cần), thư mục phase.


### Chữ chốt W4 — Role Editor (`modules/phan-quyen/`, PHASE-028 đợt 3)
<!-- [2026-11-06 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W4: chữ chốt Role Editor trên API W2 đợt 2; mở bằng ma trận (PHASE-030 22 đề xuất #7); mã màn HT12 (Q028-1) — chủ dự án sửa được trước khi code -->

Giao diện trên API đã có (W2 đợt 2: `/api/v1/roles`, `/roles/matrix`, `/users/:id/roles`, `/users/:id/effective-permissions`). Không thêm bảng, không thêm action ghi mới.

1. **Vị trí:** module `modules/phan-quyen/` (ADR-0024), **chỉ giao diện** — `bizcity.module.json` (không `data`, không `actions` riêng), `web/` (menu, route, màn), `README.md`, `AGENTS.md` theo khung `templates/starter-module/`. Màn chỉ import `@bizcity/ui-kit` và `react`. Menu "Phân quyền" dưới nhóm Hệ thống, **mã màn `HT12`** (chốt Q028-1; HT13 để trống cho việc sau), quyền xem màn: `users:write` (D-AUTH-13: chưa thêm quyền Core thứ 19).
2. **Ba thẻ trong một màn** (`/app/phan-quyen/…`):
   - **Ma trận** (mở mặc định): hàng = nhóm module × quyền (nhãn tiếng Việt từ sổ quyền), cột = vai trò (6 vai trò hệ thống, rồi vai trò của đơn vị), ô = **Có** · **Cấm** · **—**, quyền `risk: high` có nhãn. Cột vai trò hệ thống **chỉ đọc** (khoá). Bấm một ô của vai trò đơn vị → ngăn bên phải: luật đang áp dụng, nút Cho / Cấm / Gỡ, ô lý do. Ô của vai trò loại `restriction` chỉ có Cấm. Không có ô nào "tự tick đạt".
   - **Vai trò:** danh sách (số luật, số người giữ), tạo mới (mã, tên, loại, nền), đổi tên, vô hiệu / bật lại (gửi `version`, 409 → báo "vai trò đã đổi, tải lại").
   - **Người dùng:** bảng người dùng; chọn một người → **Xem như** (`effective-permissions`: quyền hiệu lực + nguồn: vai trò chính, bổ sung, nền, Cho, Cấm), lịch sử gán, gán / thu hồi vai trò hệ thống hoặc của đơn vị (lý do bắt buộc).
3. **Nhập lại mật khẩu:** khi thêm luật Cho quyền rủi ro cao hoặc gán vai trò có Cho quyền rủi ro cao, hộp thoại xin mật khẩu của người thao tác rồi gửi `confirmPassword`; giao diện **không lưu** mật khẩu (không state toàn cục, không localStorage), xoá ngay sau khi gửi.
4. **Máy chủ quyết, giao diện chỉ gợi ý:** nút bị ẩn / mờ theo `useCan()` chỉ là tiện; mọi luật (chống leo thang, quyền lạ, loại restriction) kiểm ở API và giao diện hiện lại thông báo lỗi nguyên văn của API. Không tính quyền ở máy khách ngoài việc vẽ ma trận từ dữ liệu API.
5. **`@bizcity/ui-kit` thêm `patch`** (`UiKitApi.patch`, `uiKitHost.ts` nối `api.patch` đã có ở `apps/web/src/lib/api.ts`) vì `core.role.update` là `PATCH`. Thay đổi tương thích ngược (thêm, không đổi). Đây là thứ dùng chung nên nằm trong chữ chốt này.
6. **Hướng dẫn:** `docs/huong-dan/phan-quyen.md` (SC-DOC-6 đòi một hướng dẫn cho mỗi mục menu): dùng ma trận, tạo vai trò, gán, Xem như, vì sao Cấm thắng, vì sao quyền cao đòi nhập lại mật khẩu.
7. **Kiểm:** `npx bizcity module check phan-quyen` ĐẠT; typecheck web; logic thuần của ma trận (gom nhóm, ô → hành động, nhãn) tách ở `web/lib/matrix.ts` và có test; `selfcheck --strict`, SC-DOC-6.
8. **Chưa làm ở W4:** phạm vi chi nhánh / kho trong màn gán (chờ W3 đợt 2), điều kiện của luật, thẻ "Nhật ký phân quyền" (đọc từ `audit_logs` — đề xuất riêng), nhập / xuất vai trò.

### Chữ chốt W3 đợt 2 — thi hành một đường và phạm vi (PHASE-028, S028-8)
<!-- [2026-11-06 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2: chữ chốt shadow + requireScope + khoá danh sách 17 route; giữ chỗ sau khi W2 đợt 2 nhả auth.ts và access/** -->

Dựa trên [PHASE-030 22 §3](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/22-DANH-GIA-GON-PHAN-QUYEN.md) (#7–#9) và `bizcity_authorization@1`. Làm theo thứ tự, mỗi mục một PR nhỏ được:

1. **Mười bảy route ghi thô: giữ và khoá danh sách, không "đóng" bằng ép qua `defineAction`.** Đã rà: đăng nhập (`/auth/login`, `/auth/wp-sso`), tự phục vụ (`change-password`, `logout-others`, `presence/ping`), vé app (`apps/*/ticket`, `ticket/exchange`), MCP (`/mcp`), kéo kết nối, ba route nạp mẫu mua hàng, hai route cài đặt mẫu in, `modules/:key/seed`. Có chủ đích và đã có chú thích `@bizcity-route:`. Việc W3: phép kiểm **SC-AUTH-03** — mọi route ghi có `preHandler` quyền, hoặc `defineAction`, hoặc chú thích `@bizcity-route:` có lý do; danh sách hữu hạn 17, thêm route thô ngoài danh sách → `block`. Không sửa bảy-mười route chạy.
2. **Shadow (bước 4a):** `core/authz/shadow.ts` — với yêu cầu của người dùng, sau khi `requirePermission` quyết theo `auth.ts`, tính lại bằng `authorize` (`loadAuthzSnapshot`, đệm theo `authz_version`) và **so sánh**; lệch ghi số đếm có nhãn (`bizcity_authz_shadow_total{result=match|only_legacy|only_engine}`) và một dòng nhật ký có mã, **không đổi quyết định**. Bật bằng cấu hình `bizcity.authz.shadow` (mặc định tắt, phạm vi đơn vị); chẩn đoán `AUTHZ_SHADOW_DIFF` báo lệch. Không chạm `defineAction` / `actions.ts` ở đợt này (đang có dòng khác giữ).
3. **Hạn xoá đường cũ (PHASE-030 22 #8):** sau hai tuần shadow sạch trên một đơn vị chạy thật thì `auth.ts` chỉ còn gọi `authorize`; việc đổi đó là PR riêng có chữ chốt riêng, **không** nằm trong đợt này.
4. **`requireScope(permission, resolver)`** (`core/authz/scope.ts`, thư viện — chưa gắn vào route nghiệp vụ): preHandler / hàm cho route có tài nguyên theo chi nhánh / kho. `resolver` lấy `branchId` / `warehouseId` **từ bản ghi ở máy chủ** (AUTHZ-11), không từ thân yêu cầu. Quyết: có quyền **toàn đơn vị** (đường `auth.ts`) **hoặc** `authorize` cho phép theo lần gán có phạm vi chứa tài nguyên. `scopeOf` cho báo cáo: `requested ∩ allowed`, rỗng là rỗng. Lần gán phạm vi `branch` / `warehouse` (`scope_type` đã có ở 0073): action gán của W1 nhận thêm `scopeType` + `scopeId` + `purpose`, kiểm chi nhánh / kho thuộc đơn vị; **không** cấp gì cho tới khi một route gọi `requireScope` (W5 gắn vào luồng chuyển kho, D-AUTH-09) — hộp thoại gán ghi rõ "áp dụng tại: luồng đã bật phạm vi". Vì tránh "đăng ký mà không thi hành" (AUTHZ-16) nên **chỉ mở trường phạm vi ở API khi W5 có ít nhất một route dùng `requireScope`**; trước đó W3 chỉ giao thư viện + test bằng route thử.
5. **Điều kiện còn 5, bỏ `relax`, bỏ ba điều kiện theo ngày / trạng thái** (PHASE-030 22 #1–#3, chủ đã đồng ý Q030-5 = B): sửa bộ tính + hợp đồng ở một PR **bộ tính** riêng (K2), không gộp với shadow.
6. **Test:** bất đẳng thức "engine không bao giờ cho thừa so với đường cũ" trên bộ vai trò × quyền (property test), shadow đếm đúng, `requireScope` từ chối khi tài nguyên ngoài phạm vi / thiếu vị trí (đóng an toàn), SC-AUTH-03 bắt route thô mới.


### Chữ chốt W5 đợt 1 — quyền theo chi nhánh ở cửa nạp chứng từ (PHASE-028, S028-10)
<!-- [2026-11-07 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 1: chủ chọn gắn requireScope vào cửa nạp Kernel (K3), luồng mẫu chuyển kho hai chiều (D-AUTH-09) -->

Chủ dự án chọn 2026-11-07. Đọc mã: phiếu chuyển kho hôm nay chỉ vào qua cửa nạp `POST /api/v1/documents` (mỗi chiều `out` / `in` là một chứng từ theo `branchCode` của chi nhánh làm phiếu); `/api/v1/trade-documents` mới có hợp đồng (`docs/api/13-phieu-nhap-tay.md`), chưa có ở máy chủ. Vì vậy điểm thi hành là cửa nạp.

1. **Điểm thi hành (K3):** hai route cửa nạp `POST /api/v1/documents` và `POST /api/v1/documents/batch` (`packages/kernel/src/modules/documents/document.routes.ts`) đổi `requirePermission('documents:write')` → `requireScope('documents:write', resolver)` (W3 đợt 2). Áp cho **mọi `docType`**, không riêng chuyển kho.
2. **Hành vi cũ giữ nguyên:** ai có `documents:write` toàn đơn vị (vai trò chính / bổ sung / vai trò đơn vị, đã trừ Cấm) qua như hôm nay, không tốn thêm truy vấn. Khoá API, khoá app: như cũ (chỉ đường toàn đơn vị). Chỉ người **không** có quyền toàn đơn vị mới đi đường phạm vi.
3. **Vị trí của chứng từ:** `branchCode` trong thân yêu cầu tra ra `branches.id` của **đơn vị đang đăng nhập** ở máy chủ. Mã không có trong đơn vị, hoặc thiếu `branchCode` → không có vị trí → từ chối (đóng an toàn). Với chứng từ mới chưa có bản ghi, chi nhánh trong thân yêu cầu chính là tài nguyên đang tạo; máy chủ chỉ tin nó sau khi tra được chi nhánh thật của đơn vị (AUTHZ-11).
4. **Lô:** mọi chứng từ trong lô phải nằm trong phạm vi; một chứng từ ngoài phạm vi → từ chối cả lô (FORBIDDEN, nêu `branchCode`), không nạp một phần.
5. **Chuyển kho hai chiều (TRANSFER_TWO_SIDES):** chiều xuất do chi nhánh gửi lập (`leg: 'out'`, `branchCode` = nơi gửi), chiều nhận do chi nhánh nhận lập (`leg: 'in'`, `branchCode` = nơi nhận). Người chỉ có phạm vi ở A lập được chiều xuất A → B nhưng **không** lập được chiều nhận ở B, và ngược lại. `toBranchCode` / `fromBranchCode` không cấp quyền gì.
6. **Gán có phạm vi:** `core.user.role-assign` nhận thêm `scopeType` (`tenant` mặc định · `branch`) và `scopeId` (id chi nhánh, kiểm thuộc đơn vị). Mục đích giữ `operate`. Kho (`warehouse`) chờ chứng từ mang mã kho ở cửa nạp — chưa mở. Lần gán `branch` **không** thành quyền toàn đơn vị (`extraAuthz` vẫn chỉ đọc dòng `tenant`); nó chỉ có tác dụng ở route gọi `requireScope` — hôm nay là cửa nạp. Màn HT12 (thẻ Người dùng) thêm chọn chi nhánh khi gán và cột phạm vi trong lịch sử gán.
7. **Chưa thuộc đợt này:** `core.document.submit` (`POST /api/v1/documents/submit`) là `defineAction`; bộ chạy action kiểm `documents:write` toàn đơn vị trước handler, sửa phải chạm `packages/platform/src/core/actions.ts` (đang có dòng khác giữ) — người chỉ có phạm vi chi nhánh dùng `POST /documents` cho tới khi đợt sau mở. Báo cáo / danh sách lọc theo `allowedScope`, phạm vi kho, `/api/v1/trade-documents`.
8. **Test** (`apps/api/test/authz-scope-intake.test.ts`): người có quyền toàn đơn vị không đổi; người chỉ có phạm vi A nạp được chứng từ ở A, bị từ chối ở B và khi thiếu / sai `branchCode`; chuyển kho hai chiều đúng như mục 5; lô lẫn chi nhánh bị từ chối cả lô; Cấm toàn đơn vị thắng phạm vi; thu hồi có hiệu lực ngay; khoá API như cũ; gán `branch` kiểm chi nhánh thuộc đơn vị.


### Chữ chốt W5 đợt 2 — thư viện phân quyền mẫu từ bảng TGS (PHASE-028, S028-10)
<!-- [2026-11-07 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 2: chủ dự án chọn đưa cả 28 nhóm vào repo làm thư viện phân quyền mẫu (open-ketoan là core init cho dev dựng ERP nội bộ); D-AUTH-08 giữ: không mã nào thành quyền thật khi chưa duyệt -->

Nguồn: "Bảng phân quyền tổng hợp TGS – 03.11.2026", trang "Chi tiết phân quyền". Đọc bằng máy: 1.618 dòng (chức năng × nhóm), **349 mã chức năng**, **28 nhóm**; cột "Số quyền được cấp" khớp số ô "Có" ở cả 1.618 dòng. Chủ dự án chọn 2026-11-07 đưa cả 28 nhóm vào repo (không phải dữ liệu cá nhân hay số liệu kế toán).

1. **Tệp (dữ liệu, không phải code)** ở `docs/standard/phan-quyen/`:
   - `tgs-nguon.csv` — bản gốc không sửa, để mọi người tự đối chiếu.
   - `tgs-ma-chuc-nang.json` — 349 mã: `code`, `names[]` (một mã có thể nhiều tên giữa các sheet), `kind` ∈ `function` · `report` · `import` · `flag` · `scope` · `condition`, `area` (khu: kế toán, bán hàng, mua hàng, kho, quỹ, danh mục, hệ thống…), `ops` (thao tác có nghĩa với loại đó), `mapsTo[]` (`op` → `permission`, `status` ∈ `core` · `module` · `de-xuat`), `confidence` ∈ `cao` · `vua` · `thap`, `verified` ∈ `chua-duyet` · `da-duyet` · `bo`, `notes[]` (trùng tên, đổi tên, lạ).
   - `tgs-nhom.json` — 28 nhóm: `code` (mã vai trò đơn vị, chữ thường không dấu), `label`, `sheet`, `baseRole` gợi ý, `grants` (mã chức năng → thao tác "Có" của bảng gốc, đã chuẩn hoá), `derived` (quyền Core / module suy ra qua `mapsTo` đã duyệt), `anomalies`.
   Sinh lại được bằng `node scripts/phan-quyen/tgs-anh-xa.mjs <csv>` — luật suy ra nằm trong script, không chỉnh tay JSON.
2. **Luật ánh xạ** (máy suy ra, người duyệt):
   - Tên bắt đầu `#` → `flag`: các cột Tìm / Thêm… vô nghĩa, cờ "Có ở bất kỳ ô nào" = được cấp. Cờ đã có quyền Core ghi rõ (`HT9` / `HT10` / `HT47` → `documents:bypass-date-lock`; `ACC3F` / `HT53` / `HT21` / `HT22` → `documents:edit-all`; `HT4` / `HT14` → `users:write`). Cờ "xem trên các kho" (`HT11`, `HT34`) → `scope`; "bị giới hạn thời gian xem" (`HT55`) → `condition` (`view_window_days`).
   - Báo cáo / sổ / bảng kê / phân tích → `report`: chỉ Tìm / In / Xuất có nghĩa (Thêm / Sửa / Xóa trên báo cáo bị bỏ, ghi vào `notes`). Tìm → `reports:read`.
   - `Import nhanh …` → `import`.
   - Còn lại → `function` (phiếu, danh mục): Tìm → `read`, Thêm → `create`, Sửa → `update`, **Xóa → `cancel` / `reverse`, không xoá thật** (ECP-13), In → `print`, Xuất → `export`. Hôm nay map thô vào quyền Core có sẵn (`documents:read` / `documents:write`, `catalog:read` / `catalog:write`, `ledger:read`); quyền chi tiết theo tài nguyên (vd `kho:phieu-chuyen-create`) ghi `status: de-xuat`, **chưa tồn tại** cho tới khi module khai trong manifest.
   - `confidence`: `cao` khi khớp đích danh (bí danh `tgs:*` đã có ở sổ quyền, hoặc báo cáo → `reports:read`); `vua` khi suy theo khu + loại; `thap` khi mã trùng / đổi tên / bất thường.
3. **Bất thường ghi lại, không tự sửa:** 4 mã một tên nhiều mã (`ACC3`/`ACC88`, `ACC79`/`AD22`, `BCAD31`/`BCAD77`, `ACC93`/`ACC93A`), 4 mã nhiều tên (`ACC6`, `ACC93A`, `ADHT1`, `BC34A`), 3 dòng có quyền mà không có Tìm (dòng 455, 609, 1603), 329 dòng báo cáo có Thêm / Sửa / Xóa. Người duyệt nghiệp vụ quyết.
4. **Nạp vào đơn vị (seeding):** `node scripts/phan-quyen/nap-vai-tro-tgs.mjs` gọi **API** (`POST /api/v1/roles`, `/roles/:id/rules`, như STD-PRE-3: không SQL): mỗi nhóm → một vai trò của đơn vị, nền `viewer`, luật Cho = `derived` (chỉ quyền **đang có** trong sổ quyền). Vai trò tạo ra **vô hiệu** (`is_active = false`, "bản nháp TGS") — **không ai có thêm quyền** cho tới khi quản trị viên xem ở HT12 và bật (D-AUTH-08: không mã nào thành quyền thật khi chưa duyệt). Quyền rủi ro cao trong `derived` đòi `confirmPassword` như mọi lần thêm luật (script hỏi một lần). Chạy lại không tạo trùng (mã vai trò đã có → bỏ qua, in ra).
5. **Phép kiểm SC-AUTH-04** (`tests/conformance/checks/authz/`): JSON đúng khuôn; 349 mã và 28 nhóm khớp CSV nguồn (sinh lại ra cùng kết quả); mọi `mapsTo` `status: core` trỏ quyền có trong `PERMISSIONS`; `derived` chỉ chứa quyền `core` / `module` của mã `da-duyet` hoặc `confidence: cao`; không mã nào `kind: report` map ra quyền ghi.
6. **Chưa thuộc đợt này:** khai quyền chi tiết (`de-xuat`) vào manifest các module; ánh xạ "Xóa" sang `reverse` của từng loại chứng từ; nhập lại khi TGS đổi bảng (so sánh hai bản — công cụ sau).
7. **Test:** `apps/api/test/phan-quyen-tgs.test.ts` — script nạp trên CSDL test tạo đúng 28 vai trò vô hiệu, luật chỉ là quyền có thật, người được gán vai trò bản nháp không có thêm quyền nào cho tới khi bật; chạy lại không trùng.
