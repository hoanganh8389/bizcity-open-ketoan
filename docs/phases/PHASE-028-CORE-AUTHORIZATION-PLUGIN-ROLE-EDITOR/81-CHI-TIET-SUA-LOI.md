# PHASE-028 · 81 — Chi tiết các chỗ sửa LÕI trong mã làm thử sau W5
<!-- [2026-11-09 09:00 PM kiennt] PHASE-028 — chi tiết từng chỗ sửa lõi (Platform, Kernel, hợp đồng, bộ kiểm) của 8 commit làm thử: trước / sau, vì sao, ai bị ảnh hưởng, hiệu năng, rủi ro, cách lùi, test — để chủ dự án / Nhóm Lõi chốt (R-FLOW-2) -->

> Đi kèm [80-DE-XUAT-SAU-W5](80-DE-XUAT-SAU-W5.md). Mã nằm ở các nhánh cục bộ (chưa đẩy); mã commit ghi ở cột "Commit". Đọc trên `main` @ `6b295c15`.
> **Không có migration nào.** Không đổi lược đồ CSDL, không đụng `ledger_*`, định khoản, khoá kỳ. Mọi thay đổi lõi nằm ở đường quyết định quyền và cửa nạp chứng từ.

## 0. Tổng quan

| Khu | Tệp | Dòng (+/−) | Commit | Mức (RULE-FLOW §3) |
|---|---|---|---|---|
| Platform — quyền | `packages/platform/src/core/auth.ts` | +94 / −8 | `638b209f`, `b764fd72`, `d8f7fb7a`, `397e8210` | K2 — đường quyết định quyền của mọi yêu cầu |
| Platform — phiên / đệm | `core/security/session-state.ts`, `core/security/role-assignments.ts`, `core/security/tokens.ts`, `config/env.ts` | +36 / −6 | `b764fd72` | K2 |
| Platform — bộ tính | `core/authz/engine.ts`, `types.ts`, `catalog.ts`, `store.ts`, `shadow.ts`, `index.ts` | +56 / −52 | `b764fd72`, `18560aa0`, `d8f7fb7a` | K1 (bộ tính chạy shadow, chưa quyết định) |
| Platform — số đo | `core/metrics.ts` | +2 | `b764fd72` | K0 |
| Platform — ký chứng từ | `documents/signature.routes.ts` | +13 / −7 | `638b209f` | K2 |
| Kernel — cửa nạp / danh sách | `packages/kernel/src/modules/documents/document.routes.ts`, `document.repository.ts` | +110 / −18 | `18560aa0`, `d8f7fb7a`, `397e8210` | **K3** — cửa nạp chứng từ |
| Hợp đồng | `docs/contracts/BIZCITY-AUTHORIZATION-v1.md` | +19 / −9 | `18560aa0`, `d8f7fb7a`, `397e8210` | hợp đồng dùng chung |
| Bộ kiểm | `tests/conformance/baseline.json`, `checks/action/action.check.mjs`, `checks/authz/authz.check.mjs`, fixture + `expect.json` | +56 / −63 | `638b209f`, `83367f15`, `d8f7fb7a`, `397e8210` | phép kiểm chặn mới (RULE-QUALITY-GATE) |
| Cấu hình | `.env.example` | +3 | `b764fd72` | — |

## 1. `core/auth.ts` — đường quyết định quyền

### 1.1 `scopePermissions(scopes)` (mới, `638b209f`)

- **Trước:** bảng `SCOPE_PERMISSIONS` (phạm vi khoá API → quyền) chỉ dùng lúc xác thực khoá; lúc tạo khoá không ai đối chiếu.
- **Sau:** hàm công khai trả tập quyền một bộ phạm vi khoá mang theo (cùng bảng, kèm quyền kéo theo — 1.4). `access.service.createKeyIn` dùng để đòi người tạo có đủ các quyền đó.
- **Vì sao:** F2 — người có `users:write` tạo được khoá `documents:write` (kéo theo `documents:edit-all`, rủi ro cao) dù bản thân không có.
- **Ảnh hưởng:** chỉ lúc **tạo** khoá mới; khoá đã có không đổi. Người không phải owner tạo khoá vượt quyền → 403.
- **Lùi:** bỏ lời gọi ở `createKeyIn`.
- **Test:** `vai-tro-don-vi-api.test.ts` "F2: khoá API không mang quyền người tạo không có".

