# ADR-0007 · Chuẩn hoá gói chia sẻ và hạ tầng: học từ bộ 27 gói tham chiếu, giữ sổ cái làm lõi
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->

- Trạng thái: Chấp nhận (2026-10-30 — chủ dự án chốt: không dùng Prisma, giữ Kysely + SQL migration)
- Ngày: 2026-10-30 · Người quyết: chủ dự án (Johnny Chu)
- Luật / hợp đồng liên quan: [TARGET-LAYOUT](../standard/TARGET-LAYOUT.md) (LAYOUT-1..6), [REUSE-MAP](../standard/REUSE-MAP.md), ADR-0001, ADR-0005, [BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md), [OBSERVABILITY](../ops/OBSERVABILITY.md), R-ONE-VERTICAL-CELL

## Bối cảnh

Một hệ thống tham chiếu (TPM / HRM / MRP…) chia phần dùng chung thành **27 gói** (`auth`, `events`, `metrics`, `openapi`, `search`, `audit`, `notifications`, `dashboard`, `vietnam`, `rate-limit`, `security`, `database`, `cache`, `logger`, `health`, `i18n`, `branding`, `saas`, `ai-copilot`, `feature-flags`, `errors`, `api-middleware`, `master-data`, `sdk`, `admin`, `shared`, `tpm-shared`). Hạ tầng của họ: NATS JetStream, Keycloak, Kong, Redis 7, Meilisearch, Prometheus + Grafana + Loki, Turborepo, Vitest + Playwright, GitHub Actions 7 job, 17 Dockerfile, Kubernetes + Helm. Tài liệu gồm 10 ADR, 5 sơ đồ Mermaid và các hướng dẫn.

open-ketoan khác ở ba điểm, nên không chép nguyên:

1. **Sổ cái là lõi** (ADR-0001). Mọi module (bán hàng, nhân sự, mua hàng, sản xuất, dự án) ghi tiền vào sổ qua một cửa, trong **cùng giao dịch PostgreSQL** với dữ liệu nghiệp vụ. Hạ tầng nào phá tính nguyên tử đó (ví dụ phát sự kiện ra NATS trước khi commit) đều là rủi ro sai sổ.
2. **Cài được trên một máy** cho doanh nghiệp nhỏ: `docker compose up` với PostgreSQL là đủ. Mỗi dịch vụ bắt buộc thêm (Keycloak, Redis, NATS, Kong, Meilisearch) là một thứ khách phải vận hành, sao lưu, nâng cấp.
3. **AI đi qua Cell** (R-ONE-VERTICAL-CELL): Core không gọi LLM, chỉ phơi công cụ MCP (đã có, PHASES 2.11–2.12).

## Quyết định

### 1. Nguyên tắc chọn

| # | Nguyên tắc | Hệ quả |
|---|---|---|
| G-1 | **PostgreSQL là hạ tầng bắt buộc duy nhất.** Thứ khác là *adapter tuỳ chọn*, bật bằng cấu hình | Bản cài nhỏ không cần Redis / NATS / Keycloak |
| G-2 | **Không phá giao dịch sổ.** Sự kiện, bằng chứng, idempotency ghi cùng giao dịch PostgreSQL (outbox); chuyển ra NATS / Redis là bước sau commit | `events.outbox` trước, `adapters/nats` sau |
| G-3 | **Một gói, một chủ, một việc.** Không gói "shared" / "common" / "utils" chung chung: mỗi tiện ích về đúng gói chủ (tiền → `data`, số chứng từ → `documents`, lỗi → `actions`) | Tránh gói hút mọi phụ thuộc |
| G-4 | **Hợp đồng trước, gói sau.** Mỗi gói Platform có hợp đồng `bizcity_*@N` + check trong bộ kiểm trước khi có code | Như 7 hợp đồng Standard v1 |
| G-5 | **Quan sát được là bắt buộc, công cụ quan sát là tuỳ chọn.** Code luôn sinh log có cấu trúc, `/metrics`, mã yêu cầu; Prometheus / Grafana / Loki chạy khi khách muốn | `infrastructure/monitoring/` là compose phủ thêm |

