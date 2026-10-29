# `bizcity_module@1` — Module Contract

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** [Bizcity Framework Standard v1](../standard/README.md) (hợp đồng 1/7)
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
| `kind` | ✓ | `module` \| `addin` | add-in không có `data`, `documents` |
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
| `ledger.submits[]` | | `docType` kế toán module nộp, khi nào | chặn nộp loại không khai |
| `settings[]` | | khoá cấu hình `bizcity.<key_>.<tên>` | [Settings](BIZCITY-SETTINGS-MATRIX-v1.md) |
| `extensions` | | `menu`, `slots`, `hooks`, `print` | [Extension](BIZCITY-EXTENSION-v1.md) |
| `ui` | | `icon` (lucide), `color`, `order` | lưới ứng dụng |
| `waivers[]` | | miễn trừ luật Tier 1: `rule`, `reason`, `adr` | bộ kiểm bỏ qua đúng luật đó, in ra báo cáo |

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
- **Tắt** theo đơn vị: route trả `FORBIDDEN` với lời nhắn "Module chưa bật", subscriber ngừng nhận, sự kiện dồn lại trong outbox tới khi bật lại hoặc hết hạn giữ.
- **Gỡ** không bao giờ đụng dữ liệu Kernel: bút toán module đã nộp vẫn còn (sổ chỉ thêm). Gỡ module có chứng từ đã ghi sổ phải huỷ bằng bút toán đảo trước, hoặc giữ nguyên.

## 6. Chuyển dần từ code hiện tại

1. Thêm `bizcity.module.json` cho 9 phân hệ hiện có (`ke-toan`, `quy`, `mua-hang`, `ban-hang`, `kho`, `tai-san`, `thue`, `api`, `he-thong`) và 3 add-in; `id` dạng `bizcity.<key>`. Chưa ai đọc: chỉ để test so khớp.
2. Test: mỗi `phan-he/<key>/` có manifest hợp lệ; `owners` khớp `CODEOWNERS`; bảng bị ghi (grep) nằm trong `data.tables`. Bước này sẽ **đỏ** cho A-17 → liệt vào `waivers` có hạn kèm ADR.
3. `GET /api/v1/system/modules` trả manifest; `ApiModule` / `WebModule` / `AddInManifest` sinh từ manifest.
4. Registry quyền đọc `permissions[]` (năng lực `permissions.module`).

## 7. Nhật ký

- **1.0.0-draft (2026-10-29):** Viết lại cho Standard v1: thêm `id`, `standard`, `requires`, `data`, `documents`, `actions`, `events`, `ledger`, `extensions`, `waivers`; bỏ `requiresCore` (module không khai phiên bản Kernel, xem VERSIONING), bỏ `emits` (thay bằng `ledger.submits` và `events.emits`).
