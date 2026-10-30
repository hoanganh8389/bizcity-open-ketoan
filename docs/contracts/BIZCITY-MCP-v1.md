# `bizcity_mcp@1` — Chuẩn công cụ MCP của Core kế toán (cho Cell, trợ lý AI, chatbot)

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** Kernel + Platform (bề mặt AI của Core)
> **Là hồ sơ (profile) của chuẩn MCP chung hệ sinh thái Bizcity**, không phải chuẩn riêng. Hai hợp đồng gốc nằm ở plugin `bizcity-twin-ai/docs/contracts/`:
> - `bizcity-mcp-tool@1.0.0`: descriptor, kết quả, xác nhận trước khi ghi, idempotency;
> - `bizcity-mcp-bridge@1.0.0`: uỷ quyền Cell → Hub → site;
> - cùng danh mục máy đọc `BIZCITY-MCP-STANDARD-v1.json` (mode, scope).
>
> Core kế toán là **một "site"** trong chuỗi đó: Cell gọi công cụ kế toán **y như** gọi `crm.customer.lookup` của site WordPress.
> **Liên quan:** [BIZCITY-ACTION-v1.md §6](BIZCITY-ACTION-v1.md) (`expose`), [BIZCITY-POSTING-TEMPLATE-v1.md](BIZCITY-POSTING-TEMPLATE-v1.md) (gợi ý lý do), [../standard/CELL-MCP.md](../standard/CELL-MCP.md) (CELL-1..7), [../standard/CELL-CONNECT.md](../standard/CELL-CONNECT.md) (khoá 1API, bốn bước, Pro), [../standard/CHANNEL-GATEWAY-PORT.md](../standard/CHANNEL-GATEWAY-PORT.md)

## 1. Mục đích

Bizcity Core là phần mềm kế toán **sinh ra để AI dùng**. Mọi việc người dùng làm trên màn hình (xem sổ, lập phiếu, đọc báo cáo), trợ lý AI cũng làm được qua MCP, **với cùng quyền, cùng luật, cùng bằng chứng**.

| Bên gọi | Đường | Danh tính |
|---|---|---|
| **Bizcity Cell** (trợ lý trên Zalo, web chat) | Cell → Hub (`bizcity.vn`) → Core `POST /api/v1/cell/mcp` | uỷ quyền: `X-BizCity-Principal` (bridge §2) |
| Claude, ChatGPT, agent khác | thẳng `POST /mcp` của Core | OAuth 2.1 hoặc khoá MCP `mcp_…` có scope |
| Plugin WP (Zalo Brain) | qua Cell | — |

Core **không** gọi LLM khi trả lời MCP. Core chỉ: công bố công cụ, kiểm quyền, chạy, ghi bằng chứng. Hiểu câu nói, chọn công cụ, hội thoại là việc của Cell.

### 1.1 Đã có (PHASES 2.11, 2.12 — 2026-10-30)

| Phần | Trạng thái |
|---|---|
| `POST /mcp`: `initialize`, `ping`, `tools/list`, `tools/call`; thông báo (không `id`) → 202 | **có**: `apps/api/src/modules/system/mcp.routes.ts`; nginx chuyển `/mcp` sang API |
| Công cụ sinh từ registry action (§3), lọc theo quyền người gọi, annotations / `confirm` suy từ `expose.ai` | **có** |
| Công cụ đọc §5.1 | **một phần**: `ketoan.report.trial_balance`, `ketoan.cash.balances`, `ketoan.debts.partner_balances` (`modules/reports/report.actions.ts`); thêm `quy.payment_request.list` / `.get`, `core.evidence.get` |
| Xác nhận trước khi ghi (STD-MCP-4), một lần (STD-MCP-5), bằng chứng actor `ai` (STD-MCP-9) | **có**: bảng `mcp_confirm_tokens` (0037); mẫu `quy.payment_request.create` / `.update` |
| Kết quả ghi đã xác nhận | `data = { status: "done", result: <output của action>, as_of }`, `meta = { receipt, replayed }`. `data.status` chỉ nói về luồng xác nhận (`needs_confirmation` → `done`), không lẫn với trạng thái chứng từ |
| Danh tính | phiên đăng nhập hoặc khoá API hiện có; kênh ghi vào bằng chứng lấy từ `params._meta.client` (`via = mcp:<client>`) |
| **Chưa có** | đường Cell `/api/v1/cell/mcp` + `X-BizCity-Principal` (cần kết nối bốn bước); khoá `mcp_…` riêng + OAuth; mode / scope §4; resources, prompts §5.3; công cụ đề xuất ghi §5.2 (`ketoan.documents.draft`…); `llm_alias` khai tay; trường `pii` |

