# Hợp đồng framework (`bizcity_*@N`)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->

Hợp đồng = thoả thuận có phiên bản giữa lõi và bên dùng (phân hệ, add-in, plugin). Mỗi hợp đồng có một tệp `.md` (người đọc) và, khi có khuôn dữ liệu, một tệp `.schema.json` (máy kiểm).

## Danh mục

### Standard v1: hợp đồng module phải tuân ([../standard/README.md](../standard/README.md))

| # | Mã | Tệp | Trạng thái |
|---|---|---|---|
| 1 | `bizcity_module@1` | [BIZCITY-MODULE-v1.md](BIZCITY-MODULE-v1.md) · [schema](BIZCITY-MODULE-v1.schema.json) | Đề xuất |
| 2 | `bizcity_data@1` | [BIZCITY-DATA-v1.md](BIZCITY-DATA-v1.md) | Đề xuất |
| 3 | `bizcity_document@1` | [BIZCITY-DOCUMENT-v1.md](BIZCITY-DOCUMENT-v1.md) | Đề xuất (gồm luồng duyệt, thay `bizcity_workflow@1`) |
| 4 | `bizcity_action@1` | [BIZCITY-ACTION-v1.md](BIZCITY-ACTION-v1.md) | Đề xuất |
| 5 | `bizcity_event@1` | [BIZCITY-EVENT-v1.md](BIZCITY-EVENT-v1.md) | Đề xuất — **sự kiện miền** |
| 6 | `bizcity_evidence@1` | [BIZCITY-EVIDENCE-v1.md](BIZCITY-EVIDENCE-v1.md) | Đề xuất |
| 7 | `bizcity_extension@1` | [BIZCITY-EXTENSION-v1.md](BIZCITY-EXTENSION-v1.md) | Đề xuất |

### Kernel và tích hợp ngoài

