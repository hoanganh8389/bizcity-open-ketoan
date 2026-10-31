# PHASE-006 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh). -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — Chủ: "tiếp tục" ⇒ code. -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S006-1 | Migration `0039`: `event_outbox` (cấm UPDATE), `event_deliveries`, `event_consumptions` (có `tenant_id`, COMMENT đủ); `db/types.ts`, `schema-catalog.ts` | 3.4 | có | ✅ SC-DATA-3 / -5 / -7 không nợ mới |
| S006-2 | `emitEvent` cùng giao dịch + `ctx.events.emit` của runtime action (kiểm tiền tố module) | 3.4 · G2-05 | có | ✅ `core/events.ts`, `core/actions.ts` |
| S006-3 | Dispatcher `SKIP LOCKED`, một giao dịch mỗi việc, thử lại giãn nhịp, `dead`, thứ tự trong subject; vòng chạy ở `main.ts` | 3.4 · G2-05 | có | ✅ test + chạy thật trên `ketoan_test` |
| S006-4 | Kernel phát `bizcity.ledger.entry.posted` (cửa nạp + `eventStore.markPosted`), `.reversed` (huỷ, bỏ định khoản, `eventStore.cancel`), `bizcity.period.locked` / `.unlocked` (3 đường khoá) | 3.4 | có | ✅ |
| S006-5 | `catalog-notify.ts` → subscriber `catalog.notify-sales`; SC-EVT-1 hết nợ | 3.4 | có | ✅ baseline 206 → 204 |
| S006-6 | Đồng hồ `bizcity.clock.hourly / daily` + subscriber dọn outbox `core.events-retention` | 3.4 | có | ✅ |
| S006-7 | Phát lại `core.events.replay` (bằng chứng tự động), `core.events.status`; tự chẩn đoán `EVENT_DEAD` + DG-EVT-1; SC-EVT-2; AP-6 có cách thực thi | 3.4 | có | ✅ SC-CMP-2 100% |
| S006-8 | `correlation_id` từ `X-Correlation-Id` (AsyncLocalStorage) vào `event_outbox` và `audit_logs` | — | có | ✅ C-8 100% |
| S006-9 | Năng lực `events.outbox`, `events.subscribe`, `events.clock` → available; tài liệu: `bizcity_event@1` §2 / §7 / §8, R-OUTBOX "Kiểm bằng", DIAGNOSTICS, CONG-BO, COMPLIANCE, PHASES 3.4, CHANGELOG | 3.4 | — | ✅ |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T006-1 | Giao dịch huỷ sau `emitEvent` | không có dòng outbox, không việc giao (R-OUTBOX-1) | ✅ `test/events.test.ts` |
| T006-2 | Giao một sự kiện hai lần (dấu đã xử lý còn) | handler chạy một lần (CONF-RUN-10) | ✅ |
| T006-3 | Subscriber lỗi | thử lại → `dead` sau maxAttempts; `EVENT_DEAD` đếm 1; sự kiện sau cùng subject chờ, subject khác vẫn giao | ✅ |
| T006-4 | Ghi phiếu thu với `X-Correlation-Id` | `bizcity.ledger.entry.posted` + bằng chứng cùng `correlation_id`; huỷ → `entry.reversed` | ✅ |
| T006-5 | Đồng hồ gọi hai lần cùng ngày; 00:30 giờ VN | một sự kiện / ngày / đơn vị; trước 01:00 không phát | ✅ |
| T006-6 | Phát lại qua API | xử lý lại, có biên nhận bằng chứng | ✅ |
| T006-7 | Chạy `main.ts` thật trên `ketoan_test` 24 giây | dispatcher xử lý hàng chờ (≈ 50–60 việc / giây), không lỗi; tắt sạch | ✅ |
| T006-8 | `npm test` đầy đủ + lane diagnostics | xanh | ✅ 90/90 tệp, 721/721 test; `selfcheck --strict` kèm CSDL ĐẠT; DG-EVT-1 có 5 việc `dead` đều của `test.probe` / subject `hong` (ca lỗi cố ý của T006-3, mỗi lần chạy test thêm một) |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Chủ "tiếp tục" ⇒ code S006-1…9. Test mới `events.test.ts` 9/9 (chạy lặp lại được: dispatcher / đồng hồ lọc theo đơn vị của test). Tìm thấy khi viết test: `tickClock` không lọc thì đổ việc giao cho mọi đơn vị trong CSDL test — thêm tuỳ chọn `tenantIds` / `tenantId`. Bộ kiểm: SC-EVT-1 hết nợ, SC-EVT-2 mới (block, có ca tự kiểm), SC-CMP-2 100%, C-5 0 → 100%, C-8 → 100%. |
| 2026-10-30 | Claude Code | T006-8: vitest 721/721; lane diagnostics ĐẠT; ma trận tuân thủ 66% → 81% (6 đạt, 2 một phần, 1 thiếu: C-9); lộ trình 35% → 36%; Phase 3: 1/12 xong. |
