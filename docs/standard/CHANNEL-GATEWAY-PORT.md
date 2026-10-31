# Port `core/channel-gateway` vào Core kế toán
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->

> **Quyết định:** dùng lại nguyên các **hợp đồng và luồng** của `bizcity-twin-ai/core/channel-gateway` (PHP, WordPress) để Core kế toán dùng khoá Cell cho trợ lý AI. Viết lại bằng TypeScript trong `adapters/cell` và `adapters/channel-gateway`. **Không** viết chuẩn mới.
> **Đọc kèm:** [CELL-CONNECT.md](CELL-CONNECT.md), [../contracts/BIZCITY-MCP-v1.md](../contracts/BIZCITY-MCP-v1.md).

## 1. "Port nguyên" nghĩa là gì

`channel-gateway` của plugin gồm hai phần khác nhau:

| Phần | Ví dụ | Port vào Core? |
|---|---|---|
| **Xương sống kết nối Cell**: khoá 1API, bốn bước, gọi Hub, lượt chat web → Cell, cầu MCP uỷ quyền, đo dùng, giao diện adapter kênh | `connect/`, `class-twin-web-turn.php`, `class-twin-web-bridge-rest.php`, `interface-channel-adapter.php`, `class-webhook-router.php`, `usage/` | **Có — nguyên hợp đồng, nguyên dạng dữ liệu trên dây** |
| **Nghiệp vụ CRM / marketing**: hộp thư CRM, chiến dịch, gửi hàng loạt, Bot Studio, flows, ZNS, CF7 | `bot/`, `panel/`, các phase 0.3x, 0.4x, 0.6x | **Không** — thuộc Zalo Brain / CRM. Core kế toán chỉ phát sự kiện để các phần đó dùng |

"Nguyên" là giữ **đúng**:
- tên trường, header và mã lỗi;
- `twin-agent-turn@1.x`, `channel-inbound@1` / `channel-outbound@1`;
- `bizcity-mcp-tool@1.0.0`, `bizcity-mcp-bridge@1.0.0`;
- trạng thái bốn bước.

Nhờ vậy Hub và Cell **không phải viết nhánh riêng** cho Core kế toán (trừ đề xuất H-1, H-2 ở §5). Không chép mã PHP: Core là Fastify, TypeScript; phần Cell (zalo-hub) vốn đã là TypeScript nên mẫu Hono middleware và zod schema dùng lại gần như nguyên.

## 2. Bảng ánh xạ

| Plugin (PHP) | Core kế toán (TS) | Hợp đồng giữ nguyên |
|---|---|---|
| `core/bizcity-llm/includes/class-llm-client.php` (khoá `biz-`, header, gói từ khoá) | `adapters/cell/hub-client.ts` | header `X-Site-URL`, `X-BizCity-Client-Site`, `X-BizCity-Caller`; `/account/entitlement` |
| `class-llm-connect-flow.php` (PKCE một chạm) | `adapters/cell/connect-flow.ts` + route `/api/v1/cell/connect/*` | luồng `connect` → `proof` → `connect/token` |
| `connect/class-connect-rest.php`, `frontend/.../FourStepSetup.jsx` | `adapters/cell/setup.routes.ts` + màn `apps/web/.../he-thong/tro-ly-ai` (React, tái dùng bố cục bốn bước) | năm trạng thái bước; "Đạt" chỉ do máy chủ |
| `GET zalo-connection/status` (`bizcity-zalo-connection/1.0`, lớp L0–L10) | `GET /api/v1/cell/status` | khuôn trạng thái theo lớp |
| `class-twin-web-turn.php` (web chat → Hub → Cell, chuyển SSE nguyên byte) | `adapters/cell/web-turn.ts`: `POST /api/v1/cell/turn` (SSE) | phong bì `twin-agent-turn@1.x`; khung SSE `final_started`, `twin_event`, `final_token`, `tool_done`, `final_done`, `error`, `end`, `media`; lời gọi lại `turn-complete` |
| `class-twin-web-bridge-rest.php`, `class-zalo-mcp-bridge-rest.php` (Hub → site MCP) | `adapters/cell/mcp-bridge.ts`: `POST /api/v1/cell/mcp` → gọi `platform/mcp` | `bizcity-mcp-bridge@1.0.0`: `X-BizCity-Principal`, `X-BizCity-Turn-Id`, `X-BizCity-Timeout-Ms`, thời hạn 3 / 5 / 8 s |
| `BizCity_Zalo_Agent_Principals` (user_hash ↔ người dùng) | bảng `cell_principals` (Core) | principal 64 hex; không tin user id trong yêu cầu |
| `interface-channel-adapter.php` (`verify_webhook`, `normalize_inbound`, `send_outbound`…) + `class-webhook-router.php` (một cửa `/biz/hook/{platform}/`) | `adapters/channel-gateway/` (Phase 6, chỉ khi Core tự nhận kênh) | giao diện adapter; khoá định danh `tenant · platform · channel_ref · platform_uid`; cấm khoá `tenant`/`role`/`principal` trong thân |
| `usage/` (bản sao sổ token, tài khoản dùng) | `adapters/cell/usage.ts`: chỉ **đọc** số đã tính phí từ Hub | — |