| Mã | Tệp | Bên dùng | Trạng thái | Nguồn sự thật trong code |
|---|---|---|---|---|
| `bizcity_ledger_intake@1` (trước 2026-10-29: `bizcity_event@1`) | [BIZCITY-LEDGER-INTAKE-v1.md](BIZCITY-LEDGER-INTAKE-v1.md) · [schema](BIZCITY-LEDGER-INTAKE-v1.schema.json) | plugin, phân hệ (qua `ctx.ledger.submit`) | Ổn định | `packages/contracts/src/documents.ts` |
| `bizcity_intake_findings@1` <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1 --> | [BIZCITY-INTAKE-FINDINGS-v1.md](BIZCITY-INTAKE-FINDINGS-v1.md) | Trạm tiền kiểm, giao diện, bên gửi chứng từ (đọc phát hiện) | Đề xuất 0.1 | `packages/contracts/src/intake-findings.ts` |
| `bizcity_api@1` | [BIZCITY-API-v1.md](BIZCITY-API-v1.md) | mọi bên gọi HTTP | Ổn định | `packages/contracts/src/api.ts`, `core/http.ts`, `core/errors.ts` |
| `bizcity_posting_rule@1` | [BIZCITY-POSTING-RULE-v1.md](BIZCITY-POSTING-RULE-v1.md) | người viết luật (lõi) | Ổn định | `modules/posting/*`, `modules/ledger/ledger.types.ts` |
| `bizcity_master_data@1` | [BIZCITY-MASTER-DATA-v1.md](BIZCITY-MASTER-DATA-v1.md) | plugin | Ổn định | `modules/{branches,partners,products,tax-codes,posting-config}` |
| `bizcity_connector@1` | [BIZCITY-CONNECTOR-v1.md](BIZCITY-CONNECTOR-v1.md) | plugin cho lõi kéo | Ổn định | `modules/connections`, `packages/contracts/src/connections.ts` |
| `bizcity_settings@1` | [BIZCITY-SETTINGS-MATRIX-v1.md](BIZCITY-SETTINGS-MATRIX-v1.md) · [registry](bizcity-settings.registry.json) | lõi, phân hệ | Đề xuất | `core/posting-modes.ts`, `core/date-rules.ts` |
| `bizcity_posting_template@1` | [BIZCITY-POSTING-TEMPLATE-v1.md](BIZCITY-POSTING-TEMPLATE-v1.md) · [schema](BIZCITY-POSTING-TEMPLATE-v1.schema.json) | gói định khoản theo ngành (marketplace), trợ lý AI chọn lý do | Đề xuất | `posting_reasons` + `db/seeds/ly-do.jsonl`, `modules/posting/account-resolver.ts` |
| `bizcity_mcp@1` | [BIZCITY-MCP-v1.md](BIZCITY-MCP-v1.md) | Bizcity Cell, chatbot (Claude, ChatGPT), agent | Đề xuất — hồ sơ của `bizcity-mcp-tool@1.0.0` + `bizcity-mcp-bridge@1.0.0` (plugin `bizcity-twin-ai`) | `modules/system/mcp.routes.ts` (`POST /mcp`, PHASES 2.11–2.12); Cell bridge: Phase 5 |
| `bizcity_remedy@1` <!-- [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — thêm hợp đồng phương án khắc phục. --> | [BIZCITY-REMEDY-v1.md](BIZCITY-REMEDY-v1.md) | kiểm của Core, phân hệ, giao diện (dải cảnh báo, Bàn đánh giá) | Đề xuất — phương án khắc phục có cấu trúc cho mọi kiểm warn / error | `packages/contracts/src/remedy.ts`; SC-FIX-1 |
| `bizcity_item_master@1` <!-- [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a --> | [BIZCITY-ITEM-MASTER-v1.md](BIZCITY-ITEM-MASTER-v1.md) | Kernel, kế toán, dev plugin | Đề xuất — định danh mặt hàng bất biến (item_id ULID), mã có phiên bản, phân loại theo ngày, Item Resolver; chạy song song với products (B2a) | `packages/contracts/src/item-master.ts`; `db/migrations/0065_mat_hang_dinh_danh.sql`; `packages/kernel/src/modules/masterdata/item-resolver.ts`; `apps/api/test/item-master.test.ts` |
| `bizcity_lineage@1` <!-- [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1 --> | [BIZCITY-LINEAGE-v1.md](BIZCITY-LINEAGE-v1.md) | kế toán, dev, màn Hành trình mặt hàng | Đề xuất — truy vết vòng đời mặt hàng (sự kiện kho kế toán / vận hành, bút toán mang mã, giá vốn tháng, "Vì sao giá vốn này?"), chỉ đọc | `packages/contracts/src/lineage.ts`; `packages/kernel/src/modules/lineage/`; `apps/api/test/lineage.test.ts` |
| `bizcity_findings@1` <!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — thư viện phát hiện hai cổng (ADR-0019) --> | [BIZCITY-FINDINGS-v1.md](BIZCITY-FINDINGS-v1.md) | người dùng, dev, trợ lý AI (MCP) | Đề xuất — một khuôn cho mã Gate A (danh mục) và Gate B (trạm tiền kiểm); tra qua API / MCP / trang | `packages/contracts/src/findings.ts`; SC-FIND-1 |
| `bizcity_library@1` <!-- [2026-11-07 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — thư viện dùng chung (ADR-0032) --> | [BIZCITY-LIBRARY-v1.md](BIZCITY-LIBRARY-v1.md) · [schema](BIZCITY-LIBRARY-v1.schema.json) | dev dựng ERP, người nhập liệu (ô chọn), trợ lý AI (MCP) | Đề xuất — phong bì chung cho thư viện tham chiếu: phiên bản, gợi ý, mã `LIB-*`, ô chọn | SC-LIB-1 (đề xuất, S030-45) |
| `bizcity_domain@1` | [BIZCITY-DOMAIN-v1.md](BIZCITY-DOMAIN-v1.md) | mọi module, kênh, AI chạm tiền | Chấp nhận — Domain Contract (lớp 1/4, [CONG-BO-KIEN-TRUC](../CONG-BO-KIEN-TRUC.md)) | trigger CSDL, `modules/{documents,posting,ledger}` |
| `bizcity_compliance@1` | [BIZCITY-COMPLIANCE-v1.md](BIZCITY-COMPLIANCE-v1.md) · [ma trận máy đọc](../standard/compliance-matrix.json) | kế toán trưởng, kiểm toán, người duyệt PR | Chấp nhận — Compliance Contract (lớp kiểm soát 3/3) | bảng điểm `SCOREBOARD.md` mục Ma trận tuân thủ; SC-CMP-1 |
| `bizcity_errors@1` | [BIZCITY-ERRORS-v1.md](BIZCITY-ERRORS-v1.md) | mọi bên gọi HTTP / MCP, giao diện | Chấp nhận | `packages/contracts/src/errors.ts` (ERROR_CATALOG), `core/errors.ts`, `core/http.ts` |
| `bizcity_authorization@1` <!-- [2026-11-06 00:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — chữ chốt bộ tính quyền --> | [BIZCITY-AUTHORIZATION-v1.md](BIZCITY-AUTHORIZATION-v1.md) | mọi module, API, giao diện, Role Editor | Nháp — mô hình Cho / Nới / Cấm, phạm vi, điều kiện, mã lý do ([ADR-0027](../adr/ADR-0027-core-authorization-plugin-role-editor.md)) | `packages/platform/src/core/authz/` (đề xuất — vào main cùng PR code W3 đợt 1) |
| `bizcity_preset@1` | [BIZCITY-PRESET-v1.md](BIZCITY-PRESET-v1.md) · [schema](BIZCITY-PRESET-v1.schema.json) | người cài, lập trình viên module (dữ liệu thử) | Chấp nhận | `presets/<id>/`, `scripts/cai-preset.mjs` |

## Quy tắc phiên bản

Quy tắc đầy đủ (Standard, năng lực, Kernel, module): [../standard/VERSIONING.md](../standard/VERSIONING.md). Tóm tắt cho từng hợp đồng:

| Thay đổi | Ví dụ | Làm gì |
|---|---|---|
| **Tương thích** (minor) | thêm trường tuỳ chọn, thêm `docType` mới, thêm mã lỗi, thêm endpoint | tăng `1.x` trong tệp, ghi CHANGELOG cuối tệp; mã hợp đồng giữ `@1` |
| **Phá vỡ** (major) | bỏ / đổi tên trường, đổi kiểu, đổi nghĩa, trường tuỳ chọn thành bắt buộc, đổi thứ tự tra tài khoản | tệp mới `*-v2.md`, mã `@2`; lõi nhận **cả** `@1` và `@2` tối thiểu 2 bản phát hành; ADR |
| Sửa câu chữ | — | không tăng |

Bên nhận phải **bỏ qua trường lạ** (zod `z.object` mặc định loại trường thừa) để thêm trường không làm gãy ai.

## Kiểm hợp đồng

Mọi kiểm hợp đồng ở **một chỗ**: [tests/conformance/](../../tests/conformance/README.md) (ADR-0006). Cụ thể:
- SC-CON-1 kiểm tệp `.schema.json` ở đây;
- SC-CON-2 kiểm manifest;
- SC-CON-3 kiểm JSON mẫu theo `bizcity_ledger_intake@1`;
- SC-CON-4 kiểm bảng năng lực ↔ README ↔ CANON;
- SC-CON-6 kiểm mã lỗi.

- `api-examples.test.ts` (phần chạy thật) gửi mọi JSON mẫu trong `docs/api/vi-du/` và đòi `posted`.
- Giai đoạn 2: `bizcity contract check` sinh JSON Schema từ zod và so với `*.schema.json` trong thư mục này; lệch → CI đỏ. Tới lúc đó, **tệp `.schema.json` viết tay và zod là nguồn thắng** khi hai bên lệch.
