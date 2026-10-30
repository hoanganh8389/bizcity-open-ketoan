# PHASE-006 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S006-1 | Migration outbox / deliveries / consumptions | 3.4 | chưa | ☐ |
| S006-2 | `ctx.events.emit` trong giao dịch action | 3.4 | chưa | ☐ |
| S006-3 | Dispatcher `FOR UPDATE SKIP LOCKED`, retry luỹ thừa, `dead` hiện ở chẩn đoán | 3.4 · G2-05 | chưa | ☐ |
| S006-4 | Kernel phát `bizcity.ledger.entry.posted / reversed`, `bizcity.period.locked` | 3.4 | chưa | ☐ |
| S006-5 | Thay `catalog-notify.ts` bằng subscriber; SC-EVT-1 hết nợ | 3.4 | chưa | ☐ |
| S006-6 | Đồng hồ `bizcity.clock.daily / hourly` | 3.4 | chưa | ☐ |
| S006-7 | Replay theo consumer + check thực thi AP-6 (gỡ nợ SC-CMP-2) | 3.4 | chưa | ☐ |
| S006-8 | `correlation_id` từ `X-Correlation-Id` / MCP vào bằng chứng và sự kiện (C-8) | — | chưa | ☐ |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T006-1 | Giao một sự kiện hai lần | một hiệu ứng (CONF-RUN-10) | ☐ |
| T006-2 | Huỷ giao dịch sau `emit` | không có dòng outbox | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
