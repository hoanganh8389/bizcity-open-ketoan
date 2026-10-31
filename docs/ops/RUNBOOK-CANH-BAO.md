# Sổ tay xử lý cảnh báo (runbook)
<!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — runbook 14 cảnh báo (infrastructure/monitoring/prometheus/alerts.yml), khuôn 20-KIEN-TRUC §4.2 (S018-15). -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework. Luật cảnh báo: [`alerts.yml`](../../infrastructure/monitoring/prometheus/alerts.yml) · số đo: [OBSERVABILITY.md §3](OBSERVABILITY.md) · dashboard: `infrastructure/monitoring/grafana/dashboards/`.

## Luật chung — đọc trước mọi cảnh báo

1. **Cảnh báo chỉ báo.** Không tự động hoá nào được sửa dữ liệu kế toán.
2. **KHÔNG** sửa / xoá `ledger_*`, `accounting_events*`, `posting_log`, sổ hoá đơn, công nợ, thẻ kho bằng SQL tay. **KHÔNG** tắt trigger, **KHÔNG** mở khoá kỳ để "cho qua", **KHÔNG** phát lại sự kiện hàng loạt khi chưa rõ nguyên nhân (R-REV-11, R-KER-4).
3. Sửa sổ chỉ bằng **bút toán đảo** qua Kernel, có người duyệt, trong kỳ chưa khoá.
4. Mức sự cố: `sev1` = sai sổ, mất dữ liệu, lộ dữ liệu → báo chủ dự án ngay · `sev2` = dịch vụ hỏng / chậm · `sev3` = suy giảm, chờ giờ làm việc.
5. Không dán dữ liệu chứng từ, tên khách, MST, số tiền, token vào kênh chat / issue (R-SEC-10). Dùng `requestId`, mã lỗi, mã kiểm DG-*.
6. Xong việc: ghi hậu kiểm (nguyên nhân, cách xử lý, test tái hiện, luật dò mới nếu lỗi lặp lại — R-REV-10).

Tra cứu nhanh: Prometheus `http://127.0.0.1:9090` · Alertmanager `http://127.0.0.1:9093` · Grafana `http://127.0.0.1:3000` · log API: Grafana bảng 06 hoặc `{service="api"} | json | errCode="<MÃ>"` trên Loki.

## Cảnh báo critical

### ApiDown

- **Triệu chứng:** ứng dụng không mở được / API không trả lời.
- **Xác nhận:** `up{job="api"} == 0`; `docker compose ps api`; `docker compose logs --tail=200 api`.
- **Khoanh vùng:** API khởi động lại liên tục (lỗi cấu hình, migration), hết bộ nhớ (`HighMemory`), hay Prometheus bị 401 vì `METRICS_TOKEN` không khớp (API vẫn chạy).
- **Bước an toàn:** sửa cấu hình / khởi động lại container `api`. Migration lỗi thì **dừng**, không sửa tay bảng — báo chủ dự án.
- **Leo thang:** quá 15 phút → `sev2`.

### PostgreSQLDown

- **Triệu chứng:** mọi thao tác lỗi, ghi sổ dừng.
- **Xác nhận:** `pg_up == 0`; `docker compose logs --tail=200 db`; ổ đĩa (`DiskUsage`).
- **Bước an toàn:** giải phóng ổ đĩa / khởi động lại `db`. Mất dữ liệu nghi ngờ → khôi phục theo [docs/ops PITR](../phases/PHASE-008-SAO-LUU-PITR/README.md), có chủ dự án duyệt.
- **Leo thang:** ngay → `sev2`; nghi mất dữ liệu → `sev1`.

### HighErrorRate

- **Triệu chứng:** > 5% yêu cầu trả 5xx.
- **Xác nhận:** bảng 02 — API theo route; `sum by (code) (rate(bizcity_http_errors_total[5m]))`; log `level=~"error|fatal"`.
- **Khoanh vùng:** một route / một mã lỗi; có trùng thời điểm đổi bản (chú thích "Đổi bản phát hành") không.
- **Bước an toàn:** quay về bản trước nếu lỗi bắt đầu sau khi phát hành (docs/ops/RELEASE.md). Không sửa dữ liệu để "hết lỗi".

### LedgerIntegrityError

- **Triệu chứng:** tự chẩn đoán L1 / L3 có kiểm mức error — sổ có thể lệch hoặc lớp bảo vệ sổ bị tắt.
- **Xác nhận:** bảng 09 — Toàn vẹn sổ; `GET /api/v1/system/diagnostics` (theo quyền đơn vị) → mã kiểm DG-* bị lỗi; `GET /api/v1/system/diagnostics/runs/<id>`.
- **Khoanh vùng:** L1 (trigger mất / tắt, migration thiếu, CSDL chỉ đọc) hay L3 (sổ không cân, số dư ngày lệch, bút toán mồ côi…).
- **Bước an toàn:** **dừng mọi thao tác sửa tay.** L1: khôi phục trigger bằng migration / cài lại theo docs/ops/DIAGNOSTICS.md. L3: lập bút toán điều chỉnh / đảo có người duyệt. Kỳ bị ảnh hưởng không khoá cho tới khi L3 sạch (khoá kỳ tự chặn — R-DIAG-4).
- **Leo thang:** luôn `sev1` cho tới khi biết nguyên nhân.

## Cảnh báo warning — đường sự kiện, đối soát, tài nguyên (PHASE-018)

### OutboxDeadLetter

