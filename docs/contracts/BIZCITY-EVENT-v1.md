# `bizcity_event@1` — Event Contract (sự kiện miền)

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 5/7)
> **Năng lực:** `events.outbox`, `events.subscribe`, `events.clock`
> **Lớp kiểm soát 2/3** của [Bản công bố kiến trúc](../CONG-BO-KIEN-TRUC.md) (Domain · **Event** · Compliance). Sự kiện được phát, phiên bản (`version`), cấu trúc payload (schema theo `type` + `version`), nguồn phát (`source`), ý nghĩa nghiệp vụ.
> - **AP-2:** sự kiện **báo** việc đã xảy ra sau commit, không dùng để ra lệnh ghi sổ.
> - **AP-6:** phát lại được; consumer idempotent theo `event_id`; không giả định exactly-once.
> - **R-OUTBOX:** sự kiện ghi cùng giao dịch, gửi sau commit.
>
> Nghiệp vụ nào đồng bộ, nghiệp vụ nào theo sự kiện: [CONG-BO-KIEN-TRUC §3.2](../CONG-BO-KIEN-TRUC.md).
> **Đừng nhầm:** tên này trước 2026-10-29 dùng cho khuôn nạp sổ, nay là [`bizcity_ledger_intake@1`](BIZCITY-LEDGER-INTAKE-v1.md).

## 1. Hai khái niệm, hai từ

| | **Sự việc kế toán** (accounting event) | **Sự kiện miền** (domain event) |
|---|---|---|
| Là gì | một nghiệp vụ kinh tế cần ghi sổ | "một việc đã xảy ra" để module khác phản ứng |
| Bảng | `accounting_events` (+ versions) | `event_outbox` (+ `event_deliveries`, `event_consumptions`) |
| Hợp đồng | `bizcity_ledger_intake@1` | `bizcity_event@1` (tệp này) |
| Hướng | module → Kernel | ai cũng phát, ai cũng nghe (theo manifest) |
| Ví dụ | `customer_payment` 5.000.000đ | `hop-dong.contract.approved`, `bizcity.ledger.entry.posted` |

## 2. Hiện trạng

Chưa có sự kiện miền. Chỗ gần nhất là `modules/catalog/catalog-notify.ts`: báo hệ thống bán hàng "danh mục đổi" bằng `setTimeout` trong bộ nhớ, mất khi khởi động lại, không retry (A-22). Không có lịch chạy việc định kỳ, nên nhắc hạn hợp đồng chỉ là màn xem (`GET /contract-schedules?from=&to=`), không tự nhắc.

## 3. Phong bì sự kiện

```json
{
  "id": "0192f3a4-7c1e-7b4a-9d2e-5f6a7b8c9d0e",
  "type": "hop-dong.installment.due",
  "version": 1,
  "tenantId": "1",
  "occurredAt": "2026-11-05T01:00:00Z",
  "source": { "module": "acme.hop-dong", "moduleVersion": "0.1.0" },
  "subject": "hop-dong.installment:118",
  "actor": { "kind": "system", "id": "clock" },
  "correlationId": "0192f3a4-0000-7000-8000-000000000001",
  "causationId": "0192f3a3-…",
  "data": { "contractCode": "HD-2026-0007", "seq": 3, "dueDate": "2026-11-10", "amount": 15000000, "partnerCode": "KH001" }
}
```

| Trường | Nghĩa |
|---|---|
| `id` | UUID v7 (có thứ tự thời gian); khoá chống trùng |
| `type` | `<key>.<thực thể>.<việc ở quá khứ>`; sự kiện của Core bắt đầu bằng `bizcity.` |
| `version` | phiên bản khuôn `data` của **loại sự kiện này** (không phải phiên bản chứng từ) |
| `subject` | `docRef` của đối tượng; khoá thứ tự (§5) |
| `actor` | `user` / `apikey` / `ai` / `system`; AI kèm `via` (vd `cell:zalo-hub`) |
| `correlationId`, `causationId` | lần ngược chuỗi phản ứng (request → action → sự kiện → subscriber → action…) |
| `data` | chỉ mã và số; **không** chứa dữ liệu cá nhân thô (STD-DATA-10), không chứa tài khoản kế toán |

## 4. Phát và nghe

```ts
// trong action (cùng giao dịch với thay đổi dữ liệu)
await ctx.events.emit('hop-dong.contract.approved', { contractCode, partnerCode, totalAmount }, { subject: docRef });

// subscriber — modules/hop-dong/api/subscribers/remind-due.ts
export default defineSubscriber({
  id: 'hop-dong.remind-due',                         // = consumer; đổi id = mất lịch sử đã xử lý
  on: 'bizcity.clock.daily',
  retry: { maxAttempts: 8, backoff: 'exponential', maxDelay: '1h' },
  async handle(ctx, evt) {
    const due = await findInstallmentsDueIn(ctx, ctx.settings.get('bizcity.hop_dong.remind_days'));
    for (const i of due) await ctx.events.emit('hop-dong.installment.due', toData(i), { subject: i.docRef });
  },
});
```

## 5. Bảo đảm của Core

