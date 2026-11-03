# PHASE-013 — Ranh giới lõi / phân hệ: Quỹ, Mua hàng, Bán hàng, Tài sản, Kho
<!-- [2026-11-04 12:39 AM Johnny Chu - Chu Hoàng Anh] PHASE-013 — rà ranh giới lõi / phân hệ của quy, mua-hang, ban-hang, tai-san, kho trước các đợt chuyển (ADR-0024); đo trên main 9b9717d -->

> **Mục đích:** trước khi chuyển một phân hệ sang `modules/<key>/` ([ADR-0024](../../adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md)), phải biết **phần nào là sự thật kế toán của Core (ở lại)** và **phần nào là nghiệp vụ của phân hệ (đi)**. Tài liệu này là đầu vào chung cho chữ chốt từng đợt ([đợt 1 `quy`](10-DOT-1-QUY.md), S013-4 đợt 2, S013-7 đợt 5).
> **Đo ngày 2026-11-04** trên `main` `9b9717d`: đọc `index.ts` từng phân hệ, `apps/api/src/phan-he/loi.ts`, manifest, và dò mọi tệp `.ts` trong `packages/kernel`, `packages/platform`, `apps/api/src`, `modules/` chạm từng bảng (đọc / ghi). Con số dưới đây là kết quả dò, không phải ước lượng.
> **Trạng thái:** đề xuất. Các mục "Cần chủ dự án quyết" ở §8.

## 1. Nguyên tắc phân định

Một thứ **ở lại lõi** khi rơi vào ít nhất một điều sau; còn lại thuộc phân hệ:

1. **Là sự thật kế toán hoặc tạo ra nó:** sự việc (`accounting_events`), sổ cái, luật định khoản, sự việc Kernel tự lập (phiếu tay, kết chuyển, **khấu hao**, **giá vốn** — AGENTS.md, câu không thương lượng 3).
2. **Là danh mục chuẩn** dùng chung: đối tượng, mặt hàng, chi nhánh, kho, tài khoản ngân hàng, phương thức thanh toán (RULE-ITEM, ADR-0017/0018).
3. **Là docType của cửa nạp** ([BIZCITY-LEDGER-INTAKE-v1](../../contracts/BIZCITY-LEDGER-INTAKE-v1.md)): `sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`, `stock_adjustment`, `cash_transfer`, `customer_payment`, `manual_journal`. Phân hệ **nộp** docType, không sở hữu nó.
4. **Là báo cáo đọc thẳng sổ** dùng chung cho nhiều phân hệ (nhóm `LEDGER`).

Phân hệ sở hữu: quy trình (đề nghị, duyệt, chính sách), bảng nghiệp vụ riêng, màn hình, mẫu in, báo cáo riêng của nghiệp vụ đó. Phân hệ đọc dữ liệu lõi **qua năng lực SDK**, không `SELECT` bảng lõi.

## 2. Nhóm route dùng chung đang bị "mượn" vào phân hệ

`apps/api/src/phan-he/loi.ts` định nghĩa hai nhóm mà các phân hệ cũ gắn lại vào `routes` của mình:

| Nhóm | Gồm | Phân hệ đang gắn | Thuộc |
|---|---|---|---|
| `LEDGER` | `ledgerRoutes` (Kernel), `reportRoutes` (`phan-he/ke-toan/reports`), `debtRoutes` (Kernel) | cả năm | lõi (Kernel) + `ke-toan` |
| `GOODS` | `inventoryRoutes` (Kernel), `inventoryReportRoutes` (`apps/api/src/modules/inventory`), `grossProfitRoutes` (`phan-he/ban-hang`), `stockTransferRoutes` (`phan-he/kho`), `departmentReportRoutes` (`phan-he/ke-toan`) | `kho`, `mua-hang` | lẫn: Kernel + 3 phân hệ |

**Hệ quả:** khi chuyển, module **không** mang `LEDGER` / `GOODS` theo. Hai nhóm này cần một chỗ đăng ký ở lõi (bật theo "có ít nhất một phân hệ dùng"), việc nhỏ của Nhóm Lõi trước đợt 2. `GOODS` còn trộn route của ba phân hệ — tách trả từng route về chủ của nó.

## 3. Quỹ (`quy`)

