# Bộ giám sát (tuỳ chọn) — Prometheus · Alertmanager · Grafana · Loki
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — 9 bảng điều khiển (07 Đường sự kiện, 08 Đa đơn vị, 09 Toàn vẹn sổ), 14 luật + alerts.test.yml, mật khẩu Grafana bắt buộc, runbook. -->

Bộ giám sát **không bắt buộc**: hệ thống kế toán chạy bình thường khi không bật. Bật lên khi cần theo dõi
sức khoẻ API, CSDL, hàng đợi ghi sổ và nhật ký trên một máy chủ thật.

Mọi tệp của bộ này nằm trong `infrastructure/monitoring/`. Không có Redis, không có NATS — dự án dùng bảng
outbox trong PostgreSQL, nên giám sát tập trung vào **sổ cái và hàng đợi sự việc kế toán**.

## 1. Thành phần

| Dịch vụ | Ảnh (image) | Việc | Cổng |
|---|---|---|---|
| `prometheus` | `prom/prometheus:v2.53.4` (LTS) | Thu và lưu chỉ số 15 ngày, tính luật cảnh báo | 127.0.0.1:9090 |
| `alertmanager` | `prom/alertmanager:v0.27.0` | Gom, lọc trùng, gửi cảnh báo đi (webhook, email, Telegram…) | 127.0.0.1:9093 |
| `grafana` | `grafana/grafana:11.4.0` | 9 bảng điều khiển (thư mục **Bizcity**) | 127.0.0.1:3000 |
| `loki` | `grafana/loki:3.3.2` | Lưu nhật ký 30 ngày | chỉ trong mạng Docker |
| `promtail` | `grafana/promtail:3.3.2` | Đọc nhật ký container của dự án `ketoan` → Loki | — |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.16.0` | Chỉ số PostgreSQL (`pg_up`, kết nối, dung lượng…) | — |
| `node-exporter` | `prom/node-exporter:v1.8.2` | CPU, RAM, ổ đĩa của máy chủ | — |
| `cadvisor` | `gcr.io/cadvisor/cadvisor:v0.49.1` | RAM / CPU từng container | — |

Cấu trúc thư mục:

```
infrastructure/monitoring/
├── docker-compose.monitoring.yml      tệp ghép với docker-compose.yml ở gốc
├── prometheus/prometheus.yml          job thu chỉ số
├── prometheus/alerts.yml              14 luật cảnh báo (runbook: docs/ops/RUNBOOK-CANH-BAO.md)
├── prometheus/alerts.test.yml         test bắn / hết bắn (promtool test rules)
├── alertmanager/alertmanager.yml      định tuyến cảnh báo, ví dụ kênh nhận
├── loki/loki-config.yml               Loki một tiến trình, lưu đĩa, giữ 30 ngày
├── promtail/promtail-config.yml       đọc nhật ký Docker, tách JSON của pino
└── grafana/
    ├── provisioning/datasources/      Prometheus (uid prometheus), Loki (uid loki), Alertmanager
    ├── provisioning/dashboards/       nạp bảng từ grafana/dashboards/
    └── dashboards/01…09-*.json        9 bảng điều khiển
