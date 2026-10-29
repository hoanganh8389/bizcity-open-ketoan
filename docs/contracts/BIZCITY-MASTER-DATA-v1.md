# `bizcity_master_data@1` — Danh mục cho phân hệ và plugin

> **Phiên bản:** 1.0.0 · 2026-10-28 · **Trạng thái:** Ổn định · **Luật:** [R-MD](../rules/RULE-MASTER-DATA.md)

## 1. Plugin cần gì, lấy ở đâu

| Danh mục | Đọc | Ghi (khoá `catalog:write`) | Dùng trong sự việc tại |
|---|---|---|---|
| Chi nhánh | `GET /api/v1/branches` | `POST /api/v1/branches { code, name }` | `branchCode`, `toBranchCode`, `fromBranchCode`, `lines[].branchCode` |
| Lý do định khoản | `GET /api/v1/posting/reasons` | — | `reasonCode`, `toReasonCode` |
| Loại thuế | `GET /api/v1/tax-codes` | — | `lines[].taxCode` |
| Hình thức thanh toán | `GET /api/v1/posting/payment-methods` | — | `payments[].methodCode`, `methodCode`, `fromMethodCode`, `toMethodCode` |
| Tài khoản ngân hàng | `GET /api/v1/bank-accounts` | — | `fromBankCode`, `toBankCode` |
| Mặt hàng | `GET /api/v1/products` | `PUT /api/v1/products/:sku` | `lines[].sku` |
| Đối tượng | `GET /api/v1/partners` | `PUT /api/v1/partners/:code` (hoặc tự tạo qua `partner` trong sự việc) | `partner.code` |
| Kho | `GET /api/v1/warehouses` | — | `lines[].warehouseCode` |

## 2. Ngữ nghĩa mã

| Danh mục | Mã | Ổn định? | Ghi chú |
|---|---|---|---|
| Chi nhánh | `code` (+ `external_ref` để khớp mã nguồn) | ✓ | Lõi tìm theo `code` → `external_ref` → mã có đuôi chữ duy nhất |
| Đối tượng | `code` | ✓ | Thường là SĐT khách / mã NCC ở nguồn. Khách lẻ: `KHACH-LE`; NCC lẻ: `NCC-LE` |
| Mặt hàng | `sku` | ✓ | ĐVT tồn kho = ĐVT nhỏ nhất (`product_units` tỉ lệ 1) |
| Hình thức TT | `code` IN HOA, gạch ngang | ✓ | Tên nguồn → bỏ dấu, IN HOA, khoảng trắng thành `-` (`QR VTB CT` → `QR-VTB-CT`); khác thì khai "Đổi hình thức" ở kết nối |
| Loại thuế | `code` | ✓ | Mặc định `KCT`, `R00`, `R05`, `R08`, `R10`; đầu vào `V05`, `V08`, `V10`… |
| Lý do | `code` | ✓ | Mỗi `docType` có một lý do `default` |

## 3. Đồng bộ

- Plugin **kéo** danh mục định kỳ (ví dụ mỗi giờ) hoặc khi gặp lỗi mã lạ; không đẩy danh mục khung kế toán.
- Mã đã bỏ: xem `catalog_tombstones` qua API danh mục (R-MD-10).
- Mã lạ trong sự việc không làm mất sự việc (R-MD-5): sự việc nằm chờ, kế toán khai rồi định khoản lại.

## 4. Khuôn phần tử

Tên trường đầy đủ của từng danh mục: OpenAPI `/api/docs` (sinh từ zod ở `modules/<ten>/<ten>.schemas.ts`). Plugin chỉ **dựa vào** các trường `code` / `sku`, `name`, `isActive` (hoặc tương đương) — trường khác là thông tin, có thể thêm bất kỳ lúc nào (thay đổi tương thích).