### 2. Đánh giá từng gói

**Nhận** = làm theo, gần như nguyên ý · **Chỉnh** = nhận ý, đổi cách làm cho hợp G-1..G-5 · **Đã có** = open-ketoan đã có, có khi mạnh hơn · **Để sau** = đúng nhưng chưa cần · **Không** = không hợp.

| Gói tham chiếu | Đánh giá | Ở open-ketoan | Vì sao |
|---|---|---|---|
| `auth` (Keycloak SSO + RBAC) | **Chỉnh** | `packages/permissions` (đăng nhập sẵn có, khoá API, phiên) + `adapters/oidc` tuỳ chọn (Keycloak, Google, Zalo) + `adapters/wordpress` (đã có SSO) | G-1: không bắt khách dựng Keycloak. RBAC hiện là danh sách đóng (A-23) → registry quyền mở theo module (PHASES 3) |
| `events` (NATS + 25 schema + luồng liên module) | **Chỉnh** | `packages/events`: schema có kiểu cho mỗi sự kiện (`coreEvents` trong `bizcity-standard.json`, BIZCITY-EVENT), **outbox PostgreSQL**; `adapters/nats` chuyển tiếp khi nhiều máy | G-2: sự kiện "đã ghi sổ" phải chỉ tồn tại khi sổ đã commit. Nhận ý "schema có kiểu + luồng liên module" |
| `metrics` (Prometheus) | **Nhận** | `/metrics` trong Core (Platform `observability`), tên `bizcity_*` | G-5. Không có số đo NATS / cache vì chưa có các thứ đó |
| `openapi` (3.1 + Swagger) | **Đã có** | `/api/docs` sinh từ zod; route action sinh từ `defineAction` | — |
| `search` (Meilisearch) | **Để sau** | `packages/data` tìm kiếm bằng PostgreSQL (`unaccent` + trigram); `adapters/meilisearch` khi một đơn vị > ~1 triệu chứng từ | G-1 |
| `audit` (Prisma middleware, deep diff) | **Đã có, mạnh hơn** | `audit_logs` chỉ thêm + chuỗi băm + biên nhận (PHASES 2.6). Nhận thêm ý **deep diff**: `changes` chỉ ghi trường đổi (STD-EVD-5) | Bằng chứng kế toán cần chống sửa, không chỉ "ghi lại" |
| `notifications` (WebSocket + Redis) | **Chỉnh** | năng lực `notify.inapp`: lưu ở PostgreSQL, đẩy bằng SSE / WebSocket một máy; Zalo qua Cell; `adapters/redis` pub/sub khi nhiều máy | G-1 |
| `dashboard` (KPI, biểu đồ, 3 mẫu) | **Chỉnh** | điểm mở rộng `dashboard.widget` (EXTENSION §3) + `ui-kit`; số liệu qua `ctx.ledger.query` | KPI kế toán phải đọc từ sổ qua Kernel, không mỗi dashboard tự SQL |
| `vietnam` (VAT/PIT/CIT, e-Invoice, BHXH, VietQR) | **Chỉnh, tách 4 chủ** | thuế GTGT / TNDN, sổ hoá đơn → **Kernel tax** + gói định khoản TT99; hoá đơn điện tử → `adapters/einvoice-*`; BHXH, TNCN → module `nhan-su` (docType `payroll`); VietQR → `adapters/vietqr` | G-3: "vietnam" là một túi đồ. Luật thuế đổi theo thông tư, phải có chủ và phiên bản riêng |
| `rate-limit` (Redis sliding window, token bucket) | **Chỉnh** | token bucket trong runtime action (mã `RATE_LIMITED` đã có); kho Redis là adapter khi nhiều máy | G-1 |
| `security` (header, CORS, CSRF, làm sạch đầu vào) | **Đã có phần lớn** | nginx header, `CORS_ORIGINS`, zod ở cửa, RULE-SECURITY. CSRF: API dùng `Authorization: Bearer`, không cookie phiên, nên không cần token CSRF (ghi rõ, kiểm lại nếu đổi sang cookie) | — |
| `database` (Prisma + kết nối) | **Không** (giữ Kysely + SQL migration) | `packages/data` + `adapters/postgres` | Sổ chỉ thêm, trigger cân Nợ = Có, RLS, chuỗi băm, `numeric(18,2)` cần kiểm soát SQL thật. Prisma che SQL và tự sinh migration — trái R-DB, R-LEDGER |
| `cache` (Redis) | **Để sau** | bộ nhớ đệm trong tiến trình cho cấu hình hạch toán (AccountResolver); `adapters/redis` khi nhiều máy | G-1; cache sai = định khoản sai, nên phải có quy tắc huỷ đệm theo phiên bản cấu hình |
| `logger` (Pino) | **Đã có, chuẩn hoá** | Fastify pino; trường bắt buộc theo [OBSERVABILITY §2](../ops/OBSERVABILITY.md) | — |
| `health` | **Đã có** | `/system/health` (L0), `/health/ready` (L1), `/system/diagnostics` (L3) | Mạnh hơn: có kiểm toàn vẹn sổ |
| `i18n` (Vi-En) | **Để sau, nhẹ** | tiếng Việt là ngôn ngữ chính; danh mục mã lỗi có chỗ cho `message_en`; giao diện đa ngữ khi có khách ngoại | — |
| `branding` (white-label) | **Chỉnh** | khoá cấu hình `bizcity.branding.*` trong settings registry (logo đơn vị đã có) | Không cần gói riêng |
| `saas` (đa đơn vị) | **Đã có** | `tenant_id` mọi bảng; RLS (PHASES 2.4) | — |
| `ai-copilot` (gọi thẳng Anthropic / OpenAI) | **Không** | AI qua Cell + MCP (`POST /mcp`, xác nhận trước khi ghi) | R-ONE-VERTICAL-CELL: một nơi giữ khoá LLM, chi phí, hội thoại; Core chỉ phơi công cụ có quyền + bằng chứng |
| `feature-flags` | **Chỉnh** | `ENABLED_MODULES` + settings registry + bảng năng lực (`/system/capabilities`) | Đủ cho bật / tắt module, tính năng theo đơn vị |
| `errors` | **Đã có, chuẩn hoá thêm** | danh mục mã lỗi máy đọc + luật R-ERR ([BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md)) | — |
| `api-middleware` (chuỗi middleware) | **Thay bằng runtime action** | `defineAction`: quyền → zod → idempotency → giao dịch → bằng chứng (PHASES 2.5) | Một chuỗi cố định, module không tự lắp |
| `master-data` | **Đã có hướng** | `packages/data/masterdata` (ADR-0005) | — |
| `sdk` | **Đã có hướng** | `@bizcity/module-sdk` ([API.md](../../packages/module-sdk/API.md)) | — |
| `admin` | **Chỉnh** | CLI `bizcity` (`doctor`, `evidence verify`, `module check`) — Phase 4 | — |
| `shared` | **Không** | — | G-3 |
| `tpm-shared` | **Không áp dụng** | kiểu riêng của một module nằm trong `modules/<key>/` | G-3 |

