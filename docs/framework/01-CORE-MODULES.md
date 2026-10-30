# 01 · Lõi là gì (Core Modules)

Lõi = mọi thứ **luôn bật** ở mọi tiến trình và mà phân hệ nào cũng dựa vào. Lõi chia hai lớp: **Nhân** (T0, gần như không đổi) và **Dịch vụ lõi** (T1, mở rộng có kiểm soát).

## 1. Nhân (T0 — Kernel)

Sửa ở đây = sửa tính đúng của sổ sách. Bắt buộc **hai người duyệt**, trong đó một người thuộc nhóm Lõi; PR phải dán bằng chứng chạy đủ test (R-QG).

| Thành phần | Thư mục / tệp | Trách nhiệm | Hợp đồng |
|---|---|---|---|
| Contracts | `packages/contracts/src/{documents,api,enums,money,invoices,vouchers,connections}.ts` | Khuôn dữ liệu hai phía cùng hiểu; tiền tính bằng xu (`toCents`) | `bizcity_ledger_intake@1`, `bizcity_api@1` |
| Event Gateway | `modules/documents/document.service.ts` (`postDocumentIn`, `ingest`, `ingestBatch`, `cancel`, `requestCancel`, `postMany`, `preview`) | Cửa nhận duy nhất; idempotent theo `docKey` + `version`; chế độ định khoản | `bizcity_ledger_intake@1` |
| Event Store | `modules/documents/document.repository.ts`; bảng `accounting_events`, `accounting_event_versions`, `posting_log` | Lưu sự việc + phiên bản + nhật ký định khoản (chỉ thêm) | — |
| Posting Engine | `modules/posting/{posting.service,account-resolver,entry-builder}.ts`, `rules/*.rule.ts` | Chọn luật theo `docType`, tra tài khoản, dựng bút toán | `bizcity_posting_rule@1` |
| Ledger | `modules/ledger/ledger.service.ts` (`post`, `reverse`), `ledger.repository.ts`; bảng `ledger_*`, `document_sequences` | Cửa ghi sổ duy nhất; cân; kỳ khoá; cấp số; số dư ngày | — |
| Tenant & Auth | `core/auth.ts`, `core/security/*`; bảng `tenants`, `users`, `api_keys` | Định danh, vai trò, phạm vi khoá, lọc đơn vị | R-TEN |
| Audit | `core/audit.ts`; bảng `audit_logs` | Nhật ký mọi thao tác ghi | R-TEN-5 |
| HTTP shell | `core/http.ts`, `core/errors.ts`, `app.ts`, `config/env.ts` | Khuôn phản hồi, lỗi có mã, kiểm biến môi trường | `bizcity_api@1` |
| Quy tắc ngày, chế độ | `core/date-rules.ts`, `core/posting-modes.ts` | Khoá dữ liệu theo ngày; tự động / chờ duyệt theo loại chứng từ | `bizcity_settings@1` |
| Mở rộng | `core/addins.ts`, `phan-he/{index,types,loi}.ts` | Đăng ký add-in, phân hệ, route lõi | `bizcity_module@1` |
| CSDL | `db/migrations/0001…0009_goc_*.sql`, `apps/api/src/db/*` | Cấu trúc, trigger bảo vệ, chạy migration | R-DB |

## 2. Dịch vụ lõi (T1 — Core services)

Phân hệ nào cũng đọc; thay đổi theo nhu cầu nghiệp vụ nhưng **không** được đi vòng nhân.

