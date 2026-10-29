# Nối Bizcity Cell: một khoá 1API, bốn bước, bản Pro

> **Cho ai:** nhóm Lõi làm `adapters/cell`; người cài Core muốn bật trợ lý AI.
> **Tuân:** P1 (Core chạy đủ khi không có Cell), CELL-1..7 ([CELL-MCP.md](CELL-MCP.md)), [bizcity_mcp@1](../contracts/BIZCITY-MCP-v1.md).
> **Nguồn sự thật phía hệ sinh thái** (plugin `bizcity-twin-ai`, Hub `bizcity-llm-router`):
> - luật `R-SETUP-4` (`docs/rules/PHASE-0-RULE-FOUR-STEP-SETUP-AXIS.md`);
> - `core/bizcity-llm/includes/class-llm-client.php`, `class-llm-connect-flow.php`;
> - phase 0.83 (bốn bước), 0.107 (tính phí), 0.138, 0.139 (gói).
>
> Tài liệu này **không đặt lại** các luật đó, chỉ nói Core kế toán áp chúng thế nào.

## 1. Ba tầng, một chiều

```text
Core kế toán (repo này, "site")  ──Bearer biz-…──►  Hub bizcity.vn (bizcity-llm-router)  ──CELL_SECRET──►  Cell (zalo-hub, TS)  ──►  nhà cung cấp LLM
        ▲                                             kiểm khoá, gói, ví, domain;                     chạy agent, LLM, OCR,
        └──────── MCP uỷ quyền (bizcity-mcp-bridge@1) ◄── chuyển tiếp nguyên byte ◄──────────────────  đo token (sổ token chỉ thêm)
```

- **Core không gọi thẳng nhà cung cấp LLM, không giữ khoá OpenAI / OpenRouter.** Mọi lời gọi AI đi Hub → Cell (luật R-ONE-VERTICAL-CELL của hệ sinh thái: không có "chế độ gọi thẳng").
- **Core không chạy agent.** Cell chạy vòng agent và gọi ngược công cụ của Core qua MCP. Core chỉ là nguồn dữ liệu và người quyết hợp lệ.
- **Một khoá cho mọi thứ:** khoá 1API `biz-<32 hex>` của Hub. Gói (Free / Pro / Premium), ví trả theo dùng, domain đều gắn với khoá; Core không tự quyết gói.

## 2. Khoá 1API trong Core

| Mục | Quy định |
|---|---|
| Dạng | `biz-<32 hex>`; Core kiểm bằng `^biz[-_][a-z0-9]{16,80}$` (không phân biệt hoa thường, lưu chữ thường), giống `class-llm-client.php` |
| Phạm vi | **Một khoá cho một đơn vị (tenant)**. Bản cài một doanh nghiệp có thể đặt `BIZCITY_API_KEY` trong `.env` làm khoá mặc định |
| Lưu | Mã hoá ở CSDL (`config_secrets`, khoá mã hoá `BIZCITY_SECRET_KEY` trong env); màn chỉ hiện `biz-••••last4`; không ghi log, không vào `audit_logs` (R-TEN-8). Khoá cấu hình `bizcity.cell.api_key` đăng ký registry, loại B, quyền `settings:write` |
| Hub | `BIZCITY_HUB_URL`, mặc định `https://bizcity.vn` |
| Header Core gửi Hub | `Authorization: Bearer <khoá>`, `X-Site-URL`, `X-BizCity-Client-Site` (host công khai của Core), `X-BizCity-Caller: open-ketoan/<phiên bản>` |
| Gói | Đọc `GET {hub}/wp-json/bizcity/v1/account/entitlement` (và `/master/config`), đệm ≤ 300 s ở Core. Gói chỉ suy từ khoá (`master_level`), không từ cấu hình Core |
| Domain | Hub giữ chính sách một khoá ↔ một domain (TXT `bizcity-verify=<token>`). Core chỉ hiển thị trạng thái Hub trả, không tự kiểm |

**Câu hỏi mở Q-CELL-1** (cần Hub chốt): một bản cài Core phục vụ **nhiều đơn vị** trên **cùng một domain**, mỗi đơn vị một khoá và một ví. Chính sách "một khoá một domain" của Hub có cho nhiều khoá cùng một domain không? Nếu không, phương án dự phòng là một khoá cho cả bản cài, Core tự chia hạn mức theo đơn vị; khi đó ví là chung.

