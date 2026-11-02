# Module mẫu (`mau-module`)

> Module Bizcity viết bằng `@bizcity/module-sdk`, sinh từ `templates/starter-module`. Thay nội dung dưới đây bằng nghiệp vụ thật (STD-MOD-7).

## Nghiệp vụ

Một bảng bản ghi (`mod_mau_module.records`) theo đơn vị: lập mới, xem danh sách.

## Action

| Action | HTTP | Quyền |
|---|---|---|
| `mau-module.record.create` | `POST /api/v1/m/mau-module/records` | `mau-module:write` |
| `mau-module.record.list` | `GET /api/v1/m/mau-module/records` | `mau-module:read` |

## Sự kiện

Chưa phát, chưa nghe sự kiện nào.

## Màn

| Mã | Đường dẫn | Màn |
|---|---|---|
| MM01 | `/app/mau-module/ban-ghi` | Danh sách + thêm bản ghi |
