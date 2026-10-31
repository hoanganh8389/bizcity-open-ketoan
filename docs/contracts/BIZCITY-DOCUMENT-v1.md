# `bizcity_document@1` — Document Contract
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-31 03:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — bizcity_document 1.1.0-draft: §5.1 hiện trạng runtime documents.workflow (khoá YAML, levels, sod, owner, ledger), hai luồng đã chuyển. -->
<!-- [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — bizcity_document 1.2.0-draft: §7.1 hiện trạng ctx.documents (số, phiên bản, liên kết, đính kèm), §8 đánh số một chỗ. -->

> **Phiên bản:** 1.2.0-draft · 2026-11-01 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 3/7)
> **Luật nền:** [R-WF](../rules/RULE-WORKFLOW.md), [R-EVENT](../rules/RULE-EVENT.md) · **Năng lực:** `documents.numbering`, `documents.versions`, `documents.links`, `documents.attachments`, `documents.signatures`, `documents.workflow`, `ledger.submit`

## 1. Mục đích

Chuẩn chung cho **mọi chứng từ nghiệp vụ** (hợp đồng, đơn mua, đề nghị thanh toán, phiếu chăm sóc khách…): đầu phiếu, dòng, trạng thái, phiên bản, tham chiếu, đính kèm, ký. Chứng từ kế toán (`accounting_events`) là **một trường hợp đặc biệt** của chuẩn này, do Kernel giữ.

## 2. Hai loại "chứng từ", một chuẩn

| | Chứng từ nghiệp vụ (module) | Sự việc kế toán (Kernel) |
|---|---|---|
| Ở đâu | bảng `mod_<key>.*` của module | `accounting_events` + `accounting_event_versions` |
| Ai ghi | module, qua action | chỉ Kernel, qua `ctx.ledger.submit` |
| Sửa được không | được, mỗi lần sửa tăng `version` | không sửa; phiên bản mới → Kernel đảo bút toán cũ, ghi bút toán mới |
| Nối nhau | `docKey` của sự việc = `docRef` của chứng từ nghiệp vụ | |

Chứng từ nghiệp vụ **không** sinh bút toán. Chỉ khi chuyển sang trạng thái khai ở `ledger[].on` thì module nộp một sự việc kế toán. Đó là điểm chạm duy nhất với sổ cái.

## 3. Danh tính và tham chiếu

- **`docRef`** = `<key>.<loại>:<id>`, vd `hop-dong.contract:42`. Ổn định, dùng làm `docKey` khi nộp sổ (thêm hậu tố nếu một chứng từ sinh nhiều sự việc: `hop-dong.installment:118:payment`).
- **Số chứng từ** (`docNo`) cấp bằng `ctx.documents.nextNumber(series)` (dãy `document_sequences` hiện có, theo đơn vị + năm). Module không tự đếm, không ghi `document_sequences` (đang vi phạm ở `mua-hang/store.ts:266`, `quy/payment-requests/payment-request.routes.ts:49`).
- **Liên kết** giữa chứng từ: `ctx.documents.link(from, to, role)` với `role` ∈ `source` (lập từ), `reverses`, `replaces`, `settles` (thanh toán cho), `attachesTo`, `ledger` (sự việc kế toán sinh ra). Bảng chung `document_links` (Platform).

## 4. Cột chuẩn của bảng đầu phiếu

| Cột | Kiểu | Nghĩa |
|---|---|---|
| `id`, `tenant_id`, `created_*`, `updated_*` | theo [Data](BIZCITY-DATA-v1.md) | |
| `doc_no` | `text` | số do `nextNumber` cấp; `UNIQUE (tenant_id, doc_no)` |
| `doc_date` | `date` | ngày chứng từ (luật khoá theo ngày áp vào đây) |
| `branch_code` | `text` | chi nhánh (mã danh mục chuẩn), nếu nghiệp vụ có chi nhánh |
| `status` | `text` + `CHECK` | trạng thái (§5) |
| `version` | `integer` | tăng mỗi lần nội dung đổi |
| `posted_version` | `integer NULL` | phiên bản đã nộp sổ gần nhất (nếu chứng từ chạm sổ) |

