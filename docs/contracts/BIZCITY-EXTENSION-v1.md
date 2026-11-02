# `bizcity_extension@1` — Extension Contract
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.1.0-draft: §3a khung nhúng app ngoài tiến trình (ADR-0011 mức 2) — iframe sandbox, vé ≤ 5 phút, giao thức postMessage đóng, kiểm origin hai chiều -->
<!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.2.0-draft: core.partner.upsert / core.product.upsert có; @bizcity/module-sdk/web (defineWebModule, WEB_SLOTS) -->

<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4: 1.3.0-draft — hook masterdata.referenceCheck có (trả câu báo); document.beforeTransition bỏ (kiểm trong action của module); ctx.notify; slot partner.detail.tab, dashboard.widget vẽ được -->

> **Phiên bản:** 1.3.0-draft · 2026-11-02 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 7/7)
> **Luật nền:** [R-BOUND](../rules/RULE-MODULE-BOUNDARY.md) · **Năng lực:** `ui.menu`, `ui.kit`, `ui.slots`, `permissions.module`, `settings.registry`, `ai.cell`

## 1. Mục đích

Liệt kê **đóng** các chỗ module được cắm vào Core: giao diện, API, hook, quyền, cấu hình, mẫu in. Chỗ nào không có trong danh sách thì module không cắm được; cần thì đề xuất năng lực mới ([VERSIONING §5](../standard/VERSIONING.md#5-thiếu-năng-lực-thì-đề-xuất-thay-đổi-core)). Kèm theo là bộ kiểm tương thích để Core nâng cấp mà không làm gãy module.

## 2. Hiện trạng

| Đã có | Thiếu |
|---|---|
| Phân hệ khai nhóm menu (`WebModule.groups`), màn (`routes.tsx`), biểu tượng | Chèn vào màn của Core (tab ở hồ sơ khách hàng, panel ở chứng từ) |
| Add-in: route `/api/v1/addins/<id>`, menu dưới "Tiện ích" | Hook đồng bộ có kiểm soát |
| Mẫu in theo cấu hình (`print-templates`) | Quyền và cấu hình do module khai |
| Thành phần chung ở `apps/web/src/components` | Gói `@bizcity/ui-kit` có phiên bản; module hiện import thẳng đường dẫn nội bộ |

## 3. Điểm mở rộng giao diện

| Điểm | Khai ở | Nhận gì | Ví dụ |
|---|---|---|---|
| `menu` | manifest `extensions.menu` | mục menu + màn (`path` dưới `/app/<key>/…`) | "Hợp đồng", "Lịch thu tiền" |
| `launcher` | manifest `ui` | ô trên lưới ứng dụng | biểu tượng, màu |
| Slot `partner.detail.tab` | `extensions.slots` | `{ partnerCode }` | tab "Hợp đồng" trong hồ sơ khách hàng |
| Slot `product.detail.tab` | | `{ sku }` | |
| Slot `document.detail.panel` | | `{ docKey, docType }` của sự việc kế toán | panel "Nguồn: hợp đồng HD-…" trên phiếu thu |
| Slot `dashboard.widget` | | `{ branchCode? }` | "Kỳ thu đến hạn tuần này" |
| Slot `ledger.drilldown.source` | | `{ docKey }` | mở chứng từ gốc của module từ sổ chi tiết |
| `print` | `extensions.print` | mẫu in cho loại chứng từ của module | mẫu in hợp đồng |

Khai báo phía giao diện: `defineWebModule` ở `@bizcity/module-sdk/web` (ADR-0015 Q5) — kiểm đường dẫn dưới `/app/<key>/`, slot trong danh sách đóng `WEB_SLOTS` (đúng bảng trên), quyền đúng khuôn, ngay lúc nạp.

Luật slot: thành phần chỉ dùng `@bizcity/ui-kit` và client action; lỗi trong slot bị bắt (error boundary) và **không** làm hỏng màn của Core; slot không đọc state của màn chủ ngoài props được truyền.

## 3a. Khung nhúng app ngoài tiến trình (ADR-0011 mức 2)

App `kind: "app"` có `ui.origin` ([Module §3a](BIZCITY-MODULE-v1.md)) hiện ở nhóm **Tiện ích** (một mục mỗi app đang kết nối, màn `/ung-dung/<key>`), nhúng `ui.origin + ui.entry` trong iframe. Slot iframe (`extensions.slots` của app) chờ năng lực `ui.slots` (PHASES 3.8); cùng giao thức dưới đây.

- iframe `sandbox="allow-scripts allow-forms allow-same-origin"`: **không** `allow-top-navigation`, không `allow-popups`; `referrerpolicy="no-referrer"`, `allow=""`. Không gửi phiên đăng nhập của Core vào iframe.
- **Vé** (≤ 5 phút): giao diện xin `POST /api/v1/apps/<key>/ticket` (chỉ người dùng đăng nhập, kết nối đang bật), trao cho iframe qua `postMessage`. Vé ký bằng khoá dẫn xuất riêng nên **không** dùng được làm `Authorization: Bearer`. App gửi vé + khoá API của chính nó tới `POST /api/v1/apps/ticket/exchange` → `{ app, tenant, user, permissions }`; khoá của app khác / khoá thường → `FORBIDDEN`.
- Giao thức `postMessage` **đóng**: Core chỉ nhận tin có `event.origin === ui.origin` **và** `event.source` là chính iframe đó; gửi với `targetOrigin = ui.origin` (không bao giờ `"*"`). Loại tin khác bị bỏ qua.

| Chiều | `type` | Dữ liệu |
|---|---|---|
| app → Core | `bizcity.ready` | app sẵn sàng; Core gửi `bizcity.context` (và gửi lại mỗi 4 phút, khi đổi chi nhánh làm việc) |
| app → Core | `bizcity.navigate` | `{ path }`: đường dẫn trong Core, bắt đầu `/` (không `//`) |
| app → Core | `bizcity.toast` | `{ kind: 'info' \| 'ok' \| 'bad', text }` (≤ 300 ký tự) |
| app → Core | `bizcity.resize` | `{ height }` px, kẹp 200…10000 |
| Core → app | `bizcity.context` | `{ version: 1, ticket, expiresAt, tenant: { code, name }, branch, locale: 'vi-VN', theme }` |

## 4. Hook

Hook là lời gọi **đồng bộ** trong giao dịch của Core, nên bị giới hạn chặt. Muốn phản ứng sau khi việc đã xong thì dùng [sự kiện](BIZCITY-EVENT-v1.md), không dùng hook.

| Hook | Khi nào | Module được làm | Thời gian tối đa |
|---|---|---|---|
| `masterdata.referenceCheck` | trước khi Core xoá một đối tượng (**có** 1.3.0: `defineHook`, `packages/platform/src/core/hooks.ts`; mặt hàng, chi nhánh: chưa gọi) | trả câu "đang dùng ở …" (vd `"2 hợp đồng"`) hoặc `null`; có câu thì Core từ chối xoá (`CONFLICT`). Chạy bằng vai trò `mod_<key>_rw`, chỉ đọc; module tắt ở đơn vị thì không hỏi | 200 ms |
| `ledger.previewSource` | Kernel dựng mô tả chứng từ gốc cho màn sổ (**chưa có**) | trả nhãn, đường dẫn | 100 ms |

Kiểm trước khi chứng từ **của chính module** chuyển trạng thái (vd tổng kỳ = giá trị hợp đồng) **không phải hook**: chứng từ của module do action của module chuyển (`loadWorkflow` + `plan`), nên kiểm ngay trong action đó và ném `Errors.validation` (1.3.0 bỏ `document.beforeTransition`).

Không có hook nào cho phép module: đổi bút toán, đổi tài khoản, chặn ghi sổ của module khác, sửa dữ liệu trong giao dịch của Core.

## 5. API

- **Thông báo trong ứng dụng** (năng lực `notify.inapp`, 1.3.0): `ctx.notify.send({ to: { permission } | { userId }, title, body?, link?, dedupeKey? })` trong action và subscriber; nguồn = module. Người dùng xem ở chuông trên thanh trên cùng (`GET /api/v1/notifications`, `POST /api/v1/notifications/read`). Không có cửa HTTP cho module gửi thông báo.

- Mọi route của module sinh từ action, nằm dưới `/api/v1/m/<key>/…` (phân hệ hiện có giữ đường dẫn cũ trong major 1).
- Module gọi action của module khác hoặc của Core bằng `ctx.actions.call(id, input)`: vẫn qua quyền, idempotency, bằng chứng như gọi từ ngoài, với `actor` là người dùng gốc và `via: 'module:<id>'`.
- Action công khai của Core cho module (v1): `core.partner.upsert`, `core.product.upsert` (**có** 2026-11-02 — `POST /api/v1/partners/upsert`, `/products/upsert`, quyền `catalog:write`, dùng cho `seed[]`), `core.partner.get`, `core.product.get`, `core.branch.list`, `core.payment-method.list`, `core.notify.send` (thông báo trong ứng dụng; qua Cell nếu có).

## 6. Quyền và cấu hình

- Quyền: khai ở `permissions[]` của manifest, tiền tố `<key>:`; Core gộp vào registry khi bật module; vai trò mặc định gán theo `roles`. Màn "Phân quyền" hiện quyền theo nhóm module.
- Cấu hình: khoá `bizcity.<key_>.<tên>` khai trong registry ([BIZCITY-SETTINGS-MATRIX-v1.md](BIZCITY-SETTINGS-MATRIX-v1.md)) với kiểu, mặc định, phạm vi (đơn vị / chi nhánh / người dùng). Đọc bằng `ctx.settings.get()`; không đọc / ghi `tenants.settings` trực tiếp.

## 7. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-EXT-1 | 0 | Module chỉ cắm vào điểm có trong §3–§6 (app ngoài tiến trình: §3a). Không vá, không ghi đè thành phần Core, không monkey-patch | CONF-STATIC-1, CONF-MAN-7 |
| STD-EXT-2 | 0 | Hook không ghi dữ liệu, không gọi mạng, chạy trong thời gian tối đa; quá giờ = coi như không có ý kiến (`referenceCheck` quá giờ = **chặn xoá**, an toàn) | CONF-RUN-15 |
| STD-EXT-3 | 1 | Màn và slot chỉ import `@bizcity/ui-kit`, `@bizcity/module-sdk/web` và thư viện ngoài | CONF-STATIC-1 |
| STD-EXT-4 | 1 | Module có tham chiếu mã danh mục chuẩn (STD-DATA-6) phải khai `masterdata.referenceCheck` | CONF-MAN-8 |
| STD-EXT-5 | 1 | Chức năng dùng AI (`ai.cell`) phải có đường lui khi không có Cell: ẩn nút hoặc báo "Cần kết nối Bizcity Cell", không lỗi | CONF-RUN-16 (chạy không có Cell) |
| STD-EXT-6 | 2 | Văn bản giao diện tiếng Việt có dấu; mã màn (vd `HD01`) theo quy ước đặt tên | review |

## 8. Kiểm tương thích

Bộ tương thích (`tests/conformance/`, chạy bằng `bizcity module check`) là **hợp đồng ngược**: Core hứa mọi bản phát hành trong major 1 đều qua bộ này với mọi module đã qua nó trước đó.

| Nhóm | Kiểm |
|---|---|
| Khởi động | bật module trên Core sạch; tắt; bật lại; không lỗi, không cảnh báo năng lực |
| Migration | chạy trên CSDL rỗng và trên CSDL mẫu có dữ liệu của bản module trước |
| Quyền | mỗi action: không quyền → 403; khác đơn vị → không thấy dữ liệu |
| Idempotency | mỗi action ghi: gửi 2 lần cùng khoá → 1 kết quả, 1 bằng chứng |
| Sự kiện | mỗi subscriber: giao 2 lần → 1 hiệu ứng |
| Sổ cái | sau toàn bộ kịch bản: `assertLedgerInvariants` (Nợ = Có, số dư khớp, đảo một lần) |
| Slot | dựng từng slot với props mẫu, không ném lỗi |
| Không Cell | toàn bộ kịch bản trên chạy khi không có biến Cell |

Danh sách đầy đủ có mã: [../standard/CONFORMANCE.md](../standard/CONFORMANCE.md).