### 1.2 Kiểm phiên không đệm + `authz_version` (`b764fd72`)

- **Trước:** `sessionStillValid(userId, sv)` đọc `users.session_version / is_active`, **đệm 15 giây mỗi tiến trình**; `extraAuthz(userId)` (vai trò bổ sung + vai trò đơn vị) cũng đệm 15 giây. Khoá tài khoản / đổi vai trò / đổi luật ở bản API A tới 15 giây sau bản B mới biết.
- **Sau:** `authenticate` gọi `checkSession(userId, sv)` — **một truy vấn khoá chính** `users ⋈ tenants`, không đệm, trả `{ valid, authzVersion }`; rồi `extraAuthz(userId, db, authzVersion)` dùng lại đệm chỉ khi **cùng `tenants.authz_version`** (trigger 0075 tăng số này ở mọi lần ghi `tenant_roles` / `tenant_role_rules` / `user_role_assignments`) và cùng ngày.
- **Vì sao:** thu hồi có hiệu lực từ yêu cầu kế tiếp ở **mọi** bản API (draft W0 20 §5; 80 §6).
- **Hiệu năng:** thêm **một truy vấn khoá chính mỗi yêu cầu có vé người dùng** (trước: một truy vấn / 15 giây / người). Khoá API không đổi. Cần đo trên tải thật trước khi bật ở đơn vị lớn.
- **Rủi ro:** thấp — cùng dữ liệu, chỉ bỏ đệm; nếu `tenants` không đọc được thì vé bị từ chối (đóng an toàn).
- **Lùi:** đổi lại `sessionStillValid` ở `authenticate` (hàm cũ vẫn còn, chưa xoá).
- **Test:** "khoá tài khoản ở bản API khác chặn vé ngay", "đổi luật ở bản API khác có hiệu lực ngay" (ghi thẳng CSDL, không xoá đệm).

### 1.3 Sổ đăng ký loại chứng từ (`d8f7fb7a`, `397e8210`) — D-AUTH-19

- **Trước:** cửa nạp và các route chứng từ chỉ biết quyền Core (`documents:read` / `documents:write`); phân hệ không có cách khai "loại phiếu của tôi cần quyền gì".
- **Sau:** thêm vào `auth.ts`:

  | Hàm | Làm gì |
  |---|---|
  | `registerDocumentType(docType, { read?, create?, cancel?, export? })` | phân hệ đăng ký quyền theo thao tác cho loại chứng từ của mình (gọi ở `phan-he/<key>/index.ts`). Quyền phải là quyền module `<module>:<việc>` (khai ở `permissions[]` manifest), không được trùng quyền Core; đăng ký trùng khác giá trị → lỗi khởi động |
  | `registerDocumentPermission(docType, p)` | lối tắt cho `create` |
  | `documentPermissionOf(docType, op)` | quyền cần cho thao tác: quyền chi tiết nếu đã đăng ký **và có trong sổ quyền** (phân hệ đang bật), không thì quyền Core của thao tác (`DOCUMENT_OP_BASE`: read → `documents:read`, create / cancel → `documents:write`, export → `reports:read`) |
  | `documentTypesWith(op)` | các loại có quyền riêng đang hiệu lực (để lọc danh sách) |
  | `canDocument(auth, docType, op)` | người này làm được thao tác trên loại đó không (theo tập quyền đã tính) |

- **Vì sao:** "18 quyền chưa chi tiết tới nghiệp vụ"; phân hệ đăng ký kiểu hook (như WP) thay vì viết cứng trong lõi.
- **Ghi chú thiết kế:** sổ hiện **trong bộ nhớ**, nằm trong `auth.ts` (+~80 dòng). Draft W0 định đăng ký qua SDK (`registerAction` / `registerMenu`) và có bản chụp sổ quyền trong CSDL (`authz_registry_seen`). Đề xuất tách ra `core/authz/doc-types.ts` khi chốt — không đổi hành vi.

