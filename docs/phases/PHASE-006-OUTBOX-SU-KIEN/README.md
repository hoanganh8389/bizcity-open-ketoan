# PHASE-006 — Transactional outbox, subscriber, đồng hồ, correlation

> **Trạng thái:** ☐ chưa code · gỡ nợ AP-6 (SC-CMP-2) và C-5
> **Giai đoạn:** Phase 3 của [PHASES](../../standard/PHASES.md) · **Code:** chưa · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Sự kiện miền ghi cùng giao dịch với dữ liệu, giao sau commit, ít nhất một lần, consumer chống trùng; Kernel phát `bizcity.ledger.*`; bỏ `setTimeout` báo danh mục.
> **Việc lộ trình:** 3.4
> **Checklist công bố:** G2-05
> **Tuân thủ / nguyên tắc:** C-5 (0%), C-8 (correlation) · AP-2, AP-6
> **Phụ thuộc phase:** 004 (Kernel phát sự kiện từ một cửa ghi)

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Chưa có bảng `event_outbox`, `event_deliveries`, `event_consumptions` | `db/migrations/` |
| F2 | Báo danh mục đổi bằng `setTimeout` trong bộ nhớ, mất khi khởi động lại (SC-EVT-1, A-22) | `modules/catalog/catalog-notify.ts:17, 30` |
| F3 | `audit_logs.correlation_id` có cột nhưng chưa ai gán từ yêu cầu | migration `0036` |
| F4 | Hợp đồng `bizcity_event@1` (đề xuất) đã định phong bì, bảo đảm, luật STD-EVT-1..7 | `docs/contracts/BIZCITY-EVENT-v1.md`, R-OUTBOX-1..7 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 3.4 ☐.
