# PHASE-018 · 00 — Kế hoạch tổng
<!-- [2026-10-31 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-018 — kế hoạch tổng: ánh xạ bản giao việc observability vào repo, quyết định D018-*, câu hỏi Q018-*, đợt W0–W7, cổng nghiệm thu. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework. Phase chỉ mở rộng trên nền đã chuẩn hoá: hợp đồng `docs/contracts/`, luật `docs/rules/`, bộ kiểm `tests/conformance/`.

## 1. Vì sao

Bộ giám sát nền (lộ trình 2.13, ADR-0007) trả lời được "API có sống, có chậm, có lỗi không". Nó **chưa** trả lời được những câu đặc thù của phần mềm kế toán:

- Có bao nhiêu chứng từ được **ghi sổ**, bị **từ chối đúng luật** (kỳ khoá, không cân, gửi lặp) và bao nhiêu **hỏng kỹ thuật**? Hiện ba loại này lẫn trong `bizcity_http_errors_total{code}` và chỉ đếm khi đi qua HTTP.
- Sự kiện miền trong outbox có bị **dồn / chết** không? Hiện chỉ tự chẩn đoán thấy, chưa có số đo, chưa có cảnh báo.
- Lần **đối soát** (tự chẩn đoán L1/L3) gần nhất là khi nào, có quá hạn không? Hiện chỉ có số lỗi, không có mốc thời gian.
- Sự cố ở **đơn vị** nào? Phải tra được mà không gắn `tenant` vào nhãn số đo (R-OBS-4).

Giám sát chỉ **quan sát**. Sổ cái, `audit_logs`, `diagnostic_runs` mới là nguồn sự thật (AP-1, ràng buộc 5 của bản giao việc).

## 2. Ánh xạ bản giao việc → repo (D018-1)

Bản giao việc đề xuất tạo `/docs/observability/`, `/infra/monitoring/`, `/packages/observability/`, `compose.monitoring.yaml` và dặn **"điều chỉnh theo cấu trúc hiện có, không tự ý nhân đôi"**. Repo đã có nơi cho từng thứ, nên **không tạo thư mục mới song song**:

| Bản giao việc đề xuất | Đặt ở repo | Lý do |
|---|---|---|
| `docs/observability/00-REPO-AUDIT.md` | [10-HIEN-TRANG.md](10-HIEN-TRANG.md) | khuôn phase (docs/phases/README "Khuôn một phase") |
| `01-ARCHITECTURE-ADR.md` | [20-KIEN-TRUC.md](20-KIEN-TRUC.md) §1 + **ADR-0010** khi chủ duyệt (Q018-2) | ADR ở `docs/adr/` |
| `02-METRICS-CATALOG.md` | 20-KIEN-TRUC §2 (đề xuất) → khi code: bảng §3 [docs/ops/OBSERVABILITY.md](../../ops/OBSERVABILITY.md) | R-OBS-6: một bảng số đo duy nhất |
| `03-DASHBOARD-SPEC.md` | 20-KIEN-TRUC §3 + [mockups/](mockups/README.md) | — |
| `04-ALERT-RUNBOOK.md` | 20-KIEN-TRUC §4 → khi code: `docs/ops/RUNBOOK-CANH-BAO.md` | sổ tay vận hành ở `docs/ops/` |
| `05-SECURITY-TENANT-ISOLATION.md` | 20-KIEN-TRUC §5 | luật gốc R-TEN, R-SEC, R-OBS-4 |
| `06-ROLL-OUT-AND-ROLLBACK.md` | 20-KIEN-TRUC §6 → khi phát hành: `90-DEPLOY-LIST.md` | khuôn phase |
| `07-TEST-AND-ACCEPTANCE.md` | 20-KIEN-TRUC §7 + ca `T018-*` ở 40-MASTER-CHECKLIST | khuôn phase |
| `PHASE-STATUS.md` | [40-MASTER-CHECKLIST.md](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất |
| `/infra/monitoring/*` | `infrastructure/monitoring/` (đã có) | không nhân đôi |
| `/packages/observability/` | `apps/api/src/core/metrics.ts` + `observability.ts` (Platform); tách gói cùng đợt tách Platform (PHASE-010) | ADR-0008 cây thư mục gọn |
| `compose.monitoring.yaml` | `infrastructure/monitoring/docker-compose.monitoring.yml` (đã có) | không nhân đôi |
| tiền tố `openketoan_*` | giữ **`bizcity_*`** (D018-2) | ADR-0002; bản giao việc cho phép "đổi namespace khi đụng độ" |

## 3. Ràng buộc bất biến (giữ nguyên bản giao việc, dẫn luật repo)

1. Kysely + SQL migration, **không Prisma** (R-DB-14).
2. Không đổi hợp đồng miền / sự kiện / SDK, ngữ nghĩa ghi sổ, idempotency khi chưa có ADR + test (R-KER-1, R-KER-4).
3. Không nhãn số lượng không giới hạn: `tenant_id`, `document_id`, `entry_id`, `event_id`, `user_id`, `request_id`, `trace_id` (R-OBS-4). Không PII, MST, số tiền, payload chứng từ, token trong số đo / log / trace (R-SEC-10, R-OBS-2).
4. Prometheus **không** là nguồn sự thật; đối soát chạy trên dữ liệu giao dịch, chỉ công bố kết quả tổng hợp (AP-1).
5. `/metrics`, Grafana, Alertmanager không ra Internet; bí mật qua biến môi trường / `*_file` (R-OBS-3).
6. Giám sát **không bao giờ** làm hỏng hay chậm đường ghi sổ: lỗi số đo bị nuốt, có đo chi phí (R-KER-9, D018-4).
7. Không giả định Redis, NATS, Keycloak, Kong đã có (F7).
8. Đường ghi sổ tất định (R-KER-7): số đo **không** đọc ngược vào quyết định định khoản.

## 4. Quyết định (D018-*, chủ duyệt)

| Mã | Quyết định | Trạng thái |
|---|---|---|
| D018-1 | Ánh xạ đầu ra bản giao việc vào cấu trúc repo (§2), không tạo `docs/observability/`, `/infra/` song song | ✅ chủ duyệt 2026-11-01 ("ok code") |
| D018-2 | Giữ tiền tố `bizcity_` cho mọi số đo mới | ✅ chủ duyệt 2026-11-01 |
| D018-3 | ~~Cổng quan sát `registerPostingObserver`~~ → **đếm ghi sổ từ `posting_log`** bằng bộ thu (20-KIEN-TRUC §1.3): `postDocumentIn` chạy trong giao dịch của bên gọi nên không biết commit; `posting_log` ghi cùng giao dịch nên chỉ có phần đã commit; đường ghi sổ không đổi (K0) | ✅ sửa khi làm 2026-11-01 <!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — D018-3/D018-4 sửa theo mã thật (posting_log, statement_timeout). --> |
| D018-4 | ~~Đo chi phí trên đường ghi sổ~~ → đường ghi sổ không có lời gọi giám sát nào; bộ thu chạy giao dịch **chỉ đọc**, `statement_timeout` 5 s ở CSDL (không hẹn giờ — SC-EVT-1). Đo: `/metrics` trung bình 8 ms, lớn nhất 56 ms qua 97 lượt, 0 lỗi bộ thu (evidence W1-W4) | ✅ sửa khi làm 2026-11-01 |
| D018-5 | Phân loại theo `category` của `bizcity_errors@1`: `ledger` / `input` / `state` / `auth` = **từ chối nghiệp vụ**; `server` / `platform` / mã lạ = **lỗi kỹ thuật** | ✅ 2026-11-01 (thêm `auth`) |
| D018-6 | Số đo cấp đơn vị chỉ ở dạng **đếm theo dải**, drill-down từng đơn vị qua API backend có phân quyền, không qua nhãn Prometheus | ✅ 2026-11-01 |
| D018-7 | Trace OpenTelemetry là **tuỳ chọn** (W5), cần ADR-0010 vì thêm phụ thuộc npm ở Platform (R-KER-8 áp cho Kernel; Platform cũng phải qua duyệt) | chờ Q018-2 |

## 5. Câu hỏi cần chủ quyết (Q018-*)

| Mã | Câu hỏi | Gợi ý |
|---|---|---|
| Q018-1 | Đưa phase vào lộ trình chính thức (`docs/standard/PHASES.md`, `roadmap.json`) với mã việc mới (vd 2.17–2.20 cho W1–W4, 5.10–5.12 cho W5–W7), hay giữ ngoài lộ trình? | Thêm mã — để bảng điểm tự tính tiến độ (SC-PHASE-1). Tệp lộ trình đang được phiên khác sửa: thêm sau khi phiên đó commit. |
| Q018-2 | Chấp nhận OpenTelemetry SDK (`@opentelemetry/*`) ở Platform + Tempo tuỳ chọn? | Có, nhưng sau W4 và qua ADR-0010; MVP không cần |
| Q018-3 | Chu kỳ tự chẩn đoán / đối soát định kỳ trên máy chủ thật (để đặt ngưỡng `ReconciliationStale`) | mỗi đêm + trước khoá kỳ; cảnh báo khi > 26 giờ |
| Q018-4 | Kênh nhận cảnh báo thật (email / webhook Zalo qua cầu nối / Telegram) và người trực | chủ chọn; mặc định Alertmanager không gửi đi đâu |
| Q018-5 | Mục tiêu tải để đo năng lực (bản giao việc nêu 500 cửa hàng / 11 kho) — xác nhận số liệu và cơ cấu đơn vị | cần số thật trước W6 |
| Q018-6 | Có cần **vai trò vận hành liên đơn vị** (xem sức khoẻ của mọi đơn vị, không xem chứng từ) để drill-down từ dashboard 08? Mô hình quyền + RLS hiện chỉ theo một đơn vị | cần ADR riêng; trước đó dashboard 08 chỉ có số tổng hợp |

## 6. Tám đợt (W0–W7) và cổng nghiệm thu

Thứ tự bắt buộc W0 → W1 → W2 → W3 → W4; W5–W7 mở khi W4 đạt. Không sang đợt sau khi cổng đợt trước chưa đạt.

| Đợt | Bản giao việc | Ưu tiên | Làm gì (tóm tắt — chi tiết 20-KIEN-TRUC) | Cổng |
|---|---|---|---|---|
| **W0** | Phase 0 audit | P0 | khảo sát, kiến trúc, danh mục số đo đề xuất, bản mẫu dashboard; **đo mốc** (p50/p95/p99, pool, bộ nhớ) | mỗi kết luận có `tệp:dòng`; mốc đo có lệnh + kết quả (T018-1) |
| **W1** | Phase 1 nền số đo | P1 | cổng quan sát ghi sổ; `bizcity_postings_total`, `bizcity_posting_duration_seconds`, `bizcity_posting_rejections_total`; bão hoà pool | test: số đo hỏng không làm hỏng ghi sổ; chi phí ≤ 2% mốc R-KER-9 |
| **W2** | Phase 2 sự kiện + toàn vẹn | P1 | số đo outbox (chờ, tuổi, chết, lượt giao), idempotency (gửi lặp / xung đột), mốc + kết quả tự chẩn đoán | ca không cân bị từ chối có số đo; gửi lặp không ghi đôi; outbox giả lập dồn / chết phản ánh đúng |
| **W3** | Phase 3 dashboard | P1 | nâng 6 dashboard + thêm 07 Đường sự kiện, 08 Đa đơn vị, 09 Toàn vẹn sổ theo bản mẫu | dashboard tự nạp từ repo; không panel trống do sai tên; ảnh chụp với dữ liệu demo |
| **W4** | Phase 4 cảnh báo + runbook | P1 | thêm cảnh báo §4, runbook từng cảnh báo critical, định tuyến / im lặng / gom nhóm | test bắn / hết bắn bằng `promtool test rules`; không gửi dữ liệu tài chính |
| **W5** | Phase 5 log + trace | P2 | trace OTel tuỳ chọn (ADR-0010), Tempo tuỳ chọn, liên kết cảnh báo → panel → trace → log | một ca lỗi ghi sổ điều tra đầu-cuối không lộ chứng từ |
| **W6** | Phase 6 SLO + năng lực | P2 | SLI/SLO, đo tải, kịch bản sập (Prometheus / Grafana / CSDL chậm), lint cấu hình trong CI | có kết quả đo; ghi sổ vẫn đúng khi giám sát sập |
| **W7** | Phase 7 widget CEO | P3 | API `health summary` có phân quyền; widget 4 chỉ số trong app / Cell | test chéo đơn vị, không dữ liệu / dữ liệu cũ hiển thị đúng |

## 7. Luật thực thi của phase

- W0 **không** sửa mã chạy. Từ W1: nhánh riêng, mỗi commit quay lui được, PR qua rà soát RULE-REVIEW §7 (11 trục).
- Đụng `apps/api/src/modules/{documents,posting,ledger}` = tệp Kernel: ghi **Mức Kernel** (dự kiến K0–K1: chỉ thêm quan sát, không đổi hành vi ghi sổ).
- Thêm số đo / cảnh báo / dashboard: sửa bảng §3 / §4 [OBSERVABILITY.md](../../ops/OBSERVABILITY.md) cùng PR (R-OBS-6).
- Chỗ mơ hồ ghi **Giả định / Bằng chứng / Quyết định / Rủi ro**; không bịa API hay bảng.
- Mỗi đợt kết thúc bằng báo cáo theo mẫu §13 của bản giao việc, lưu ở `evidence/W<n>-<ngày>.md`.
