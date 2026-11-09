# PHASE-028 · 30 — Giao diện: Role Editor và bảng điểm
<!-- [2026-11-05 05:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W0: đặc tả màn HT12 Role Editor (kiểu WordPress User Role Editor + phạm vi + Giải thích) và tiêu chí AZ-* trên HT10; hai bản mẫu tương tác chạy được -->

<!-- [2026-11-09 Johnny Chu - Chu Hoàng Anh] PHASE-028 — đưa mockup HT12 từ bản draft W0 (worktree authz) vào main; đối chiếu với mã W1–W5 đã merge -->

## 0. Trạng thái so với mã đã merge (đối chiếu 2026-11-09, `origin/main` f02d5029)

Mockup A vẽ **đích** của HT12; mã W4 (`modules/phan-quyen/`, [hướng dẫn](../../huong-dan/phan-quyen.md)) mới làm một phần. Dùng bảng này để biết §1 dưới đây đã có gì:

| Phần của mockup A | Mã đã merge | Còn lại |
|---|---|---|
| Ma trận quyền × vai trò (Có / Cấm / —) | ✅ thẻ **Ma trận quyền** (`MatrixTab`), lọc theo tên / mã, "chỉ vai trò đơn vị" | cây nhóm bên trái, lưới tick theo **một vai trò**, "Chọn tất cả (rủi ro thấp)" — mã làm ma trận, không làm lưới |
| Quản lý vai trò (thêm, đổi tên, vô hiệu) | ✅ thẻ **Vai trò** (`RolesTab`): mã, loại job / privilege / restriction, vai trò nền, luật Cho / Cấm | **Nhân bản**, **Dùng mẫu…** (mẫu TGS nạp bằng script `nap-vai-tro-tgs.mjs`, vai trò vô hiệu) |
| Người dùng + gán + thời hạn | ✅ thẻ **Người dùng** (`UsersTab`): gán / thu hồi, `validTo`, lý do | — |
| Xem như | ✅ trong thẻ Người dùng: quyền hiệu lực và nguồn (chính, bổ sung, nền, Cho, Cấm) | chọn **quyền + chi nhánh / kho + mục đích + chứng từ** (`explain` đầy đủ) |
| Phạm vi | ✅ chỉ **chi nhánh**, tác dụng ở cửa nạp chứng từ (W5 đợt 1) | cây `org_units`, kho, mục đích Làm việc / Duyệt / Báo cáo / Xuất |
| Điều kiện (sửa trong ngày, người lập: của mình) | ☐ | chưa có chữ chốt; có thể thuộc PHASE-031 (Policy Registry) — cần chủ quyết |
| Hộp thoại ghi: lý do + nhập lại mật khẩu cho quyền cao | ✅ `WriteDialog` | diff trước khi lưu |
| Rà soát (quyền mới / đổi / ngừng), Lịch sử | ☐ | nhật ký ghi ở máy chủ nhưng chưa có thẻ xem |
| Màn B — bảng điểm trụ VII | ☐ | W6 (S028-11): AZ-* vào `tru-cot.json`; SC-AUTH-03 / 04 đã có phép kiểm |

**Khác biệt tên khi đọc §1.4 và §1.5** (mockup viết trước ADR-0027 Phụ lục A):

- Quyền vào màn là `users:write` (chủ đơn vị); **không** có `authz:read` / `authz:manage`. API thật: `/api/v1/roles[/:id]`, `/api/v1/users/:id/roles`; **không** có `/api/v1/authz/*`.
- Bảng thật: `tenant_roles`, `tenant_role_rules`, `user_role_assignments` (0073 / 0075), không phải `authz_*`.
- D-AUTH-03 bản sửa: `owner` / vai trò quản trị cao **vẫn tự có** quyền module; chỉ vai trò khác phải được Cho.
- Mã màn **HT12** đã chốt (Q028-1). Vai trò hệ thống là sáu vai trò cố định trong `auth.ts`, chỉ đọc.
- Mockup dùng dữ liệu giả (18 quyền Core, `ban-hang:*`). Thư viện thật: 349 mã / 28 nhóm TGS ở `docs/standard/phan-quyen/`, nạp thành vai trò bản nháp **vô hiệu** (D-AUTH-08).
- Bảng điểm (mockup B) chấm ở `b820e30` ngày 05/11, **chưa chấm lại** sau W1–W5: ví dụ AZ-FND-02 (nhiều vai trò) nay đã có mã, AZ-CON-02 viết "chủ đơn vị tự có mọi quyền" là vi phạm nhưng D-AUTH-03 bản sửa đã cho phép.

Bản mẫu chạy được (mở thẳng trong trình duyệt, không cần máy chủ, dữ liệu giả):

| Màn | Bản mẫu | Dữ liệu |
|---|---|---|
| A — Role Editor (HT12) | [mockups/role-editor.html](mockups/role-editor.html) | quyền + vai trò + lần gán mẫu trong tệp |
| B — Bảng điểm phân quyền (trụ VII của HT10) | [mockups/authz-scoreboard.html](mockups/authz-scoreboard.html) | sinh từ [data/authz-criteria.draft.json](data/authz-criteria.draft.json) |

Màu nhấn đỏ – đen của Bizcity, có chế độ tối. Mã thật dùng `@bizcity/ui-kit` (bảng, nút, ô chọn, dải cảnh báo đã có) — không thêm khung giao diện thứ hai.

## 1. Màn A — Role Editor (HT12)

### 1.1. Bố cục

Giữ bốn khu của WordPress User Role Editor: (1) chọn vai trò ở trên · (2) cây nhóm quyền bên trái · (3) lưới tick ở giữa · (4) quản lý vai trò bên phải. Thêm: phạm vi + điều kiện dưới lưới; thanh dưới mở Xem như / Rà soát / Lịch sử.

```text
┌ Hệ thống › Người dùng & phân quyền › HT12 ─────────────────────────────── authz_version 42 ┐
│ [Vai trò | Người dùng | Xem như | Rà soát | Lịch sử]                                       │
│ Vai trò (1) [Thu ngân ▾] job · từ mẫu cashier v1     Đơn vị [CTY A ▾] [So sánh] [Lưu]       │
├────────────────┬────────────────────────────────────────────────────┬──────────────────────┤
│ Nhóm quyền (2) │ [Tìm nhãn / mã quyền / mã TGS…]                     │ Quản lý vai trò (4)  │
│ Bán hàng  4/12 │ (Chỉ đã cấp)(Rủi ro cao)(Mới)(Ngừng)(Nhạy cảm)       │ ＋ Thêm · Nhân bản    │
│ Kho       1/6  │ Bán hàng › POS             [Chọn tất cả (rủi ro thấp)]│ Đổi tên · Vô hiệu     │
│ Quỹ       2/6  │ ☑ Lập hoá đơn bán lẻ  ban-hang:retail-invoice-create │ Dùng mẫu…            │
│ Kế toán   0/5  │ ☐ Huỷ hoá đơn  RỦI RO CAO   …-cancel  tgs:BH1        │ Lịch sử vai trò      │
│ Hệ thống  0/2  │ ☐ Sửa giá khi bán  RỦI RO CAO MỚI  tgs:BH11          │  05/11 kt-truong …   │
│                │ ⊘ Xem giá vốn  NHẠY CẢM  kho:cost-read   Bị cấm      │                      │
│                │ ── Phạm vi áp dụng khi gán ───────────────────────── │                      │
│                │ Phạm vi [Phú Thọ (cây con) ▾] Kho [mọi kho ▾]        │                      │
│                │ Mục đích ☑Làm việc ☐Duyệt ☑Báo cáo ☐Xuất            │                      │
│                │ Điều kiện: sửa trong ngày · người lập: của mình       │                      │
├────────────────┴────────────────────────────────────────────────────┴──────────────────────┤
│ [Xem quyền hiệu lực theo người + chứng từ] [Quyền mới / đổi / ngừng] [Nhật ký]             │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2. Trạng thái một ô quyền

| Trạng thái | Hiển thị | Tick được? |
|---|---|---|
| Cấp trực tiếp | ☑, chữ xanh | bỏ được |
| Kế thừa (vai trò hệ thống / mẫu) | ☑ xám, tên nguồn | không — sửa ở nguồn |
| Bị cấm (luật Cấm) | ⊘ đỏ | không |
| Chưa có | ☐ | được |
| Mới (module vừa đăng ký) | nhãn MỚI | được, tick riêng |
| Ngừng (`removed`) | gạch ngang | không; luật cũ hiện ở Rà soát |
| Chờ xác nhận lại (đổi rủi ro) | nhãn vàng | xác nhận ở Rà soát |

### 1.3. Tương tác (nghiệm thu W4)

1. Chọn vai trò → lưới đổi theo; tìm theo nhãn, `permissionId`, bí danh (`tgs:HT17`), module, rủi ro.
2. Bấm nhóm → lọc; "Chọn tất cả" chỉ phủ quyền **rủi ro thấp** trong bộ lọc; quyền cao tick từng ô.
3. Thêm / nhân bản / đổi tên / vô hiệu vai trò; vai trò hệ thống không xoá, không đổi mã; vô hiệu giữ lịch sử.
4. Bảy trạng thái §1.2 phân biệt bằng chữ + màu (không chỉ màu).
5. Một người nhiều vai trò, nhiều phạm vi: tab Người dùng liệt kê lần gán; tab Xem như chọn người + quyền + chi nhánh / kho + mục đích + (tuỳ chọn) một chứng từ.
6. Lưu: xem diff → lý do bắt buộc → nhập lại mật khẩu nếu có quyền cao → một giao dịch ghi luật + `authz_audit` + tăng `authz_version`; yêu cầu API kế tiếp của người liên quan đã theo quyền mới.
7. "Giải thích" gọi `explain` của server: ai cấp (vai trò, lần gán), luật nào chặn, điều kiện thiếu gì. Không nút nào chỉ đổi trạng thái phía client.
8. Người không có `authz:manage`: không thấy nút sửa; gọi API sửa vẫn bị từ chối (T028-7). Người có `authz:manage` không sửa được lần gán của chính mình.
9. Màn rộng ≥ 1280 px: ba cột; 980–1280 px: cây nhóm thu thành ô chọn; < 980 px: một cột, chỉ xem + Giải thích (sửa phân quyền trên điện thoại không hỗ trợ ở v1).

### 1.4. Cây thành phần và dữ liệu

| Thành phần | Dữ liệu | API |
|---|---|---|
| `RoleEditorPage` (tab) | — | — |
| `RolePicker`, `RoleActions` | danh sách vai trò của đơn vị | `GET /api/v1/authz/roles`; action `core.authz.role.create / update / disable / clone`, `core.authz.preset.accept` |
| `PermissionTree` | sổ quyền + số đã cấp | `GET /api/v1/system/permissions` (thêm `module`, `risk`, `status`, `aliases`, `resource`) |
| `PermissionGrid` | luật của vai trò | `GET /api/v1/authz/roles/:id/rules`; action `core.authz.rules.set` (cả lô, kèm `reason`, `stepUpToken`) |
| `ScopeEditor`, `ConditionEditor` | cây `org_units`, chi nhánh, kho; danh mục điều kiện | `GET /api/v1/org-units`, `/branches`, `/warehouses`; danh mục điều kiện từ code |
| `AssignmentTable` | lần gán | `GET /api/v1/authz/assignments?principal=`; action `core.authz.assign / revoke` |
| `ExplainPanel` | quyết định | `POST /api/v1/authz/explain` (quyền `authz:read`) |
| `ReviewList` | mới / đổi / ngừng / sắp hết hạn / chưa vai trò / bí danh trùng | `GET /api/v1/authz/review` |
| `AuditLog` | nhật ký | `GET /api/v1/authz/audit` |

Trạng thái màn: đang tải (khung xương), rỗng ("Đơn vị chưa có vai trò nào ngoài 6 vai trò hệ thống — Dùng mẫu…"), lỗi (mã lỗi + câu từ thư viện mã), không có quyền (dải "Bạn cần quyền authz:read để xem màn này", không lộ dữ liệu).

### 1.5. Mã màn

Đề xuất **HT12** (D-AUTH-06): `HT11` của TGS đang mang nghĩa "#Được phép xem báo cáo trên tất cả các Kho" ở 4 nhóm — dùng HT11 sẽ lẫn khi nhập dữ liệu / tìm kiếm. Quyền: `authz:read` (xem, Giải thích), `authz:manage` (sửa, rủi ro cao). Hai quyền Core mới, thay dần `users:write` cho phần phân quyền.

## 2. Màn B — Bảng điểm phân quyền

Không màn mới: tiêu chí **AZ-*** thêm vào **trụ VII "Cô lập đơn vị và phân quyền"** của `docs/standard/tru-cot.json`, hiện ở HT10 như mọi trụ. Bản mẫu là phần nhìn sâu của trụ VII (thẻ nhóm + bảng + mở chi tiết).

- 12 nhóm thẻ: Foundation · Role Templates · Module Contracts · Registration SDK · Guard Coverage · Scope / RLS · Workflow / SoD · TGS Mapping · Role Editor · Security / Agent · Kernel Safety · E2E Regression.
- % = công thức `pillarScore` hiện có (`apps/web/src/features/system/PillarsPage.tsx:33-37`): Đạt 1 · Một phần 0,5 · Mới tài liệu 0,25 · Chưa 0. Thêm `chua-xac-minh` = 0 (cần minor của `bizcity_pillars@1`, chủ dự án duyệt).
- Dải trên cùng: "Phase KHÔNG ĐẠT: n tiêu chí P0 chưa đạt" — P0 mở thì không đạt dù % cao.
- Ô số: quyền đăng ký, quyền mới chưa duyệt, mồ côi, route chưa gác, route báo cáo chưa lọc phạm vi, chỗ kiểm theo tên vai trò, luật mẫu phủ quyền cao, mã TGS đã duyệt, ca T028 xanh. Số lấy từ phép kiểm SC-AUTH khi có; trước đó ghi "—" hoặc số đếm tay có nguồn ở [10-AS-IS-AUDIT](10-AS-IS-AUDIT.md).
- Lọc: nhóm, mức, P0/P1/P2, phân hệ, tìm, chỉ việc mở; Xuất CSV.
- Mở một dòng: tiêu chí → nguồn (`check` / `manual`) + `checkId` → test → commit → bằng chứng → khoảng cách → việc tiếp.
- Không có nút chấm. Schema [authz-compliance.schema.draft.json](data/authz-compliance.schema.draft.json) từ chối `dat` thiếu `checkId` (nguồn `check`) hoặc thiếu `testId` + `repoCommit`.
- Mức hôm nay (bản nháp, đọc `b820e30`): 33 tiêu chí (25 AZ-* + 8 TRACE-*) — 6 đạt, 11 một phần, 3 mới tài liệu, 12 chưa, 1 chưa xác minh; 37 %; 20 tiêu chí P0 mở. Nhóm "Document Lifecycle & Traceability" 63 % ([60](60-TRUY-VET-CHUNG-TU.md)). <!-- [2026-11-05 07:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — thêm nhóm TRACE -->

## 3. Checklist thiết kế

| Hạng mục | A | B |
|---|---|---|
| Duyệt cây nhóm / menu | ✔ | — |
| Form vai trò (thêm, nhân bản, đổi tên, vô hiệu, dùng mẫu) | ✔ (nút; form W4) | — |
| Ma trận quyền | ✔ | — |
| Bộ sửa phạm vi + điều kiện | ✔ (tĩnh) | — |
| So sánh vai trò | mô tả (W4) | — |
| Quyền hiệu lực + Giải thích | ✔ | — |
| Nhật ký | ✔ | — |
| Bảng điểm, thẻ, lọc, mở chi tiết, CSV | — | ✔ |
| Trạng thái rỗng / lỗi / không quyền | mô tả §1.4 | dải P0 |