| Lõi (ở lại) | Phân hệ `quy` (đi) |
|---|---|
| Phiếu thu / chi: `voucherRoutes` (Kernel `vouchers`) | 11 action `quy.payment-request*`, workflow duyệt 2 cấp |
| Chuyển tiền nội bộ: docType `cash_transfer`; bảng `cash_transfer_confirmations` (Kernel `documents` ghi) | Bảng `payment_requests`, `payment_request_settings` |
| Thu tiền khách: docType `customer_payment` | Sự việc `quy.payment-request.paid` |
| Danh mục `bank_accounts` (ghi: `apps/api/src/modules/bank-accounts`; Kernel đọc ở `ledger`, `posting-config`, `default-data`), `payment_methods` | Trang đề nghị thanh toán, mẫu in `PAYMENT_REQUEST_TEMPLATES` |
| Sổ quỹ, sổ ngân hàng, công nợ: `LEDGER` | |

**Điểm phải gỡ:** Kernel `periods` đọc `payment_requests` ([ADR-0025](../../adr/ADR-0025-cong-kiem-ky-va-chuyen-tiep-duong-dan-cu.md) mục A); `apps/api/src/modules/dimensions` (lịch hợp đồng) đọc `payment_requests`; chi tiền gọi `voucherService.createIn` (cổng Kernel cũ) → trong module dùng `ctx.ledger.submit` docType `manual_journal` (năng lực `ledger.manual-journal`, **đã có**). Cần kiểm trong đợt 1a: `manual_journal` có đủ trường của phiếu chi hiện tại (quỹ / ngân hàng, phương thức) không; thiếu → đề xuất bậc 4, không quay lại cổng cũ.

**Kết luận:** quỹ là **miền lõi** (tiền thật vào sổ); `quy` chỉ là **quy trình đề nghị thanh toán** bọc ngoài.

## 4. Mua hàng (`mua-hang`)

| Lõi (ở lại) | Phân hệ `mua-hang` (đi) |
|---|---|
| docType `purchase`, `purchase_return` (nộp qua `postDocumentIn`, `posting.ts`) | 52 action; 12 bảng, **chỉ `mua-hang` ghi**: `purchase_documents`, `purchase_policies`, `purchase_attachments`, `supplier_products`, `supplier_invoices`, `supplier_invoice_lines`, `supplier_item_aliases`, `stock_levels`, `stock_sku_settings`, `stock_max_requests`, `order_formulas`, `transfer_requests` |
| Nhập xuất kho, giá vốn: `inventory_movements`, `inventory_costs` (Kernel `inventory` ghi) | Mã miền `modules/mua-hang/domain` (đã ở chuẩn) |
| Danh mục: đối tượng, mặt hàng, kho, phương thức thanh toán | Workflow phiếu mua hàng, mẫu in, báo cáo mua |

**Điểm phải gỡ:**
- `mua-hang` **đọc thẳng** `inventory_movements`, `inventory_costs`, `warehouses`, `payment_methods` → cần cổng đọc kho (§8, G2).
- Phiếu mua còn gọi `voucherService.createIn` bên cạnh `postDocumentIn` (`posting.ts:93`) → chuyển sang `ctx.ledger.submit`.
- **Chồng miền với Kho:** `stock_levels`, `stock_sku_settings`, `stock_max_requests` (tồn tối đa / tối thiểu), `transfer_requests` (đề nghị chuyển kho) là nghiệp vụ kho nhưng đang ở `mua-hang`. Quyết định ai sở hữu trước đợt 5 (§8, câu 3).
- Web import trang lõi `features/catalog/PartnersPage`, `ProductsPage`; lõi web import `phan-he/mua-hang` ở `printCatalog.ts`, `menu.ts`, `pages.tsx`.

**Kết luận:** ranh giới đã rõ nhất (bảng riêng, chỉ phân hệ ghi). Việc nặng là số lượng mã (5 383 dòng API, 106 vi phạm chuẩn module — đo ngày 2026-11-03) và chỗ đọc thẳng kho.

## 5. Bán hàng (`ban-hang`)

| Lõi (ở lại) | Phân hệ `ban-hang` (đi) |
|---|---|
| docType `sale`, `sale_return`, nguồn POS / ERP nộp qua cửa nạp | Báo cáo bán hàng: `salesReportRoutes` (đang ở `apps/api/src/modules/sales`), lãi gộp `grossProfitRoutes` (`phan-he/ban-hang/gross-profit.ts`) |
| `sales_lines` là **VIEW** trên dữ liệu đã ghi sổ (`db/migrations/0007_goc_kho_ban_hang.sql:175`); `sales_payments` | Màn hình, bộ lọc, mẫu in báo cáo bán hàng |
| Hoá đơn bán ra `tax_invoices` (Kernel `tax-invoices`, `tax-info`, `vouchers` ghi) | |

