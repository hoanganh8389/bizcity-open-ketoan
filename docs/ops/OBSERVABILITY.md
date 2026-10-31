# Quan sát hệ thống: log, truy vết, số đo, báo lỗi
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — §3 thêm 15 số đo (ghi sổ, outbox, gửi lặp, đối soát, đơn vị theo dải, bộ thu); §4 9 dashboard, 14 cảnh báo, runbook (R-OBS-6). -->

> **Luật:** R-OBS (§6) · **Quyết định:** [ADR-0007](../adr/ADR-0007-goi-chia-se-va-ha-tang.md) (G-5: quan sát được là bắt buộc, công cụ quan sát là tuỳ chọn) · **Mở rộng:** [PHASE-018](../phases/PHASE-018-GIAM-SAT-VAN-HANH/README.md)
> **Bộ giám sát chạy thật:** [`infrastructure/monitoring/`](../../infrastructure/monitoring/README.md) (Prometheus, Alertmanager, Grafana 9 dashboard, Loki, exporter) · **Xử lý cảnh báo:** [RUNBOOK-CANH-BAO.md](RUNBOOK-CANH-BAO.md)
> **Mã lỗi:** [BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md) · **Tự chẩn đoán:** [DIAGNOSTICS.md](DIAGNOSTICS.md) · **Bằng chứng:** [BIZCITY-EVIDENCE-v1](../contracts/BIZCITY-EVIDENCE-v1.md)

Ba câu hỏi, ba nguồn, một khoá nối:

| Hỏi | Nguồn | Giữ ở | Khoá nối |
|---|---|---|---|
| Hệ thống có khoẻ không, chậm ở đâu? | **số đo** `GET /metrics` (Prometheus) | Prometheus 15 ngày | `route`, `code` |
| Yêu cầu này đã chạy thế nào, lỗi gì? | **log** pino JSON (stdout → Loki) | Loki 30 ngày | `reqId` = `requestId` |
| Ai đã làm gì với sổ, có bị sửa không? | **bằng chứng** `audit_logs` (chuỗi băm) | CSDL ≥ 10 năm | `request_id`, `subject`, `docKey` |

`requestId` có ở phản hồi lỗi (`error.requestId`, R-ERR-5), trong log (`reqId`), trong bằng chứng (`request_id`) và trong biên nhận. Người dùng báo lỗi chỉ cần gửi mã đó.

## 1. Truy vết yêu cầu

| Việc | Quy định |
|---|---|
| Mã yêu cầu | API nhận `X-Request-Id` từ bên gọi nếu hợp lệ (8–128 ký tự `[A-Za-z0-9._:-]`), không thì tự sinh. Trả lại ở header `X-Request-Id` của mọi phản hồi |
| W3C Trace Context | API đọc `traceparent`. Nếu có, `traceId` (32 hex) vào log của yêu cầu, để nối với trace của Cell / plugin / proxy |
| Gọi ra ngoài | Gọi Hub, Cell, tra MST, AI đọc hoá đơn… phải chuyển tiếp `X-Request-Id` + `traceparent` |
| OpenTelemetry | Để sau (ADR-0007): khi bật, exporter OTLP là adapter; tên span = route Fastify / mã action |

## 2. Log có cấu trúc

Fastify pino, JSON một dòng, ra stdout. Docker / promtail đưa vào Loki. Mức theo `LOG_LEVEL` (mặc định `info`).

**Trường của mọi dòng log yêu cầu** (Core tự gắn, không viết tay):

| Trường | Ví dụ | Ghi chú |
|---|---|---|
| `time`, `level`, `msg` | `30` | pino |
| `reqId` | `req-1a2b` | = `X-Request-Id` |
| `traceId` | `4bf92f…` | khi có `traceparent` |
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

**Bộ thu đọc CSDL** (`registerCollector`): chạy khi Prometheus đọc `/metrics`, tối đa một lần mỗi chu kỳ, trong **giao dịch chỉ đọc có `statement_timeout` 5 s** (`readWithTimeout`, `db/client.ts`) — câu đếm chậm bị CSDL huỷ, không treo `/metrics`, không ảnh hưởng đường ghi sổ. Số đo ghi sổ đọc từ `posting_log` (ghi cùng giao dịch với bút toán) nên chỉ đếm phần đã commit, mọi đường vào như nhau, và đường ghi sổ không phải làm thêm gì.

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
- **Xử lý từng cảnh báo:** [RUNBOOK-CANH-BAO.md](RUNBOOK-CANH-BAO.md). Cảnh báo chỉ báo — không tự sửa dữ liệu kế toán.

So với bộ tham chiếu: không có `RedisDown` / `NATSDown`, vì Core không dùng Redis / NATS (ADR-0007 G-1). Chỗ đó thay bằng hai cảnh báo của sổ cái, thứ quan trọng nhất của phần mềm kế toán.

## 5. Báo lỗi (bug)

Mẫu [`.github/ISSUE_TEMPLATE/bao-loi.yml`](../../.github/ISSUE_TEMPLATE/bao-loi.yml) bắt buộc các trường:

| Trường | Lấy ở đâu |
|---|---|
| Phiên bản (`version`, `kernel`, `standard`) | `GET /api/v1/system/health` |
| `requestId` | phản hồi lỗi `error.requestId` / header `X-Request-Id` |
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