## 2. Giao thức (theo hai hợp đồng gốc)

| Mục | Quy định | Gốc |
|---|---|---|
| Thân | JSON-RPC 2.0, một đối tượng (không batch); `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/*`; không giữ phiên | bridge §1 |
| Endpoint | `POST /mcp` (client trực tiếp) · `POST /api/v1/cell/mcp?account_id=` (Hub chuyển từ Cell, Bearer = callback token của Core khi kết nối bốn bước) | bridge §1 |
| Header uỷ quyền | `X-BizCity-Principal` (user_hash 64 hex, bắt buộc với đường Cell) · `X-BizCity-Turn-Id` · `X-BizCity-Timeout-Ms` (1000–8000) | bridge §1 |
| Thời hạn | `tools/list` 3 s (Cell đệm 60 s) · đọc 5 s · ghi 8 s; quá hạn ghi → Cell thử lại cùng `idempotency_key` | bridge §3 |
| Kết quả | `structuredContent` = phong bì `{ success, complete, message, data, meta }`; `data.as_of` (UTC ISO) **luôn có** khi thành công; `content[]` = tóm tắt tiếng Việt | tool §3 |
| Lỗi | `{ success: false, code, message, hint, help_code, error: { code, retryable, details } }` | tool §3 |

**Ánh xạ từ khuôn `bizcity_api@1` của Core:** `ok` → `success`; `data` giữ nguyên, thêm `as_of`; `meta` giữ nguyên, thêm `receipt` (biên nhận bằng chứng); mã lỗi Core giữ nguyên làm `code` (`PERIOD_LOCKED`, `POSTING_FAILED`, `FORBIDDEN`…). `hint` là câu tiếng Việt nói người dùng làm gì tiếp, ví dụ "Kỳ 10/2026 đã khoá — nhờ kế toán trưởng mở kỳ hoặc chọn ngày khác".

## 3. Công cụ sinh từ action