| Nhóm | Module (`apps/api/src/modules/…`) | Ghi sổ bằng | Ghi chú chuẩn hoá |
|---|---|---|---|
| Danh mục chuẩn | `accounts`, `branches`, `warehouses`, `partners`, `products`, `unit-names`, `tax-codes`, `bank-accounts`, `dimensions`, `catalog`, `default-data` | — | Chủ dữ liệu: R-MD |
| Cấu hình định khoản | `posting-config` (lý do, nhóm hạch toán, hình thức TT, ngầm định) | — | Thuộc ma trận cấu hình: R-MATRIX |
| Kỳ, khoá sổ | `periods` | — | `period_locks` (kỳ × chi nhánh × loại chứng từ) |
| Phiếu kế toán tay | `vouchers`, `voucher-templates`, `signatures`, `print-templates` | `eventStore` (một cửa, từ 2026-10-30) | — |
| Kết chuyển | `closing` | `eventStore` | — |
| Giá vốn | `inventory` (`costing.service.ts`) | `eventStore` (+ ngoại lệ ghi đè giá vốn E1) | — |
| Tài sản | `assets` | `eventStore` | — |
| Công nợ | `debts` | dẫn xuất từ sổ (`debt_items`) | Dựng lại được từ sổ |
| Thuế | `tax-invoices`, `tax-info` | dẫn xuất (`tax_invoices`) | Thông tin bổ sung qua `tax_info_patches`, không sửa sự việc |
| Kết nối | `connections` | qua `postDocumentIn` | `bizcity_connector@1` |
| Chứng từ tham chiếu | `reference-documents` | không ghi sổ | Đơn hàng, báo giá: chỉ lưu |
| Báo cáo | `reports`, `ledger` (routes đọc), `sales` | chỉ đọc | Chỉ đọc sổ và bảng dẫn xuất (R-LEDGER-7) |
| Hệ thống | `system`, `access`, `auth` | — | `schema-catalog.ts` mô tả mọi bảng |

Trước 2026-10-30 bốn dịch vụ trên gọi thẳng `ledgerService`, mỗi nơi tự viết lại chuỗi "khoá sự việc → lưu phiên bản → đảo → ghi → log" (audit A-01). Nay dùng chung `eventStore` (`modules/documents/event-store.ts`, [PHASE-004](../phases/PHASE-004-MOT-CUA-GHI-SO/README.md)).

## 3. Phân hệ hiện có (T2)

| `key` | Máy chủ riêng | Bảng riêng | Sinh sự việc | Trạng thái |
|---|---|---|---|---|
| `ke-toan` | `planning` | `cash_plans`, `cost_norms` (đang khai ở migration lõi 0002) | phiếu tay, kết chuyển (qua lõi) | Chạy thật |
| `quy` | `payment-requests` | `payment_requests` (đang khai ở migration lõi 0005) | phiếu chi khi duyệt | Chạy thật |
| `mua-hang` | phiếu mua, NCC, giá mua, tồn max | `purchase_documents`, `purchase_policies` | `purchase`, `purchase_return` qua `postDocumentIn` | Chạy thật |
| `ban-hang` | — | — | nhận từ plugin WP | Giao diện + dữ liệu giả |
| `kho` | — | — | nhận từ plugin WP | Giao diện + dữ liệu giả |
| `tai-san` | — | (bảng tài sản đang ở lõi) | khấu hao | Chạy thật |
| `thue` | `statements`, `authority-invoices` | `authority_invoices`, tờ khai | không | Chạy thật |
| `api` | — | — | — | Thử API, hướng dẫn |
| `he-thong` | — | — | — | Menu, người dùng |
| `nhan-su` *(dự kiến)* | chấm công, lương | `hr_*` | `payroll` (sự việc mới) | Chưa có — xem [../workflows/WF-CORE.md](../workflows/WF-CORE.md) §H2R |

## 4. Tiêu chí đưa một thứ vào lõi

Một thành phần chỉ lên lõi khi **cả ba** đúng:

1. Từ hai phân hệ trở lên cần nó (nếu không: để ở phân hệ).
2. Có hợp đồng viết ra (kiểu TypeScript xuất từ `packages/contracts` hoặc `modules/<x>/<x>.schemas.ts`).
3. Có test riêng chạy trên PostgreSQL thật.

Đưa lên lõi = PR riêng, không gộp với tính năng; CODEOWNERS chuyển sang nhóm Lõi.
