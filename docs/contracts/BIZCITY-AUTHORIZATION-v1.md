# `bizcity_authorization@1` — Hợp đồng phân quyền (nháp)
<!-- [2026-11-06 00:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — chữ chốt hình dạng bộ tính quyền (W3 đợt 1): mô hình Cho / Nới / Cấm, phạm vi, mục đích, điều kiện, mã lý do; bám ADR-0027 đã chấp nhận -->

> **Phiên bản:** 1.0.0-draft · 2026-11-06 · **Trạng thái:** Nháp · **Căn cứ:** [ADR-0027](../adr/ADR-0027-core-authorization-plugin-role-editor.md) (đã chấp nhận) · **Phase:** [PHASE-028](../phases/PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/README.md)
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
hiệu lực =  allow (Cho) | relax (Nới) | deny (Cấm)
mục đích =  operate | approve | report | export
phạm vi  =  all | org_unit (cây con tuỳ chọn) | branch | warehouse
```

Quy tắc tính (D-AUTH-04):

1. **Cấm luôn thắng.** Có luật deny khớp trong lần gán còn hiệu lực → từ chối, bất kể có bao nhiêu Cho.
2. **Cho chỉ hợp trong cùng phạm vi.** Cho ở chi nhánh A không cộng với Cho ở chi nhánh B để tạo quyền ở C. Khác phạm vi → không gộp.
3. **Nới không tự cấp.** Luật relax chỉ mở rộng điều kiện của một Cho đã có; không có Cho thì Nới vô tác dụng.
4. **Mục đích tách bạch.** Phạm vi báo cáo của kho K1 không cho lập hay duyệt phiếu ở K1.
5. **Điều kiện** (§5) là phần của luật; không đạt điều kiện → từ chối với mã `AUTHZ-CONDITION` và nêu điều kiện nào không đạt.
6. **Thu hồi có hiệu lực ở yêu cầu kế tiếp**: bộ tính nhận `authzVersion` và danh sách lần gán do bên gọi nạp; hàm không giữ trạng thái.

## 4. Giới hạn của ký tự đại diện

| Luật | Mẫu `*` được phép? |
|---|---|
| deny (Cấm) | Có, phủ mọi quyền khớp (kể cả `risk: high`) — Cấm phải rộng được |
| allow / relax | Có, nhưng **không bao giờ phủ** quyền `risk: high` hay quyền chưa ở trạng thái `active` (mới, đổi nghĩa, đã bỏ) |

Quyền module mới (`status: new`) chưa ai có cho tới khi được cấp đích danh — khớp D-AUTH-03: vai trò quản trị cao `ADMIN_ROLES` vẫn tự có quyền module theo chữ chốt của ADR; bộ tính chỉ phản ánh quy tắc đó qua vai trò hệ thống (`legacy`), không tự đặt thêm ngoại lệ.

## 5. Điều kiện của luật

| Khoá | Nghĩa |
|---|---|
| `edit_window_days` | sửa / huỷ trong N ngày kể từ lúc lập; `0` = trong ngày (giờ lập, múi giờ UTC+7) |
| `doc_date_back_days`, `doc_date_forward_days` | ngày chứng từ lùi / tới tối đa N ngày so với hôm nay |
| `creator` | `self` < `branch` < `all`: chỉ phiếu của mình / cùng chi nhánh / tất cả |
| `status_in` | chỉ khi chứng từ ở một trong các trạng thái |
| `amount_max` | số tiền tối đa (VND) |
| `view_window_days` | chỉ xem dữ liệu N ngày gần nhất (báo cáo) |
| `respect_lock_date` | `false` = được vượt khoá dữ liệu đến ngày; **không** vượt khoá kỳ của Kernel |
| `step_up_minutes` | phút xác thực lại cho quyền rủi ro cao |

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

## 10. Nhật ký

- 1.0.0-draft (2026-11-06): bản đầu, chốt hình dạng bộ tính (PHASE-028 W3 đợt 1).
- 1.0.0-draft (2026-11-06, bổ sung): nơi lưu vai trò tuỳ biến chốt ở ADR-0027 Phụ lục A; bỏ `module_grants` (PHASE-028 W2). Hình dạng bộ tính không đổi. <!-- [2026-11-06 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2: nhật ký hợp đồng -->
