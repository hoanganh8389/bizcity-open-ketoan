# PHASE-030 · 25 — Mọi bút toán có chứng từ gốc: `ledger_entries.event_id` bắt buộc ở mức CSDL
<!-- [2026-11-06 02:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-41: chủ dự án "kiểm tra lại để sự kiện id không được null; toàn bộ bút toán phải đảm bảo nguyên tắc có chứng từ để trace được" — chữ chốt migration + luật + test (R-FLOW-2: migration mới cần chữ chốt trước) -->

> **Trạng thái:** 🟡 chữ chốt D030-15; code ở S030-41 (sau khi PR giữ chỗ này merge). **Mức Kernel:** K2 (đổi lược đồ sổ cái); chủ dự án chỉ đạo trực tiếp.
> **Nguồn yêu cầu:** chủ dự án 2026-11-06 — *"kiểm tra lại để sự kiện id ko được null nhé. Toàn bộ bút toán phải đảm bảo nguyên tắc có chứng từ để trace được."*
> **Luật:** [R-LEDGER-12](../../rules/RULE-LEDGER.md) ("mọi bút toán có `event_id` trỏ về một `accounting_events`, không có bút toán mồ côi") · CANON "bốn câu không thương lượng" (không sự việc, không bút toán).

## 1. Hiện trạng (đã kiểm 2026-11-06)

| Chiều | Kết quả |
|---|---|
| Dữ liệu | `ledger_entries.event_id IS NULL`: **0 / 89.547** (`ketoan_test`) và **0 / 123** (`ketoan_test_p030q`); không bút toán nào trỏ tới sự việc không tồn tại |
| Đường ghi | Mọi đường ghi sổ (bán / mua, phiếu tay, kết chuyển, khấu hao, giá vốn, đảo) đi qua `eventStore.post()` hoặc `posting.service`, đều truyền `sourceDocumentId`; đảo bút toán lấy `original.event_id` |
| Khoá ngoại | `ledger_entries_source_document_id_fkey` có (0006) → không trỏ vào sự việc không có thật |
| Chẩn đoán | `LEDGER_ORPHAN` (L3, **dừng dây chuyền**) bắt `event_id IS NULL` hoặc không có sự việc |
| **Lược đồ** | **Cột `event_id` cho phép NULL** (migration 0006: `event_id bigint,`) |
| **Mã** | `DraftEntry.sourceDocumentId?: string \| null` và `ledger.service.ts` ghi `event_id: entry.sourceDocumentId ?? null` |

Kết luận: hôm nay *không có* bút toán mồ côi, nhưng điều đó đứng bằng **kỷ luật của mã**, chưa bằng **bất biến của CSDL**. Một đường ghi mới, một script, hay một dòng SQL tay vẫn có thể ghi bút toán không chứng từ; chỉ `LEDGER_ORPHAN` bắt được **sau khi** đã ghi. Với sổ cái, điều đó không đủ (ADR-0029: Lõi bất biến).

## 2. Quyết định

| Mã | Quyết định |
|---|---|
| **D030-15** | `ledger_entries.event_id` là **`NOT NULL`** ở CSDL, cộng ba lớp phòng thủ: (a) kiểu `DraftEntry.sourceDocumentId: string` (bắt buộc, không còn `?` / `null`; kiểu Kysely `LedgerEntriesTable.event_id` đổi từ `string | null` sang `string` **sau**, vì `packages/platform/src/db/types.ts` đang thuộc dòng giữ chỗ PHASE-026 P0 đợt 3 — R-FLOW-3, việc S030-41b); (b) `ledgerService.post()` từ chối ngay đầu hàm khi thiếu (`POSTING_FAILED`, câu chữ nêu R-LEDGER-12) — trước cả kiểm tài khoản, kỳ khoá; (c) migration đổi cột. Khoá ngoại và `LEDGER_ORPHAN` giữ nguyên (NOT NULL không thay được "sự việc có thật") |
| D030-15a | Migration **an toàn cho bản cài có dữ liệu**: thêm ràng buộc `CHECK (event_id IS NOT NULL) NOT VALID` rồi `VALIDATE CONSTRAINT` (quét cả bảng, không bị RLS che), bắt lỗi và dừng với câu tiếng Việt nêu **số dòng và số bút toán đầu** thay vì lỗi PostgreSQL trần; xong `SET NOT NULL` rồi bỏ ràng buộc thừa. Không tự sửa sổ |
| D030-15b | Bản cài có dòng `event_id` rỗng **không tự sửa**: sổ chỉ thêm (R-LEDGER-1) và trigger 0049 chỉ cho ba lối cập nhật. Migration dừng, nhóm Lõi quyết phương án (thường: lập sự việc bổ sung loại điều chỉnh, ghi bằng chứng, rồi nối qua đường E3 có biên bản). Chưa gặp bản cài nào có dòng như vậy |

## 3. Chuỗi truy vết sau thay đổi

```
ledger_lines ─▶ ledger_entries.event_id  ── NOT NULL, khoá ngoại ──▶ accounting_events (doc_key, source_system, doc_type, doc_no, version)
                                                                          │ created_by (ai nhập — xem F-2)
                                                                          └─▶ audit_logs (bằng chứng, chuỗi băm, niêm phong ngày)
```

Bút toán đảo giữ cùng `event_id` với bút toán gốc (`reverses_entry_id` nối hai bút toán). Bút toán do phiếu tay / kết chuyển / khấu hao / giá vốn sinh ra cũng có sự việc riêng (`source_system = 'manual'`), nên không có ngoại lệ "bút toán hệ thống không cần chứng từ".

## 4. Phát hiện kèm theo (không nằm trong migration này)

| Mã | Phát hiện | Đề xuất |
|---|---|---|
| **F-1** | `document_signatures.event_id` và `asset_depreciations.event_id` cho phép NULL **có chủ đích** (chữ ký gắn `doc_ref` cho chứng từ của module — 0048; dòng khấu hao tính trước khi ghi sổ) | Giữ; ghi ở đây để khỏi bị nhầm là lỗ hổng |
| **F-2** | `accounting_events.created_by` cho phép NULL: ở `ketoan_test` có **1.484 / 21.425** sự việc `manual` rỗng — toàn bộ là **khấu hao (792)** và **giá vốn (692)** do tác vụ hệ thống sinh ra (29/10–03/11). Truy được *chứng từ nào*, chưa truy được *tác vụ / người nào khởi tạo* ở cấp sự việc | D030-16 (chờ chủ dự án): ghi `created_by` bằng danh tính tác vụ (`system:depreciation`, `system:cogs`, …) và đặt `NOT NULL` sau khi điền các dòng cũ theo `doc_type`; chạm `event-store.ts` và cần xử lý dòng lịch sử (sổ chỉ thêm, bảng sự việc cho phép cập nhật `created_by`? — kiểm trước) |

## 5. Golden tests (S030-41)

| Mã | Kiểm |
|---|---|
| T030-EVT-1 | `information_schema`: `ledger_entries.event_id` là `is_nullable = 'NO'` |
| T030-EVT-2 | `INSERT` thẳng vào `ledger_entries` với `event_id` NULL bị CSDL từ chối (superuser cũng không lách được) |
| T030-EVT-3 | `ledgerService.post()` thiếu `sourceDocumentId` → `POSTING_FAILED` nêu R-LEDGER-12, **không** chạm CSDL (kiểm trước tài khoản và kỳ khoá) |
| T030-EVT-4 | Sau bán hàng, phiếu tay, kết chuyển, khấu hao, giá vốn, đảo: mọi bút toán của đơn vị có sự việc, không dòng nào mồ côi |
| T030-EVT-5 | Migration trên CSDL có sẵn dòng rỗng dừng với câu tiếng Việt nêu số dòng (chạy trong CSDL tạm, không đụng CSDL dùng chung) |

## 6. Việc

| Mã | Việc | Chủ |
|---|---|---|
| S030-41 | Migration `0077` + `ledger.types.ts` + `ledger.service.ts` + RULE-LEDGER cột "Kiểm bằng" + T030-EVT-1..5 | PHASE-030, Kernel K2 |
| S030-41b | Kiểu Kysely `LedgerEntriesTable.event_id`: `string` (một dòng ở `packages/platform/src/db/types.ts`) | sau khi dòng PHASE-026 P0 đợt 3 nhả tệp; không chặn S030-41 (`post()` đã bắt buộc ở kiểu `DraftEntry`) |
| D030-16 | `accounting_events.created_by` bắt buộc, danh tính tác vụ cho sự việc hệ thống (F-2) | **chốt 2026-11-07** — gói K3 [PHASE-029 · 35](../PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/35-GOI-K3.md) đợt 1, migration 0081 |
