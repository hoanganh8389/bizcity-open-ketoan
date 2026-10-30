# RULE · Cửa nhận sự việc (R-EVENT)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->

> **Cấp:** Tier 0 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Hợp đồng:** [bizcity_ledger_intake@1](../contracts/BIZCITY-LEDGER-INTAKE-v1.md) · **Mã:** `modules/documents/document.service.ts` (`postDocumentIn`)

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-EVENT-1** | **Không sự việc, không bút toán.** Mọi thứ có ảnh hưởng tài chính — phiếu từ plugin, phiếu phân hệ duyệt, phiếu kế toán tay, kết chuyển, khấu hao, giá vốn, số dư đầu kỳ — đều có một dòng `accounting_events` | R-LEDGER-12 |
| **R-EVENT-2** | **Một cửa.** Sự việc vào qua `postDocumentIn()` (khuôn có cấu trúc) hoặc `eventStore` (sự việc lõi tự sinh — Giai đoạn 1). Không module nào khác `insertInto('accounting_events')` / `'accounting_event_versions'` / `'posting_log'` | Grep CI |
| **R-EVENT-3** | **Khoá tự nhiên** `(tenant_id, doc_key)` duy nhất, **không bao giờ đổi** với một chứng từ ở nguồn. `doc_key` không phải khoá chính; join nội bộ qua `id` | UNIQUE `accounting_events_tenant_id_doc_key_key` |
| **R-EVENT-4** | **Phiên bản chỉ tăng.** Cùng `version` đã ghi → `unchanged`; nhỏ hơn bản đang có → `409 CONFLICT`; lớn hơn → bản cũ vào `accounting_event_versions` (UNIQUE `(event_id, version)`) rồi chờ / định khoản lại | `ledger-flow.test.ts` |
| **R-EVENT-5** | **Nguồn gửi sự việc, không gửi định khoản.** Số tiền là số đã chốt ở nguồn (như hoá đơn đã phát hành); lõi chỉ kiểm tổng tới xu, không tính lại thuế, giá | `assertTotals()` |
| **R-EVENT-6** | **Payload lưu nguyên.** Không sửa `payload` của một phiên bản đã nhận. Thông tin kế toán bổ sung (kỳ kê khai, khấu trừ…) lưu riêng (`tax_info_patches`) và áp khi định khoản | `tax-info.test.ts` |
| **R-EVENT-7** | **Kiểm khuôn ở cửa** bằng zod từ `packages/contracts`. Sai khuôn → `VALIDATION_ERROR` với danh sách trường; không lưu | `api-examples.test.ts` |
| **R-EVENT-8** | **Huỷ không xoá.** Nguồn báo huỷ → chế độ tự động: đảo toàn bộ + `status = cancelled`; chế độ chờ: đánh dấu `cancel_requested_at` (Chờ huỷ), kế toán duyệt ở ACC14. Dòng sự việc vẫn còn | `auto-push.test.ts` |
| **R-EVENT-9** | **Một giao dịch** bao: khoá dòng → lưu phiên bản → đảo → ghi sổ → bảng dẫn xuất → `posting_log`. Lỗi định khoản → giao dịch huỷ, sau đó lưu `status = error` + `error_message` trong giao dịch riêng | `ledger-flow.test.ts` (lỗi cấu hình rồi ghi lại) |
| **R-EVENT-10** | Mọi thao tác trên sự việc ghi `posting_log` (`receive`, `post`, `repost`, `error`, `cancel`, `cancel_request`, `unpost`) với `actor` | `posting-modes.test.ts` |
| **R-EVENT-11** | **Xem trước = ghi thật rồi huỷ.** `GET /documents/:id/preview` chạy đúng đường định khoản trong giao dịch và rollback; không có bộ định khoản thứ hai cho xem trước | Mã `preview()` |
| **R-EVENT-12** | Lô tối đa **200** sự việc; mỗi sự việc xử lý độc lập — một cái lỗi không chặn cái khác | `ingestBatch()` |

## Trạng thái sự việc

```
             nhận (hold / approve)                  định khoản
  (mới) ──────────────────────────► pending ───────────────────────► posted
     │                                 ▲   │ lỗi cấu hình / kỳ khoá        │
     │ nhận (auto)                     │   ▼                               │ version mới
     └──────────────► posted        error ─── sửa cấu hình, định khoản lại ┘ (→ pending hoặc auto repost)
                                                                           │
                       nguồn báo huỷ: auto → cancelled · chờ → pending + cancel_requested_at → (duyệt) cancelled
```

`status ∈ { pending, posted, error, cancelled }` (`SOURCE_DOC_STATUS`). `posted_version` cho biết phiên bản nào đang trong sổ.

## Chế độ định khoản (theo loại chứng từ)

Đọc từ ma trận cấu hình `bizcity.posting.modes` (vật lý: `tenants.settings.postingModes`):

| Nguồn | Mặc định |
|---|---|
| Kéo qua kết nối (ACC14 → nguồn) | luôn `hold` (chờ) |
| Đẩy bằng khoá API | theo chế độ của loại chứng từ; mặc định **vào cổng chờ** |
| Phân hệ trong tiến trình | phân hệ truyền `opts.post` theo luồng duyệt của nó (R-WF-3) |
| Lõi tự sinh (phiếu tay, kết chuyển…) | ghi ngay |
