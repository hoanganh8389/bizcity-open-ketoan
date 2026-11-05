# `bizcity_master_data@1` — Danh mục cho phân hệ và plugin
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — 1.1.0: mã ≠ định danh (ADR-0017 / 0018 / 0028 D028-4); thay đổi tương thích — plugin vẫn gửi mã -->

> **Phiên bản:** 1.1.0 · 2026-11-05 (1.0.0 · 2026-10-28) · **Trạng thái:** Ổn định · **Luật:** [R-MD](../rules/RULE-MASTER-DATA.md), [R-ECP](../rules/RULE-ENTERPRISE-CONTINUITY.md) · **Danh sách dữ liệu gốc:** [standard/DU-LIEU-GOC.md](../standard/DU-LIEU-GOC.md)

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

**Mã là phương thức nhận diện, không phải khoá liên kết.** Plugin gửi mã; Core phân giải mã **theo nguồn và ngày chứng từ** (mã hiện hành, mã cũ còn hiệu lực ở ngày đó, bí danh sau gộp, mã ngoài của hệ nguồn) ra **định danh** bất biến rồi lưu định danh. Mã có thể đổi (có phiên bản, ngày hiệu lực) mà sổ không đổi. Cột "Ổn định?" dưới đây nghĩa là: **gửi mã này luôn được Core hiểu đúng ở ngày chứng từ** — không có nghĩa mã không bao giờ đổi. Tài khoản kế toán là ngoại lệ: số hiệu là định danh theo chế độ kế toán.

| Danh mục | Mã | Ổn định? | Ghi chú |
|---|---|---|---|
| Chi nhánh | `code` (+ `external_ref` để khớp mã nguồn) | ✓ | Lõi tìm theo `code` → `external_ref` → mã có đuôi chữ duy nhất |
| Đối tượng | `code` | ✓ | Thường là SĐT khách / mã NCC ở nguồn. Khách lẻ: `KHACH-LE`; NCC lẻ: `NCC-LE` |
| Mặt hàng | `sku` (định danh: `itemId`) | ✓ | Đổi mã giữ `item_id`; mã cũ vẫn phân giải đúng (S026-20). ĐVT tồn kho = ĐVT nhỏ nhất (`product_units` tỉ lệ 1) |
| Hình thức TT | `code` IN HOA, gạch ngang | ✓ | Tên nguồn → bỏ dấu, IN HOA, khoảng trắng thành `-` (`QR VTB CT` → `QR-VTB-CT`); khác thì khai "Đổi hình thức" ở kết nối |
| Loại thuế | `code` | ✓ | Mặc định `KCT`, `R00`, `R05`, `R08`, `R10`; đầu vào `V05`, `V08`, `V10`… |
| Lý do | `code` | ✓ | Mỗi `docType` có một lý do `default` |

## 3. Đồng bộ

- Plugin **kéo** danh mục định kỳ (ví dụ mỗi giờ) hoặc khi gặp lỗi mã lạ; không đẩy danh mục khung kế toán.
- Mã đã bỏ: xem `catalog_tombstones` qua API danh mục (R-MD-10).
- Mã lạ trong sự việc không làm mất sự việc (R-MD-5): sự việc nằm chờ, kế toán khai rồi định khoản lại.

## 4. Khuôn phần tử

Tên trường đầy đủ của từng danh mục: OpenAPI `/api/docs` (sinh từ zod ở `modules/<ten>/<ten>.schemas.ts`). Plugin chỉ **dựa vào** các trường `code` / `sku` (để gửi), định danh (`id` / `itemId`, để lưu liên kết trong dữ liệu của mình), `name`, `isActive` (hoặc tương đương) — trường khác là thông tin, có thể thêm bất kỳ lúc nào (thay đổi tương thích).
