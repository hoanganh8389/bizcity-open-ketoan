# Bản đồ tái sử dụng: code hiện tại → Kernel / Platform / Module
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk. -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-31 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — core/workflow.ts → packages/documents (máy trạng thái khai báo, PHASES 3.5). -->
<!-- [2026-10-31 08:27 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7) có: ctx.ledger.query, khung nhìn bizcity_read.* -->

> **Kết quả Phase 1** ([PHASES.md](PHASES.md)). Quét ngày 2026-10-29 trên `apps/api/src` (27.816 dòng TS), `apps/web/src`, `packages/contracts`. Số dòng là số dòng tệp `.ts`/`.tsx`, để ước độ lớn, không phải thước đo chất lượng.
> Cây đích: [TARGET-LAYOUT.md](TARGET-LAYOUT.md). Phát hiện nền trước đó: [../audits/AUDIT-2026-10-28-BASELINE.md](../audits/AUDIT-2026-10-28-BASELINE.md) (A-01..A-16); phát hiện mới ở §5 (A-17..A-26).

## 1. Ký hiệu phân loại

| Ký hiệu | Lớp | Đích | Nghĩa |
|---|---|---|---|
| **K** | Kernel kế toán | `packages/kernel` | Đúng sai của sổ sách phụ thuộc vào nó. Đóng với module |
| **P** | Platform chung | `packages/{data,permissions,audit,events,actions,documents,module-sdk,cli}` | Không biết kế toán; module nào cũng dùng |
| **M** | Danh mục chuẩn | `packages/data` (thực thể) + `packages/kernel` (thuộc tính hạch toán) | Đối tượng, mặt hàng, chi nhánh, kho… dùng chung mọi module; kế toán gắn thêm tài khoản, nhóm hạch toán |
| **D** | Module nghiệp vụ | `modules/<key>` | Nghiệp vụ riêng, cài / gỡ được |
| **A** | Adapter | `adapters/{postgres,cell,wordpress}` | Nối với hạ tầng hay hệ thống ngoài |
| **U** | UI kit | `packages/ui-kit` | Thành phần giao diện dùng chung |

## 2. Tổng quan theo lớp (API)

| Lớp | ≈ dòng | Tỉ lệ | Nhận xét |
|---|---|---|---|
| K | 9.000 | 32% | Đã gom khá gọn trong `modules/{documents,posting,ledger,periods,…}`; việc chính là **chuyển chỗ** và gom cửa ghi (A-01) |
| P | 2.100 | 8% | **Ít.** Documents chung, Action runtime, Event, Evidence gần như phải **xây mới**, không có nhiều để tách |
| M | 2.700 | 10% | Đang chung với thuộc tính kế toán trong cùng bảng (vd `products` có nhóm hạch toán) |
| D | 10.900 | 39% | Mua hàng (3.656) và Báo cáo (3.479) lớn nhất |
| A | 1.100 | 4% | Kết nối WooCommerce / trạm ACC14, add-in AI |
| sinh tự động / seed | 1.700 | 6% | `db/types.ts`, `db/seed.ts` |

**Kết luận chính:** Phase 2 không phải "tách code ra package" là xong. Kernel thì tách được; Platform phải viết mới khoảng 4 gói (Documents chung, Actions, Events, Evidence) theo hợp đồng. Lấy mẫu từ những chỗ đã làm đúng: cửa nạp sổ có phiên bản (Document, Event), `tro-ly /simulate` (dry-run), `payment_requests` (luồng duyệt), `document_signatures` (ký).

## 3. Bản đồ API (`apps/api/src`)

### 3.1 `core/`, `config/`, `db/`

