# PHASE-038 · 10 — Nghiên cứu: chuẩn ghi log lỗi cho Bizcity Core
<!-- [2026-11-21 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — nghiên cứu chuẩn ghi log lỗi (hệ thống, lập trình, tác vụ nền, phụ thuộc ngoài, khởi động, giao diện); đối chiếu OpenTelemetry / Loki / Tempo / Grafana đã có; trần logs/ 200 MB (chủ dự án duyệt D038-2) -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Dành cho:** nhóm Lõi, người viết phân hệ / add-in, người vận hành bản cài. **Đọc trước:** [README](README.md) · [OBSERVABILITY.md](../../ops/OBSERVABILITY.md) · [BIZCITY-ERRORS-v1](../../contracts/BIZCITY-ERRORS-v1.md) · [ADR-0010](../../adr/ADR-0010-opentelemetry-tu-loi.md)
> **Đọc mã:** origin/main 69e0c848 (2026-11-21).

## 0. Kết luận trước

1. **Phần nền đã tốt hơn mức thường gặp.** Repo đã có danh mục mã lỗi, `requestId` / `traceId` trong mọi phản hồi lỗi, log JSON một dòng, số đo theo mã lỗi, trace có lọc thuộc tính, và lấy mẫu đuôi (giữ mọi trace lỗi). Không cần làm lại.
2. **Lỗ hổng nằm ở các chỗ *ngoài yêu cầu HTTP*.** API không khởi động được, tác vụ nền (sự kiện, đồng hồ, outbox), lỗi bị nuốt im lặng, tiến trình chết vì lỗi không bắt, lỗi lập trình ở giao diện. Đây đúng là các lỗi mà người vận hành gặp và không biết hỏi ai (sự cố 503 ngày 2026-11-21).
3. **OpenTelemetry / Loki / Tempo / Grafana có ích, nhưng không thay được tầng tối thiểu.** Bộ giám sát cần 9 container, tổng giới hạn bộ nhớ khoảng 4,5 GB, và phải đang chạy *trước* khi sự cố xảy ra. Vì vậy chuẩn gồm hai tầng. **Tầng 0** luôn có ở mọi bản cài: thư mục `logs/` tối đa 200 MB cùng lệnh `lay-log.sh`. **Tầng 1** là bộ giám sát, cho bản cài đủ tài nguyên. Hai tầng dùng **cùng một khuôn dòng log**, nên chuyển tầng không phải đổi mã.
4. **Việc cần làm gấp ngoài PHASE-038:** Promtail (bộ đẩy log vào Loki của repo) **đã hết hỗ trợ từ 2026-03-02**. Cần chuyển sang Grafana Alloy (§6.4).

## 1. Log lỗi tốt phải trả lời được gì

"Minh bạch, rõ ràng" nghĩa là đọc **một dòng** là trả lời được sáu câu, không phải đoán:

| Câu hỏi | Trường | Ghi chú |
|---|---|---|
| **Cái gì** hỏng | `evt`, `errCode`, `err.type`, `err.message` | `evt` cho máy lọc, `msg` cho người đọc |
| **Ở đâu** | `module`, `fn` (tên hàm / tác vụ), `route`, `err.stack` (trỏ về tệp `.ts`) | stack phải trỏ **mã nguồn**, không phải `dist/*.js` |
| **Khi nào, bản nào** | `time`, `version`, `commit` | không có `commit` thì không biết lỗi của bản nào |
| **Trong việc gì, của ai** | `reqId`, `traceId`, `job`, `attempt`, `tenant`, `actor` | mã nội bộ, không tên người (R-SEC-10) |
| **Vì sao** | `err.cause` (chuỗi nguyên nhân), `err.pgCode`, `reason` | lỗi bọc lỗi phải giữ lỗi gốc |
| **Làm gì tiếp** | `hint` (từ `ERROR_CATALOG`), `errFp` (dấu vân lỗi) | `errFp` gom 1.000 dòng cùng một lỗi thành một việc |

Còn hai yêu cầu nữa. **Không lộ** dữ liệu cá nhân hay bí mật. **Không im lặng**: lỗi nào cũng phải để lại dấu.

## 2. Phân loại lỗi và cách ghi từng loại

Không phải mọi "lỗi" đều là log mức `error`. Lỗi người dùng nhập sai **không phải** lỗi hệ thống. Ghi chúng ở mức `error` sẽ làm nhiễu cảnh báo và che lỗi thật.

| # | Loại | Ví dụ trong repo | Mức | `evt` / trường bắt buộc | Đi đâu | Cảnh báo |
|---|---|---|---|---|---|---|
| L1 | **Nghiệp vụ / người dùng** (4xx, finding) | thiếu định khoản, kỳ đã khoá, trùng mã | `info` | `errCode`, `status`, `reason` | stdout; nhật ký kiểm HT19 (`ghiKiem`) cho lần ghi bị từ chối | không; đo tỷ lệ (`PostingRejectionSpike`) |
| L2 | **Hệ thống / hạ tầng** | mất kết nối CSDL, đĩa đầy, hết bộ nhớ, pool cạn | `error` | `evt: bizcity.system.*`, `err`, `pgCode` | stdout + `logs/api-loi.log` | có (`PostgreSQLDown`, `DbPoolSaturation`, …) |
| L3 | **Lập trình (bug)** | `TypeError`, `undefined`, bất biến vỡ, nhánh "không thể xảy ra" | `error` | `err.type`, `err.stack` có nguồn, `errFp`, `fn` | stdout + tệp | có, theo `errFp` **mới** |
| L4 | **Tác vụ nền / hàm** (không có yêu cầu HTTP) | subscriber, đồng hồ `bizcity.clock.daily`, outbox, chẩn đoán đêm, gom lượt dùng | `error`; hết lượt thử → `error` + `dead` | `job`, `fn`, `attempt`, `eventId`, `traceId` (từ `traceparent` của outbox) | stdout + tệp | `OutboxDeadLetter`, `MetricsCollectorFailing` |
| L5 | **Phụ thuộc ngoài** | VietQR / doanhnghiep.vn, AI đọc hoá đơn, WP SSO | `warn` (có đường lùi); `error` (không lùi được) | `dep`, `ms`, `status`, `retryable` | stdout + tệp | tỷ lệ lỗi theo `dep` |
| L6 | **Khởi động / dừng / nâng cấp** | còn migration chưa áp, `.env` thiếu biến, `db-migrate` hỏng | `fatal` | `evt: bizcity.system.start_failed`, `reason` | **ghi đồng bộ** vào tệp trước khi thoát | `ApiDown` |
| L7 | **Cổng vào** | api chết → nginx 502/503/504 | (nginx) | `upstream`, `status`, `request` | `logs/web-loi.log` | `ApiDown` |
| L8 | **Giao diện (trình duyệt)** | lỗi render React, promise không bắt | `error` (phía máy chủ nhận) | `screen`, `err.type`, `errFp`, `build` | `POST /system/client-errors` → tệp (D038-5) | theo `errFp` mới |

**Quy tắc chọn mức** (thống nhất với pino và OpenTelemetry, §5.1):

| Mức | Dùng khi | Ai phải làm gì |
|---|---|---|
| `fatal` | tiến trình **sắp chết** hoặc không lên được | người vận hành, ngay |
| `error` | một việc **hỏng và không tự hồi phục**; cần người sửa mã hoặc hạ tầng | nhóm Lõi / người viết phân hệ |
| `warn` | hỏng nhưng **đã tự lùi / thử lại được**; hoặc dấu hiệu sắp hỏng | xem khi rảnh, theo dõi xu hướng |
| `info` | việc bình thường, kể cả người dùng nhập sai (L1) | không ai |
| `debug` / `trace` | chỉ khi điều tra, không bật ở bản thật | — |

## 3. Hiện trạng: đã có gì

| Đã có | Ở đâu | Đánh giá |
|---|---|---|
| Danh mục mã lỗi duy nhất: `http`, `retryable`, `owner`, `message`, `hint` | `packages/contracts/src/errors.ts` | Tốt. Là xương sống của "làm gì tiếp" |
| Bộ xử lý lỗi chung; 5xx chỉ trả "Lỗi hệ thống", chi tiết vào log `error` có `err`, `errCode` (R-ERR-4) | `packages/platform/src/core/http.ts:58` | Tốt |
| Lỗi CSDL / trigger sổ ánh xạ cố định (R-ERR-8) | `http.ts` | Tốt. Tránh 500 giả |
| `X-Request-Id` mọi phản hồi; `traceId` vào log; `tenant`, `actor` vào log sau xác thực | `apps/api/src/core/observability.ts` | Tốt |
| Một dòng "xong yêu cầu" có `route`, `status`, `ms`, `errCode`; số đo `bizcity_http_errors_total{code}` | như trên | Tốt |
| Span ở khớp nối Platform / Kernel, `traceparent` qua outbox, lọc thuộc tính theo danh sách cho phép | `packages/platform/src/core/tracing.ts` (ADR-0010) | Tốt. Đúng chuẩn W3C |
| Collector xoá `exception.message`, `exception.stacktrace`, `db.statement`, `url.full` khỏi span | `infrastructure/monitoring/otel-collector/config.yml` | Đúng về riêng tư. **Hệ quả:** stack chỉ còn ở log, nên log phải đáng tin |
| Lấy mẫu đuôi: giữ mọi trace lỗi hoặc chậm > 1 giây | như trên | Tốt |
| Loki giữ 30 ngày, Tempo 7 ngày, Prometheus 15 ngày / 10 GB; 14 cảnh báo; 9 dashboard; Bàn điều tra trong app (PHASE-019) | `infrastructure/monitoring/` | Tốt, nhưng **chỉ khi bật** |
| Nhật ký vận hành JSONL có hàng đợi ghi lần lượt, cắt theo tháng | `packages/platform/src/core/run-log.ts` | Dùng lại được ý tưởng; **không** dùng chính nó cho log lỗi (§7) |

## 4. Lỗ hổng (đọc mã)

| Mã | Lỗ hổng | Bằng chứng | Hậu quả | Loại (§2) |
|---|---|---|---|---|
| G1 | Không có tệp log cố định trên máy chủ | README F4–F5 | sự cố 503: không có gì để gửi về | tất cả |
| G2 | **Không khai `redact` cho pino.** Che dữ liệu nhạy cảm chỉ dựa vào người viết mã tự giác | `apps/api/src/app.ts:80` (`logger: { level }`) | một lần `req.log.info({ body })` là lộ MST, số tài khoản | R-SEC-10 |
| G3 | **Không bắt `uncaughtException` / `unhandledRejection` ở mức tiến trình** | không có `process.on('uncaught…')` trong `apps/`, `packages/` | promise quên `await` / `catch` có thể làm chết tiến trình mà không để lại dòng log có khuôn | L3, L4 |
| G4 | Tác vụ nền ghi `err: String(err)`: **mất stack và nguyên nhân** | `packages/platform/src/core/events.ts:388` | biết "subscriber X lỗi" nhưng không biết lỗi ở dòng nào | L4 |
| G5 | Lỗi khởi động đi qua `console.error`, không có `level`, `time`, `evt` | `apps/api/src/main.ts` (cuối tệp) | không lọc được; lẫn với các dòng khác | L6 |
| G6 | **16 chỗ nuốt lỗi** `.catch(() => undefined)` / `catch {}`, phần lớn không có chú thích lý do | ví dụ `core/actions.ts:616`, `core/libraries/context.ts:136`, `system/diagnostics.ts:327`, `phan-he/kho/phieu-chuyen-kho.ts:249` | lỗi xảy ra mà không ai biết. Có chỗ hợp lý (dọn dẹp lúc dừng), có chỗ che lỗi nghiệp vụ | L3, L4 |
| G7 | Stack trỏ vào `dist/*.js`: tsconfig bật `sourceMap` nhưng Node **không** chạy với `--enable-source-maps` | `tsconfig.base.json:13`; `docker/api-entrypoint.sh` (`node dist/main.js`) | "lỗi ở dòng 4812 của tệp đã dựng" thay vì "ở `phieu-ban.ts:212`" | L3 |
| G8 | Dòng log không có `version` / `commit` | pino mặc định chỉ có `pid`, `hostname` | gửi log về không biết lỗi thuộc bản nào (đúng tình huống "git pull rồi lỗi") | tất cả |
| G9 | Không có dấu vân lỗi (fingerprint) | — | 29 dòng giống nhau trông như 29 lỗi; không biết lỗi nào **mới xuất hiện** sau bản cập nhật | L3, L8 |
| G10 | Giao diện **không có** ErrorBoundary, `window.onerror`, `unhandledrejection` | không thấy trong `apps/web/src` | lỗi lập trình ở màn → màn trắng; máy chủ không biết | L8 |
| G11 | Cổng vào trả thân không phải JSON khi api chết | README F1 | giao diện báo `INTERNAL_ERROR` "không có mã" | L7 |
| G12 | Lỗi bọc lỗi không giữ `cause` | `Errors.*` / `AppError` không có trường `cause` chuẩn | mất lỗi gốc của thư viện / CSDL | L2, L5 |
| G13 | Promtail đã hết hỗ trợ (2026-03-02) nhưng vẫn là đường log → Loki | `docker-compose.monitoring.yml` (`grafana/promtail:3.3.2`) | không còn bản vá bảo mật; tầng 1 dựa vào phần mềm đã ngừng | vận hành |

## 5. Đối chiếu chuẩn ngoài

### 5.1 OpenTelemetry Logs Data Model

OTel định nghĩa một bản ghi log có `Timestamp`, `SeverityNumber` (1–24), `SeverityText`, `Body`, `Attributes`, `Resource` (dịch vụ, phiên bản, môi trường), cùng `TraceId` / `SpanId` để nối với trace. Với lỗi, OTel quy ước thuộc tính `exception.type`, `exception.message`, `exception.stacktrace`.

Ánh xạ mức pino → OTel (pino dùng số, Loki pipeline đã đổi sang tên):

| pino | số pino | OTel SeverityNumber | OTel SeverityText |
|---|---|---|---|
| trace | 10 | 1 | TRACE |
| debug | 20 | 5 | DEBUG |
| info | 30 | 9 | INFO |
| warn | 40 | 13 | WARN |
| error | 50 | 17 | ERROR |
| fatal | 60 | 21 | FATAL |

**Áp dụng cho Bizcity:** giữ tên trường ngắn đã có (`reqId`, `traceId`, `err`), **không** đổi cả repo sang tên OTel. Lý do: Loki / LogQL / dashboard / Bàn điều tra đang dùng tên hiện tại. Thêm một bảng ánh xạ trong OBSERVABILITY. Khi nào gửi log qua OTLP (§6.3) thì bộ chuyển (transport) đổi tên tại chỗ: `err.type` → `exception.type`, `version` → `service.version`.

### 5.2 W3C Trace Context

Đã theo đúng (`traceparent` vào / ra, outbox mang `traceparent`). Việc còn thiếu: tác vụ nền (L4) **phải** gắn `traceId` của sự kiện gốc vào log, để một lỗi subscriber nối được về yêu cầu đã phát sự kiện.

### 5.3 Twelve-Factor App — "log là dòng sự kiện"

Ứng dụng ghi ra stdout, môi trường lo việc gom và lưu. Repo đang làm đúng. **Tệp `logs/` của PHASE-038 không phá nguyên tắc này:** stdout vẫn là đường chính, đầy đủ. Tệp chỉ là **bản sao lọc theo mức** (≥ warn) để bản cài không có bộ gom vẫn giữ được bằng chứng. Mức của stdout và của tệp tách nhau (`LOG_LEVEL`, `LOG_FILE_LEVEL`).

### 5.4 OWASP Logging Cheat Sheet

Những điểm áp vào đây:
- **Không ghi:** mật khẩu, token phiên, khoá API, mã truy cập, dữ liệu cá nhân, số tài khoản ngân hàng, thân yêu cầu nguyên văn. Repo đã có luật (R-SEC-10). Thiếu **lưới an toàn bằng máy** (G2).
- **Chống chèn log (log injection):** JSON một dòng của pino đã mã hoá ký tự xuống dòng. Không ghép chuỗi do người dùng gửi vào `msg`: đưa vào trường riêng.
- **Bảo vệ tệp log:** quyền đọc giới hạn, có trần dung lượng (tránh đầy đĩa làm sập CSDL), xoay vòng.
- **Ghi sự kiện bảo mật** (đăng nhập sai, bị từ chối quyền): đã có ở `audit_logs` / nhật ký kiểm. Log lỗi **không** thay chúng.

### 5.5 Bảo vệ dữ liệu cá nhân (Việt Nam)

Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân coi việc lưu và chuyển dữ liệu cá nhân là xử lý dữ liệu. Gói log gửi ra khỏi máy chủ (`lay-log.sh`) **không được** chứa dữ liệu cá nhân. Ở đây không cần một phân tích pháp lý riêng: chỉ cần giữ nguyên tắc "log không chứa dữ liệu cá nhân" bằng máy (G2) và bằng bộ lọc lúc gom (§7.4). Chứng từ, bằng chứng kế toán nằm ở `audit_logs` (giữ ≥ 10 năm), **không** ở log.

### 5.6 Gom lỗi theo dấu vân (cách Sentry làm, không cần Sentry)

Sentry, Rollbar và các công cụ tương tự gom lỗi theo **fingerprint**: băm của loại lỗi và vài khung stack đầu thuộc mã của mình. Nhờ đó 1.000 lần lặp chỉ là **một vấn đề**, và biết được vấn đề nào **mới xuất hiện ở bản này**. Bizcity làm được việc này tại chỗ, không cần dịch vụ ngoài:

```
errFp = sha1( err.type + "|" + 3 khung stack đầu trong apps/ hoặc packages/ (đường dẫn tương đối, bỏ số cột) ).slice(0, 12)
```

Thêm `errFp` vào mọi dòng `error` / `fatal`. Trong Loki: `sum by (errFp) (count_over_time({service="api"} | json | level="error" [24h]))`. Trong `lay-log.sh`: in bảng "N lỗi khác nhau, mỗi lỗi bao nhiêu lần, lần đầu lúc nào, ở bản nào".

## 6. OpenTelemetry, Grafana, Loki, Tempo, Prometheus giúp được gì

### 6.1 Theo từng loại lỗi

| Loại | Prometheus (số đo) | Tempo (trace) | Loki (log) | Grafana / Bàn điều tra | Khoảng trống |
|---|---|---|---|---|---|
| L1 nghiệp vụ | tỷ lệ từ chối theo mã ✔ | ít cần | ✔ | ✔ dashboard 05 | — |
| L2 hạ tầng | ✔ (`PostgreSQLDown`, `DiskUsage`, `HighMemory`, pool) | ✔ span CSDL chậm / lỗi | ✔ | ✔ dashboard 03, cảnh báo | — |
| L3 lập trình | chỉ đếm 5xx | ✔ biết **bước nào** hỏng; **không** có stack (Collector xoá) | ✔ có stack | ✔ từ trace bấm sang log | thiếu `errFp`, source map (G7, G9) |
| L4 tác vụ nền | `OutboxDeadLetter`, `OutboxBacklog` ✔ | ✔ nếu `traceparent` nối qua outbox | ✔ nhưng **mất stack** (G4) | ✔ dashboard 07 | G4 |
| L5 phụ thuộc ngoài | chưa có số đo theo `dep` | ✔ span undici (gọi HTTP ra ngoài) | ✔ | ✔ | thiếu `dep` |
| L6 khởi động | `ApiDown` ✔ (báo **có** sự cố) | ✘ (chưa có trace lúc khởi động) | ✔ **nếu** bộ gom đang chạy | ✔ | **không có bộ giám sát thì không thấy gì**; cảnh báo chỉ nói "API chết", không nói vì sao |
| L7 cổng vào | gián tiếp | ✘ | ✔ log container `web` | ✔ | G11 |
| L8 giao diện | ✘ | ✘ (trình duyệt không gửi trace; R-OBS-9 cấm trình duyệt gọi Tempo / Loki) | ✘ | ✘ | **trống hoàn toàn** (G10) |

**Đọc bảng:** bộ giám sát **rất mạnh** ở L1–L5 khi đang chạy, nhất là đường *trace → log* (bấm `traceId` mở log cùng yêu cầu), cảnh báo theo mã lỗi, và lấy mẫu đuôi. Nó **không** giúp L8, **không** giúp khi chưa bật, và **không** thay được việc ghi lỗi đúng khuôn: Loki chỉ lưu những gì API ghi ra.

### 6.2 Cái giá của tầng 1

| | Tầng 0 (`logs/`) | Tầng 1 (bộ giám sát) |
|---|---|---|
| Container thêm | 0 | ~9 (Prometheus, Alertmanager, Grafana, Loki, Promtail / Alloy, Tempo, Collector, các exporter) |
| Bộ nhớ | ~0 | tổng giới hạn ~4,5 GB (theo `deploy.resources` trong tệp compose) |
| Đĩa | ≤ 200 MB | Prometheus ≤ 10 GB, Loki 30 ngày, Tempo 7 ngày |
| Có khi API không lên | ✔ (ghi đồng bộ trước khi thoát) | ✔ **chỉ khi** đã bật trước sự cố |
| Gửi về cho người sửa | một tệp `.tar.gz` | phải mở Grafana cho người ngoài, hoặc tự trích |
| Truy vấn, nối trace, cảnh báo | ✘ (đọc tay / `jq`) | ✔ |

**Đề xuất:**
- **Mọi bản cài: tầng 0.**
- **Bản cài có ≥ 8 GB RAM, hoặc máy chủ chạy nhiều công ty: bật tầng 1.**
- **Về sau (ngoài phase):** một bộ giám sát **trung tâm** của BizCity. Mỗi bản cài chỉ chạy một Collector / Alloy mỏng (~128 MB), đẩy log, số đo, trace có lọc qua OTLP về trung tâm. Người sửa thấy lỗi của mọi bản cài mà không cần vào từng máy. Cần ADR riêng: dữ liệu rời máy khách hàng, nên phải có đồng ý và có bộ lọc.

### 6.3 Log qua OTLP thay cho Promtail?

Có hai đường đưa log vào Loki:
- **(a) Hiện tại:** stdout → Docker → Promtail đọc → Loki.
- **(b) OTLP:** pino gửi thẳng qua OTLP (một transport cho pino) tới Collector, rồi tới Loki (Loki 3.x nhận OTLP gốc).

Đường (b) tự gắn `TraceId` / `SpanId` / `Resource` theo chuẩn, và cùng một đường với trace. Nhưng (b) **thêm một điểm hỏng trong tiến trình API**: Collector chết thì log dồn đệm hoặc mất. Nó cũng không bắt được log trước khi SDK khởi tạo, tức đúng loại L6.

**Đề xuất:** giữ đường (a), đổi bộ đọc sang Alloy (§6.4). Chưa dùng (b).

### 6.4 Promtail → Grafana Alloy (việc vận hành, gấp)

Promtail đã **hết hỗ trợ từ 2026-03-02**: không còn bản vá, phát triển chuyển sang Grafana Alloy. Alloy có lệnh chuyển cấu hình (`alloy convert --source-format=promtail`) và chạy tạm được bằng cấu hình Promtail cũ (`--config.format=promtail`). Lưu ý: tên số đo của Alloy khác Promtail, nên cảnh báo / dashboard nào dựa trên số đo Promtail phải sửa.

Alloy cũng nhận được OTLP và thay được Collector. Có thể gộp hai container thành một, nhưng việc gộp cần đo trước, không làm vội. Việc này thuộc PHASE-018 (bộ giám sát), ghi ở đây để không quên: **S038-15**.

## 7. Chuẩn đề xuất cho Bizcity (luật R-LOG)

> Đặt tên **R-LOG** để tách khỏi R-OBS (quan sát chung) và R-ERR (hợp đồng lỗi trả cho bên gọi): R-ERR nói *trả gì ra ngoài*, R-LOG nói *ghi gì vào trong*. Chủ dự án chốt tên riêng (D038-6).

> **Bản chính thức** của bảng dưới nằm ở [RULE-LOG](../../rules/RULE-LOG.md) (chấp nhận 2026-11-21). Bảng này giữ lại bản đề xuất kèm lý do; khác nhau thì theo RULE-LOG.

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| R-LOG-1 (đề xuất) | 0 | Mọi lỗi mức `error` / `fatal` ghi qua **một hàm chung** `logError(log, err, ctx)` của Platform. Hàm này tạo trường `err` chuẩn (`type`, `message`, `stack`, `cause` lồng tối đa 5 lớp, `pgCode`), `errFp`, `evt`. **Cấm** `err: String(err)` và `console.error` trong mã chạy của API | check SC-LOG-1 (quét `String(err)`, `console.error` ngoài `cli/`) |
| R-LOG-2 (đề xuất) | 0 | **Không nuốt lỗi im lặng.** `catch {}` / `.catch(() => undefined)` chỉ được dùng khi có chú thích `// nuot-loi: <lý do>` (dọn dẹp lúc dừng, việc phụ không ảnh hưởng kết quả). Mọi chỗ khác ít nhất ghi `warn` | SC-LOG-2 |
| R-LOG-3 (đề xuất) | 0 | Tiến trình API và job có bộ bắt `uncaughtException` / `unhandledRejection`: ghi `fatal` **đồng bộ** (cả tệp), rồi thoát mã ≠ 0 để Docker khởi động lại. Không "nuốt rồi chạy tiếp" | test |
| R-LOG-4 (đề xuất) | 0 | Pino khai `redact` cho các đường dẫn nhạy cảm (`*.password`, `*.token`, `*.apiKey`, `req.headers.authorization`, `req.headers.cookie`, `*.taxCode`, `*.phone`, `*.bankAccount`, `body`, `payload`, …). Danh sách nằm **một chỗ** trong Platform và dùng chung cho stdout, tệp, gói gửi | test ghi thử từng trường bị che |
| R-LOG-5 (đề xuất) | 1 | Mỗi dòng có `service`, `version`, `commit` (từ `BUILD_VERSION` / `BIZCITY_GIT_SHA`) | test |
| R-LOG-6 (đề xuất) | 1 | Tác vụ nền ghi qua logger con có `job`, `fn`, `attempt` và `traceId` của sự kiện gốc. Hết lượt thử (`dead`) là `error` có `eventId` | test events |
| R-LOG-7 (đề xuất) | 1 | Chọn mức theo bảng §2: lỗi người dùng (4xx) **không** ở mức `error`; lỗi phụ thuộc ngoài đã lùi được là `warn` | review |
| R-LOG-8 (đề xuất) | 1 | Ảnh API chạy Node với `--enable-source-maps` và giữ tệp `.map` trong ảnh. Stack trong log trỏ tệp `.ts` | SC-LOG-3 (Dockerfile) |
| R-LOG-9 (đề xuất) | 1 | Bản cài ghi `logs/` theo §7.3, tổng ≤ 200 MB. Mọi dịch vụ Docker khai `logging:` có trần | SC-OBS-3 |
| R-LOG-10 (đề xuất) | 2 | Giao diện có ErrorBoundary theo màn, `window.onerror`, `unhandledrejection`. Gửi về `POST /api/v1/system/client-errors` (giới hạn nhịp, không dữ liệu người dùng, có `errFp`, `build`, `screen`); máy chủ ghi `logs/web-client.log`. Màn lỗi hiện **mã tra cứu**, không màn trắng | test web (D038-5) |
| R-LOG-11 (đề xuất) | 2 | `msg` là câu tiếng Việt ngắn cho người đọc; `evt` (`bizcity.<miền>.<việc>`) cho máy. Giá trị do người dùng gửi **không** ghép vào `msg` | review |

### 7.1 Khuôn một dòng lỗi (sau PHASE-038)

```json
{"level":50,"time":"2026-11-21T13:02:11.482+07:00","service":"api","version":"0.38.0","commit":"69e0c848",
 "evt":"bizcity.event.subscriber_failed","msg":"Subscriber chẩn đoán đêm lỗi",
 "job":"core.diagnostics-nightly","fn":"diagnosticsNightlySubscriber","attempt":3,"eventId":"ev_8812",
 "traceId":"4bf92f3577b34da6a3ce929d0e0e4736","tenant":"t_12",
 "err":{"type":"TypeError","message":"Cannot read properties of undefined (reading 'period_id')",
        "stack":"TypeError: …\n    at runL3 (packages/platform/src/system/diagnostics.ts:214:31)\n    at …",
        "cause":null},
 "errFp":"a91c03e7f2b4"}
```

**Trước** (`events.ts:388`): `{"level":50,"err":"TypeError: Cannot read properties of undefined (reading 'period_id')","msg":"core.diagnostics-nightly: lỗi"}`. Không có dòng nào trong mã, không biết bản nào, không nối được về đâu.

### 7.2 Dòng khởi động thất bại

```json
{"level":60,"time":"…","service":"api","version":"0.38.0","commit":"69e0c848",
 "evt":"bizcity.system.start_failed","reason":"MIGRATION_PENDING",
 "msg":"Cơ sở dữ liệu chưa nâng cấp: 2 migration chưa áp, mới nhất 0163_…",
 "hint":"Chạy job db-migrate (docker compose up db-migrate) rồi xem logs/db-migrate.log"}
```

Các `reason` của L6: `MIGRATION_PENDING`, `DB_UNREACHABLE`, `DB_AUTH_FAILED`, `ENV_INVALID`, `SEEDS_DIR_MISSING`, `PORT_IN_USE`, `UNKNOWN`. Danh sách nằm trong `ERROR_REASONS` theo R-ERR-11.

### 7.3 Tệp và trần 200 MB (D038-2, chủ dự án duyệt)

Trần **200 MB cho cả thư mục `logs/`**. Mỗi tệp xoay vòng theo dung lượng **hoặc** theo ngày, cái nào đến trước:

| Tệp | Mỗi tệp | Số bản giữ | Tối đa |
|---|---|---|---|
| `api-loi.log` (≥ warn, kể cả `fatal` khởi động) | 20 MB | 5 | 100 MB |
| `web-loi.log` (nginx error + truy cập ≥ 500) | 10 MB | 3 | 30 MB |
| `web-client.log` (L8, nếu duyệt D038-5) | 5 MB | 3 | 15 MB |
| `db-migrate.log` | 5 MB | 3 | 15 MB |
| `goi-bao-loi-*.tar.gz` | — | 3 gói mới nhất | ~40 MB |
| **Cộng** | | | **≤ 200 MB** |

Log stdout của Docker (json-file) nằm ngoài `logs/`. Trần riêng là `max-size: 10m`, `max-file: 3` cho mỗi dịch vụ, tức ≤ 30 MB × 4 dịch vụ. Muốn tính cả phần này vào 200 MB thì hạ `api-loi.log` xuống 15 MB × 4 (D038-2b).

Cách ghi tệp trong API: dùng `pino.multistream` với một đích ghi tệp có xoay vòng, chạy **trong luồng worker** của pino để ghi đĩa không chặn yêu cầu. Riêng `fatal` lúc khởi động / chết thì ghi **đồng bộ** (`fs.appendFileSync`) trước `process.exit`, vì luồng worker có thể chưa kịp ghi.

**Không** dùng `run-log.ts` cho việc này: nó cắt theo tháng và theo đơn vị, không có trần dung lượng, và hàng đợi bất đồng bộ của nó mất dòng khi tiến trình chết.

<!-- [2026-11-21 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1: ngoại lệ hẹp STD-EVD-4 -->
**Quan hệ với STD-EVD-4** (SC-EVD-1: không ghi nhật ký *nghiệp vụ* ra tệp): `packages/platform/src/core/logger.ts` là **ngoại lệ hẹp duy nhất**, như bản niêm phong của ADR-0030. Tệp `logs/` chỉ chứa nhật ký *lỗi kỹ thuật*, không có dữ liệu nghiệp vụ (R-SEC-10), không thay `audit_logs` / bằng chứng. Ghi tệp ở chỗ khác vẫn bị SC-EVD-1 chặn.

### 7.4 Gói gửi về (`lay-log.sh`), bổ sung so với README §4.4

- Đầu gói có **bảng tóm tắt** `TOM-TAT.txt`: commit đang chạy, trạng thái container, `health/ready`, và *N lỗi khác nhau theo `errFp`* (số lần, lần đầu, lần cuối, `evt`, một dòng `msg`). Người sửa / trợ lý AI đọc tệp này trước.
- Lọc lần hai trước khi nén: quét mẫu email, số điện thoại, MST, số tài khoản; gặp thì che và ghi số chỗ đã che vào tóm tắt.
- Không bao giờ chép `.env`, chỉ tên biến.

## 8. Việc thêm vào checklist

Thêm vào [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md): S038-11 … S038-15. Thứ tự đề xuất, vẫn theo nguyên tắc mỗi bước một PR người dùng dùng được:
- **B1** (đã có). Thêm R-LOG-3, R-LOG-5, R-LOG-8: rẻ, và giải trực tiếp sự cố hôm nay.
- **B1b** `logError` + `errFp` + `redact` + sửa `events.ts` (G2, G4, G9, G12).
- **B2–B3** (đã có): cổng vào, `lay-log.sh` có `TOM-TAT.txt`.
- **B4** (đã có): giao diện. Thêm **B4b** ErrorBoundary + `client-errors` nếu duyệt D038-5.
- **B5**: luật R-LOG, SC-LOG-1..3, rà 16 chỗ nuốt lỗi.
- **S038-15**: Promtail → Alloy, chuyển cho chủ PHASE-018.

## 9. Quyết định thêm (chốt 2026-11-21) <!-- [2026-11-21 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — chốt W0: chủ dự án đồng ý mọi đề xuất D038-1..6, D038-2b -->

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| D038-5 | Thu lỗi giao diện (L8) về máy chủ? | ✅ **Có**, ở B4b: chỉ loại lỗi, khung stack, màn, bản dựng, `errFp`; không dữ liệu nhập; tối đa 10 lỗi / phút / phiên |
| D038-6 | Luật tên R-LOG riêng hay gộp vào nhóm R-OBS? | ✅ R-LOG riêng (R-ERR = ra ngoài, R-LOG = vào trong) |
| D038-2b | 200 MB tính cả log json-file của Docker? | ✅ Không. `logs/` ≤ 200 MB; Docker ≤ 30 MB / dịch vụ, ghi riêng |

## 10. Nguồn

- OpenTelemetry — Logs Data Model; Semantic Conventions cho exception: https://opentelemetry.io/docs/specs/otel/logs/data-model/ · https://opentelemetry.io/docs/specs/semconv/exceptions/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- The Twelve-Factor App — XI. Logs: https://12factor.net/logs
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Grafana Loki — Promtail (hết hỗ trợ 2026-03-02): https://grafana.com/docs/loki/latest/send-data/promtail/
- Grafana Alloy — chuyển từ Promtail: https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/
- pino — redaction, multistream, transports: https://getpino.io/
- Node.js — `--enable-source-maps`: https://nodejs.org/api/cli.html#--enable-source-maps
- Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
