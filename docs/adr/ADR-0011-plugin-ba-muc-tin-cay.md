# ADR-0011 · Plugin theo ba mức tin cậy: trong mã nguồn bản cài, app ngoài tiến trình, gói ký — không drop-in
<!-- [2026-11-01 10:16 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — plugin ba mức tin cậy (trong mã nguồn bản cài · app ngoài tiến trình + iframe · gói ký Phase 5), cấm drop-in, D1–D6 vòng đời / hash / migration bằng vai trò CSDL / submit / SDK -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) quyết 2026-11-01: "đồng ý phương án. Core hướng tới cho dev tự selfhost nên plugins là một dạng chuẩn hoá, bổ sung các cơ chế API nội bộ, tuân thủ theo luật event-driven, luật ghi sổ, iframe… là ok"
- Ngày: 2026-11-01 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K0** cho ADR này (chưa đổi mã); việc thi hành chạm Kernel ghi mức ở từng PR (§Hệ quả)
- Luật / hợp đồng liên quan: bốn câu không thương lượng (AGENTS.md), AP-1, AP-3, R-BOUND, R-OUTBOX, R-TEN, R-SEC-6, STD-EXT-1…6, [`bizcity_module@1`](../contracts/BIZCITY-MODULE-v1.md), [`bizcity_extension@1`](../contracts/BIZCITY-EXTENSION-v1.md), [`bizcity_connector@1`](../contracts/BIZCITY-CONNECTOR-v1.md), [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), [`bizcity_event@1`](../contracts/BIZCITY-EVENT-v1.md)
- Nguồn: [AUDIT-2026-11-01-PLUGIN-MVP](../audits/AUDIT-2026-11-01-PLUGIN-MVP.md) §1, §6.2

## Bối cảnh

Mục tiêu: hệ sinh thái plugin có **trải nghiệm** như WordPress (tìm → cài → bật → nâng cấp → tắt, không sửa Core) nhưng giữ bất biến kế toán và an toàn đa đơn vị. Core hướng tới **developer tự host**: người cài bản Core thường cũng là người viết hoặc chọn plugin; một bản cài vẫn có thể phục vụ nhiều đơn vị (công ty dịch vụ kế toán, chuỗi cửa hàng).

Audit 2026-11-01 cho thấy plugin runtime mới ~15%: manifest chỉ có schema, lắp module tĩnh theo mảng import, bật / tắt theo biến môi trường của tiến trình.

Câu hỏi phải chốt trước khi viết runtime: **mã của ai được chạy ở đâu, với quyền gì.**

### Vì sao không drop-in

"Drop-in" = chép mã vào thư mục và tiến trình tự nạp. Trong tiến trình Node.js của Core, **không có ranh giới bảo mật nào giữa plugin và Kernel**:

| Mã plugin làm được | Bảo vệ hiện có không đỡ được vì |
|---|---|
| import đường con `@bizcity/kernel/modules/ledger/ledger.service`, gọi `ledgerService.post` | SC-KERNEL-6 là kiểm tĩnh trong CI; `exports` của gói vẫn mở `./*` lúc chạy |
| `set_config('bizcity.tenant_id', '<đơn vị khác>' \| '')` | RLS dựa trên biến phiên mà chính phiên đặt được; rỗng = mở (`0041:13-16`) |
| vá đối tượng `ledgerService`, `postDocumentIn`, pool `pg` đã nạp | cùng heap JS |
| đọc `process.env` (`JWT_SECRET`, mật khẩu CSDL), ký JWT cho đơn vị bất kỳ | cùng tiến trình |
| migration `DROP TRIGGER`, `ALTER TABLE ledger_lines` | migration chạy bằng owner; quyền DDL = gỡ được mọi bất biến |
| `postinstall` của `node_modules` đi kèm | chuỗi cung ứng không ai rà |

Thêm ba lý do riêng của hệ kế toán đa đơn vị: một tiến trình phục vụ nhiều đơn vị (drop-in của một đơn vị = chạy mã trên dữ liệu mọi đơn vị); kiểm toán phải truy được **mã nào** sinh bút toán (mã tự nạp không có hash cố định); triển khai nhiều bản sao từ image bất biến (chép tệp vào một container làm các bản sao lệch nhau).

