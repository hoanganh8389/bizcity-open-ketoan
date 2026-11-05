# Dữ liệu gốc: danh sách, hạng, sáu thao tác vòng đời
<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — chuẩn hoá Master Data theo ECP-13 / R-ECP-LC: liệt kê mọi dữ liệu gốc, hạng (ADR-0018), quy định CREATE / UPDATE / ARCHIVE / MERGE / REVERSE / DELETE, hiện trạng và khoảng cách (rà origin/main 601d939) -->

> **Trạng thái:** chấp nhận về nguyên tắc ([ADR-0028](../adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md) D028-3, D028-4) · **Luật:** [R-ECP-LC](../rules/RULE-ENTERPRISE-CONTINUITY.md), [R-MD](../rules/RULE-MASTER-DATA.md), [R-ITEM](../rules/RULE-ITEM.md) · **Hạng:** [ADR-0018](../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (A đầy đủ · B định danh + hiệu lực · C ánh xạ số hiệu · D cấu hình có phiên bản · E nhẹ)
> Thêm một loại dữ liệu gốc mới (Core hoặc module) = thêm một dòng vào §3 trong cùng PR, khai đủ sáu cột thao tác.

## 1. Định danh và mã

1. **Mã là phương thức nhận diện; định danh là khoá liên kết bền vững** (ECP-01, ECP-04).
2. Hợp đồng ra ngoài (cửa nạp, API danh mục, POS, app ngoài, module cũ) **vẫn nhận mã**. Core **phân giải mã theo nguồn và thời điểm** — mã hiện hành, mã cũ còn hiệu lực ở ngày chứng từ, bí danh sau gộp, mã ngoài của hệ nguồn — ra định danh, rồi lưu định danh. Mặt hàng đã làm vậy (`resolveItem`, S026-20 / S026-22); thực thể khác theo S026-4 (`resolveEntity`).
3. Bảng sổ và bảng module lưu **định danh**; khi cần in lại đúng như lúc ghi thì lưu thêm **ảnh chụp** mã / tên (như `ledger_lines.product_sku`, `product_name` — 0066, 0072).
4. **Ngoại lệ có chủ đích:** tài khoản kế toán (hạng C) — số hiệu là định danh theo chế độ; đổi số hiệu = phiên bản hệ thống tài khoản + ánh xạ + chứng từ chuyển số dư (ADR-0018).

## 2. Quy tắc theo nhóm đối tượng

| Đối tượng | Nguyên tắc xử lý |
|---|---|
| **Dữ liệu gốc** (mặt hàng, khách hàng, NCC, kho, chi nhánh) | Không xoá khi đã được tham chiếu. Ngừng dùng bằng `archived_at` / `is_active` / `status`; đổi mã qua phiên bản |
| **Chứng từ đã duyệt / ghi sổ** | Không xoá. Huỷ, đảo bút toán, điều chỉnh hoặc tạo phiên bản thay thế |
| **Chứng từ nháp** | Xoá được khi chưa phát sinh quan hệ, theo chính sách lưu trữ |
| **Sự việc kế toán** (`accounting_events`) | Giữ lịch sử đầu vào, trạng thái xử lý và mọi phiên bản liên quan |
| **Bút toán** (`ledger_*`) | Chỉ thêm; không `UPDATE` / `DELETE` bút toán đã ghi |
| **Người dùng / nhân viên** | Ngừng kích hoạt, thu hồi quyền; giữ lịch sử hành động và quan hệ nhân sự |
| **Vai trò / quyền** | Ghi nhận lịch sử cấp, thu hồi và thời gian hiệu lực |
| **Cấu hình / chính sách** | Không ghi đè phiên bản đã được sử dụng; thêm phiên bản có ngày hiệu lực |
| **Quan hệ** | Không xoá quan hệ lịch sử; đóng hiệu lực quan hệ cũ và tạo quan hệ mới |

## 3. Danh sách dữ liệu gốc

Ký hiệu cột thao tác: ✅ có và được bảo vệ ở CSDL · 🟡 có, chỉ chặn ở dịch vụ hoặc thiếu · ⬜ chưa có · — không áp dụng.

### 3.1 Tổ chức

| Dữ liệu | Bảng | Hạng | Định danh | UPDATE có lịch sử | ARCHIVE | MERGE | DELETE an toàn | Khoảng cách → việc |
|---|---|---|---|---|---|---|---|---|
| Đơn vị (tenant) | `tenants` | — | `bigint` | ⬜ (mã, MST, tên) | 🟡 `is_active` | — | ⬜ xoá đơn vị xoá tầng mọi bảng | xoá đơn vị chỉ qua quy trình đóng đơn vị có bản lưu → S029-12 |
| Đơn vị hạch toán | `accounting_units` | B | `bigint` | ⬜ | ⬜ không có cột | — | ⬜ | thêm ngừng dùng → S029-12 |
| Chi nhánh / cửa hàng | `branches` | B | `bigint` | ⬜ (mã, MST, tên) | 🟡 `is_active` | ⬜ | 🟡 dịch vụ kiểm bút toán + kho | `entity_codes` → S026-4; thuộc tính có hiệu lực → S029-19 |
| Kho | `warehouses` | B | `bigint` | ⬜ | 🟡 `is_active` | ⬜ | 🟡 `usedBy` | phiếu kho lưu `warehouse_code` (mã) → S026-4 |
| Sơ đồ tổ chức | `org_units` | B | `bigint` | ⬜ | 🟡 `is_active` | ⬜ | 🟡 xoá cứng khi không con, không chi nhánh | cây có hiệu lực → S026-6 |
| Nhóm đơn vị | — | — | — | — | — | — | — | S026-6 |

### 3.2 Đối tác, hàng hoá

| Dữ liệu | Bảng | Hạng | Định danh | UPDATE có lịch sử | ARCHIVE | MERGE | DELETE an toàn | Khoảng cách → việc |
|---|---|---|---|---|---|---|---|---|
| Đối tượng (khách, NCC, nhân viên tạm ứng) | `partners` | A | `bigint` (sổ khoá bằng `id`) | ⬜ tên, MST, địa chỉ ghi đè | 🟡 `is_active` | ⬜ | 🟡 dịch vụ kiểm dòng sổ + `referenceChecks` | lịch sử tên + ảnh chụp tên lúc ghi → S029-19; gộp → S029-20; mã → S026-4 |
| Nhóm đối tượng | `partner_groups` | E | `bigint` | ⬜ | 🟡 | ⬜ | 🟡 | đối tượng lưu `group_code` (mã) |
| Mặt hàng (định danh) | `items` | A | **ULID** | ✅ mã (`item_codes`), phân loại (`item_classification`) có hiệu lực; tên ghi đè | ✅ `status = retired` | ✅ `merged_into_item_id` (0068) | ✅ `items_guard` chặn xoá | tên có hiệu lực → S029-19 |
| Mặt hàng (bản ghi cũ) | `products` | A | `bigint` + `item_id` | qua trigger → `item_codes` | 🟡 | qua `items` | 🟡 **chỉ kiểm phiếu kho**, không kiểm dòng sổ | khung nhìn → S024-11; chặn xoá → S029-12 |
| ĐVT quy đổi, bảng giá | `product_units`, `product_prices`, `price_lists` | D | `bigint` | ⬜ | ⬜ / 🟡 | theo mặt hàng | ⬜ xoá tự do (có dấu xoá) | giá có hiệu lực, chặn xoá giá đã dùng → S029-12 |
| Nhóm hàng | `item_classes` | E | `bigint` | ⬜ | 🟡 | ⬜ | 🟡 | cây có hiệu lực → S026-5 |
| Tên ĐVT | `unit_names` | E | `bigserial` | ⬜ | 🟡 | ⬜ | 🟡 | mặt hàng lưu ĐVT bằng chữ |

### 3.3 Khung kế toán

| Dữ liệu | Bảng | Hạng | Định danh | UPDATE có lịch sử | ARCHIVE | MERGE | DELETE an toàn | Khoảng cách → việc |
|---|---|---|---|---|---|---|---|---|
| Tài khoản | `accounts` | C | số hiệu (khoá ngoại `(tenant, code)`) | ⬜ tên | 🟡 | — (ánh xạ) | 🟡 dịch vụ kiểm con + dòng sổ; khoá ngoại chặn đổi số đã dùng | phiên bản hệ TK + ánh xạ → S026-8 |
| Loại thuế | `tax_codes` | D | `bigint`, sổ lưu mã | ⬜ | 🟡 | — | 🟡 | thuế suất theo ngày hiệu lực → S029-10 |
| Hình thức thanh toán | `payment_methods` | D | `bigint` | ⬜ | 🟡 | — | 🟡 **chỉ kiểm thu tiền bán hàng** | → S029-12 |
| Tài khoản ngân hàng | `bank_accounts` | B | `bigint` | ⬜ | 🟡 | ⬜ | 🟡 **chỉ kiểm hình thức TT** | → S029-12; `currency` chữ tự do → danh mục tiền tệ (S029-10) |
| Lý do định khoản | `posting_reasons` | D | `bigint`, sổ lưu mã | ⬜ | 🟡 | — | 🟡 | ảnh chụp trong `posting_policy_versions` |
| Nhóm hạch toán mặt hàng | `product_posting_groups` | D | `bigint` | ⬜ | ⬜ không có cột | — | 🟡 | theo ngày → S026-8 |
| Chính sách định khoản | `posting_policy_versions` | D | `(tenant, version)` | ✅ chỉ thêm, `effective_from` | — | — | ✅ guard | đạt |
| Hồ sơ kế toán | `accounting_profiles` | D | `(tenant, version)` | ✅ | — | — | ✅ guard | đạt |
| Chiều phân tích (bộ phận, dự án…) | `dimensions` | E | `bigint`, sổ lưu mã trong `dims` | ⬜ | 🟡 | ⬜ | 🟡 `usedDimensionCodes` | nhật ký đổi mã + ánh xạ ở báo cáo (hạng E) |
| Tiền tệ | — | D | — | — | — | — | — | ⬜ không có danh mục → S029-10 |

### 3.4 Con người, quyền, cấu hình, quan hệ

| Dữ liệu | Bảng | Định danh | UPDATE có lịch sử | ARCHIVE | MERGE | DELETE an toàn | Khoảng cách → việc |
|---|---|---|---|---|---|---|---|
| Người dùng | `users` | `bigint`; actor lưu chữ `user:<id>` | ⬜ (tên, email) | ✅ `is_active` + thu hồi phiên (`session_version`) | — | ✅ không có đường xoá | nối người → S029-23 |
| Người / nhân viên | — | — | — | — | — | — | ⬜ `persons`, `employees` → S029-23 |
| Vai trò bổ sung | `user_role_assignments` (PHASE-028 W1, chưa vào `main`) | `bigint` | ✅ chỉ thêm, thu hồi một lần | ✅ `revoked_at` | — | ✅ trigger chặn xoá | PHASE-028 |
| Khoá API | `api_keys` | `bigint` | — | ✅ `revoked_at` | — | ✅ chỉ thu hồi | — |
| Cài đặt app | `app_installations` | `(tenant, app_key)` | ⬜ quyền app | ✅ `status` | — | ✅ không cấp `DELETE` | lịch sử quyền app → PHASE-028 W2 |
| Cấu hình đơn vị | `tenants.settings` (jsonb) | khoá registry | ⬜ ghi đè | — | — | — | **S029-10 (P0)** |
| Mẫu in theo phạm vi | `print_template_settings` | `bigint` | ⬜ | — | — | — | gộp vào S029-10 |
| Quan hệ chứng từ | `document_links`, `ledger_links` | `bigint` | — | ⬜ chưa có đóng hiệu lực | — | ✅ chỉ thêm | quan hệ có `valid_to` khi cần đóng → S029-11 |
| Dấu xoá danh mục | `catalog_tombstones` | `bigint` | — | — | `replaced_by_item_id` | — | giữ |

## 4. Luật chặn xoá thống nhất (đích S029-12, K3)

1. Vai `ketoan_app` **không có** `DELETE` trên bảng dữ liệu gốc ở §3; xoá chỉ qua một hàm `SECURITY DEFINER` duy nhất (đề xuất, chưa có trong mã).
2. Hàm đó đọc **chỉ mục tham chiếu** (`md_references`, S026-11) — không dựa danh sách bảng viết tay ở từng dịch vụ — và module khai tham chiếu của mình qua hook `masterdata.referenceCheck` có sẵn.
3. Còn tham chiếu → từ chối bằng mã trong thư viện (`IN-*` / Gate A), hướng dẫn **ngừng dùng** hoặc **gộp**; không tham chiếu → xoá, ghi `catalog_tombstones` + `audit_logs`.
4. Không `ON DELETE CASCADE` từ dữ liệu gốc sang dữ liệu nghiệp vụ (trừ đóng đơn vị theo quy trình có bản lưu).
5. Test cổng: mỗi dòng §3 có một ca "đã dùng thì không xoá được kể cả bằng SQL của `ketoan_app`".
