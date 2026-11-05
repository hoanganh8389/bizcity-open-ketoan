# PHASE-029 · 40 — Master checklist
<!-- [2026-11-05 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — master checklist S029-1..8, log -->

> Ký hiệu: ☐ chưa làm · 🟡 có mã/tài liệu, chưa đủ tín hiệu · ✅ đủ tín hiệu · ⛔ chờ.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| S029-1 | Đánh giá hiện trạng + chữ chốt thiết kế ([00](00-MASTER-PLAN.md), [audit](../../audits/DANH-GIA-TRACE-CHUNG-TU-GOC-2026-11-05.md)), hợp đồng `bizcity_document@1` §7.2 | W0 | P0 | ✅ 2026-11-05 |
| S029-2 | Cổng `GET /api/v1/documents/history` (id · docKey · entryId), `integrity` | W1 | P0 | ☐ giữ chỗ ở CLAIMS.md |
| S029-3 | Ba mã chẩn đoán mới `ENTRY_NO_VERSION`, `ENTRY_VERSION_UNKNOWN`, `EVENT_ENTRIES_STALE` (dùng lại `LEDGER_ORPHAN` có sẵn) + lane `DG-DOC-1..3` | W1 | P0 | ☐ |
| S029-4 | Phép kiểm tĩnh `SC-DOC-7` + ca tự kiểm | W1 | P0 | ☐ |
| S029-5 | `ctx.ledger.submit` tự `saveVersion` + liên kết `ledger`; `payloadVersion` ở `GET /documents/:id` | W2a | P0 | ⛔ chờ nhả `actions.ts`, `kernel/src/index.ts`, `document.service.ts` |
| S029-6 | Migration người sửa / lý do cho phiên bản sự việc; `IN-DOC-REASON` (warn) | W2b | P1 | ⛔ chủ ký K3 |
| S029-7 | `module check` bắt module nộp sổ không qua W2a; `DG-DOC-*` lane SQL | W3 | P1 | ☐ |
| S029-8 | Nâng chẩn đoán lên `error` khi bản đo trên bản cài thật = 0 | W3 | P2 | ⛔ cần số đo |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-05 | Claude Code | Mở phase từ đánh giá truy vết; chủ duyệt Q-TR-1..4; chữ chốt W1; giữ chỗ W1. W2a chờ nhả tệp dùng chung. |