### 1.4 Quyền kéo theo (`d8f7fb7a`, `397e8210`) — **D-AUTH-24, cần chủ duyệt**

- **Trước:** quyền module chỉ đến tay vai trò khai trong `roles` của manifest (D-AUTH-03); không có quyền nào "kéo theo" quyền khác.
- **Sau:**
  - `registerDocumentType` ghi lại: quyền Core của thao tác **kéo theo** quyền chi tiết (vd `documents:write` → `ban-hang:hoa-don-lap`).
  - `withImplied(set)` thêm quyền kéo theo (chỉ quyền đang có trong sổ). Áp ở: `rolePermissions(role)`, `effectivePermissionsWithTenantRoles` (**sau** khi cộng Cho, **trước** khi trừ Cấm), quyền khoá API / khoá app, quyền trong vé SSO, `scopePermissions`.
  - **Cấm quyền gốc phủ quyền kéo theo:** `impliersOf(p)`; trong `effectivePermissionsWithTenantRoles` một quyền bị trừ khi mẫu Cấm khớp chính nó **hoặc** khớp quyền gốc của nó.
- **Vì sao:** để khi phân hệ đăng ký quyền chi tiết, **không ai mất quyền**: kế toán, khoá API của hệ thống bán hàng, phiên SSO đang ghi được chứng từ vẫn ghi được mọi loại. Và để luật Cấm `documents:*` đơn vị đang dùng **không bị lách** (test bắt được lỗi này giữa chừng).
- **Lệch thiết kế:** nới cách hiểu D-AUTH-03 — kế toán có sẵn quyền phân hệ mới (loại chứng từ) mà không ai cấp. Phương án thay nếu không duyệt: bỏ kéo theo, khai `roles: ["chief_accountant", "accountant", …]` cho từng quyền trong manifest, và cấp riêng cho khoá API / SSO.
- **Ảnh hưởng thấy được:** `/auth/me` trả thêm các quyền chi tiết (giao diện dùng để ẩn / hiện); `apps/ticket/exchange` **không** đổi (chỉ báo quyền Core như cũ — `apps.service.ts`).
- **Test:** "kế toán có sẵn mọi quyền chứng từ chi tiết", "Cấm ban-hang:*…", "Cấm documents:* vẫn chặn mọi loại phiếu", "khoá API documents:write vẫn nạp mọi loại phiếu".

## 2. `core/security/*`, `tokens.ts`, `env.ts` (`b764fd72`)

| Tệp | Trước | Sau |
|---|---|---|
| `session-state.ts` | `sessionStillValid` đệm 15 giây | thêm `checkSession` (1.2); hàm cũ giữ nguyên |
| `role-assignments.ts` | `extraAuthz(userId, conn)` đệm 15 giây | thêm tham số `authzVersion`: có thì đệm đúng khi cùng version và cùng ngày; không truyền → như cũ |
| `tokens.ts` | `signSession(claims)` sống `JWT_TTL_HOURS` (12) | `signSession(claims, { ttlHours? })` |
| `config/env.ts`, `.env.example` | — | `WP_SSO_TTL_HOURS` (mặc định 2) cho phiên mở bằng vé hệ thống quản trị |

- **Ảnh hưởng:** người dùng mở kế toán từ WP bị đăng xuất sau 2 giờ (mở lại từ WP là vào), vì quyền trong vé không theo kịp thay đổi bên WP. Đặt `WP_SSO_TTL_HOURS` để đổi.
- **Vé SSO một lần** nằm ở `apps/api/src/modules/auth/wp-sso.ts` (nhớ băm chữ ký tới khi vé hết hạn, trong tiến trình) — không phải lõi nhưng đi cùng đợt.

## 3. Bộ tính `core/authz/*`