| Đường dẫn | Dòng | Lớp | Đích | Ghi chú tách |
|---|---|---|---|---|
| `core/errors.ts`, `core/http.ts` | 150 | P | `packages/actions` (lỗi, khuôn phản hồi) | `ERROR_CODES` lẫn mã kế toán (`PERIOD_LOCKED`, `POSTING_FAILED`, `UNBALANCED_ENTRY`): giữ mã, chuyển định nghĩa sang Kernel đăng ký thêm |
| `core/auth.ts`, `core/security/*` | 220 | P | `packages/permissions` | `PERMISSIONS` là danh sách **đóng** chứa quyền kế toán (`ledger:read`, `payments:approve`…) → thành registry mở, Kernel và module đăng ký quyền (A-23) |
| `core/audit.ts` | 29 | P | `packages/audit` | Thành lõi của Evidence; thêm `actor_kind`, `request_id`, `result`, biên nhận |
| `core/addins.ts` | 57 | P | `packages/module-sdk` | Gộp với `phan-he/types.ts` thành `defineModule()` |
| `core/date-rules.ts` | 58 | P | `packages/documents` (khoá theo ngày) | Khoá theo ngày là luật chung của chứng từ; đọc `tenants.settings.dataLock` → chuyển sang settings registry |
| `core/workflow.ts` | 190 | P | `packages/documents` (máy trạng thái) | Đọc `*.workflow.yaml` (năng lực `documents.workflow`); `PERMISSIONS` đóng → khi quyền thành registry mở (A-23), YAML khai quyền module |
| `core/posting-modes.ts` | 28 | K | `packages/kernel` | Chế độ ghi ngay / chờ duyệt theo `docType` |
| `config/env.ts` | — | P | `bizcity.config.ts` + `packages/data` | `ENABLED_MODULES`, `ADDINS`, `BOOK_MODE` chuyển thành cấu hình có kiểu |
| `db/client.ts`, `db/migrate.ts` | ≈175 | P + A | `packages/data` (giao dịch, runner) + `adapters/postgres` | Runner hiện đọc một thư mục `db/migrations`; cần runner theo module (A-26) |
| `db/types.ts` | 1.375 | — | sinh theo từng gói | Kiểu Kysely của **mọi** bảng ở một tệp: module thấy được kiểu bảng Kernel |
| `db/seed.ts` | 280 | K | `packages/kernel/seeds` | Hệ thống tài khoản TT200, tài khoản ngầm định, lý do |

### 3.2 `modules/` (lõi hiện tại)