Dòng chứng từ: bảng riêng, có `line_key text` ổn định trong phiếu (không dùng số thứ tự làm khoá), `UNIQUE (tenant_id, <doc>_id, line_key)`.

## 5. Trạng thái

Mỗi loại chứng từ có máy trạng thái khai báo. Trạng thái riêng của module được, nhưng **mỗi trạng thái phải thuộc một nhóm chuẩn** để Core, báo cáo chung và AI hiểu thống nhất:

| Nhóm chuẩn | Ý nghĩa | Sửa nội dung | Chạm sổ |
|---|---|---|---|
| `draft` | đang soạn, bị trả lại | được | không |
| `pending` | chờ duyệt (một hoặc nhiều cấp) | không (rút về `draft` để sửa) | không |
| `approved` | đã duyệt, có hiệu lực | chỉ qua "điều chỉnh" → `version` mới | **có thể** (theo `ledger[].on`) |
| `done` | đã hoàn tất (đã chi, đã thanh lý…) | không | có thể |
| `cancelled` | đã huỷ | không | huỷ sự việc đã nộp → bút toán đảo |

```yaml
# modules/hop-dong/api/documents/contract.workflow.yaml
type: hop-dong.contract
states:
  draft:     { group: draft }
  submitted: { group: pending }
  approved:  { group: approved }
  active:    { group: approved }
  closed:    { group: done }
  cancelled: { group: cancelled }
transitions:
  submit:  { from: [draft], to: submitted, permission: "hop-dong:write" }
  approve: { from: [submitted], to: approved, permission: "hop-dong:approve", sod: true }
  reject:  { from: [submitted], to: draft, permission: "hop-dong:approve", requires: [reason] }
  activate: { from: [approved], to: active, permission: "hop-dong:write" }
  close:   { from: [active], to: closed, permission: "hop-dong:approve" }
  cancel:  { from: [draft, submitted, approved], to: cancelled, permission: "hop-dong:approve", requires: [reason] }
```

`sod: true` (tách nhiệm): người duyệt khác người lập. Transition `by: event, on: "<loại sự kiện>"` không gọi được từ ngoài; runtime chạy nó khi subscriber nhận sự kiện khớp `subject` (actor `system`, vẫn có bằng chứng). Ví dụ: kỳ thanh toán sang "đã thu" khi nhận `bizcity.ledger.entry.posted`. Duyệt nhiều cấp theo ngưỡng tiền như `payment_requests` (`approved1` → `approved`) khai bằng `levels` (năng lực `documents.workflow`).

### 5.1 Hiện trạng runtime (1.1.0-draft, 2026-10-31)

Runtime `apps/api/src/core/workflow.ts` (Platform, sẽ về `packages/documents`) đọc tệp `<loại>.workflow.yaml` đặt cạnh mã: `loadWorkflow(new URL('./x.workflow.yaml', import.meta.url))`. Khi dựng, tệp được chép sang `dist`. Tệp sai khuôn / sai nghĩa thì tiến trình không khởi động (lỗi lập trình, không phải lỗi người dùng).

| Khoá | Bắt buộc | Nghĩa |
|---|---|---|
| `type`, `states.<tên>.group` | có | như §5 |
| `label`, `states.<tên>.label`, `transitions.<chuyển>.title` | không (mặc định = tên) | chữ cho thông báo, nút, `statusLabel` |
| `from`, `to`, `permission` | có (trừ khi khai `levels`) | `permission` là một quyền, hoặc `{ <trạng thái nguồn>: <quyền> }` |
| `levels: [{ from, to, permission, denied? }]` | | duyệt nhiều cấp: cấp sau `from` = `to` của cấp trước; cấp giữa thuộc nhóm `pending`, cấp cuối sang nhóm `approved`. Chứng từ mang `levelsRequired` (phân hệ tính từ ngưỡng cấu hình, R-WF-6); đủ cấp thì nhảy thẳng sang đích cấp cuối |
| `sod: true` | | người chuyển khác người lập |
| `owner: <quyền>` | | chỉ người lập được chuyển, trừ khi có quyền này (vd `documents:edit-all`) |
| `requires: [reason]` | | bắt buộc lý do |
| `ledger: true` | | chuyển chạm sổ; chỉ hợp lệ khi đích thuộc `approved` / `done` / `cancelled` hoặc nguồn đều thuộc `approved` / `done` (R-WF-3) |
| `blocked: { <trạng thái> \| '*': <thông báo> }`, `denied` | | thông báo riêng khi trạng thái không cho chuyển / thiếu quyền |

