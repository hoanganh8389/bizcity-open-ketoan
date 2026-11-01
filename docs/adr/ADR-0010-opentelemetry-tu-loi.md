# ADR-0010 · OpenTelemetry từ lõi kiến trúc: sáu lớp bảo đảm, truy vết đặt ở khớp nối
<!-- [2026-11-01 03:01 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi: sáu lớp bảo đảm, span chỉ ở khớp nối Platform + cổng Kernel, thuộc tính theo danh sách cho phép, Tempo -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) quyết 2026-11-01: "cần có OpenTelemetry. OpenTelemetry đáng triển khai ngay từ lõi kiến trúc" (trả lời Q018-2)
- Ngày: 2026-11-01 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K1** một lần (bọc cổng `kernel/public.ts` để thêm quan sát, không đổi hành vi ghi sổ — [RULE-KERNEL](../rules/RULE-KERNEL.md))
- Luật / hợp đồng liên quan: G-5 ([ADR-0007](ADR-0007-goi-chia-se-va-ha-tang.md)), AP-1, R-OBS-1…6 ([OBSERVABILITY](../ops/OBSERVABILITY.md)), R-KER-7, R-KER-8, R-KER-9, R-SEC-10, R-TEN-8, SC-KERNEL-6, SC-LAYER-2, [PHASE-018](../phases/PHASE-018-GIAM-SAT-VAN-HANH/README.md) W5
- Thay một phần: dòng "OpenTelemetry — Để sau (ADR-0007)" ở [OBSERVABILITY §1](../ops/OBSERVABILITY.md) và D018-7 "trace là tuỳ chọn" ở [PHASE-018 00 §4](../phases/PHASE-018-GIAM-SAT-VAN-HANH/00-MASTER-PLAN.md)

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework. Bản quyền framework thuộc về BizCity – Johnny Chu, để bảo đảm lõi được xây trên nền đã chuẩn hoá.

## Bối cảnh

Core đã có ba nguồn quan sát nối nhau bằng `requestId`:

1. số đo `/metrics` → Prometheus;
2. log pino JSON → Loki;
3. bằng chứng `audit_logs` (chuỗi băm) trong PostgreSQL.

`core/observability.ts` đọc `traceparent` W3C và đưa `traceId` vào log, nhưng **chưa sinh span**. Vì vậy chưa trả lời được câu "yêu cầu này đi qua những đâu, chậm hay hỏng ở bước nào".

Câu đó sắp thành câu quan trọng nhất. Cộng đồng bắt đầu viết (kể cả vibe-code) các module VAT, công nợ phải thu / phải trả, CRM, kho và agent AI trên cùng một Core. Một yêu cầu sẽ đi qua nhiều tầng:

```
HTTP / MCP → action của module → Kernel ghi sổ → CSDL → outbox → subscriber của module khác → gọi ra ngoài
```

Khi một module lỗi, người vận hành phải biết **lỗi ở module nào, bước nào, ảnh hưởng tới luồng nào**. Câu trả lời phải có mà không cần đọc mã module, và **không ai phải sửa Accounting Kernel** để có nó.

Bản kế hoạch PHASE-018 trước đây để trace là tuỳ chọn, làm sau W4 (D018-7). Chủ dự án quyết đổi: OpenTelemetry là một phần của **thiết kế lõi**.

## Quyết định

### 1. Sáu lớp bảo đảm — mỗi lớp trả lời một câu, không lớp nào làm thay lớp khác

