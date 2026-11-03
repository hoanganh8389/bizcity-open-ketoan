# Quan sát hệ thống: log, truy vết, số đo, báo lỗi
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — §3 thêm 15 số đo (ghi sổ, outbox, gửi lặp, đối soát, đơn vị theo dải, bộ thu); §4 9 dashboard, 14 cảnh báo, runbook (R-OBS-6). -->
<!-- [2026-11-01 03:01 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi: sáu lớp bảo đảm, span chỉ ở khớp nối Platform + cổng Kernel, thuộc tính theo danh sách cho phép, Tempo -->

> **Luật:** R-OBS (§6) · **Quyết định:** [ADR-0007](../adr/ADR-0007-goi-chia-se-va-ha-tang.md) (G-5: quan sát được là bắt buộc, công cụ quan sát là tuỳ chọn) · **Mở rộng:** [PHASE-018](../phases/PHASE-018-GIAM-SAT-VAN-HANH/README.md)
> **Bộ giám sát chạy thật:** [`infrastructure/monitoring/`](../../infrastructure/monitoring/README.md) (Prometheus, Alertmanager, Grafana 9 dashboard, Loki, exporter) · **Xử lý cảnh báo:** [RUNBOOK-CANH-BAO.md](RUNBOOK-CANH-BAO.md)
> **Mã lỗi:** [BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md) · **Tự chẩn đoán:** [DIAGNOSTICS.md](DIAGNOSTICS.md) · **Bằng chứng:** [BIZCITY-EVIDENCE-v1](../contracts/BIZCITY-EVIDENCE-v1.md)
> **Điều tra lỗi theo tình huống (cho dev):** [SO-TAY-DIEU-TRA-LOI.md](SO-TAY-DIEU-TRA-LOI.md) · **Đưa vào app:** [PHASE-019 Bàn điều tra](../phases/PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/README.md) <!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — link sổ tay điều tra lỗi + Bàn điều tra. -->
> **Bàn điều tra — API trung gian** (PHASE-019 W2): `GET /api/v1/system/devtools/{status, traces/:traceId, requests/:requestId, evidence}`, quyền `devtools:read` (chủ đơn vị, vai trò `developer`). API đọc Tempo / Loki qua `DEVTOOLS_TEMPO_URL` / `DEVTOOLS_LOKI_URL` (bộ giám sát đặt sẵn tên dịch vụ nội bộ), gắn bộ lọc đơn vị phía máy chủ, trace của đơn vị khác → 404. Người dùng đơn vị vẫn **không** vào Grafana. <!-- [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: API trung gian của Bàn điều tra. -->
> **Chế độ Vận hành** (PHASE-019 W5, Q019-2): bản cài **một đơn vị** + `DEVTOOLS_OPS=true` + chủ đơn vị → `GET /api/v1/system/devtools/ops/{health, alerts}`: 10 số đo theo danh sách PromQL **cố định** (cùng biểu thức các cảnh báo §4), cảnh báo đang bật của Alertmanager, link 9 bảng Grafana và link Explore của trace (`DEVTOOLS_GRAFANA_URL`, khuôn `panes` của Grafana 11). Bản cài nhiều đơn vị: luôn tắt. <!-- [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: chế độ Vận hành, R-OBS-9. -->

Bốn câu hỏi, bốn nguồn, hai khoá nối (`requestId`, `traceId`). Đây là các lớp 2–5 của **sáu lớp bảo đảm** ([ADR-0010](../adr/ADR-0010-opentelemetry-tu-loi.md), [architecture §7](../architecture/README.md)):

| Hỏi | Nguồn | Giữ ở | Khoá nối |
|---|---|---|---|
| Hệ thống có khoẻ không, chậm ở đâu? | **số đo** `GET /metrics` (Prometheus) | Prometheus 15 ngày | `route`, `code` |
| Yêu cầu này đi qua những đâu, chậm / hỏng ở bước nào, module nào? | **trace** OpenTelemetry (OTLP → Collector → Tempo) | Tempo 7 ngày | `traceId`, `bizcity.module` |
| Yêu cầu này đã chạy thế nào, lỗi gì? | **log** pino JSON (stdout → Loki) | Loki 30 ngày | `reqId` = `requestId`, `traceId` |
| Ai đã làm gì với sổ, có bị sửa không? | **bằng chứng** `audit_logs` (chuỗi băm) | CSDL ≥ 10 năm | `request_id`, `trace_id` (W5), `subject`, `docKey` |

`requestId` có ở phản hồi lỗi (`error.requestId`, R-ERR-5), trong log (`reqId`), trong bằng chứng (`request_id`) và trong biên nhận. Người dùng báo lỗi chỉ cần gửi mã đó. Từ W5, `traceId` đi cùng ở các chỗ đó.

Chỉ số đo, trace, log là **quan sát**. Sự thật về sổ nằm ở Kernel và PostgreSQL (lớp 1–2). Span "ghi sổ xong" không chứng minh giao dịch đã commit, `posting_log` mới chứng minh.

## Mặc định bật (PHASE-018 W6, S018-21) <!-- [2026-11-04 04:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — S018-21 — chủ dự án: "on by default" -->

**Vì sao:** Bàn điều tra (DEV01–DEV04: Tổng quan, Tra mã, Nhật ký, Lỗi theo module) đọc Loki, Tempo, Prometheus. Không có bộ giám sát thì các màn đó chỉ báo "chưa bật" và nhà phát triển phải biết tự bật — bản cài mới nên có sẵn.

**Cách làm (đổi so với bản chữ chốt đầu — đọc `scripts/cai-nhanh.sh` mới thấy sẵn công tắc `GIAM_SAT`, nên không cần `include:`):**
- `bash scripts/cai-nhanh.sh` **mặc định bật** giám sát (Prometheus, Alertmanager, Grafana, Loki, Promtail, Tempo, OTel Collector, các exporter). Tắt: `--khong-giam-sat` hoặc `GIAM_SAT=0`. Cờ cũ `--giam-sat` vẫn được nhận (không đổi gì).
- Script tự sinh `GRAFANA_ADMIN_PASSWORD` và vai trò exporter chỉ đọc (như `JWT_SECRET` / `DB_APP_PASSWORD`); mật khẩu Grafana vẫn **bắt buộc**, không có mật khẩu dự phòng (P0 khảo sát W0).
- Script ghi `COMPOSE_FILE` + `COMPOSE_PATH_SEPARATOR=:` vào `.env` → mọi lệnh `docker compose up / down / logs` gõ trần sau này dùng đúng bộ tệp. Trước đây chỉ lệnh `up` của script có `-f`, còn `docker compose down` trần để lại các container giám sát mồ côi. Tắt giám sát thì script **xoá** hai dòng đó (không bật lại ngầm).
- **Không đổi tệp compose** (`docker-compose.yml`, `docker-compose.monitoring.yml`): lệnh hai `-f` cũ vẫn chạy; máy chủ thật (không dùng cài nhanh) tự đặt `COMPOSE_FILE` hoặc dùng hai `-f` theo [docs/trien-khai.md](../trien-khai.md).
- Cổng giám sát chỉ mở trên `127.0.0.1`. Dữ liệu: Loki 30 ngày, Tempo 7 ngày, Prometheus 15 ngày / 10 GB.
- **Chi phí:** 11 dịch vụ thêm (10 chạy liên tục, 1 tác vụ chạy một lần), mỗi cái có giới hạn bộ nhớ trong tệp compose; máy nhỏ chọn `--khong-giam-sat`.
- **Bản Docker đang chạy từ trước** (dựng khi chưa có Bàn điều tra) không có đường dẫn `/api/v1/system/devtools/*` — cần `docker compose up -d --build` để API có Bàn điều tra rồi mới nối được Loki / Tempo.
- **Bản chạy `npm run dev`** (máy dev) không nằm trong mạng Docker nên không gọi được `http://loki:3100`: Bàn điều tra báo "chưa bật" là đúng; muốn thử thì đặt `DEVTOOLS_LOKI_URL` / `DEVTOOLS_TEMPO_URL` trỏ tới Loki / Tempo mở cổng ra máy.
- **Bàn điều tra khi nguồn chưa bật:** `NOT_READY` của nguồn là TRẠNG THÁI, không phải lỗi kỹ thuật — khay "Lỗi kỹ thuật" / mã tra cứu **không hiện** cho `NOT_READY` của các đường `/api/v1/system/devtools/*`; màn hiện dòng "Chưa bật …" kèm lệnh bật. Lỗi thật (nguồn bật mà không trả lời, mọi mã khác) vẫn hiện như cũ.
- **Đã kiểm:** `DRY_RUN=1` mọi tổ hợp (mặc định, tắt, `GIAM_SAT=0`, cờ cũ) cấu hình hợp lệ; `docker compose config --services` trần thấy đủ 15 dịch vụ khi bật, 4 dịch vụ lõi khi tắt; chạy lại không nhân đôi dòng `.env`. **Chưa kiểm:** dựng thật cả ngăn xếp ở một máy sạch rồi mở Bàn điều tra (cần dựng lại ảnh `api`) — việc của lần cài thật đầu tiên.

## 1. Truy vết yêu cầu

| Việc | Quy định |
|---|---|
| Mã yêu cầu | API nhận `X-Request-Id` từ bên gọi nếu hợp lệ (8–128 ký tự `[A-Za-z0-9._:-]`), không thì tự sinh. Trả lại ở header `X-Request-Id` của mọi phản hồi |
| W3C Trace Context | API nhận `traceparent` của bên gọi: span HTTP nối tiếp trace của Cell / plugin / proxy. Mọi yêu cầu (trừ `/metrics`, health) có `traceId` (32 hex) trong log, trong `error.traceId` và trong bằng chứng (`audit_logs.trace_id`) |
| Gọi ra ngoài | Gọi Hub, Cell, tra MST, AI đọc hoá đơn… bằng `fetch`: span con + `traceparent` tự chuyển tiếp (S8); `X-Request-Id` chuyển tiếp tay |
| OpenTelemetry | **Từ lõi** ([ADR-0010](../adr/ADR-0010-opentelemetry-tu-loi.md), thay "Để sau"), mã ở `packages/platform/src/core/tracing.ts`. SDK luôn có trong Core. Chỉ xuất trace khi đặt `OTEL_EXPORTER_OTLP_ENDPOINT` (bộ giám sát tự đặt = Collector nội bộ); `OTEL_SDK_DISABLED=true` tắt hẳn |

### 1.1 Trace (ADR-0010)

Span đặt ở **khớp nối** mà mọi module đi qua. Module không tự viết mã truy vết:

| # | Khớp nối | Tên span | Thuộc tính chính |
|---|---|---|---|
| S1 | HTTP vào (trừ `/metrics`, health) | `HTTP {method} {route}` | `http.request.method`, `http.route` (mẫu), `http.response.status_code`, `bizcity.request_id`, `bizcity.tenant`, `bizcity.error.code` |
| S2 | MCP | `mcp tools/call {tool}` | `bizcity.mcp.tool`, `bizcity.mcp.via`, `bizcity.mcp.phase` (read · preview · confirm), `bizcity.module` |
| S3 | `runAction` | `action {action.id}` | `bizcity.action.id`, `bizcity.module`, `bizcity.action.effect`, `bizcity.dry_run`, `bizcity.idempotency` (new · replayed) |
| S3a | `ctx.trace.step` (module tự chia bước) | `step {module}.{tên}` | `bizcity.module`, `bizcity.step` |
| S4 | cổng Kernel `kernel/public.ts` | `kernel {thao tác}` | `bizcity.layer=K`, `bizcity.kernel.op`, `bizcity.doc_type` |
| S5 | CSDL (chỉ khi có span cha) | `db {operation} {table}` | `db.system.name`, `db.operation.name`, `db.collection.name` — không câu SQL, không tham số |
| S6 / S7 | outbox phát / giao | `event publish {type}` → link → `event deliver {type} → {consumer}` (trace mới) | `bizcity.event.type`, `bizcity.consumer`, `bizcity.module`, `bizcity.delivery.result`, `bizcity.delivery.attempt` |
| S8 | gọi ra ngoài (`fetch`) | `{method}` client | `server.address`, `http.response.status_code`; chuyển tiếp `traceparent` |

Mọi span có `bizcity.outcome`: `ok` · `rejected` (từ chối đúng luật: kỳ khoá, không cân, xung đột trạng thái… — **không** phải sự cố, không trạng thái ERROR) · `error` (lỗi kỹ thuật, trạng thái ERROR). Cùng quy tắc với `bizcity_posting_failures_total{kind}` (`errorKind`, `core/errors.ts`).

Thuộc tính đi qua **danh sách cho phép** (`TRACE_ATTRIBUTES`, `core/tracing.ts`): bộ xuất bỏ mọi thuộc tính khác, thông điệp trạng thái và thông điệp ngoại lệ trước khi span rời tiến trình; Collector xoá thêm `url.full`, `db.statement`, `exception.message`… Không bao giờ có trong trace: payload, số tiền, tên, MST, SĐT, số tài khoản ngân hàng, câu / tham số SQL, header xác thực, token, `confirm_token`, `Idempotency-Key`. `bizcity.tenant` chỉ là mã nội bộ, như trường `tenant` của log.

Lấy mẫu ở Collector (`infrastructure/monitoring/otel-collector/config.yml`): giữ 100% trace lỗi hoặc chậm > 1 s, cộng `TRACE_SAMPLE_PERCENT`% (mặc định 10) còn lại; chỉnh sau đo tải W6. Tempo giữ 7 ngày.

**Tra trace** (Grafana → Explore → Tempo, TraceQL):

| Muốn biết | TraceQL |
|---|---|
| Module nào đang lỗi kỹ thuật | `{ span.bizcity.module = "vat" && span.bizcity.outcome = "error" }` |
| Lời gọi Kernel bị từ chối đúng luật | `{ span.bizcity.layer = "K" && span.bizcity.outcome = "rejected" }` |
| Việc giao sự kiện chết / thử lại | `{ span.bizcity.delivery.result =~ "dead|retry" }` |
| Một yêu cầu người dùng báo | dán `error.traceId` vào ô tìm trace; hoặc bấm `traceId` trong một dòng log Loki |

## 2. Log có cấu trúc

Fastify pino, JSON một dòng, ra stdout. Docker / promtail đưa vào Loki. Mức theo `LOG_LEVEL` (mặc định `info`).

**Trường của mọi dòng log yêu cầu** (Core tự gắn, không viết tay):

| Trường | Ví dụ | Ghi chú |
|---|---|---|
| `time`, `level`, `msg` | `30` | pino |
| `reqId` | `req-1a2b` | = `X-Request-Id` |
| `traceId` | `4bf92f…` | mọi yêu cầu khi truy vết bật (ADR-0010); tắt SDK thì chỉ khi bên gọi gửi `traceparent` |
| `tenant` | `12` | mã nội bộ đơn vị, **không** tên đơn vị |
| `actor`, `actorKind` | `user:5`, `user` | `apikey:3` / `ai` |
| `route`, `method`, `status`, `ms` | `/api/v1/documents`, `POST`, `201`, `41` | dòng "xong yêu cầu" |
| `errCode` | `PERIOD_LOCKED` | khi lỗi (mã của BIZCITY-ERRORS) |

**Trường của dòng log nghiệp vụ** (service tự ghi, mức `info`): `evt` (`bizcity.<miền>.<việc>`, bảng ở [DIAGNOSTICS.md §3](DIAGNOSTICS.md)), `action`, `module`, `docType`, `docKey`, `version`, `entries`, `reversed`.

**Cấm trong log** (R-SEC-10, R-TEN-8): payload chứng từ, mật khẩu, token, khoá, tên / SĐT / MST cá nhân, số tài khoản ngân hàng. Log lỗi 5xx có `err.stack`, không có thân yêu cầu.

**Nhãn Loki** (ít giá trị, để truy vấn nhanh): `service`, `level`, `tenant`, `errCode`, `evt`. **Không** làm nhãn: `reqId`, `traceId`, `docKey` (quá nhiều giá trị) — tìm bằng `|= "req-1a2b"`.

## 3. Số đo `GET /metrics`

Định dạng văn bản Prometheus, cổng nội bộ của container `api` (nginx **không** chuyển `/metrics` ra ngoài). Đặt `METRICS_TOKEN` thì phải gửi `Authorization: Bearer <token>`. Tên có tiền tố `bizcity_` (ADR-0002).

| Số đo | Loại | Nhãn | Dùng cho |
|---|---|---|---|
| `bizcity_build_info` | gauge | `version`, `kernel`, `standard` | biết bản đang chạy |
| `bizcity_http_requests_total` | counter | `method`, `route`, `status` | tốc độ, tỉ lệ lỗi |
| `bizcity_http_request_duration_seconds` | histogram | `method`, `route` | độ trễ p50 / p95 / p99 |
| `bizcity_http_errors_total` | counter | `code` | lỗi theo mã (R-ERR-9) |
| `bizcity_db_query_duration_seconds` | histogram | `kind` (select, insert, update, delete, other) | truy vấn chậm |
| `bizcity_db_query_errors_total` | counter | — | lỗi CSDL |
| `bizcity_db_pool_connections` | gauge | `state` (total, idle, waiting) | cạn kết nối |
| `bizcity_actions_total` | counter | `action`, `result`, `code` | runtime action (PHASES 2.5) |
| `bizcity_mcp_tool_calls_total` | counter | `tool`, `result` | AI dùng công cụ nào |
| `bizcity_ledger_events` | gauge | `status` (posted, pending, error, cancelled) | sự việc theo trạng thái (đo mỗi 60 s) |
| `bizcity_ledger_events_oldest_pending_seconds` | gauge | — | chứng từ treo ở ACC14 |
| `bizcity_ledger_entries_last_24h` | gauge | — | bút toán 24 giờ qua |
| `bizcity_diagnostics_errors` | gauge | `layer` (L1, L3) | lượt tự chẩn đoán gần nhất có lỗi |
| `bizcity_diagnostics_checks` | gauge | `layer`, `result` (pass, empty, info, warn, error) | kết quả kiểm lượt gần nhất mỗi đơn vị, cộng theo tầng |
| `bizcity_diagnostics_last_run_timestamp_seconds` | gauge | `layer` | mốc lượt tự chẩn đoán gần nhất — `ReconciliationStale`; chưa từng chạy thì **không có** số đo (không phải 0) |
| `bizcity_diagnostics_last_success_timestamp_seconds` | gauge | `layer` | mốc lượt gần nhất không có kiểm error |
| `bizcity_db_pool_max` | gauge | — | trần pool, tính bão hoà — `DbPoolSaturation` |
| `bizcity_postings_total` | counter | `doc_type` (18 + `other`), `action` (receive, post, repost, error, cancel, cancel_request, unpost) | dòng `posting_log` **đã commit** — đọc 60 s / lần, bỏ dòng mới hơn 60 s; mọi máy API cùng số → gộp bằng `max` |
| `bizcity_posting_failures_total` | counter | `code` (mã `bizcity_errors@1` hoặc `OTHER`), `kind` (rejected, error) | ghi lỗi định khoản: `rejected` = từ chối nghiệp vụ (category ledger / input / state / auth), `error` = kỹ thuật — `PostingRejectionSpike` |
| `bizcity_outbox_deliveries` | gauge | `status` (pending, dead) | việc giao sự kiện — `OutboxDeadLetter` |
| `bizcity_outbox_oldest_pending_seconds` | gauge | — | việc giao chờ lâu nhất — `OutboxBacklog` |
| `bizcity_outbox_attempts_total` | counter | `consumer` (subscriber đăng ký), `result` (done, duplicate, retry, dead) | lượt giao (trong tiến trình → cộng bằng `sum`) |
| `bizcity_idempotency_requests_total` | counter | `result` (new, replayed, conflict) | action ghi có `Idempotency-Key` |
| `bizcity_tenants` | gauge | `band` (idle 0 · small 1–100 · medium 101–1000 · large > 1000 dòng `posting_log` / 24 giờ) | phân bố tải theo đơn vị **không lộ đơn vị nào** (đo mỗi 15 phút) |
| `bizcity_tenants_with_backlog` | gauge | — | số đơn vị có sự việc pending / error quá 1 giờ |
| `bizcity_collector_errors_total` | counter | `collector` (ledger, postings, outbox, tenants, diagnostics) | bộ thu lỗi / quá trần 5 s — `MetricsCollectorFailing` |
| `process_*`, `nodejs_*` | — | — | bộ nhớ, CPU, event loop |

**Không** gắn nhãn `tenant` vào số đo: số đơn vị không giới hạn sẽ làm nổ chuỗi số đo. Thống kê theo đơn vị lấy từ Loki hoặc từ CSDL; Prometheus chỉ có số đơn vị theo dải (`bizcity_tenants`). Luật dò `H-METRIC-LABEL` (RULE-REVIEW §4) chặn nhãn theo đơn vị / chứng từ / người ở review; test `giam-sat.test.ts` kiểm cả văn bản `/metrics`.

**Bộ thu đọc CSDL** (`registerCollector`): chạy khi Prometheus đọc `/metrics`, tối đa một lần mỗi chu kỳ, trong **giao dịch chỉ đọc có `statement_timeout` 5 s** (`readWithTimeout`, `packages/platform/src/db/client.ts`) — câu đếm chậm bị CSDL huỷ, không treo `/metrics`, không ảnh hưởng đường ghi sổ. Số đo ghi sổ đọc từ `posting_log` (ghi cùng giao dịch với bút toán) nên chỉ đếm phần đã commit, mọi đường vào như nhau, và đường ghi sổ không phải làm thêm gì.

## 4. Giám sát và cảnh báo

[`infrastructure/monitoring/`](../../infrastructure/monitoring/README.md), bật bằng:

```bash
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml up -d
```

- **9 dashboard:**
  1. Tổng quan;
  2. API theo route;
  3. PostgreSQL;
  4. Sổ cái & sự việc;
  5. KPI nghiệp vụ;
  6. Nhật ký & cảnh báo;
  7. Đường sự kiện (outbox, gửi lặp — PHASE-018);
  8. Đa đơn vị (đơn vị theo dải, không lộ đơn vị — PHASE-018);
  9. Toàn vẹn sổ (đối soát, ghi sổ đã commit, từ chối nghiệp vụ vs lỗi kỹ thuật — PHASE-018).
- **14 cảnh báo:** `HighErrorRate`, `HighLatency`, `ApiDown`, `HighMemory`, `PostgreSQLDown`, `DiskUsage`, `LedgerIntegrityError`, `PostingBacklog` + PHASE-018: `OutboxDeadLetter`, `OutboxBacklog`, `ReconciliationStale`, `DbPoolSaturation`, `MetricsCollectorFailing`, `PostingRejectionSpike` (nhãn `team="ke-toan"`, báo kế toán, không gọi trực ban). Test bắn / hết bắn: `prometheus/alerts.test.yml` (`promtool test rules`).
- **Trace:** OTel Collector (lấy mẫu đuôi) → Tempo (7 ngày) → Grafana: từ log bấm `traceId` mở trace; từ span mở log cùng `traceId` và độ trễ của route (§1.1).
- **Xử lý từng cảnh báo:** [RUNBOOK-CANH-BAO.md](RUNBOOK-CANH-BAO.md). Cảnh báo chỉ báo — không tự sửa dữ liệu kế toán.

So với bộ tham chiếu: không có `RedisDown` / `NATSDown`, vì Core không dùng Redis / NATS (ADR-0007 G-1). Chỗ đó thay bằng hai cảnh báo của sổ cái, thứ quan trọng nhất của phần mềm kế toán.

## 5. Báo lỗi (bug)

Mẫu [`.github/ISSUE_TEMPLATE/bao-loi.yml`](../../.github/ISSUE_TEMPLATE/bao-loi.yml) bắt buộc các trường:

| Trường | Lấy ở đâu |
|---|---|
| Phiên bản (`version`, `kernel`, `standard`) | `GET /api/v1/system/health` |
| `requestId` | phản hồi lỗi `error.requestId` / header `X-Request-Id` |
| `traceId` (nếu có) | phản hồi lỗi `error.traceId` — Ops mở thẳng trace trong Tempo |
| Mã lỗi (`code`, `details.reason`) | phản hồi lỗi |
| Biên nhận (`evidenceId`) nếu là thao tác ghi | `meta.receipt` |
| Kết quả tự chẩn đoán | `GET /api/v1/system/diagnostics` (chỉ `summary` + mã kiểm lỗi) |
| Các bước tái hiện, mong đợi, thực tế | người báo |

**Không** dán: dữ liệu chứng từ thật, tên khách, MST, số tiền của đơn vị, khoá, token (repo công khai — R-SEC-10).

Quy trình xử lý:
1. Gắn nhãn mức `sev1` / `sev2` / `sev3`. `sev1` = sai sổ, mất dữ liệu, lộ dữ liệu.
2. Tra `requestId` trong Loki.
3. Tra bằng chứng theo `request_id`.
4. Viết test tái hiện trước khi sửa (R-QG).
5. Ghi vào CHANGELOG mục "Sửa".

## 6. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-OBS-1** | Mọi phản hồi có header `X-Request-Id`. Mọi phản hồi lỗi có `error.requestId` | `test/observability.test.ts` |
| **R-OBS-2** | Log JSON có trường §2; không có trường cấm | review; test |
| **R-OBS-3** | `/metrics` không đi qua nginx ra Internet; có `METRICS_TOKEN` khi cổng API mở ra ngoài máy | `docker/nginx.conf`; DEPLOY |
| **R-OBS-4** | Số đo không có nhãn số lượng không giới hạn (`tenant`, `docKey`, `reqId`, `actor`) | review `core/metrics.ts` |
| **R-OBS-5** | Cảnh báo dựa trên số đo + mã lỗi, không trên câu chữ log | `infrastructure/monitoring/prometheus/alerts.yml` |
| **R-OBS-6** | Thêm số đo / cảnh báo / dashboard: sửa bảng §3 / §4 cùng PR | CANON §5 |
| **R-OBS-7** | Chỉ `core/tracing.ts` (Platform) import `@opentelemetry/*`. Kernel, module, add-in tạo span qua Platform (`withSpan`, `ctx.trace.step`), không import trực tiếp | check SC-OBS-2 |
| **R-OBS-8** | Thuộc tính span theo danh sách cho phép §1.1. Thêm thuộc tính `bizcity.*` mới thì sửa danh sách và bảng §1.1 cùng PR. Trace, số đo, log không bao giờ đọc ngược vào định khoản / khoá kỳ / quyền | SC-OBS-2; `apps/api/test/truy-vet.test.ts` |
| **R-OBS-9** | Bàn điều tra (PHASE-019): LogQL / TraceQL chỉ dựng từ mẫu đóng trong `devtools.sources.ts`, luôn gắn đơn vị của phiên, mọi giá trị chèn qua khuôn Zod **và** `quote()`; PromQL của chế độ Vận hành là chuỗi cố định; trình duyệt không gọi Tempo / Loki / Prometheus / Alertmanager <!-- [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: R-OBS-9 + SC-DEV-1. --> | check SC-DEV-1; `apps/api/test/ban-dieu-tra.test.ts` |