| Thư mục | Dòng | Lớp | Đích | Ghi chú tách |
|---|---|---|---|---|
| `documents` | 1.306 | K | `kernel/intake` | `postDocumentIn()` là cửa nạp sổ. Mẫu tốt cho phiên bản + idempotency của Document/Event |
| `posting` | 1.059 | K | `kernel/posting` | Luật định khoản + `AccountResolver` |
| `posting-config` | 399 | K | `kernel/config` | Lý do, nhóm hạch toán, tài khoản ngầm định |
| `ledger` | 873 | K | `kernel/ledger` | Cửa ghi duy nhất vào `ledger_*` |
| `periods` | 328 | K | `kernel/periods` | Kỳ, khoá sổ |
| `accounts` | 332 | K | `kernel/accounts` | Hệ thống tài khoản |
| `debts` | 445 | K | `kernel/subledgers/debts` | Sổ phụ công nợ sinh khi ghi sổ |
| `inventory` | 1.012 | K | `kernel/subledgers/inventory` | Nhập xuất kho + tính giá vốn. `costing` ghi sổ qua `eventStore` (A-01 xong 2026-10-30) |
| `tax-invoices`, `tax-info`, `tax-codes` | 500 | K | `kernel/tax` | `tax-info.service.ts:168` cập nhật trạng thái thẳng (A-16) |
| `sales` | 550 | K + D | `kernel/projections` + `modules/ban-hang` | Dòng bán là bảng tra cứu dựng lại được (projection); báo cáo bán hàng là module |
| `closing` | 939 | K | `kernel/closing` | Kết chuyển, cuối năm. Ghi sổ qua `eventStore` (A-01 xong 2026-10-30) |
| `vouchers` | 526 | K + D | `kernel/intake` (loại `manual`) + `modules/ke-toan` (màn) | Ghi sổ qua `eventStore` (A-01 xong 2026-10-30) |
| `default-data` | 675 | K | `kernel/seeds` | Dữ liệu mặc định đơn vị mới |
| `partners`, `products`, `branches`, `warehouses`, `unit-names`, `bank-accounts` | 1.660 | M | `data/masterdata` + `kernel` (thuộc tính hạch toán) | Thực thể dùng chung; cột tài khoản / nhóm hạch toán thuộc Kernel |
| `catalog` | 1.066 | M + P | `data/masterdata` + `events` | `catalog-notify.ts` (báo hệ thống bán hàng bằng `setTimeout`) → sự kiện `bizcity.masterdata.product.changed` (A-22) |
| `dimensions` | 235 | P + D | `data` (mã phân tích chung) + `modules/hop-dong` | `dimensions` kind `contract` + `contract-schedule.routes.ts` là **nghiệp vụ hợp đồng nằm trong lõi** (xem [GOLDEN-CASE-HOP-DONG.md §7](GOLDEN-CASE-HOP-DONG.md#7-quan-hệ-với-code-hiện-có)) |
| `signatures` | 107 | P | `documents/signatures` | `document_signatures.event_id` → `accounting_events`: chỉ ký được chứng từ kế toán (A-20) |
| `reference-documents` | 119 | P | `documents/links` | Chứng từ tham chiếu; trạng thái `open/used/closed` |
| `print-templates`, `voucher-templates` | 423 | U + D | `ui-kit/print` + `modules/ke-toan` | Mẫu in chung; mẫu phiếu kế toán thuộc module |
| `reports` | 3.479 | D | `modules/ke-toan/reports` | Đọc sổ qua khung nhìn chỉ đọc `bizcity_read.*` (`ledger.query`, 2026-10-31; SC-KERNEL-7); chuyển thư mục cùng 3.9 |
| `assets` | 1.465 | D | `modules/tai-san` | Khấu hao ghi sổ qua `eventStore` (A-01 xong 2026-10-30); đích: `ctx.ledger.submit` với `docType` khấu hao |
| `access`, `auth` | 494 | P | `permissions` | Người dùng, vai trò, khoá API |
| `system` | 511 | P | `cli` (chẩn đoán) + `module-sdk` (registry) | `/system/modules`, `/system/schema`, `schema-catalog.ts` |
| `connections` | 400 | A | `adapters/wordpress` | Kéo chứng từ WooCommerce / trạm ACC14, đi qua `postDocumentIn` (đúng cửa) |

### 3.3 `phan-he/` và `addins/`

| Thư mục | Dòng | Lớp | Đích | Ghi chú tách |
|---|---|---|---|---|
| `phan-he/mua-hang` | 3.656 | D | `modules/mua-hang` | Duyệt phiếu đi `postDocumentIn` (đúng). Nhưng: ghi thẳng `posting_reasons` (`posting.ts:40,55`), `document_sequences` (`store.ts:266`), `branches` (`ton-max.ts:73`), danh mục ở `demo.ts`; nhật ký là tệp JSONL (`log.ts`); đính kèm riêng `purchase_attachments` (A-17, A-18, A-19) |
| `phan-he/thue` | 1.160 | D | `modules/thue` | Ghi thẳng `partners`, `reference_documents` (`authority-invoice.routes.ts:170,174`) (A-17) |
| `phan-he/quy` | 320 | D | `modules/quy` | `payment_requests`: luồng duyệt 2 cấp tự viết (mẫu cho `documents.workflow`); ghi thẳng `contract_schedules` (`:264`), `document_sequences` (`:49`) |
| `phan-he/ke-toan` | 372 | D | `modules/ke-toan` | Kế hoạch tài chính ghi `cash_plans`, `cost_norms` (bảng tạo ở migration nền của lõi, A-26) |
| `phan-he/{ban-hang,kho,tai-san,api,he-thong}` | ≈40 | D | `modules/*` | Chỉ là tệp lắp route từ `modules/` |
| `phan-he/{index,loi,types}.ts` | 96 | P | `index`, `loi`: lắp ráp `apps/server` (LAYOUT-6); `types`: `module-sdk` | `CORE_ROUTES`, `LEDGER` là danh sách lắp ráp; `ApiModule` thành `defineModule` |
| `addins/tro-ly` | 360 | A + P | `adapters/cell` (tri thức) + mẫu `actions.dry-run` | `/simulate` chạy luật thật trong giao dịch rồi huỷ: **mẫu chuẩn cho dry-run**. Kho tri thức là JSONL → về Cell (RAG) |
| `addins/spreadsheet-ai` | 50 | A | `adapters/cell` | Nhúng ứng dụng bảng tính AI ngoài |
| `addins/excel-export` | 279 | D | `modules/xuat-excel` (extension) | Xuất Excel từ báo cáo |

### 3.4 Module đang dùng những gì của lõi (bề mặt SDK thực tế)

Đếm import từ `phan-he/**` và `addins/**` (bỏ tệp lắp route): đây là **bề mặt tối thiểu** `@bizcity/module-sdk` phải có ở Phase 3.

> Đếm lại chi tiết từng tên (2026-10-30) và API đề xuất: [packages/module-sdk/API.md](../../packages/module-sdk/API.md). Phân loại ở §3.1–§3.3 được gắn thành nhãn đầu tệp `// @bizcity-layer` (R-BOUND-10, bảng [tests/conformance/lib/layers.mjs](../../tests/conformance/lib/layers.mjs)); chiều import giữa các lớp: [docs/audits/deps-2026-10-30.md](../audits/deps-2026-10-30.md).

| Đang import | Số tệp | Thay bằng SDK |
|---|---|---|
| `db/client.js` (`db`, `Db`, `toNumber`) | 21 | `ctx.data.tx`, `ctx.data.money` |
| `core/errors.js` (`Errors`) | 18 | `Errors` từ SDK |
| `core/auth.js` (`authOf`, `requirePermission`) | 17 | `defineAction({ permission })`, `ctx.actor` |
| `core/http.js` (`ok`, `idParamSchema`) | 8 | sinh tự động bởi action runtime |
| `core/audit.js` (`writeAudit`) | 7 | tự động (Evidence) |
| `modules/documents/document.service.js` (`postDocumentIn`, `documentService`) | 5 | `ctx.ledger.submit/cancel/get` |
| `modules/vouchers/voucher.service.js` | 3 | `ctx.ledger.submit({ docType: 'manual' … })` |
| `modules/debts/debt.service.js` (`allocate`) | 1 | `ctx.ledger.allocateDebt()` (năng lực mới) |
| `modules/partners/partner.repository.js` | 1 | `ctx.data.masterdata.partners` |
| `modules/reports/*`, `modules/assets/asset.service.js` | 3 | `ctx.ledger.query` (năng lực `ledger.query` có từ 2026-10-31) |
| `modules/system/schema-catalog.js` | 1 | `ctx.data.describe()` |

Quyền module đang dùng: chỉ các quyền chung `catalog:*`, `documents:*`, `reports:read`, `settings:write`, `payments:approve`. Không module nào có quyền riêng (vd duyệt phiếu mua = `documents:write`) vì danh sách quyền đóng.

## 4. Bản đồ giao diện và gói hợp đồng

| Đường dẫn | Dòng | Lớp | Đích |
|---|---|---|---|
| `apps/web/src/components/*` (DataGrid 633, FormBlocks, ui, pickers, filters, ExcelImport, PageHeader, HelpDrawer, ReportPanel, print/*, quy-trinh/*) | 3.908 | U | `packages/ui-kit` |
| `components/phieu-hang/*`, `components/voucher/*` | — | U | `ui-kit/document-form` (khuôn màn chứng từ có dòng) |
| `apps/web/src/layout/*` | 870 | U | `ui-kit/shell` (menu, tab làm việc, thanh phân hệ) |
| `apps/web/src/lib/{api,auth,format,docso}.ts` | — | U | `ui-kit/client` (gọi action, đăng nhập, định dạng tiền, đọc số thành chữ) |
| `apps/web/src/features/{ledger,posting,documents,vouchers,catalog}` | phần lớn 10.334 | D | `modules/ke-toan/web`, `modules/danh-muc/web` |
| `apps/web/src/features/{auth,access,system,launcher,flow}` | — | P/U | `apps/web` (vỏ ứng dụng) |
| `apps/web/src/phan-he/<key>/` | 21.400 | D | `modules/<key>/web` (mua-hang 8.757, ke-toan 6.854) |
| `packages/contracts/src/documents.ts`, `vouchers.ts`, `invoices.ts` | 818 | K | `@bizcity/kernel/contracts` |
| `packages/contracts/src/{api,money,module}.ts` | 112 | P | `@bizcity/actions`, `@bizcity/data`, `@bizcity/module-sdk` |
| `packages/contracts/src/{enums,dvt}.ts` | 187 | M + K | tách theo từng hằng |
| `packages/contracts/src/connections.ts` | 93 | A | `adapters/wordpress` |
| `packages/contracts/src/print-templates.ts` | 45 | U | `ui-kit/print` |
| `packages/contracts/src/mua-hang/*` | 2.031 | D | `modules/mua-hang/domain` (A-06) |

## 5. Phát hiện mới (bổ sung audit)

| Mã | Mức | Phát hiện | Bằng chứng | Hợp đồng sửa |
|---|---|---|---|---|
| **A-17** | Cao | Module ghi thẳng bảng danh mục / cấu hình của lõi | `mua-hang/posting.ts:40,55` → `posting_reasons`; `mua-hang/demo.ts:47-66` → `branches, partners, item_classes, product_units, products, tax_codes`; `mua-hang/ton-max.ts:73` → `branches`; `thue/authority-invoices/authority-invoice.routes.ts:170,174` → `partners, reference_documents`; `quy/payment-requests/payment-request.routes.ts:264` → `contract_schedules` | Data (STD-DATA-3), Action |
| **A-18** | Cao | Bằng chứng rải 6 nơi, hai nơi là **tệp** ngoài CSDL (không vào sao lưu CSDL, không truy vấn được, không chuỗi băm) | `audit_logs`, `posting_log`, `accounting_event_versions`, `period_lock_events`, `phan-he/mua-hang/log.ts` (JSONL), `addins/tro-ly/store.ts` (JSONL) | Evidence |
| **A-19** | TB | Đính kèm chỉ có cho Mua hàng | `purchase_attachments` (`0018_chu_thich_tep_dinh_kem.sql`) | Document (`documents.attachments`) |
| **A-20** | TB | Luồng duyệt và ký tự viết riêng từng nơi; ký chỉ gắn chứng từ kế toán | `payment_requests.status` (7 trạng thái), `purchase_documents` (trạng thái riêng), `document_signatures.event_id → accounting_events` | Document (`documents.workflow`, `documents.signatures`) |
| **A-21** | Cao | Không có idempotency cho hành động ngoài cửa nạp sổ: gửi lại "tạo yêu cầu thanh toán", "duyệt phiếu mua" có thể tạo trùng | không có `Idempotency-Key` trong `apps/api/src` | Action (STD-ACT-4) |
| **A-22** | Cao | Không có sự kiện miền, không có hàng đợi việc / lịch: báo đổi danh mục dùng `setTimeout` trong bộ nhớ (mất khi khởi động lại); nhắc hạn hợp đồng không chạy định kỳ được | `modules/catalog/catalog-notify.ts:16-30` | Event |
| **A-23** | TB | Cô lập đơn vị chỉ ở tầng ứng dụng (`where tenant_id`); không có RLS. Danh sách quyền đóng: module không khai được quyền riêng | không có `ROW LEVEL SECURITY` trong `db/migrations`; `core/auth.ts:20-38` | Data (STD-DATA-5), Module |
| **A-24** | TB | Không có MCP; mô tả hành động nằm rải ở route Fastify. OpenAPI sinh từ zod là nền tốt để sinh công cụ MCP | `/api/docs` | Action (`expose.mcp`) |
| **A-25** | TB | Danh tính một phân hệ khai 5 nơi; add-in và phân hệ là hai cơ chế khác nhau | `phan-he/types.ts`, `web/src/phan-he/<key>/manifest.ts`, `core/addins.ts`, `API_MODULES`, `CODEOWNERS` | Module |
| **A-26** | TB | Bảng của nghiệp vụ nằm trong migration nền của lõi; migration mọi module chung một dãy số | `contract_schedules`, `cash_plans`, `cost_norms` ở `0002_goc_danh_muc.sql`; `payment_requests` ở `0005`; tài sản ở `0009`; Mua hàng ở `0010+` | Data (STD-DATA-7) |

## 6. Việc cần chốt trước Phase 2

> **Đã chốt 2026-10-29** cả ba câu dưới, theo khuyến nghị: (1) [ADR-0003](../adr/ADR-0003-hop-dong-thanh-module.md) · (2) [ADR-0004](../adr/ADR-0004-ban-hang-tach-doi.md) · (3) [ADR-0005](../adr/ADR-0005-danh-muc-chuan-o-packages-data.md). Tiến độ gỡ từng chỗ A-17 đo bằng check SC-MOD-2 trên [bảng điểm](../../tests/conformance/README.md).

1. **Nghiệp vụ hợp đồng trong lõi** (`dimensions` kind `contract`, `contract_schedules`, `payment_requests.contract_schedule_id`, `cash_plans.source_ref = 'contract:…'`): chuyển thành module `hop-dong` (khuyên, khớp ca chuẩn) hay giữ ở lõi.
2. **`sales` là Kernel hay module:** dòng bán sinh khi ghi sổ (projection của Kernel), nhưng báo cáo bán hàng là module. Khuyên tách đôi như bảng trên.
3. **Danh mục chuẩn (M) thuộc gói nào:** khuyên đặt thực thể ở `packages/data/masterdata` (CRM, POS dùng không cần Kernel), còn cột tài khoản / nhóm hạch toán do Kernel quản qua bảng mở rộng hoặc cột có chủ rõ ràng.