```text
defineAction({ id: 'ketoan.report.trial_balance', input, output, permission: 'reports:read',
               expose: { mcp: true, ai: 'read', mode: 'accounting' } })
        │  platform/mcp đọc registry action
        ▼
{ "name": "ketoan.report.trial_balance",
  "title": "Bảng cân đối số phát sinh",
  "description": "Số dư đầu kỳ, phát sinh, số dư cuối kỳ từng tài khoản trong một kỳ. Dùng khi chủ hỏi tình hình tài khoản / tổng quan sổ. Quyền: reports:read.",
  "inputSchema": { …từ zod… }, "outputSchema": { …từ zod, có data.as_of… },
  "annotations": { "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false },
  "_meta": { "bizcity": { "contract": "bizcity-mcp-tool@1.0.0", "profile": "bizcity_mcp@1",
                          "mode": "accounting", "scopes": ["ledger.read", "report.read"],
                          "confirm": "never", "llm_alias": "kt_trial_balance", "since": "1.0" } } }
```

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **STD-MCP-1** | Tên công cụ = id action đổi `-` thành `_` (vd `hop-dong.installment.record-payment` → `hop_dong.installment.record_payment`), dạng chấm `<module>.<thực thể>.<động từ>`, chỉ `[a-z0-9_.]` (tool §1, D-MCP-1). Không đặt tên tay. `llm_alias` ≤ 64 ký tự `[a-z0-9_]`, tiền tố `kt_` cho công cụ của Core kế toán | CONF-MCP-1 |
| **STD-MCP-2** | Mỗi công cụ có `title`, `description` **tiếng Việt có dấu** viết cho LLM: làm gì, khi nào dùng, quyền gì; mô tả từng trường input (zod `.describe`); `outputSchema` có `data.as_of` | CONF-MCP-2 |
| **STD-MCP-3** | `annotations` và `_meta.bizcity.confirm` suy từ `expose.ai`, không khai tay: `read` → `readOnlyHint`, `confirm: never`; `propose` → `confirm: always`, `destructiveHint: false`; huỷ / đảo → `confirm: always`, `destructiveHint: true` | CONF-MCP-3 |
| **STD-MCP-4** | **Xác nhận trước khi ghi** đúng tool §4. Gọi không có `confirm_token` → không ghi gì, trả `data { status: "needs_confirmation", preview, confirm_token, expires_at }`. `preview` là **bút toán xem trước** (dry-run luật định khoản thật rồi huỷ). Token dùng một lần, 900 s, gắn công cụ + client + người dùng + `args_hash`. Đổi tham số → `MCP_CONFIRM_ARGS_CHANGED`; token sai / hết hạn → `MCP_CONFIRM_INVALID` | CONF-MCP-4 |
| **STD-MCP-5** | Ghi chạy tối đa một lần theo `params._meta.idempotency_key` (tool §5): lặp lại trả kết quả cũ `meta.replayed: true`; đang chạy → `MCP_WRITE_IN_PROGRESS`. Core giữ khoá trong `action_requests` (bền hơn 900 s của site WP) | CONF-RUN-4 |
| **STD-MCP-6** | Ghi qua MCP chỉ tạo chứng từ nhóm `draft` / `pending` (CELL-5). **Không** công cụ nào: duyệt chứng từ, khoá / mở kỳ, đổi cấu hình hạch toán, cài gói định khoản thật, xoá. Không có "standing authorisation" cho công cụ chạm sổ | CONF-MCP-5 |
| **STD-MCP-7** | Ai được ghi (tool §7): chỉ người dùng Core có quyền tương ứng và đã liên kết principal (chủ, kế toán). Khách hàng cuối không có công cụ kế toán nào. Quyền thực tế = scope của khoá / mode ∩ quyền người dùng ∩ `expose.ai`; quyền `risk: high` không đi qua AI | CONF-RUN-14 |
| **STD-MCP-8** | Danh sách có trần (mặc định 50, tối đa 500) + `meta.total`; số tiền là `number` đồng; trường `pii` che theo cấu hình đơn vị; báo cáo lớn trả tóm tắt + `resource` để đọc tiếp | CONF-MCP-6 |
| **STD-MCP-9** | Mỗi lời gọi ghi một bản ghi bằng chứng `actor = { kind: 'ai', via: 'mcp:<client>', onBehalfOf: 'user:<id>', turnId }`; công cụ đọc dữ liệu nhạy cảm (sổ, công nợ, lương) cũng ghi | CONF-RUN-11 |
| **STD-MCP-10** | Đổi phá vỡ input / output = công cụ mới; tên cũ thành `deprecated_alias` giữ ≥ 1 bản phát hành (tool §2) | CONF-UPG-1 |

## 4. Mode và scope của Core kế toán

Đề xuất **thêm** vào `BIZCITY-MCP-STANDARD-v1.json` của hệ sinh thái. Plugin giữ tệp đó; Core gửi đề xuất, không tự sửa.

| Mode | Scope | Ai bật | Công cụ |
|---|---|---|---|
| `accounting` | `ledger.read`, `report.read`, `masterdata.read`, `posting.read` | chủ, kế toán, người có `reports:read` | §5.1 |
| `accounting_entry` | `accounting.propose` | người có `documents:write` | §5.2 |
| `accounting_admin` | `templates.preview` | người có `settings:write` | `ketoan.templates.install_preview` (chỉ xem trước) |

