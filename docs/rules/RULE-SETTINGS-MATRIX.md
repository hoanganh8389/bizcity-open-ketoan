# RULE · Ma trận cấu hình (R-MATRIX)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> **Cấp:** Tier 1 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Hợp đồng:** [bizcity_settings@1](../contracts/BIZCITY-SETTINGS-MATRIX-v1.md) · **Registry:** [../contracts/bizcity-settings.registry.json](../contracts/bizcity-settings.registry.json)

"Ma trận" vì mỗi tham số có **hai trục**: *khoá* (cái gì) × *phạm vi* (áp cho đâu). Giá trị dùng thật = giá trị ở phạm vi hẹp nhất có khai, lùi dần ra rộng hơn.

## 1. Các phạm vi (từ rộng đến hẹp)

| Cấp | Phạm vi | Nơi lưu hiện tại | Ví dụ |
|---|---|---|---|
| S0 | **Hệ thống / bản cài** | biến môi trường (`config/env.ts`) | `BOOK_MODE`, `ENABLED_MODULES`, `ADDINS`, `AUTO_MIGRATE` |
| S1 | **Đơn vị** (tenant) | `tenants.settings` (JSON) | `postingModes`, `dataLock`, `connections`, `logo` |
| S2 | **Đơn vị hạch toán / chi nhánh** | `accounting_units`, `branches.*` | `branches.department_code`, kho mặc định |
| S3 | **Kỳ × chi nhánh × loại chứng từ** | `period_locks` | khoá sổ tháng 10 cho chi nhánh 26001, loại `sale` |
| S4 | **Loại chứng từ** | `postingModes[docType]`, lý do có `flags.default` | `sale: approve` |
| S5 | **Bản ghi danh mục** | `posting_reasons`, `product_posting_groups`, `tax_codes`, `payment_methods` | tài khoản doanh thu của nhóm hàng SUA |
| S6 | **Ngầm định cuối** | `posting_defaults` | `receivable = 131` |

Định khoản dùng S5 → S6 (R-POST-2). Khoá sổ dùng S3 → S1 (`dataLock`). Chế độ định khoản dùng S4 → mặc định trong `postingModesSchema`.

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-MATRIX-1** | Có ba loại cấu hình, đối xử khác nhau: **(A) ảnh hưởng sổ** (tài khoản, chế độ định khoản, khoá kỳ, cờ tính giá vốn); **(B) ảnh hưởng vận hành** (kết nối, ngưỡng duyệt, cảnh báo); **(C) hiển thị** (logo, mẫu in) | Cột `class` trong registry |
| **R-MATRIX-2** | **Mọi khoá phải đăng ký** trong `bizcity-settings.registry.json`: `key`, `class`, `scopes`, `type`/schema zod, `default`, `owner` (lõi / phân hệ), `storage`, `permission` để sửa, `audit` | Test registry (Giai đoạn 2): mọi `settings.<x>` trong code có trong registry |
| **R-MATRIX-3** | Khoá đặt tên `bizcity.<miền>.<khoá>`; khoá của phân hệ nằm dưới miền của phân hệ (`bizcity.mua_hang.*`) và lưu dưới **một** nhánh JSON của phân hệ (`tenants.settings.purchase`) | Duyệt PR |
| **R-MATRIX-4** | Đọc cấu hình qua **một hàm** có kiểm khuôn (`readPostingModes`, `readDataLock`; đích: `settings.get(key, scope)`), trả mặc định khi thiếu / sai — không đọc `tenants.settings.x` trần ở chỗ dùng | Grep CI (Giai đoạn 2) |
| **R-MATRIX-5** | Cấu hình loại **A** chỉ sửa bằng quyền `settings:write` (hoặc `periods:lock` cho khoá kỳ); mỗi lần sửa ghi `audit_logs` (trước / sau). Mở khoá kỳ **bắt buộc lý do** (`period_lock_events`) | `period-locks.test.ts`, `closing-controls.test.ts` |
| **R-MATRIX-6** | Đổi cấu hình loại **A** không đổi bút toán đã ghi (R-POST-8). Màn cấu hình phải nói rõ "áp cho lần định khoản sau" | Duyệt UI |
| **R-MATRIX-7** | Phân hệ **không được** ghi khoá của lõi hoặc phân hệ khác; chỉ ghi nhánh của mình | Duyệt PR; registry `owner` |
| **R-MATRIX-8** | Biến môi trường (S0) chỉ cho thứ thuộc **bản cài** (kết nối CSDL, bí mật, chế độ sổ, bật tắt phân hệ). Thứ gì kế toán cần đổi thì ở S1 trở xuống, có màn hình | Duyệt PR |
| **R-MATRIX-9** | Bộ cấu hình khởi tạo cho đơn vị mới đủ để chạy mọi `docType` (R-MD-7). Mặc định an toàn: chế độ **chờ duyệt**, không tự động | `default-data.test.ts` |
| **R-MATRIX-10** | Xuất / nhập cấu hình đơn vị dạng JSON (để nhân bản sang doanh nghiệp khác) đi qua registry: chỉ khoá đã đăng ký, kiểm khuôn từng khoá | Giai đoạn 2 |

## 3. Bảng ưu tiên khi trùng

| Tham số | Thứ tự (thắng trước) |
|---|---|
| Tài khoản định khoản | lý do → nhóm hạch toán mặt hàng → loại thuế → hình thức TT / tài khoản ngân hàng → ngầm định |
| Được ghi vào ngày D? | khoá kỳ (kỳ × chi nhánh × loại) → khoá theo ngày (`dataLock`) → quyền `documents:bypass-date-lock` mở cho cả hai lớp ngày, **không** mở khoá kỳ |
| Ghi ngay hay chờ? | nguồn kéo → luôn chờ; khoá API → `postingModes[docType]`; phân hệ → luồng duyệt của phân hệ |
| Phân hệ chạy? | `ENABLED_MODULES` (S0) → `includes` của phân hệ |

## 4. Khoá đang có (ảnh chụp 2026-10-28)

Xem đầy đủ ở registry. Tóm tắt các khoá `tenants.settings` chưa có chủ rõ ràng — việc của Giai đoạn 2:

| Khoá vật lý | Khoá chuẩn | Class | Chủ | Đọc qua hàm kiểm? |
|---|---|---|---|---|
| `postingModes` | `bizcity.posting.modes` | A | lõi | ✓ `readPostingModes` |
| `dataLock` | `bizcity.lock.data` | A | lõi | ✓ `readDataLock` |
| `connections` | `bizcity.connector.connections` | B | lõi | một phần |
| `connectionPulls` | `bizcity.connector.pull_state` | B (trạng thái, không phải cấu hình) | lõi | ✗ — nên tách bảng |
| `logo` | `bizcity.tenant.logo` | C | lõi | ✗ |
| `purchase.*` | `bizcity.mua_hang.*` | B | mua-hang | ✗ |