### 3.1 Bỏ Nới, điều kiện 8 → 5 (`18560aa0`) — **đã có chữ chốt** (ADR-0027 W3 đợt 2 mục 5)

| Tệp | Đổi |
|---|---|
| `types.ts` | `AUTHZ_EFFECTS` còn `allow`, `deny`; `AuthzConditions` / `AUTHZ_CONDITION_KEYS` còn `edit_window_days`, `creator`, `amount_max` (hạn mức duyệt cá nhân), `view_window_days`, `step_up_minutes` |
| `engine.ts` | bỏ `widen` và nhánh relax trong `explain`; `checkConditions` bỏ `status_in`, `doc_date_back_days`, `doc_date_forward_days` (giữ `view_window_days`) |
| `index.ts` | bỏ xuất `widen` |
| Hợp đồng | `bizcity_authorization@1` lên **1.1.0-draft**: bỏ relax, bảng điều kiện còn 5, ghi rõ hạn theo ngày chứng từ thuộc `dataLock`, trạng thái thuộc workflow |

- **Ảnh hưởng thực tế:** không — bộ tính đang chạy shadow; CSDL (0075) vốn đã chặn `relax` và ép `conditions = '{}'`.
- **Test:** `authz-engine.test.ts` (đặc quyền "sửa 3 ngày" là một Cho có điều kiện rộng hơn, chỉ trong phạm vi của nó).

### 3.2 Kéo theo trong bộ tính (`d8f7fb7a`)

| Tệp | Đổi |
|---|---|
| `types.ts` | `AuthzPermissionDef.impliedBy?: string[]` |
| `catalog.ts` | `codePermissions()` điền `impliedBy` cho quyền chi tiết (từ `impliersOf`) |
| `engine.ts` | `ruleCovers`: luật Cấm khớp quyền gốc (`impliedBy`) cũng phủ quyền kéo theo |
| `store.ts` | vai trò đơn vị có Cho `documents:write` → thêm luật Cho cho các quyền kéo theo (cùng luật với `auth.ts`) |

- **Vì sao:** shadow so bộ tính với đường cũ — hai bên phải cùng luật, không thì sinh lệch giả.

### 3.3 Số đo shadow (`b764fd72`)

| Tệp | Đổi |
|---|---|
| `shadow.ts` | đếm theo đơn vị (`shadowStats(tenantId)`), mỗi lần đếm tăng `bizcity_authz_shadow_total{result}` |
| `metrics.ts` | khai counter `authzShadow` (nhãn `result` — tập nhỏ cố định, R-OBS-4) |

- Đọc qua `GET /api/v1/system/authz-shadow` (`users:write`, chỉ số và lệch của đơn vị mình). Đây là số liệu để quyết chuyển hẳn sang bộ tính (ADR-0027 W3 đợt 2 mục 3).

## 4. `documents/signature.routes.ts` — ký chứng từ (`638b209f`)

| | Trước | Sau |
|---|---|---|
| Quyền action ký / huỷ chữ ký | `documents:read` (action **ghi** gác quyền đọc) | `documents:write` |
| Ô kế toán trưởng | `auth.role === 'chief_accountant' \|\| 'owner'` | có quyền `periods:lock` |
| Ô giám đốc | `auth.role === 'owner'` | có quyền `payments:approve-final` |
| Huỷ chữ ký người khác | `auth.role === 'owner'` | có quyền `payments:approve-final` |

- **Vì sao:** F3, F4 — kiểm theo tên vai trò đi vòng phân quyền (vai trò đơn vị không cấp được, Cấm không chặn được).
- **Người ký thực tế không đổi** (hai quyền đó đúng là chỉ kế toán trưởng / chủ đơn vị có), nhưng giờ: vai trò đơn vị Cho `periods:lock` ký được ô kế toán trưởng; kế toán trưởng bị Cấm `periods:lock` không ký được.
- **Lệch thiết kế (D-AUTH-26):** ánh xạ tạm vì D-AUTH-13 chưa cho thêm quyền Core (`documents:sign-chief`…).
- **Test:** "F4: ô kế toán trưởng / giám đốc ký theo quyền", `signatures.test.ts` (giữ nguyên, đạt).