```

Các bảng điều khiển:

| Tệp | Tên | Nội dung |
|---|---|---|
| `01-tong-quan.json` | 01 — Tổng quan | API/CSDL sống hay chết, phiên bản, yêu cầu/giây, tỉ lệ 5xx, p50/p95/p99, số cảnh báo đang bật, lỗi tự chẩn đoán, bộ nhớ |
| `02-api.json` | 02 — API theo route | Lưu lượng / độ trễ / lỗi theo route, mã lỗi nhiều nhất, bảng tóm tắt route, action và công cụ MCP |
| `03-postgresql.json` | 03 — CSDL PostgreSQL | `pg_up`, kết nối, dung lượng, giao dịch/giây, cache hit, deadlock; pool và thời gian truy vấn từ phía API |
| `04-so-cai-su-viec.json` | 04 — Sổ cái & sự việc | Sự việc theo trạng thái, tuổi sự việc chờ lâu nhất, bút toán 24h, lỗi ghi sổ (POSTING_FAILED / PERIOD_LOCKED / UNBALANCED_ENTRY), tự chẩn đoán L1/L3 |
| `05-nghiep-vu-kpi.json` | 05 — KPI nghiệp vụ | Chứng từ ghi sổ theo giờ / ngày / loại, action thành công vs lỗi, MCP theo công cụ, đơn vị (tenant) hoạt động nhiều nhất (từ Loki) |
| `06-nhat-ky-canh-bao.json` | 06 — Nhật ký & cảnh báo | Bảng cảnh báo đang bật, nhật ký lỗi (level ≥ 50) lọc theo dịch vụ / tenant / mã lỗi / chữ tìm |
| `07-duong-su-kien.json` | 07 — Đường sự kiện | Outbox: việc giao chờ / chết, tuổi chờ lâu nhất, lượt giao theo subscriber; gửi lặp (new / replayed / conflict); sự việc chờ / lỗi |
| `08-da-don-vi.json` | 08 — Đa đơn vị | Số đơn vị theo dải hoạt động 24 giờ, số đơn vị tồn đọng — **không** liệt kê đơn vị nào |
| `09-toan-ven-so.json` | 09 — Toàn vẹn sổ | Mốc đối soát L1 / L3 gần nhất ("Chưa thu" khác 0), kết quả kiểm, ghi sổ đã commit theo hành động / loại chứng từ, từ chối nghiệp vụ theo mã, lỗi kỹ thuật định khoản |

07–09 do PHASE-018 thêm; bản mẫu thiết kế ở [docs/phases/PHASE-018-GIAM-SAT-VAN-HANH/mockups/](../../docs/phases/PHASE-018-GIAM-SAT-VAN-HANH/mockups/README.md), ảnh chụp có dữ liệu ở `evidence/`.

## 2. Bật / tắt

Chạy **từ thư mục gốc kho** (để đường dẫn `./infrastructure/monitoring/...` đúng — với nhiều `-f`,
Compose tính đường dẫn tương đối theo thư mục của tệp đầu tiên):

```bash
# Bật cả hệ thống + giám sát
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml up -d

# Chỉ bật phần giám sát khi hệ thống đã chạy (không dựng lại api/web)
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml \
  up -d prometheus alertmanager grafana loki promtail postgres-exporter node-exporter cadvisor

# Tắt giám sát, giữ dữ liệu (chỉ số, nhật ký, Grafana)
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml \
  stop prometheus alertmanager grafana loki promtail postgres-exporter node-exporter cadvisor

# Gỡ hẳn (xoá cả ổ dữ liệu giám sát — KHÔNG đụng pgdata/appdata)
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml \
  rm -sf prometheus alertmanager grafana loki promtail postgres-exporter node-exporter cadvisor