**Điểm phải gỡ:** manifest có **0 action, 0 bảng**; mọi dữ liệu là của lõi. Báo cáo đọc thẳng `sales_lines`, `posted_event_payloads`, `accounting_events`, `inventory_costs`, `tax_invoices`; `sales_lines` còn bị Kernel `tax-info`, `apps/api/src/modules/system`, `phan-he/ke-toan` đọc.

**Kết luận:** `ban-hang` là **module báo cáo + giao diện** trên dữ liệu lõi. Chuyển được khi có cổng đọc chỉ-đọc cho dữ liệu bán (§8, G2); chưa có cổng thì chỉ chuyển được phần web.

## 6. Tài sản (`tai-san`)

| Lõi (ở lại) | Phân hệ `tai-san` (đi?) |
|---|---|
| **Khấu hao, phân bổ là sự việc Kernel tự lập** (AGENTS.md câu 3): `asset.service.ts` gọi `eventStore` (7 chỗ: `lock`, `reverseActive`, `saveVersion`, `cancel`) | Giao diện sổ tài sản, kế hoạch, mẫu in (`phan-he/tai-san` web) |
| Ghi tăng / giảm / thanh lý: `asset-plan.ts` gọi `voucherService.createIn` (`docType: 'manual'`) | Quy trình quanh tài sản (nếu sau này có: đề nghị mua, bàn giao, kiểm kê) |
| 6 bảng `assets`, `asset_categories`, `asset_events`, `asset_allocations`, `asset_depreciations`, `asset_depreciation_overrides` — ghi ở `apps/api/src/modules/assets` (**không** ở `phan-he/tai-san`); Kernel `default-data` / `seed` ghi `asset_categories` | |

**Điểm phải gỡ:** `phan-he/tai-san` API chỉ có `index.ts` gắn route của `apps/api/src/modules/assets`; mã miền thật nằm ở lõi app. Sổ tài sản và khấu hao là căn cứ của 211 / 214 / 242 — không có năng lực SDK nào để module tự nộp khấu hao (không có docType `depreciation`).

**Kết luận:** tài sản hiện là **miền lõi** (giống giá vốn). Hai phương án ở §8 câu 2.

## 7. Kho (`kho`)

| Lõi (ở lại) | Phân hệ `kho` (đi) |
|---|---|
| docType `transfer`, `stock_adjustment`; nhập xuất, giá vốn (`inventory_movements`, `inventory_costs`, Kernel `inventory` ghi) | Bảng kê chuyển kho `stockTransferRoutes` (`phan-he/kho/stock-transfers.ts`) |
| Danh mục kho `warehouses` (`apps/api/src/modules/warehouses`, Kernel `default-data`) | Màn hình, mẫu in kho (`khoHang`, `baoCaoHang`) |
| Báo cáo nhập xuất tồn `inventoryReportRoutes`, `inventoryRoutes` | |

**Điểm phải gỡ:** manifest **0 action, 0 bảng**; `stock-transfers.ts` đọc thẳng `accounting_events`. Nghiệp vụ kho có bảng riêng (tồn max, đề nghị chuyển) lại đang nằm ở `mua-hang` (§4).

**Kết luận:** kho là **miền lõi**; `kho` hiện chỉ là giao diện + một báo cáo. Nếu §8 câu 3 chọn chuyển tồn max / đề nghị chuyển về `kho`, đây mới thành phân hệ có nghiệp vụ riêng.

## 8. Tổng hợp

### Ma trận

| | Bảng riêng (chỉ PH ghi) | Action | Ghi sổ qua | Lõi đọc bảng của PH | PH đọc thẳng bảng lõi | Bản chất |
|---|---|---|---|---|---|---|
| `quy` | 2 | 11 | `voucherService.createIn` | **có** (Kernel `periods`, `dimensions`) | — | quy trình trên miền lõi |
| `mua-hang` | 12 | 52 | `postDocumentIn` + `createIn` | — | nhập xuất kho, giá vốn, danh mục kho, phương thức TT | phân hệ thật |
| `ban-hang` | 0 | 0 | — (nguồn ngoài nộp) | — | bán, hoá đơn, giá vốn, sự việc | báo cáo + giao diện |
| `tai-san` | 0 ở PH (6 ở lõi app) | 0 | `eventStore` + `createIn` | — | — | miền lõi |
| `kho` | 0 | 0 | — | — | sự việc | giao diện + báo cáo |