Kết luận: **mã chạy trong tiến trình phải là mã được tin; mở cho người lạ thì cách ly bằng ranh giới tiến trình, không bằng quy ước.**

## Quyết định

### D3 · Ba mức tin cậy (quyết định chính)

| Mức | Là gì | Chạy ở đâu | Ai tin | Giao diện | Khi nào |
|---|---|---|---|---|---|
| **1. Module trong mã nguồn bản cài** | `modules/<key>/` nằm trong mã nguồn mà người tự host build ra image: repo gốc, fork, hoặc monorepo riêng của họ | trong tiến trình API, dùng `@bizcity/module-sdk` | **người triển khai** (họ build, họ chịu) + bộ kiểm `--module` bắt buộc trong build | màn React trong `apps/web` qua ui-kit, slot | **MVP** |
| **2. App ngoài tiến trình** | dịch vụ riêng (ngôn ngữ bất kỳ) nói chuyện với Core **chỉ** qua API công khai | tiến trình / máy khác | không cần tin: quyền = phạm vi khoá API | **iframe** trong slot / menu | **MVP** |
| 3. Gói ký trong tiến trình | gói tải từ registry, có chữ ký của nhóm duyệt | trong tiến trình | registry + chữ ký + danh sách thu hồi | như mức 1 | **Phase 5** (sau 5.7: ≥ 2 developer ngoài) |

Bị loại: cài từ nguồn bất kỳ gắn nhãn "chưa kiểm" (drop-in trá hình); sandbox trong tiến trình (`vm` của Node không phải ranh giới bảo mật; `isolated-vm` / WASM thêm lớp trừu tượng khi chưa cần).

Hệ quả giấy phép (cần luật sư xác nhận trước Beta): dự án GPL-2.0-or-later; module mức 1 / 3 liên kết trong tiến trình theo cách hiểu phổ biến là tác phẩm phái sinh → GPL. App mức 2 chỉ gọi API → có thể là phần mềm thương mại. Mức 2 là cửa cho nhà phát triển thương mại.

### Mức 2 — hợp đồng app ngoài tiến trình

App mức 2 tuân **cùng luật** với module trong tiến trình; chỉ khác đường đi:

| Việc | Module mức 1 | App mức 2 | Đã có / thiếu |
|---|---|---|---|
| Ghi sổ | `ctx.ledger.submit(...)` trong giao dịch action | `POST /api/v1/actions/core.document.submit` + `Idempotency-Key`, nhận receipt | cửa nạp có (idempotent theo `docKey` + version); **thiếu** bọc action + receipt (P1-2) |
| Dữ liệu chuẩn | `ctx.actions.call('core.partner.get', …)`, `bizcity_read.*` | cùng action qua HTTP | có (action `core.*`, MCP) |
| Phản ứng sự kiện | `defineSubscriber` | **webhook**: Core đẩy sự kiện outbox tới `url` của app, ký HMAC-SHA256, thử lại theo `event_deliveries` | outbox, retry, dead có; **thiếu** subscriber `core.webhook` cho từng app |
| Kéo chứng từ từ nguồn | — | hợp đồng CONNECTOR (Core kéo + báo nhận) | có |
| Quyền | `permissions[]` của manifest | khoá API của app, **phạm vi** = `permissions[]` + `events.subscribes[]` của manifest app, gắn một đơn vị | khoá có; **thiếu** phạm vi theo module |
| Giao diện | màn React, slot | **iframe** ở `extensions.menu` / `extensions.slots` (§iframe) | **thiếu** |
| Bằng chứng | `actor` = người dùng, `via: module:<id>` | `actor_kind: 'apikey'`, `via: app:<id>` | cột có (0036) |

**iframe** (giao diện mức 2):

- Manifest app khai `ui.origin` (một origin `https://…`); Core chỉ nhúng origin đó (`frame-src` theo manifest đã bật), iframe có `sandbox="allow-scripts allow-forms allow-same-origin"` (không `allow-top-navigation`).
- Không gửi cookie phiên của Core vào iframe. Core cấp **vé ngắn hạn** (≤ 5 phút, ký, gắn đơn vị + người dùng + app) qua `postMessage`; app đổi vé lấy ngữ cảnh qua API, không đọc được phiên.
- Giao thức `postMessage` đóng: `bizcity.context` (Core → app: vé, đơn vị, chi nhánh, ngôn ngữ, giao diện sáng / tối), `bizcity.navigate`, `bizcity.toast`, `bizcity.resize` (app → Core). Kiểm `event.origin` hai chiều.
- Slot nhận cùng tham số như module mức 1 (`partnerCode`, `docKey`…) — STD-EXT bảng §3 giữ nguyên.