docker volume rm ketoan_prometheus-data ketoan_alertmanager-data ketoan_grafana-data ketoan_loki-data ketoan_promtail-positions
```

Mẹo: đặt bí danh cho đỡ gõ —
`alias dcm='docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml'`.

Lưu ý: `docker compose down` **không kèm** tệp giám sát sẽ để lại các container giám sát mồ côi
(Compose sẽ cảnh báo "orphan containers"). Luôn dùng cùng bộ `-f` khi tắt.

## 3. Địa chỉ

Cổng chỉ mở trên `127.0.0.1` — **giám sát không công khai**. Từ máy khác, dùng đường hầm SSH:
`ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 <máy-chủ>`.

| | Địa chỉ |
|---|---|
| Grafana | http://127.0.0.1:3000 (người dùng `admin`) |
| Prometheus | http://127.0.0.1:9090 — mục *Status → Targets* xem job nào đang lỗi |
| Alertmanager | http://127.0.0.1:9093 — xem / tạm tắt (silence) cảnh báo |

Đổi cổng: đặt `GRAFANA_PORT`, `PROMETHEUS_PORT`, `ALERTMANAGER_PORT` trong `.env`.

## 4. Cấu hình

Thêm vào `.env` ở gốc kho (cùng tệp với `JWT_SECRET`):

```dotenv
# Mật khẩu quản trị Grafana — BẮT BUỘC: thiếu thì docker compose dừng và báo (không còn mật khẩu mặc định).
GRAFANA_ADMIN_PASSWORD=mot-mat-khau-dai-va-kho-doan
# (tuỳ chọn) GRAFANA_ADMIN_USER=admin  GRAFANA_ROOT_URL=https://giam-sat.example.com
# (tuỳ chọn) PROMETHEUS_RETENTION=30d
# (tuỳ chọn, khuyến nghị) vai trò chỉ-đọc cho postgres-exporter — xem §6
# PG_EXPORTER_USER=ketoan_monitor
# PG_EXPORTER_PASSWORD=...
```

`GRAFANA_ADMIN_PASSWORD` chỉ có tác dụng ở **lần khởi tạo đầu** (ổ `grafana-data` còn trống). Đổi sau đó:

```bash
dcm exec grafana grafana cli admin reset-admin-password '<mật-khẩu-mới>'
```

### 4.1. Bảo vệ `/metrics` bằng `METRICS_TOKEN`

Mặc định `/metrics` của API chỉ gọi được từ trong mạng Docker (nginx `web` không chuyển tiếp đường này).
Muốn chặn thêm bằng token:

1. Đặt `METRICS_TOKEN=<chuỗi-ngẫu-nhiên>` cho dịch vụ `api` (trong `.env` và khai báo ở `docker-compose.yml`),
   rồi khởi động lại API. Tạo chuỗi: `openssl rand -hex 32`.
2. Ghi đúng chuỗi đó (một dòng) vào tệp
   `infrastructure/monitoring/prometheus/secrets/metrics_token`
   (thư mục `secrets/` đã nằm trong `.gitignore` của bộ này — không commit).
   Trên Linux: `chmod 644` để Prometheus (người dùng `nobody`) đọc được.
3. Trong `prometheus/prometheus.yml`, job `api`, bỏ dấu `#` ở khối:
   ```yaml
   authorization:
     type: Bearer
     credentials_file: /etc/prometheus/secrets/metrics_token
   ```
4. `curl -X POST http://127.0.0.1:9090/-/reload` rồi xem *Status → Targets*: job `api` phải **UP**.
   Nếu thấy `401` → token hai bên không khớp (cảnh báo `ApiDown` sẽ bật sau 2 phút).

## 5. Thêm kênh nhận cảnh báo

Mặc định receiver `default` **không gửi đi đâu** — cảnh báo chỉ hiện ở Alertmanager và bảng 06.
Để gửi đi, sửa `alertmanager/alertmanager.yml`, bỏ `#` ở một trong các ví dụ trong receiver `default`:

- **Webhook** (Slack / Teams / Zalo qua cầu nối, hoặc dịch vụ nội bộ): `webhook_configs` với `url_file`.
- **Email**: điền khối `smtp_*` ở `global` và `email_configs`.
- **Telegram**: `telegram_configs` với `bot_token_file` và `chat_id`.

Bí mật (URL webhook, mật khẩu SMTP, token bot) đặt trong tệp
`infrastructure/monitoring/alertmanager/secrets/<tên>` và trỏ bằng `*_file` — không ghi thẳng vào YAML.
Sau khi sửa:

```bash
dcm exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
curl -X POST http://127.0.0.1:9093/-/reload
```

Muốn tách kênh theo mức độ (vd. critical → điện thoại trực, warning → email), thêm receiver mới rồi
đổi `receiver:` của nhánh `severity="critical"` trong `route.routes`.

Cảnh báo được gom theo `alertname`; `PostgreSQLDown` chặn các cảnh báo hệ quả (`HighErrorRate`,
`HighLatency`, `PostingBacklog`), `ApiDown` chặn `HighErrorRate` / `HighLatency`.

## 6. Vai trò CSDL cho postgres-exporter (khuyến nghị trên máy chủ thật)

