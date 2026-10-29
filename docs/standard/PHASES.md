# Lộ trình Standard v1: Phase 1 → 6

> Thay phần "Giai đoạn 0–3" của [../framework/05-LO-TRINH.md](../framework/05-LO-TRINH.md) (tệp đó giữ phần tư vấn và trỏ về đây). Mỗi việc cũ có mã (vd `1.1`) được ghi lại ở cột "Từ lộ trình cũ".
> **Bản máy đọc:** [roadmap.json](roadmap.json) (`bizcity_roadmap@1`). Mỗi việc dưới đây có điều kiện "xong" là **tín hiệu đo được**: check SC- / DG- đạt, năng lực `available`, tệp có mặt, độ phủ CONF, hoặc việc tay có người và ngày xác nhận.
> - `node tests/conformance/selfcheck.mjs` tự tính trạng thái từng việc, tiến độ từng Phase, ma trận mảng × Phase, việc kế tiếp, cảnh báo làm trái thứ tự (mục "Lộ trình theo Phase" trong `SCOREBOARD.md`).
> - Thêm, bớt, sửa việc ở bảng dưới thì sửa `roadmap.json` trong cùng PR; SC-RMP-1 so hai bên.
> - Đánh dấu việc tay đã xong: thêm `"doneAt": "YYYY-MM-DD", "by": "<người>"` vào tín hiệu `manual`.
>
> Nguyên tắc: **không viết lại**. Mỗi Phase giữ 624 phép thử hiện có xanh, máy chủ đang chạy nâng cấp được không đổi cấu hình (VER-3). Thời lượng là ước lượng cho 2–3 người làm Lõi.

| Phase | Mục tiêu | Đầu ra | Ước lượng |
|---|---|---|---|
| 0 | Chốt chuẩn | `docs/` này, CI | đang làm |
| 1 | Audit code kế toán, phân loại generic / domain | Bản đồ tái sử dụng | 1 tuần |
| 2 | Trích xuất Kernel, Data, Document, Action | Core chạy độc lập | 6–8 tuần |
| 3 | Module SDK, manifest, permission, event | Kế toán chạy dưới dạng module | 6–8 tuần |
| 4 | AGENTS.md, CLI, starter template, bộ kiểm | Claude tạo được module mới (ca chuẩn đạt) | 3–4 tuần |
| 5–6 | Kiểm chứng CRM / kho, Cell adapter, WordPress adapter tối thiểu | Beta cho developer | 6–10 tuần |

