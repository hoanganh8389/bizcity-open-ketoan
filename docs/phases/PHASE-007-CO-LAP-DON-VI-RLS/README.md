# PHASE-007 — Cô lập đơn vị: `ctx.data.tx`, RLS, kiểm tấn công chéo đơn vị
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS. -->
<!-- [2026-10-31 11:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — view danh mục bizcity_read có (2.4 ☑) -->

> **Trạng thái:** 🟡 RLS 84 bảng + gắn đơn vị theo yêu cầu + thử tấn công chéo: có (2026-10-30). View danh mục `bizcity_read.*` có (2026-10-31, 0044). Còn migration theo module; ⛔ bản cài thật chạy API bằng `ketoan_app`
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Đơn vị A không đọc / ghi được dữ liệu đơn vị B kể cả khi code quên lọc `tenant_id`: RLS ở CSDL, giao dịch đặt `bizcity.tenant_id`, kiểm chéo qua API, MCP.
> **Việc lộ trình:** 2.4
> **Checklist công bố:** G1-05, G3-06
> **Tuân thủ / nguyên tắc:** C-7 · DG-PLAN-5
> **Phụ thuộc phase:** —

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | thiết kế D007-1…6, số đo hiệu năng, giới hạn |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã (trước khi code)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Mọi truy vấn lọc `tenant_id` trong code; chưa có `ENABLE ROW LEVEL SECURITY` trong migration nào | `db/migrations/` |
| F2 | Vai trò `ketoan_app` không superuser, không BYPASSRLS (DG-SEC-1 đạt) — sẵn để bật RLS | migration `0032` |
| F3 | ~~Năng lực `data.tenant-tx`, `data.read-views` đang `planned`~~ (cả hai available 2026-10-31); DG-PLAN-5 chưa sẵn sàng | `bizcity-standard.json` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.4 ☐.
