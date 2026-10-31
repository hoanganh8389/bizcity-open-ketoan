# `bizcity_settings@1` — Registry và cách đọc cấu hình
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> **Phiên bản:** 1.0.0-draft · 2026-10-28 · **Trạng thái:** Đề xuất (registry đã có, hàm đọc chung ở Giai đoạn 2)
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

## 2. Hàm đọc chuẩn (Giai đoạn 2)

```ts
// core/settings.ts
settings.get<K extends SettingKey>(trx, key: K, scope: { tenantId; branchId?; docType?; date? }): SettingValue<K>
settings.set<K extends SettingKey>(trx, auth, key: K, value: SettingValue<K>, scope): void   // kiểm quyền + zod + audit + lịch sử
```

- `get` đi từ phạm vi hẹp nhất có giá trị ra rộng (R-MATRIX §3), cuối cùng là `default`.
- `set` ghi `config_settings_history (tenant_id, key, scope, before, after, actor, at)`.
- Phân hệ gọi qua `ModuleContext.settings` và chỉ thấy khoá của mình + khoá lõi class C.

## 3. Xuất / nhập (nhân bản sang doanh nghiệp khác)

`GET /api/v1/settings/export` → `{ contract: "bizcity_settings@1", values: { "<key>": … } }` chỉ gồm khoá registry có `scopes ∋ tenant`; `POST /api/v1/settings/import` kiểm từng khoá bằng `schema`, bỏ khoá lạ, ghi qua `set`.

Gói danh mục chuẩn (tài khoản, lý do, nhóm hạch toán…) đi kèm qua `default-data` (R-MD-7), không qua đây.