- **Triệu chứng:** thông báo / đồng bộ phía sau (catalog, Cell, webhook) không chạy. **Sổ cái không bị ảnh hưởng** (ghi sổ đồng bộ, AP-2).
- **Xác nhận:** bảng 07 — Đường sự kiện; `max(bizcity_outbox_deliveries{status="dead"})`; `GET /api/v1/system/events` (subscriber nào có `dead`, `last_error`).
- **Bước an toàn:** sửa nguyên nhân (cấu hình nơi nhận, lỗi mã subscriber), rồi phát lại **có người duyệt** bằng `POST /api/v1/system/events/replay` (action `core.events.replay`, ghi bằng chứng ai phát lại). Subscriber idempotent (`event_consumptions`) nên phát lại không làm đôi.
- **Không được làm:** sửa tay `event_deliveries.status`.

### OutboxBacklog

- **Triệu chứng:** việc giao sự kiện chờ quá 5 phút.
- **Xác nhận:** `max(bizcity_outbox_oldest_pending_seconds)`; bảng 07 — lượt giao theo subscriber (`retry` tăng?).
- **Khoanh vùng:** vòng dispatcher dừng (API vừa khởi động lại? `ApiDown`?) hay một subscriber lỗi lặp lại đang chờ giãn nhịp (`retry`).
- **Bước an toàn:** xem log `subscriber`; sửa nguyên nhân. Việc chờ sẽ tự giao khi đến hạn.

### PostingBacklog

- **Triệu chứng:** chứng từ nhận rồi nhưng chưa thành bút toán (trạm ACC14) — báo cáo thiếu số.
- **Xác nhận:** bảng 04 / 07; `bizcity_ledger_events{status="error"}`; bảng 09 — từ chối theo mã.
- **Khoanh vùng:** phần lớn là từ chối **nghiệp vụ** (kỳ khoá `PERIOD_LOCKED`, thiếu cấu hình `POSTING_FAILED`) → việc của kế toán ở trạm ACC14, không phải sự cố.
- **Bước an toàn:** kế toán xử lý ở trạm (bổ sung cấu hình, mở khoá kỳ **có lý do** theo quy trình khoá kỳ, rồi định khoản lại).

### ReconciliationStale

- **Triệu chứng:** quá 26 giờ không có lượt tự chẩn đoán L3 (đối soát sổ).
- **Xác nhận:** bảng 09 — "Đối soát L3 gần nhất"; `time() - max(bizcity_diagnostics_last_run_timestamp_seconds{layer="L3"})`.
- **Bước an toàn:** chạy tay `GET /api/v1/system/diagnostics` cho các đơn vị đang hoạt động; kiểm lịch chạy đêm (Q018-3). Bản cài chưa từng chạy L3 thì không có số đo → cảnh báo không bắn — bật lịch trước.

### DbPoolSaturation

- **Triệu chứng:** yêu cầu chậm dần rồi lỗi; có yêu cầu chờ kết nối.
- **Xác nhận:** bảng 03; `bizcity_db_pool_connections{state}` so `bizcity_db_pool_max` theo `instance`; truy vấn chậm (`bizcity_db_query_duration_seconds`).
- **Khoanh vùng:** giao dịch dài (nhập lô lớn, báo cáo nặng), lời gọi action lồng nhau (`ctx.actions.call` mở giao dịch thứ hai), khoá dòng.
- **Bước an toàn:** dừng việc nặng đang chạy; không tăng `max` pool vượt khả năng PostgreSQL (`max_connections`).

### MetricsCollectorFailing

- **Triệu chứng:** số đo của một bộ thu (`ledger`, `postings`, `outbox`, `tenants`, `diagnostics`) đứng yên — dashboard có thể "đúng giả".
- **Xác nhận:** `increase(bizcity_collector_errors_total[15m])` theo `collector`; log API "bộ thu số đo lỗi".
- **Khoanh vùng:** câu đếm quá trần 5 giây (bảng lớn, thiếu chỉ mục), quyền CSDL, CSDL quá tải.
- **Bước an toàn:** không ảnh hưởng ghi sổ (bộ thu chạy giao dịch chỉ đọc riêng). Thêm chỉ mục bằng migration chỉ thêm có ước tính thời gian (R-DB-13) nếu cần.

### PostingRejectionSpike (kế toán)

- **Người nhận:** kế toán (`team="ke-toan"`), **không** gọi trực ban — đây không phải sự cố hệ thống.
- **Triệu chứng:** > 30% lượt định khoản 15 phút bị từ chối theo luật.
- **Xác nhận:** bảng 09 — "Từ chối nghiệp vụ theo mã": `PERIOD_LOCKED` (gửi chứng từ vào kỳ đã khoá), `POSTING_FAILED` (thiếu cấu hình định khoản sau khi đổi chính sách), `VALIDATION_ERROR` (nguồn gửi sai khuôn).
- **Bước an toàn:** kế toán xử lý ở trạm ACC14; nguồn gửi sai khuôn → báo bên tích hợp (mã lỗi + `requestId`).

### HighLatency · HighMemory · DiskUsage

- **HighLatency:** bảng 02 (route chậm nhất) + bảng 03 (truy vấn chậm, pool). Trùng thời điểm nhập lô / báo cáo lớn → hẹn giờ thấp điểm.
- **HighMemory:** RSS API > 1,5 GiB hoặc container > 90% giới hạn. Xem route / việc vừa chạy; khởi động lại có kiểm soát nếu rò bộ nhớ, ghi lại để sửa.
- **DiskUsage:** dọn bản sao lưu cũ theo chính sách lưu (≥ 10 năm cho sổ — **không** xoá sổ / WAL đang cần cho PITR), nhật ký Docker; mở rộng ổ.
