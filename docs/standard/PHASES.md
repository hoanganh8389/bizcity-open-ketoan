# Lộ trình Standard v1: Phase 1 → 6
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->
<!-- [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — lộ trình máy đọc bám Phase, ma trận mảng × Phase. -->
<!-- [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh. -->
<!-- [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5). -->
<!-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6). -->
<!-- [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12). -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->
<!-- [2026-10-30 08:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-008 — PITR: lưu WAL, sao lưu gốc, diễn tập khôi phục. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->
<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->
<!-- [2026-10-31 03:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — PHASES 3.5 có: workflow khai báo, hai luồng chạy bằng YAML (S012-1). -->
<!-- [2026-10-31 08:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — 3.7 có: ledger.query (bizcity_read.*, ledgerQuery, ctx.ledger.query, SC-KERNEL-7); chuyển thư mục reports dời sang 3.9 -->
<!-- [2026-11-01 03:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — 2.7 đủ: documents.signatures (doc_ref, 0047) -->
<!-- [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — 2.7: purchase_attachments → document_attachments (0046), tiêu chí "Mua hàng dùng đính kèm chung" đạt -->
<!-- [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — 2.7: documents.numbering / versions / links / attachments có (0045, core/documents.ts) -->
<!-- [2026-10-31 11:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — 2.4: view danh mục bizcity_read (0044), data.read-views available -->
<!-- [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — chủ duyệt chuyển ngay (Q012-2): modules/reports → phan-he/ke-toan/reports; 3.9 còn excel-export và B01 → tai-san -->
<!-- [2026-11-01 10:16 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — thêm 3.13 registry module + vòng đời, 3.14 app ngoài tiến trình -->
<!-- [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — 2.3 có: packages/platform + packages/kernel (D010-7…9) -->

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
| 1.2 | Gắn chú thích đầu tệp `@bizcity-layer K|P|M|D|A|U` cho mọi tệp `apps/api/src/**` (R-BOUND-10) | `node scripts/gan-nhan-lop.mjs`: 100% tệp có nhãn khớp bảng lớp; check SC-LAYER-1 |
| 1.3 | Biến A-17..A-26 thành việc có người nhận; với mỗi chỗ module ghi bảng lõi (A-17) chọn: action của Core thay thế, hay chuyển bảng về module | danh sách việc |
| 1.4 | Dựng đồ thị phụ thuộc hiện tại và lưu làm mốc (`node scripts/do-thi-phu-thuoc.mjs`, Node thuần thay dependency-cruiser); cạnh ngược chiều lớp đo bằng SC-LAYER-2 (ratchet) | `docs/audits/deps-<ngày>.svg` — mốc [deps-2026-10-30](../audits/deps-2026-10-30.md) |
| 1.5 | Liệt kê bề mặt SDK tối thiểu từ import thực tế (REUSE-MAP §3.4) → bản nháp API `@bizcity/module-sdk` | [`packages/module-sdk/API.md`](../../packages/module-sdk/API.md) (§6: 5 câu hỏi mở chốt trước 3.1) |

## Phase 2 — Trích xuất Kernel, Data, Document, Action

**Đầu ra: Core chạy độc lập** = `apps/server` khởi động chỉ với Kernel + Platform (không module nào), nhận chứng từ qua `POST /documents`, ghi sổ đúng, bộ test Kernel xanh.

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 2.1 | **`eventStore`** (`modules/documents/event-store.ts`): gom chuỗi sự việc → phiên bản → đảo → ghi → `posted_version`. Chuyển `vouchers`, `closing`, `assets`, `inventory/costing` sang (A-01) — **xong** 2026-10-30, [PHASE-004](../phases/PHASE-004-MOT-CUA-GHI-SO/README.md) | `DEBT_LEDGER_CALLERS` trong `kiem-chuan.sh` rỗng | 1.1, 1.2, 1.3 |
| 2.2 | `assertLedgerInvariants()` trong test-kit, gọi ở `afterAll` mọi tệp test | chạy trong CI — **có**: `apps/api/test/helpers.ts` + `test/setup.ts` (setupFiles), dùng chung kiểm L3 của 2.10 | 1.4 |
| 2.3 | Workspace `packages/kernel`: chuyển `modules/{documents,posting,posting-config,ledger,periods,accounts,debts,inventory,tax-*,closing,default-data}` + `db/seed.ts`; mở `public.ts` (`submit`, `cancel`, `get`) — **W1 có** 2026-10-30: cổng `apps/api/src/kernel/public.ts` + SC-KERNEL-6 (block), mọi nơi gọi đã chuyển ([PHASE-010](../phases/PHASE-010-TACH-GOI-KERNEL/README.md)); W2 **có** 2026-11-01 (D010-7…9): Platform thành `packages/platform` (`@bizcity/platform`), Kernel 60 tệp thành `packages/kernel` (`@bizcity/kernel`, gốc gói = cổng công khai), đường cũ là tệp chuyển tiếp; SC-KERNEL-6 chặn đường con `@bizcity/kernel/<đường>` ngoài Kernel, SC-LAYER-2 đi theo import gói | `apps/api` chỉ import `@bizcity/kernel` công khai | mới |
| 2.4 | `packages/data`: `ctx.data.tx` (đặt `bizcity.tenant_id`), runner migration theo module, schema `bizcity_read` + view danh mục — **RLS + gắn đơn vị có** 2026-10-30 ([PHASE-007](../phases/PHASE-007-CO-LAP-DON-VI-RLS/README.md)); **view danh mục có** 2026-10-31 (migration `0044`, năng lực `data.read-views`); còn migration theo module (`data.migrations.module`, Phase 3) | CONF-MIG chạy được | mới |
| 2.5 | `packages/actions`: `defineAction`, idempotency (`action_requests`), dry-run, mã lỗi mới, sinh route + OpenAPI. Chuyển `phan-he/quy/payment-requests` làm mẫu | CONF-RUN-1/3/4/9 đạt trên yêu cầu thanh toán — **có**: runtime `apps/api/src/core/actions.ts` (gói `packages/actions` tách cùng 2.3), `test/actions.test.ts` | mới |
| 2.6 | `packages/audit`: mở rộng `audit_logs` (Evidence §5), trigger chỉ thêm, chuỗi băm, biên nhận; runtime action ghi tự động | CONF-RUN-11/12 đạt — **có**: migration 0036, `core/audit.ts` `writeEvidence`, `GET /evidence/:id`, `EVIDENCE_CHAIN`, `test/evidence.test.ts` (gói `packages/audit` tách cùng 2.3) | mới |
| 2.7 | `packages/documents`: `nextNumber`, `document_versions`, `document_links`, `attachments` (chuyển `purchase_attachments`), `document_signatures.doc_ref` — **có** 2026-11-01 ([PHASE-010](../phases/PHASE-010-TACH-GOI-KERNEL/README.md) S010-2): `core/documents.ts` + `ctx.documents.*`, migration 0045, đánh số một chỗ trên bộ đếm Kernel; đính kèm Mua hàng chạy trên đính kèm chung (migration 0046: tệp cũ giữ chỗ, không cần chép); ký theo vai trên mọi chứng từ (`document_signatures.doc_ref`, 0048) — **đủ** | Mua hàng dùng đính kèm chung | mới |
| 2.8 | Tách `packages/contracts/src/mua-hang/*` về phân hệ (A-06) | `packages/contracts` không còn thư mục `mua-hang` | 1.6 |
| 2.9 | `GET /api/v1/system/capabilities` trả `bizcity-standard.json` + trạng thái thật | test so khớp — **có**: `diagnostics.test.ts` | mới |
| 2.10 | Chẩn đoán: `GET /api/v1/system/diagnostics` + `/health/ready`; bảng `diagnostic_runs`; khoá kỳ bị chặn khi L3 có error (R-DIAG-4); `health` trả `version`, `kernel`, `standard` (R-REL-1) — dùng lại SQL của `tests/conformance/diagnostics/`; cùng mã kiểm SC-DIAG-1 | **có** (màn xem lịch sử: Phase 3): [../ops/DIAGNOSTICS.md](../ops/DIAGNOSTICS.md), [../rules/RULE-SELF-DIAGNOSTICS.md](../rules/RULE-SELF-DIAGNOSTICS.md) | 1.5 |
| 2.11 | **`platform/mcp` đọc (2b)**: `POST /mcp`, công cụ `accounting.*` §5.1 bọc route hiện có, khoá `mcp_…` có scope, phong bì + `as_of` ([bizcity_mcp@1](../contracts/BIZCITY-MCP-v1.md)) | Claude / ChatGPT đọc được cân đối phát sinh, công nợ của một đơn vị — **có**: `modules/system/mcp.routes.ts`, công cụ `modules/reports/report.actions.ts`, `test/mcp.test.ts` (khoá `mcp_…` riêng: sau) | mới |
| 2.12 | MCP sinh từ registry action; `needs_confirmation` + `confirm_token` (sau 2.5) | CONF-MCP-1..5 đạt — **có** (CONF-MCP-1, -3, -4 trong `test/mcp.test.ts`; -5 khi có action chạm sổ phơi cho AI) | mới |
| 2.13 | Quan sát + mã lỗi chuẩn ([ADR-0007](../adr/ADR-0007-goi-chia-se-va-ha-tang.md)): danh mục [`bizcity_errors@1`](../contracts/BIZCITY-ERRORS-v1.md), `X-Request-Id` / `traceparent`, log có cấu trúc, `GET /metrics`, bộ giám sát [`infrastructure/monitoring/`](../../infrastructure/monitoring/README.md) (6 dashboard, 8 cảnh báo) | SC-ERR-1 đạt; `test/observability.test.ts` — **có** | mới |
| 2.14 | **Chính sách kế toán có phiên bản + ngày hiệu lực** (`posting.policy-version`): cấu hình định khoản, lý do, nhóm hạch toán có `policy_version` + `effective_from`; ghi sổ chọn bản theo ngày chứng từ; `posting_log.policy_version` | năng lực `posting.policy-version` available; C-9 của ma trận tuân thủ đạt — **có** 2026-10-30 ([PHASE-005](../phases/PHASE-005-CHINH-SACH-CO-PHIEN-BAN/README.md), [ADR-0009](../adr/ADR-0009-chinh-sach-ke-toan-co-phien-ban.md)) | mới (G2-09) |
| 2.15 | **Sao lưu PITR**: WAL archiving (`infrastructure/backup/`, chỉ PostgreSQL: `archive_command` + `pg_basebackup`; wal-g / pgBackRest tuỳ chọn), diễn tập khôi phục tới một thời điểm, đo RTO / RPO — **cơ chế có** 2026-10-30, diễn tập máy dev ĐẠT ([PHASE-008](../phases/PHASE-008-SAO-LUU-PITR/README.md)); còn diễn tập trên máy chủ thật | `infrastructure/backup/README.md`; biên bản diễn tập ở `docs/audits/` | mới (G1-08, G3-07) |
| 2.16 | **MCP ghi**: `accounting.document.create_draft`, `accounting.journal.post`, `accounting.entry.reverse`, luôn xem trước + `confirm_token`; AI chỉ tạo nháp / chờ duyệt (STD-MCP-4, -6) — **có** 2026-10-30 trừ `journal.post` ([PHASE-009](../phases/PHASE-009-MCP-GHI/README.md)) | test MCP cho 3 công cụ ghi; CONF-MCP-5 | mới (G2-04) |
| 2.17 | **Trạm tiền kiểm — danh mục + preflight** ([ADR-0014](../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md), [PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) W1): hợp đồng `bizcity_intake_findings@1`, mã `IN-*` L1–L4, `preflight()` gom mọi lỗi bằng chính luật cửa nạp; test cặp block ⇔ cửa nạp từ chối <!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — thêm 2.17–2.21 (ADR-0014) --> — **có** 2026-11-02 (W1): 20 mã L1–L4, `preflight()` (Kernel `modules/intake`), `totalsProblems` dùng chung với cửa nạp, 20 trang bài học, SC-INTAKE-1, test cặp 11 mã <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — 2.17 có --> | năng lực `intake.findings` available | mới |
| 2.18 | **Bể chờ `intake_inbox`** ([PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) W2): cửa nạp từ chối thì lưu nguyên văn + phát hiện + điểm, `meta.intake`; gộp gửi trùng; tự đóng khi nguồn gửi lại đạt; hạn giữ 90 / 7 ngày; không ghi vào `accounting_events` — **có** 2026-11-02 (W2): migration 0059, `error.intake` (thay `meta.intake`: lỗi không có `meta`), `GET/POST /api/v1/intake*`, subscriber hạn giữ, 10 ca test <!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — 2.18 có --> | năng lực `intake.inbox` available | mới |
| 2.19 | **Màn Trạm kiểm tra đầu vào** ([PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) W3): thẻ Cần sửa tại ACC14, lỗi theo lớp có Vì sao / Sửa ở nguồn / Bài học, sửa tại bể có dấu lệch nguồn, Kiểm thử, so lần, nộp lại, chấp nhận cảnh báo có lý do | năng lực `intake.station` available | mới |
| 2.20 | **Bảng điểm đầu vào** ([PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) W4): mọi kế toán xem (công cụ đào tạo), tỷ lệ đạt lần đầu, theo nguồn / người lập / loại / mã; `DG-INTAKE-1`; sự kiện `bizcity.intake.rejected` / `.resolved` | năng lực `intake.score` available | mới |
| 2.21 | **Tiền kiểm L5** ([PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) W5): định khoản thử trong giao dịch huỷ cho chứng từ chưa nhận, gợi ý cấu hình từ lỗi lặp (kế toán trưởng duyệt), action đọc `core.intake.*` cho AI | năng lực `intake.preflight.posting` available | mới |

**Rủi ro:** RLS và chuỗi băm bằng chứng tốn hiệu năng. Đo trên dữ liệu thật (30.000 chứng từ / ngày) trước khi bật cho bảng Kernel; bảng module bật ngay vì mới và nhỏ.

## Phase 3 — Module SDK, manifest, permission, event

**Đầu ra: Accounting dưới dạng module** = `modules/ke-toan` chỉ import `@bizcity/module-sdk` + `@bizcity/ui-kit`; tắt nó đi Kernel vẫn nhận và ghi sổ chứng từ từ POS.

| # | Việc | Xong khi | Từ lộ trình cũ |
|---|---|---|---|
| 3.1 | `@bizcity/module-sdk`: `defineModule`, `ctx` (data, documents, ledger, events, settings, actions, evidence, notify) — **v0.1 có** 2026-11-02: gói `packages/module-sdk` (xuất lại chọn lọc + `defineModule`, `docRef`), `ctx.ledger.submit`, `ctx.settings.get`; còn `ledger.cancel / get`, `ctx.data.tx` theo `mod_<key>`, nạp qua registry (3.13) <!-- [2026-11-02 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.1 v0.1 --> — **v0.2** 2026-11-02: `ctx.ledger.cancel / get`, `ctx.data.module` (3.10), quyền module (3.3), nạp theo registry (3.13); còn chủ chốt §6 API.md rồi bỏ "bản nháp" <!-- [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.1 v0.2 --> | API.md ổn định | 2.4 |
| 3.2 | Manifest `bizcity.module.json` cho 9 phân hệ + 3 add-in; `ApiModule`/`WebModule`/`AddInManifest` sinh từ manifest; A-17 ghi `waivers` có hạn — **có** 2026-11-01: 12 manifest, SC-MOD-3 block (key, kind, owners ↔ CODEOWNERS), SC-CON-2 nhận waiver có hạn, API nạp + khớp mã lúc khởi động, `GET /system/modules?detail=true`; sinh `ApiModule`/`WebModule` từ manifest dời sang 3.13 <!-- [2026-11-01 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.2 có --> | CONF-MAN đạt (có waiver) | 2.4 |
| 3.3 | Registry quyền mở: Kernel + module đăng ký; màn Phân quyền nhóm theo module — **có (API)** 2026-11-02: registry từ `permissions[]`, vai trò theo `roles`, risk high không cho AI, quyền lạ → dừng khởi động, `GET /system/permissions`; màn Phân quyền ở PR-6 <!-- [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3 có (API) --> | `permissions.module` available | mới |
| 3.4 | `packages/events`: outbox, dispatcher, `event_consumptions`, retry, dead-letter, replay, đồng hồ; Kernel phát `bizcity.ledger.*`; thay `catalog-notify.ts` — **có** 2026-10-30 ([PHASE-006](../phases/PHASE-006-OUTBOX-SU-KIEN/README.md)): `apps/api/src/core/events.ts` (gói `packages/events` tách cùng 2.3) | CONF-RUN-10 đạt | 3.5 |
| 3.5 | Workflow khai báo (`documents.workflow`); chuyển `payment_requests`, `purchase_documents` sang — **có** 2026-10-31 ([PHASE-012](../phases/PHASE-012-GOI-DINH-KHOAN-WORKFLOW/README.md) S012-1): `apps/api/src/core/workflow.ts` + `payment-request.workflow.yaml`, `purchase-document.workflow.yaml` | 2 luồng chạy bằng YAML | mới |
| 3.6 | Settings registry chạy thật (`settings.get`) — **có** 2026-11-02: `ctx.settings.get` (`packages/platform/src/core/settings.ts`), chỉ khoá module sở hữu, phạm vi đơn vị <!-- [2026-11-02 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.6 có --> | khoá trong `tenants.settings` đều có trong registry | 2.3 |
| 3.7 | `ledger.query`: API đọc sổ cho báo cáo — **có** 2026-10-31 ([PHASE-012](../phases/PHASE-012-GOI-DINH-KHOAN-WORKFLOW/README.md) S012-2): khung nhìn chỉ đọc `bizcity_read.*` (migration 0043), `ledgerQuery` / `ctx.ledger.query`, SC-KERNEL-7 chặn đọc thẳng `ledger_*`. Thư mục báo cáo **đã chuyển** 2026-10-31 `modules/reports` → `phan-he/ke-toan/reports` (đích Phase 3: `modules/ke-toan/reports`), gỡ 8/10 cạnh import chéo: `documentChecks` về Kernel, Thuế / add-in gọi action `accounting.report.*` (`callAction`, `ctx.actions.call`), báo cáo hàng hoá tách về `ban-hang` / `kho`, lắp ở `phan-he/loi.ts` (`GOODS`) | báo cáo không còn SQL trên `ledger_*` ngoài Kernel | mới |
| 3.8 | `@bizcity/ui-kit` từ `apps/web/src/components` + `layout` + `lib`; slot `partner.detail.tab`, `dashboard.widget`… | `apps/web/src/phan-he/*` chỉ import ui-kit | mới |
| 3.9 | Chuyển `phan-he/*` → `modules/*` (kể cả `phan-he/ke-toan/reports` → `modules/ke-toan/reports`); gỡ nốt `excel-export → reportService`, B01 → `assetService.prepaidSplit`; sửa hết A-17 (bỏ waiver) | `kiem-chuan.sh` không còn danh sách nợ | — |
| 3.10 | Role CSDL theo module (`mod_<key>_rw`) — **có** 2026-11-02 (PR-4): `module migrate` bằng `mod_<key>_owner`, kiểm RLS sau migration, `ctx.data.module` bằng `mod_<key>_rw`, `schema_migrations.module` (0053); test `module-db.test.ts` chứng minh bảng Kernel bị PostgreSQL từ chối — chờ chủ đánh dấu tín hiệu tay <!-- [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.10 có --> | module không `INSERT` được bảng Kernel ở tầng CSDL | 3.4 |
| 3.11 | **Gói định khoản**: bảng `config_packs`, xem trước + cài + gỡ (STD-TPL-5..9), tách `db/seeds` thành `bizcity.vn-tt99.nen` + gói thương mại; màn Gói định khoản | cài gói lên đơn vị trống → mọi `docType` hiện có ghi sổ được | mới |
| 3.12 | `posting.reason.suggest` tất định (từ khoá, ví dụ, lịch sử đơn vị) + manifest `ledger.submits[].reasons` | gợi ý đúng ≥ 80% trên tình huống mẫu của gói | mới |
| 3.13 | **Registry module + vòng đời** ([ADR-0011](../adr/ADR-0011-plugin-ba-muc-tin-cay.md) D1, D2): `module_registry` (phiên bản, hash bản build, trạng thái) × `tenant_modules` (bật theo đơn vị); `bizcity module install / activate / deactivate / upgrade`; chỉ nạp module `active` đúng hash; tắt = `MODULE_DISABLED`, sổ không đổi — **có** 2026-11-02 (PR-3): migration `0052`, job cài đặt đồng bộ registry, lệnh `module list / sync / activate / deactivate / verify`, nạp theo hash (bản thật), cổng `MODULE_DISABLED` theo đơn vị, sự kiện `skipped`, action `core.module.enable / disable`, DG-MOD-1; module local (`modules/<key>`) cài theo PR-5 <!-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 có --> | năng lực `modules.lifecycle` available | mới |
| 3.14 | **App ngoài tiến trình** ([ADR-0011](../adr/ADR-0011-plugin-ba-muc-tin-cay.md) mức 2): khoá API có phạm vi theo manifest app, webhook sự kiện outbox ký HMAC (thử lại theo `event_deliveries`), iframe ở menu / slot với vé ngắn hạn qua `postMessage`; ghi sổ qua `core.document.submit` — **có** 2026-11-02 (PR-2b): manifest `kind: "app"`, migration `0051` (`app_installations`, `api_keys.app_key`), khoá app có phạm vi + docKey `<app>:` ở mọi cửa nạp, subscriber `<app>.webhook` ký HMAC, vé iframe + `postMessage` đóng, màn TI13; còn CSP `frame-src` theo app và slot iframe (3.8) <!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 có --> | năng lực `apps.external` available | mới |
| 3.15 | **`manual_journal`** ([ADR-0015](../adr/ADR-0015-chot-sdk-v1-moi-thu-qua-be-su-kien.md) Q1): phiếu kế toán module lập, dòng theo `reasonCode` bắt buộc, không số tài khoản, qua bể sự kiện → luật định khoản; chỉ `ke-toan` tự chọn tài khoản. K2: đặc tả định khoản kế toán trưởng ký trước <!-- [2026-11-02 05:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — thêm 3.15–3.18 (ADR-0015) --> — ⛔ đặc tả định khoản [50-DAC-TA-MANUAL-JOURNAL](../phases/PHASE-011-MODULE-SDK/50-DAC-TA-MANUAL-JOURNAL.md) chờ kế toán trưởng ký <!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15 chờ ký đặc tả --> | năng lực `ledger.manual-journal` available | mới |
| 3.16 | **`ctx.ledger.allocateDebt`** (ADR-0015 Q2): đối trừ cùng đối tượng, cùng tài khoản qua cổng Kernel; khác tài khoản = chứng từ qua `submit` — **có** 2026-11-02: Kernel `allocateByDocKeysIn`, `ctx.ledger.allocateDebt`, test <!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.16 có --> | năng lực `ledger.allocate-debt` available | mới |
| 3.17 | **`seed[]` trong manifest** (ADR-0015 Q4): dữ liệu mẫu qua `core.*.upsert` — **có** 2026-11-02: `core.partner.upsert`, `core.product.upsert`, `seed[]` + `POST /system/modules/:key/seed`, test <!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.17 có --> | năng lực `module.seed` available | mới |
| 3.18 | **`@bizcity/module-sdk/web`** (ADR-0015 Q5): `defineWebModule` — **có** 2026-11-02: `@bizcity/module-sdk/web` (`defineWebModule`, `WEB_SLOTS`), SDK 1.0.0, test <!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.18 có --> | năng lực `ui.web-module` available | mới |

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
| 4.7 | Preset cài nhanh theo ngành ([`bizcity_preset@1`](../contracts/BIZCITY-PRESET-v1.md)): `presets/<id>/`, `scripts/cai-preset.mjs` (Phase 4: `bizcity init --preset`) | ≥ 3 preset (thương mại, dịch vụ, sản xuất) — **có** `thuong-mai-ban-le` | mới |

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
| 5.9 | Adapter tuỳ chọn khi chạy nhiều máy ([ADR-0007](../adr/ADR-0007-goi-chia-se-va-ha-tang.md)): `adapters/oidc` (Keycloak…), `adapters/nats` (chuyển tiếp outbox), `adapters/redis` (rate-limit, cache, pub-sub), `adapters/meilisearch`; mỗi cái có mặc định không cần dịch vụ ngoài (LAYOUT-8) | 2 máy API chạy song song đúng rate-limit, thông báo | 3.5 |

## Thứ tự không được đảo

1. **2.1 trước 2.3.** Tách Kernel khi còn 4 nơi tự ghi sổ là mang nợ sang gói mới.
2. **2.5 + 2.6 trước 3.1.** SDK là mặt tiền của Action và Evidence; làm SDK trước thì phải làm lại.
3. **3.4 (event) trước 4.2 (template).** Template không có sự kiện thì ca chuẩn không làm được nhắc thanh toán.
4. **4.5 trước 5.1.** Nếu Claude chưa tạo được module Hợp đồng thì người ngoài chưa nên viết CRM.