## Phase 0 — Chốt chuẩn

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 0.1 | Nhóm Lõi duyệt `docs/standard/`, 7 hợp đồng, CANON | PR merge | 0.1 |
| 0.2 | Bật CI (`.github/workflows/ci.yml`) | badge xanh | 0.2 |
| 0.3 | Migration đúng chuẩn: sửa hai migration trùng `0028` (A-03); mọi bảng / cột trong `db/types.ts` có migration tạo | SC-DATA-1 hết trùng, SC-DATA-7 đạt — **xong** 2026-10-30 (`0031`, `0030`, `0033`) | 0.3 |
| 0.4 | Chốt 3 câu hỏi ở [REUSE-MAP.md §6](REUSE-MAP.md#6-việc-cần-chốt-trước-phase-2) | ghi ADR — **xong** 2026-10-29 (ADR-0003, 0004, 0005) | mới |
| 0.5 | Bộ kiểm chuẩn một chỗ `tests/conformance/`: lane selfcheck + diagnostics song song, bảng điểm, baseline bánh cóc, tự kiểm ([ADR-0006](../adr/ADR-0006-bo-kiem-chuan-mot-cho.md)) | `selfcheck.mjs --self-test` và `--strict` xanh ở CI — **khởi tạo xong** 2026-10-29 | mới |
| 0.6 | Luật R-KER, R-SEC, R-REL, R-DIAG; `SECURITY.md`, `CHANGELOG.md`; bật GitHub Private Vulnerability Reporting | SC-SEC-*, SC-REL-* xanh — **tài liệu xong** 2026-10-29; còn bật tính năng trên GitHub | mới |
| 0.7 | Vai trò CSDL `ketoan_app` không superuser cho API (R-SEC-6); header bảo mật ở proxy (R-SEC-11) | DG-SEC-1 đạt | mới |

## Phase 1 — Audit, phân loại generic / domain

**Đầu ra: bản đồ tái sử dụng** — bản nháp đã có: [REUSE-MAP.md](REUSE-MAP.md).

| # | Việc | Xong khi |
|---|---|---|
| 1.1 | Rà REUSE-MAP với người phụ trách từng phân hệ; sửa phân loại sai | mỗi dòng có người xác nhận |
| 1.2 | Gắn chú thích đầu tệp `@bizcity-layer K|P|M|D|A|U` cho mọi tệp `apps/api/src/**` | script đếm: 100% tệp có nhãn |
| 1.3 | Biến A-17..A-26 thành việc có người nhận; với mỗi chỗ module ghi bảng lõi (A-17) chọn: action của Core thay thế, hay chuyển bảng về module | danh sách việc |
| 1.4 | Dựng đồ thị phụ thuộc hiện tại (dependency-cruiser) và lưu làm mốc | `docs/audits/deps-<ngày>.svg` |
| 1.5 | Liệt kê bề mặt SDK tối thiểu từ import thực tế (REUSE-MAP §3.4) → bản nháp API `@bizcity/module-sdk` | `packages/module-sdk/API.md` |

## Phase 2 — Trích xuất Kernel, Data, Document, Action

**Đầu ra: Core chạy độc lập** = `apps/server` khởi động chỉ với Kernel + Platform (không module nào), nhận chứng từ qua `POST /documents`, ghi sổ đúng, bộ test Kernel xanh.

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 2.1 | **`eventStore.commit()`**: gom chuỗi sự việc → phiên bản → đảo → ghi. Chuyển `vouchers`, `closing`, `assets`, `inventory/costing` sang (A-01) | `DEBT_LEDGER_CALLERS` trong `kiem-chuan.sh` rỗng | 1.1, 1.2, 1.3 |
| 2.2 | `assertLedgerInvariants()` trong test-kit, gọi ở `afterAll` mọi tệp test | chạy trong CI | 1.4 |
| 2.3 | Workspace `packages/kernel`: chuyển `modules/{documents,posting,posting-config,ledger,periods,accounts,debts,inventory,tax-*,closing,default-data}` + `db/seed.ts`; mở `public.ts` (`submit`, `cancel`, `get`) | `apps/api` chỉ import `@bizcity/kernel` công khai | mới |
| 2.4 | `packages/data`: `ctx.data.tx` (đặt `bizcity.tenant_id`), runner migration theo module, schema `bizcity_read` + view danh mục | CONF-MIG chạy được | mới |
| 2.5 | `packages/actions`: `defineAction`, idempotency (`action_requests`), dry-run, mã lỗi mới, sinh route + OpenAPI. Chuyển `phan-he/quy/payment-requests` làm mẫu | CONF-RUN-1/3/4/9 đạt trên yêu cầu thanh toán | mới |
| 2.6 | `packages/audit`: mở rộng `audit_logs` (Evidence §5), trigger chỉ thêm, chuỗi băm, biên nhận; runtime action ghi tự động | CONF-RUN-11/12 đạt | mới |
| 2.7 | `packages/documents`: `nextNumber`, `document_versions`, `document_links`, `attachments` (chuyển `purchase_attachments`), `document_signatures.doc_ref` | Mua hàng dùng đính kèm chung | mới |
| 2.8 | Tách `packages/contracts/src/mua-hang/*` về phân hệ (A-06) | `packages/contracts` không còn thư mục `mua-hang` | 1.6 |
| 2.9 | `GET /api/v1/system/capabilities` trả `bizcity-standard.json` + trạng thái thật | test so khớp | mới |
| 2.10 | Chẩn đoán: `GET /api/v1/system/diagnostics` + `/health/ready`; bảng `diagnostic_runs`; khoá kỳ bị chặn khi L3 có error (R-DIAG-4); `health` trả `version`, `kernel`, `standard` (R-REL-1) — dùng lại SQL của `tests/conformance/diagnostics/` | [../ops/DIAGNOSTICS.md](../ops/DIAGNOSTICS.md), [../rules/RULE-SELF-DIAGNOSTICS.md](../rules/RULE-SELF-DIAGNOSTICS.md) | 1.5 |
| 2.11 | **`platform/mcp` đọc (2b)**: `POST /mcp`, công cụ `ketoan.*` §5.1 bọc route hiện có, khoá `mcp_…` có scope, phong bì + `as_of` ([bizcity_mcp@1](../contracts/BIZCITY-MCP-v1.md)) | Claude / ChatGPT đọc được cân đối phát sinh, công nợ của một đơn vị | mới |
| 2.12 | MCP sinh từ registry action; `needs_confirmation` + `confirm_token` (sau 2.5) | CONF-MCP-1..5 đạt | mới |

**Rủi ro:** RLS và chuỗi băm bằng chứng tốn hiệu năng. Đo trên dữ liệu thật (30.000 chứng từ / ngày) trước khi bật cho bảng Kernel; bảng module bật ngay vì mới và nhỏ.

## Phase 3 — Module SDK, manifest, permission, event

**Đầu ra: Accounting dưới dạng module** = `modules/ke-toan` chỉ import `@bizcity/module-sdk` + `@bizcity/ui-kit`; tắt nó đi Kernel vẫn nhận và ghi sổ chứng từ từ POS.

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 3.1 | `@bizcity/module-sdk`: `defineModule`, `ctx` (data, documents, ledger, events, settings, actions, evidence, notify) | API.md ổn định | 2.4 |
| 3.2 | Manifest `bizcity.module.json` cho 9 phân hệ + 3 add-in; `ApiModule`/`WebModule`/`AddInManifest` sinh từ manifest; A-17 ghi `waivers` có hạn | CONF-MAN đạt (có waiver) | 2.4 |
| 3.3 | Registry quyền mở: Kernel + module đăng ký; màn Phân quyền nhóm theo module | `permissions.module` available | mới |
| 3.4 | `packages/events`: outbox, dispatcher, `event_consumptions`, retry, dead-letter, replay, đồng hồ; Kernel phát `bizcity.ledger.*`; thay `catalog-notify.ts` | CONF-RUN-10 đạt | 3.5 |
| 3.5 | Workflow khai báo (`documents.workflow`); chuyển `payment_requests`, `purchase_documents` sang | 2 luồng chạy bằng YAML | mới |
| 3.6 | Settings registry chạy thật (`settings.get`) | khoá trong `tenants.settings` đều có trong registry | 2.3 |
| 3.7 | `ledger.query`: API đọc sổ cho báo cáo; chuyển `modules/reports` thành `modules/ke-toan/reports` | báo cáo không còn SQL trên `ledger_*` ngoài Kernel | mới |
| 3.8 | `@bizcity/ui-kit` từ `apps/web/src/components` + `layout` + `lib`; slot `partner.detail.tab`, `dashboard.widget`… | `apps/web/src/phan-he/*` chỉ import ui-kit | mới |
| 3.9 | Chuyển `phan-he/*` → `modules/*`; sửa hết A-17 (bỏ waiver) | `kiem-chuan.sh` không còn danh sách nợ | — |
| 3.10 | Role CSDL theo module (`mod_<key>_rw`) | module không `INSERT` được bảng Kernel ở tầng CSDL | 3.4 |
| 3.11 | **Gói định khoản**: bảng `config_packs`, xem trước + cài + gỡ (STD-TPL-5..9), tách `db/seeds` thành `bizcity.vn-tt99.nen` + gói thương mại; màn Gói định khoản | cài gói lên đơn vị trống → mọi `docType` hiện có ghi sổ được | mới |
| 3.12 | `posting.reason.suggest` tất định (từ khoá, ví dụ, lịch sử đơn vị) + manifest `ledger.submits[].reasons` | gợi ý đúng ≥ 80% trên tình huống mẫu của gói | mới |

## Phase 4 — AGENTS.md, CLI, starter template, test

**Đầu ra: Claude tạo được module mới** = [GOLDEN-CASE-HOP-DONG.md §8](GOLDEN-CASE-HOP-DONG.md#8-đo-thế-nào-là-đạt) đạt.

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 4.1 | `@bizcity/cli`: `doctor`, `migrate`, `module new`, `module check`, `events replay`, `evidence verify`, `ledger verify` | [../ops/CLI.md](../ops/CLI.md) cập nhật | 2.7 |
| 4.2 | `templates/starter-module/`: một chứng từ có luồng duyệt, một action chạm sổ mẫu, một subscriber, một slot, test mẫu | module mới sinh ra qua `module check` ngay | mới |
| 4.3 | `tests/conformance/`: toàn bộ CONF-* — thêm lane `runtime` (CONF-RUN, CONF-UPG) vào bộ đã có từ 0.5 | chạy trên 9 phân hệ hiện có; độ phủ CONF-* trên bảng điểm = 100% | 2.6 |
| 4.4 | AGENTS.md mục "Tạo module mới" + `modules/<key>/AGENTS.md` sinh từ template | Claude đọc và làm đúng thứ tự | mới |
| 4.5 | Chạy ca chuẩn 3 lần; mỗi lần vấp → sửa tài liệu / SDK / template | 3/3 đạt | mới |
| 4.6 | Standard lên **1.0.0** (bỏ `-draft`); khoá hợp đồng | tag phát hành | — |

## Phase 5–6 — Kiểm chứng CRM / kho, Cell adapter, WordPress adapter tối thiểu

**Đầu ra: Beta cho developer.**

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 5.1 | Module **CRM** do người ngoài nhóm Lõi viết chỉ bằng SDK (khách tiềm năng, cơ hội, chăm sóc; chuyển thành khách → `core.partner.upsert`) | `module check` đạt, 0 thay đổi Core | 3.7 |
| 5.2 | Module **kho** tách khỏi lõi: màn, báo cáo, tồn max là module; sổ phụ kho ở Kernel | Kernel không còn màn kho | mới |
| 5.3 | `adapters/cell` theo [CHANNEL-GATEWAY-PORT.md](CHANNEL-GATEWAY-PORT.md): khoá 1API + bốn bước + kết nối một chạm ([CELL-CONNECT.md](CELL-CONNECT.md)), cầu MCP `/api/v1/cell/mcp`, liên kết principal, web chat `twin-agent-turn`, `core.notify.send` qua Cell, chuyển `tro-ly` / `spreadsheet-ai` | Cell hỏi được công nợ, lập phiếu nháp qua Zalo có xác nhận; bản Pro bật bằng một khoá; CI "no-cell" xanh | mới |
| 5.3b | Đề xuất H-1..H-5 cho Hub / Cell (proof path, `callback_base`, mode `accounting*`, nhiều khoá một domain, Guru kế toán) | nhóm plugin chấp nhận / từ chối có ghi lại | mới |
| 5.8 | Registry gói định khoản công khai + chữ ký ([TEMPLATE-MARKETPLACE.md](TEMPLATE-MARKETPLACE.md)); OCR hoá đơn qua Cell (khuôn `INVOICE_AI_URL`) | 3 gói official, 1 gói verified của đối tác | mới |
| 5.4 | `adapters/wordpress`: connector hiện có + `bizcity/ledger-php-sdk` + webhook sự kiện; `tgs_accounting_bridge` dùng SDK | plugin WP chạy qua hợp đồng, không gọi URL tự đặt | 2.5 |
| 5.5 | Hàng đợi trước định khoản (`event_inbox`), partition sổ cái theo năm | tải 30.000 chứng từ / ngày | 3.1, 3.2 |
| 5.6 | Gói phát hành theo [RULE-RELEASE](../rules/RULE-RELEASE.md): workflow `release.yml` (cổng R-REL-4, tag ký, image theo digest, SBOM), `compat-matrix.json`, kênh stable / LTS | bản Beta | 3.6 |
| 5.7 | 2 developer ngoài nhóm cài, viết module, gửi phản hồi | ghi lại ở `docs/audits/` | mới |

## Thứ tự không được đảo

1. **2.1 trước 2.3.** Tách Kernel khi còn 4 nơi tự ghi sổ là mang nợ sang gói mới.
2. **2.5 + 2.6 trước 3.1.** SDK là mặt tiền của Action và Evidence; làm SDK trước thì phải làm lại.
3. **3.4 (event) trước 4.2 (template).** Template không có sự kiện thì ca chuẩn không làm được nhắc thanh toán.
4. **4.5 trước 5.1.** Nếu Claude chưa tạo được module Hợp đồng thì người ngoài chưa nên viết CRM.