| Bảo đảm | Cách làm |
|---|---|
| **Không mất** | Transactional outbox: sự kiện ghi vào `event_outbox` trong **cùng giao dịch** với dữ liệu. Giao dịch huỷ thì sự kiện cũng không có |
| **Ít nhất một lần** | Dispatcher đọc outbox bằng `FOR UPDATE SKIP LOCKED`, giao cho từng subscriber, ghi `event_deliveries` (số lần, lỗi cuối, hẹn lần sau) |
| **Không thực thi trùng** | Trước `handle`, runtime chèn `(consumer, event_id)` vào `event_consumptions` (khoá duy nhất) **trong cùng giao dịch** với việc subscriber làm. Giao lại lần hai → khoá trùng → bỏ qua. Subscriber không cần tự chống trùng |
| **Thứ tự** | Cùng `subject` thì giao theo thứ tự `id`; khác `subject` có thể song song |
| **Retry** | Lỗi tạm thời: thử lại theo `retry` (mặc định 8 lần, luỹ thừa, tối đa 1 giờ). Hết lượt → `dead`, hiện ở `/system/diagnostics`, báo nhóm vận hành |
| **Xử lý lại** | `bizcity events replay --consumer <id> --from <thời điểm> [--type] [--subject]`: xoá dấu `event_consumptions` trong khoảng rồi giao lại. Có bằng chứng ai chạy |
| **Giữ** | Outbox giữ 90 ngày sau khi mọi subscriber xong (khoá `bizcity.platform.event_retention_days`) |

Gửi ra ngoài (webhook tới WooCommerce, Cell) là một subscriber đặc biệt của `adapters/*`, có ký HMAC, cùng bảo đảm trên.

## 6. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-EVT-1 | 0 | Phát sự kiện chỉ qua `ctx.events.emit` trong giao dịch của action / subscriber. Không gọi HTTP ra ngoài trong handler để "báo" | CONF-STATIC-10 |
| STD-EVT-2 | 0 | Subscriber phải chịu được giao lại (runtime chống trùng theo `(consumer, event_id)`; hiệu ứng ngoài CSDL phải có khoá idempotency riêng, vd `Idempotency-Key = event.id`) | CONF-RUN-10 (giao 2 lần → 1 hiệu ứng) |
| STD-EVT-3 | 1 | Chỉ phát loại khai ở `events.emits`, chỉ nghe loại khai ở `events.subscribes`; `type` mang tiền tố `<key>.` của chính module | CONF-STATIC-2 |
| STD-EVT-4 | 1 | Đổi khuôn `data` phá vỡ → tăng `version`, phát song song bản cũ ít nhất một minor của module | CONF-UPG-2 |
| STD-EVT-5 | 1 | Subscriber không chờ subscriber khác; muốn chuỗi thì phát sự kiện mới (có `causationId`) | review |
| STD-EVT-6 | 1 | Việc định kỳ dùng sự kiện đồng hồ (`bizcity.clock.*`), không `setInterval` / cron riêng | CONF-STATIC-11 |
| STD-EVT-7 | 2 | Tên sự kiện ở thì quá khứ (`approved`, `paid`, `due`), không mệnh lệnh (`approve`) | review |

## 7. Sự kiện Core phát (v1)

| `type` | Khi nào | `subject` |
|---|---|---|
| `bizcity.ledger.event.received` | sự việc kế toán được nhận (mọi trạng thái) | `docKey` |
| `bizcity.ledger.entry.posted` | bút toán ghi xong | `docKey` |
| `bizcity.ledger.entry.reversed` | bút toán bị đảo (sửa / huỷ) | `docKey` |
| `bizcity.ledger.event.failed` | định khoản lỗi (`status = error`) | `docKey` |
| `bizcity.period.locked` / `.unlocked` | khoá / mở kỳ | `period:<yyyy-mm>` |
| `bizcity.masterdata.partner.changed` | thêm / sửa / ngừng đối tượng | `partner:<code>` |
| `bizcity.masterdata.product.changed` | thay `catalog-notify.ts` | `product:<sku>` |
| `bizcity.clock.daily` / `bizcity.clock.hourly` | 01:00 giờ đơn vị / mỗi giờ | `clock` |
| `bizcity.module.enabled` / `.disabled` | bật / tắt module cho đơn vị | `module:<id>` |

Module dùng `bizcity.ledger.entry.posted` để biết **chắc chắn** sổ đã ghi (ví dụ đổi kỳ hợp đồng sang "đã thu" chỉ khi bút toán thu tiền đã vào sổ, kể cả ở chế độ chờ duyệt của kế toán).

## 8. Chuyển dần

1. Phase 3: bảng `event_outbox`, `event_deliveries`, `event_consumptions` + dispatcher chạy trong tiến trình API (một worker, `SKIP LOCKED` nên chạy nhiều bản vẫn đúng).
2. Phase 3: Kernel phát các sự kiện `bizcity.ledger.*` từ `postingService` / `eventStore`.
3. Phase 3: thay `catalog-notify.ts` bằng subscriber webhook của `adapters/wordpress`.
4. Phase 5: tách dispatcher thành tiến trình riêng khi tải lớn (cùng bảng, không đổi hợp đồng).