Mặc định exporter dùng vai trò sở hữu `ketoan` cho tiện thử. Trên máy chủ thật nên tạo vai trò chỉ có quyền
đọc thống kê (chạy một lần, bằng `psql` với vai trò sở hữu):

```sql
CREATE ROLE ketoan_monitor LOGIN PASSWORD '<mật-khẩu>';
GRANT pg_monitor TO ketoan_monitor;
GRANT CONNECT ON DATABASE ketoan TO ketoan_monitor;
```

rồi đặt `PG_EXPORTER_USER=ketoan_monitor` và `PG_EXPORTER_PASSWORD=<mật-khẩu>` trong `.env`.
Vai trò này không đọc được bảng nghiệp vụ, không ghi được gì.

## 7. Tài nguyên cần

Ước lượng cho một máy chủ, vài chục đơn vị, lưu lượng vừa:

| | RAM (giới hạn đặt trong compose) | Đĩa |
|---|---|---|
| Prometheus | ~300–600 MB (giới hạn 1 GB) | ~1–3 GB / 15 ngày (trần 10 GB) |
| Loki | ~200–500 MB (giới hạn 1 GB) | tuỳ lượng nhật ký, thường 1–5 GB / 30 ngày |
| Grafana | ~150 MB (giới hạn 512 MB) | < 100 MB |
| Promtail, exporter, cAdvisor, Alertmanager | ~250 MB tổng | không đáng kể |
| **Tổng** | **~1–1,5 GB RAM, 0,5 lõi CPU** | **~5–10 GB** |

Máy chủ dưới 2 GB RAM: cân nhắc bỏ `loki` + `promtail` (vẫn còn chỉ số và cảnh báo), hoặc đặt giám sát ở máy khác.

## 8. Luật cảnh báo — đối chiếu với bộ tham chiếu

`prometheus/alerts.yml` có **14 luật**: 8 luật nền dưới đây + 6 luật PHASE-018 (bảng sau). Trong 8 luật nền, sáu luật giữ nguyên ý của bộ tham chiếu; hai luật về Redis/NATS
được thay vì dự án **không có Redis, không có NATS** (hàng đợi là bảng outbox / `accounting_events` trong
PostgreSQL — nếu PostgreSQL sống thì "hàng đợi" sống). Điều đáng lo với phần mềm kế toán không phải một
dịch vụ trung gian sập, mà là **sổ cái sai** hoặc **chứng từ nhận rồi nhưng không thành bút toán**.

| Luật tham chiếu | Luật của ta | Điều kiện | Mức |
|---|---|---|---|
| HighErrorRate | `HighErrorRate` | tỉ lệ 5xx > 5% trong 5 phút (và lưu lượng > 0,02 yêu cầu/giây để tránh báo giả lúc vắng) | critical |
| HighLatency | `HighLatency` | p95 `bizcity_http_request_duration_seconds` > 1 giây suốt 10 phút | warning |
| ApiDown | `ApiDown` | `up{job="api"} == 0` suốt 2 phút | critical |
| HighMemory | `HighMemory` | RSS API > 1,5 GiB, hoặc container dùng > 90% giới hạn RAM, suốt 10 phút | warning |
| PostgreSQLDown | `PostgreSQLDown` | `pg_up == 0` suốt 1 phút | critical |
| DiskUsage | `DiskUsage` | ổ đĩa đã dùng > 85% suốt 15 phút | warning |
| **NATSDown** | **`LedgerIntegrityError`** | `bizcity_diagnostics_errors{layer="L3"} > 0` — báo ngay (for 0m) | critical |
| **RedisDown** | **`PostingBacklog`** | còn sự việc `error` suốt 30 phút, hoặc sự việc `pending` chờ > 3 ngày | warning |

Xử lý `LedgerIntegrityError`: **không** sửa tay bảng `ledger_*`. Chạy lại tự chẩn đoán, đọc chi tiết lỗi,
sửa bằng bút toán đảo theo [docs/rules/RULE-LEDGER.md](../../docs/rules/RULE-LEDGER.md) và
[docs/ops/DIAGNOSTICS.md](../../docs/ops/DIAGNOSTICS.md).

