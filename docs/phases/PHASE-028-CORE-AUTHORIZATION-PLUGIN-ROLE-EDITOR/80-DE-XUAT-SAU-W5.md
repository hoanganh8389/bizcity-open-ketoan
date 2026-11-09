# PHASE-028 · 80 — Đề xuất sau W5: vá an toàn, lấy lại phần draft W0, xếp đợt tiếp
<!-- [2026-11-09 01:45 PM kiennt] PHASE-028 — giai đoạn 0 (chỉ tài liệu): rà mã sau W5, 7 quyết định chờ chủ (D-AUTH-17..23), xếp đợt tiếp vào wave sẵn có, việc dọn giữ chỗ -->

> **Trạng thái:** Nháp, chờ chủ dự án đọc. Chỉ tài liệu, không có mã.
> **Đọc trên:** `origin/main` @ `6b295c15` (2026-11-09). Khác `main` thì `main` thắng (R-FLOW-7).
> **Liên quan:** [ADR-0027](../../adr/ADR-0027-core-authorization-plugin-role-editor.md) Phụ lục A · [20 §0](20-KIEN-TRUC.md) · [45](45-CA-BANG-CHUNG.md) · [PHASE-030 / 22](../PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/22-DANH-GIA-GON-PHAN-QUYEN.md)

## 1. Vì sao có tệp này

W1–W5 đã có mã: nhiều vai trò, vai trò của đơn vị (Cho / Cấm), HT12, shadow, chi nhánh ở cửa nạp, thư viện TGS. Khi rà lại để bổ sung chi tiết nghiệp vụ (so với HTsoft, MISA), có hai việc phải làm **trước** khi mở rộng:

1. Còn **lỗ an toàn** ngoài phạm vi các wave đã làm (§2). Một số lỗ đã được draft W0 nêu nhưng bản duyệt không xếp vào wave nào.
2. Quyền đăng ký được nhưng **chưa có chỗ chặn** ở đường nghiệp vụ chính: cửa nạp Kernel chỉ kiểm `documents:write`, báo cáo lấy phạm vi từ client, ký chứng từ kiểm theo tên vai trò. Thêm quyền chi tiết lúc này làm HT12 hiện ô tick không có tác dụng.

## 2. Sự thật đọc mã (2026-11-09)

| # | Phát hiện | Bằng chứng | Mức |
|---|---|---|---|
| F1 | **Leo thang qua tạo / sửa người dùng.** `createUserIn` / `updateUserIn` không kiểm chống leo thang, không chặn tự sửa mình. Ai có `users:write` (kể cả nhận qua luật Cho của vai trò đơn vị) tự nâng mình thành `owner`, tạo `owner` mới, đặt lại mật khẩu `owner` | `apps/api/src/modules/access/access.service.ts:39-82`; chống leo thang chỉ có ở `role-assignment.service.ts:37-40`, `tenant-role.service.ts:130` | P0 |
| F2 | **Khoá API vượt quyền người tạo.** Không kiểm người tạo có các quyền của `scopes`; `documents:write` kéo theo `documents:edit-all` (rủi ro cao) | `access.service.ts:130`; `packages/platform/src/core/auth.ts:143` | P0 |
| F3 | **Ba action ghi chỉ gác `documents:read`**: ký, huỷ chữ ký, cấu hình thông báo (draft W0 đã nêu) | `packages/platform/src/documents/signature.routes.ts:73,104`; `apps/api/src/modules/system/notify.actions.ts:33` | P0 |
| F4 | **Kiểm theo tên vai trò, đi vòng phân quyền** (draft W0 R3): ký ô kế toán trưởng / giám đốc, huỷ chữ ký, chấp nhận cảnh báo nạp. Vai trò của đơn vị không cấp được, luật Cấm không chặn được | `signature.routes.ts:39-40,116`; `packages/kernel/src/modules/intake/repair.ts:137` | P1 |
| F5 | **Báo cáo / xuất lấy phạm vi do client gửi, rỗng = tất cả** (draft W0 R1). `allowedScope` có ở thư viện nhưng chưa route nào dùng | `apps/api/src/addins/excel-export/index.ts`; `apps/api/src/modules/sales/sales-report.routes.ts:46`; `packages/platform/src/core/authz/scope.ts` | P0 |
| F6 | **Cửa nạp Kernel không phân biệt loại chứng từ.** Phiếu bán, nhập / xuất / chuyển kho, thu chi cùng kiểm `documents:write`; loại chứng từ là danh sách cứng 10 loại | `packages/kernel/src/modules/documents/document.routes.ts:81,99`; `packages/contracts/src/documents.ts:429` | gốc của R2 |
| F7 | **Chưa module nào khai `permissions[]`.** `mua-hang`, `phan-quyen`, `thu-vien` khai 0 quyền; bán hàng / kho vẫn ở `apps/api/src/modules/{sales,inventory}` | `modules/*/bizcity.module.json` | — |
| F8 | **SSO WordPress:** vé không có `jti` (dùng lại được trong 5 phút); `perms` của WP thay toàn bộ quyền theo vai trò, không áp Cấm / vai trò đơn vị; JWT sống 12 giờ | `apps/api/src/modules/auth/wp-sso.ts:82`; `auth.ts:216-218`; `packages/platform/src/config/env.ts:38` | P1 |
| F9 | Route đọc không khai quyền riêng: `GET /system/schema` (lộ cấu trúc CSDL cho mọi người đăng nhập, kể cả khoá API), `GET /tenant` trả cả `settings`; không giới hạn số lần thử ở `/auth/login`, `/auth/wp-sso` | `apps/api/src/modules/system/system.routes.ts:95,282` | P1 |