### 3. Đánh giá hạ tầng

| Tham chiếu | Đánh giá | open-ketoan |
|---|---|---|
| NATS JetStream | Chỉnh | outbox PostgreSQL; `adapters/nats` khi > 1 máy API hoặc cần đẩy sự kiện ra hệ thống khác |
| Keycloak | Chỉnh | `adapters/oidc` tuỳ chọn |
| Kong API Gateway | Không | nginx (đã có) + giới hạn tần suất trong app. Gateway riêng chỉ khi có nhiều dịch vụ, mà Core là một tiến trình |
| Redis 7 | Để sau | `adapters/redis` cho cache / rate-limit / pub-sub khi nhiều máy |
| Meilisearch | Để sau | PostgreSQL FTS trước |
| Prometheus + Grafana + Loki | **Nhận** | `infrastructure/monitoring/` (compose phủ thêm, tuỳ chọn): 6 dashboard, 8 cảnh báo, Loki gom log |
| Turborepo + npm workspaces | Để sau | npm workspaces đủ khi < 10 gói; xét lại ở PHASES 3 khi tách `packages/*` |
| Vitest + Playwright | Nhận dần | Vitest có (PostgreSQL thật); Playwright cho lane `runtime` của bộ kiểm (Phase 4) |
| GitHub Actions 7 job | Chỉnh | `ci.yml` + `conformance.yml`; đích ở [CI-CD.md](../ops/CI-CD.md) |
| 17 Dockerfile | Không | 2 image (api, web). Module chạy trong tiến trình Core, không image riêng |
| Kubernetes + Helm | Để sau | Docker Compose cho bản cài doanh nghiệp; Helm chart khi có khách SaaS cần nhiều máy (`infrastructure/helm/`, sau Phase 5) |

