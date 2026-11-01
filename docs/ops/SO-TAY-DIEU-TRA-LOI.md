# Sổ tay điều tra lỗi cho nhà phát triển
<!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — Bàn điều tra cho nhà phát triển: sổ tay điều tra lỗi theo tình huống + thiết kế UI/UX dev trên Prometheus, Loki, Tempo, Grafana, Alertmanager -->

> **Dành cho:** người đóng góp viết phân hệ / giao diện / add-in (vd Nguyễn Văn Thủy) và Nhóm Lõi khi trực.
> **Đọc trước:** [OBSERVABILITY.md](OBSERVABILITY.md) (bốn nguồn, hai khoá nối) · **Cảnh báo:** [RUNBOOK-CANH-BAO.md](RUNBOOK-CANH-BAO.md) · **Bộ giám sát:** [`infrastructure/monitoring/`](../../infrastructure/monitoring/README.md) · **Đưa vào app:** [PHASE-019](../phases/PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/README.md)
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

Sổ tay này trả lời một câu: **có lỗi thì bắt đầu nhìn ở đâu, gõ gì, đọc kết quả thế nào, sửa ở đâu**. Mỗi tình huống (TH) đi theo cùng một khuôn. Truy vấn trong sổ tay đã chạy được trên bộ giám sát của repo; chép nguyên văn rồi thay phần trong `<…>`.

## 0. Trước khi bắt đầu

### 0.1 Bật bộ giám sát (máy dev)

```powershell
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml -f infrastructure/monitoring/docker-compose.desktop.yml up -d --build
```

- Tệp `docker-compose.desktop.yml` chỉ dùng trên Docker Desktop (Windows / macOS). Máy chủ Linux bỏ tệp đó.
- PowerShell không hiểu `\` cuối dòng: viết lệnh trên một dòng, hoặc dùng dấu `` ` ``.
- Máy dev nên đặt `TRACE_SAMPLE_PERCENT=100` trong `.env` để giữ mọi trace (mặc định 10%: chỉ giữ chắc trace lỗi hoặc chậm > 1 giây).

| Công cụ | Mở ở | Dùng để |
|---|---|---|
| Grafana | http://127.0.0.1:3000 (`admin` / `GRAFANA_ADMIN_PASSWORD` trong `.env`) | mọi thứ bên dưới — xem qua **Explore** và 9 dashboard thư mục **Bizcity** |
| Prometheus | http://127.0.0.1:9090 | thử nhanh PromQL, xem mục tiêu thu (`Status → Targets`) |
| Alertmanager | http://127.0.0.1:9093 | cảnh báo đang bắn, tắt tạm (silence) khi bảo trì |
| Loki, Tempo, OTel Collector | chỉ trong mạng Docker | không mở trực tiếp; xem qua Grafana |

### 0.2 Bốn nguồn, hai khoá nối

| Câu hỏi | Nguồn | Trong Grafana | Khoá nối |
|---|---|---|---|
| Hệ thống có khoẻ không, chậm ở đâu? | số đo | Prometheus (PromQL) · dashboard 01–09 | `route`, `code` |
| Yêu cầu này đi qua đâu, hỏng ở bước nào, module nào? | trace | Tempo (TraceQL) | `traceId`, `bizcity.module` |
| Yêu cầu này đã chạy thế nào, lỗi gì? | log | Loki (LogQL) | `reqId`, `traceId` |
| Ai đã làm gì với sổ? | bằng chứng `audit_logs` | không có trong Grafana — `GET /api/v1/evidence/:id` (theo mã biên nhận) hoặc `psql` trên CSDL dev: `SELECT id, action, object_type, object_id, created_at FROM audit_logs WHERE trace_id = '<traceId>'` | `request_id`, `trace_id` |

**Hai khoá nối có trong mọi phản hồi lỗi:** `error.requestId` và `error.traceId`. Có một trong hai là đi được tới ba nguồn còn lại. Người dùng báo lỗi chỉ cần gửi hai mã này, không cần chụp dữ liệu.

### 0.3 Ba câu hỏi đầu tiên — trước khi mở bất cứ thứ gì