| # | Lớp | Bảo đảm | Là nguồn sự thật? | Ở đâu |
|---|---|---|---|---|
| 1 | **Accounting Kernel** | Ghi sổ **đúng**: một cửa sự việc, Nợ = Có, kỳ khoá, sổ chỉ thêm, định khoản tất định | **Có** — quyết định | `apps/api/src/kernel/public.ts` → `modules/{documents,posting,ledger,periods}` |
| 2 | **PostgreSQL + Audit Ledger** | Lưu **bằng chứng nghiệp vụ**: bút toán, `posting_log`, `audit_logs` chuỗi băm, `diagnostic_runs`; trigger chặn sửa / xoá | **Có** — lưu giữ ≥ 10 năm | `db/migrations/`, `core/audit.ts` |
| 3 | **OpenTelemetry** | Theo dõi **hành trình thực thi**: yêu cầu đi qua module nào, action nào, cổng Kernel nào, câu CSDL nào, subscriber nào; mất bao lâu, hỏng ở đâu | Không — quan sát | `apps/api/src/core/tracing.ts` (Platform) |
| 4 | **Prometheus** | Đo **sức khoẻ và hiệu năng**: tốc độ, độ trễ, tỉ lệ lỗi, ghi sổ đã commit, outbox, pool, đối soát | Không — tổng hợp | `GET /metrics` (`core/metrics.ts`) |
| 5 | **Grafana + Tempo + Loki** | **Quan sát, điều tra lỗi**: dashboard → trace → log của đúng yêu cầu đó, nối bằng `traceId` | Không — giao diện điều tra | `infrastructure/monitoring/` |
| 6 | **Alertmanager** | **Thông báo khi bất thường**: định tuyến theo mức / nhóm, ức chế, im lặng khi bảo trì | Không — chỉ báo, không bao giờ sửa dữ liệu | `infrastructure/monitoring/alertmanager/` |

Luật gắn với bảng:

- **Chỉ lớp 1–2 quyết định và lưu sự thật.** Lớp 3–6 chỉ quan sát (O-1, AP-1). Không số đo, span hay cảnh báo nào được đọc ngược vào định khoản, khoá kỳ hay quyền (R-KER-7).
- **Span không chứng minh việc đã ghi.** Span "ghi sổ thành công" chỉ cho biết hàm trả về. Giao dịch bọc ngoài vẫn có thể rollback (dry-run, lỗi sau đó). Sổ đã commit chỉ được chứng minh bằng `posting_log` / `ledger_entries` (lớp 2). Đây là lý do bộ đếm ghi sổ đọc `posting_log` (D018-3).
- **Hỏng lớp 3–6 không hỏng lớp 1–2** (O-3). Tắt Tempo, Prometheus, Grafana, Loki hay Alertmanager thì ghi sổ vẫn chạy đúng như cũ.

### 2. Có OpenTelemetry trong mã luôn luôn; xuất trace là tuỳ chọn

Giữ đúng G-5: *quan sát được là bắt buộc, công cụ quan sát là tuỳ chọn*.

| | Luôn có (trong Core) | Tuỳ chọn (khi khách bật) |
|---|---|---|
| Mã | `core/tracing.ts`: khởi tạo SDK, span ở mọi khớp nối (§3), lan truyền W3C `traceparent` vào / ra, `traceId` trong log, trong phản hồi lỗi và trong bằng chứng | — |
| Xuất | — | đặt `OTEL_EXPORTER_OTLP_ENDPOINT` → gửi OTLP/HTTP tới OTel Collector → Tempo |
| Không đặt biến | SDK chạy chế độ không xuất: vẫn sinh `traceId` để nối log, gần như không tốn chi phí, không có kết nối ra ngoài | — |
| Tắt hẳn | `OTEL_SDK_DISABLED=true` → API no-op của `@opentelemetry/api` | — |

### 3. Span chỉ đặt ở khớp nối của Platform và ở cổng Kernel — module không tự import OpenTelemetry

Mọi module đi qua cùng một số khớp nối. Vì vậy chỉ cần đặt span ở các khớp đó: module cộng đồng **tự có trace đầy đủ mà không viết một dòng truy vết nào**, và Kernel không bị sửa theo từng module.

