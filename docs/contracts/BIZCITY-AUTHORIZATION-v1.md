# `bizcity_authorization@1` — Hợp đồng phân quyền (nháp)
<!-- [2026-11-06 00:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — chữ chốt hình dạng bộ tính quyền (W3 đợt 1): mô hình Cho / Nới / Cấm, phạm vi, mục đích, điều kiện, mã lý do; bám ADR-0027 đã chấp nhận -->
<!-- [2026-11-09 03:05 PM kiennt] PHASE-028 — 1.1.0-draft (D-AUTH-22, thi hành PHASE-030 / 22 §3 #1–#4 đã duyệt 06/11): bỏ hiệu lực Nới; điều kiện 8 → 5 (bỏ doc_date_back_days, doc_date_forward_days, respect_lock_date, status_in); amount_max = hạn mức duyệt cá nhân -->
<!-- [2026-11-11 09:30 AM kiennt] PHASE-028 — 1.2.0-draft (chữ chốt đề xuất D-AUTH-19, D-AUTH-24 — 80 §3.4): §3a quyền theo loại chứng từ và quyền kéo theo -->

> **Phiên bản:** 1.2.0-draft · 2026-11-11 (1.1.0-draft · 2026-11-09; 1.0.0-draft · 2026-11-06) · **Trạng thái:** Nháp · **Căn cứ:** [ADR-0027](../adr/ADR-0027-core-authorization-plugin-role-editor.md) (đã chấp nhận) · **Phase:** [PHASE-028](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/README.md)
> **Mở rộng (không thay):** [`bizcity_module@1`](BIZCITY-MODULE-v1.md) §3 `permissions[]`. Hợp đồng này chốt **cách tính một quyết định**; nơi lưu vai trò và lần gán theo ADR-0027 D-AUTH-01 (`user_role_assignments`).

## 1. Mục đích

Mọi nơi trả lời "người này có được làm việc này, ở đây, lúc này không" bằng **cùng một hàm thuần**. Giao diện, API, action, MCP, báo cáo và xuất dữ liệu không tự suy ra quyền. Kết quả luôn kèm mã lý do và dấu vết giải thích được.

Phạm vi bản này: bộ tính thuần (không CSDL), chưa nối vào đường yêu cầu hiện hành. Hành vi hôm nay (`rolePermissions`, `owner` có mọi quyền module theo D-AUTH-03 bản chủ sửa) **không đổi** cho tới khi một đợt riêng nối bộ tính vào.

## 2. Định danh

| Định danh | Khuôn | Ghi chú |
|---|---|---|
| quyền | `<module>:<việc>` (giữ `bizcity_module@1`) | khoá ổn định theo **nghĩa**; đổi nhãn không đổi khoá |
| mẫu quyền | như quyền nhưng cho phép `*` mỗi vế | dùng trong luật; xem §4 về giới hạn |
| bí danh | `<hệ>:<mã>`, hệ ∈ `tgs`, `htsoft`, `repo` | chỉ để tìm kiếm và chuyển đổi — **không bao giờ là khoá** |
| người được gán (principal) | `user` · `apikey` · `agent` | khoá API và trợ lý AI không nhận quyền `risk: high` |

## 3. Mô hình

```
lần gán  =  người × vai trò × phạm vi[] × mục đích[] × hiệu lực từ–đến
vai trò  =  luật[]            luật = mẫu quyền × hiệu lực × điều kiện
hiệu lực =  allow (Cho) | deny (Cấm)
mục đích =  operate | approve | report | export
phạm vi  =  all | org_unit (cây con tuỳ chọn) | branch | warehouse
```

Quy tắc tính (D-AUTH-04):

1. **Cấm luôn thắng.** Có luật deny khớp trong lần gán còn hiệu lực → từ chối, bất kể có bao nhiêu Cho.
2. **Cho chỉ hợp trong cùng phạm vi.** Cho ở chi nhánh A không cộng với Cho ở chi nhánh B để tạo quyền ở C. Khác phạm vi → không gộp.
3. **Nới = thêm một Cho rộng hơn.** (1.1.0: đã bỏ hiệu lực `relax`.) Cần cho một người sửa phiếu 3 ngày thay vì trong ngày thì gán thêm vai trò có luật Cho cùng quyền với điều kiện rộng hơn; theo quy tắc 2, Cho đó chỉ có tác dụng trong phạm vi của lần gán chứa nó.
4. **Mục đích tách bạch.** Phạm vi báo cáo của kho K1 không cho lập hay duyệt phiếu ở K1.
5. **Điều kiện** (§5) là phần của luật; không đạt điều kiện → từ chối với mã `AUTHZ-CONDITION` và nêu điều kiện nào không đạt.
6. **Thu hồi có hiệu lực ở yêu cầu kế tiếp**: bộ tính nhận `authzVersion` và danh sách lần gán do bên gọi nạp; hàm không giữ trạng thái.

### 3a. Quyền theo loại chứng từ và quyền kéo theo
<!-- [2026-11-11 09:30 AM kiennt] PHASE-028 — §3a (D-AUTH-19, D-AUTH-24; mã làm thử 2026-11-09, đưa vào main sau khi chốt) -->

- **Đăng ký.** Phân hệ đăng ký quyền theo thao tác cho loại chứng từ của mình: `registerDocumentType(loại, { read?, create?, cancel?, export? })` (`packages/platform/src/core/auth.ts`, gọi ở `apps/api/src/phan-he/<key>/index.ts`). Quyền phải khai ở `permissions[]` của manifest, đặt tên `<module>:<chức-năng>-<xem|lap|huy|xuat>`; không trùng quyền Core. Đăng ký trùng khác giá trị → lỗi khởi động.
- **Tra.** `documentPermissionOf(loại, thao tác)` trả quyền chi tiết nếu đã đăng ký **và** có trong sổ quyền (phân hệ đang bật); không thì quyền Core của thao tác: `read` → `documents:read`, `create` / `cancel` → `documents:write`, `export` → `reports:read`.
- **Kéo theo.** Quyền Core của thao tác kéo theo quyền chi tiết đã đăng ký (vd `documents:write` → `ban-hang:hoa-don-lap`). Ai đang có quyền Core (vai trò, khoá API, phiên hệ thống quản trị) vẫn làm được mọi loại phiếu như trước. Kéo theo tính **sau** Cho và **trước** Cấm.
- **Cấm quyền gốc phủ quyền kéo theo.** Luật Cấm khớp quyền gốc (vd `documents:*`) cũng chặn mọi quyền chi tiết nó kéo theo; Cấm `ban-hang:*` chỉ chặn quyền của bán hàng. Bộ tính nhận quyền gốc qua `impliedBy` của mục sổ quyền.
- **Mở hẹp.** Cho đúng quyền chi tiết (vd `kho:chuyen-kho-lap`) mà không Cho quyền Core.
- **Nơi thi hành (1.2.0).** Cửa nạp `POST /documents`, `/batch` (`create`, mọi chứng từ của lô phải qua); danh sách chứng từ lọc bỏ loại không được xem, chi tiết / xem trước trả 404 (`read`); `POST /documents/cancel` (`cancel`); bảng kê bán hàng của add-in xuất Excel (`export`); action `kho.transfer.*` (lập / sửa / nhận / bỏ nhận → `kho:chuyen-kho-lap`, từ chối / huỷ → `kho:chuyen-kho-huy`).
- **Giới hạn (1.2.0).** Huỷ và xem là **hạn chế thêm**: route vẫn gác bằng quyền Core, quyền chi tiết chặn thêm theo loại. Action riêng khác của phân hệ (mua hàng, quỹ, thuế…) vẫn gác `documents:write` — Cấm quyền chi tiết **chưa** chặn được ở đó, chỉ Cấm quyền Core chặn được; chuyển dần theo từng phân hệ. Sổ cái, sổ nhật ký, báo cáo chưa lọc theo loại. "In" không có quyền riêng.

## 4. Giới hạn của ký tự đại diện

| Luật | Mẫu `*` được phép? |
|---|---|
| deny (Cấm) | Có, phủ mọi quyền khớp (kể cả `risk: high`) — Cấm phải rộng được |
| allow | Có, nhưng **không bao giờ phủ** quyền `risk: high` hay quyền chưa ở trạng thái `active` (mới, đổi nghĩa, đã bỏ) |

Quyền module mới (`status: new`) chưa ai có cho tới khi được cấp đích danh — khớp D-AUTH-03: vai trò quản trị cao `ADMIN_ROLES` vẫn tự có quyền module theo chữ chốt của ADR; bộ tính chỉ phản ánh quy tắc đó qua vai trò hệ thống (`legacy`), không tự đặt thêm ngoại lệ.

## 5. Điều kiện của luật

| Khoá | Nghĩa |
|---|---|
| `edit_window_days` | sửa / huỷ trong N ngày kể từ **lúc lập**; `0` = trong ngày (giờ lập, múi giờ UTC+7) |
| `creator` | `self` < `branch` < `all`: chỉ phiếu của mình / cùng chi nhánh / tất cả |
| `amount_max` | **hạn mức duyệt cá nhân** (VND). Số *cấp* duyệt theo khoảng tiền là việc của chính sách duyệt, không phải điều kiện này |
| `view_window_days` | chỉ xem dữ liệu N ngày gần nhất (báo cáo) |
| `step_up_minutes` | phút xác thực lại cho quyền rủi ro cao |

Không có điều kiện theo **ngày chứng từ** hay **trạng thái**: hạn theo ngày chứng từ là việc của khoá ngày (`dataLock`, `date-rules.ts`; ai được vượt là quyền `documents:bypass-date-lock`), trạng thái nào sửa / chuyển được là việc của workflow (`from`, `editable`). Mỗi câu hỏi một nơi trả lời (PHASE-030 / 22 §2).

Điều kiện không nhận từ client: vị trí và thuộc tính của tài nguyên (`branchId`, `warehouseId`, `orgPath`, `createdBy`, `createdAt`, `status`, `amount`) do **máy chủ** nạp từ bản ghi rồi truyền vào hàm (AUTHZ-11).

## 6. Quyết định

```ts
interface AuthzDecision {
  allowed: boolean;
  reasonCode: string;      // §7
  decisionId: string;      // ghi vào bằng chứng của action
  authzVersion: number;
  matched?: { assignmentId: string; roleId: string; ruleId: string }[];
  failed?: { condition: string; need: unknown; have: unknown };
}
authorize(input): AuthzDecision
explain(input): AuthzDecision & { trace: { ok: boolean | null; step: string; detail: string }[] }
batchAuthorize(input, permissions[]): Map<permission, AuthzDecision>   // kết quả y hệt gọi lẻ từng quyền
scopeOf(input): { all: true } | { all: false; branchIds: string[]; warehouseIds: string[]; orgPaths: string[] }
```

`scopeOf` dùng để lọc báo cáo / xuất ở máy chủ: phạm vi rỗng **không** thành "tất cả" (T028-8).

## 7. Mã lý do

| Mã | Khi nào |
|---|---|
| `AUTHZ-ALLOW` | được phép |
| `AUTHZ-PERM-UNKNOWN` | quyền không có trong sổ quyền |
| `AUTHZ-PERM-NOT-GRANTED-YET` | quyền mới / đổi nghĩa, chưa ai được cấp |
| `AUTHZ-PERM-REMOVED` | quyền đã bị bỏ khỏi code |
| `AUTHZ-NO-ASSIGNMENT` | không có lần gán nào còn hiệu lực cho phạm vi và mục đích này |
| `AUTHZ-NO-ALLOW` | có lần gán nhưng không luật Cho nào khớp |
| `AUTHZ-DENIED-BY-RULE` | luật Cấm khớp |
| `AUTHZ-CONDITION` | có Cho nhưng điều kiện không đạt |
| `AUTHZ-HIGH-RISK-DELEGATION` | khoá API / trợ lý AI xin quyền rủi ro cao |

## 8. Chưa thuộc bản này (đề xuất, chờ đợt riêng)

- Nơi lưu vai trò **tuỳ biến** (ngoài 6 vai trò hệ thống) và luật của chúng: ~~ADR-0027 chưa có bảng cho việc này~~ đã chốt ở [ADR-0027 Phụ lục A](../adr/ADR-0027-core-authorization-plugin-role-editor.md) (`tenant_roles`, `tenant_role_rules`, lớp đọc `core/authz/store.ts` — PHASE-028 W2 đợt 1). Bảng `module_grants` **bỏ**: cấp quyền module = luật Cho của vai trò tuỳ biến. <!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2: nơi lưu vai trò tuỳ biến đã chốt (Phụ lục A), bỏ module_grants -->
- Khai siêu dữ liệu quyền trong manifest (`resource`, `operation`, `sensitive`, `scopeKinds`, `aliases`): tuỳ chọn, tương thích ngược, thêm khi `bizcity_module@1` mở minor.
- Nối bộ tính vào `requirePermission` / `runAction`, đọc lần gán từ `user_role_assignments` (W1) và vai trò tuỳ biến (W2) qua `loadAuthzSnapshot` — Phụ lục A bước 4. <!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2: thay module_grants bằng vai trò tuỳ biến -->

## 9. Mã nguồn sự thật

Các tệp dưới đây đã vào `main` ở PR code W3 đợt 1 (#99):

| Phần | Tệp |
|---|---|
| Kiểu, hằng, mã lý do | `packages/platform/src/core/authz/types.ts` (chuyển sang `@ketoan/contracts` khi dòng giữ chỗ PHASE-026 nhả `index.ts`) |
| Bộ tính thuần | `packages/platform/src/core/authz/engine.ts` |
| Sổ quyền, băm nghĩa, diff nâng cấp | `packages/platform/src/core/authz/catalog.ts` |
| Chuyển tiếp 6 vai trò hiện có | `packages/platform/src/core/authz/legacy.ts` |
| Test | `apps/api/test/authz-engine.test.ts` |
| Lớp đọc (vai trò hệ thống + vai trò đơn vị + lần gán) | `packages/platform/src/core/authz/store.ts` |
| Shadow: so bộ tính với `auth.ts` ở `requirePermission`, chỉ đếm, không đổi quyết định; khoá `bizcity.authz.shadow` (mặc định off) <!-- [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2: shadow, requireScope, SC-AUTH-03 --> | `packages/platform/src/core/authz/shadow.ts`, `apps/api/test/authz-shadow.test.ts` |
| `requireScope` / `authorizeScoped` / `allowedScope` / `restrictToScope`: quyền theo chi nhánh / kho, đóng an toàn khi tài nguyên không có vị trí. Gắn ở cửa nạp `POST /api/v1/documents` + `/batch` theo `branchCode` của chứng từ (W5 đợt 1, `document.routes.ts`, test `authz-scope-intake.test.ts`) <!-- [2026-11-07 09:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 1: requireScope gắn vào cửa nạp chứng từ --> | `packages/platform/src/core/authz/scope.ts`, `apps/api/test/authz-scope.test.ts` |
| SC-AUTH-03: danh sách đóng route ghi cố ý không là `defineAction` | `tests/conformance/checks/authz/authz.check.mjs`, `route-giu.json` |

## 10. Nhật ký

- 1.0.0-draft (2026-11-06): bản đầu, chốt hình dạng bộ tính (PHASE-028 W3 đợt 1).
- 1.0.0-draft (2026-11-06, W3 đợt 2): shadow (`shadow.ts`), `requireScope` (`scope.ts`) và SC-AUTH-03 vào mã; bộ tính không đổi hình dạng. Bất đẳng thức "không cho thừa so với đường cũ" có test (`authz-shadow.test.ts`). <!-- [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2: shadow, requireScope, SC-AUTH-03 -->
- 1.0.0-draft (2026-11-06, bổ sung): nơi lưu vai trò tuỳ biến chốt ở ADR-0027 Phụ lục A; bỏ `module_grants` (PHASE-028 W2). Hình dạng bộ tính không đổi. <!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2: nhật ký hợp đồng -->
- 1.1.0-draft (2026-11-09): bỏ hiệu lực Nới; điều kiện 8 → 5 (D-AUTH-22, PHASE-030 / 22). <!-- [2026-11-09 03:05 PM kiennt] PHASE-028 — nhật ký 1.1.0 -->
- 1.2.0-draft (2026-11-11): §3a quyền theo loại chứng từ, quyền kéo theo, Cấm quyền gốc phủ quyền kéo theo (D-AUTH-19, D-AUTH-24). <!-- [2026-11-11 09:30 AM kiennt] PHASE-028 — nhật ký 1.2.0 -->