## 3. Bốn bước (áp `R-SETUP-4` cho Core)

Mỗi bước có năm trạng thái: **Khoá** · **Đang kiểm tra** · **Đạt** · **Chưa đạt** · **Không có quyền**. **"Đạt" chỉ do máy chủ kiểm**, giao diện không tự đặt. Bước sau khoá cho tới khi bước trước Đạt. Màn: *Hệ thống → Trợ lý AI* (quyền `settings:write`).

| Bước | Người dùng làm | Core kiểm (phía máy chủ) | Đạt khi |
|---|---|---|---|
| **① Kết nối tài khoản BizCity** | Bấm "Kết nối một chạm" (PKCE, §4) **hoặc** dán khoá từ `bizcity.vn/my-account/api-keys/` → "Lưu & kiểm tra" | `GET {hub}/wp-json/bizcity/v1/llm/models` bằng khoá; đọc `/account/entitlement` | 200 + đọc được gói. 401 / 403 → Chưa đạt `api_key_rejected` |
| **② Kiểm đường Cell ↔ Core** | Không làm gì (tự chạy) | Core có địa chỉ **https công khai**; Hub gọi được `GET {core}/api/v1/cell/ping` bằng callback token; Core gọi được Hub | Hai chiều thông. `localhost` / mạng nội bộ → Chưa đạt, kèm hướng dẫn (§6) |
| **③ Liên kết người dùng ↔ kênh** | Chủ, kế toán quét QR Zalo (số Zalo Hub do Cell cấp) hoặc mở web chat trong Core; chọn người dùng Core tương ứng | Tạo liên kết `principal (user_hash) ↔ users.id` + vai trò Core; kiểm người đó còn hoạt động, có quyền | Có ít nhất một chủ được liên kết |
| **④ Chọn trợ lý kế toán** | Giữ "Trợ lý kế toán" mặc định (tự tạo nếu chưa có) hoặc chọn Agent Guru khác | Guru có mode `accounting` (`bizcity_mcp@1` §4); `tools/list` qua Cell trả công cụ `ketoan.*` | Cell gọi thử `ketoan.report.trial_balance` qua cầu MCP thành công |

**Trạng thái kết nối** trả ở `GET /api/v1/cell/status`, khuôn giống `bizcity-zalo-connection/1.0` của plugin: từng bước và từng lớp kiểm, lỗi gần nhất, thời điểm kiểm. Kiểm lại tự động mỗi 15 phút và khi bấm "Kiểm tra lại".

### Trợ lý kế toán mặc định (persona tối thiểu)

- Đọc lại **bút toán xem trước** và hỏi "Xác nhận lập phiếu?" trước mọi lần ghi (STD-MCP-4).
- Không bao giờ nói "đã ghi sổ" khi phiếu mới ở trạng thái nháp / chờ duyệt. Nói "đã lập phiếu chờ duyệt".
- Gợi ý lý do điểm thấp → hỏi lại theo `ai.askIf` của gói định khoản, không đoán ([POSTING-TEMPLATE §6](../contracts/BIZCITY-POSTING-TEMPLATE-v1.md)).
- Số liệu báo cáo lấy từ công cụ, ghi rõ kỳ và `as_of`. Không tự tính lại từ trí nhớ hội thoại (CELL-7).

## 4. Kết nối một chạm (PKCE)

Theo `class-llm-connect-flow.php` (site) và `class-router-connect-flow.php` (Hub):

```text
1. Core tạo state + code_verifier, mở trình duyệt:
   {hub}/wp-json/bizcity/v1/connect?site=<core>&return=<core>/app/he-thong/tro-ly-ai&state=…&code_challenge=…(S256)
2. Người dùng đăng nhập bizcity.vn, chọn / tạo khoá cho domain này
3. Hub chứng minh Core giữ domain: GET https://<core>/<đường proof>?state=…   → Core trả lại state đã lưu
4. Trình duyệt về `return` kèm code → Core đổi phía máy chủ:
   POST {hub}/wp-json/bizcity/v1/connect/token { code, code_verifier, site } → { api_key, key_id, domain, plan }
5. Core lưu khoá (mã hoá) → bước ① Đạt
```

