# PHASE-019 · 10 — Hiện trạng đọc mã (2026-11-01, `main` @ e9bde0e)
<!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — Bàn điều tra cho nhà phát triển: sổ tay điều tra lỗi theo tình huống + thiết kế UI/UX dev trên Prometheus, Loki, Tempo, Grafana, Alertmanager -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## 1. Có sẵn, dùng lại được

| Thứ | Ở đâu | Dùng cho màn |
|---|---|---|
| Phản hồi lỗi có `error.requestId`, `error.traceId` | `apps/api/src/core/http.ts`; [BIZCITY-ERRORS-v1](../../contracts/BIZCITY-ERRORS-v1.md) | Mã tra cứu (W1) |
| Header `X-Request-Id` ở mọi phản hồi | `apps/api/src/core/observability.ts` (R-OBS-1) | Mã tra cứu khi thân phản hồi hỏng (504 từ proxy) |
| `GET /api/v1/system/health` → `version`, `kernel`, `standard`, `envLabel`, `bookMode` | `modules/system/system.routes.ts:141`; web đọc ở `layout/AppLayout.tsx:68` | Báo lỗi (phiên bản), chế độ Vận hành (`envLabel`) |
| `GET /api/v1/system/events` (`reports:read`) — subscriber, chờ / xong / chết theo nơi nhận | `modules/system/events.routes.ts:15-29` | Sự kiện |
| `POST /api/v1/system/events/replay` (`settings:write`, bằng chứng) | `modules/system/events.routes.ts:31-48` | Sự kiện — **chỉ link**, không làm lại |
| `GET /api/v1/system/diagnostics` + `/runs`, `/runs/:id` (`reports:read`) | `modules/system/system.routes.ts:165,195,211` | Toàn vẹn |
| `GET /api/v1/posting-log`, `/documents/:id/posting-log` (ACC14) | `features/documents/DocumentsPage.tsx:80-82` | Ghi sổ |
| `GET /api/v1/evidence/:id` | `modules/system/evidence.routes.ts:37` | Tra mã — bằng chứng theo biên nhận |
| Span có `bizcity.tenant`: HTTP (sau xác thực), action, giao sự kiện | `core/observability.ts:54`, `core/actions.ts:200`, `core/events.ts:190` | kiểm trace thuộc đơn vị (D019-5) |
| Danh sách thuộc tính trace được phép | `core/tracing.ts:47-56` (`TRACE_ATTRIBUTES`) | lọc lần hai ở API trung gian |
| Grafana nguồn `prometheus`, `loki`, `tempo`, `alertmanager` (uid cố định) | `infrastructure/monitoring/grafana/provisioning/datasources/datasources.yml:11,25,49,82` | link sâu Explore (W5) |
| 9 dashboard, uid cố định `bizcity-tong-quan`, `bizcity-api`, `bizcity-postgresql`, `bizcity-so-cai`, `bizcity-kpi`, `bizcity-nhat-ky`, `bizcity-su-kien`, `bizcity-don-vi`, `bizcity-toan-ven` | `infrastructure/monitoring/grafana/dashboards/0*.json` | link sâu dashboard (W5) |
| Nhãn Loki `service`, `level`, `tenant`, `errCode`, `evt`; siêu dữ liệu `reqId`, `traceId`; bỏ nhãn theo `LOKI_LABELDROP` | `infrastructure/monitoring/promtail/promtail-config.yml:78-90` | mẫu LogQL |
| Hướng dẫn trong app đọc `docs/huong-dan/*.md` bằng `import.meta.glob` | `apps/web/src/help/guides.ts:5` | Kịch bản đọc Sổ tay cùng cách |
| Lọc menu theo quyền (`MenuItem.permission`) | `apps/web/src/layout/menu.ts:71-73` | ẩn phân hệ Nhà phát triển |
| Phân hệ web mẫu không ghi sổ: **API** (Thử API, Hướng dẫn, Nguồn dữ liệu) | `apps/web/src/phan-he/api/` | khuôn cho phân hệ `dev` |

## 2. Thiếu (khoảng trống)

| # | Thiếu | Ở đâu / vì sao | Mức | Đợt |
|---|---|---|---|---|
| G1 | `ApiError` của web **không giữ** `requestId`, `traceId`; thông báo lỗi chỉ có câu chữ | `apps/web/src/lib/api.ts:9-11` (constructor), `:71` (throw) | P0 | W1 |
| G2 | Không có quyền / vai trò cho dev, vận hành | `apps/api/src/core/auth.ts:29-53` (`PERMISSIONS`, `ROLE_PERMISSIONS`); `packages/contracts/src/enums.ts:119` (`Role`) | P1 | W2 (Q019-1) |
| G3 | API không biết địa chỉ Tempo / Loki / Prometheus / Alertmanager (chỉ biết Collector để **gửi**) | `apps/api/src/config/env.ts` có `OTEL_EXPORTER_OTLP_ENDPOINT`, không có `TEMPO_URL`… | P1 | W2 |
| G4 | Không tra được bằng chứng theo `trace_id` / `request_id` qua API | chỉ `GET /api/v1/evidence/:id`; cột `audit_logs.trace_id` có từ migration `0047` | P1 | W2 |
| G5 | Không có màn xem trace / log trong app | — | P1 | W3 |
| G6 | Trace từ yêu cầu **chưa xác thực** không có `bizcity.tenant` → không thuộc đơn vị nào, chế độ Đơn vị không xem được | `core/observability.ts:54` gắn ở `preHandler` sau xác thực | chấp nhận | — (đúng chủ đích: 401 không có đơn vị) |
| G7 | Không có check tĩnh đảm bảo mẫu truy vấn của API trung gian luôn có bộ lọc đơn vị | — | P2 | W5 (SC-DEV-1) |

## 3. Ràng buộc từ phase trước

| Ràng buộc | Nguồn |
|---|---|
| Người dùng đơn vị không vào Grafana; Grafana / Prometheus / Alertmanager chỉ bind `127.0.0.1` | [PHASE-018 20-KIEN-TRUC §5](../PHASE-018-GIAM-SAT-VAN-HANH/20-KIEN-TRUC.md); `infrastructure/monitoring/docker-compose.monitoring.yml:16-21,52,72,102` |
| Widget / drill-down qua **API backend có phân quyền**, không nhúng thông tin đăng nhập Grafana vào trình duyệt | PHASE-018 20-KIEN-TRUC §5 (dòng "Widget CEO") |
| Drill-down liên đơn vị cần vai trò vận hành liên đơn vị — chưa có, cần ADR | PHASE-018 Q018-6 |
| Số đo không có nhãn `tenant` → Prometheus **không** cho được số liệu theo đơn vị; số liệu theo đơn vị lấy từ CSDL / Loki / Tempo | OBSERVABILITY §3, R-OBS-4 |
| Trace, log, số đo không đọc ngược vào định khoản / khoá kỳ / quyền | R-OBS-8 |

## 4. Hệ quả cho thiết kế

- **Prometheus chỉ dùng ở chế độ Vận hành.** Ở chế độ Đơn vị, các ô "sức khoẻ" lấy từ CSDL (posting_log, outbox, diagnostic_runs — đều có RLS) và từ Tempo / Loki có bộ lọc đơn vị.
- **Tempo là nguồn chính của màn Tra mã**; Loki là nguồn dự phòng khi trace bị bỏ (lấy mẫu) hoặc quá 7 ngày (Loki giữ 30 ngày).
- Phần đọc CSDL không phụ thuộc bộ giám sát → Bàn điều tra vẫn có ích trên bản cài không chạy Grafana.