## 5. Danh mục công cụ chuẩn của Core kế toán

Đây là phần làm Bizcity Core khác các phần mềm kế toán khác: **một bộ công cụ ổn định, có phiên bản** cho ghi sổ và báo cáo. Module cộng đồng thêm công cụ của mình theo cùng luật (tên bắt đầu bằng key module).

### 5.1 Đọc — `confirm: never`

| Công cụ | `llm_alias` | Làm gì | Bọc route hiện có |
|---|---|---|---|
| `ketoan.report.trial_balance` | `kt_trial_balance` | Cân đối số phát sinh | `/reports/trial-balance` |
| `ketoan.report.balance_sheet` · `.income_statement` · `.cash_flow` | `kt_balance_sheet`… | Báo cáo tài chính | `/reports/*` |
| `ketoan.ledger.account_detail` | `kt_account_detail` | Sổ chi tiết tài khoản, lọc đối tượng | `/ledger/*` |
| `ketoan.debts.list` · `ketoan.debts.partner` | `kt_debts` | Công nợ phải thu / phải trả, tuổi nợ | `/debt-items`, `/reports/*` |
| `ketoan.inventory.stock` | `kt_stock` | Tồn kho theo kho, mặt hàng | `/reports/*` |
| `ketoan.cash.balances` | `kt_cash` | Số dư tiền mặt, ngân hàng | `/reports/cash-balances` |
| `ketoan.documents.search` · `ketoan.documents.get` | `kt_documents` | Tìm chứng từ; xem chứng từ + bút toán + nhật ký định khoản | `/documents`, `/posting-log` |
| `ketoan.masterdata.partner_find` · `.product_find` | `kt_find_partner`… | Tra đối tượng / mặt hàng theo mã, tên, SĐT, MST | danh mục |
| `ketoan.posting.reasons` | `kt_reasons` | Lý do đang dùng, kèm gợi ý AI của gói | `/posting/reasons` |
| `ketoan.posting.reason_suggest` | `kt_reason_suggest` | Xếp hạng lý do cho câu mô tả nghiệp vụ ([POSTING-TEMPLATE §6](BIZCITY-POSTING-TEMPLATE-v1.md)) | mới |
| `ketoan.posting.explain` | `kt_explain_entry` | Giải thích một bút toán: lý do, tài khoản lấy từ đâu theo thứ tự AccountResolver | mới, đọc `posting_log` |

### 5.2 Đề xuất ghi — `confirm: always`, gói Pro

| Công cụ | Tạo ra | Sau xác nhận |
|---|---|---|
| `ketoan.documents.draft` | sự việc `bizcity_ledger_intake@1` (bán, mua, thu, chi…) | `pending` dù đơn vị đặt chế độ tự động |
| `ketoan.vouchers.receipt_draft` · `.payment_draft` | phiếu thu / chi theo lý do | nháp chờ duyệt |
| `ketoan.invoices.to_draft` | hoá đơn đầu vào (Cell OCR ảnh, hoặc XML hoá đơn điện tử) → sự việc mua hàng nháp | nháp |

### 5.3 Resource và prompt

| Loại | Ví dụ |
|---|---|
| Resource | `bizcity://ketoan/reports/trial-balance?period=2026-10`, `bizcity://ketoan/documents/{docKey}`, `bizcity://ketoan/posting/reasons`, `bizcity://ketoan/templates/installed` |
| Prompt | `ketoan.doc_bao_cao_cho_chu`, `ketoan.giai_thich_but_toan`, `ketoan.kiem_tra_cuoi_thang`, `ketoan.lap_phieu_tu_mo_ta` |

## 6. Một lượt ghi sổ qua Cell