| # | Khớp nối | Tên span | Thuộc tính chính | Ở tệp |
|---|---|---|---|---|
| S1 | Yêu cầu HTTP vào | `HTTP {method} {route}` (route mẫu Fastify, không URL thật) | `http.request.method`, `http.route`, `http.response.status_code`, `bizcity.error.code` | `core/observability.ts` (hook có sẵn) |
| S2 | Lời gọi công cụ MCP | `mcp tools/call {tool}` | `bizcity.mcp.tool`, `bizcity.mcp.via` (client), `bizcity.mcp.phase` (preview · confirm) | `modules/system/mcp.routes.ts` |
| S3 | Runtime action | `action {action.id}` | `bizcity.action.id`, **`bizcity.module`** (tiền tố của id, STD-ACT-6), `bizcity.action.effect`, `bizcity.dry_run`, `bizcity.idempotency` (new · replayed · conflict), `bizcity.error.code` | `core/actions.ts` (`runAction`) |
| S4 | **Cổng Kernel** | `kernel {thao tác}` (vd `kernel postDocumentIn`, `kernel eventStore.post`, `kernel ledgerQuery`) | `bizcity.layer=K`, `bizcity.doc_type`, `bizcity.kernel.outcome` (posted · unchanged · rejected · error), `bizcity.error.code` | `kernel/public.ts` — bọc **một lần**, mức K1 |
| S5 | Câu CSDL | `db {operation} {table}` | `db.system=postgresql`, `db.operation.name`, `db.collection.name`; **không** có câu SQL đầy đủ, **không** có tham số | `@opentelemetry/instrumentation-pg`, `requireParentSpan: true` |
| S6 | Phát sự kiện (outbox) | `event publish {type}` | `bizcity.event.type`, `bizcity.module` (nguồn) | `core/events.ts` (`emitEvent`) |
| S7 | Giao sự kiện cho subscriber | `event deliver {type} → {consumer}` — **span mới, nối (link) với span phát** | `bizcity.event.type`, `bizcity.consumer`, **`bizcity.module`** (module của subscriber), `bizcity.delivery.result` (done · duplicate · retry · dead), `bizcity.delivery.attempt` | `core/events.ts` (`dispatchOnce`) |
| S8 | Gọi ra ngoài (Hub, Cell, tra MST, AI đọc hoá đơn) | `HTTP {method}` client | `server.address`, `http.response.status_code`; chuyển tiếp `traceparent` + `X-Request-Id` | `@opentelemetry/instrumentation-undici` / `-http` |
| S9 | Việc định kỳ, bộ thu số đo | `job {tên}` | `bizcity.job` | `core/events.ts` (đồng hồ), `core/metrics.ts` (bộ thu) |

Chi tiết thiết kế:

- **Cổng Kernel (S4) là chỗ duy nhất Kernel đổi.** Theo SC-KERNEL-6, mọi chỗ ngoài Kernel chỉ gọi Kernel qua `kernel/public.ts`. Bọc các hàm ghi / đọc ở cổng bằng `withSpan` của Platform thì bắt được **mọi** lượt gọi từ mọi module, từ đường HTTP, MCP, trạm ACC14, preset đến việc định kỳ. Lời gọi nội bộ giữa các phần của Kernel không qua cổng nên không sinh span thừa.
  - Kernel import Platform là chiều được phép (K → P, SC-LAYER-2).
  - Kernel **không** import `@opentelemetry/*` (R-KER-8 không thêm phụ thuộc vào Kernel).
  - Việc bọc là K1 (thêm quan sát), làm một lần trong ADR này. Sau đó **không PR module nào phải sửa Kernel để có trace**.
- **Thuộc tính `bizcity.module` có trên mọi span của action, sự kiện và subscriber.** Đây là thuộc tính khoanh vùng lỗi. Giá trị lấy từ khai báo đã có:
  - tiền tố của `action.id` (`vat.invoice.issue` → `vat`);
  - `source.module` của sự kiện;
  - module sở hữu subscriber;
  - mã add-in.

  Module không tự khai, nên module không thể khai sai.
