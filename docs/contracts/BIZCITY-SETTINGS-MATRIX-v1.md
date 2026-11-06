# `bizcity_settings@1` — Registry và cách đọc cấu hình
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

<!-- [2026-11-06 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — 1.1.0-draft: chữ chốt E2 (S029-10) — kho giá trị cấu hình kiểu options có phạm vi, hiệu lực, phiên bản, chỉ thêm; một đường đọc / ghi; config_version (ADR-0028 D028-7 / D028-8) -->

> **Phiên bản:** 1.1.0-draft · 2026-11-06 (1.0.0-draft · 2026-10-28) · **Trạng thái:** Đề xuất — §2 là **chữ chốt E2** ([PHASE-029 · 30 §5](../phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/30-LO-TRINH-NEN-MONG.md)); registry đã có
> **Luật:** [R-MATRIX](../rules/RULE-SETTINGS-MATRIX.md) · **Registry:** [bizcity-settings.registry.json](bizcity-settings.registry.json)

## 1. Một mục registry

```json
{
  "key": "bizcity.posting.modes",
  "class": "A",
  "owner": "core",
  "scopes": ["tenant", "doc_type"],
  "storage": "tenants.settings.postingModes",
  "type": "object<docType, 'auto'|'approve'>",
  "schema": "postingModesSchema (@ketoan/contracts)",
  "default": "mọi loại = approve",
  "readBy": "readPostingModes() — core/posting-modes.ts",
  "writeBy": "PUT /api/v1/settings/posting-modes",
  "permission": "settings:write",
  "audit": "settings.posting-modes",
  "affectsPosting": true
}
```

| Trường | Nghĩa |
|---|---|
| `key` | `bizcity.<miền>.<khoá>` |
| `class` | `A` ảnh hưởng sổ · `B` vận hành · `C` hiển thị (R-MATRIX-1) |
| `owner` | `core` hoặc `key` phân hệ |
| `scopes` | tập con của `install`, `tenant`, `accounting_unit`, `branch`, `period`, `doc_type`, `record` (thứ tự hẹp dần) |
| `storage` | nơi lưu vật lý (biến môi trường, đường dẫn JSON, bảng.cột) |
| `schema` | khuôn zod kiểm giá trị |
| `default` | giá trị khi chưa khai |
| `readBy` / `writeBy` | hàm đọc duy nhất / endpoint ghi |
| `permission` | quyền để ghi |
| `audit` | `action` ghi vào `audit_logs` |
| `affectsPosting` | `true` → màn sửa phải báo "áp cho lần định khoản sau" |
| `valueType` (1.1) | khuôn máy đọc của giá trị: `boolean` · `integer[min..max]` · `string` · `string[]` · `enum(a\|b\|c)` · `enum[](a\|b)` (mảng con của tập). Khoá **có** `valueType` mới ghi / đọc được qua đường chung §2; khoá chưa có (khoá có bí mật như `connector.connections`, khoá khuôn phức như `posting.modes`) giữ đường riêng tới đợt 2 |

## 2. Một đường đọc, một đường ghi (chữ chốt E2, 1.1.0-draft)

Học **cách tổ chức** của `options` WordPress (một kho khoá / giá trị, đọc một hàm, ghi một hàm, cờ nạp sẵn), **không** học cách ghi đè: mỗi lần ghi là một **phiên bản mới** có phạm vi, ngày hiệu lực, người ghi, lý do (ECP-03, LEAN-4).

### 2.1 Kho giá trị `setting_values` (migration mới — số lấy bằng `so-tiep-theo`, chỉ thêm)

| Cột | Nghĩa |
|---|---|
| `id` | `bigint` identity |
| `tenant_id` | đơn vị; RLS `tenant_isolation` |
| `key` | khoá registry |
| `scope_type` · `scope_id` | `tenant` (`scope_id = ''`) · `accounting_unit` · `branch` · `user` (`scope_id` = định danh dạng chữ) |
| `value` | `jsonb` (đã kiểm theo `valueType`) |
| `valid_from` | ngày hiệu lực (giờ Việt Nam) |
| `version` | tăng dần theo `(tenant_id, key, scope_type, scope_id)` |
| `reason` | lý do; bắt buộc ≥ 3 ký tự với khoá loại A hoặc khi `valid_from` lùi về trước hôm nay |
| `created_by` · `created_at` | người ghi (`user:<id>` / `apikey:<id>`), lúc ghi |

- Trigger chặn `UPDATE` / `DELETE` / `TRUNCATE` (chỉ thêm — lịch sử chính là bảng). Chỉ mục duy nhất `(tenant_id, key, scope_type, scope_id, version)`.
- `tenants.config_version bigint` tăng 1 mỗi lần ghi qua `settings.set` — khoá huỷ bộ nhớ đệm cấu hình của đơn vị (R-CACHE); trả kèm mọi lần đọc qua API.

### 2.2 Đọc — `getSetting(trx, tenantId, key, scope?)`

`scope = { accountingUnitId?, branchId?, userId?, date? }` (`date` mặc định hôm nay giờ Việt Nam). Giải từ **hẹp → rộng** trong các phạm vi registry cho phép: `user` → `branch` → `accounting_unit` → `tenant` → `default` của registry. Ở mỗi phạm vi lấy dòng `valid_from ≤ date` mới nhất (`valid_from` rồi `version` giảm dần).

- **Khoá đang lưu ở `tenants.settings.<đường>`** (11 khoá hôm nay): ở phạm vi `tenant` với ngày hôm nay, giá trị **hiện hành** là nhánh JSON cũ (đường đọc cũ vẫn đúng); `setting_values` là lịch sử, phạm vi hẹp và đọc theo ngày quá khứ. `set` ở phạm vi `tenant` hiệu lực ≤ hôm nay **ghi song song** vào nhánh JSON đó (mirror). Khoá này **không** nhận `valid_from` tương lai ở đợt 1 (đường đọc cũ không biết ngày).
- **Khoá mới lưu `setting_values`** (`storage: "setting_values"`): không mirror, nhận `valid_from` tương lai.
- Trả `{ key, value, source: { scope, scopeId, validFrom, version } | 'legacy' | 'default', configVersion }`.
- `ctx.settings.get(key)` của module giữ chữ ký, giải qua hàm này ở phạm vi `tenant` (luật chủ sở hữu giữ nguyên).

### 2.3 Ghi — `setSetting(trx, actor, key, value, { scope, scopeId, validFrom?, reason? })`

Kiểm theo thứ tự, lỗi bằng `Errors.*`: khoá có trong registry và có `valueType` · phạm vi nằm trong `scopes` của khoá · giá trị đúng `valueType` · quyền (`settings:write` ở action + `permission` riêng của khoá; đợt 1 ghi mọi phạm vi kể cả `user` đều cần `settings:write` — người dùng tự đổi tuỳ chọn của mình là đợt 2) · lý do khi bắt buộc · khoá mirror không nhận ngày tương lai. Rồi: thêm dòng (phiên bản kế), mirror nếu có, tăng `config_version`, `writeAudit('settings.set', trước / sau)`.

### 2.4 HTTP (Core, `defineAction` cho đường ghi)

| Route | Quyền | Việc |
|---|---|---|
| `GET /api/v1/settings/values` | đăng nhập | các khoá có `valueType`: lớp, phạm vi, giá trị hiện hành ở phạm vi đơn vị, `configVersion` |
| `GET /api/v1/settings/values/:key` | đăng nhập; `userId` người khác cần `settings:write` | giá trị hiệu lực theo `?branchId&accountingUnitId&userId&date` (không truyền `userId` = chính người gọi) và nguồn |
| `GET /api/v1/settings/values/:key/history` | đăng nhập | mọi phiên bản (người, lúc, lý do, hiệu lực, phạm vi) |
| `PUT /api/v1/settings/values/:key` — action `core.settings.set` | `settings:write` + quyền của khoá | ghi theo §2.3; `ai: 'deny'`, `mcp: false` |

### 2.5 Đợt 2 (không làm ở đợt 1)

Chuyển các route ghi riêng (`/settings/posting-modes`, `/settings/data-lock`, `/settings/item-auto-create`, mua hàng) sang `setSetting`; `valueType` cho module (`modules/<key>/settings.registry.json`); phép kiểm chặn đọc thô `tenants.settings`; xuất / nhập §3; đọc có đệm theo `config_version`.

## 3. Xuất / nhập (nhân bản sang doanh nghiệp khác) — đợt 2, đề xuất

`GET /api/v1/settings/export` → `{ contract: "bizcity_settings@1", values: { "<key>": … } }` chỉ gồm khoá registry có `scopes ∋ tenant`; `POST /api/v1/settings/import` kiểm từng khoá bằng `schema`, bỏ khoá lạ, ghi qua `set`.

Gói danh mục chuẩn (tài khoản, lý do, nhóm hạch toán…) đi kèm qua `default-data` (R-MD-7), không qua đây.
