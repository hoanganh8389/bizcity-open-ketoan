# PHASE-028 · 20 — Kiến trúc, dữ liệu, chuyển đổi
<!-- [2026-11-05 05:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W0: năm cổng, mô hình dữ liệu authz_*, cách tính quyền Cho / Nới / Cấm theo phạm vi, thu hồi theo authz_version, chuyển đổi EXPAND → RETIRE -->
<!-- [2026-11-09 Johnny Chu - Chu Hoàng Anh] PHASE-028 — đưa bản draft W0 (05/11) vào main, thêm §0 đối chiếu với mã W1–W5 -->

## 0. Đối chiếu với mã đã merge (2026-11-09, `origin/main` f02d5029)

> Tài liệu này là **kiến trúc đích** viết ở W0, trước khi chủ chốt [ADR-0027 Phụ lục A](../../adr/ADR-0027-core-authorization-plugin-role-editor.md). Khi lệch, **mã và Phụ lục A thắng**.

| Draft W0 (§1–§9) | Đã làm | Ghi chú |
|---|---|---|
| `authz_roles`, `authz_role_rules` | `tenant_roles`, `tenant_role_rules` (0075) | luật **Cho / Cấm**; **chưa có Nới (`relax`)** và `conditions` |
| `authz_assignments` (phạm vi `scopes[]`, `purposes[]`, `network`) | `user_role_assignments` (0073) + `tenant_role_id`; phạm vi **chi nhánh** một giá trị, `validFrom / validTo`, `reason` | phạm vi `org_unit` / kho, mục đích, mạng: chưa; `principal_kind` apikey / agent: chưa |
| `tenants.authz_version` tăng cùng giao dịch | ✅ bằng trigger (0075) | |
| `authz_audit` chỉ thêm | ghi vào nhật ký hiện có (lý do bắt buộc); **chưa có bảng `authz_audit`** và chưa có `decision_id` | |
| `authz_registry_seen` | sổ quyền trong code `core/authz/catalog.ts` (18 quyền Core: nhãn rủi ro / tài nguyên / thao tác, băm nghĩa) | chưa lưu bản chụp theo bản cài |
| `user_meta`, `tenant_options` | ☐ | chưa có chủ / chưa giữ chỗ |
| §4 `authorize(...)` | `core/authz` bộ tính + `requireScope`; thi hành **Cho + Cấm** ở `auth.ts` (chính ∪ bổ sung ∪ nền + Cho − Cấm; Cấm không áp cho vai trò quản trị cao) | `batchAuthorize`, `maskFields`, `scopeOf` đầy đủ: chưa |
| §7 chuyển đổi: DUAL-READ | ✅ shadow `core/authz/shadow.ts`, khoá `bizcity.authz.shadow` (mặc định tắt); `AUTHZ_SHADOW` trong draft **không phải tên thật** | SWITCH / RETIRE: chưa |
| §6 `tenant_owner` "không tự có quyền module mới" | **đổi** theo D-AUTH-03 bản sửa: `owner` / vai trò quản trị cao **vẫn tự có** quyền module | vai trò khác phải được Cho |
| `authz:manage` | không có; màn dùng `users:write` | T028-21 viết theo `authz:manage` cần đọc lại |


Quyết định gốc: [ADR-0027](../../adr/ADR-0027-core-authorization-plugin-role-editor.md). Hợp đồng: [BIZCITY-AUTHORIZATION-v1](../../contracts/BIZCITY-AUTHORIZATION-v1.md) (nháp).

## 1. Mô hình

```text
           MODULE / APP / AGENT ── manifest: permissions[] · menu · actions[] · app.scopes[]
                                      │ kiểm tĩnh (SC-CON-2, SC-AUTH-01..12)
┌───────────────────────── OPEN KẾ TOÁN CORE ─────────────────────────────────────┐
│ PLATFORM (điều khiển)                                                            │
│   users (đã có) · authz_roles · authz_role_rules · authz_assignments             │
│   sổ quyền trong code ─▶ authz_registry_seen (bản chụp) ─▶ Role Editor (HT12)    │
│   authz_audit (chỉ thêm) · tenants.authz_version                                 │
│ PLATFORM (thực thi)                                                              │
│   ① xác thực + RLS ─▶ ② authorize(người, quyền, tài nguyên, mục đích)             │
│   ─▶ ③ cấp cho module/app (ADR-0011) ─▶ ④ luồng chứng từ (workflow.ts)            │
│                                     │                                            │
│ KERNEL  ⑤ cửa nạp → kiểm chuẩn → luật định khoản → sổ cái chỉ thêm → outbox      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Cổng ② không biết sổ cái; cổng ⑤ không biết vai trò. Khoá kỳ, sổ chỉ thêm, đảo bút toán thay sửa là bất biến của ⑤ — **không quyền nào vượt** (kể cả `documents:bypass-date-lock` chỉ nới khoá *theo ngày nhập liệu*, không mở kỳ đã khoá).

## 2. Ba trục và điều kiện

| Trục | Câu hỏi | Nguồn |
|---|---|---|
| **Quyền** `<module>:<việc>` | làm gì | sổ quyền trong code |
| **Phạm vi** | ở đâu | nút `org_units` (cả cây con), `branches`, `warehouses`; `*` = toàn đơn vị |
| **Mục đích** | để làm gì | `operate` (lập, sửa, huỷ) · `approve` · `report` (xem số liệu) · `export` (xuất ra ngoài) |
| **Điều kiện** | khi nào | danh mục đóng trong code: `edit_window`, `doc_date_back`, `doc_date_forward`, `creator` (`self` / `branch` / `all`), `status`, `amount_max`, `view_window`, `respect_lock_date`, `step_up_minutes`, `source`, `work_hours`, `print_count`, `network` |

Kho **làm việc** và kho **xem báo cáo** = cùng kho, khác mục đích (HTsoft `tblUserKho` ↔ `tblUserKhoReport`; TGS `HT34`, `HT11`). Chuyển kho A → B: đầu xuất cần `kho:transfer-create` với phạm vi `operate` ở A; đầu nhận cần `kho:transfer-confirm` với phạm vi `operate` ở **B** — hai phép kiểm, hai tài nguyên.

## 3. Dữ liệu (EXPAND, migration số lấy bằng `scripts/so-tiep-theo.mjs migration` khi giữ chỗ W1b)

```text
tenants ──┬── users (đã có: id, role [dual-read], session_version, is_active)
          │      └──< authz_assignments >── authz_roles ──< authz_role_rules
          │                │ scopes[]: org_unit / branch / warehouse / *
          ├── authz_audit (chỉ thêm)
          ├── authz_registry_seen (theo bản cài, không tenant_id)
          ├── user_meta · tenant_options
          └── tenants.authz_version
```

| Bảng | Cột chính | Khoá / chỉ mục | RLS |
|---|---|---|---|
| `authz_roles` | `id`, `tenant_id`, `code` (`^[a-z][a-z0-9_-]*$`), `label`, `kind` (`system`/`job`/`privilege`/`restriction`/`personal`), `owner_user_id` (chỉ `personal`), `preset_key`, `preset_version`, `is_active`, `version`, `created_by`, `updated_by` | `UNIQUE (tenant_id, code)`; `personal` ⇒ `owner_user_id NOT NULL`; `system` không xoá (trigger) | `bizcity_tenant_visible` |
| `authz_role_rules` | `id`, `tenant_id`, `role_id`, `pattern` (`ke-toan:voucher-update`, `quy/*:read`, `*:print`), `effect` (`allow`/`relax`/`deny`), `conditions jsonb` (khoá thuộc danh mục §2, kiểm bằng zod), `note` | `(tenant_id, role_id)`; CHECK: `pattern` quyền `high` phải đích danh (kiểm ở app — CSDL không biết rủi ro) | có |
| `authz_assignments` | `id`, `tenant_id`, `principal_kind` (`user`/`apikey`/`agent`), `principal_id`, `role_id`, `scopes jsonb` (`[{kind:'org_unit',id,subtree:true},{kind:'branch',id},{kind:'warehouse',id},{kind:'all'}]`), `purposes text[]`, `valid_from`, `valid_to`, `network jsonb`, `reason`, `granted_by`, `source` (`manual`/`migration`/`sso`/`preset`), `revoked_at`, `revoked_by` | `(tenant_id, principal_kind, principal_id) WHERE revoked_at IS NULL`; thu hồi = ghi mốc, không xoá | có |
| `authz_audit` | `id`, `tenant_id`, `at`, `actor`, `action` (`role.create`/`rule.set`/`assign`/`revoke`/`preset.accept`/…), `target`, `before jsonb`, `after jsonb`, `reason`, `authz_version`, `decision_id` | chỉ thêm (trigger chặn UPDATE / DELETE, cùng cách `audit_logs`); không lưu mật khẩu / token | có |
| `authz_registry_seen` | `permission_id`, `module`, `risk`, `sensitive`, `version`, `hash`, `first_seen_at`, `last_seen_at`, `status` (`new`/`active`/`changed`/`removed`), `aliases text[]` | PK `permission_id`; theo bản cài như `module_registry` | không (cấp bản cài) |
| `user_meta` | `tenant_id`, `user_id`, `meta_key` (`^[a-z][a-z0-9_.]*$`), `value jsonb`, `schema_version`, `updated_at` | PK `(tenant_id, user_id, meta_key)` | có; người dùng chỉ đọc / ghi khoá của mình qua action `requireUser` |
| `tenant_options` | `tenant_id`, `namespace`, `option_key`, `value jsonb`, `schema_version`, `updated_by`, `updated_at` | PK `(tenant_id, namespace, option_key)` | có; mỗi namespace có schema đăng ký trong code; **không** ghi đè luật Kernel |
| `tenants.authz_version` | `bigint NOT NULL DEFAULT 0` | tăng trong cùng giao dịch với mọi thay đổi vai trò / luật / gán | — |

Quyền `ketoan_app`: `SELECT, INSERT, UPDATE` trên bảng gán / luật / vai trò; `INSERT, SELECT` trên `authz_audit`. Module (vai trò `mod_<key>_*`, ADR-0011 D4) **không** có quyền nào trên các bảng này (SC-AUTH-07).

`tenants.settings` giữ nguyên; chuyển dần khoá có schema sang `tenant_options` theo từng namespace khi có chủ (không chuyển hàng loạt).

## 4. Tính một lượt (cổng ②)

```text
authorize(principal, permission, { resource?, purpose = operate|report|export|approve, doc? }):
 0. principal lấy từ phiên tin cậy; tenant, branch, warehouse của tài nguyên tính ở SERVER từ resource
    (không lấy từ payload). Không tìm thấy tài nguyên trong đơn vị → DENY NOT_FOUND (không lộ tồn tại).
 1. quyền không có trong sổ, hoặc trạng thái 'new' / 'removed'                       → DENY PERM_UNKNOWN / PERM_NOT_GRANTED_YET
 2. lấy lần gán còn hiệu lực (valid_from ≤ now < valid_to, chưa thu hồi), purposes ∋ purpose,
    phạm vi chứa vị trí tài nguyên (cây con org_units theo path), network khớp
 3. lấy luật của các vai trò đó có pattern khớp; quyền high: chỉ luật ghi đích danh;
    principal_kind ∈ {apikey, agent} và quyền high                                     → DENY HIGH_RISK_DELEGATION
 4. có luật deny đủ điều kiện                                                          → DENY (lý do của luật)
 5. với mỗi luật allow (TRONG TỪNG lần gán, không trộn phạm vi giữa các lần gán):
       điều kiện = mặc định của quyền ⊕ điều kiện của luật ⊕ nới rộng nhất của các luật relax
                   khớp CÙNG lần gán / cùng phạm vi
       đủ điều kiện                                                                    → ALLOW
 6. không luật nào đạt                                                                 → DENY, lý do của luật gần đạt nhất
 trả { allowed, reasonCode, decisionId, authzVersion, matched: [{assignmentId, roleId, ruleId}], failed?: {condition, need, have} }
```

- `reasonCode` thuộc thư viện mã (`AUTHZ-*`, R-GATE-10); câu báo dựng từ mã + `failed`, vd "Chỉ sửa được phiếu lập trong ngày. Phiếu này lập ngày 04/11/2026."
- "Trong ngày" mặc định tính theo **giờ lập phiếu** (Phụ lục F §15) cho đơn vị mới; đơn vị đã bật khoá theo ngày chứng từ (`date-rules.ts`) giữ cách cũ.
- `batchAuthorize(principal, [permission…], context)` cho menu / nút: cùng hàm, một lần nạp gán + luật; **kết quả phải bằng gọi lẻ** (T028-18 so hai đường).
- `scopeOf(principal, permission, purpose)` → `{ all: true } | { branchIds, warehouseIds, orgUnitPaths }` để dựng điều kiện SQL **trước** phân trang, tổng, xuất. Route báo cáo: `requested ∩ allowed`; rỗng giao rỗng → trả rỗng, không lỗi (khác hôm nay: rỗng = tất cả).
- Quyền trường (`kho:cost-read`, `ban-hang:profit-read`): `maskFields(principal, rows, fields)` áp ở serializer của báo cáo và xuất, không ở giao diện.

### 4.1. Ví dụ

```text
ql-pt ── Kế toán quỹ (job)          @ org_unit Phú Thọ (cây con) · operate, report
      ── Chỉ xem báo cáo (job)      @ org_unit Yên Bái           · report
      ── Sửa phiếu cũ 3 ngày (privilege: relax quy/*:update {edit_window: 3d}) @ Phú Thọ · đến 2026-11-30
      ── Không huỷ chứng từ (restriction: deny *:cancel)          @ all
```

- Sửa phiếu thu lập 2 ngày trước ở chi nhánh Phú Thọ → ALLOW (allow của Kế toán quỹ, nới bởi privilege cùng phạm vi).
- Sửa phiếu thu ở Yên Bái → DENY: lần gán Yên Bái chỉ có mục đích `report`; không trộn với lần gán Phú Thọ.
- Huỷ bất kỳ phiếu nào → DENY (deny thắng).

## 5. Thu hồi và nhớ đệm

- Khoá đệm `(tenant, principal, authz_version)`; tiến trình giữ bản đã tính (gán + luật đã biên dịch). Đổi gì → tăng `tenants.authz_version` trong cùng giao dịch, outbox phát `bizcity.authz.changed {tenant, version}`; mọi tiến trình xoá đệm của đơn vị khi nhận. Chưa nhận được sự kiện: đọc `authz_version` mỗi yêu cầu (một truy vấn chỉ mục chính, cùng lúc kiểm `session_version`) — chậm nhất **một yêu cầu**, không 15 giây.
- Khoá / vô hiệu người dùng vẫn `bumpSession` như hôm nay.
- MCP, khoá API, subscriber nền dùng cùng `authorize`; subscriber chạy bằng định danh dịch vụ `agent:<module>.<subscriber>` có lần gán riêng (AUTHZ-14), không mượn quyền chủ đơn vị.

## 6. Vai trò mẫu

Bản đầy đủ và chủ ý: [45-CA-BANG-CHUNG §Vai trò mẫu](45-CA-BANG-CHUNG.md#vai-trò-mẫu). Nguyên tắc:

- 6 vai trò hệ thống hiện có giữ **đúng** quyền hôm nay (D7). Preset mới (`cashier`, `warehouse_keeper`, `cash_accountant`, `store_manager`, `regional_manager`, `integration_service`, `ai_assistant`…) là **mẫu**: đơn vị bấm "Dùng mẫu", xem danh sách quyền, ghi biên nhận → thành vai trò `job` của đơn vị, sau đó không tự đổi theo mẫu (nâng cấp mẫu → hiện diff, đơn vị tự chấp nhận).
- `chief_accountant`: toàn bộ nghiệp vụ kế toán trong phạm vi được gán; `period-reopen`, đảo sổ hàng loạt, `posting-rule` publish, xuất hàng loạt = privilege riêng, cấp đích danh.
- `tenant_owner`: quản trị đơn vị, người dùng, vai trò; **không** tự có quyền module mới, không vượt SoD; luôn còn ít nhất một người có `authz:manage` (đã có cho owner ở `access.service.ts:59`, mở rộng); không ai tự thêm quyền cho chính mình.

## 7. Chuyển đổi

| Bước | Việc | Điều kiện sang bước sau |
|---|---|---|
| EXPAND | tạo bảng, cột `authz_version`; mã mới chưa được gọi | migration lên / xuống chạy sạch trên CSDL thử |
| BACKFILL | 6 vai trò hệ thống + luật = `ROLE_PERMISSIONS`; mỗi `users.role` → một lần gán `all`, `operate+approve+report+export`, `source=migration`; khoá API: phạm vi khoá → vai trò `apikey_<scope>` | đếm: số gán = số người dùng hoạt động |
| DUAL-READ | mỗi yêu cầu tính cũ và mới, **dùng kết quả cũ**, ghi khác biệt — **đã làm**: `AUTHZ_SHADOW=1` (lúc khởi động), `AUTHZ_SHADOW_SAMPLE`; số đo `bizcity_authz_shadow_total{outcome}`; 50 chênh lệch gần nhất ở `GET /api/v1/system/permissions` → `shadow.recent` | 7 ngày (hoặc bộ test) không có ALLOW-mới-DENY-cũ; DENY-mới-ALLOW-cũ có giải thích BA ký |
| SWITCH | dùng kết quả mới; công tắc `AUTHZ_ENGINE=legacy` lùi được | test tương đương xanh |
| RETIRE | `users.role` thành cột suy ra (vai trò hệ thống đầu tiên); bỏ `ROLE_PERMISSIONS` khỏi đường chạy; WordPress chỉ xác thực | một bản phát hành không lỗi |

Lùi: trước RETIRE, xoá bảng mới không mất gì (`users.role` còn nguyên). Sau RETIRE, lùi bằng công tắc, dữ liệu gán giữ. Không bước nào đụng `ledger_*`.

## 8. Hiệu năng

- Nạp quyền một người: 1 truy vấn gán (chỉ mục `principal`), 1 truy vấn luật theo `role_id IN (…)`, biên dịch mẫu thành bảng tra; đệm theo `authz_version`.
- Menu: `batchAuthorize` một lần cho mọi `permission` của menu (≈ 300 mục) — không N+1.
- Báo cáo: `scopeOf` một lần, đẩy vào `WHERE branch_id = ANY($1)`; chỉ mục `(tenant_id, branch_id, …)` đã có ở bảng chứng từ (kiểm từng báo cáo ở W5).
- T028-18: 100 chi nhánh, 5 vai trò / người, 300 quyền menu — đo `batchAuthorize` p95 và thời gian báo cáo có / không lọc phạm vi; công bố số đo, không đặt ngưỡng trước khi đo.

## 9. Mô hình đe doạ (rút gọn)

| Đe doạ | Chặn bằng |
|---|---|
| Gửi `branchId` / `tenantId` của nơi khác | tài nguyên giải quyết ở server; RLS; T028-3 |
| Tự cấp quyền | `authz:manage` không cho sửa gán / luật của chính mình; quyền high cần người khác + xác thực lại |
| Nâng cấp module lén thêm quyền cao | quyền mới `new`; đổi `risk` treo luật; SC-AUTH-05/06 |
| Trợ lý AI / khoá API mượn quyền chủ | `principal_kind` ≠ user không nhận quyền high; MCP đã đòi xác nhận ghi |
| Xoá dấu vết đổi quyền | `authz_audit` chỉ thêm (trigger); gỡ module không xoá |
| Xuất vượt màn hình | xuất dùng cùng `scopeOf` + `maskFields` với báo cáo; T028-8 |
| Mất chủ đơn vị cuối | kiểm trước khi thu hồi gán cuối có `authz:manage` |