## 5. Kernel — `document.routes.ts`, `document.repository.ts` (**K3**)

### 5.1 Cửa nạp `POST /api/v1/documents`, `/batch` (`18560aa0`, `d8f7fb7a`)

- **Trước:** `preHandler: requireScope('documents:write', branchesOfDocs)` — một quyền cho mọi loại phiếu; vị trí = chi nhánh của phiếu.
- **Sau:** `preHandler: requireDocumentScope(docsOf)`:
  1. Mỗi chứng từ → quyền `documentPermissionOf(docType, 'create')`; lô rỗng → `documents:write`.
  2. Có mọi quyền đó **toàn đơn vị** → qua ngay (**không truy vấn thêm** — đường nóng của khoá API / kế toán giữ nguyên chi phí).
  3. Không thì nhóm theo quyền, mỗi nhóm `requireScope(quyền, vị trí)` — **mọi** chứng từ phải qua; lô lẫn loại / lẫn chi nhánh không được phép → từ chối **cả lô**.
- **Vị trí** (`branchesOfDocs`): chi nhánh như cũ, **thêm kho** (D-AUTH-25): phiếu có hàng (`sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`, `stock_adjustment`) → một vị trí cho mỗi kho của dòng hàng (trống = kho mặc định của chi nhánh, cùng luật `defaultWarehouseOf` lúc ghi kho); kho không thuộc chi nhánh → vị trí rỗng (đóng an toàn); phiếu không có hàng → chỉ chi nhánh. Chuyển kho: kho **xuất**.
- **Ai bị ảnh hưởng:** chỉ người **không** có quyền toàn đơn vị (lần gán theo chi nhánh / kho, hoặc chỉ có quyền chi tiết) và người bị Cấm một loại phiếu.
- **Không đổi:** dịch vụ nạp (`documentService.ingest*`), bể chờ, định khoản, ghi sổ.
- **Rủi ro:** ánh xạ loại → quyền sai thì chặn nhầm kế toán (đã có test kế toán / khoá API vẫn nạp mọi loại); thêm truy vấn kho / kho mặc định cho người theo phạm vi.
- **Lùi:** đổi lại `requireScope('documents:write', branchesOfDocs)`.

### 5.2 Xem: `GET /documents`, `/:id`, `/:id/preview` (`397e8210`)

- **Trước:** `requirePermission('documents:read')`; thấy mọi loại phiếu.
- **Sau:** `requireDocumentRead()` (có `documents:read` **hoặc** quyền xem của ít nhất một loại đã đăng ký). Danh sách lọc theo `readableTypes(auth)`: có `documents:read` → **bỏ** loại bị Cấm xem (`excludeDocTypes`); không có → **chỉ** loại có quyền xem (`onlyDocTypes`, rỗng = không thấy gì). Chi tiết / xem trước phiếu thuộc loại không được xem → **404** (không lộ phiếu tồn tại).
- `document.repository.ts`: `DocumentListFilter` thêm `excludeDocTypes`, `onlyDocTypes` (máy chủ đặt, không nhận từ client).
- **Chưa phủ:** sổ cái, sổ nhật ký, báo cáo, lịch sử chứng từ, nhật ký định khoản vẫn thấy mọi loại.

### 5.3 Huỷ: `POST /documents/cancel` (`397e8210`)

- **Trước:** action gác `documents:write`.
- **Sau:** vẫn gác `documents:write`, **thêm** kiểm `canDocument(auth, doc_type, 'cancel')` theo loại của phiếu → Cấm `ban-hang:hoa-don-huy` chặn được người có `documents:write`.
- **Giới hạn:** chỉ **hạn chế thêm**, chưa cấp được "chỉ huỷ phiếu kho" cho người không có `documents:write` (đổi cổng action ghi sang quyền yếu hơn chính là lỗi F3).

## 6. Hợp đồng `bizcity_authorization@1` → 1.1.0-draft

