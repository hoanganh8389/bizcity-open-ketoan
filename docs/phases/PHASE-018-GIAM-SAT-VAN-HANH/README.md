# PHASE-018 — Giám sát vận hành và toàn vẹn sổ (observability)
<!-- [2026-10-31 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-018 — mở phase giám sát vận hành: kế hoạch, hiện trạng đọc mã, kiến trúc, bản mẫu dashboard -->
<!-- [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — trạng thái sau W1–W4 (có mã, có bằng chứng chạy thật). -->

> **Trạng thái:** 🟡 W0–W4 (P0/P1) **có mã + bằng chứng** 2026-11-01 ([evidence](evidence/W1-W4-2026-11-01.md)) · còn: mốc đo máy chủ thật (S018-4), vài việc P1/P2 nhỏ · W5–W7 chờ Q018-2 / Q018-5 / Q018-6
> **Giai đoạn:** mở rộng của việc lộ trình 2.13 (đã xong ở bộ giám sát nền) · **Code:** có (nhánh `feat/phase-018-giam-sat`) · **Mức Kernel:** K0 (không đổi hành vi ghi sổ) · **Tiến độ tín hiệu (2026-11-01):** —
> **Mục tiêu:** Dev/Ops và người quản trị trả lời được bốn câu: (1) dịch vụ có khoẻ không, (2) luồng sự việc → định khoản → sổ có trễ / lỗi không, (3) sổ có toàn vẹn, đối soát được không, (4) sự cố nằm ở đơn vị, dịch vụ, việc nền nào — **mà không** biến giám sát thành nguồn sự thật kế toán.
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** AP-1, AP-2, AP-7 · R-OBS-1..6 · R-CACHE-1 · R-KER-7, R-KER-9 · R-SEC-*, R-TEN-*
> **Phụ thuộc phase:** 003 (quan sát nền, 2.13), 006 (outbox), 007 (RLS) · **Liên quan:** 015 (Cell — widget CEO W7)
> **Nguồn yêu cầu:** bản giao việc "BIZCITY OPEN KẾ TOÁN — OBSERVABILITY IMPLEMENTATION ROADMAP" (2026-10-31) của chủ dự án; ánh xạ vào cấu trúc repo ở [00-MASTER-PLAN §2](00-MASTER-PLAN.md).

> **Bản quyền kiến trúc:** © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity. Kiến trúc Bizcity Core Framework và tầng giám sát này do Johnny Chu – Chu Hoàng Anh thiết kế; mã nguồn phát hành theo [GPL-2.0-or-later](../../../LICENSE), tên và logo BizCity theo [TRADEMARK.md](../../../TRADEMARK.md). Mọi phần mở rộng của phase phải dựng **trên nền đã chuẩn hoá** (hợp đồng, luật, bộ kiểm) — không dựng song song.

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, ánh xạ bản giao việc → repo, quyết định D018-*, câu hỏi Q018-*, tám đợt W0–W7, cổng nghiệm thu |
| [10-HIEN-TRANG](10-HIEN-TRANG.md) | khảo sát repo (Phase 0 của bản giao việc): có / kế hoạch / chưa có, luồng thật, khoảng trống P0–P2 |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | kiến trúc giám sát Bizcity, danh mục số đo + ngân sách nhãn, đặc tả dashboard, cảnh báo + runbook, bảo mật đa đơn vị, triển khai / quay lui, ma trận test |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất `S018-*` + ca bằng chứng + log |
| [mockups/](mockups/README.md) | bản mẫu dashboard đích (HTML tĩnh, số liệu giả lập) |

## Hiện trạng đọc mã

Chi tiết và bằng chứng đủ ở [10-HIEN-TRANG](10-HIEN-TRANG.md). Tóm tắt:

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Bộ số đo tự viết, không phụ thuộc npm, tiền tố `bizcity_`, 13 số đo, không nhãn `tenant` | `apps/api/src/core/metrics.ts:68-80`, `docs/ops/OBSERVABILITY.md` §3 |
| F2 | `GET /metrics` nội bộ, `METRICS_TOKEN` so khớp hằng thời gian; nginx không chuyển ra ngoài | `apps/api/src/modules/system/metrics.routes.ts:26-39`, R-OBS-3 |
| F3 | Có `GET /api/v1/system/health` và `/health/ready` (hai khái niệm tách) | `apps/api/src/modules/system/system.routes.ts:141,151` |
| F4 | Bộ giám sát tuỳ chọn: Prometheus 2.53, Alertmanager 0.27, Grafana 11.4, Loki/Promtail 3.3, postgres-exporter, node-exporter, cAdvisor; 6 dashboard, 8 cảnh báo | `infrastructure/monitoring/` |
| F5 | Ghi sổ **đồng bộ** trong giao dịch (AP-2) — không có posting worker / hàng đợi; outbox `event_outbox` → `event_deliveries` (`pending`/`done`/`dead`) | `db/migrations/0039_su_kien_mien.sql:12,32,36`, `apps/api/src/core/events.ts` |
| F6 | Lúc khảo sát (2026-10-31) **chưa** có số đo ghi sổ, outbox, mốc đối soát, trace OTel, SLO, widget CEO. **Sau W1–W4 (2026-11-01):** đã có số đo ghi sổ (từ `posting_log`), outbox, gửi lặp, đối soát, đơn vị theo dải; 9 dashboard; 14 cảnh báo; runbook. Còn chưa có: trace OTel, SLO, widget CEO | `apps/api/src/modules/documents/posting.metrics.ts`, `core/events.ts`, `core/actions.ts`, `modules/system/metrics.routes.ts`, `infrastructure/monitoring/` |
| F7 | Không có Redis, NATS, Keycloak, Kong trong mã / compose | `git grep` 2026-10-31 — chỉ nhắc trong tài liệu |

## Xong khi

Phase xong khi mọi việc `S018-*` ở [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) ✅ với ca bằng chứng `T018-*`, và cổng W1–W4 (P1) đạt. W5–W7 (P2/P3) có thể tách phase sau theo Q018-1 ([00-MASTER-PLAN §5](00-MASTER-PLAN.md)).