- **Sự kiện qua outbox giữ được hành trình.** `emitEvent` lưu `traceparent` của span phát vào dòng outbox, trong **cùng giao dịch**. Migration chỉ thêm: một cột `event_outbox.trace_parent text NULL`. Khi giao, dispatcher mở span mới **nối (span link)** về span phát chứ không làm con: việc giao chạy sau, có thể thử lại nhiều lần. Từ một lỗi ở subscriber (vd module CRM) lần ngược được về yêu cầu gốc (vd phiếu bán hàng); từ yêu cầu gốc thấy được mọi subscriber đã chạy.
- **`traceId` vào bằng chứng và phản hồi lỗi.** `audit_logs` ghi thêm `trace_id` (cột chỉ thêm). Phản hồi lỗi có `error.traceId` cạnh `error.requestId` (R-ERR-5 mở rộng, không đổi trường cũ). Người dùng báo lỗi vẫn chỉ cần gửi một mã.
- **Module muốn chi tiết hơn** (vd module VAT muốn thấy bước "tính thuế" riêng) dùng `ctx.trace.step(name, fn)` của `@bizcity/module-sdk`. Platform cấp, tên bước và thuộc tính đi qua danh sách cho phép (§4). Module **không** import `@opentelemetry/*` trực tiếp. Check tĩnh **SC-OBS-2** chặn việc đó.

### 4. Thuộc tính: danh sách cho phép, không danh sách cấm

Trace đi ra khỏi CSDL nên phải an toàn như log (R-SEC-10, R-TEN-8). `core/tracing.ts` có một `SpanProcessor` lọc: **chỉ giữ thuộc tính có trong danh sách cho phép**, còn lại bỏ trước khi xuất. Một module có lỡ gắn số tiền hay MST thì thuộc tính đó cũng không ra khỏi tiến trình.

| Được phép | Không bao giờ |
|---|---|
| Thuộc tính chuẩn OTel về HTTP, CSDL, RPC đã liệt kê ở §3 (route mẫu, không URL có tham số) | Payload chứng từ, dòng hàng, số tiền, số dư |
| `bizcity.module`, `bizcity.layer`, `bizcity.action.id`, `bizcity.action.effect`, `bizcity.doc_type`, `bizcity.kernel.outcome`, `bizcity.event.type`, `bizcity.consumer`, `bizcity.delivery.*`, `bizcity.mcp.*`, `bizcity.job`, `bizcity.dry_run`, `bizcity.idempotency`, `bizcity.error.code` | Câu SQL đầy đủ, tham số SQL |
| `bizcity.tenant` = **mã nội bộ** đơn vị (giống trường `tenant` của log, Ops mới xem được) | Tên đơn vị, tên khách / nhà cung cấp, MST, SĐT, email, số tài khoản ngân hàng |
| `bizcity.request_id` | Header `Authorization`, cookie, token, khoá API, `confirm_token`, `Idempotency-Key` |
| Sự kiện span `exception` chỉ có `exception.type` + `bizcity.error.code`; stack trace giữ trong log 5xx như hiện nay | `docKey`, mã chứng từ, mã bút toán (đã có trong log và bằng chứng; tra theo `traceId`) |

Trace **không** nằm trong Prometheus: `trace_id`, `request_id`, `tenant` vẫn bị cấm làm nhãn số đo (R-OBS-4).

### 5. Đường đi của dữ liệu quan sát

```
apps/api ──OTLP/HTTP──▶ OTel Collector ──▶ Tempo ──▶ Grafana
   │  (batch, hàng đợi có trần,     │ (lấy mẫu đuôi:          ▲
   │   bỏ khi đầy, không chặn)      │  giữ 100% trace lỗi /    │
   │                                │  chậm > 1 s, 10% còn lại)│
   ├──/metrics──▶ Prometheus ──▶ Alertmanager                │
   └──stdout JSON (có traceId)──▶ Promtail ──▶ Loki ─────────┘
```

