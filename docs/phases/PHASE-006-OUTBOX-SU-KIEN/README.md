# PHASE-006 — Transactional outbox, subscriber, đồng hồ, correlation
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->

> **Trạng thái:** ✅ code xong 2026-10-30. Gỡ nợ AP-6 (SC-CMP-2: 7/7 nguyên tắc có cách thực thi); C-5, C-8 đạt
> **Giai đoạn:** Phase 3 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 100% (trước khi code: 0%)
> **Mục tiêu:** Sự kiện miền ghi cùng giao dịch với dữ liệu, giao sau commit, ít nhất một lần, consumer chống trùng; Kernel phát `bizcity.ledger.*`; bỏ `setTimeout` báo danh mục.
> **Việc lộ trình:** 3.4
> **Checklist công bố:** G2-05
> **Tuân thủ / nguyên tắc:** C-5 (0% → 100%), C-8 (67% → 100%) · AP-2, AP-6
> **Phụ thuộc phase:** 004 (Kernel phát sự kiện từ một cửa ghi)

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — Chủ: "tiếp tục" (sau PHASE-004, đề xuất làm 006 kế tiếp) ⇒ code W0–W4. -->

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | thiết kế đã chọn D006-1…9 (outbox, giao, đồng hồ, tương quan), giới hạn đã biết |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |
| [70-REFLECT-004](70-REFLECT-004.md) | phản tư PHASE-004 + nợ chuyển sang |

## Hiện trạng đọc mã (trước khi code)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Chưa có bảng `event_outbox`, `event_deliveries`, `event_consumptions` | `db/migrations/` |
| F2 | Báo danh mục đổi bằng `setTimeout` trong bộ nhớ, mất khi khởi động lại (SC-EVT-1, A-22) | `modules/catalog/catalog-notify.ts:17, 30` |
| F3 | `audit_logs.correlation_id` có cột nhưng chưa ai gán từ yêu cầu | migration `0036` |
| F4 | Hợp đồng `bizcity_event@1` (đề xuất) đã định phong bì, bảo đảm, luật STD-EVT-1..7 | `docs/contracts/BIZCITY-EVENT-v1.md`, R-OUTBOX-1..7 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái: 3.4 ✅ (`events.outbox`, `events.subscribe`, `events.clock` available; SC-EVT-1 hết nợ); G2-05 **có**.
