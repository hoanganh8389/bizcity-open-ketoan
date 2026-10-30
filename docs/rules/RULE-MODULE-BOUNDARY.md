# RULE · Ranh giới phân hệ (R-BOUND)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk. -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->

> **Cấp:** Tier 1 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-BOUND-1** | Phân hệ **không import** phân hệ khác (máy chủ lẫn giao diện). Cần dùng chung → đưa về lõi theo tiêu chí [../framework/01-CORE-MODULES.md](../framework/01-CORE-MODULES.md) §4 | `phan-he-ranh-gioi.test.ts` |
| **R-BOUND-2** | Phân hệ **không ghi** bảng nhân: `accounting_events*`, `posting_log`, `ledger_*`, `document_sequences`, `tax_invoices*`, `inventory_movements`, `inventory_costs`, `debt_*`. Ghi sổ chỉ bằng nộp sự việc | Grep CI |
| **R-BOUND-3** | Phân hệ **đọc** dữ liệu lõi qua service lõi hoặc view (`sales_lines`, `posted_event_payloads`…); không join trực tiếp vào cột nội bộ có thể đổi | Duyệt PR |
| **R-BOUND-4** | Phân hệ chạy được **một mình** với lõi: `ENABLED_MODULES=<key>`; muốn số liệu phân hệ khác thì khai `includes`, không import | `phan-he.test.ts` |
| **R-BOUND-5** | Bảng riêng của phân hệ đặt tiền tố phân hệ (R-DB-6) và chỉ phân hệ đó ghi | Duyệt PR |
| **R-BOUND-6** | Gói `packages/contracts` (nhân) không chứa nghiệp vụ riêng một phân hệ. `src/mua-hang/*` hiện có là nợ kỹ thuật, chuyển ra gói riêng ở Giai đoạn 1 | Duyệt PR |
| **R-BOUND-7** | Add-in tuân như phân hệ; thêm: route chỉ dưới `/api/v1/addins/<id>` | `core/addins.ts` |
| **R-BOUND-8** | Plugin ngoài chỉ dùng HTTP + hợp đồng có phiên bản; không đọc CSDL lõi, không dùng route chưa nằm trong hợp đồng (route giao diện nội bộ có thể đổi không báo) | `bizcity_api@1` §Phạm vi |
| **R-BOUND-9** | Mỗi phân hệ có người phụ trách trong `.github/CODEOWNERS` cho **cả hai** thư mục `apps/api/src/phan-he/<key>/` và `apps/web/src/phan-he/<key>/` | Duyệt PR |
| **R-BOUND-10** | Mọi tệp `apps/api/src/**` mở đầu bằng nhãn lớp `// @bizcity-layer <lớp> <đích>` (lớp `K`, `P`, `M`, `D`, `A`, `U`; ghép bằng `+`) khớp bảng lớp [`tests/conformance/lib/layers.mjs`](../../tests/conformance/lib/layers.mjs), chép từ [REUSE-MAP §3](../standard/REUSE-MAP.md). Tệp mới: `node scripts/gan-nhan-lop.mjs --write`. Đổi phân loại: sửa REUSE-MAP + bảng lớp trong cùng PR | SC-LAYER-1 |

## Ma trận được / không được

| Hành động | Nhân | Dịch vụ lõi | Phân hệ | Add-in | Plugin ngoài |
|---|---|---|---|---|---|
| Ghi `ledger_*` | `ledgerService` | ✗ (đích) | ✗ | ✗ | ✗ |
| Tạo / sửa `accounting_events` | Event Gateway | qua `eventStore` | qua `postDocumentIn` | qua `postDocumentIn` | qua `POST /documents` |
| Sửa danh mục khung kế toán | — | ✓ (màn cấu hình) | ✗ | ✗ | ✗ |
| Tạo đối tượng, mặt hàng | — | ✓ | ✓ qua service lõi | ✓ qua service lõi | ✓ qua sự việc / `PUT` |
| Bảng CSDL riêng | — | ✓ | ✓ tiền tố | ✓ `addin_` | — |
| Thêm quyền | `core/auth.ts` | PR lõi | PR lõi | PR lõi | — |
| Thêm khoá cấu hình | registry | registry | registry (nhánh riêng) | registry (nhánh riêng) | — |