| Mục | Đổi |
|---|---|
| §3 Mô hình | `hiệu lực = allow | deny`; quy tắc 3 "Nới = thêm một Cho rộng hơn" |
| §3a (mới) | quyền kéo theo, đăng ký loại chứng từ đủ bộ thao tác, Cấm quyền gốc phủ quyền kéo theo, giới hạn "huỷ / xem hôm nay là hạn chế thêm" |
| §4 | Cho / Nới → chỉ Cho |
| §5 | điều kiện còn 5; `amount_max` = hạn mức duyệt cá nhân; câu "không có điều kiện theo ngày chứng từ / trạng thái" |

## 7. Bộ kiểm

| Tệp | Đổi | Ghi chú |
|---|---|---|
| `baseline.json` | bỏ 12 nợ SC-API-3 (route đã khai bảo vệ) | đổi baseline → cần duyệt theo RULE-QUALITY-GATE |
| `checks/action/action.check.mjs` | SC-API-3 nhận `requireDocumentScope(`, `requireDocumentRead(` là khai quyền | |
| `checks/authz/authz.check.mjs` | **SC-AUTH-11 mới, mức chặn**: quyền khai ở `permissions[]` phải có chỗ chặn ở máy chủ (action / route / workflow trong thư mục phân hệ, trừ `web/`); chỉ có ở web → `web-only`; không ai kiểm → `orphan` | phép kiểm chặn mới — cần duyệt; mã SC-AUTH-11 lấy theo bảng 70 (phần "quyền mồ côi") |
| `fixtures/authz-bad/modules/x/*`, `expect.json` | ca tự kiểm SC-AUTH-11 (2 phát hiện mong đợi) | `selfcheck --self-test` ĐẠT |

## 8. Thay đổi hành vi nhìn thấy từ ngoài (tóm lại)

| Ai / cái gì | Trước | Sau |
|---|---|---|
| Người có `users:write` không phải owner | tạo / nâng owner, đặt lại mật khẩu owner, tạo khoá vượt quyền | 403 |
| Khoá API / app gọi `GET /system/schema` | được | 403 |
| Đăng nhập sai liên tục | không giới hạn | 429 sau 10 lần / tài khoản, 50 / IP, 30 vé SSO / IP trong 15 phút (đếm trong tiến trình) |
| Vé SSO | dùng lại được trong 5 phút; phiên 12 giờ | một lần; phiên 2 giờ |
| Khoá tài khoản / đổi luật | tới 15 giây | yêu cầu kế tiếp |
| `/auth/me` | quyền Core + module | thêm quyền chứng từ chi tiết (kéo theo) |
| Danh sách / chi tiết chứng từ | thấy mọi loại | bỏ loại bị Cấm xem; chi tiết 404 |
| Huỷ, bảng kê bán hàng | theo quyền Core | thêm quyền theo loại (Cấm được) |
| Người chỉ được gán theo chi nhánh / kho | nạp được ở chi nhánh | nạp được ở chi nhánh **hoặc kho** được gán, theo quyền của loại phiếu |
| Ký ô kế toán trưởng / giám đốc | theo tên vai trò | theo quyền (người ký thực tế như cũ) |
| `GET /api/v1/warehouses` | không có `id` | thêm `id` |

## 9. Đề xuất thứ tự chốt và đưa lên

1. Chốt **ngay được** (ít tranh luận): 1.1, 1.2 + §2 (thu hồi ngay), 3.1 (đã có chữ chốt), 3.3, §4 phần gác quyền ghi (F3), §7 phần SC-API-3.
2. Cần quyết thiết kế: **1.3 + 1.4 + §5 + 3.2** (D-AUTH-19, D-AUTH-24 — đi cùng nhau), §4 ánh xạ ký (D-AUTH-26), phạm vi kho (D-AUTH-25), SC-AUTH-11 (phép kiểm chặn mới).
3. Ai sửa: theo sổ tay §5, Kernel / `packages/*` là việc Nhóm Lõi — mã ở đây dùng làm bản làm thử / tham chiếu nếu Nhóm Lõi nhận làm.