- **Gói npm** (chỉ ở Platform, khoá phiên bản cụ thể khi code):
  - `@opentelemetry/api`
  - `@opentelemetry/sdk-node`
  - `@opentelemetry/exporter-trace-otlp-http`
  - `@opentelemetry/instrumentation-http`
  - `@opentelemetry/instrumentation-undici`
  - `@opentelemetry/instrumentation-pg`

  Span HTTP lấy từ hook Fastify sẵn có thay vì thêm gói instrumentation Fastify. Không dùng gói tự dò mọi thư viện (`auto-instrumentations-node`), để biết chính xác cái gì bị đo.
- **Lấy mẫu.** Ứng dụng gửi mọi trace tới Collector trên mạng nội bộ. Collector lấy mẫu đuôi (`tail_sampling`): giữ mọi trace có lỗi hoặc chậm hơn 1 giây, cộng 10% số còn lại. Tỉ lệ chỉnh sau khi đo tải (W6, Q018-5). Trace có `traceparent` từ ngoài đến thì theo quyết định lấy mẫu của bên gọi (`parentbased`).
- **Hạ tầng.**
  - `otel-collector` và `tempo` vào `infrastructure/monitoring/docker-compose.monitoring.yml`, cổng bind `127.0.0.1` như Prometheus.
  - Tempo lưu trên đĩa local, giữ 7 ngày.
  - Grafana thêm nguồn dữ liệu Tempo:
    - trace → log: Loki theo `traceId`;
    - log → trace: trường suy diễn `traceId`, chỗ đã chừa sẵn ở `grafana/provisioning/datasources/datasources.yml`;
    - trace → số đo: Prometheus theo `http.route`.
- **Ngân sách chi phí.** Đo theo cùng mốc R-KER-9:
  - khi xuất trace, độ trễ p95 ghi sổ tăng ≤ 5%;
  - khi không xuất, tăng ≤ 1%.

  Vượt thì giảm số span (bỏ S5 khi không có span cha), không bỏ khớp nối S3 / S4 / S7.

### 6. Module cộng đồng lỗi: hệ thống chỉ ra chỗ lỗi và ảnh hưởng mà không sửa Kernel

| Câu hỏi khi có sự cố | Trả lời bằng | Ví dụ truy vấn |
|---|---|---|
| Có bất thường không? | Alertmanager (lớp 6) từ số đo (lớp 4) | `HighErrorRate`, `OutboxDeadLetter`, `PostingRejectionSpike` |
| Module nào? | Tempo (lớp 3, 5) theo `bizcity.module` | `{ span.bizcity.module = "vat" && status = error }` |
| Bước nào? | cây span: action → cổng Kernel → CSDL / sự kiện | span `kernel postDocumentIn` có `bizcity.error.code = "PERIOD_LOCKED"` là **từ chối đúng luật**; lỗi ở span `action vat.*` trước cổng Kernel là **lỗi của module** |
| Ảnh hưởng tới đâu? | span link từ `event publish` sang các `event deliver` | phiếu bán hàng vẫn ghi sổ; chỉ subscriber `crm.*` chết → việc giao sang `dead`, các subscriber khác vẫn `done` |
| Sổ có bị sai không? | lớp 1–2: `posting_log`, `diagnostic_runs`, `audit_logs` theo `trace_id` / `request_id` | `LedgerIntegrityError` không bắn = bất biến sổ còn nguyên |
| Log chi tiết? | Loki theo `traceId` | `{service="api"} \|= "<traceId>"` |

Vì sao không cần sửa Kernel:

- Module chỉ vào sổ qua cổng (một cửa, R-LEDGER-4).
- Mỗi action chạy trong giao dịch riêng.
- Subscriber lỗi chỉ làm việc giao của chính nó thử lại / chết, không huỷ giao dịch đã commit (transactional outbox, PHASE-006).

OpenTelemetry làm cho các ranh giới **đã có** này **nhìn thấy được**. Nó không thêm ranh giới mới vào Kernel.