### 4. Cây đích bổ sung (TARGET-LAYOUT §1)

```
packages/        Kernel + Platform (data, permissions, audit, events, actions, documents, observability, module-sdk, cli)
modules/<key>/   nghiệp vụ cài / gỡ được (ke-toan, ban-hang, mua-hang, kho, nhan-su, san-xuat, du-an, hop-dong…)
adapters/<x>/    nối hạ tầng / hệ thống ngoài, TUỲ CHỌN: postgres, cell, wordpress, oidc, nats, redis, meilisearch, einvoice-*, vietqr
infrastructure/  cấu hình vận hành, không phải code chạy trong Core:
  monitoring/    Prometheus, Alertmanager, Grafana, Loki, exporter (compose phủ thêm)
  (sau) helm/, terraform/, search/
```

Luật mới **LAYOUT-7**: `infrastructure/` không chứa code TypeScript chạy trong Core; Core không import gì từ `infrastructure/`; tắt toàn bộ `infrastructure/` thì Core vẫn chạy đủ. Luật **LAYOUT-8**: adapter tuỳ chọn có giá trị mặc định chạy được không cần dịch vụ ngoài (bộ nhớ trong tiến trình, PostgreSQL).

## Hệ quả

- **Được:** giữ cài một máy; mỗi thứ học từ tham chiếu có chỗ đặt rõ; không phụ thuộc cứng Redis / NATS / Keycloak; giám sát đủ cho bản chạy thật.
- **Mất / chấp nhận:** khi chạy nhiều máy API phải bật adapter (Redis cho rate-limit, NATS / Redis cho đẩy sự kiện); tìm kiếm toàn văn trên dữ liệu rất lớn chậm hơn Meilisearch cho tới khi có adapter.
- **Việc phải làm:**
  - **trong đợt này:** [BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md), [OBSERVABILITY](../ops/OBSERVABILITY.md), `/metrics`, `infrastructure/monitoring/`, [cài nhanh](../contracts/BIZCITY-PRESET-v1.md);
  - **lộ trình:** `adapters/*` vào PHASES 5; LAYOUT-7, LAYOUT-8 vào TARGET-LAYOUT.

## Phương án đã cân nhắc

1. **Chép nguyên 27 gói + hạ tầng.** Nhanh có "khung đẹp", nhưng bản cài nhỏ phải chạy 8–10 dịch vụ; NATS ngoài giao dịch sổ làm mất bảo đảm "sự kiện ⇔ đã ghi sổ". Loại.
2. **Không học gì, giữ nguyên.** Thiếu số đo, cảnh báo, chuẩn lỗi, tài liệu kiến trúc mà tham chiếu đã làm tốt. Loại.
3. **Chọn lọc theo G-1..G-5 (quyết định này).**