### Khoảng trống năng lực Core (đề xuất bậc 4, chưa viết mã)

| Mã | Thiếu | Phân hệ cần | Đủ ≥ 2? |
|---|---|---|---|
| G1 | Mục kiểm khoá kỳ do module đóng góp | `quy` | không — ngoại lệ, [ADR-0025](../../adr/ADR-0025-cong-kiem-ky-va-chuyen-tiep-duong-dan-cu.md) A |
| G2 | **Cổng đọc chỉ-đọc dữ liệu lõi ngoài sổ cái**: nhập xuất / giá vốn, dòng bán, hoá đơn, sự việc theo docType (`ledger.query` chỉ đọc sổ) | `mua-hang`, `ban-hang`, `kho` | **có (3)** |
| G3 | **Slot mẫu in** cho web module — lõi web đang import mẫu in của cả 5 phân hệ ở `printCatalog.ts` (hiện có slot: `partner.detail.tab`, `product.detail.tab`, `document.detail.panel`, `dashboard.widget`, `ledger.drilldown.source`) | cả 5 | **có (5)** |
| G4 | Chỗ đăng ký `LEDGER` / `GOODS` ở lõi, không gắn qua phân hệ (§2) | cả 5 | **có** — việc Nhóm Lõi, không đổi hợp đồng |
| G5 | Thành phần dùng chung thay cho trang lõi web bị import: `DocumentDetail` (`quy`, `ban-hang`, `kho`), `PartnersPage` / `ProductsPage` (`mua-hang`), `TenantPage` (`tai-san`), `salesFilters` | 5 | **có** — qua `@bizcity/ui-kit` hoặc slot |
| G6 | docType khấu hao / ghi tăng giảm tài sản cho module | `tai-san` | không — chỉ cần nếu §8 câu 2 chọn phương án B |

### Thứ tự đề xuất (cập nhật ADR-0024 Quyết định 5)

1. **G4, G3, G5** trước đợt 2 (không đổi sổ; mở đường cho mọi đợt).
2. **G2** trước khi chuyển API của `ban-hang`, `kho`, `mua-hang` (đợt 2 và 5).
3. Đợt 1a `quy` không chờ gì ngoài ADR-0025 B (nếu bỏ đường cũ); đợt 1b chờ G1.
4. Đợt 2 chia: `ban-hang`, `kho` → chuyển **web** trước (sau G3 / G5), API sau G2; `tai-san` theo §8 câu 2.

### Cần chủ dự án quyết

1. **G2** (cổng đọc dữ liệu lõi): mở ADR đề xuất? Đây là khoảng trống lớn nhất, chặn 3 phân hệ.
2. **Tài sản:** (A) giữ là miền lõi — chuyển `apps/api/src/modules/assets` vào Kernel ở một đợt riêng, `tai-san` chỉ còn giao diện module; hay (B) thành module đầy đủ, cần G6 (docType khấu hao). Đề xuất **A**: khấu hao đã được AGENTS.md xếp là sự việc Kernel tự lập.
3. **Tồn max / đề nghị chuyển kho** (`stock_levels`, `stock_sku_settings`, `stock_max_requests`, `transfer_requests`): ở lại `mua-hang` hay thuộc `kho`? Đây là việc của người đóng góp mua hàng (Nguyễn Văn Thủy) — hỏi trước khi quyết.
4. Đồng ý thứ tự đề xuất ở trên (G4 / G3 / G5 trước đợt 2)?

## 9. Cách tái lập số đo

Script dò (đọc mọi `.ts` ở `packages/kernel/src`, `packages/platform/src`, `apps/api/src`, `modules/`; một tệp có `insertInto` / `updateTable` / `deleteFrom` hoặc `INSERT INTO` / `UPDATE` / `DELETE FROM` với tên bảng thì tính là ghi, còn lại là đọc). Có dương tính giả đã loại tay: `packages/platform/src/core/documents.ts` chỉ nhắc `purchase_attachments` trong chú thích; `packages/platform/src/db/types.ts` là khai kiểu. Chạy lại trước mỗi chữ chốt đợt.