## Hệ quả

**Được:**
- Mỗi sự cố có địa chỉ: module, action, bước, `traceId`. Review đóng góp cộng đồng có thêm bằng chứng chạy thật: trace của ca test cho thấy module có đi đúng cổng Kernel không.
- Đường điều tra khép kín: cảnh báo → dashboard → trace → log → bằng chứng.
- Kernel chỉ đổi một lần (K1, ở cổng). Module mới **không** phải viết mã truy vết và **không** phải sửa Kernel.

**Mất / rủi ro:**
- Thêm 6 gói npm ở Platform. Khoá phiên bản; cập nhật qua PR có test chi phí.
- Thêm 2 dịch vụ (Collector, Tempo) vào bộ giám sát tuỳ chọn. Tốn đĩa: Tempo giữ 7 ngày.
- Trace có thể bị hiểu nhầm là bằng chứng ghi sổ. Chặn bằng luật ở §1 và nhắc trong runbook.

**Việc phải làm** (PHASE-018 W5, S018-17):
1. `core/tracing.ts`:
   - khởi tạo SDK theo biến môi trường;
   - `withSpan`;
   - `SpanProcessor` lọc theo danh sách cho phép;
   - nạp trước `app.ts` (`--import`).
2. Span S1–S3, S6–S9 ở Platform. Bọc cổng Kernel (S4, K1).
3. Bật `instrumentation-pg` (S5), không có câu lệnh.
4. Migration chỉ thêm: `event_outbox.trace_parent`, `audit_logs.trace_id`. Phản hồi lỗi có `error.traceId`.
5. `ctx.trace.step` trong `@bizcity/module-sdk` (`packages/module-sdk/API.md`).
6. Check SC-OBS-2:
   - ngoài `core/tracing.ts` không import `@opentelemetry/*`;
   - thuộc tính `bizcity.*` dùng trong mã phải có trong danh sách cho phép.
7. `otel-collector` + `tempo` trong compose giám sát. Nguồn dữ liệu Tempo + liên kết trace ↔ log ↔ số đo trong Grafana.
8. Test:
   - không đặt endpoint → không kết nối ra ngoài;
   - thuộc tính cấm bị lọc;
   - span link outbox;
   - lỗi exporter không làm hỏng ghi sổ;
   - chi phí theo mốc R-KER-9.
9. Ca bằng chứng T018-6: một lỗi của module điều tra đầu-cuối, không lộ chứng từ.
10. Cập nhật OBSERVABILITY §1 / §6, RUNBOOK, architecture §6–§7 (R-OBS-6).

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Giữ trace tuỳ chọn, làm sau (D018-7 cũ) | Module cộng đồng sẽ ra trước khi có trace. Mỗi module tự log theo kiểu riêng, sau này thêm trace phải sửa từng module |
| Để mỗi module tự import `@opentelemetry/api` và tự tạo span | Tên span, thuộc tính không thống nhất; rủi ro lộ dữ liệu (số tiền, MST) không kiểm được; module có thể quên. Khớp nối của Platform cho kết quả đồng đều, miễn phí cho module |
| Đặt span trong từng hàm của Kernel | Sửa Kernel theo nhu cầu quan sát, mức K1 lặp lại nhiều lần; trái mục tiêu "không sửa Kernel". Cổng `kernel/public.ts` đủ vì mọi lối vào đều qua đó |
| Dùng `auto-instrumentations-node` | Đo mọi thư viện, khó biết cái gì bị gửi đi, tốn hơn; câu SQL có thể lộ |
| Chỉ dùng `requestId` + Loki (không trace) | Không thấy thời gian từng bước, không nối được việc giao sự kiện chạy sau với yêu cầu gốc |
| Jaeger / Zipkin thay Tempo | Tempo hợp Grafana + Loki sẵn có, lưu đĩa local không cần Elasticsearch / Cassandra. Ứng dụng chỉ nói OTLP nên đổi backend không phải sửa mã |
