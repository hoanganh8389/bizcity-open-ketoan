# PHASE-006 — Transactional outbox, subscriber, đồng hồ, correlation
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> **Mức:** Platform (P) + điểm phát trong Kernel (K1: thêm ghi outbox trong giao dịch sổ, không đổi kết quả sổ). Hợp đồng: [`bizcity_event@1`](../../contracts/BIZCITY-EVENT-v1.md), luật [R-OUTBOX-1..7](../../rules/RULE-INFRASTRUCTURE.md).

<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — Chủ: "tiếp tục" sau PHASE-004 (đề xuất làm 006) ⇒ thiết kế theo hợp đồng đã công bố, không có câu hỏi mở cần chủ chốt. -->

## 1. Thiết kế đã chọn (D006-*)

| # | Quyết định | Lý do |
|---|---|---|
| D006-1 | Ba bảng (migration `0039`): `event_outbox` (UUID v7 + `seq`, cấm UPDATE, chỉ xoá khi quá hạn), `event_deliveries`, `event_consumptions`; hai bảng sau có `tenant_id` (RLS sau này, SC-DATA-5) | đúng §5 hợp đồng; chỉ PostgreSQL (ADR-0007) |
| D006-2 | **Việc giao tạo lúc phát**, cho mọi subscriber đang đăng ký loại đó, trong cùng giao dịch | không cần con trỏ theo consumer; không mất việc giao khi tiến trình chết. Đổi lại: subscriber mới không nhận sự kiện cũ — dùng phát lại |
| D006-3 | Một giao dịch mỗi việc giao: khoá dòng giao `SKIP LOCKED` → chèn `(consumer, event_id)` → handler với `ctx.tx` → `done`. Lỗi: huỷ, ghi lần thử ở giao dịch riêng, hẹn giãn nhịp; hết lượt → `dead` | hiệu ứng CSDL của subscriber và dấu đã xử lý cùng commit: giao lại không làm trùng (STD-EVT-2) |
| D006-4 | Thứ tự: cùng consumer, (đơn vị, subject) thì việc sau chờ việc trước còn `pending`; `dead` không chặn | R-OUTBOX-5; một subject hỏng không treo cả hàng |
| D006-5 | Dispatcher + đồng hồ chạy trong tiến trình API (`main.ts`); test không chạy vòng mà gọi `dispatchOnce` / `tickClock` | một tiến trình là đủ ở quy mô hiện tại; tách tiến trình ở Phase 5 không đổi bảng |
| D006-6 | Đồng hồ chỉ phát khi có subscriber; `dedupe_key` theo giờ / ngày giờ VN | nhiều bản API cùng chạy vẫn một lần; không đổ đầy outbox vô ích |
| D006-7 | `correlation_id` qua AsyncLocalStorage: header `X-Correlation-Id` hợp lệ, không thì mã yêu cầu; gắn vào cả `event_outbox` và `audit_logs` (kể cả `writeAudit` cũ) | C-8; không phải truyền tay qua từng hàm |
| D006-8 | `catalog-notify` thành subscriber `catalog.notify-sales` (Idempotency-Key = id sự kiện, thử lại tối đa 5 lần); gom khung 5 giây bằng `dedupe_key` thay hẹn giờ trong bộ nhớ | bỏ nợ SC-EVT-1 / A-22 |
| D006-9 | AP-6 thực thi bằng **SC-EVT-2** (subscriber id cố định; gọi HTTP ra ngoài phải có Idempotency-Key) + **DG-EVT-1** / `EVENT_DEAD` (không có việc giao chết nằm im) | SC-CMP-2: nguyên tắc nào cũng phải có check |

## 2. Giới hạn đã biết (ghi nợ, không chặn phase)

| # | Giới hạn | Khi nào gỡ |
|---|---|---|
| L006-1 | Sự kiện danh mục phát ở hook `onResponse` **sau** commit của route danh mục (route cũ chưa là action) → nếu tiến trình chết giữa hai bước thì mất một lần báo; bên bán hàng vẫn tự kéo 5 phút | khi route danh mục thành `defineAction` (PHASE-011) thì phát trong giao dịch |
| L006-2 | Tốc độ giao đo thử khoảng 50–60 việc / giây (một giao dịch mỗi việc, có kiểm thứ tự) | đủ cho 30.000 chứng từ / ngày; tối ưu ở PHASE-016 |
| L006-3 | Subscriber chỉ là của Platform (`core.events-retention`, `catalog.notify-sales`); module đăng ký qua SDK khi có `@bizcity/module-sdk` | PHASE-011 |
| L006-4 | Kernel chưa phát `bizcity.ledger.event.received` / `.failed`, `bizcity.masterdata.partner.changed`, `bizcity.module.enabled` / `.disabled` | khi có subscriber cần |
| L006-5 | Khoá cấu hình `bizcity.platform.event_retention_days` chưa có: hạn giữ cố định 90 ngày (`EVENT_RETENTION_DAYS`) | khi có `settings.get` (PHASE-011) |
