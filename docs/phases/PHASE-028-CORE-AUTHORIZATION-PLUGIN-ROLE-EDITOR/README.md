# PHASE-028 — Core Authorization Foundation, Plugin Contract & Role Editor
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — mở phase theo đề bài "CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR" (05/11/2026); W0 audit + ADR-0027 trước khi đụng Kernel (R-FLOW) -->

> **Trạng thái:** 🟡 W0 xong 2026-11-05 — chủ duyệt D-AUTH-01..10 (D-AUTH-03 bản sửa) · **Code:** W1 đã giữ chỗ (chữ chốt 00 §4a) <!-- [2026-11-05 06:27 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — chủ duyệt, giữ chỗ W1 -->
> **Mức Kernel:** K0 cho W0 (chỉ tài liệu). W1 (identity/role) và W2 (registry default-deny) đụng `packages/platform/src/core/auth.ts`, `packages/module-sdk`, migration mới → K2/K3, cần chữ chốt riêng từng wave trước PR code (RULE-FLOW §3).
> **Mục tiêu:** Cộng đồng tạo module mới, khai `permissions[]`/menu/action theo manifest là có ngay cây quyền trong Role Editor — nhưng **mặc định không ai có thêm đặc quyền**, kể cả `owner`. Quyền hiệu lực và sự thật kế toán vẫn do Core (Accounting Kernel) giữ; Role Editor chỉ cấu hình **ai làm được gì ở phạm vi nào**, không bao giờ tự sinh bút toán hay đổi ranh giới Kernel.
> **Việc lộ trình:** — (đề xuất thêm mã khi W0 được duyệt — xem 00 §6, giữ cùng đợt với PHASE-018/019/020 đã chờ mã)
> **Checklist công bố:** — (phase mới, ngoài G1–G3 hiện có; mã RBAC công bố hiện vẫn thuộc PHASE-011, xem mục "Trả lời ngắn")
> **Quyết định:** [ADR-0027](../../adr/ADR-0027-core-authorization-plugin-role-editor.md) chấp nhận 2026-11-05
> **Phụ thuộc phase:** PHASE-011 (Module SDK, manifest `permissions[]` đã có), PHASE-010 (`packages/platform/src/core/auth.ts`), ADR-0011 mức 2 (app_installations — mẫu "module grant" đã có cho app ngoài tiến trình), ADR-0024 (modules/ vs phan-he/)
> **Luật đi kèm:** [R-FLOW](../../rules/RULE-FLOW.md) — W0 là PR tài liệu, không giữ chỗ code cho tới khi D-AUTH-* có chữ chốt

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | sự thật đọc mã (file:line), 10 quyết định D-AUTH-01..10 có phương án đề xuất, 7 wave W0–W6, câu hỏi chờ chủ chốt |
| [10-AS-IS-AUDIT](10-AS-IS-AUDIT.md) | bảng kiểm kê EXISTS / PARTIAL / MISSING / CONFLICT theo đúng các mục đề bài nêu, dẫn `file:line` |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | kiến trúc đích W0 (năm cổng, ba trục, cách tính, chuyển đổi, đe doạ); §0 đối chiếu với mã |
| [30-UI-UX](30-UI-UX.md) | đặc tả HT12 Role Editor + bảng điểm; §0 đối chiếu mockup với mã đã merge; mockup chạy được ở [mockups/role-editor.html](mockups/role-editor.html), [mockups/authz-scoreboard.html](mockups/authz-scoreboard.html) |
| [45-CA-BANG-CHUNG](45-CA-BANG-CHUNG.md) · [50-TGS-MAPPING](50-TGS-MAPPING.md) · [truy vết → PHASE-029 · 37](../PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/37-DOC-TRACE-TU-PHASE-028.md) · [70-CONFORMANCE-SECURITY](70-CONFORMANCE-SECURITY.md) | ca T028-* + vai trò mẫu · phân tích 349 mã TGS · DOC / TRACE (đã chuyển PHASE-029) · luật AUTHZ + phép kiểm SC-AUTH (mỗi tệp có §0 đối chiếu mã) |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S028-*` của W0; log |

## Trả lời ngắn

- **Đã có gì dùng được ngay?** `packages/module-sdk` đã có `permissions[]` trong manifest (`key`, `label`, `roles?`, `risk?`), `registerModulePermissions` ở Core, và `defineAction` đã enforce quyền ở server (không chỉ ẩn menu) — không cần dựng lại từ đầu.
- **Thiếu gì nhất?** (1) `users.role` là **một cột, một giá trị** (CHECK 6 role cố định) — chưa có nhiều role/scope cho một người. (2) `rolePermissions()` cho **`owner` tự động nhận mọi quyền module**, kể cả quyền vừa đăng ký khi cài module mới — vi phạm thẳng AUTHZ-03/AUTH-REG-02 của đề bài. (3) Chưa có Role Editor UI, chưa có khái niệm "module grant" cho module **trong tiến trình** (module/addin) — tuy đã có mẫu đúng ý này cho **app ngoài tiến trình** ở `app_installations.permissions` (ADR-0011 mức 2): chủ đơn vị kết nối rồi mới có quyền, mặc định rỗng.
- **Hướng đề xuất:** không dựng authz service song song. Mở rộng đúng ba thứ đã có — `auth.ts` (bỏ owner auto-grant, thêm multi-role + scope), `module_registry`/`app_installations` (nhân mẫu "grant khi cài, mặc định rỗng" sang module trong tiến trình), `defineAction`/`web.ts` (giữ nguyên cơ chế guard, chỉ thêm scope resolver). Role Editor là **UI mới** đọc registry đã có, không phải engine mới.
- **Trụ cột nào?** VII "Cô lập đơn vị và phân quyền" (`tru-cot.json`) đã có S-1/S-2; PHASE-028 thêm tiêu chí S-5..S-n vào **pillar VII có sẵn**, không mở contract `authz_compliance@1` riêng (xem D-AUTH-06).