```jsonc
// 1. Cell → tools/call ketoan.vouchers.payment_draft (không có confirm_token)
{ "reasonCode": "CDV01", "amount": 3200000, "methodCode": "CK", "description": "Tiền điện T10 CH Cầu Giấy" }
// ← structuredContent
{ "success": true, "complete": false, "message": "Cần xác nhận",
  "data": { "status": "needs_confirmation", "as_of": "2026-10-29T03:00:00Z",
            "preview": { "lines": [ { "debit": "64173", "credit": "11211", "amount": 3200000 } ], "reason": "CDV01 Chi tiền điện, nước, internet cửa hàng" },
            "confirm_token": "…", "expires_at": "2026-10-29T03:15:00Z" } }

// 2. Cell đọc lại xem trước cho chủ; chủ "Đồng ý" → gọi lại cùng tham số + confirm_token, _meta.idempotency_key = "zalo:msg:88231"
// ← { "success": true, "complete": true, "data": { "status": "done", "voucher": { "no": "PC26-000412", "status": "pending" },
//      "open_url": "https://ketoan.example.vn/app/quy/PC26-000412", "as_of": "…" }, "meta": { "receipt": { "evidenceId": "…", "hash": "sha256:…" } } }
```

## 7. Kiểm chuẩn

| Mã | Kiểm | Luật |
|---|---|---|
| CONF-MCP-1 | Tên = id action dạng chấm; `llm_alias` hợp lệ, không trùng | STD-MCP-1 |
| CONF-MCP-2 | Mọi công cụ và mọi trường input có mô tả tiếng Việt có dấu; `outputSchema` có `data.as_of` | STD-MCP-2 |
| CONF-MCP-3 | `annotations`, `confirm` khớp `expose.ai` | STD-MCP-3 |
| CONF-MCP-4 | Gọi ghi không token → `needs_confirmation`, không bảng nào đổi; đổi tham số → `MCP_CONFIRM_ARGS_CHANGED`; token dùng lại → `MCP_CONFIRM_INVALID` | STD-MCP-4 |
| CONF-MCP-5 | Không công cụ nào trỏ action có quyền `risk: high` hoặc thuộc danh sách cấm của STD-MCP-6 | STD-MCP-6 |
| CONF-MCP-6 | Danh sách có trần; `pii` bị che khi đơn vị bật | STD-MCP-8 |

Phần tĩnh (tên, mô tả, annotations) vào lane selfcheck khi có registry action (Phase 2). Phần chạy vào lane `runtime` (Phase 4). Dùng lại fixtures của plugin (`zalo-hub/contracts/fixtures/mcp/confirm.flow.json`, `write.idempotency.json`) làm ca kiểm tương thích chéo.

## 8. Không phụ thuộc Cell

MCP server là một phần của Core (`platform/mcp`), **không** nằm trong `adapters/cell`. Vì vậy Claude / ChatGPT / agent tự viết dùng được khi không có Cell (P1). `adapters/cell` chỉ thêm: đường uỷ quyền `/api/v1/cell/mcp`, liên kết principal, kết nối bốn bước, đo dùng ([CELL-CONNECT.md](../standard/CELL-CONNECT.md)).

## 9. Lộ trình

| Phase | Việc |
|---|---|
| 2b | `platform/mcp`: `POST /mcp`, công cụ đọc §5.1 bọc route hiện có, khoá `mcp_…` có scope, phong bì + `as_of` |
| 2 (sau 2.3) | Sinh công cụ từ registry action; `needs_confirmation` + `confirm_token`; `action_requests` |
| 5 | `adapters/cell`: `/api/v1/cell/mcp` + principal; OCR; đề xuất mode `accounting*` vào `BIZCITY-MCP-STANDARD-v1.json`; OAuth 2.1 |

## 10. Nhật ký thay đổi

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0.0-draft | 2026-10-29 | Khởi tạo, làm hồ sơ của `bizcity-mcp-tool@1.0.0` + `bizcity-mcp-bridge@1.0.0`; danh mục công cụ kế toán; mode `accounting*` |