F2, F8, F9 lấy từ lần rà bằng agent; F1, F3, F4, F6, F7 đã đọc lại trực tiếp. Mọi dòng cần kiểm lại trên `main` lúc giữ chỗ đợt tương ứng.

## 3. Quyết định chờ chủ dự án

| ID | Quyết định | Đề xuất | Chặn |
|---|---|---|---|
| D-AUTH-17 | Thứ tự | **Vá an toàn trước mở rộng**: F1, F2, F3, F9 xong trước mọi đợt thêm quyền chi tiết; F4, F5 cùng đợt với W5 đợt 3 | đợt W1-vá |
| D-AUTH-18 | Phần draft W0 lấy lại thành việc | (a) `registerMenu` / `registerSubmenu` / `registerAction` bọc `defineWebModule` / `defineAction`; (b) vai trò mẫu "Dùng mẫu" ([45 §Vai trò mẫu](45-CA-BANG-CHUNG.md)) dạng **vai trò của đơn vị**, không thêm vai trò hệ thống (trả lời luôn Q028-3: cộng thêm); (c) `maskFields` cho giá vốn / lợi nhuận ở báo cáo **và** xuất; (d) thay kiểm theo tên vai trò (F4) bằng quyền | W3 đợt 3, W4 đợt 2 |
| D-AUTH-19 | Quyền theo loại chứng từ | **Sổ đăng ký loại chứng từ**: mỗi loại khai quyền theo thao tác (đọc / lập / sửa / huỷ / ghi sổ / bỏ ghi / in / xuất) + hàm lấy vị trí (chi nhánh / kho) + trường `legacy` (= `documents:write`, giữ hành vi cũ). Cửa nạp tra sổ; loại chưa đăng ký → từ chối. Dùng chung sổ này cho duyệt nhiều cấp (PHASE-030 / 16 §5) | W5 đợt 3 (chữ chốt riêng, Kernel K3) |
| D-AUTH-20 | Quyền phải có chỗ chặn | Phép kiểm mới: mỗi quyền trong sổ (Core + manifest) có ít nhất một route / action / workflow kiểm nó; HT12 **chỉ hiện** quyền đã thi hành, quyền chưa thi hành hiện nhãn "chưa có hiệu lực" | W3 đợt 3 |
| D-AUTH-21 | Một nơi quyết định, có hạn | Gỡ đường cũ (`ROLE_PERMISSIONS` trực tiếp, `assertCanModify`, `workflow.actor.can`) sau **hai tuần shadow sạch** trên ít nhất một đơn vị thật; ghi `AUTHZ_SHADOW_DIFF` + số đo trước đó (đúng PHASE-030 / 22 §3 #8) | W3 đợt 3 |
| D-AUTH-22 | Rút gọn khái niệm chưa thi hành | Làm theo PHASE-030 / 22 §3 #1–#6 (đã duyệt 06/11 tối): bỏ Nới, điều kiện còn 5; thêm: loại `privilege` hoặc có hành vi riêng (thời hạn bắt buộc) hoặc gộp vào `job`; `purpose` chỉ hiện trên màn khi đã thi hành | W3 đợt 3 |
| D-AUTH-23 | Dữ liệu TGS trong repo công khai | Draft W0 D-AUTH-11: không commit nhóm theo tên nội bộ khách hàng; 07/11 đã commit `tgs-nhom.json` (28 nhóm). **Xin chủ xác nhận lại** giữ nguyên hay chuyển `tgs-nhom.json` sang kho riêng, chỉ giữ ánh xạ 349 mã | ngay |

## 4. Xếp đợt tiếp vào wave sẵn có

Không mở phase mới. Mã việc đề xuất nối tiếp `S028-11` (W6 đã có).

| Mã | Đợt | Việc | Đụng | Rủi ro |
|---|---|---|---|---|
| S028-12 | **W1 đợt vá** | F1 chống leo thang tạo / sửa người dùng (không tự sửa mình, không vượt quyền mình, chỉ `owner` đụng `owner`, `confirmPassword` khi cấp vai trò có quyền cao) | `apps/api/src/modules/access/**` | thấp |
| S028-13 | W1 đợt vá | F2 khoá API ≤ quyền người tạo; liệt kê khoá cũ đang vượt để chủ quyết | `access/**`, `auth.ts` (`SCOPE_PERMISSIONS`) | thấp – vừa |
| S028-14 | W1 đợt vá | F3 ba action ghi gác đúng quyền ghi; F9 gác `system/schema`, `tenant`, giới hạn số lần đăng nhập | `platform/documents`, `system/**`, `auth/**` | thấp – vừa |
| S028-15 | **W3 đợt 3** | F4 bỏ kiểm theo tên vai trò (`documents:sign-chief`, `documents:sign-director`, `documents:signature-revoke`, `intake:accept-warning`, cấp sẵn đúng vai trò hiện có) | platform + Kernel `intake/repair.ts` | vừa |
| S028-16 | W3 đợt 3 | `AUTHZ_SHADOW_DIFF` + số đo; đệm theo `authz_version`; D-AUTH-20, D-AUTH-22 | `core/authz/**`, `core/security/**`, `tests/conformance/checks/authz/**` | vừa |
| S028-17 | W3 đợt 3 | `registerMenu` / `registerAction`, `maskFields` | `packages/module-sdk/**`, `core/authz/**` | vừa |
| S028-18 | **W4 đợt 2** | HT12: vai trò mẫu "Dùng mẫu", lưới 6 cờ theo nhóm, Cho / Cấm cả phân hệ, gán vai trò kiểu "tick + chi nhánh + Xem quyền hạn" | `modules/phan-quyen/**` | thấp |
| S028-19 | **W5 đợt 3** | F5 lọc phạm vi báo cáo / xuất (`requested ∩ allowed`, rỗng = rỗng); phạm vi kho; chuyển kho kiểm hai đầu | báo cáo, `addins/excel-export`, `requireScope` | cao |
| S028-20 | W5 đợt 3 | D-AUTH-19 sổ đăng ký loại chứng từ, cửa nạp tra sổ; Quỹ / Kho / Bán hàng khai quyền chi tiết | Kernel `documents/**`, `packages/contracts` | cao |
| S028-21 | W3 bước 4 | D-AUTH-21 chuyển hẳn, gỡ đường cũ | `auth.ts`, `requirePermission` | cao |
| — | ngoài PHASE-028 | F8 SSO (`jti`, TTL, WP chỉ xác thực) — dùng chung với `tgs_accounting_bridge`; tách `users:write` (D-AUTH-13 bước 2); duyệt nhiều cấp (PHASE-030) | | vừa – cao |

Mỗi dòng: giữ chỗ ở `CLAIMS.md` trên `main` trước (R-FLOW-1); dòng đụng thứ dùng chung có chữ chốt riêng (R-FLOW-2). S028-19, S028-20, S028-21 chạy shadow trước khi chặn thật, có công tắc tắt theo đơn vị.

## 5. Chồng phạm vi cần tránh (đọc `nhan-viec.mjs` 2026-11-09)

| Việc ở trên | Đang có người giữ | Cách xử lý |
|---|---|---|
| S028-19, S028-20 (bán hàng, báo cáo bán) | PHASE-026 (`modules/sales`, `phan-he/ban-hang`), nhánh `docs/phase-032-ban-hang-chinh-sach-pos` chưa giữ chỗ | hỏi người giữ trước; tách theo tệp |
| S028-19 (báo cáo theo khoản mục) | PHASE-029 S029-19 đợt 2d (`phan-he/ke-toan/reports/dimension-reports.ts`) | chờ trả chỗ |
| S028-20 (Kernel `documents/**`) | PHASE-031 W2b (cửa nạp tính quà) đã merge; PHASE-004 trigger sổ cái | đọc lại trước chữ chốt |
| S028-12..14 (`access/**`, `system/**`) | không có dòng nào | được giữ chỗ ngay |

## 6. Việc dọn

1. **Trả dòng giữ chỗ cũ:** `CLAIMS.md` còn dòng *PHASE-028 · W5 đợt 2* (thư viện TGS) dù mã đã merge (`3f3c9468`, `2758659d`). Theo R-FLOW-6 người giữ xoá trong PR cuối; xin người giữ (phiên PHASE-028 authz) xoá, hoặc cho phép gộp việc xoá vào PR tài liệu này.
2. **Thư mục draft W0 trên máy làm việc** (`docs/phases/PHASE-028-CORE-AUTHORIZATION-ROLE-EDITOR/`, ngoài git): nội dung đã vào `main` qua #232, #234 ([20 §0](20-KIEN-TRUC.md)); bản trên máy chỉ còn thư mục rỗng — xoá được, không ảnh hưởng repo.

## 7. Chưa làm ở tệp này

- Không thêm dòng vào `40-MASTER-CHECKLIST.md` và `CLAIMS.md`: chờ chủ chọn ở §3 rồi mới thêm, tránh giữ chỗ cho việc chưa duyệt.
- Không viết phiếu nghiệm thu cho S028-12: viết sau khi D-AUTH-17 được duyệt.