1. **Lỗi của một người hay của mọi người?** Một người → bắt đầu từ mã của họ (TH-01). Nhiều người → bắt đầu từ số đo (TH-02, TH-03).
2. **Bị từ chối đúng luật hay lỗi kỹ thuật?** Xem `bizcity.outcome` của span, hoặc mã lỗi:

   | Loại | Mã lỗi (`bizcity_errors@1`) | Ý nghĩa | Ai sửa |
   |---|---|---|---|
   | `rejected` — từ chối đúng luật | `VALIDATION_ERROR`, `NOT_FOUND`, `IDEMPOTENCY_CONFLICT` (input) · `UNAUTHORIZED`, `FORBIDDEN` (auth) · `CONFLICT` (state) · `PERIOD_LOCKED`, `POSTING_FAILED`, `UNBALANCED_ENTRY` (ledger) | hệ thống làm **đúng**: chặn dữ liệu sai, kỳ đã khoá, chứng từ đã chi… | thường là người dùng / dữ liệu / giao diện gửi sai — **không** phải sự cố |
   | `error` — lỗi kỹ thuật | `INTERNAL_ERROR` (server) · `CAPABILITY_MISSING`, `MODULE_DISABLED`, `RATE_LIMITED`, `NOT_READY` (platform) · mã lạ | code hoặc hạ tầng hỏng | dev |

3. **Kernel có bị gọi không?** Trace không có span `kernel …` → lỗi dừng **trước** sổ, sổ không đổi. Có span `kernel …` với `outcome=error` → xem TH-10 trước khi làm gì khác.

### 0.4 Ba ngôn ngữ truy vấn — đủ dùng

**PromQL** (số đo; Explore → Prometheus):

| Muốn | Truy vấn |
|---|---|
| Tỉ lệ lỗi 5xx | `sum(rate(bizcity_http_requests_total{job="api", status=~"5.."}[5m])) / sum(rate(bizcity_http_requests_total{job="api"}[5m]))` |
| Lỗi theo mã | `sum by (code) (increase(bizcity_http_errors_total[1h]))` |
| p95 theo route | `histogram_quantile(0.95, sum by (le, route) (rate(bizcity_http_request_duration_seconds_bucket{job="api"}[5m])))` |
| Action lỗi | `sum by (action, code) (increase(bizcity_actions_total{result!="ok"}[1h]))` |
| Ghi sổ từ chối / lỗi | `sum by (code, kind) (increase(bizcity_posting_failures_total[1h]))` |

**LogQL** (log; Explore → Loki). Nhãn có sẵn: `service`, `level`, `tenant`, `errCode`, `evt`. `reqId`, `traceId` là **siêu dữ liệu** (lọc sau dấu `|`), không phải nhãn:

| Muốn | Truy vấn |
|---|---|
| Lỗi của API | `{service="api", level="error"}` |
| Một yêu cầu | `{service="api"} \| reqId="<req-…>"` |
| Một trace | `{service="api"} \| traceId="<32 hex>"` |
| Một mã lỗi | `{service="api", errCode="PERIOD_LOCKED"}` |
| Một đơn vị | `{service="api", tenant="<mã nội bộ>"}` — bản cài nhiều đơn vị có thể đã bỏ nhãn này (`LOKI_LABELDROP=tenant`): dùng `{service="api"} \| json \| tenant="<mã>"` |
| Yêu cầu chậm | `{service="api"} \| json \| ms > 1000` |
| Đếm lỗi theo mã | `sum by (errCode) (count_over_time({service="api", errCode=~".+"}[1h]))` |

**TraceQL** (trace; Explore → Tempo → tab **TraceQL**). Ô TraceQL **không** nhận mã trace trần — tra một mã thì dùng **Import trace** hoặc tab **Search** → ô Trace ID:

| Muốn | Truy vấn |
|---|---|
| Mọi trace gần đây | `{ }` |
| Lỗi kỹ thuật | `{ span.bizcity.outcome = "error" }` |
| Lỗi của một module | `{ span.bizcity.module = "<module>" && span.bizcity.outcome = "error" }` |
| Bị từ chối ở Kernel | `{ span.bizcity.layer = "K" && span.bizcity.outcome = "rejected" }` |
| Chậm hơn 1 giây | `{ duration > 1s }` |
| Một action | `{ span.bizcity.action.id = "<quy.payment-request.pay>" }` |
| Một đơn vị | `{ span.bizcity.tenant = "<mã nội bộ>" }` |
| Đụng một bảng | `{ span.db.collection.name = "<ledger_entries>" }` |
| Giao sự kiện hỏng | `{ span.bizcity.delivery.result =~ "dead\|retry" }` |