**Đề xuất cho Hub (H-1):** Hub đang gọi đường proof cố định của WordPress (`/wp-json/bizcity-connect/v1/proof`). Core cần Hub chấp nhận tham số `proof_path` (hoặc loại site `open-ketoan`) để gọi `/api/v1/cell/connect/proof`. Trước khi Hub đổi, Core phục vụ thêm đúng đường `/wp-json/bizcity-connect/v1/proof` làm bí danh. Bí danh này chỉ có phần proof.

## 5. Bản Pro là gì

**Core không bị khoá tính năng kế toán.** "Pro" là trạng thái: **Core + khoá 1API gói ≥ Pro + bốn bước Đạt**. Lúc đó trợ lý AI của Cell làm việc trên sổ của đơn vị.

| Tính năng | Free (mã nguồn mở, không khoá) | Pro (khoá gói Pro / Premium, bốn bước Đạt) |
|---|---|---|
| Kế toán đầy đủ: sổ, chứng từ, báo cáo, khoá kỳ, gói định khoản | có | có |
| MCP server + công cụ đọc, dùng với chatbot **của bạn** (khoá `mcp_…`) | có | có |
| Công cụ đề xuất ghi qua chatbot của bạn | có | có |
| Trợ lý kế toán của Cell trên **Zalo, web chat** | — | có |
| Gợi ý lý do bằng LLM, lập phiếu từ câu nói tự do | — (chỉ xếp hạng từ khoá của Core) | có |
| Đọc hoá đơn ảnh / PDF (OCR) → phiếu mua nháp | dịch vụ tự dựng qua `INVOICE_AI_URL` (đã có ở Mua hàng) | có — `INVOICE_AI_URL` trỏ về Hub (đề xuất H-6) |
| Đọc báo cáo bằng lời cho chủ, nhắc việc cuối tháng qua Zalo | — | có |
| Tính phí | — | theo gói của Hub + ví trả theo dùng (token có phụ phí, hiển thị bằng ₫) |

Bảng ánh xạ gói → năng lực Core (`ai.cell`, `ai.ocr`, `mcp.cell-bridge`…) lấy từ `capabilities_json` của gói trên Hub. Core **không** cứng giá hay tên gói trong code.

## 6. Khi không có Cell, hoặc Cell lỗi (P1)

| Tình huống | Core làm |
|---|---|
| Không khoá / gói Free | Màn "Trợ lý AI" hiện bước ① chưa làm; mọi màn kế toán chạy bình thường |
| Cài ở `localhost` / mạng nội bộ | Bước ② Chưa đạt: Hub không gọi ngược được. Hướng dẫn: đưa Core ra https công khai, hoặc dùng chatbot riêng qua `POST /mcp` |
| Hub / Cell lỗi, hết ví | Trợ lý báo không dùng được; **không** chặn, **không** làm chậm thao tác kế toán (CELL-3). Phiếu nháp đã lập vẫn còn, chờ người duyệt |
| Khoá bị thu hồi | Gói về Free ở lần đồng bộ sau; liên kết người dùng giữ nguyên để nối lại |

## 7. Đo dùng và tính phí

- **Cell giữ sổ token** chỉ thêm, có chuỗi băm. **Hub tính tiền**: phụ phí, ví theo khoá. **Core không tính tiền**, không giữ ví.
- Màn *Trợ lý AI → Sử dụng* đọc số liệu đã tính phí từ Hub (`/account/cost-summary`, `/account/usage-by-day`), hiển thị ₫. Mỗi lượt Cell gọi công cụ Core có `turnId`, nên đối chiếu được với bằng chứng của Core.

## 8. Lộ trình

| Phase | Việc |
|---|---|
| 2b | `platform/mcp` đọc (đã có trong [bizcity_mcp@1](../contracts/BIZCITY-MCP-v1.md) §9); khoá `mcp_…` cho chatbot riêng |
| 5a | `adapters/cell`: lưu khoá 1API, bước ① + kết nối một chạm (bí danh proof), đồng bộ gói, màn Trợ lý AI |
| 5b | Bước ② ③ ④: `/api/v1/cell/ping`, `/api/v1/cell/mcp` (cầu uỷ quyền), liên kết principal, Guru kế toán; web chat trong Core qua `twin-agent-turn` ([CHANNEL-GATEWAY-PORT.md](CHANNEL-GATEWAY-PORT.md)) |
| 5c | OCR hoá đơn, nhắc việc qua Zalo (sự kiện → Cell), màn Sử dụng |
