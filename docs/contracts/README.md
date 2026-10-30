# Hợp đồng framework (`bizcity_*@N`)

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
| `bizcity_api@1` | [BIZCITY-API-v1.md](BIZCITY-API-v1.md) | mọi bên gọi HTTP | Ổn định | `packages/contracts/src/api.ts`, `core/http.ts`, `core/errors.ts` |
| `bizcity_posting_rule@1` | [BIZCITY-POSTING-RULE-v1.md](BIZCITY-POSTING-RULE-v1.md) | người viết luật (lõi) | Ổn định | `modules/posting/*`, `modules/ledger/ledger.types.ts` |
| `bizcity_master_data@1` | [BIZCITY-MASTER-DATA-v1.md](BIZCITY-MASTER-DATA-v1.md) | plugin | Ổn định | `modules/{branches,partners,products,tax-codes,posting-config}` |
| `bizcity_connector@1` | [BIZCITY-CONNECTOR-v1.md](BIZCITY-CONNECTOR-v1.md) | plugin cho lõi kéo | Ổn định | `modules/connections`, `packages/contracts/src/connections.ts` |
| `bizcity_settings@1` | [BIZCITY-SETTINGS-MATRIX-v1.md](BIZCITY-SETTINGS-MATRIX-v1.md) · [registry](bizcity-settings.registry.json) | lõi, phân hệ | Đề xuất | `core/posting-modes.ts`, `core/date-rules.ts` |
| `bizcity_posting_template@1` | [BIZCITY-POSTING-TEMPLATE-v1.md](BIZCITY-POSTING-TEMPLATE-v1.md) · [schema](BIZCITY-POSTING-TEMPLATE-v1.schema.json) | gói định khoản theo ngành (marketplace), trợ lý AI chọn lý do | Đề xuất | `posting_reasons` + `db/seeds/ly-do.jsonl`, `modules/posting/account-resolver.ts` |
| `bizcity_mcp@1` | [BIZCITY-MCP-v1.md](BIZCITY-MCP-v1.md) | Bizcity Cell, chatbot (Claude, ChatGPT), agent | Đề xuất — hồ sơ của `bizcity-mcp-tool@1.0.0` + `bizcity-mcp-bridge@1.0.0` (plugin `bizcity-twin-ai`) | `modules/system/mcp.routes.ts` (`POST /mcp`, PHASES 2.11–2.12); Cell bridge: Phase 5 |
| `bizcity_domain@1` | [BIZCITY-DOMAIN-v1.md](BIZCITY-DOMAIN-v1.md) | mọi module, kênh, AI chạm tiền | Chấp nhận — Domain Contract (lớp 1/4, [CONG-BO-KIEN-TRUC](../CONG-BO-KIEN-TRUC.md)) | trigger CSDL, `modules/{documents,posting,ledger}` |
| `bizcity_compliance@1` | [BIZCITY-COMPLIANCE-v1.md](BIZCITY-COMPLIANCE-v1.md) · [ma trận máy đọc](../standard/compliance-matrix.json) | kế toán trưởng, kiểm toán, người duyệt PR | Chấp nhận — Compliance Contract (lớp kiểm soát 3/3) | bảng điểm `SCOREBOARD.md` mục Ma trận tuân thủ; SC-CMP-1 |
| `bizcity_errors@1` | [BIZCITY-ERRORS-v1.md](BIZCITY-ERRORS-v1.md) | mọi bên gọi HTTP / MCP, giao diện | Chấp nhận | `packages/contracts/src/errors.ts` (ERROR_CATALOG), `core/errors.ts`, `core/http.ts` |
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
