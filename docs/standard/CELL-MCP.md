# Core ↔ Bizcity Cell: MCP, channel gateway, chạy độc lập

> Thực thi nguyên tắc **P1: Core không phụ thuộc Cell.** Cell bổ sung AI, LLM, OCR, RAG, điều phối; Core vẫn đủ chức năng khi không có Cell.
> Hợp đồng liên quan: [Action §6](../contracts/BIZCITY-ACTION-v1.md#6-phơi-ra-cho-ai-mcp), [Evidence](../contracts/BIZCITY-EVIDENCE-v1.md), [Event](../contracts/BIZCITY-EVENT-v1.md). Năng lực: `mcp.tools`, `ai.cell` (Phase 5).
> **Chi tiết đã chốt (2026-10-29), thắng khi lệch với §3–§5 dưới:**
> - khuôn công cụ, xác nhận ghi, cầu uỷ quyền: [bizcity_mcp@1](../contracts/BIZCITY-MCP-v1.md), là hồ sơ của `bizcity-mcp-tool@1.0.0` + `bizcity-mcp-bridge@1.0.0` của hệ sinh thái;
> - khoá: khoá 1API `biz-…` qua Hub, bốn bước, bản Pro: [CELL-CONNECT.md](CELL-CONNECT.md);
> - port gateway: [CHANNEL-GATEWAY-PORT.md](CHANNEL-GATEWAY-PORT.md).
>
> Các luật CELL-1..7 ở đây giữ nguyên.

## 1. Ai làm gì

| | Bizcity Core (repo này) | Bizcity Cell (server-owned) | Zalo Brain (plugin WP) |
|---|---|---|---|
| Vai trò | Nguồn sự thật: chứng từ, sổ, danh mục, quyền, bằng chứng | Trợ lý điều phối: hiểu ý người dùng, gọi công cụ, LLM / OCR / RAG | Kênh: nhận / gửi tin Zalo, skill |
| Giữ dữ liệu kế toán | **Có** | Không (chỉ ngữ cảnh hội thoại, chỉ mục RAG đã được phép) | Không |
| Quyết định hợp lệ | **Có** (quyền, luật, khoá kỳ) | Không | Không |
| Chạy khi mất mạng | **Có** | — | — |

## 2. Chạy độc lập

| Luật | Kiểm bằng |
|---|---|
| **CELL-1 (Tier 0).** Không gói nào trong `packages/*` import `adapters/cell` hay SDK của Cell | LAYOUT-1, CONF-STATIC-4 |
| **CELL-2 (Tier 0).** Không có `BIZCITY_CELL_URL` → `adapters/cell` không nạp; năng lực `ai.cell`, `mcp.tools` vắng mặt; mọi tính năng còn lại chạy | CI job "no-cell" chạy toàn bộ test |
| **CELL-3 (Tier 1).** Cell lỗi / chậm không làm chậm hay hỏng action của Core: gọi Cell chỉ từ subscriber (bất đồng bộ) hoặc từ màn có chờ, có hạn giờ | CONF-RUN-16 |
| **CELL-4 (Tier 1).** Dữ liệu gửi sang Cell chỉ là kết quả của action đọc mà người dùng / khoá đó có quyền; trường `pii` che theo cấu hình đơn vị | test adapter |

Hiện tại: add-in `spreadsheet-ai` (nhúng ứng dụng ngoài theo `SPREADSHEET_AI_URL`) và `tro-ly` (tra cứu, không dùng AI) đã theo đúng tinh thần này: tắt đi Core vẫn chạy. Phase 5 gom về `adapters/cell`.

## 3. Xác thực: khoá theo domain

```
Cell (zalo-hub) ──Authorization: Bearer <khoá Cell của domain>──► Core /mcp
```

- Mỗi cài đặt Core (domain) đăng ký với Cell và nhận **khoá Cell**. Trong Core, khoá này là một bản ghi `api_keys` loại `cell`, có phạm vi (`scopes`) và người dùng chủ (`on_behalf_of`).
- Cell gửi kèm danh tính người dùng cuối đã xác minh ở kênh (vd Zalo user đã liên kết với `users.id` trong Core). Core tra liên kết; không có liên kết thì chỉ được công cụ `read` công khai của đơn vị (nếu bật).
- Mọi lời gọi qua Cell có `actor = { kind: 'ai', via: 'cell:<domain>', onBehalfOf: 'user:<id>' }` → bằng chứng ghi đủ (STD-EVD-6).
- Quyền thực tế = **giao** của (phạm vi khoá Cell) ∩ (quyền của người dùng liên kết) ∩ (`expose.ai` của action). Quyền `risk: high` không bao giờ đi qua actor AI.

## 4. MCP server của Core

`adapters/cell` dựng MCP server từ **registry action**, không viết tay công cụ:

| MCP | Lấy từ | Ví dụ |
|---|---|---|
| **Tool** | action có `expose.mcp: true`; `inputSchema` = JSON Schema sinh từ zod `input`; mô tả = `title` | `hop-dong.installment.list-due`, `core.partner.get`, `ke-toan.report.trial-balance` |
| **Resource** | báo cáo đọc theo URI | `bizcity://ledger/trial-balance?period=2026-10`, `bizcity://debts/customer/KH001` |
| **Prompt** | mẫu do module khai (tuỳ chọn) | "Tóm tắt công nợ khách hàng cho chủ" |

Kết quả công cụ luôn là `{ ok, data, meta.receipt }` như HTTP. Lỗi trả `error.code` chuẩn để Cell diễn giải cho người dùng.

Dry-run là công cụ quan trọng cho AI: Cell gọi `…?dryRun` để **xem trước bút toán** (cùng cơ chế `tro-ly /simulate` hiện có: chạy luật thật trong giao dịch rồi huỷ) và đọc lại cho chủ trước khi lập phiếu.

## 5. Channel gateway: hỏi sổ sách, lập phiếu qua Zalo

```
Chủ (Zalo): "Tháng này khách nào còn nợ trên 50 triệu?"
  └► Zalo Brain ─► Cell (hiểu ý) ─► MCP tool ke-toan.debts.list {minBalance: 50000000, period: "2026-10"}
                                       └► Core: quyền (đọc công nợ) ✓ → dữ liệu → bằng chứng (read sensitive)
  ◄── Cell định dạng câu trả lời + đường dẫn mở màn trong Core

Chủ (Zalo): "Lập phiếu thu 15 triệu của anh Nam, chuyển khoản, cho kỳ 3 hợp đồng HD-2026-0007"
  └► Cell ─► tool hop-dong.installment.record-payment (expose.ai = propose, dryRun trước)
         ◄── bút toán xem trước: Nợ 1121 / Có 1311 — 15.000.000
  ◄── Cell hỏi lại: "Xác nhận lập phiếu?"  ─► Chủ: "Đồng ý"
  └► Cell gọi lại với Idempotency-Key = mã tin nhắn → Core tạo phiếu ở trạng thái nháp/chờ duyệt
         ◄── biên nhận (evidenceId, hash) → Cell gửi kèm cho chủ
```

| Luật | |
|---|---|
| **CELL-5 (Tier 0).** Action chạm sổ gọi từ AI **chỉ** tạo trạng thái nhóm `draft`/`pending`. Hiệu lực cần một người có quyền duyệt, trên giao diện Core hoặc bằng xác nhận rõ ràng ở kênh có ghi bằng chứng `onBehalfOf` | CONF-RUN-14 |
| **CELL-6 (Tier 1).** Mọi lời gọi ghi từ Cell có `Idempotency-Key` gắn với mã tin nhắn / lượt hội thoại: tin nhắn bị gửi lại không sinh hai phiếu | CONF-RUN-4 |
| **CELL-7 (Tier 1).** Cell không lưu bản sao sổ cái; muốn RAG trên số liệu thì gọi công cụ đọc lúc cần, hoặc chỉ mục những gì đơn vị bật | hợp đồng dịch vụ Cell |

## 6. Sự kiện ra Cell

Cell đăng ký nhận sự kiện qua subscriber webhook của `adapters/cell` (cùng bảo đảm Event §5, ký HMAC): ví dụ `hop-dong.installment.due` → Cell nhắn người phụ trách qua Zalo; `bizcity.ledger.event.failed` → Cell báo kế toán phiếu định khoản lỗi. Core không biết Zalo tồn tại; nó chỉ phát sự kiện.

## 7. Chuyển dần

| Phase | Việc |
|---|---|
| 2 | Action registry có `expose`; JSON Schema sinh từ zod |
| 3 | Sự kiện miền + webhook subscriber |
| 5 | `adapters/cell`: MCP server (tool / resource), khoá `cell`, liên kết người dùng kênh, `core.notify.send` qua Cell; chuyển `tro-ly`, `spreadsheet-ai` vào adapter; CI job "no-cell" |
