# `bizcity_module@1` — Module Contract
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 10:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — 1.1.0-draft: ledger.submits[].reasons (kind, default, suggestedPacks). -->
<!-- [2026-11-01 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.1.1-draft: waivers bắt buộc expires, chỉ miễn luật đặt tên; §6 bước 1–3 có (12 manifest, SC-MOD-3 block, GET /system/modules?detail=true) -->
<!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.2.0-draft: kind "app" (app ngoài tiến trình, ADR-0011 mức 2): app.scopes, app.webhook.url, ui.origin / ui.entry; §3a -->
<!-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.3.0-draft: §5 vòng đời chạy thật (module_registry × tenant_modules, nạp theo hash, MODULE_DISABLED, skipped) -->
<!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.4.0-draft: trường seed[] (dữ liệu mẫu qua core.*.upsert, ADR-0015 Q4) -->

> **Phiên bản:** 1.4.0-draft · 2026-11-02 · **Trạng thái:** Đề xuất · **Thuộc:** [Bizcity Framework Standard v1](../standard/README.md) (hợp đồng 1/7)
> **JSON Schema:** [BIZCITY-MODULE-v1.schema.json](BIZCITY-MODULE-v1.schema.json) · **Ví dụ đầy đủ:** [../standard/examples/hop-dong.bizcity.module.json](../standard/examples/hop-dong.bizcity.module.json)
> **Thay thế:** `ApiModule` (`apps/api/src/phan-he/types.ts`), `WebModule`/`ModuleMeta` (`apps/web/src/phan-he/types.ts`, `packages/contracts/src/module.ts`), `AddInManifest` (`apps/api/src/core/addins.ts`)

## 1. Mục đích

Mỗi module có **một** tệp `bizcity.module.json` ở gốc thư mục module. Core đọc tệp này để quyết định có cho cài không, cấp quyền gì, dựng menu gì, cho ghi bảng nào, cho phát / nghe sự kiện nào. Không khai trong manifest = không được làm.

## 2. Hiện trạng

Một phân hệ hiện khai ở 5 nơi (A-25); quyền, bảng sở hữu, sự kiện, phụ thuộc phiên bản không khai ở đâu. Phân hệ và add-in là hai cơ chế khác nhau. Standard v1 gộp thành một: add-in là module có `kind: "addin"` (không có bảng, không có chứng từ).

## 3. Trường

| Trường | Bắt buộc | Nghĩa | Core dùng để |
|---|---|---|---|
| `contract` | ✓ | `"bizcity_module@1"` | chọn bộ kiểm |
| `id` | ✓ | `<nhà phát hành>.<key>`, vd `bizcity.mua-hang`, `acme.hop-dong`. Duy nhất toàn cục, không đổi suốt đời module | khoá đăng ký, bảng tương thích |
| `key` | ✓ | `^[a-z][a-z0-9-]{1,31}$`; trùng tên thư mục | đường dẫn `/api/v1/m/<key>/`, schema CSDL `mod_<key>` (gạch ngang → gạch dưới), tiền tố quyền, sự kiện |
| `kind` | ✓ | `module` \| `addin` \| `app` | add-in không có `data`, `documents`; app ngoài tiến trình: §3a |
| `version` | ✓ | SemVer | nâng cấp, migration |
| `label`, `description` | ✓ | tiếng Việt | lưới ứng dụng, `/system/modules` |
| `owners` | ✓ | tài khoản GitHub | sinh / kiểm `CODEOWNERS` |
| `standard` | ✓ | khoảng SemVer của Standard, vd `"^1.0"` | từ chối nếu lệch |
| `requires.capabilities` | ✓ (có thể rỗng) | năng lực cần ([VERSIONING.md §3](../standard/VERSIONING.md#3-năng-lực-capabilities)) | từ chối `CAPABILITY_MISSING` |
| `requires.modules` | | `{ "<id>": "<khoảng SemVer>" }` | thứ tự bật, từ chối nếu thiếu. **Chỉ** để nghe sự kiện / gọi action công khai của module đó, không import code |
| `permissions[]` | | quyền mới: `key` dạng `<key>:<việc>`, `label`, `roles` mặc định, `risk` (`low`/`high`) | đăng ký vào registry quyền; quyền `high` không cấp mặc định cho khoá API và AI |
| `data` | | `schema`, `tables[]`, `reads[]` (view `bizcity_read.*` cần đọc) | [Data](BIZCITY-DATA-v1.md): cấp GRANT, kiểm migration |
| `documents[]` | | loại chứng từ: `type`, `label`, `numbering`, `workflow`, `ledger` | [Document](BIZCITY-DOCUMENT-v1.md) |
| `actions[]` | | mã action công khai (chi tiết khai trong code) | đối chiếu code ↔ manifest; sinh MCP |
| `events.emits[]` / `events.subscribes[]` | | sự kiện phát / nghe | [Event](BIZCITY-EVENT-v1.md) |
| `ledger.submits[]` | | `docType` kế toán module nộp, khi nào; `reasons: { kind, default?, suggestedPacks? }` = lý do định khoản cần ([POSTING-TEMPLATE §7](BIZCITY-POSTING-TEMPLATE-v1.md)) | chặn nộp loại không khai; `reasons` sai loại / gói gợi ý không có lý do mặc định → SC-CON-2; lúc cài: `posting.reason.readiness` |
| `settings[]` | | khoá cấu hình `bizcity.<key_>.<tên>` | [Settings](BIZCITY-SETTINGS-MATRIX-v1.md) |
| `extensions` | | `menu`, `slots`, `hooks`, `print` | [Extension](BIZCITY-EXTENSION-v1.md) |
| `ui` | | `icon` (lucide), `color`, `order`; **chỉ app:** `origin`, `entry` (§3a) | lưới ứng dụng; khung nhúng app |
| `seed[]` | | dữ liệu mẫu hư cấu: `{ action: core.partner.upsert \| core.product.upsert, input }` (ADR-0015 Q4) | `POST /api/v1/system/modules/:key/seed` (quyền `catalog:write`, dry-run được) gọi từng action — có bằng chứng, chạy lại không trùng; module không ghi bảng danh mục |
| `app` | ✓ khi `kind: "app"` | `scopes[]`, `webhook.url` (§3a) | phạm vi khoá app, webhook |
| `waivers[]` | | miễn trừ luật Tier 1: `rule`, `reason`, `adr`, `expires` (**bắt buộc** ngoài ví dụ trong `docs/`) | bộ kiểm (SC-CON-2) bỏ qua đúng phát hiện của luật đó và in vào ghi chú bảng điểm; thiếu `expires` hoặc quá hạn thì báo, không miễn. Hiện miễn được: `STD-ACT-6` (tiền tố action). Luật về sự thật kế toán (docType, năng lực, schema) không miễn được |

## 3a. App ngoài tiến trình (`kind: "app"`, ADR-0011 mức 2)

App là dịch vụ riêng (ngôn ngữ bất kỳ, máy khác) nói chuyện với Core **chỉ** qua API công khai. Manifest nằm ở `apps/api/src/ung-dung/<key>/bizcity.module.json` của bản cài, không có mã chạy trong Core; thêm `<key>` vào `APP_KEYS` (`apps/api/src/ung-dung/index.ts`) rồi dựng lại. Không quét thư mục, không nạp manifest từ ngoài mã nguồn (ADR-0011 D3).

| Trường | Nghĩa | Core dùng để |
|---|---|---|
| `app.scopes[]` | quyền **Core** app xin: chỉ `catalog:read`, `documents:read`, `documents:write`, `ledger:read`, `reports:read` | chủ đơn vị đồng ý lúc kết nối → quyền của khoá app (`app_installations.permissions`). Quyền quản trị / duyệt / khoá kỳ / ghi danh mục không bao giờ cấp cho app. Dù quyền là gì, khoá app chỉ **ghi** qua cửa nạp (`POST /documents`, `/documents/batch`, `/documents/submit`, `/documents/cancel`) và đổi vé; route ghi khác trả `FORBIDDEN` (`APP_WRITE_ROUTES`, `core/auth.ts`) |
| `events.subscribes[]` | sự kiện app nhận qua webhook | subscriber `<key>.webhook` trên outbox ([Event §7a](BIZCITY-EVENT-v1.md)) |
| `app.webhook.url` | URL nhận webhook; bắt buộc khi có `events.subscribes` | POST phong bì sự kiện, ký HMAC |
| `ui.origin`, `ui.entry` | origin giao diện app (`https://host[:port]`, không đường dẫn) + đường vào (mặc định `/`) | khung nhúng ([Extension §3a](BIZCITY-EXTENSION-v1.md)); mục menu ở Tiện ích |

- App **không** khai `data`, `documents`, `actions`, `settings`, `extensions` (schema chặn). `permissions[]` (quyền mới) giữ nghĩa cũ; app xin quyền Core qua `app.scopes`.
- Khoá app nộp chứng từ chỉ `docKey` dạng `<key>:…`, `sourceSystem` = `<key>`, ở **mọi** cửa nạp (Kernel `postDocumentIn`), như `ctx.ledger.submit` của module mức 1 (ADR-0011 D5). Bằng chứng ghi `actor_kind: apikey`, `actor_via: app:<key>`.
- Kết nối, tắt / bật, đồng ý phạm vi mới, xoay khoá: [docs/api/ung-dung.md](../api/ung-dung.md). Khoá app trùng phân hệ / add-in → dừng khởi động. Bản cài gỡ manifest app → khoá app bị từ chối.

## 4. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-MOD-1 | 0 | Manifest hợp lệ theo JSON Schema; `key` trùng tên thư mục; `id` không trùng module đã cài | CONF-MAN-1 |
| STD-MOD-2 | 0 | Module chỉ làm những gì đã khai: ghi bảng trong `data.tables`, phát sự kiện trong `events.emits`, nộp `docType` trong `ledger.submits`, dùng quyền đã khai hoặc quyền Core | CONF-STATIC-2, CONF-RUN-* |
| STD-MOD-3 | 0 | Không import module khác, không import nội bộ gói Core (LAYOUT-2). Phụ thuộc module khác chỉ qua sự kiện và action công khai | CONF-STATIC-1 |
| STD-MOD-4 | 1 | Mọi action ghi phải gắn một quyền; quyền mới mang tiền tố `<key>:` | CONF-MAN-3 |
| STD-MOD-5 | 1 | `requires.capabilities` liệt kê **đủ** năng lực code dùng (bộ kiểm dò lời gọi `ctx.*`) | CONF-STATIC-5 |
| STD-MOD-6 | 1 | Tăng `version` khi có migration mới (≥ minor) hoặc đổi action / sự kiện công khai (major) | CONF-UPG-1 |
| STD-MOD-7 | 2 | Có `README.md` mô tả nghiệp vụ, luồng, sự kiện | review |

## 5. Vòng đời

```
khai báo ──► kiểm (bizcity module check) ──► cài (migration + GRANT + đăng ký quyền)
   ──► bật (theo đơn vị) ──► nâng cấp (migration mới + kiểm lại) ──► tắt ──► gỡ (giữ dữ liệu, tuỳ chọn xoá schema)
```

- **Cài** chỉ chạy được khi báo cáo kiểm khớp băm mã nguồn module ([CONFORMANCE.md §4](../standard/CONFORMANCE.md#4-cổng-cài-đặt)).

**Đang chạy (2026-11-02, PHASES 3.13, ADR-0011 D1, D2):**

| Mức | Bảng | Ai ghi | Hệ quả |
|---|---|---|---|
| Bản cài | `module_registry` (0052): phiên bản, `build_hash` (sha256 thư mục module), `status` installed / active / disabled, lịch sử | job cài đặt (`apps/api/src/db/setup.ts` → `syncBundled`) và lệnh `npm run module -w @ketoan/api -- list / sync / activate / deactivate / verify`, bằng vai trò sở hữu | API chỉ nạp module `active` có hash khớp; bản thật lệch hash → bỏ riêng module đó, ghi `last_load_result`, DG-MOD-1 đỏ. Registry trống → nạp như cũ (bản cài cũ) |
| Đơn vị | `tenant_modules` (0052); không có dòng = bật | action `core.module.enable` / `disable` (`users:write`, có bằng chứng, dry-run báo ảnh hưởng, phát `bizcity.module.toggled`) | route của module trả `MODULE_DISABLED` (route dùng chung chỉ chặn khi mọi module sở hữu đều tắt); `GET /system/modules` bỏ module tắt; sự kiện tới subscriber của module giao `skipped` |

- **Tắt** theo đơn vị: route trả `MODULE_DISABLED` (403), subscriber của module nhận việc giao `skipped` (không `dead`, không xử lý bù khi bật lại — phát lại bằng `core.events.replay` nếu cần). Dữ liệu, chứng từ, bút toán giữ nguyên. Module lõi (`ke-toan`, `he-thong`) không tắt được. Bật lại kiểm năng lực manifest cần (`planned` → `CAPABILITY_MISSING`).
- App ngoài tiến trình (`kind: "app"`) bật / tắt ở `app_installations` (§3a), không ở `tenant_modules`.
- **Gỡ** không bao giờ đụng dữ liệu Kernel: bút toán module đã nộp vẫn còn (sổ chỉ thêm). Gỡ module có chứng từ đã ghi sổ phải huỷ bằng bút toán đảo trước, hoặc giữ nguyên.

## 6. Chuyển dần từ code hiện tại

1. **Có (2026-11-01):** `bizcity.module.json` cho 9 phân hệ (`ke-toan`, `quy`, `mua-hang`, `ban-hang`, `kho`, `tai-san`, `thue`, `api`, `he-thong`) và 3 add-in; `id` dạng `bizcity.<key>`. API nạp lúc khởi động (`apps/api/src/core/module-manifest.ts`), lệch `key` / `label` / `kind` / `version` với mã thì dừng.
2. **Có, trừ so bảng:** SC-MOD-3 (block) — mỗi thư mục có manifest, `key` trùng thư mục, `kind` đúng chỗ, `owners` khớp `CODEOWNERS`; test `module-manifests.test.ts` — action khai = action đăng ký. A-17 ghi `waivers` STD-MOD-2 hạn 2027-03-31. **Chưa:** so bảng bị ghi (grep) với `data.tables` — làm cùng 3.13.
3. **Một phần:** `GET /api/v1/system/modules?detail=true` trả manifest tóm tắt (mặc định giữ mảng mã). **Chưa:** sinh `ApiModule` / `WebModule` / `AddInManifest` từ manifest — làm ở registry module (3.13, ADR-0011 D1–D2).
4. **Có (2026-11-02, PHASES 3.3):** registry quyền đọc `permissions[]` (năng lực `permissions.module`): đăng ký lúc khởi động, vai trò theo `roles`, `risk: high` không cho AI, action khai quyền lạ → dừng khởi động, `GET /api/v1/system/permissions`. Màn Phân quyền: PR-6. <!-- [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — §6 bước 4 có -->

## 7. Nhật ký

- **1.4.0-draft (2026-11-02):** thêm `seed[]` (tuỳ chọn, tương thích) — ADR-0015 Q4, PHASES 3.17.
- **1.3.0-draft (2026-11-02):** §5 vòng đời chạy thật: `module_registry` × `tenant_modules`, nạp theo hash, `MODULE_DISABLED`, sự kiện `skipped`, lệnh `module` (PHASES 3.13). Không đổi trường manifest.
- **1.2.0-draft (2026-11-02):** thêm `kind: "app"` (tương thích): `app.scopes`, `app.webhook.url`, `ui.origin`, `ui.entry`; schema chặn app khai `data` / `documents` / `actions` / `settings` / `extensions`, chặn module / add-in khai `app` / `ui.origin` (PHASES 3.14, ADR-0011 mức 2). SC-MOD-3 phủ `apps/api/src/ung-dung/<key>`.
- **1.1.1-draft (2026-11-01):** `waivers[].expires` bắt buộc ngoài ví dụ (schema giữ tuỳ chọn để ví dụ cũ hợp lệ; bộ kiểm ép); bộ kiểm miễn đúng luật đã khai, báo waiver thiếu hạn / quá hạn. §6 bước 1–2 có, bước 3 một phần (PHASES 3.2).

- **1.1.0-draft (2026-10-30):** thêm `ledger.submits[].reasons` (tuỳ chọn, tương thích): `kind`, `default`, `suggestedPacks` (PHASE-012 S012-4, năng lực `ledger.reasons.declare`).
- **1.0.0-draft (2026-10-29):** Viết lại cho Standard v1: thêm `id`, `standard`, `requires`, `data`, `documents`, `actions`, `events`, `ledger`, `extensions`, `waivers`; bỏ `requiresCore` (module không khai phiên bản Kernel, xem VERSIONING), bỏ `emits` (thay bằng `ledger.submits` và `events.emits`).