### D1 · Hai mức bật

- `module_registry` (cấp máy chủ: cài, phiên bản, hash, trạng thái) — do quản trị bản cài; `tenant_modules` (cấp đơn vị: bật / tắt) — do chủ đơn vị.
- Cài / gỡ / nâng cấp mã mức 1 = **build lại + khởi động lại** (rolling), không nạp nóng. Bật / tắt cho đơn vị đổi ngay (đọc `tenant_modules`, cache ngắn, xoá cache bằng sự kiện `bizcity.module.toggled`).
- Tắt cho đơn vị: route trả `MODULE_DISABLED` (`Errors.moduleDisabled` đã có, nay được gọi); subscriber **bỏ qua** sự kiện của đơn vị đó (giao `skipped`, không `dead`; bật lại không tự phát lại — quản trị chạy `events replay` nếu muốn); webhook app mức 2 ngừng; **dữ liệu và bút toán giữ nguyên** — tắt module không bao giờ đụng sổ.
- Gỡ hẳn là việc riêng: xuất dữ liệu → `DROP SCHEMA mod_<key>`; bút toán đã ghi ở lại (thuộc Kernel), vẫn huỷ / đảo được qua Kernel.

### D2 · Chỉ nạp module `active` và đúng hash

- Hash SHA-256 tính trên **bản build** của module (`dist`, sắp tệp theo đường dẫn) lúc `bizcity module install / upgrade`, lưu ở `module_registry`.
- Khởi động: module có `status = active` và hash khớp mới nạp; lệch → **bỏ riêng module đó** (không sập API), ghi log lỗi, chẩn đoán DG-MOD-1 báo đỏ.
- `module_hash` ghi cùng `module_id`, `module_version` vào bằng chứng (`audit_logs`, đã có hai cột sau) → bút toán truy được tới bản mã đã nộp.
- Dev: `BIZCITY_DEV_MODULES=<key,…>` bỏ kiểm hash, cảnh báo lớn khi khởi động; **cấm** khi `NODE_ENV=production`.

### D4 · Migration của module: chặn bằng quyền PostgreSQL, không bằng phân tích SQL

- Thư mục `modules/<key>/migrations/NNNN_*.sql`; `schema_migrations` thêm cột `module` (Core = `NULL`).
- Trình cài (owner) tạo một lần vai trò `mod_<key>_owner`: sở hữu **chỉ** schema `mod_<key>`, `USAGE` trên `bizcity_read`, **không** quyền trên `public`. Migration module chạy bằng `SET ROLE mod_<key>_owner` → PostgreSQL tự chặn mọi lệnh ra ngoài schema (kể cả `DO $$ … EXECUTE`).
- Sau migration, trình cài kiểm danh mục: mọi bảng trong `mod_<key>` có `tenant_id`, `relrowsecurity` và `relforcerowsecurity`; thiếu → **không cho bật**.
- Runtime: module đọc / ghi bảng của mình bằng vai trò `mod_<key>_rw` (roadmap 3.10); bảng Kernel chỉ qua cổng.
- Chỉ chạy tiến (như Core). Phân tích SQL giữ làm **lint** trong CI để báo sớm, không làm hàng rào.
- Migration chỉ chạy qua `bizcity module install / upgrade` (job triển khai), **không** khi API khởi động.

### D5 · Ghi sổ duy nhất qua `submit`

- Mức 1: `ctx.ledger.submit({ docType, docKey, version, reasonCode, lines, … })`; mức 2: action `core.document.submit` qua HTTP. Cùng một đường vào Kernel: `postDocumentIn` → luật định khoản → `ledgerService.post`. Trả `{ status, eventId, receipt }`.
- Kernel ép: `docKey` có tiền tố `<module>:` và `source_module` = module gọi → module không ghi đè, không huỷ chứng từ của module khác.
- Chỉ `docType` có sẵn + `reasonCode` từ gói định khoản (dữ liệu, không phải mã). Cần `docType` mới → đề xuất bậc 4.