## 3. Kênh: Core có cần tự nhận tin Zalo không?

**Không, ở Phase 5.** Đường đúng: Zalo → Zalo Hub / Cell → Cell nhận ra người dùng đã liên kết với Core kế toán → gọi công cụ `accounting.*` qua Hub → Core.

Core chỉ cần ba thứ:
1. cầu MCP;
2. web chat của chính nó (`/api/v1/cell/turn`);
3. sự kiện ra Cell để nhắc việc (CELL-MCP §6).

`adapters/channel-gateway` (adapter kênh, webhook một cửa) chỉ làm khi có yêu cầu Core chạy **độc lập với WordPress** mà vẫn có kênh riêng, ví dụ khách không dùng plugin WP. Giao diện adapter đã chốt sẵn ở bảng trên, để lúc đó port thẳng.

## 4. Ranh giới (giữ P1, CELL-1..7)

- `adapters/cell` và `adapters/channel-gateway` **không** được import từ `packages/*` hay `modules/*` (LAYOUT-1, CELL-1). Tắt adapter (không có khoá) thì Core chạy đủ.
- Adapter chỉ gọi Core qua `platform/mcp` và action công khai. Không đọc bảng, không gọi `ledgerService`.
- Khoá 1API, callback token, `CELL_SECRET` **không** bao giờ vào log, bằng chứng, phản hồi API.
- Bộ kiểm: SC-MOD-1 / CONF-STATIC-4 áp cho `adapters/*`. Thêm job CI "no-cell" (CELL-2) khi adapter có mã.

## 5. Đề xuất thay đổi phía Hub / Cell

Gửi nhóm plugin; Core không tự sửa repo đó.

| Mã | Đề xuất | Vì sao |
|---|---|---|
| **H-1** | Luồng một chạm nhận `proof_path` hoặc loại site `open-ketoan` | Core không có `/wp-json/...` (tạm có bí danh, CELL-CONNECT §4) |
| **H-2** | Hub lưu `callback_base` theo khoá thay cho đường WP cố định (`/wp-json/bizcity-channel/v1/zalo-bridge/mcp`) | Hub → Core gọi `/api/v1/cell/mcp` |
| **H-3** | Thêm mode `accounting`, `accounting_entry`, `accounting_admin` vào `BIZCITY-MCP-STANDARD-v1.json` | [bizcity_mcp@1 §4](../contracts/BIZCITY-MCP-v1.md) |
| **H-4** | Trả lời Q-CELL-1: nhiều khoá (nhiều đơn vị) trên một domain | Core đa đơn vị |
| **H-5** | Guru mẫu "Trợ lý kế toán" (persona CELL-CONNECT §3) trong thư viện Guru của Cell | bước ④ tự tạo |
| **H-6** | Cell / Hub phục vụ endpoint đọc hoá đơn đúng khuôn `INVOICE_AI_URL` của Core: `POST { fileName, mime, dataBase64, hint }` → `{ invoices }`, Bearer = khoá 1API | Mua hàng của Core đã có cổng này (`phan-he/mua-hang/hoa-don.ts`). Bản Pro chỉ cần trỏ `INVOICE_AI_URL` về Hub, không viết thêm code Core |

## 6. Thứ tự làm

| Bước | Việc | Xong khi |
|---|---|---|
| 1 | `hub-client` + lưu khoá mã hoá + bước ① (dán khoá) | màn hiện gói đọc từ Hub |
| 2 | Kết nối một chạm (bí danh proof) | không cần chép khoá |
| 3 | `platform/mcp` đọc (Phase 2b) + `/api/v1/cell/mcp` + `cell_principals` | Cell gọi được `accounting.report.trial_balance` |
| 4 | `/api/v1/cell/turn` web chat SSE trong Core | hỏi sổ ngay trong màn Core |
| 5 | Bước ③ ④ hoàn chỉnh; công cụ đề xuất ghi (cần `defineAction` Phase 2.3) | lập phiếu chi nháp qua Zalo có xác nhận |
| 6 | Sự kiện ra Cell (Phase 3 outbox) | nhắc hạn, báo phiếu lỗi qua Zalo |