**Sáu luật PHASE-018** (nhóm `bizcity-pipeline`). Số đo đọc từ CSDL giống nhau trên mọi máy API nên gộp bằng `max`; số đo pool là của từng tiến trình nên tính theo `instance`.

| Luật | Điều kiện | Mức |
|---|---|---|
| `OutboxDeadLetter` | có việc giao sự kiện `dead` (hết lượt thử) | warning |
| `OutboxBacklog` | việc giao chờ lâu nhất > 5 phút, suốt 5 phút | warning |
| `ReconciliationStale` | lượt tự chẩn đoán L3 gần nhất > 26 giờ (chưa từng chạy thì không báo) | warning |
| `DbPoolSaturation` | > 80% kết nối pool đang dùng, hoặc có yêu cầu chờ kết nối, suốt 5 phút | warning |
| `MetricsCollectorFailing` | bộ thu số đo lỗi / quá giờ > 3 lần trong 15 phút | warning |
| `PostingRejectionSpike` | > 30% lượt định khoản bị từ chối nghiệp vụ, suốt 15 phút — nhãn `team="ke-toan"`, đi kênh kế toán | warning |

Xử lý từng luật: [docs/ops/RUNBOOK-CANH-BAO.md](../../docs/ops/RUNBOOK-CANH-BAO.md). Alertmanager ức chế các luật này khi
`PostgreSQLDown` / `ApiDown` đang bắn (chỉ báo nguyên nhân gốc).

Kiểm luật khi sửa — cú pháp và test bắn / hết bắn:

```bash
M="$(pwd -W)/infrastructure/monitoring/prometheus"; export MSYS_NO_PATHCONV=1   # Linux/macOS: M="$(pwd)/infrastructure/monitoring/prometheus"
docker run --rm -v "$M:/etc/prometheus" --entrypoint promtool prom/prometheus:v2.53.4 check rules /etc/prometheus/alerts.yml
docker run --rm -v "$M:/etc/prometheus" --entrypoint promtool prom/prometheus:v2.53.4 test rules /etc/prometheus/alerts.test.yml
```

## 9. Nhật ký: nhãn nào được đưa lên Loki

Promtail chỉ đọc container có nhãn `com.docker.compose.project=ketoan` (khớp `name: ketoan` trong
`docker-compose.yml` — đổi tên dự án thì sửa `promtail/promtail-config.yml`). Mỗi dòng có nhãn `service`
(tên dịch vụ compose), `container`, `stream`.

Với API (pino JSON), Promtail tách JSON và chỉ đưa lên **nhãn** các trường ít giá trị:

| Nhãn | Giá trị | Ghi chú |
|---|---|---|
| `level` | trace · debug · info · warn · error · fatal | đổi từ số pino 10…60; "level ≥ 50" = `level=~"error\|fatal"` |
| `errCode` | mã trong `Errors.*` | tập cố định |
| `evt` | `bizcity.ledger.posted`, … | tập cố định do code định nghĩa |
| `tenant` | mã đơn vị | ổn khi vài chục đơn vị; **hàng trăm+ đơn vị thì bỏ nhãn này** |

`reqId`, `traceId`, `docKey`, `actor`, `route` **không** làm nhãn: mỗi giá trị mới tạo một luồng (stream)
mới trong Loki → chỉ mục phình, truy vấn chậm, chạm giới hạn. Chúng vẫn nằm nguyên trong dòng JSON
(`reqId`, `traceId` còn được gắn làm *structured metadata*). Tìm một yêu cầu: gõ reqId/traceId vào ô
**Tìm chữ** ở bảng 06, hoặc bấm *Xem cùng traceId* trong chi tiết một dòng nhật ký.

Dòng kiểm tra sức khoẻ (`/api/v1/system/health*`) và lượt thu `/metrics` mức info bị bỏ để đỡ nhiễu.