`wf.plan(chuyển, { status, createdBy, levelsRequired }, người, { reason })` trả trạng thái đích (CONFLICT / FORBIDDEN / VALIDATION_ERROR nếu không được); `wf.allowed(...)` liệt kê chuyển làm được; `wf.statesIn(nhóm)`, `wf.editable(trạng thái)`. Ghi trạng thái, cột riêng và nộp sổ là việc của action phân hệ (STD-DOC-3).

Đang chạy theo YAML: `phan-he/quy/payment-requests/payment-request.workflow.yaml`, `phan-he/mua-hang/purchase-document.workflow.yaml`. **Chưa có:** chuyển `by: event` (runtime từ chối khoá này); quyền riêng của module (`hop-dong:approve`…) — `permission` hiện chỉ nhận quyền trong `PERMISSIONS` của Core, chờ registry quyền mở (PHASES 3.3); manifest `documents[].workflow` chưa được runtime tự nạp (module tự gọi `loadWorkflow`). Phiếu mua hàng `pending_approval` vẫn sửa được như trước (lệch §5 nhóm `pending`, giữ để không đổi hành vi).

## 6. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-DOC-1 | 0 | Chứng từ nghiệp vụ chỉ chạm sổ qua `ctx.ledger.submit` / `cancel`, với `docKey` suy ra từ `docRef`, ở đúng chuyển trạng thái khai trong manifest `documents[].ledger` | CONF-STATIC-2, CONF-RUN-5 |
| STD-DOC-2 | 0 | Mỗi lần nội dung đổi: `version` tăng và ảnh chụp lưu ở `document_versions` (ai, khi nào, băm nội dung). Không ghi đè lịch sử | CONF-RUN-7 |
| STD-DOC-3 | 0 | Chuyển trạng thái chỉ qua transition đã khai; mỗi transition là một action (có quyền, bằng chứng) | CONF-RUN-1, CONF-RUN-4 |
| STD-DOC-4 | 1 | Mọi trạng thái thuộc một trong 5 nhóm chuẩn | CONF-MAN-4 |
| STD-DOC-5 | 1 | Sửa chứng từ đã `approved` có chạm sổ: phiên bản mới nộp lại cùng `docKey`, `version` mới; Kernel tự đảo bút toán cũ. Module không tự huỷ rồi tạo mới | CONF-RUN-5 |
| STD-DOC-6 | 1 | Số chứng từ chỉ cấp bằng `nextNumber`; luật khoá theo ngày (`dataLock`) và khoá kỳ áp cho `doc_date` khi ghi | CONF-RUN-8 |
| STD-DOC-7 | 1 | Đính kèm dùng năng lực chung `documents.attachments` (tệp lưu theo đơn vị, có loại, kích thước tối đa, băm); không tạo bảng đính kèm riêng | CONF-STATIC-7 |
| STD-DOC-8 | 2 | Ký theo vai dùng `documents.signatures`; chữ ký gắn với `version` lúc ký, sửa nội dung thì chữ ký cũ hết hiệu lực | review |

## 7. API SDK

```ts
ctx.documents.nextNumber('HD')                                  // 'HD-2026-0001'
ctx.documents.saveVersion(docRef, snapshot)                     // tự gọi bởi action runtime khi khai `versioned: true`
ctx.documents.transition(docRef, 'approve', { reason })         // kiểm luồng, quyền, tách nhiệm; phát sự kiện <type>.approved
ctx.documents.link(fromRef, toRef, 'settles')
ctx.documents.attach(docRef, file, { kind: 'contract-scan' })
ctx.ledger.submit({ docKey: `${docRef}:payment`, version, docType: 'customer_payment', … })  // bizcity_ledger_intake@1
```

### 7.1 Hiện trạng (1.2.0-draft, 2026-11-01)