### D6 · SDK = xuất lại có chọn lọc + `defineModule`

- `@bizcity/module-sdk` xuất lại **tập chọn lọc** của Platform (`defineAction`, `defineSubscriber`, kiểu `ActionContext`, `Errors`), không `export *`; thêm `defineModule({ manifest, actions, subscribers, onActivate? })`.
- Không hook cài đặt dạng mã (`onInstall`, `onUpgrade`) trong MVP: cài / nâng cấp chỉ là dữ liệu khai báo (migration SQL, khoá cấu hình, gói định khoản). Giữ `onActivate(tenant)` chạy với `ctx` đã gắn đơn vị.
- Luật dò mới: module chỉ import `@bizcity/module-sdk` (và thư viện ngoài), không `@bizcity/platform` / `@bizcity/kernel`.
- App mức 2 không cần SDK; Core phát OpenAPI + danh sách sự kiện + schema webhook (đã có OpenAPI từ action).

## Hệ quả

**Được:** người tự host viết module của riêng mình mà không xin ai duyệt (mức 1), vẫn bị bộ kiểm và CSDL giữ luật; người lạ / thương mại làm app không chạm được CSDL (mức 2); bút toán truy được tới bản mã; không thêm lớp sandbox, không SDK song song.

**Mất:** không có "tải plugin từ chợ về bấm cài" trước Phase 5; app mức 2 không ghi dữ liệu của nó và sổ trong cùng một giao dịch (bù bằng idempotency `docKey`); module mức 1 cần build lại để cài.

**Việc phải làm** (thay §7 audit; mỗi dòng một PR):

| PR | Việc | Mức Kernel | Lộ trình |
|---|---|---|---|
| PR-P0 | P0-1 trigger `ledger_entries` / `accounting_event*`; P0-2 đơn vị cho subscriber; P0-3 `ketoan_app` mặc định | K2 | 2.1 / 3.4 / 0.7 |
| PR-1 | manifest cho 9 phân hệ + 3 add-in; `GET /system/modules` đọc manifest | K0 | 3.2 |
| PR-2 | `@bizcity/module-sdk` v0.1 (D6), action `core.document.submit` + receipt, `ctx.ledger.submit` (D5), `ctx.settings.get` | K1 | 3.1, 3.6 |
| PR-2b | **app mức 2**: phạm vi khoá theo module, subscriber `core.webhook` (HMAC), vé iframe + giao thức `postMessage`, slot iframe | K0 | **3.14** |
| PR-3 | `module_registry`, `tenant_modules`, lệnh install / activate / deactivate / upgrade, nạp theo hash (D1, D2) | K0 | **3.13** |
| PR-4 | migration theo module bằng `mod_<key>_owner` / `_rw` (D4) | K0 | 3.10 |
| PR-5 | starter + `modules/pos-mini` (mức 1) + app mẫu mức 2 tối thiểu; lane `runtime` trong CI | K0 | 4.1–4.3 |
| PR-6 | launcher "＋ Thêm phân hệ", trang Phân hệ (mức 1 + app mức 2 cùng một danh sách) | — | 3.8 |

Hợp đồng cập nhật cùng PR thi hành: `bizcity_module@1` (`ui.origin`, `kind: "app"`), `bizcity_extension@1` (slot iframe, giao thức `postMessage`), `bizcity_event@1` (webhook), `bizcity_ledger_intake@1` (receipt).

## Phương án đã cân nhắc

| Phương án | Vì sao không |
|---|---|
| Drop-in như WordPress | không có ranh giới trong tiến trình (§Bối cảnh) |
| Chỉ mức 1 | đóng cửa với nhà phát triển thương mại và ngôn ngữ khác JS |
| Gói ký trong tiến trình ngay MVP | chữ ký chứng minh **nguồn gốc**, không **giới hạn hành vi**; cần hạ tầng khoá, thu hồi, registry trước khi có người dùng |
| Sandbox trong tiến trình (`vm`, `isolated-vm`, WASM) | `vm` không an toàn; còn lại thêm lớp trừu tượng lớn khi chưa có nhu cầu đo được |
| Chặn migration bằng phân tích SQL | lách được bằng SQL động; quyền PostgreSQL chặn chắc hơn và rẻ hơn |