Chỉ số Prometheus **không** có nhãn `tenant` (tránh bùng số chuỗi) — các bảng "theo đơn vị" ở 05 đếm từ Loki.

## 10. Docker Desktop (Windows / macOS)

- `node-exporter` và `cadvisor` đo **máy ảo của Docker Desktop**, không phải ổ C: / máy Mac. Số đĩa, RAM ở
  bảng 01 vì vậy là của máy ảo — bình thường khi thử trên máy cá nhân.
- Nếu `node-exporter` không khởi động với lỗi về `rslave`, xoá `,rslave` ở dòng gắn `/:/host` (chỉ trên Docker Desktop).
- `cadvisor` cần `privileged`. Nếu môi trường cấm, bỏ dịch vụ này — chỉ mất bảng RAM theo container và nửa
  điều kiện "container" của `HighMemory` (nửa "RSS API" vẫn chạy).

## 11. Mở rộng sau này

**Khi thêm bộ chuyển (adapter) Redis hoặc NATS** (vd. hàng đợi ngoài cho outbox):

1. Thêm exporter vào `docker-compose.monitoring.yml`: `oliver006/redis_exporter` (chỉ số `redis_up`) hoặc
   bật cổng giám sát `:8222` của NATS + `natsio/prometheus-nats-exporter` (chỉ số `gnatsd_varz_*`).
2. Thêm job tương ứng vào `prometheus/prometheus.yml`.
3. Thêm luật vào `prometheus/alerts.yml`, vd.
   `RedisDown: redis_up == 0 for 1m` và `NATSDown: up{job="nats"} == 0 for 1m` (critical).
   **Giữ** `LedgerIntegrityError` và `PostingBacklog` — chúng vẫn là tín hiệu nghiệp vụ quan trọng nhất;
   với hàng đợi ngoài, bổ sung luật độ trễ tiêu thụ (consumer lag) vào `PostingBacklog`.
4. Thêm bảng điều khiển `07-*.json` (Grafana có bảng cộng đồng cho redis_exporter / NATS) và cập nhật bảng ở §1, §8.

**Chỉ số mới từ API**: đặt tên `bizcity_<miền>_<đơn vị>` (vd. `bizcity_outbox_dispatch_seconds`), không thêm
nhãn số lượng lớn (tenant, docKey, reqId). Thêm bảng / panel vào tệp JSON tương ứng rồi khởi động lại Grafana
hoặc chờ 60 giây (Grafana tự nạp lại tệp).

**Sửa bảng điều khiển**: bảng nạp từ tệp nên sửa trên giao diện không lưu được. Sửa trên giao diện →
*Share → Export → Save to file* → ghi đè tệp trong `grafana/dashboards/`.

**Promtail → Grafana Alloy**: Promtail đã ở chế độ chỉ bảo trì. Khi chuyển:
`alloy convert --source-format=promtail promtail/promtail-config.yml` rồi thay dịch vụ `promtail` bằng `grafana/alloy`.

## 12. Kiểm cấu hình

```bash
M="$(pwd -W)/infrastructure/monitoring"; export MSYS_NO_PATHCONV=1   # Git Bash; Linux: M="$(pwd)/infrastructure/monitoring"
docker run --rm -v "$M/prometheus:/etc/prometheus" --entrypoint promtool prom/prometheus:v2.53.4 check config /etc/prometheus/prometheus.yml
docker run --rm -v "$M/alertmanager:/etc/alertmanager" --entrypoint amtool prom/alertmanager:v0.27.0 check-config /etc/alertmanager/alertmanager.yml
docker run --rm -v "$M/loki/loki-config.yml:/etc/loki/loki-config.yml" grafana/loki:3.3.2 -config.file=/etc/loki/loki-config.yml -verify-config
docker run --rm -v "$M/promtail/promtail-config.yml:/etc/promtail/promtail-config.yml" grafana/promtail:3.3.2 -config.file=/etc/promtail/promtail-config.yml -check-syntax
docker compose -f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml config --quiet
for f in infrastructure/monitoring/grafana/dashboards/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "OK $f"; done
```