**Nhảy giữa các nguồn** (đã cấu hình sẵn): trong Loki, dòng log có `traceId` → nút **Tempo** mở trace; trong Tempo, bấm một span → nút sang log cùng trace (Loki) và link **Độ trễ p95 của route** (Prometheus).

## 1. Khuôn mỗi tình huống

| Phần | Nội dung |
|---|---|
| **Triệu chứng** | thấy gì |
| **Bắt đầu ở** | công cụ + truy vấn đầu tiên |
| **Các bước** | làm theo thứ tự, mỗi bước một truy vấn |
| **Đọc kết quả** | dấu hiệu nào nói lên điều gì |
| **Hay gặp** | nguyên nhân thường thấy trong repo này |
| **Sửa ở đâu** | tệp / tầng đúng; **không được làm** gì |
| **Trên Bàn điều tra** | màn tương ứng khi PHASE-019 xong (chưa có thì để trống) |

Mọi tình huống kết thúc giống nhau: **viết test tái hiện trước khi sửa** (§4).

## 2. Các tình huống

### TH-01 · Người dùng báo lỗi, có mã trong thông báo

- **Triệu chứng:** người dùng gửi ảnh / tin nhắn có `requestId` (`req-…`) hoặc `traceId` (32 ký tự hex).
- **Người dùng lấy mã ở đâu** (PHASE-019 W1): mọi lỗi API hiện khay **Mã tra cứu** ở góc dưới trái màn hình. Nút **Chép** chép `requestId`, `traceId`, thời điểm, màn; nút **Báo lỗi** chép sẵn nội dung theo mẫu `bao-loi.yml` (chỉ mã, không dữ liệu). Ảnh chụp khay chỉ có mã rút gọn — xin người dùng bấm **Chép** rồi dán. <!-- [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W1: khay Mã tra cứu: chỗ người dùng lấy mã. -->
- **Bắt đầu ở:** Tempo → **Search** → ô **Trace ID** → dán `traceId`. Chỉ có `requestId`: Loki `{service="api"} | reqId="<req-…>"` → mở dòng log → bấm **Tempo** bên cạnh `traceId`.
- **Các bước:**
  1. Đọc span gốc `HTTP <method> <route>`: mã trạng thái, `bizcity.error.code`, `bizcity.outcome`.
  2. Đi xuống cây span, tìm span **đầu tiên** có `outcome` khác `ok` — đó là chỗ hỏng. Đọc `bizcity.module`, `bizcity.action.id`, `bizcity.step`.
  3. Có span `kernel …` không? Không → sổ không đổi. Có → đọc `bizcity.kernel.op`, `bizcity.doc_type`.
  4. Bấm span → nút sang log (Loki) để xem log cùng trace (5xx có `err.stack`).
  5. Thao tác ghi: tra bằng chứng theo `trace_id` (`audit_logs.trace_id`, câu `psql` ở §0.2) để biết đã ghi gì.
- **Đọc kết quả:**

  | Thấy | Kết luận |
  |---|---|
  | `outcome=rejected`, không có span `kernel` | dữ liệu / trạng thái sai, bị chặn trước sổ — xem mã lỗi, sửa giao diện hoặc hướng dẫn người dùng |
  | `outcome=rejected` ở span `kernel` | Kernel từ chối đúng luật (kỳ khoá, không cân…) — TH-04 |
  | `outcome=error` ở span `step <module>.…` hoặc `action <module>.…` | lỗi trong code module — sửa ở `apps/api/src/phan-he/<module>/` |
  | `outcome=error` ở span `db …` | lỗi CSDL (ràng buộc, trigger, thiếu cột) — đọc `err` trong log |
  | `outcome=error` ở span gọi ra ngoài (`GET`/`POST` client) | dịch vụ ngoài hỏng — TH-09 |
  | không tìm thấy trace | trace bị bỏ do lấy mẫu, quá 7 ngày, hoặc bộ giám sát tắt — dùng `requestId` trong Loki (giữ 30 ngày) |

- **Trên Bàn điều tra:** màn **Tra mã** (dán mã → cây span + tóm tắt "chuyện gì đã xảy ra").

### TH-02 · Lỗi 5xx tăng (cảnh báo `HighErrorRate`)

- **Triệu chứng:** cảnh báo `HighErrorRate`, nhiều người cùng báo "Có lỗi xảy ra".
- **Bắt đầu ở:** dashboard **02 — API theo route** → panel lỗi theo route.
- **Các bước:**
  1. Route nào: `sum by (route, status) (increase(bizcity_http_requests_total{job="api", status=~"5.."}[15m]))`.
  2. Từ khi nào — trùng lúc đổi bản? Dashboard 01 có chú thích mỗi lần `bizcity_build_info` đổi.
  3. Trace mẫu: `{ span.http.route = "<route>" && span.bizcity.outcome = "error" }` → mở 2–3 trace, so chỗ hỏng có giống nhau không.
  4. Log: `{service="api", level="error"} | json | route="<route>"` → đọc `err.type`, `err.message`, dòng đầu của `err.stack`.
- **Hay gặp:** migration chưa áp (`/api/v1/system/health/ready` trả `MIGRATIONS_PENDING`); đổi khuôn hợp đồng mà quên build `@ketoan/contracts`; truy cập thuộc tính của `undefined` trong module; CSDL hết kết nối (TH-08).
- **Sửa ở đâu:** code của route / module. Lỗi đến từ bản vừa phát hành → lùi bản theo [RELEASE.md](RELEASE.md), sửa sau.
- **Trên Bàn điều tra:** **Tổng quan** (ô "lỗi kỹ thuật 24 giờ") → **Lỗi theo module**.

### TH-03 · Chậm (cảnh báo `HighLatency`, người dùng kêu "quay mãi")

- **Bắt đầu ở:** dashboard **02** → p95 theo route; hoặc TraceQL `{ duration > 1s }`.
- **Các bước:**
  1. Route chậm: PromQL p95 theo route (§0.4).
  2. Mở một trace chậm. Trong cây span, tìm span **tự nó** chiếm nhiều thời gian nhất (không tính con).
  3. Nhiều span `db select <bảng>` nối nhau, mỗi cái nhanh → vòng lặp gọi CSDL (N+1). Một span `db` dài → truy vấn thiếu chỉ mục hoặc quét bảng lớn.
  4. Span gọi ra ngoài dài → TH-09.
  5. CSDL: dashboard **03 — CSDL PostgreSQL** (truy vấn chậm, khoá, bão hoà pool).
- **Hay gặp:** N+1 trong báo cáo / danh sách; thiếu chỉ mục theo `tenant_id` + ngày; báo cáo chạy cả năm không giới hạn kỳ (504).
- **Sửa ở đâu:** gom truy vấn (một câu `IN (…)` thay vòng lặp); chỉ mục mới = migration **chỉ thêm** có ước tính thời gian (R-DB-13). **Không** cache số liệu sổ mà không có luật vô hiệu (R-CACHE-1).

### TH-04 · Ghi sổ bị từ chối (`PERIOD_LOCKED`, `UNBALANCED_ENTRY`, `POSTING_FAILED`)

- **Triệu chứng:** lưu chứng từ báo "kỳ đã khoá", "không cân", "thiếu tài khoản…"; cảnh báo `PostingRejectionSpike` (gửi kế toán, không gọi trực).
- **Bắt đầu ở:** dashboard **09 — Toàn vẹn sổ** → từ chối theo mã; hoặc PromQL `sum by (code) (increase(bizcity_posting_failures_total{kind="rejected"}[1h]))`.
- **Các bước:**
  1. Mã nào tăng, loại chứng từ nào: `sum by (doc_type, action) (increase(bizcity_postings_total[1h]))`.
  2. Trace: `{ span.bizcity.layer = "K" && span.bizcity.outcome = "rejected" }` → đọc `bizcity.doc_type`, `bizcity.error.code`.
  3. Nhật ký định khoản của chứng từ trong app (màn chứng từ → **Nhật ký định khoản**, ACC14) — có danh sách chỗ thiếu.
- **Đọc kết quả:** đây là hệ thống **làm đúng**. Việc của dev là tìm vì sao dữ liệu sai đi tới được Kernel:

  | Mã | Thường do |
  |---|---|
  | `PERIOD_LOCKED` | giao diện cho chọn ngày trong kỳ đã khoá; import dữ liệu cũ |
  | `UNBALANCED_ENTRY` | module tự tính dòng Nợ / Có, làm tròn lệch (không qua `toCents`) |
  | `POSTING_FAILED` | thiếu tài khoản ngầm định / nhóm hạch toán / lý do (`reasonCode`) cho loại chứng từ |

- **Sửa ở đâu:** kiểm sớm ở giao diện / module (báo trước khi gửi); thiếu cấu hình → hướng dẫn người dùng khai. **Không được:** mở khoá kỳ, tắt trigger, sửa `ledger_*`, viết số tài khoản trong code (bốn câu không thương lượng, AGENTS.md).

### TH-05 · Chứng từ treo, không vào sổ (cảnh báo `PostingBacklog`)

- **Triệu chứng:** chứng từ ở trạng thái chờ / lỗi lâu; cảnh báo `PostingBacklog`.
- **Bắt đầu ở:** dashboard **04 — Sổ cái & sự việc** → `bizcity_ledger_events{status}` và `bizcity_ledger_events_oldest_pending_seconds`.
- **Các bước:**
  1. Trạng thái nào: `bizcity_ledger_events{job="api"}` (pending / error).
  2. Trong app: màn chứng từ lọc trạng thái lỗi → **Nhật ký định khoản** từng chứng từ (lý do lỗi + chỗ thiếu).
  3. Log: `{service="api", evt="bizcity.posting.failed"}` → đọc `code`, `docType`, `docKey`.
  4. Tự chẩn đoán: `GET /api/v1/system/diagnostics` → kiểm `EVENT_PENDING_AGE`.
- **Hay gặp:** nguồn gửi (connector, Cell) gửi chứng từ thiếu danh mục (mặt hàng / đối tượng chưa có); thiếu cấu hình định khoản cho loại chứng từ mới.
- **Sửa ở đâu:** bổ sung danh mục / cấu hình rồi **định khoản lại** từ app. **Không** sửa tay trạng thái trong `accounting_events`.

### TH-06 · Sự kiện không tới nơi nhận (cảnh báo `OutboxDeadLetter`, `OutboxBacklog`)

- **Triệu chứng:** module nhận sự kiện (CRM, VAT…) không cập nhật; cảnh báo outbox.
- **Bắt đầu ở:** dashboard **07 — Đường sự kiện**.
- **Các bước:**
  1. Nơi nhận nào lỗi: `sum by (consumer, result) (increase(bizcity_outbox_attempts_total[1h]))`.
  2. Trace giao: `{ span.bizcity.delivery.result =~ "dead|retry" }` → span `event deliver <type> → <consumer>`, đọc `bizcity.delivery.attempt`.
  3. Trace giao là **trace mới**, có **link** về span `event publish` của yêu cầu gốc: bấm link để xem chứng từ nào phát ra sự kiện.
  4. API: `GET /api/v1/system/events` (đang chờ / xong / chết theo nơi nhận, việc chờ lâu nhất).
- **Hay gặp:** subscriber ném lỗi với dữ liệu lạ; subscriber không chịu được giao lại (STD-EVT-2) nên lỗi khi thử lại; gọi ra ngoài trong subscriber bị chậm.
- **Sửa ở đâu:** code subscriber của module. Sửa xong → phát lại cho đúng nơi nhận: `POST /api/v1/system/events/replay` (quyền `settings:write`, có bằng chứng ai phát lại). **Không** phát lại hàng loạt mọi nơi nhận.

### TH-07 · Gửi lặp, `IDEMPOTENCY_CONFLICT`

- **Triệu chứng:** bên tích hợp nhận 409 `IDEMPOTENCY_CONFLICT`; hoặc lo bị ghi trùng.
- **Bắt đầu ở:** PromQL `sum by (result) (increase(bizcity_idempotency_requests_total[1h]))` (new · replayed · conflict).
- **Đọc kết quả:** `replayed` = gửi lại cùng khoá, cùng nội dung → hệ thống trả lại kết quả cũ, **không** ghi lần hai (đúng). `conflict` = cùng `Idempotency-Key` nhưng nội dung khác → bên gọi dùng lại khoá cho yêu cầu mới.
- **Trace:** span `action …` có `bizcity.idempotency=replayed`.
- **Sửa ở đâu:** phía bên gọi — mỗi thao tác mới một khoá mới. Trong code của mình: nút "Lưu" phải sinh khoá một lần cho một lần bấm, không sinh lại khi thử lại.

### TH-08 · Hết kết nối CSDL (cảnh báo `DbPoolSaturation`)

- **Bắt đầu ở:** dashboard **03** → bão hoà pool: `bizcity_db_pool_connections{state="total"} / bizcity_db_pool_max`, `bizcity_db_pool_connections{state="waiting"}`.
- **Các bước:** trace chậm cùng lúc (`{ duration > 1s }`) → span nào giữ kết nối lâu; gọi ra ngoài **trong** giao dịch là nghi phạm số một.
- **Sửa ở đâu:** đưa gọi ra ngoài ra khỏi giao dịch; giao dịch ngắn. **Không** chỉ tăng trần pool để che.

### TH-09 · Gọi ra ngoài lỗi / chậm (Hub, Cell, tra MST, AI đọc hoá đơn)

- **Bắt đầu ở:** TraceQL `{ span.server.address != nil && span.bizcity.outcome = "error" }` hoặc `{ span.server.address = "<máy>" && duration > 2s }`.
- **Đọc kết quả:** span client có `server.address`, `http.response.status_code`. Bên kia cũng chạy OpenTelemetry (Cell, plugin) thì trace nối tiếp sang bên đó (cùng `traceId`, nhờ `traceparent` tự chuyển tiếp).
- **Sửa ở đâu:** đặt thời hạn chờ, thử lại có giới hạn; không chặn đường ghi sổ chờ dịch vụ ngoài.

### TH-10 · Tự chẩn đoán báo sổ lỗi (cảnh báo `LedgerIntegrityError`) — `sev1`

- **Triệu chứng:** cảnh báo critical `LedgerIntegrityError`; dashboard **09** đỏ.
- **Làm ngay:** đọc [RUNBOOK-CANH-BAO § LedgerIntegrityError](RUNBOOK-CANH-BAO.md). Báo Nhóm Lõi. Đây là `sev1`.
- **Các bước:** `GET /api/v1/system/diagnostics` → mã kiểm nào `error`, `sample` (chỉ khoá chứng từ / số bút toán) → tra trace / bằng chứng của các chứng từ đó theo thời điểm.
- **Không được làm:** tự đảo bút toán, mở khoá kỳ, xoá / sửa `ledger_*`, tắt trigger, chạy script "làm sạch" (R-REV-11). Sửa sổ chỉ bằng bút toán đảo có người duyệt (R-KER-4).

### TH-11 · Module cộng đồng mới gây lỗi

- **Triệu chứng:** sau khi bật một phân hệ / add-in mới, lỗi tăng ở chỗ tưởng không liên quan.
- **Bắt đầu ở:** TraceQL `{ span.bizcity.module = "<module>" && span.bizcity.outcome = "error" }`; số đo `sum by (action, code) (increase(bizcity_actions_total{result!="ok"}[1h]))`.
- **Các bước:**
  1. Lỗi nằm ở span của module hay ở span `kernel` / `event deliver` do module kích hoạt?
  2. Module chia bước bằng `ctx.trace.step('<tên>', fn)` thì span `step <module>.<tên>` chỉ thẳng bước hỏng.
  3. Module là subscriber → TH-06.
- **Sửa ở đâu:** trong thư mục của module. **Không** vá Kernel trong PR phân hệ; thiếu năng lực Core → đề xuất bậc 4 (AGENTS.md "bậc thang mở rộng").
- **Gợi ý cho người viết module:** bọc các bước dài (tính thuế, phân bổ, gọi ngoài) bằng `ctx.trace.step` — tên theo khuôn `chu-thuong.co-gach` ([module-sdk API](../../packages/module-sdk/API.md)). Không tự import `@opentelemetry/*` (SC-OBS-2 chặn).

### TH-12 · AI / MCP gọi công cụ lỗi

- **Bắt đầu ở:** PromQL `sum by (tool, result) (increase(bizcity_mcp_tool_calls_total[1h]))`; TraceQL `{ span.bizcity.mcp.tool = "<tool>" }`.
- **Đọc kết quả:** span `mcp tools/call <tool>` có `bizcity.mcp.phase` (read · preview · confirm). Lỗi ở `confirm` mà không có span `kernel` → chưa ghi gì.
- **Sửa ở đâu:** action của công cụ; mô tả đầu vào (Zod) chưa đủ chặt khiến AI gửi sai.

### TH-13 · Grafana báo "No data" / số đo đứng yên (cảnh báo `MetricsCollectorFailing`)

- **Các bước:**
  1. Prometheus → `Status → Targets`: job `api` có `UP` không.
  2. `increase(bizcity_collector_errors_total[15m])` theo `collector` → bộ thu nào lỗi.
  3. Log: `{service="api"} |= "collector"`.
- **Đọc kết quả:** "không có dữ liệu" **khác** 0. Ví dụ chưa từng chạy tự chẩn đoán thì `bizcity_diagnostics_last_run_timestamp_seconds` **không có** (không phải 1970).

### TH-14 · Không thấy trace / log (công cụ điều tra tự hỏng)

| Thấy | Làm |
|---|---|
| Không có nguồn **Tempo** trong Explore | Grafana chỉ đọc nguồn lúc khởi động: `docker compose … up -d --force-recreate grafana` |
| Tempo trả rỗng ngay sau khi thao tác | chờ 10–20 giây (Collector gom rồi mới gửi) |
| Trace thường (không lỗi, không chậm) không có | lấy mẫu 10% — máy dev đặt `TRACE_SAMPLE_PERCENT=100` rồi `up -d otel-collector` |
| Dán mã trace vào ô TraceQL báo lỗi cú pháp | ô TraceQL chỉ nhận truy vấn; dùng **Import trace** hoặc **Search → Trace ID** |
| Phản hồi lỗi không có `traceId` | API chạy với `OTEL_SDK_DISABLED=true`, hoặc yêu cầu vào `/metrics` / health (không truy vết) |
| Log không có nhãn `tenant` | bản cài đặt `LOKI_LABELDROP=tenant` — lọc bằng `\| json \| tenant="<mã>"` |
| `docker compose …` trên PowerShell báo `-f is not recognized` | lệnh bị cắt ở `\`; viết trên một dòng |

## 3. Luật an toàn khi điều tra

- **Chỉ đọc.** Công cụ quan sát không bao giờ là lý do để sửa dữ liệu kế toán. Mọi sửa sổ đi bút toán đảo có người duyệt.
- **Không chép dữ liệu thật ra ngoài:** không dán payload, tên khách, MST, số tiền vào issue / chat / PR (repo công khai — R-SEC-10). Gửi **mã** (`requestId`, `traceId`, `docKey`), không gửi nội dung.
- **Trace, log, số đo không bao giờ được đọc ngược vào định khoản / khoá kỳ / quyền** (R-OBS-8).
- Grafana là công cụ của **vận hành**, nhìn được mọi đơn vị. Người dùng đơn vị không vào Grafana; dev của một đơn vị dùng Bàn điều tra trong app (PHASE-019), chỉ thấy đơn vị mình.

## 4. Khép một lỗi

1. **Test tái hiện trước khi sửa** (R-QG): test đỏ với đúng mã lỗi / đúng chỗ hỏng; sửa; test xanh.
2. Lỗi lặp lại hoặc lọt công cụ → đề xuất luật dò `H-*` / check `SC-*` / `DG-*` (R-REV-10).
3. Báo lỗi theo mẫu [`.github/ISSUE_TEMPLATE/bao-loi.yml`](../../.github/ISSUE_TEMPLATE/bao-loi.yml): phiên bản (`GET /api/v1/system/health`), `requestId`, `traceId`, mã lỗi, biên nhận nếu là thao tác ghi, tóm tắt tự chẩn đoán.
4. Ghi CHANGELOG mục "Sửa".