Runtime `apps/api/src/core/documents.ts` (Platform, sẽ về `packages/documents`); bảng `document_versions`, `document_links`, `document_attachments` (migration `0045`, RLS). Kiểu dùng chung ở `@ketoan/contracts` (`docRefSchema`, `DOC_LINK_ROLES`, `AttachmentRef`…).

| Hàm (`ctx.documents.`) | Có | Ghi chú |
|---|---|---|
| `nextNumber(series, { date?, width? })` | ✅ | `<DÃY>-<năm>-<số>`, dãy chữ hoa (vd `HD`); bộ đếm `(đơn vị, <module>:<dãy>, năm)` trên `document_sequences` của Kernel; giao dịch huỷ thì số không bị dùng |
| `saveVersion(docRef, snapshot)` → số phiên bản | ✅ | chỉ thêm; băm JSON đã chuẩn hoá; trùng nội dung bản mới nhất thì trả lại số cũ. Runtime **chưa** tự gọi khi khai `versioned: true` |
| `versions(docRef)` | ✅ | cũ → mới, không kèm nội dung; HTTP `GET /api/v1/document-versions[/:version]?docRef=` |
| `link(from, to, role)`, `links(docRef)` | ✅ | gắn lặp giữ một dòng; sự việc kế toán: `ledger.event:<docKey>` |
| `attach(docRef, file, { kind?, note? })`, `attachments(docRef)` | ✅ | tệp trên `DATA_DIR/attachments/<đơn vị>/`, sha256 kiểm khi tải, tối đa 15 MB; cùng tệp gửi lại → tệp cũ; gỡ = `archived_at`. HTTP `/api/v1/document-attachments` |
| `transition(docRef, action)` | ⏳ | luồng duyệt hiện chạy qua `documents.workflow` (§5.1) trong action của phân hệ |

Ghi (`saveVersion`, `link` phía `from`, `attach`) chỉ trên docRef của chính module của action (`<module>.…`) — như `ctx.events.emit`; đọc được mọi docRef của đơn vị.

## 8. Ánh xạ từ code hiện tại

| Hiện có | Thành |
|---|---|
| `accounting_events` (`doc_key`, `version`, `posted_version`, `status`) | giữ nguyên, là sự việc kế toán của Kernel; mẫu cho §4 |
| `accounting_event_versions` | mẫu cho `document_versions` chung (có từ 0045) |
| `document_sequences` (phiếu tay, `quy`, `mua-hang` tự ghi) | **đã** một chỗ cấp số 2026-11-01: `documentNumbers.next` của Kernel; khoá dãy cũ giữ nguyên |
| `payment_requests.status` 7 trạng thái | **đã** khai bằng workflow YAML (2026-10-31): `draft, submitted(pending), approved1(pending), approved(approved), rejected(draft), paid(done), cancelled` |
| `purchase_documents.status` 4 trạng thái | **đã** khai bằng workflow YAML (2026-10-31): `draft, pending_approval(pending), approved(approved), cancelled`; chuyển `submit, approve, override, unapprove, cancel` |
| `document_signatures` (gắn `event_id`) | thêm cột `doc_ref`; ký được mọi chứng từ |
| `reference_documents` (`open/used/closed`) | một loại chứng từ của module Thuế dùng `document_links` |
| `purchase_attachments` | chuyển sang `document_attachments` chung (A-19) — **chưa**: cần chép tệp `DATA_DIR/dinh-kem` trên bản cài thật |

## 9. Nhật ký

- **1.2.0-draft (2026-11-01):** thêm §7.1 hiện trạng `ctx.documents` — `nextNumber`, `saveVersion`, `versions`, `link`, `links`, `attach`, `attachments` có; `transition` vẫn qua `documents.workflow`. §8: đánh số một chỗ, `document_versions` có. Chỉ thêm, tương thích.
- **1.1.0-draft (2026-10-31):** thêm §5.1 hiện trạng runtime `documents.workflow` — khoá YAML tuỳ chọn, tương thích: `label`, `title`, `levels`, `owner`, `blocked`, `denied`, `ledger`; ghi rõ phần chưa có (`by: event`, quyền riêng của module). Ánh xạ §8: `payment_requests`, `purchase_documents` đã chạy theo YAML (PHASE-012 S012-1).
- **1.0.0-draft (2026-10-29):** bản đầu của Standard v1.
