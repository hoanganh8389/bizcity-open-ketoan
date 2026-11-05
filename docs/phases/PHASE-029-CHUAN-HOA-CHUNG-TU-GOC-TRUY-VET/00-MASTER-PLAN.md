# PHASE-029 · 00 — Kế hoạch: chuẩn hoá chứng từ gốc và truy vết
<!-- [2026-11-05 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — kế hoạch tổng + chữ chốt W1 -->

## 1. Vì sao

Đánh giá [2026-11-05](../../audits/DANH-GIA-TRACE-CHUNG-TU-GOC-2026-11-05.md): dữ liệu truy vết đã ghi đủ ở Kernel nhưng không có cổng đọc nào ghép; `accounting_event_versions` không có đường đọc nên `GET /documents/:id` trộn payload hiện hành với bút toán phiên bản cũ; `document_versions` / `document_links` chưa ai ghi. Yêu cầu chủ dự án: **100 % module, plugin, API tuân thủ**.

## 2. Quyết định (D029-*)

> **Chủ duyệt 2026-11-05** (Johnny Chu – Chu Hoàng Anh: *"ok, code hoàn thiện phần chuẩn hóa chứng từ gốc này để 100% các modules, plugins, api vào phải tuân thủ"*): duyệt đánh giá và bốn đề xuất Q-TR-1..4. <!-- [2026-11-05 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — chủ duyệt Q-TR-1..4 -->

| Mã | Quyết định | Vì sao |
|---|---|---|
| D029-1 | Cổng truy vết là **mở rộng `bizcity_document@1`** (§7.2), không hợp đồng thứ tám (Q-TR-1) | Core gọn, R-KER-8 |
| D029-2 | **Dựng từ nguồn thẩm quyền, không bảng mới, không migration ở W1**: `accounting_events` + `accounting_event_versions` + `ledger_entries` + `posting_log` + `audit_logs` + `document_links` | Phủ 100 % `docKey` kể cả POS / app ngoài / phân hệ cũ — không phụ thuộc ai nhớ gọi `saveVersion` |
| D029-3 | **Giữ nguyên khuôn `GET /api/v1/documents/:id`** (Q-TR-2); lỗi trộn phiên bản được sửa bằng route mới; thêm trường `payloadVersion` vào `GET /documents/:id` ở W2a (tệp `document.service.ts` đang bị giữ chỗ) | Tương thích bên tích hợp ngoài |
| D029-4 | Thiếu "vì sao sửa" chỉ **nhắc** (`warn`), không chặn (Q-TR-3, ADR-0020) | Mặc định cho phép, nhắc khi sai |
| D029-5 | Phân hệ cũ (`phan-he/`) **không** bị bắt `saveVersion` (Q-TR-4, ADR-0024); chúng vẫn được cổng đọc phủ vì dữ liệu nằm ở sự việc | Không chuyển hàng loạt |
| D029-6 | Chẩn đoán dữ liệu mức **`warn`** lúc đầu: dữ liệu cũ của bản cài có thể có bút toán trước khi có `event_version`; nâng `error` khi bản đo trên bản cài thật = 0 | Không làm đỏ bản cài đang chạy |
| D029-7 | Tên: **"Lịch sử chứng từ"** (`documents/history`), không dùng "trace" — tránh nhầm Bàn điều tra / OpenTelemetry (G9) | Thuật ngữ |

## 3. Chữ chốt W1 (K2, chỉ đọc, không migration)

### 3.1 Route (`documents:read`; tệp mới `document-history.service.ts` + `document-history.routes.ts`, đăng ký từ `document.routes.ts`)

`GET /api/v1/documents/history` — đúng **một** trong ba khoá: `id` (sự việc) · `docKey` · `entryId` (dòng sổ: truy vết **ngược** từ bút toán). Tuỳ chọn `version` (chỉ phiên bản đó), `withPayload=1` (kèm nội dung từng phiên bản; mặc định không để nhẹ).

```
{ docKey, docType, docNo, docDate, status, source:{ system, createdBy, createdByName },
  currentVersion, postedVersion,
  versions:[{ version, isCurrent, isPosted, receivedAt, receivedBy,
              contentHash, payload?, entries:[Entry], postings:[PostingStep] }],
  unversionedEntries:[Entry],      // bút toán của sự việc nhưng event_version NULL
  links:[{ from, to, role, createdAt }],
  audit:[{ action, actor, at, correlationId, reason? }],
  integrity:{ ok, issues:[{ code, message, entryId?, version? }] } }
Entry = { id, entryNo, postingDate, status, isReversal, reversesEntryId, reversedByEntryId, total, createdAt, createdBy }
PostingStep = { action, at, actor, entryIds, reversed, message, policyVersion }
```

- Phiên bản hiện hành: nội dung từ `accounting_events.payload`; phiên bản cũ: `accounting_event_versions.payload`. `contentHash` = sha256 của JSON đã chuẩn hoá khoá (cùng cách `document_versions`). `receivedBy` = `actor` của dòng `posting_log` `receive` của phiên bản đó (chỉ ghi khi chứng từ chờ định khoản); không có thì `actor` của dòng định khoản đầu tiên của phiên bản (nộp và định khoản cùng lời gọi); bản 1 không có dòng nào → `source.createdBy`; vẫn không có → `null`, không đoán.
- `isPosted` = `version = posted_version`. Một bút toán thuộc phiên bản `event_version`; bút toán đảo nối `reverses_entry_id` và hiện ở **phiên bản của bút toán bị đảo** cùng `isReversal`.
- Khoá `entryId` không có `event_id` → 404 `NOT_FOUND` kèm thông điệp nêu rõ "bút toán không gắn sự việc" (đúng dữ liệu chẩn đoán `ENTRY_NO_EVENT` sẽ báo).
- `integrity.issues` dùng đúng ba mã mới của §3.2 cùng hai mã `posted_version` có sẵn (`EVENT_POSTED_VERSION`, `INTERNAL_EVENT_VERSION`). `unversionedEntries` gồm bút toán `event_version` NULL **và** bút toán trỏ phiên bản không còn nội dung.

### 3.2 Chẩn đoán dữ liệu (`ledger.diagnostics.ts` + lane SQL `DG-DOC-1..3` ở `ledger.diag.mjs`, lớp L3, mức `warn`, theo đơn vị) <!-- [2026-11-05 08:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — §3.2: dùng lại LEDGER_ORPHAN; ba mã mới -->

> **Bút toán không gắn sự việc đã có mã `LEDGER_ORPHAN` (mức `error`, DG-LEDGER-*)** — không thêm mã trùng. Cổng lịch sử trả 404 nêu mã đó khi truy vết ngược từ bút toán mồ côi.

| Mã | Điều kiện |
|---|---|
| `ENTRY_NO_VERSION` | `event_id` có nhưng `event_version IS NULL` |
| `ENTRY_VERSION_UNKNOWN` | `event_version` ≠ `accounting_events.version` và không có dòng `accounting_event_versions (event_id, version)` |
| `EVENT_ENTRIES_STALE` | sự việc `status = posted`: có bút toán đang hiệu lực (`posted`, không đảo, không `is_reversal`) mà `event_version ≠ posted_version` |

### 3.3 Phép kiểm tĩnh `SC-DOC-7` (CONF-STATIC, `enforce: block`)

1. `insertInto('accounting_event_versions')` chỉ trong `document.repository.ts`; `insertInto('document_versions')` / `('document_links')` chỉ trong `packages/platform/src/core/documents.ts`.
2. Mọi lời gọi `ledgerService.post(…)` có `sourceDocumentId` phải kèm `sourceVersion` (bút toán luôn mang phiên bản — DOC-01 / DOC-03).
3. Có ca tự kiểm: gốc mẫu `fixtures/document-bad` (không đụng `repo-bad` dùng chung) + một mục ở `expect.json` (chỉ thêm mục của check này).

### 3.4 Không làm ở W1
`ctx.ledger.submit` tự ghi vết; `payloadVersion` ở `GET /documents/:id`; migration cột người sửa / lý do; liên kết `ledger` tự động — xem §4.

## 4. Các wave

| Wave | Việc | Đụng | Điều kiện bắt đầu |
|---|---|---|---|
| **W1** | §3: cổng lịch sử, 4 mã chẩn đoán, `SC-DOC-7`, test | K2; tệp mới + `document.routes.ts`, `ledger.diagnostics.ts`, checks mới | giữ chỗ vào `main` |
| **W2a** | `ctx.ledger.submit` tự `saveVersion` + liên kết `ledger` (module / SDK **100 %**) ở cửa nộp; `payloadVersion` ở `GET /documents/:id` | K2: `packages/platform/src/core/actions.ts`, `packages/kernel/src/index.ts`, `document.service.ts` | các dòng giữ chỗ PHASE-014 đợt 8b, PHASE-026 đợt 3, xương cá đã nhả |
| **W2b** | Migration: `accounting_event_versions.created_by`, `.reason`; cảnh báo `IN-DOC-REASON` | K3 (chủ ký) | W1 xong |
| **W3** | `module check`: module có `ledger.submits` phải qua W2a; `DG-DOC-*` lane SQL; nâng chẩn đoán `error` khi bản đo = 0 | K1 | W2 xong |

## 5. Ai tuân thủ bằng cách nào

| Đường nộp | Bắt buộc bằng | Phủ bởi cổng lịch sử |
|---|---|---|
| Module trong tiến trình (`ctx.ledger.submit`) | W2a tự ghi vết; trước đó: đi `submitDocumentIn` nên sự việc + phiên bản + `event_version` có sẵn | 100 % |
| App ngoài tiến trình (khoá app, `POST /documents`) | cửa nạp một chỗ; docKey `<app>:…` | 100 % |
| API tích hợp (khoá API), POS, MCP, trợ lý | cùng `postDocumentIn` / `eventStore` | 100 % |
| Phân hệ cũ (`phan-he/`) | cùng cửa; đóng băng, không bắt `saveVersion` | 100 % (qua sự việc) |
| Đường ghi sổ mới lạ (kể cả plugin cố đi vòng) | `SC-DOC-7` + `SC-KERNEL-1..3` chặn; CSDL trigger chặn sửa / xoá | — |
