# PHASE-019 — Bàn điều tra cho nhà phát triển (Dev Console)
<!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — Bàn điều tra cho nhà phát triển: sổ tay điều tra lỗi theo tình huống + thiết kế UI/UX dev trên Prometheus, Loki, Tempo, Grafana, Alertmanager -->

<!-- [2026-11-02 04:01 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — trạng thái đóng phase: W1–W5 xong; còn S019-3, S019-4, Q019-4 chờ chủ; S019-19 để sau -->
> **Trạng thái:** ✅ W1–W5 có mã + bằng chứng (2026-11-01 → 11-02) · ⛔ còn ba việc chờ chủ: duyệt kiến trúc + bố cục bản mẫu (S019-3, S019-4), Q019-4 đưa vào lộ trình (cùng Q018-1; mã 2.17–2.21 nay thuộc PHASE-021 → cần mã khác) · ⏸ S019-19 MCP cho máy dev (chủ để sau)
<!-- [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — ghi quyết định của chủ: D019-1..3, Q019-1 (b), Q019-2. -->
> **Giai đoạn:** mở rộng của PHASE-018 (giám sát vận hành) · **Code:** có (W1–W5) · **Mức Kernel:** K0 (không đụng Kernel, không đụng đường ghi sổ)
> **Mục tiêu:** dev của phân hệ / add-in (người đóng góp, dev của đơn vị) **tự tìm ra lỗi của mình ngay trong app**, từ một mã lỗi đến đúng module, đúng bước, đúng câu CSDL — mà **không** vào Grafana, **không** thấy dữ liệu của đơn vị khác, **không** có đường nào sửa sổ.
> **Việc lộ trình:** —
> **Phân hệ:** he-thong <!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: dòng Phân hệ (R-FLOW-10) cho HT11 -->
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** AP-1, AP-2, AP-7 · R-OBS-1..8 · R-SEC-*, R-TEN-* · R-ERR-5
> **Phụ thuộc phase:** 018 (bộ giám sát, OpenTelemetry W5), 007 (RLS) · **Liên quan:** 013 (ui-kit), 015 (Cell — dev Cell dùng chung màn Tra mã)
> **Nguồn yêu cầu:** chủ dự án 2026-11-01 — "tạo tài liệu hướng dẫn để các dev như Thủy có thể dùng bộ Grafana, Prometheus, Loki, Tempo để bắt lỗi theo từng tình huống, và lồng vào UI của open-ketoan mục dành cho nhà phát triển".

> **Bản quyền kiến trúc:** © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity. Kiến trúc Bizcity Core Framework do Johnny Chu – Chu Hoàng Anh thiết kế; mã nguồn phát hành theo [GPL-2.0-or-later](../../../LICENSE), tên và logo BizCity theo [TRADEMARK.md](../../../TRADEMARK.md). Phase dựng **trên** bộ giám sát của PHASE-018 — không dựng kho quan sát song song.

| Tài liệu | Một câu |
|---|---|
| [Sổ tay điều tra lỗi](../../ops/SO-TAY-DIEU-TRA-LOI.md) | **dùng được ngay hôm nay:** 14 tình huống, mỗi tình huống bắt đầu ở đâu, gõ PromQL / LogQL / TraceQL gì, đọc kết quả, sửa ở đâu |
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, quyết định D019-*, câu hỏi Q019-*, sáu đợt W0–W5, cổng nghiệm thu |
| [10-HIEN-TRANG](10-HIEN-TRANG.md) | đọc mã: app đang có gì cho dev, thiếu gì (kèm `tệp:dòng`) |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | kiến trúc Bàn điều tra: hai chế độ, API trung gian lọc theo đơn vị, bản đồ màn, luật UX, bảo mật, test |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con `S019-*` + ca bằng chứng `T019-*` + log |
| [mockups/](mockups/README.md) | bản mẫu UI tĩnh của Bàn điều tra (số liệu giả lập) |

## Trả lời ngắn câu hỏi của chủ dự án

**Có lồng được vào UI không?** Có — nhưng **không nhúng Grafana** (iframe). Grafana nhìn được mọi đơn vị, đăng nhập riêng, chỉ mở trên `127.0.0.1`; PHASE-018 đã chốt "người dùng đơn vị không vào Grafana" ([20-KIEN-TRUC §5](../PHASE-018-GIAM-SAT-VAN-HANH/20-KIEN-TRUC.md)). Thay vào đó:

- App có phân hệ **Nhà phát triển** (Bàn điều tra). Màn nào cũng đọc qua **API trung gian của Core**: API gắn bộ lọc đơn vị phía máy chủ, chỉ chạy **mẫu truy vấn có sẵn** (không nhận PromQL / LogQL / TraceQL tự do), cắt khung thời gian và cỡ kết quả, lọc trường lần nữa trước khi trả.
- **Chế độ Đơn vị** (mặc định): dev chỉ thấy trace, log, ghi sổ, sự kiện, tự chẩn đoán **của đơn vị mình**.
- **Chế độ Vận hành** (chỉ bản cài một đơn vị, `DEVTOOLS_OPS=true` — Q019-2, chủ chốt): thêm sức khoẻ toàn hệ thống từ Prometheus, cảnh báo đang bắn từ Alertmanager và **link sâu** sang 9 dashboard / Explore của Grafana.
- Thông báo lỗi ở mọi màn hiện **Mã tra cứu** (`requestId` + `traceId`) có nút chép và nút "Mở trong Bàn điều tra" — việc đầu tiên (W1), vì hôm nay app **bỏ mất** hai mã này.

## Hiện trạng đọc mã

Chi tiết ở [10-HIEN-TRANG](10-HIEN-TRANG.md). Tóm tắt:

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | API trả `error.requestId` và `error.traceId`, nhưng `ApiError` của web chỉ giữ `code`, `message`, `status`, `details` — người dùng không có mã để gửi | `apps/web/src/lib/api.ts:9-11,71` |
| F2 | Không có màn nào cho dev xem trace / log / số đo trong app. Có màn **Thử API** (phân hệ API) và **Kiến trúc** | `apps/web/src/phan-he/api/routes.tsx`, `apps/web/src/pages.tsx:107` |
| F3 | Mô hình quyền không có quyền / vai trò cho dev hay vận hành | `apps/api/src/core/auth.ts:29-53` |
| F4 | Đã có API đọc được dùng lại: tình trạng sự kiện, tự chẩn đoán + lịch sử, nhật ký định khoản | `modules/system/events.routes.ts:24`, `system.routes.ts:165,195,211`, `/api/v1/posting-log` |
| F5 | Span có `bizcity.tenant` (HTTP sau xác thực, action, giao sự kiện) → API trung gian kiểm được trace thuộc đơn vị nào | `core/observability.ts:54`, `core/actions.ts:200`, `core/events.ts:190` |
| F6 | Loki có nhãn `service`, `level`, `tenant`, `errCode`, `evt`; `reqId`, `traceId` là siêu dữ liệu; nhãn `tenant` có thể bị bỏ (`LOKI_LABELDROP`) | `infrastructure/monitoring/promtail/promtail-config.yml:78-90` |
| F7 | Không có API tra bằng chứng theo `trace_id` / `request_id` (chỉ `GET /api/v1/evidence/:id`) | `modules/system/evidence.routes.ts:37` |

## Xong khi

Phase xong khi mọi việc `S019-*` ở [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) ✅ với ca bằng chứng `T019-*`, và cổng của từng đợt ([00-MASTER-PLAN §6](00-MASTER-PLAN.md)) đạt — đặc biệt ca **T019-2**: dev đơn vị A dán `traceId` của đơn vị B nhận "không tìm thấy", không lộ gì.
